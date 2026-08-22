/**
 * Punto de entrada del servidor autoritativo.
 *
 * Levanta el transporte WebSocket de Colyseus, publica la sala de la ciudad y
 * expone tres endpoints HTTP mínimos para operar el VPS:
 *
 *   GET /health   sonda para PM2 / Docker / uptime robot
 *   GET /metrics  población, manzanas ocupadas, pares de voz, salud del puente
 *   GET /colyseus panel de Colyseus (sólo fuera de producción)
 */

import { createServer } from 'node:http';
import express from 'express';
// Igual que en la sala: `colyseus` es CJS, se entra por el default.
import colyseusPkg from 'colyseus';

const { Server, matchMaker } = colyseusPkg;
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import { loadConfig } from './config/env.ts';
import { EsquelCityRoom } from './rooms/EsquelCityRoom.ts';
import { dispatchLiveOps, liveIntel } from './rooms/registry.ts';
import { verifyToken } from './auth/jwt.ts';
import type { LiveOpsCommand, UserJWT } from '@esquel/shared';

const config = loadConfig();
const app = express();

app.use(express.json({ limit: '256kb' }));

/**
 * ¿Este origen puede hablarnos?
 *
 * La lista viene de `CORS_ORIGIN`, y además se acepta cualquier subdominio del
 * dominio de Hostinger declarado: en producción el bundle sale de
 * `esquel2027.ar` pero también de `www.` y del subdominio de staging, y no tiene
 * sentido reeditar la variable de entorno cada vez. Un comodín `*` en la lista
 * abre todo, y sólo se usa en desarrollo.
 */
const originPermitido = (origin: string): boolean => {
  if (config.corsOrigins.includes('*')) return true;
  if (config.corsOrigins.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return config.corsOrigins.some((permitido) => {
      try {
        const base = new URL(permitido).hostname;
        return host === base || host.endsWith(`.${base}`);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
};

// CORS explícito: sólo los orígenes declarados. El navegador manda el bundle
// desde Hostinger y el WebSocket al VPS, así que sin esto no hay partida.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && originPermitido(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    shard: config.shardName,
    env: config.env,
    uptimeS: Math.round(process.uptime()),
    memoriaMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

/**
 * Guardia del dashboard: sólo pasa un JWT con rol de administrador, firmado por
 * el mismo Hostinger que emite los tokens de juego. No hay clave maestra del
 * lado del VPS: un solo emisor de identidad, como en toda la arquitectura.
 */
const soloAdmin = (req: express.Request, res: express.Response): UserJWT | null => {
  const header = String(req.headers.authorization ?? '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ ok: false, error: 'Falta el token de administrador.' });
    return null;
  }

  const result = verifyToken(token, {
    secret: config.jwt.secret,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    clockToleranceS: config.jwt.clockToleranceS,
  });
  if (!result.ok) {
    res.status(401).json({ ok: false, error: `Token inválido: ${result.reason}` });
    return null;
  }
  if (result.claims.role !== 'admin' && result.claims.role !== 'moderator') {
    res.status(403).json({ ok: false, error: 'Ese token no abre el panel.' });
    return null;
  }
  return result.claims;
};

/** Foto en vivo del pueblo, sin pasar por MySQL: lo que el dashboard pinta. */
app.get('/intel/live', (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json({ ok: true, ...liveIntel() });
});

/** Consola Live-Ops: noticia bomba, misión forzada o cierre a mano. */
app.post('/intel/liveops', (req, res) => {
  const claims = soloAdmin(req, res);
  if (!claims) return;

  const body = req.body as { command?: LiveOpsCommand; shard?: string };
  if (!body?.command?.kind) {
    res.status(422).json({ ok: false, error: 'Falta el comando.' });
    return;
  }

  const resultados = dispatchLiveOps(body.command, body.shard);
  if (resultados.length === 0) {
    res.status(503).json({ ok: false, error: 'No hay salas vivas en este shard.' });
    return;
  }
  console.log(`[liveops] ${claims.alias} disparó ${body.command.kind} → ${resultados.map((r) => r.text).join(' | ')}`);
  res.json({ ok: resultados.every((r) => r.ok), results: resultados });
});

app.get('/metrics', async (_req, res) => {
  const rooms = await matchMaker.query({ name: 'esquel_city' });
  res.json({
    shard: config.shardName,
    salas: rooms.length,
    jugadores: rooms.reduce((sum, room) => sum + room.clients, 0),
    aforo: rooms.reduce((sum, room) => sum + room.maxClients, 0),
    detalle: rooms.map((room) => ({
      roomId: room.roomId,
      clientes: room.clients,
      creada: room.createdAt,
    })),
  });
});

if (config.env !== 'production') {
  app.use('/colyseus', monitor());
}

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    // Ping cada 8 segundos: en una conexión de datos patagónica conviene
    // detectar rápido al que se quedó sin señal.
    pingInterval: 8000,
    pingMaxRetries: 3,
  }),
});

gameServer.define('esquel_city', EsquelCityRoom).filterBy(['shard']);

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[server] ${signal}: cerrando salas y volcando stats…`);
  await gameServer.gracefullyShutdown(false);
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void gameServer.listen(config.port).then(() => {
  console.log(`[server] Esquel 2027 escuchando en :${config.port} (${config.env})`);
  console.log(`[server] shard "${config.shardName}" · aforo ${config.capacity} · AOI ${config.world.aoiCells} manzanas`);
  console.log(`[server] orígenes permitidos: ${config.corsOrigins.join(', ')}`);
});
