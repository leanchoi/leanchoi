/**
 * check-balance — verificación de paridad entre las fórmulas y las tablas.
 *
 * Ejecutar:  npm run check:balance
 * (usa el type-stripping nativo de Node >= 22.6: `node --experimental-strip-types`)
 *
 * Comprueba:
 *  1. Que la tabla RANKS coincida exactamente con la curva de XP y de reputación.
 *  2. Que el seed SQL de rangos coincida con la tabla RANKS.
 *  3. Que la curva rinda un tiempo total de juego dentro de la ventana de diseño.
 *  4. Que la credibilidad del duelo respete el rango de diseño (100 a 250).
 *  5. Que el modelo territorial premie la coordinación por sobre la cantidad.
 *
 * Salida: código 0 si todo pasa; 1 con el detalle de cada divergencia.
 */

import { readFileSync, existsSync } from 'node:fs';
import { RANKS } from '../../shared/constants/ranks.ts';
import { DEBATE, TERRITORY } from '../../shared/constants/balance.ts';
import { DEBATE_FAMILIES } from '../../shared/types/debate.ts';
import { QUEST_TYPES } from '../../shared/types/quests.ts';
import { verifyRankTable, xpDeltaForLevel, rankFromXp, computeQuestReward } from '../../shared/util/balance.ts';
import { computeFactionPresence, type Participant } from '../../shared/util/territory.ts';
import { initialCredibility } from '../../shared/util/debate.ts';
import type { RankLevel, Vec3 } from '../../shared/types/common.ts';

const errors: string[] = [];
const notes: string[] = [];

/** Todas las capturas de un patrón dentro de un .sql, o `[]` si no está. */
const leerTokens = (url: URL, re: RegExp): string[] => {
  if (!existsSync(url)) return [];
  const sql = readFileSync(url, 'utf8');
  return [...sql.matchAll(re)].map((m) => m[1]);
};

/* 1. Tabla de rangos vs. fórmula ------------------------------------------- */
const rankCheck = verifyRankTable();
if (!rankCheck.ok) errors.push(...rankCheck.errors);

/* 2. Seed SQL vs. tabla ----------------------------------------------------- */
const seedPath = new URL('../../backend-php/database/seeds/002_rangos.sql', import.meta.url);
if (existsSync(seedPath)) {
  const sql = readFileSync(seedPath, 'utf8');
  for (const rank of RANKS) {
    const row = new RegExp(`\\(\\s*${rank.level}\\s*,\\s*'${rank.id}'`).test(sql);
    if (!row) errors.push(`seed 002_rangos.sql: falta o difiere la fila del rango ${rank.level} (${rank.id})`);
    if (!sql.includes(String(rank.xpTotal))) {
      errors.push(`seed 002_rangos.sql: no aparece xp_total ${rank.xpTotal} del rango ${rank.id}`);
    }
  }
} else {
  errors.push('No se encontró backend-php/database/seeds/002_rangos.sql');
}

/* 3. Ventana de diseño de la progresión ------------------------------------- */
const XP_PER_HOUR_BASE = 2000; // jugador medio, ~8 misiones/hora
let hours = 0;
for (let n = 1; n < 10; n++) {
  hours += xpDeltaForLevel(n) / (XP_PER_HOUR_BASE * RANKS[n - 1].xpMultiplier);
}
notes.push(`Tiempo a rango 10: ${hours.toFixed(1)} h efectivas (ventana de diseño: 100-150 h)`);
if (hours < 100 || hours > 150) {
  errors.push(`La curva rinde ${hours.toFixed(1)} h; el diseño exige entre 100 y 150 h.`);
}

/* Coherencia de rankFromXp en los bordes ------------------------------------ */
for (const rank of RANKS) {
  if (rankFromXp(rank.xpTotal) !== rank.level) {
    errors.push(`rankFromXp(${rank.xpTotal}) debería devolver ${rank.level}`);
  }
  if (rank.level > 1 && rankFromXp(rank.xpTotal - 1) !== ((rank.level - 1) as RankLevel)) {
    errors.push(`rankFromXp(${rank.xpTotal - 1}) debería devolver ${rank.level - 1}`);
  }
}

/* 4. Recompensa de misión: monotonía y topes -------------------------------- */
const baseReward = computeQuestReward({
  questType: 'PEGATINA_RELAMPAGO',
  completion: 1,
  rankLevel: 1,
  difficulty: 0.5,
  weather: 'despejado',
  localHour: 18,
  repeatsToday: 0,
  questsToday: 0,
  factionXpPerk: 1,
  buffXp: 1,
  buffRep: 1,
  buffMoney: 1,
});
const halfReward = computeQuestReward({
  questType: 'PEGATINA_RELAMPAGO',
  completion: 0.5,
  rankLevel: 1,
  difficulty: 0.5,
  weather: 'despejado',
  localHour: 18,
  repeatsToday: 0,
  questsToday: 0,
  factionXpPerk: 1,
  buffXp: 1,
  buffRep: 1,
  buffMoney: 1,
});
if (halfReward.xp >= baseReward.xp * 0.5) {
  errors.push('La completitud parcial no puede rendir proporcionalmente: revisar completionFactor().');
}
const farmed = computeQuestReward({
  questType: 'PEGATINA_RELAMPAGO',
  completion: 1,
  rankLevel: 1,
  difficulty: 0.5,
  weather: 'despejado',
  localHour: 18,
  repeatsToday: 12,
  questsToday: 30,
  factionXpPerk: 1,
  buffXp: 1,
  buffRep: 1,
  buffMoney: 1,
});
if (farmed.xp > baseReward.xp * 0.1) {
  errors.push('El farmeo repetido debería caer por debajo del 10% de la recompensa base.');
}
notes.push(`Afiches relámpago: ${baseReward.xp} XP al 100%, ${halfReward.xp} XP al 50%, ${farmed.xp} XP farmeando.`);

/* 5. Debate: la credibilidad respeta el rango de diseño --------------------- */
// La mecánica fina —duración de los duelos y dominancia de cada carta— la
// verifica `npm run test:debate`, que juega cientos de duelos completos.
const credRango1 = initialCredibility(1, 0);
const credRango10 = initialCredibility(10, 1000);
notes.push(`Credibilidad: rango 1 → ${credRango1} · rango 10 → ${credRango10} (diseño: 100 a 250)`);
if (credRango1 !== 100) errors.push(`La credibilidad de rango 1 debería ser 100 y es ${credRango1}.`);
if (credRango10 > 250) errors.push(`La credibilidad de rango 10 se pasa de 250: ${credRango10}.`);
if (credRango10 < 240) errors.push(`La credibilidad de rango 10 se queda corta: ${credRango10}.`);

const labiaEnSeisTurnos = DEBATE.LABIA_START + DEBATE.LABIA_REGEN * 6;
notes.push(`Labia acumulable en seis turnos sin gastar: ${labiaEnSeisTurnos} (tope ${DEBATE.LABIA_MAX})`);
if (DEBATE.LABIA_MAX >= labiaEnSeisTurnos) {
  errors.push('El tope de labia nunca se alcanza: guardarse turnos no tendría costo de oportunidad.');
}


/* 5.b Seeds de contenido: sólo familias y tipologías vigentes ---------------- */
// Los seeds 004 y 005 los emite `npm run seeds --workspace server-vps` desde los
// catálogos TypeScript. Acá sólo se verifica que nadie los haya editado a mano
// dejando una familia o una tipología que ya no existe.
const seedDir = new URL('../../backend-php/database/seeds/', import.meta.url);

const familiasSeed = leerTokens(new URL('004_cartas_debate.sql', seedDir), /,\s*'([a-z_]+)',\s*'(?:comun|infrecuente|rara|epica|mitica)'/g);
if (familiasSeed.length === 0) {
  errors.push('seed 004_cartas_debate.sql: no se pudo leer ninguna familia. ¿Se regeneró?');
} else {
  const validas = new Set<string>(DEBATE_FAMILIES.map((f) => f.toLowerCase()));
  for (const familia of new Set(familiasSeed)) {
    if (!validas.has(familia)) errors.push(`seed 004_cartas_debate.sql: familia fuera del diseño: ${familia}`);
  }
  notes.push(`Seed de cartas: ${familiasSeed.length} cartas en ${new Set(familiasSeed).size} familias.`);
}

const tiposSeed = leerTokens(new URL('005_misiones_catalogo.sql', seedDir), /^\s*\(\d+,\s*'[a-z0-9_]+',\s*'([a-z_]+)'/gm);
if (tiposSeed.length === 0) {
  errors.push('seed 005_misiones_catalogo.sql: no se pudo leer ninguna tipología. ¿Se regeneró?');
} else {
  const validos = new Set<string>(QUEST_TYPES.map((t) => t.toLowerCase()));
  for (const tipo of new Set(tiposSeed)) {
    if (!validos.has(tipo)) errors.push(`seed 005_misiones_catalogo.sql: tipología fuera del diseño: ${tipo}`);
  }
  if (new Set(tiposSeed).size !== QUEST_TYPES.length) {
    errors.push(`seed 005_misiones_catalogo.sql: hay ${new Set(tiposSeed).size} tipologías y el diseño pide ${QUEST_TYPES.length}.`);
  }
  notes.push(`Seed de misiones: ${new Set(tiposSeed).size} tipologías Live-Ops.`);
}

/* 6. Territorio: la coordinación gana a la cantidad -------------------------- */
const center: Vec3 = { x: 0, y: 0, z: 0 };
const mk = (n: number, faccion: number, radius: number, speaking: boolean): Participant[] =>
  Array.from({ length: n }, (_, i) => ({
    charId: `${faccion}-${i}`,
    factionId: faccion,
    rankLevel: 3,
    position: { x: radius * Math.cos((i / n) * Math.PI * 2), y: 0, z: radius * Math.sin((i / n) * Math.PI * 2) },
    afk: false,
    speaking,
  }));
const ctx = { center, radiusM: TERRITORY.ZONE_RADIUS_M, weather: 'despejado' as const, holdPerks: {} };
const dispersos = computeFactionPresence(mk(14, 1, 40, false), ctx)[0];
const coordinados = computeFactionPresence(mk(9, 2, 10, true), ctx)[0];
notes.push(
  `Territorio — 14 dispersos: ${dispersos.effective} · 9 coordinados con voz: ${coordinados.effective}`,
);
if (coordinados.effective <= dispersos.effective) {
  errors.push('9 militantes coordinados deberían superar a 14 dispersos: revisar cohesión/saturación.');
}

/* Salida -------------------------------------------------------------------- */
console.log('— check:balance ——————————————————————————————');
for (const n of notes) console.log(`  · ${n}`);
if (errors.length > 0) {
  console.error('\n  FALLAS:');
  for (const e of errors) console.error(`   ✗ ${e}`);
  process.exit(1);
}
console.log('\n  ✓ Fórmulas, tablas y seeds coherentes.');
