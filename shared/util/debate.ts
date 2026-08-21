/**
 * Motor de resolución de Duelos de Debate (implementación de referencia).
 *
 * Determinista dado `seed`: el servidor resuelve y el cliente reproduce la misma
 * secuencia para animar. Doc: `/docs/game-design/balance-formulas.md` §3.
 */

import { DEBATE } from '../constants/balance.ts';
import { DEBATE_COUNTERS } from '../types/debate.ts';
import type {
  DebateCard,
  DebateEffect,
  DebateFamily,
  DebateLogEntry,
  DebateOutcome,
  DebateSide,
} from '../types/debate.ts';
import type { CharacterId, EpochMs, RankLevel, Unit } from '../types/common.ts';
import { clamp } from './balance.ts';
import type { Rng } from './rng.ts';

/* ------------------------------------------------------------------ */
/* Estadísticas iniciales                                              */
/* ------------------------------------------------------------------ */

export const initialCredibility = (rankLevel: RankLevel, reputation: number): number =>
  Math.round(DEBATE.CRED_BASE + DEBATE.CRED_PER_RANK * (rankLevel - 1) + DEBATE.CRED_PER_REP * Math.max(0, reputation));

export const initialRhetoric = (rankLevel: RankLevel): number =>
  Number((DEBATE.RHET_BASE + DEBATE.RHET_PER_RANK * (rankLevel - 1)).toFixed(2));

/**
 * Favor inicial del público: parte de 0.5 y se corre por diferencia de
 * reputación y por los espectadores presentes (que hinchan por el local).
 */
export const initialCrowdFavor = (params: {
  challengerReputation: number;
  defenderReputation: number;
  spectators: number;
  defenderIsLocal: boolean;
}): { challenger: Unit; defender: Unit } => {
  const repDiff = params.challengerReputation - params.defenderReputation;
  const repShift = clamp(repDiff / 2000, -0.2, 0.2);
  const spectatorShift = clamp(params.spectators * DEBATE.SPECTATOR_WEIGHT, 0, DEBATE.SPECTATOR_CAP);
  const challenger = clamp(0.5 + repShift - (params.defenderIsLocal ? spectatorShift : -spectatorShift), 0.05, 0.95);
  return { challenger: challenger as Unit, defender: (1 - challenger) as Unit };
};

/* ------------------------------------------------------------------ */
/* Rueda de familias                                                   */
/* ------------------------------------------------------------------ */

/** `1.5` si `attacker` contrarresta a `defender`, `0.65` si es contrarrestado, `1` si es neutro. */
export const counterMultiplier = (attacker: DebateFamily, defenderLast: DebateFamily | undefined): number => {
  if (!defenderLast) return 1;
  if (DEBATE_COUNTERS[attacker].includes(defenderLast)) return DEBATE.COUNTER_MULT;
  if (DEBATE_COUNTERS[defenderLast].includes(attacker)) return DEBATE.COUNTERED_MULT;
  return 1;
};

/* ------------------------------------------------------------------ */
/* Resolución de una jugada                                            */
/* ------------------------------------------------------------------ */

export interface CardResolution {
  readonly hit: boolean;
  readonly backfired: boolean;
  /** Daño aplicado a la credibilidad del defensor. */
  readonly damage: number;
  /** Daño aplicado al propio atacante (contragolpe). */
  readonly selfDamage: number;
  readonly counterMult: number;
  /** Corrimiento del favor del público hacia el atacante. */
  readonly crowdDelta: number;
  readonly effects: readonly DebateEffect[];
  readonly argumentsSpent: number;
}

export interface CardContext {
  readonly card: DebateCard;
  readonly attacker: DebateSide;
  readonly defender: DebateSide;
  /** Familia de la última carta jugada por el defensor. */
  readonly defenderLastFamily?: DebateFamily;
  /** El atacante milita en la facción de afinidad de la carta. */
  readonly affinity: boolean;
  /** Multiplicadores acumulados por estados activos sobre el atacante. */
  readonly attackerRhetoricMod: number;
  /** Reducción de daño por escudos activos del defensor [0,1]. */
  readonly defenderShield: number;
  readonly rng: Rng;
}

/**
 * damage = power · (1 + retórica/RHET_SCALE) · counter · afinidad
 *          · (1 − CROWD_DEFENSE · favorPúblicoDefensor) · (1 − escudo)
 */
export const resolveCard = (ctx: CardContext): CardResolution => {
  const { card, attacker, defender, rng } = ctx;

  const counterMult = counterMultiplier(card.family, ctx.defenderLastFamily);
  const rhetoric = attacker.rhetoric * ctx.attackerRhetoricMod;

  // Precisión: la contra ayuda a acertar, el favor del público del defensor estorba.
  const accuracy = clamp(
    card.accuracy * (counterMult >= DEBATE.COUNTER_MULT ? 1.1 : 1) - 0.15 * defender.crowdFavor,
    0.15,
    0.99,
  );
  const hit = rng.chance(accuracy);
  const backfired = !hit && rng.chance(card.backfire);

  if (!hit) {
    return {
      hit: false,
      backfired,
      damage: 0,
      selfDamage: backfired ? Math.round(card.power * DEBATE.BACKFIRE_SELF) : DEBATE.MISS_CRED_PENALTY,
      counterMult,
      crowdDelta: -DEBATE.CROWD_SHIFT * (backfired ? 1.5 : 0.5),
      effects: [],
      argumentsSpent: card.cost,
    };
  }

  const affinityMult = ctx.affinity ? DEBATE.AFFINITY_MULT : 1;
  const crowdDefense = 1 - DEBATE.CROWD_DEFENSE * defender.crowdFavor;
  const shield = 1 - clamp(ctx.defenderShield, 0, 0.8);

  const damage = Math.max(
    1,
    Math.round(card.power * (1 + rhetoric / DEBATE.RHET_SCALE) * counterMult * affinityMult * crowdDefense * shield),
  );

  const effects = card.effects.filter((e) => e.chance === undefined || rng.chance(e.chance));

  return {
    hit: true,
    backfired: false,
    damage,
    selfDamage: 0,
    counterMult,
    crowdDelta: DEBATE.CROWD_SHIFT * counterMult,
    effects,
    argumentsSpent: card.cost,
  };
};

/** Entrada de log a partir de una resolución. */
export const toLogEntry = (params: {
  turn: number;
  actor: CharacterId;
  card: DebateCard;
  resolution: CardResolution;
  at: EpochMs;
}): DebateLogEntry => ({
  turn: params.turn,
  actor: params.actor,
  card: params.card.slug,
  hit: params.resolution.hit,
  backfired: params.resolution.backfired,
  damage: params.resolution.damage,
  counterMult: params.resolution.counterMult,
  crowdDelta: Number(params.resolution.crowdDelta.toFixed(4)),
  effectsApplied: params.resolution.effects.map((e) => e.kind),
  at: params.at,
});

/* ------------------------------------------------------------------ */
/* Cierre del duelo                                                    */
/* ------------------------------------------------------------------ */

/** Dominancia [0,1]: 1 = ganar sin recibir un rasguño y en pocos turnos. */
export const dominanceOf = (winner: DebateSide, turns: number): Unit => {
  const healthKept = winner.credibility / winner.credibilityMax;
  const speed = 1 - clamp((turns - 3) / (DEBATE.MAX_TURNS - 3), 0, 1);
  return clamp(0.65 * healthKept + 0.35 * speed, 0, 1) as Unit;
};

export interface OutcomeInput {
  readonly winner?: DebateSide;
  readonly loser?: DebateSide;
  readonly draw: boolean;
  readonly reason: DebateOutcome['reason'];
  readonly turns: number;
  readonly pot: number;
  readonly zoneId?: string;
}

/**
 * Recompensas: escalan con la dominancia y con la diferencia de rango
 * (ganarle a alguien de rango mayor rinde más; a uno menor, mucho menos).
 */
export const buildOutcome = (input: OutcomeInput): DebateOutcome => {
  if (input.draw || !input.winner || !input.loser) {
    return {
      draw: true,
      reason: input.reason,
      turns: input.turns,
      dominance: 0 as Unit,
      rewards: {
        winnerXp: Math.round(DEBATE.LOSS_XP * 1.2),
        loserXp: Math.round(DEBATE.LOSS_XP * 1.2),
        winnerRep: 0,
        loserRep: 0,
        pot: 0,
      },
    };
  }

  const dominance = dominanceOf(input.winner, input.turns);
  const rankDiff = input.loser.rankLevel - input.winner.rankLevel; // >0 = ganó a alguien de más rango
  const rankFactor = clamp(1 + 0.12 * rankDiff, 0.4, 1.9);

  const winnerXp = Math.round(DEBATE.WIN_XP * (0.7 + 0.6 * dominance) * rankFactor);
  const loserXp = Math.round(DEBATE.LOSS_XP * (1.3 - 0.5 * dominance));
  const winnerRep = Math.round(DEBATE.WIN_REP * rankFactor * (0.6 + 0.8 * dominance));
  const loserRep = Math.round(DEBATE.LOSS_REP * (input.reason === 'abandono' ? 2 : 1));

  return {
    winner: input.winner.charId,
    loser: input.loser.charId,
    draw: false,
    reason: input.reason,
    turns: input.turns,
    dominance,
    rewards: { winnerXp, loserXp, winnerRep, loserRep, pot: input.pot },
    ...(input.zoneId
      ? { zoneImpact: { zoneId: input.zoneId, delta: Number((12 * (0.5 + dominance)).toFixed(2)) } }
      : {}),
  };
};

/** Validación de mazo: tamaño, copias y rango mínimo. */
export const validateDeck = (
  slugs: readonly string[],
  catalog: ReadonlyMap<string, DebateCard>,
  rankLevel: RankLevel,
): { ok: boolean; errors: readonly string[] } => {
  const errors: string[] = [];
  if (slugs.length !== DEBATE.DECK_SIZE) errors.push(`El mazo debe tener ${DEBATE.DECK_SIZE} cartas (tiene ${slugs.length}).`);
  const counts = new Map<string, number>();
  for (const slug of slugs) {
    const card = catalog.get(slug);
    if (!card) {
      errors.push(`Carta desconocida: ${slug}`);
      continue;
    }
    if (!card.enabled) errors.push(`Carta retirada del catálogo: ${slug}`);
    if (card.minRank > rankLevel) errors.push(`"${card.name}" requiere rango ${card.minRank}.`);
    const n = (counts.get(slug) ?? 0) + 1;
    counts.set(slug, n);
    if (n > card.maxCopies) errors.push(`"${card.name}" admite ${card.maxCopies} copia(s).`);
  }
  return { ok: errors.length === 0, errors };
};
