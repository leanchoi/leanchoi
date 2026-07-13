// Importa la base "REDES TURISMO ESQUEL" (publicaciones de redes sociales)
// desde scripts/data/publicaciones.csv, replicando el Airtable original.
// - La base queda a nombre del admin master, SIN colaboradores: solo la ve él.
// - Idempotente: si la base ya existe, no hace nada.
// Uso en el VPS:  docker compose exec leanboard node scripts/import-publicaciones.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const db = new Database(path.join(DB_DIR, 'trello.db'));
db.pragma('busy_timeout = 10000');

const uid = () => crypto.randomBytes(9).toString('base64url');
const now = () => new Date().toISOString();

const BASE_NAME = 'REDES TURISMO ESQUEL';

// ── Parser CSV mínimo (maneja comillas y saltos de línea dentro de celdas) ──
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(x => x.trim() !== '')) rows.push(row); }
  return rows;
}

// d/m/yyyy → yyyy-mm-dd
function parseFecha(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function main() {
  const exists = db.prepare('SELECT id FROM bases WHERE name = ?').get(BASE_NAME);
  if (exists) {
    console.log(`· La base "${BASE_NAME}" ya existe (id ${exists.id}). No se importa de nuevo.`);
    return;
  }
  const admin = db.prepare('SELECT id FROM users WHERE is_master = 1 ORDER BY id LIMIT 1').get()
    || db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!admin) { console.error('✗ No hay usuario admin/master.'); process.exit(1); }

  const csvPath = path.join(__dirname, 'data', 'publicaciones.csv');
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  const header = rows[0].map(h => h.trim());
  const data = rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
  console.log(`· CSV: ${data.length} publicaciones`);

  const col = {
    pauta: 'PAUTA', desc: 'BREVE DESCRIPCION', copy: 'COPY', fecha: 'FECHA DE PUBLI',
    estado: 'ESTADO', productos: 'PRODUCTOS', canal: 'CANAL', resp: 'RESPONSABLE',
    fbL: 'FB Likes', fbA: 'FB ALCANCE', igL: 'Ig Likes', igA: 'IG ALCANCE', ttL: 'TT LIKES', ttA: 'TT ALCANCE',
  };

  // choices dinámicos desde los datos
  const COLORS = ['teal', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'gray'];
  const choicesFrom = (values, colorMap = {}) => {
    const list = [...new Set(values.filter(Boolean))].sort();
    return list.map((name, i) => ({ id: uid(), name, color: colorMap[name] || COLORS[i % COLORS.length] }));
  };
  const splitMulti = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

  const estadoColors = {
    'PUBLICADO': 'green', 'OK PARA PUBLICAR': 'teal', 'Programado': 'blue',
    'FALTA OK MARCE': 'orange', 'FALTA COMPLETAR ALGO': 'yellow', 'EDITAR IMAGEN': 'red',
  };
  const canalColors = { FACEBOOK: 'blue', INSTAGRAM: 'pink', TIKTOK: 'gray', YOUTUBE: 'red', HISTORIA: 'purple', META: 'teal' };

  const estadoChoices = choicesFrom(data.map(r => r[col.estado]), estadoColors);
  const pautaChoices = choicesFrom(data.map(r => r[col.pauta]));
  const productoChoices = choicesFrom(data.flatMap(r => splitMulti(r[col.productos])));
  const canalChoices = choicesFrom(data.flatMap(r => splitMulti(r[col.canal])), canalColors);
  const respChoices = choicesFrom(data.map(r => r[col.resp]));

  const baseId = uid(), tableId = uid();
  const f = {}; // nombre → field id
  const fields = [
    ['BREVE DESCRIPCION', 'text', {}],
    ['COPY', 'longtext', {}],
    ['MATERIAL', 'attachment', {}],
    ['FECHA DE PUBLI', 'date', {}],
    ['ESTADO', 'select', { choices: estadoChoices }],
    ['PAUTA', 'select', { choices: pautaChoices }],
    ['PRODUCTOS', 'multiselect', { choices: productoChoices }],
    ['CANAL', 'multiselect', { choices: canalChoices }],
    ['RESPONSABLE', 'select', { choices: respChoices }],
    ['FB Likes', 'number', {}],
    ['FB Alcance', 'number', {}],
    ['IG Likes', 'number', {}],
    ['IG Alcance', 'number', {}],
    ['TT Likes', 'number', {}],
    ['TT Alcance', 'number', {}],
  ];

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO bases (id, name, color, icon, owner_id, tenant_id) VALUES (?, ?, ?, ?, ?, 1)')
      .run(baseId, BASE_NAME, 'teal', '📣', admin.id);
    db.prepare('INSERT INTO base_tables (id, base_id, name, position) VALUES (?, ?, ?, 0)')
      .run(tableId, baseId, 'PUBLICACIONES');

    const insF = db.prepare('INSERT INTO base_fields (id, table_id, name, type, options, position) VALUES (?, ?, ?, ?, ?, ?)');
    fields.forEach(([name, type, options], i) => {
      const id = uid(); f[name] = id;
      insF.run(id, tableId, name, type, JSON.stringify(options), i);
    });

    const num = (v) => { const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : undefined; };
    const insR = db.prepare('INSERT INTO base_records (id, table_id, data, position, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let imported = 0;
    data.forEach((r, i) => {
      const d = {};
      if (r[col.desc]) d[f['BREVE DESCRIPCION']] = r[col.desc];
      if (r[col.copy]) d[f['COPY']] = r[col.copy];
      const fecha = parseFecha(r[col.fecha]); if (fecha) d[f['FECHA DE PUBLI']] = fecha;
      if (r[col.estado]) d[f['ESTADO']] = r[col.estado];
      if (r[col.pauta]) d[f['PAUTA']] = r[col.pauta];
      const prods = splitMulti(r[col.productos]); if (prods.length) d[f['PRODUCTOS']] = prods;
      const canales = splitMulti(r[col.canal]); if (canales.length) d[f['CANAL']] = canales;
      if (r[col.resp]) d[f['RESPONSABLE']] = r[col.resp];
      const nums = [[col.fbL, 'FB Likes'], [col.fbA, 'FB Alcance'], [col.igL, 'IG Likes'], [col.igA, 'IG Alcance'], [col.ttL, 'TT Likes'], [col.ttA, 'TT Alcance']];
      for (const [src, dst] of nums) { const n = num(r[src]); if (n !== undefined) d[f[dst]] = n; }
      insR.run(uid(), tableId, JSON.stringify(d), i, admin.id, now(), now());
      imported++;
    });

    // ── Vistas ──
    const insV = db.prepare('INSERT INTO base_views (id, table_id, name, type, config, position, created_by, personal) VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
    let pos = 0;
    insV.run(uid(), tableId, 'Grid principal', 'grid', JSON.stringify({
      sorts: [{ fieldId: f['FECHA DE PUBLI'], dir: 'asc' }],
    }), pos++, admin.id);
    insV.run(uid(), tableId, 'Flujo de trabajo', 'kanban', JSON.stringify({
      stackBy: f['ESTADO'],
      hidden: [f['COPY'], f['FB Likes'], f['FB Alcance'], f['IG Likes'], f['IG Alcance'], f['TT Likes'], f['TT Alcance'], f['PAUTA'], f['RESPONSABLE']],
    }), pos++, admin.id);
    insV.run(uid(), tableId, 'Calendario de publicación', 'calendar', JSON.stringify({
      dateField: f['FECHA DE PUBLI'],
      colorRules: [{ color: 'green', fieldId: f['ESTADO'], op: 'eq', value: 'PUBLICADO' }],
    }), pos++, admin.id);
    insV.run(uid(), tableId, 'Pendientes', 'grid', JSON.stringify({
      filters: [
        { fieldId: f['ESTADO'], op: 'neq', value: 'PUBLICADO' },
      ],
      sorts: [{ fieldId: f['FECHA DE PUBLI'], dir: 'asc' }],
      groupBy: f['ESTADO'],
      colorRules: [
        { color: 'orange', fieldId: f['ESTADO'], op: 'eq', value: 'FALTA OK MARCE' },
        { color: 'yellow', fieldId: f['ESTADO'], op: 'eq', value: 'FALTA COMPLETAR ALGO' },
        { color: 'red', fieldId: f['ESTADO'], op: 'eq', value: 'EDITAR IMAGEN' },
        { color: 'teal', fieldId: f['ESTADO'], op: 'eq', value: 'OK PARA PUBLICAR' },
        { color: 'blue', fieldId: f['ESTADO'], op: 'eq', value: 'Programado' },
      ],
      hidden: [f['COPY'], f['FB Likes'], f['FB Alcance'], f['IG Likes'], f['IG Alcance'], f['TT Likes'], f['TT Alcance']],
    }), pos++, admin.id);
    insV.run(uid(), tableId, 'Galería de material', 'gallery', JSON.stringify({
      coverField: f['MATERIAL'],
      hidden: [f['COPY'], f['FB Likes'], f['FB Alcance'], f['IG Likes'], f['IG Alcance'], f['TT Likes'], f['TT Alcance'], f['PAUTA'], f['RESPONSABLE'], f['PRODUCTOS']],
    }), pos++, admin.id);

    return imported;
  });

  const imported = tx();
  console.log(`✔ Base "${BASE_NAME}" creada con ${imported} publicaciones, ${fields.length} campos y 5 vistas.`);
  console.log('  Solo la ve el admin (sin colaboradores). Los adjuntos de Airtable expiran: subí el material a mano en el campo MATERIAL.');
}

main();
