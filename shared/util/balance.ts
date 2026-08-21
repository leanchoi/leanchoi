/**
 * Implementación de referencia de las fórmulas de progresión y recompensa.
 *
 * Es la ÚNICA implementación: el VPS la importa para calcular recompensas
 * autoritativas y el cliente la importa para previsualizar ("vas a ganar ~240
 * XP"). PHP replica el subconjunto necesario en `/backend-php/src/Balance.php`,
 * y `npm run check:balance` compara ambas salidas sobre un set de casos.
 *
 * Doc de referencia: `/docs/game-design/balance-formulas.md`.
 */

import { RANKS, RANK_BY_LEVEL, MAX_RANK_LEVEL } from '../constants/ranks.ts';
import {
  ECONOMY,
  HOUR_ACTIVITY_MULTIPLIER,
  LOYALTY,
  QUEST_BASELINES,
  REPEAT_DIMINISH,
  REPUTATION,
  VITALS,
  WEATHER_MODIFIERS,
  XP_CURVE,
} from '../constants/balance.ts';
import type { RankLevel, Unit, WeatherCondition } from '../types/common.ts';
import type { QuestType } from '../types/quests.ts';

/* ------------------------------------------------------------------ */
/* Curva de XP                                                         */
/* ------------------------------------------------------------------ */

/** ΔXP para pasar del nivel `n` al `n+1`. `n` ∈ [1,9]; devuelve 0 en el 10. */
export const xpDeltaForLevel = (n: number): number => {
  if (n < 1 || n >= MAX_RANK_LEVEL) return 0;
  const raw = XP_CURVE.BASE * Math.pow(n, XP_CURVE.EXPONENT) * Math.pow(XP_CURVE.GROWTH, n - 1);
  return Math.round(raw / XP_CURVE.QUANTUM) * XP_CURVE.QUANTUM;
};

/** XP acumulada necesaria para ALCANZAR el nivel `n`. */
export const cumulativeXpForLevel = (n: number): number => {
  let total = 0;
  for (let i = 1; i < n; i++) total += xpDeltaForLevel(i);
  return total;
};

/** Nivel de rango correspondiente a una XP acumulada. */
export const rankFromXp = (xp: number): RankLevel => {
  let level: RankLevel = 1;
  for (const r of RANKS) if (xp >= r.xpTotal) level = r.level;
  return level;
};

/** XP que falta para el siguiente rango (0 si ya está en el 10). */
export const xpToNextRank = (xp: number): number => {
  const level = rankFromXp(xp);
  if (level >= MAX_RANK_LEVEL) return 0;
  const next = RANK_BY_LEVEL[(level + 1) as RankLevel];
  return Math.max(0, next.xpTotal - xp);
};

/** Progreso [0,1] dentro del rango actual, para la barra del HUD. */
export const rankProgress = (xp: number): Unit => {
  const level = rankFromXp(xp);
  if (level >= MAX_RANK_LEVEL) return 1 as Unit;
  const cur = RANK_BY_LEVEL[level].xpTotal;
  const next = RANK_BY_LEVEL[(level + 1) as RankLevel].xpTotal;
  return Math.max(0, Math.min(1, (xp - cur) / (next - cur))) as Unit;
};

/* ------------------------------------------------------------------ */
/* Reputación y lealtad                                                */
/* ------------------------------------------------------------------ */

/** Reputación mínima exigida para ascender al nivel `n`. */
export const reputationRequiredFor = (n: number): number =>
  n <= 1 ? 0 : Math.round(REPUTATION.REP_BASE * Math.pow(n - 1, REPUTATION.REP_EXPONENT));

export interface PromotionCheck {
  readonly eligible: boolean;
  readonly nextLevel: RankLevel | null;
  readonly missing: {
    readonly xp: number;
    readonly reputation: number;
    readonly loyalty: number;
  };
}

/** Verifica si un personaje puede ascender (XP + reputación + lealtad). */
export const checkPromotion = (params: {
  xp: number;
  reputation: number;
  loyalty: number;
  currentLevel: RankLevel;
}): PromotionCheck => {
  const { xp, reputation, loyalty, currentLevel } = params;
  if (currentLevel >= MAX_RANK_LEVEL) {
    return { eligible: false, nextLevel: null, missing: { xp: 0, reputation: 0, loyalty: 0 } };
  }
  const next = RANK_BY_LEVEL[(currentLevel + 1) as RankLevel];
  const missing = {
    xp: Math.max(0, next.xpTotal - xp),
    reputation: Math.max(0, next.reputationRequired - reputation),
    loyalty: Math.max(0, Number((next.loyaltyRequired - loyalty).toFixed(4))),
  };
  return {
    eligible: missing.xp === 0 && missing.reputation === 0 && missing.loyalty === 0,
    nextLevel: next.level,
    missing,
  };
};

/**
 * Ganancia de reputación con techo blando: cuanto más alta la reputación, menos
 * rinde sumar. Las pérdidas NO se amortiguan (caer es más fácil que subir).
 */
export const applyReputationGain = (current: number, delta: number): number => {
  if (delta <= 0) return clamp(current + delta, REPUTATION.MIN, REPUTATION.MAX);
  const headroom = 1 - Math.max(0, current) / REPUTATION.MAX;
  return clamp(current + delta * headroom, REPUTATION.MIN, REPUTATION.MAX);
};

/** Decaimiento diario de reputación hacia 0 y de lealtad por inactividad. */
export const applyDailyDecay = (params: { reputation: number; loyalty: number; playedToday: boolean }): {
  reputation: number;
  loyalty: number;
} => ({
  reputation: Math.round(params.reputation * (1 - REPUTATION.DAILY_DECAY)),
  loyalty: params.playedToday
    ? params.loyalty
    : clamp(params.loyalty - LOYALTY.DAILY_DECAY, LOYALTY.MIN, LOYALTY.MAX),
});

/* ------------------------------------------------------------------ */
/* Vitales derivados                                                   */
/* ------------------------------------------------------------------ */

export const maxHealthFor = (level: RankLevel): number =>
  VITALS.HEALTH_MAX_BASE + VITALS.HEALTH_PER_RANK * (level - 1);

export const moneyCapFor = (level: RankLevel): number =>
  Math.round(ECONOMY.CAP_BASE * Math.pow(ECONOMY.CAP_GROWTH, level - 1));

/* ------------------------------------------------------------------ */
/* Recompensas de misión                                               */
/* ------------------------------------------------------------------ */

export interface QuestRewardInput {
  readonly questType: QuestType;
  /** Completitud ponderada [0,1]. */
  readonly completion: number;
  readonly rankLevel: RankLevel;
  /** Dificultad de la instancia [0,1]. */
  readonly difficulty: number;
  readonly weather: WeatherCondition;
  /** Hora local de Esquel 0..23. */
  readonly localHour: number;
  /** Veces que ya completó ESTA tipología hoy (antes de esta). */
  readonly repeatsToday: number;
  /** Misiones totales completadas hoy (para el tope por rango). */
  readonly questsToday: number;
  /** Multiplicador de facción sobre XP (perk). */
  readonly factionXpPerk: number;
  /** Producto de los buffs activos sobre cada canal. */
  readonly buffXp: number;
  readonly buffRep: number;
  readonly buffMoney: number;
}

export interface QuestRewardResult {
  readonly xp: number;
  readonly reputation: number;
  readonly money: number;
  readonly territoryScore: number;
  readonly factionTreasury: number;
  /** Desglose auditable, se loguea junto a la recompensa. */
  readonly breakdown: Readonly<Record<string, number>>;
}

/** Curva de completitud: parcial rinde menos que proporcional. */
export const completionFactor = (completion: number): number => Math.pow(clamp(completion, 0, 1), 1.25);

/** Rendimientos decrecientes por repetir la misma tipología en el día. */
export const repeatFactor = (repeatsToday: number): number =>
  Math.max(REPEAT_DIMINISH.FLOOR, Math.pow(REPEAT_DIMINISH.DECAY, Math.max(0, repeatsToday)));

/** Multiplicador de contexto (clima × hora × dificultad). */
export const contextMultiplier = (params: {
  questType: QuestType;
  weather: WeatherCondition;
  localHour: number;
  difficulty: number;
}): number => {
  const base = QUEST_BASELINES[params.questType];
  const w = base.outdoor ? WEATHER_MODIFIERS[params.weather].outdoorXp : 1;
  const h = HOUR_ACTIVITY_MULTIPLIER[clamp(Math.floor(params.localHour), 0, 23)] ?? 1;
  const d = 0.75 + 0.5 * clamp(params.difficulty, 0, 1);
  return w * h * d;
};

/** Recompensa final de una misión, con todo el desglose auditable. */
export const computeQuestReward = (input: QuestRewardInput): QuestRewardResult => {
  const base = QUEST_BASELINES[input.questType];
  const rank = RANK_BY_LEVEL[input.rankLevel];

  const fCompletion = completionFactor(input.completion);
  const fRepeat = repeatFactor(input.repeatsToday);
  const fCap = input.questsToday >= rank.dailyQuestCap ? REPEAT_DIMINISH.OVER_CAP : 1;
  const fContext = contextMultiplier(input);
  const fRank = rank.xpMultiplier;

  const xp = Math.round(base.xp * fCompletion * fRepeat * fCap * fContext * fRank * input.factionXpPerk * input.buffXp);
  const reputation = Math.round(base.reputation * fCompletion * fRepeat * fCap * input.buffRep);
  const money = Math.round(base.money * fCompletion * fRepeat * fCap * input.buffMoney);
  const territoryScore = Number((base.territory * fCompletion * rank.territoryWeight).toFixed(2));
  const factionTreasury = Math.round(money * ECONOMY.FACTION_CUT);

  return {
    xp,
    reputation,
    money,
    territoryScore,
    factionTreasury,
    breakdown: {
      baseXp: base.xp,
      fCompletion: round4(fCompletion),
      fRepeat: round4(fRepeat),
      fCap,
      fContext: round4(fContext),
      fRank,
      factionXpPerk: input.factionXpPerk,
      buffXp: input.buffXp,
    },
  };
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
const round4 = (v: number): number => Number(v.toFixed(4));

/**
 * Verificación de coherencia entre la tabla `RANKS` y la fórmula.
 * La ejecuta `npm run check:balance` y el arranque del VPS en modo `--strict`.
 */
export const verifyRankTable = (): { ok: boolean; errors: readonly string[] } => {
  const errors: string[] = [];
  let cum = 0;
  for (const r of RANKS) {
    const expectedDelta = xpDeltaForLevel(r.level);
    if (r.xpTotal !== cum) errors.push(`rango ${r.level}: xpTotal ${r.xpTotal} ≠ acumulado ${cum}`);
    if (r.xpToNext !== expectedDelta) {
      errors.push(`rango ${r.level}: xpToNext ${r.xpToNext} ≠ fórmula ${expectedDelta}`);
    }
    const expectedRep = reputationRequiredFor(r.level);
    if (r.reputationRequired !== expectedRep) {
      errors.push(`rango ${r.level}: reputación ${r.reputationRequired} ≠ fórmula ${expectedRep}`);
    }
    cum += expectedDelta;
  }
  return { ok: errors.length === 0, errors };
};
