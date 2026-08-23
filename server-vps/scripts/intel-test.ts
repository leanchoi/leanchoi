/**
 * Prueba del Motor de Inteligencia del shard.
 *
 * Ejecutar:  npm run test:intel --workspace server-vps
 *
 * Le mete telemetría sintética al motor y verifica lo que de verdad importa:
 * que cuente **personas distintas** y no eventos, que el k-anonimato tape los
 * barrios chicos, que la ponderación por padrón no deje que el Centro decida
 * solo, que el relay salga firmado hacia Hostinger y que la ventana se recicle.
 */

import { createHash } from 'node:crypto';
import { K_ANON_MIN, asIsoDateTime, asUuid, type TelemetryEvent } from '@esquel/shared';
import { IntelligenceEngine } from '../src/intelligence/IntelligenceEngine.ts';
import type { HostingerBridge } from '../src/services/HostingerBridge.ts';

let fallas = 0;
const eq = (nombre: string, a: unknown, b: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`  ${ok ? '✓' : '✗'} ${nombre}${ok ? '' : ` — esperado ${JSON.stringify(b)}, salió ${JSON.stringify(a)}`}`);
  if (!ok) fallas++;
};

console.log('— test:intel ——————————————————————————————————');

/* --- puente de mentira: registra lo que se le manda ----------------------- */

interface LoteEnviado {
  readonly path: string;
  readonly eventos: number;
}

const enviados: LoteEnviado[] = [];
let fallarProximo = false;

const bridgeFalso = {
  postSigned: async (path: string, payload: unknown) => {
    if (fallarProximo) {
      fallarProximo = false;
      return { ok: false as const, error: 'Hostinger caído' };
    }
    const cuerpo = payload as { events?: unknown[] };
    enviados.push({ path, eventos: cuerpo.events?.length ?? 0 });
    return { ok: true as const, data: { accepted: cuerpo.events?.length ?? 0 } };
  },
} as unknown as HostingerBridge;

/* --- fábrica de eventos ---------------------------------------------------- */

/** Seudónimo de 32 hex, con la misma forma que el que mintea Hostinger. */
const seudonimo = (nombre: string): string =>
  createHash('sha256').update(nombre).digest('hex').slice(0, 32);

let n = 0;
const uuid = (): string => {
  n++;
  const h = n.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${h}`;
};

const evento = (
  sujeto: string,
  barrio: string,
  payload: TelemetryEvent['payload'],
  kind: TelemetryEvent['kind'] = 'politico',
): TelemetryEvent =>
  ({
    eventId: asUuid(uuid()),
    kind,
    name: payload.name,
    subject: sujeto,
    sessionRef: asUuid('00000000-0000-4000-8000-ffffffffffff'),
    at: asIsoDateTime(Date.now()),
    context: {
      barrio,
      ageBand: '25-34',
      gender: 'prefiere_no_decir',
      interest: 'medio',
      platform: 'desktop',
      clientVersion: 'test',
      localHour: 18,
    },
    payload,
    schemaVersion: 1,
  }) as TelemetryEvent;

/* --- 1. Cuenta personas, no eventos --------------------------------------- */

const motor = new IntelligenceEngine({ bridge: bridgeFalso, shardName: 'Esquel — Test' });

// Un solo vecino grita veinte veces: sigue siendo un vecino.
const gritón = Array.from({ length: 20 }, () =>
  evento('sujeto-ruidoso', 'centro', { name: 'vote_intent', targetFaction: 1 as never, undecided: false, certainty: 0.9 as never, instrument: 'urna_plaza' }),
);
const r1 = motor.ingest(gritón, seudonimo('ruidoso'));
eq('entran los veinte eventos del mismo vecino', r1.accepted, 20);
eq('pero cuenta como una sola persona', motor.live().subjects, 1);

/* --- 2. El ritmo por sujeto corta la inyección ------------------------------ */

const inundación = Array.from({ length: 60 }, () =>
  evento('sujeto-bot', 'centro', { name: 'cell_enter', cell: { col: 0, row: 0 } }, 'movimiento'),
);
const r2 = motor.ingest(inundación, seudonimo('bot'));
eq('el rate limit corta la avalancha de un mismo sujeto', r2.rejected > 0, true);
console.log(`    de 60 eventos seguidos entraron ${r2.accepted} y se rechazaron ${r2.rejected}`);

/* --- 3. k-anonimato en el mapa de calor ------------------------------------ */

const motor2 = new IntelligenceEngine({ bridge: bridgeFalso, shardName: 'Esquel — Test' });

// Centro: 30 vecinos distintos, mayoría facción 1.
for (let i = 0; i < 30; i++) {
  motor2.ingest(
    [
      evento(`centro-${i}`, 'centro', {
        name: 'vote_intent',
        targetFaction: (i < 20 ? 1 : 2) as never,
        undecided: false,
        certainty: 0.8 as never,
        instrument: 'urna_plaza',
      }),
    ],
    seudonimo(`centro-${i}`),
  );
}
// Valle Chico: apenas 4 vecinos. No alcanza.
for (let i = 0; i < 4; i++) {
  motor2.ingest(
    [
      evento(`valle-${i}`, 'valle_chico', {
        name: 'vote_intent',
        targetFaction: 3 as never,
        undecided: false,
        certainty: 0.9 as never,
        instrument: 'urna_plaza',
      }),
    ],
    seudonimo(`valle-${i}`),
  );
}

const calor = motor2.live().heat;
const centro = calor.find((b) => b.barrio === 'centro');
const valle = calor.find((b) => b.barrio === 'valle_chico');

eq('el Centro se publica', centro?.publishable, true);
eq('y su dominante es la facción 1', centro?.dominantFaction, 1);
eq(`Valle Chico no llega a los ${K_ANON_MIN}`, valle?.publishable, false);
eq('así que no tiene dominante', valle?.dominantFaction, null);
eq('ni militancia inventada', valle?.militancy, 0);
eq('pero sí conserva el conteo', valle?.subjects, 4);

/* --- 4. Ponderación: el Centro no decide solo ------------------------------ */

// Badén, con muestra suficiente, votando al revés que el Centro.
for (let i = 0; i < 20; i++) {
  motor2.ingest(
    [
      evento(`baden-${i}`, 'badenes', {
        name: 'vote_intent',
        targetFaction: 2 as never,
        undecided: false,
        certainty: 0.8 as never,
        instrument: 'censo_vecinal',
      }),
    ],
    seudonimo(`baden-${i}`),
  );
}

const proy = motor2.projection();
const f1 = proy.mayor.find((p) => p.factionId === 1);
const f2 = proy.mayor.find((p) => p.factionId === 2);
console.log(
  `    proyección: ${proy.mayor.map((p) => `f${p.factionId} ${(p.share * 100).toFixed(1)}% → ${p.seats}`).join(' · ')}`,
);
eq('la proyección es publicable con esta muestra', proy.publishable, true);
eq('la facción 1 gana en el Centro pero no arrasa en el pueblo', (f1?.share ?? 0) < 0.67, true);
eq('la facción 2, fuerte en Badén, saca bancas', (f2?.seats ?? 0) > 0, true);
eq('se reparten las once bancas', proy.council.reduce((s, p) => s + p.seats, 0), 11);

/* --- 5. Comercios y misiones ------------------------------------------------ */

const motor3 = new IntelligenceEngine({ bridge: bridgeFalso, shardName: 'Esquel — Test' });
for (let i = 0; i < 12; i++) {
  motor3.ingest(
    [evento(`vecino-${i}`, 'centro', { name: 'sponsor_impression', sponsorId: 1, seconds: 3, distanceM: 9 }, 'comercial')],
    seudonimo(`vecino-${i}`),
  );
}
motor3.ingest([evento('vecino-0', 'centro', { name: 'sponsor_enter', sponsorId: 1 }, 'comercial')], seudonimo('vecino-0'));
motor3.ingest(
  [evento('vecino-0', 'centro', { name: 'sponsor_buff_claim', sponsorId: 1, buffSlug: 'chocolate_artesanal' }, 'comercial')],
  seudonimo('vecino-0'),
);
motor3.ingest(
  [
    evento('vecino-1', 'centro', { name: 'quest_start', questType: 'PEGATINA_RELAMPAGO' as never, questSlug: 'q1' }, 'progresion'),
    evento('vecino-1', 'centro', {
      name: 'quest_finish',
      questType: 'PEGATINA_RELAMPAGO' as never,
      questSlug: 'q1',
      outcome: 'completada',
      completion: 0.9 as never,
      seconds: 240,
    }, 'progresion'),
  ],
  seudonimo('vecino-1'),
);

const vivo3 = motor3.live();
const comercio = vivo3.sponsors.find((s) => s.sponsorId === 1);
eq('cuenta las doce impresiones', comercio?.impressions, 12);
eq('y los doce vecinos distintos', comercio?.uniqueSubjects, 12);
eq('registra la entrada', comercio?.entries, 1);
eq('y el buff retirado', comercio?.buffClaims, 1);

const mision = vivo3.participation.find((p) => p.questType === 'PEGATINA_RELAMPAGO');
eq('la misión arrancada se cuenta', mision?.starts, 1);
eq('la terminada también', mision?.finishes, 1);
eq('con su completitud media', mision?.completionAvg, 0.9);

/* --- 6. Relay hacia Hostinger ---------------------------------------------- */

enviados.length = 0;
const salida = await motor3.flush();
eq('el lote sale hacia el ingest', enviados[0]?.path, '/intelligence/ingest.php');
eq('con todos los eventos acumulados', salida.sent > 0, true);
console.log(`    se relayaron ${salida.sent} eventos en ${enviados.length} lote(s)`);

// Si Hostinger se cae, el lote vuelve a la cola en vez de perderse.
motor3.ingest([evento('vecino-9', 'centro', { name: 'sponsor_enter', sponsorId: 2 }, 'comercial')], seudonimo('vecino-9'));
fallarProximo = true;
const falla = await motor3.flush();
eq('un fallo no pierde el lote', falla.failed > 0, true);
eq('y queda pendiente para el próximo intento', Number(motor3.diagnostics().pendientes) > 0, true);

const recupero = await motor3.flush();
eq('el reintento lo saca', recupero.sent > 0, true);
eq('y la cola queda limpia', motor3.diagnostics().pendientes, 0);

/* --- 7. El sujeto lo sella el servidor, no el cliente ----------------------- */

// Este es el ataque que la Fase 4 dejaba abierto: un jugador autenticado manda
// eventos con un `subject` inventado distinto cada vez y fabrica gente. Con eso
// se falsea la proyección, se saltea el límite por sujeto y —lo más grave— se
// empuja un barrio por encima del umbral de k-anonimato: después el atacante
// resta sus propios eventos y lee el dato del único vecino real que había.
const motorSellado = new IntelligenceEngine({ bridge: bridgeFalso, shardName: 'Esquel — Test' });
const suyo = seudonimo('atacante');

const inventados = Array.from({ length: 40 }, (_, i) =>
  evento(`fabricado-${i}`, 'valle_chico', {
    name: 'vote_intent',
    targetFaction: 4 as never,
    undecided: false,
    certainty: 1 as never,
    instrument: 'urna_plaza',
  }),
);
motorSellado.ingest(inventados, suyo);

const atacado = motorSellado.live();
eq('cuarenta sujetos inventados cuentan como una sola persona', atacado.subjects, 1);
const valleFalso = atacado.heat.find((b) => b.barrio === 'valle_chico');
eq('el barrio NO cruza el umbral de k-anonimato', valleFalso?.publishable, false);
eq('y por lo tanto no publica dominante', valleFalso?.dominantFaction, null);

// El límite por sujeto tampoco se puede esquivar cambiando el campo.
const esquive = Array.from({ length: 50 }, (_, i) =>
  evento(`otro-${i}`, 'centro', { name: 'cell_enter', cell: { col: i, row: 0 } }, 'movimiento'),
);
const r7 = motorSellado.ingest(esquive, suyo);
eq('el rate limit aguanta aunque el cliente cambie el sujeto', r7.rejected > 0, true);
console.log(`    de 50 eventos con sujeto distinto cada uno, entraron ${r7.accepted}`);

// Sin seudónimo firmado, el lote entero se descarta.
const sinSello = motorSellado.ingest(inventados, '');
eq('sin el claim del token no entra nada', sinSello.accepted, 0);

/* --- 8. La ventana se recicla ---------------------------------------------- */

let reloj = Date.now();
const motor4 = new IntelligenceEngine({ bridge: bridgeFalso, shardName: 'Esquel — Test', now: () => reloj });
motor4.ingest(
  [evento('alguien', 'centro', { name: 'vote_intent', targetFaction: 1 as never, undecided: false, certainty: 0.5 as never, instrument: 'evento' })],
  seudonimo('alguien'),
);
eq('la ventana no se recicla antes de tiempo', motor4.rollWindowIfNeeded(), false);
reloj += 16 * 60_000;
eq('pasados los quince minutos, sí', motor4.rollWindowIfNeeded(), true);
eq('y el tablero arranca de cero', motor4.live().subjects, 0);

/* --- Salida ---------------------------------------------------------------- */

if (fallas > 0) {
  console.error(`\n  ${fallas} falla(s) en el Motor de Inteligencia del shard.`);
  process.exit(1);
}
console.log('\n  ✓ Conteo por persona, k-anonimato, ponderación, relay y ventana verificados.');
