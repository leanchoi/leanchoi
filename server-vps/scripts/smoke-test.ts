/**
 * Prueba de humo del multijugador.
 *
 * Levanta el servidor, mintea dos JWT como lo haría Hostinger y junta a dos
 * vecinos en la Plaza San Martín. Después verifica, de punta a punta, lo que
 * promete la Fase 2:
 *
 *   1. El JWT abre la puerta y uno inválido la cierra.
 *   2. El padrón replicado trae identidad política, no sólo coordenadas.
 *   3. Dos jugadores cercanos se ven por el canal AOI.
 *   4. El chat local se escucha en la esquina.
 *   5. La malla de voz los empareja con su ganancia y su paneo, y el servidor
 *      reenvía la oferta SDP.
 *   6. El anti-cheat corrige un teletransporte.
 *   7. Pegar un afiche da XP y se ve en el estado.
 *   8. Al alejarse, dejan de llegar paquetes: eso es el ahorro de ancho de banda.
 *
 * La caminata de la prueba va a velocidad humana a propósito: el anti-cheat es
 * real y rechaza cualquier atajo. El servidor de prueba corre con AOI de una
 * manzana para que cruzar el borde tarde veinte segundos y no dos minutos.
 *
 * Ejecutar:  npm run test:smoke --workspace server-vps
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client, type Room } from 'colyseus.js';
import type { EsquelWorldState } from '../src/schema/EsquelWorldState.ts';
import { C2S, S2C } from '../../shared/protocol/index.ts';
import type { UserJWT } from '../../shared/index.ts';
import { createHash } from 'node:crypto';
import { issueToken } from '../src/auth/jwt.ts';

/** Puerto libre: así dos corridas seguidas no se pisan. */
const freePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

const PORT = await freePort();
const SECRET = 'secreto-de-prueba-esquel-2027-abcdefghijkl';
const ENDPOINT = `ws://127.0.0.1:${PORT}`;

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const mintToken = (
  userId: string,
  alias: string,
  faction: number,
  rank: number,
  characterId: string,
  progreso?: { xp?: number; reputation?: number; loyalty?: number },
): string => {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://esquel2027.ar',
    aud: ['esquel-api', 'esquel-realtime'],
    sub: userId,
    jti: `test-${userId}-${now}`,
    iat: now,
    nbf: now - 5,
    exp: now + 900,
    nick: alias,
    role: 'player',
    scopes: ['game:play', 'game:voice'],
    userId,
    characterId,
    alias,
    factionId: faction,
    rankTier: rank,
    barrio: 'centro',
    mode: 'ciudadano',
    telemetryConsent: true,
    consentVersion: 1,
    bind: '0'.repeat(16),
    // Progreso acumulado: lo firma Hostinger y es lo que le permite a la sala
    // decidir un ascenso sin consultar MySQL.
    xp: progreso?.xp ?? 0,
    reputation: progreso?.reputation ?? 0,
    loyalty: progreso?.loyalty ?? 0.2,
    telemetrySubject: createHash('sha256').update(userId).digest('hex').slice(0, 32),
  } as unknown as UserJWT;
  return issueToken(claims, SECRET);
};

/** Espera un mensaje que cumpla el predicado, o falla por timeout. */
/**
 * Sala tipada contra el estado replicado real.
 *
 * `Room` a secas deja `state` en `unknown`, así que todo lo que esta prueba
 * afirma sobre el padrón —`state.players.size`, el rango de un jugador, el
 * ticker— pasaba sin verificar. Andaba porque `tsx` borra los tipos sin
 * mirarlos; el día que el esquema cambiara de forma, la prueba iba a seguir
 * compilando y fallando en tiempo de ejecución por otro motivo.
 */
type SalaEsquel = Room<EsquelWorldState>;

const waitFor = <T>(room: SalaEsquel, type: string, predicate: (m: T) => boolean, timeoutMs = 5000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando ${type}`)), timeoutMs);
    room.onMessage(type, (message: T) => {
      if (predicate(message)) {
        clearTimeout(timer);
        resolve(message);
      }
    });
  });

const serverPath = fileURLToPath(new URL('../src/index.ts', import.meta.url));
// Se arranca con tsx: los decoradores de @colyseus/schema no son sintaxis
// borrable, así que el type-stripping nativo de Node no alcanza.
const server = spawn(process.execPath, ['--import', 'tsx', serverPath], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    JWT_SECRET: SECRET,
    HOSTINGER_API_KEY: 'test-key',
    HOSTINGER_API_URL: 'http://127.0.0.1:9/api', // no existe: se prueba que el fallo no rompa la partida
    SHARD_NAME: 'Esquel — Test',
    AOI_CELLS: '1',
    TICK_HZ: '20',
    AOI_HZ: '10',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const serverLog: string[] = [];
server.stdout.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()));
server.stderr.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()));

const shutdown = (code: number): never => {
  server.kill('SIGKILL');
  process.exit(code);
};

try {
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      ready = res.ok;
    } catch {
      /* todavía no levantó */
    }
  }
  if (!ready) throw new Error(`El servidor no levantó:\n${serverLog.join('')}`);
  console.log(`\n— prueba de humo multijugador (puerto ${PORT}, AOI 1 manzana) —\n`);

  /* 1. Autenticación --------------------------------------------------- */
  const clienteA = new Client(ENDPOINT);
  const clienteB = new Client(ENDPOINT);

  let rechazado = false;
  try {
    await clienteA.joinOrCreate('esquel_city', { accessToken: 'no.es.un.token' });
  } catch {
    rechazado = true;
  }
  check('Un token inválido no entra a la sala', rechazado);

  const salaA = await clienteA.joinOrCreate<EsquelWorldState>('esquel_city', {
    accessToken: mintToken('1001', 'Beto el Puntero', 3, 3, '5001'),
    spawn: { x: 0, z: -20 },
  });
  const salaB = await clienteB.joinOrCreate<EsquelWorldState>('esquel_city', {
    accessToken: mintToken('1002', 'Marta la Concejala', 2, 5, '5002'),
    spawn: { x: 12, z: -20 },
  });
  check(
    'Dos vecinos entran con JWT firmado por Hostinger',
    Boolean(salaA.sessionId && salaB.sessionId),
    `${salaA.sessionId} y ${salaB.sessionId}`,
  );

  await sleep(1200);
  check('El padrón replicado tiene a los dos', salaA.state.players.size === 2, `players.size = ${salaA.state.players.size}`);

  const marta = salaA.state.players.get(salaB.sessionId);
  check(
    'El estado trae identidad política, no sólo coordenadas',
    marta?.alias === 'Marta la Concejala' && marta?.rankTier === 5 && marta?.factionId === 2,
    `${marta?.alias} · rango ${marta?.rankTier} · facción ${marta?.factionId}`,
  );

  /* Movimiento --------------------------------------------------------- */
  const mover = (sala: SalaEsquel, seq: number, x: number, z: number, anim = 'WALK'): void => {
    sala.send(C2S.MOVE, { seq, position: { x, y: 0, z }, yaw: 0, anim });
  };

  /**
   * Camina de verdad: pasos de 2 m cada 300 ms ≈ 6,7 m/s, que es correr fuerte
   * pero humano. Mandar saltos más grandes hace que el anti-cheat los rechace,
   * que es exactamente lo que tiene que hacer.
   */
  const caminar = async (sala: SalaEsquel, desde: { x: number; z: number }, hasta: { x: number; z: number }, seqBase: number): Promise<void> => {
    const distancia = Math.hypot(hasta.x - desde.x, hasta.z - desde.z);
    const pasos = Math.max(1, Math.ceil(distancia / 2));
    for (let i = 1; i <= pasos; i++) {
      const t = i / pasos;
      mover(sala, seqBase + i, desde.x + (hasta.x - desde.x) * t, desde.z + (hasta.z - desde.z) * t, 'RUN');
      await sleep(300);
    }
  };

  /* 2. AOI de cerca ---------------------------------------------------- */
  mover(salaA, 1, 0, -20);
  mover(salaB, 1, 12, -20);
  await sleep(500);

  const aoiCerca = await waitFor<{ players: { sessionId: string }[] }>(salaA, S2C.AOI, (m) =>
    m.players.some((p) => p.sessionId === salaB.sessionId),
  );
  check(
    'A recibe la transformada de B cuando están en la misma manzana',
    aoiCerca.players.length > 0,
    `${aoiCerca.players.length} vecino(s) en el paquete`,
  );

  /* 3. Chat local ------------------------------------------------------- */
  const chatCerca = waitFor<{ text: string }>(salaB, S2C.CHAT, (m) => m.text.includes('choripán'));
  salaA.send(C2S.CHAT, { text: 'Che, ¿a qué hora sale el choripán?', channel: 'local' });
  await chatCerca;
  check('El chat local se escucha a 12 metros', true, 'burbuja recibida');

  /* 4. Voz por proximidad ------------------------------------------------ */
  salaA.send(C2S.VOICE_TOGGLE, { enabled: true, speaking: false });
  salaB.send(C2S.VOICE_TOGGLE, { enabled: true, speaking: false });

  const peersA = await waitFor<{ peers: { sessionId: string; gain: number; pan: number; initiator: boolean }[] }>(
    salaA,
    S2C.VOICE_PEERS,
    (m) => m.peers.some((p) => p.sessionId === salaB.sessionId),
    8000,
  );
  const par = peersA.peers.find((p) => p.sessionId === salaB.sessionId);
  check(
    'La malla de voz empareja a los que están a menos de 25 m',
    Boolean(par) && par!.gain > 0 && par!.gain <= 1,
    `ganancia ${par?.gain} · paneo ${par?.pan} · inicia ${par?.initiator}`,
  );

  const ofertaEnB = waitFor<{ from: string; kind: string; payload: string }>(
    salaB,
    S2C.VOICE_SIGNAL,
    (m) => m.kind === 'offer' && m.from === salaA.sessionId,
    5000,
  );
  salaA.send(C2S.VOICE_SIGNAL, { to: salaB.sessionId, kind: 'offer', payload: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' });
  const oferta = await ofertaEnB;
  check('El servidor reenvía la oferta SDP al vecino emparejado', oferta.payload.startsWith('v=0'));

  /* 5. Anti-cheat -------------------------------------------------------- */
  const correccion = waitFor<{ reason: string }>(salaA, S2C.RECONCILE, (m) => m.reason === 'anticheat', 5000);
  salaA.send(C2S.MOVE, { seq: 999, position: { x: 900, y: 0, z: 900 }, yaw: 0, anim: 'RUN' });
  const fix = await correccion;
  check('Un teletransporte se corrige, no se acepta', fix.reason === 'anticheat');

  /* 6. Militancia -------------------------------------------------------- */
  const xpAntes = salaA.state.players.get(salaA.sessionId)?.xp ?? 0;
  const delta = waitFor<{ xp: number; reason: string }>(salaA, S2C.STAT_DELTA, (m) => m.xp > 0, 5000);
  salaA.send(C2S.ACTION, { action: 'pegar_afiche' });
  const ganancia = await delta;
  await sleep(400);
  const xpDespues = salaA.state.players.get(salaA.sessionId)?.xp ?? 0;
  check(
    'Pegar un afiche da XP y se ve en el estado replicado',
    ganancia.xp > 0 && xpDespues > xpAntes,
    `+${ganancia.xp} XP — "${ganancia.reason}"`,
  );

  /* 6.b Ascenso ---------------------------------------------------------- */
  // El agujero que encontró la auditoría: la XP crecía y el rango no se movía
  // nunca. Entra un vecino a un pelo del umbral de Soldado y se verifica que la
  // siguiente acción lo asciende de verdad, no que quede esperando.
  const clienteC = new Client(ENDPOINT);
  const aFilo = await clienteC.joinOrCreate<EsquelWorldState>('esquel_city', {
    accessToken: mintToken('9001', 'Petiso al filo', 3, 1, '9001', {
      // 900 XP y 30 de reputación pide el rango 2; la lealtad ya está hecha.
      xp: 899,
      reputation: 40,
      loyalty: 0.4,
    }),
  });
  await sleep(600);

  const rangoAntes = aFilo.state.players.get(aFilo.sessionId)?.rankTier ?? 0;
  const ascenso = waitFor<{ from: number; to: number; rankName: string }>(aFilo, S2C.RANK_UP, () => true, 5000);
  aFilo.send(C2S.ACTION, { action: 'pegar_afiche' });
  const subio = await ascenso;
  await sleep(400);
  const rangoDespues = aFilo.state.players.get(aFilo.sessionId)?.rankTier ?? 0;

  check(
    'Cruzar el umbral asciende de rango y avisa',
    subio.to === 2 && rangoDespues === rangoAntes + 1,
    `${subio.rankName}: rango ${subio.from} → ${subio.to}`,
  );

  // Y no asciende de más: el que no llega, no sube.
  const clienteD = new Client(ENDPOINT);
  const cerca = await clienteD.joinOrCreate<EsquelWorldState>('esquel_city', {
    accessToken: mintToken('9002', 'Petiso lejos', 3, 1, '9002', { xp: 400, reputation: 40, loyalty: 0.4 }),
  });
  await sleep(600);
  cerca.send(C2S.ACTION, { action: 'pegar_afiche' });
  await sleep(800);
  check(
    'El que no llega al umbral no asciende',
    (cerca.state.players.get(cerca.sessionId)?.rankTier ?? 0) === 1,
    'sigue de Chopanero, como corresponde',
  );

  await aFilo.leave();
  await cerca.leave();
  await sleep(300);

  /* 7. Mundo replicado --------------------------------------------------- */
  check(
    'El mundo trae reloj de Esquel, clima y fase electoral',
    salaA.state.clock.localMinute >= 0 && salaA.state.weather.condition.length > 0 && salaA.state.election.phase.length > 0,
    `${salaA.state.clock.phase} · ${salaA.state.weather.condition} · ${salaA.state.election.badge}`,
  );

  /* 8. Caminar hasta salir del AOI --------------------------------------- */
  const leaveEsperado = waitFor<{ sessionIds: string[] }>(
    salaA,
    's2c.aoi.leave',
    (m) => m.sessionIds.includes(salaB.sessionId),
    60_000,
  );
  console.log('  … Marta se va caminando hasta dos manzanas al norte (a velocidad humana, tarda)');
  await caminar(salaB, { x: 12, z: -20 }, { x: 12, z: 240 }, 300);
  await leaveEsperado;
  check('B sale del AOI de A al cruzar el radio de interés', true, 'llegó el aviso de salida');

  let recibioLejano = false;
  // `onMessage` devuelve el desuscriptor tipado como `any` en colyseus.js: se
  // acota acá para que el `any` no se propague al resto de la prueba.
  const offAoi = salaA.onMessage(S2C.AOI, (m: { players: { sessionId: string }[] }) => {
    if (m.players.some((p) => p.sessionId === salaB.sessionId)) recibioLejano = true;
  }) as unknown as () => void;
  await sleep(1500);
  offAoi();
  check('Ya no llegan paquetes de B: el ancho de banda se ahorra de verdad', !recibioLejano);

  let escuchoLejos = false;
  const offChat = salaB.onMessage(S2C.CHAT, (m: { text: string }) => {
    if (m.text.includes('tortas fritas')) escuchoLejos = true;
  }) as unknown as () => void;
  salaA.send(C2S.CHAT, { text: 'Hay tortas fritas en la esquina', channel: 'local' });
  await sleep(1000);
  offChat();
  check('A 260 metros no se escucha el chat local', !escuchoLejos);

  /* 9. Estado del servidor ------------------------------------------------ */
  const metrics = (await (await fetch(`http://127.0.0.1:${PORT}/metrics`)).json()) as { jugadores: number };
  check('El endpoint /metrics reporta la población', metrics.jugadores === 2, `${metrics.jugadores} jugadores`);

  await salaA.leave();
  await salaB.leave();
  await sleep(800);

  const fallidas = results.filter((r) => !r.ok);
  console.log(`\n  ${results.length - fallidas.length}/${results.length} verificaciones en verde`);
  if (fallidas.length > 0) {
    console.error('\n  FALLAS:');
    for (const f of fallidas) console.error(`   ✗ ${f.name} ${f.detail}`);
    shutdown(1);
  }
  console.log('  ✓ El multijugador de Esquel 2027 funciona de punta a punta.\n');
  shutdown(0);
} catch (err) {
  console.error('\n  ERROR:', err instanceof Error ? err.message : err);
  console.error(serverLog.join('').slice(-2500));
  shutdown(1);
}
