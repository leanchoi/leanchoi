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
 *  4. Que el motor de debate no produzca daños degenerados en los casos borde.
 *  5. Que el modelo territorial premie la coordinación por sobre la cantidad.
 *
 * Salida: código 0 si todo pasa; 1 con el detalle de cada divergencia.
 */

import { readFileSync, existsSync } from 'node:fs';
import { RANKS } from '../../shared/constants/ranks.ts';
import { DEBATE, TERRITORY } from '../../shared/constants/balance.ts';
import { verifyRankTable, xpDeltaForLevel, rankFromXp, computeQuestReward } from '../../shared/util/balance.ts';
import { computeFactionPresence, type Participant } from '../../shared/util/territory.ts';
import { resolveCard } from '../../shared/util/debate.ts';
import { createRng } from '../../shared/util/rng.ts';
import type { DebateCard, DebateSide } from '../../shared/types/debate.ts';
import type { RankLevel, Unit, Vec3 } from '../../shared/types/common.ts';

const errors: string[] = [];
const notes: string[] = [];

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
  questType: 'afiches_relampago',
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
  questType: 'afiches_relampago',
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
  questType: 'afiches_relampago',
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

/* 5. Debate: sin daños degenerados ------------------------------------------ */
const card: DebateCard = {
  slug: 'chicana_del_asado' as DebateCard['slug'],
  name: 'Chicana del asado',
  flavor: 'Le recordás que se fue del asado sin poner la plata.',
  family: 'chicana',
  rarity: 'comun',
  cost: 2,
  power: 18,
  accuracy: 0.9 as Unit,
  backfire: 0.08 as Unit,
  effects: [],
  minRank: 1,
  cooldown: 0,
  maxCopies: 2,
  icon: 'chicana_asado',
  enabled: true,
};
const mkSide = (rankLevel: RankLevel, crowd: number): DebateSide => ({
  charId: '1' as DebateSide['charId'],
  nick: 'test',
  rankLevel,
  credibility: 100,
  credibilityMax: 100,
  rhetoric: DEBATE.RHET_BASE + DEBATE.RHET_PER_RANK * (rankLevel - 1),
  arguments: 4,
  argumentsMax: DEBATE.ARGUMENTS_MAX,
  handSize: 4,
  deckRemaining: 8,
  discard: [],
  statuses: [],
  cooldowns: {},
  crowdFavor: crowd as Unit,
  timedOut: false,
});
const rng = createRng(12345);
let maxDamage = 0;
for (let i = 0; i < 500; i++) {
  const res = resolveCard({
    card,
    attacker: mkSide(10, 0.5),
    defender: mkSide(1, 0.5),
    defenderLastFamily: 'promesa_inviable',
    affinity: true,
    attackerRhetoricMod: 1,
    defenderShield: 0,
    rng,
  });
  maxDamage = Math.max(maxDamage, res.damage);
}
notes.push(`Daño máximo observado (rango 10 con contra + afinidad vs rango 1): ${maxDamage}`);
if (maxDamage > 100) {
  errors.push(`Un golpe puede liquidar el duelo de una (daño ${maxDamage} >= credibilidad 100).`);
}

/* 6. Territorio: la coordinación gana a la cantidad -------------------------- */
const center: Vec3 = { x: 0, y: 0, z: 0 };
const mk = (n: number, faccion: number, radius: number, speaking: boolean): Participant[] =>
  Array.from({ length: n }, (_, i) => ({
    charId: `${faccion}-${i}`,
    factionId: faccion,
    rankLevel: 3 as RankLevel,
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
