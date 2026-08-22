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

const config = loadConfig();
const app = express();

app.use(express.json({ limit: '256kb' }));

// CORS explícito: sólo los orígenes declarados. El navegador manda el bundle
// desde Hostinger y el WebSocket al VPS, así que sin esto no hay partida.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.corsOrigins.includes(origin)) {
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
