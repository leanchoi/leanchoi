#!/usr/bin/env node
/**
 * SURIA — Dashboard API (puerto 3103)
 * ============================================================================
 * Backend del Centro de Operaciones + Cerebro RAG.
 *
 * Endpoints:
 *   GET  /api/health                → ping / versión
 *   GET  /api/memories              → filas de memory_vectors sin el BLOB
 *   GET  /api/memories/embeddings   → ?links=1&threshold=0.3 ⇒ enlaces coseno
 *                                     precalculados; sin ?links ⇒ vectores crudos
 *   POST /api/memories/update       → { memory_id, content, topics } ⇒ actualiza
 *                                     la fila y regenera el embedding Gemini
 *   POST /api/memories/delete       → { memory_id } ⇒ borra la fila
 *   GET  /api/system/stats          → RAM / disco / CPU + estado de servicios
 *                                     locales + contadores Gemini
 *
 * Sin dependencias npm obligatorias: usa better-sqlite3 si está instalado,
 * si no el módulo nativo node:sqlite (Node ≥ 22.5), si no el paquete sqlite3.
 *
 * Variables de entorno (todas opcionales):
 *   PORT                (default 3103)
 *   HOST                (default 127.0.0.1 — Traefik hace el proxy)
 *   SURIA_DB            (default /opt/suria/suria.db)
 *   SURIA_ENV_FILE      (default /opt/suria/.env — fallback para claves)
 *   GEMINI_API_KEY      (o GOOGLE_API_KEY) para regenerar embeddings
 *   GEMINI_EMBED_MODEL  (default gemini-embedding-001)
 *   GEMINI_API_BASE     (default https://generativelanguage.googleapis.com)
 *   DASHBOARD_API_TOKEN si se define, exige Authorization: Bearer <token>
 *   MINUTER_TOKEN       token del portal minutero (para armar el link)
 *   SURIA_WHATSAPP_LINK link de la tarjeta del co-piloto WhatsApp
 *
 * Integración con un dashboard_api.js ya existente:
 *   const portal = require('./dashboard_api.js');
 *   ...dentro de tu handler http:  if (await portal.handlePortalRequest(req, res)) return;
 */
'use strict';

const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { execFile } = require('child_process');

// ── Configuración ───────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT || 3103);
const HOST = process.env.HOST || '127.0.0.1';
const DB_PATH = process.env.SURIA_DB || '/opt/suria/suria.db';
const ENV_FILE = process.env.SURIA_ENV_FILE || '/opt/suria/.env';
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const EMBED_DIMS = 768;
const EMBED_MAX_CHARS = 8000; // gemini-embedding-001 admite ~2048 tokens
const API_TOKEN = process.env.DASHBOARD_API_TOKEN || '';

// Servicios locales a chequear para los pills de estado del portal.
const SERVICES = [
  { id: 'dashboard', name: 'Dashboard Next.js', port: 3000 },
  { id: 'dashboard-api', name: 'Dashboard API', port: PORT },
  { id: 'minuter', name: 'Minutero de Reuniones', port: 3102 },
  { id: 'inbound', name: 'Webhook WhatsApp', port: 3101 },
  { id: 'whatsapp', name: 'Cliente WhatsApp (Baileys)', port: 3100 },
  { id: 'n8n', name: 'n8n', port: 5678 },
  { id: 'nocodb-trochi', name: 'NocoDB Trochi', port: 8080 },
  { id: 'nocodb-observatorio', name: 'NocoDB Observatorio', port: 8082 },
  { id: 'metrica', name: 'Métrica Inmobiliaria', port: 3013 },
  { id: 'andar', name: 'Andar Alquileres', port: 3015 },
  { id: 'bofi', name: 'Bofi PDF', port: 18777 },
  { id: 'rojas-web', name: 'Rojas Construcciones', port: 8180 },
  { id: 'rojas-api', name: 'Rojas API', port: 8181 },
  { id: 'basesur', name: 'Web basesur', port: 8090 },
];

// ── Adaptador SQLite (better-sqlite3 → node:sqlite → sqlite3) ───────────────
// Interfaz uniforme y asíncrona: db.all / db.get / db.run
function openDb(file) {
  try {
    const Database = require('better-sqlite3');
    const d = new Database(file);
    return {
      driver: 'better-sqlite3',
      all: (sql, p = []) => Promise.resolve(d.prepare(sql).all(...p)),
      get: (sql, p = []) => Promise.resolve(d.prepare(sql).get(...p)),
      run: (sql, p = []) => Promise.resolve(d.prepare(sql).run(...p)),
    };
  } catch (_) { /* siguiente driver */ }
  try {
    const { DatabaseSync } = require('node:sqlite');
    const d = new DatabaseSync(file);
    return {
      driver: 'node:sqlite',
      all: (sql, p = []) => Promise.resolve(d.prepare(sql).all(...p)),
      get: (sql, p = []) => Promise.resolve(d.prepare(sql).get(...p)),
      run: (sql, p = []) => Promise.resolve(d.prepare(sql).run(...p)),
    };
  } catch (_) { /* siguiente driver */ }
  const sqlite3 = require('sqlite3'); // última opción; lanza si tampoco está
  const d = new sqlite3.Database(file);
  const call = (method, sql, p) => new Promise((res, rej) => {
    if (method === 'run') {
      d.run(sql, p, function (err) { err ? rej(err) : res({ changes: this.changes }); });
    } else {
      d[method](sql, p, (err, out) => (err ? rej(err) : res(out)));
    }
  });
  return {
    driver: 'sqlite3',
    all: (sql, p = []) => call('all', sql, p),
    get: (sql, p = []) => call('get', sql, p),
    run: (sql, p = []) => call('run', sql, p),
  };
}

let _db = null;
function db() {
  if (!_db) _db = openDb(DB_PATH);
  return _db;
}

// ── Utilidades ──────────────────────────────────────────────────────────────
function parseTopics(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch (_) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function blobToFloat32(blob) {
  if (!blob) return null;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob.buffer || blob);
  const n = Math.floor(buf.byteLength / 4);
  if (!n) return null;
  return new Float32Array(buf.buffer, buf.byteOffset, n);
}

function readEnvFile(file) {
  try {
    const out = {};
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
  } catch (_) {
    return {};
  }
}

function envOrFile(...keys) {
  for (const k of keys) if (process.env[k]) return process.env[k];
  const fileEnv = readEnvFile(ENV_FILE);
  for (const k of keys) if (fileEnv[k]) return fileEnv[k];
  return '';
}

function execCmd(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4000 }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });
}

function checkPort(port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const started = Date.now();
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = (online) => {
      sock.destroy();
      resolve({ online, ms: Date.now() - started });
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

// POST JSON por https sin depender de fetch (compatible con Node viejos)
function postJson(urlStr, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const payload = JSON.stringify(body);
    const req = (u.protocol === 'http:' ? http : https).request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch (_) { /* respuesta no-JSON */ }
          if (res.statusCode >= 200 && res.statusCode < 300 && json) return resolve(json);
          const msg = (json && json.error && json.error.message) || data.slice(0, 300) || `HTTP ${res.statusCode}`;
          reject(new Error(`HTTP ${res.statusCode}: ${msg}`));
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

// ── Embeddings Gemini ───────────────────────────────────────────────────────
async function geminiEmbed(text) {
  const key = envOrFile('GEMINI_API_KEY', 'GOOGLE_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY no configurada (env o ' + ENV_FILE + ')');
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
  const url = `${base}/v1beta/models/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(key)}`;
  const body = {
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text: String(text).slice(0, EMBED_MAX_CHARS) }] },
    taskType: process.env.GEMINI_EMBED_TASK || 'RETRIEVAL_DOCUMENT',
    outputDimensionality: EMBED_DIMS,
  };
  const json = await postJson(url, body);
  const values = json && json.embedding && json.embedding.values;
  if (!Array.isArray(values) || !values.length) throw new Error('respuesta de Gemini sin embedding');
  return new Float32Array(values);
}

// ── Enlaces por similitud coseno (con caché) ────────────────────────────────
// Calcula pares con sim ≥ threshold y conserva el top-K por nodo (unión),
// estilo Obsidian: evita la "bola de pelo" y mantiene el payload chico.
let linksCache = null; // { mtimeMs, threshold, topk, links, builtAt }

function invalidateLinksCache() { linksCache = null; }

function dbMtimeMs() {
  try { return fs.statSync(DB_PATH).mtimeMs; } catch (_) { return 0; }
}

async function computeCosineLinks(threshold, topk) {
  const mtime = dbMtimeMs();
  if (
    linksCache && linksCache.mtimeMs === mtime &&
    linksCache.threshold === threshold && linksCache.topk === topk &&
    Date.now() - linksCache.builtAt < 10 * 60 * 1000
  ) return linksCache.links;

  const rows = await db().all('SELECT memory_id, embedding FROM memory_vectors');
  const items = [];
  for (const r of rows) {
    const v = blobToFloat32(r.embedding);
    if (!v) continue;
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm > 0) items.push({ id: r.memory_id, v, norm });
  }

  const perNode = new Map(items.map((it) => [it.id, []]));
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const a = items[i];
    for (let j = i + 1; j < n; j++) {
      const b = items[j];
      if (a.v.length !== b.v.length) continue;
      let dot = 0;
      const va = a.v, vb = b.v, len = va.length;
      for (let k = 0; k < len; k++) dot += va[k] * vb[k];
      const sim = dot / (a.norm * b.norm);
      if (sim >= threshold) {
        const link = { a: a.id, b: b.id, sim };
        perNode.get(a.id).push(link);
        perNode.get(b.id).push(link);
      }
    }
  }

  const keep = new Set();
  for (const list of perNode.values()) {
    list.sort((x, y) => y.sim - x.sim);
    for (let i = 0; i < Math.min(topk, list.length); i++) keep.add(list[i]);
  }
  const links = [...keep].map((l) => ({ a: l.a, b: l.b, sim: Math.round(l.sim * 1000) / 1000 }));
  linksCache = { mtimeMs: mtime, threshold, topk, links, builtAt: Date.now() };
  return links;
}

// ── Stats de sistema ────────────────────────────────────────────────────────
async function ramStats() {
  const out = await execCmd('free', ['-b']);
  const line = out.split('\n').find((l) => l.startsWith('Mem:'));
  if (line) {
    const f = line.trim().split(/\s+/).map(Number);
    // Mem: total used free shared buff/cache available
    if (f.length >= 7) {
      return { totalMb: f[1] / 1048576, usedMb: (f[1] - f[6]) / 1048576, availableMb: f[6] / 1048576, freeMb: f[3] / 1048576 };
    }
  }
  const total = os.totalmem(), free = os.freemem();
  return { totalMb: total / 1048576, usedMb: (total - free) / 1048576, availableMb: free / 1048576, freeMb: free / 1048576 };
}

async function diskStats() {
  const out = await execCmd('df', ['-kP', '/']);
  const line = out.split('\n')[1];
  if (line) {
    const f = line.trim().split(/\s+/);
    // fs 1024-blocks used avail capacity mount
    if (f.length >= 6) {
      const totalKb = Number(f[1]), usedKb = Number(f[2]), availKb = Number(f[3]);
      return { mount: '/', totalGb: totalKb / 1048576, usedGb: usedKb / 1048576, freeGb: availKb / 1048576 };
    }
  }
  return { mount: '/', totalGb: 0, usedGb: 0, freeGb: 0 };
}

async function geminiCounters() {
  try {
    const totals = await db().get('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(content)),0) AS chars, MAX(created_at) AS last FROM memory_vectors');
    const byKindRows = await db().all('SELECT kind, COUNT(*) AS n FROM memory_vectors GROUP BY kind');
    const minuter = await db().get("SELECT COUNT(DISTINCT COALESCE(ref_id, memory_id)) AS n FROM memory_vectors WHERE source = 'minuter'");
    const byKind = {};
    for (const r of byKindRows) byKind[r.kind || 'nota'] = r.n;
    return {
      memories: totals.n,
      byKind,
      minuterSessions: minuter ? minuter.n : 0,
      estTokens: Math.round(totals.chars / 4), // ≈ 4 caracteres por token
      embeddingCalls: totals.n,               // 1 embedding generado por fila
      lastMemoryAt: totals.last || null,
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function systemStats() {
  const [ram, disk, services, gemini] = await Promise.all([
    ramStats(),
    diskStats(),
    Promise.all(SERVICES.map(async (s) => ({ ...s, ...(await checkPort(s.port)) }))),
    geminiCounters(),
  ]);
  const minuterToken = envOrFile('MINUTER_TOKEN', 'MINUTERO_TOKEN', 'MINUTER_UPLOAD_TOKEN');
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: `${os.platform()} ${os.release()}`,
      uptimeSec: Math.round(os.uptime()),
      load: os.loadavg().map((x) => Math.round(x * 100) / 100),
      cpus: os.cpus().length,
    },
    ram, disk, services, gemini,
    links: {
      // La tarjeta del minutero usa este link si viene con token
      minutero: process.env.MINUTER_URL || (minuterToken ? `/minutero/?token=${encodeURIComponent(minuterToken)}` : '/minutero/'),
      whatsapp: process.env.SURIA_WHATSAPP_LINK || null,
    },
  };
}

// ── HTTP helpers ────────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (_) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function authorized(req, url) {
  if (!API_TOKEN) return true;
  const h = req.headers.authorization || '';
  if (h === `Bearer ${API_TOKEN}`) return true;
  return url.searchParams.get('token') === API_TOKEN;
}

// ── Handlers de endpoints ───────────────────────────────────────────────────
async function handleMemories(_req, res) {
  const rows = await db().all(
    `SELECT memory_id, parent_id, chunk_index, kind, source, content, topics, ref_id, created_at
     FROM memory_vectors ORDER BY created_at ASC`
  );
  sendJson(res, 200, rows.map((r) => ({ ...r, topics: parseTopics(r.topics) })));
}

async function handleEmbeddings(_req, res, url) {
  if (url.searchParams.get('links')) {
    const threshold = Math.min(0.95, Math.max(0.05, Number(url.searchParams.get('threshold') || 0.3)));
    const topk = Math.min(60, Math.max(1, Number(url.searchParams.get('topk') || 20)));
    const links = await computeCosineLinks(threshold, topk);
    return sendJson(res, 200, { ok: true, threshold, topk, count: links.length, links });
  }
  const rows = await db().all('SELECT memory_id, embedding FROM memory_vectors');
  const out = [];
  for (const r of rows) {
    const v = blobToFloat32(r.embedding);
    if (v) out.push({ memory_id: r.memory_id, vector: Array.from(v) });
  }
  sendJson(res, 200, out);
}

async function handleUpdate(req, res) {
  const body = await readBody(req);
  const id = body && body.memory_id;
  if (!id) return sendJson(res, 400, { ok: false, error: 'falta memory_id' });
  const row = await db().get('SELECT memory_id, content, topics FROM memory_vectors WHERE memory_id = ?', [id]);
  if (!row) return sendJson(res, 404, { ok: false, error: `memoria ${id} no encontrada` });

  const content = typeof body.content === 'string' && body.content.trim() ? body.content : row.content;
  const topics = body.topics !== undefined ? JSON.stringify(parseTopics(body.topics)) : row.topics;

  // Primero el embedding: si Gemini falla no se toca la fila y el RAG queda coherente.
  let vector;
  try {
    vector = await geminiEmbed(content);
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: `no se pudo regenerar el embedding: ${e.message}` });
  }
  await db().run(
    `UPDATE memory_vectors SET content = ?, topics = ?, embedding = ?, embedding_model = ?, dims = ? WHERE memory_id = ?`,
    [content, topics, Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength), EMBED_MODEL, vector.length, id]
  );
  invalidateLinksCache();
  sendJson(res, 200, { ok: true, memory_id: id, dims: vector.length, embedding_model: EMBED_MODEL });
}

async function handleDelete(req, res) {
  const body = await readBody(req);
  const id = body && body.memory_id;
  if (!id) return sendJson(res, 400, { ok: false, error: 'falta memory_id' });
  const out = await db().run('DELETE FROM memory_vectors WHERE memory_id = ?', [id]);
  invalidateLinksCache();
  sendJson(res, 200, { ok: true, memory_id: id, deleted: out && out.changes ? out.changes : 0 });
}

// ── Router ──────────────────────────────────────────────────────────────────
/**
 * Atiende las rutas del portal. Devuelve true si la ruta era del portal
 * (respuesta ya enviada), false si no la reconoce — útil para montarlo
 * dentro de un dashboard_api.js preexistente.
 */
async function handlePortalRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = `${req.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;

  const known = new Set([
    'GET /api/health', 'GET /api/memories', 'GET /api/memories/embeddings',
    'POST /api/memories/update', 'POST /api/memories/delete', 'GET /api/system/stats',
  ]);
  const isPreflight = req.method === 'OPTIONS' && known.has(`${req.headers['access-control-request-method']} ${url.pathname.replace(/\/+$/, '')}`);
  if (!known.has(route) && !isPreflight) return false;

  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
  if (!authorized(req, url)) { sendJson(res, 401, { ok: false, error: 'token inválido' }); return true; }

  try {
    if (route === 'GET /api/health') {
      sendJson(res, 200, { ok: true, service: 'suria-dashboard-api', db: fs.existsSync(DB_PATH), driver: db().driver, now: new Date().toISOString() });
    } else if (route === 'GET /api/memories') {
      await handleMemories(req, res);
    } else if (route === 'GET /api/memories/embeddings') {
      await handleEmbeddings(req, res, url);
    } else if (route === 'POST /api/memories/update') {
      await handleUpdate(req, res);
    } else if (route === 'POST /api/memories/delete') {
      await handleDelete(req, res);
    } else if (route === 'GET /api/system/stats') {
      sendJson(res, 200, await systemStats());
    }
  } catch (e) {
    console.error('[suria-api]', route, e);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: String(e.message || e) });
  }
  return true;
}

function createPortalServer() {
  return http.createServer(async (req, res) => {
    const handled = await handlePortalRequest(req, res).catch((e) => {
      console.error('[suria-api] error fatal', e);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'error interno' });
      return true;
    });
    if (!handled) sendJson(res, 404, { ok: false, error: `ruta desconocida: ${req.method} ${req.url}` });
  });
}

module.exports = { handlePortalRequest, createPortalServer, computeCosineLinks, geminiEmbed, SERVICES };

if (require.main === module) {
  createPortalServer().listen(PORT, HOST, () => {
    console.log(`[suria-api] escuchando en http://${HOST}:${PORT} · db=${DB_PATH}`);
  });
}
