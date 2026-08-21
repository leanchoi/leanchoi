/**
 * Control territorial y movilizaciones (implementación de referencia).
 *
 * Doc: `/docs/game-design/balance-formulas.md` §4.
 *
 * Idea central: la calle no se gana con un ejército de bots parados en una
 * esquina. El aporte de cada militante decae con la distancia, se satura con la
 * cantidad (exponente < 1), premia la coordinación (cohesión + voz) y se
 * evapora si nadie sostiene la presencia.
 */

import { RANK_BY_LEVEL } from '../constants/ranks.ts';
import { TERRITORY, WEATHER_MODIFIERS } from '../constants/balance.ts';
import type { RankLevel, Unit, Vec3, WeatherCondition } from '../types/common.ts';
import { clamp } from './balance.ts';
import { distanceFlatM } from './geo.ts';

/** Militante evaluado para el aporte de presencia. */
export interface Participant {
  readonly charId: string;
  readonly factionId: number;
  readonly rankLevel: RankLevel;
  readonly position: Vec3;
  readonly afk: boolean;
  /** Está transmitiendo por voz espacial en este tick. */
  readonly speaking: boolean;
}

export interface ZoneContext {
  readonly center: Vec3;
  readonly radiusM: number;
  /** Facción que controla la zona ahora (recibe la ventaja de defensor). */
  readonly controlledBy?: number;
  readonly weather: WeatherCondition;
  /** Perk de retención por facción (`FactionDefinition.perks.territoryHold`). */
  readonly holdPerks: Readonly<Record<number, number>>;
}

/** Aporte individual: peso de rango × caída por distancia. */
export const presenceOf = (p: Participant, ctx: ZoneContext): number => {
  if (p.afk) return 0;
  const d = distanceFlatM(p.position, ctx.center);
  if (d > ctx.radiusM) return 0;
  const falloff = 1 - 0.5 * Math.pow(d / ctx.radiusM, 2);
  return RANK_BY_LEVEL[p.rankLevel].territoryWeight * falloff;
};

export interface FactionPresence {
  readonly factionId: number;
  /** Suma cruda de aportes individuales. */
  readonly raw: number;
  /** Militantes computados (no AFK, dentro del radio). */
  readonly headcount: number;
  /** Fracción dentro del radio de cohesión. */
  readonly cohesion: Unit;
  /** Fracción transmitiendo por voz. */
  readonly voiceShare: Unit;
  /** Presencia efectiva tras saturación, cohesión, voz, clima y perks. */
  readonly effective: number;
}

/**
 * P_f = min(raw, tope)^EXPONENTE
 *       · (1 + COHESION_BONUS_MAX · cohesión)
 *       · (1 + VOICE_BONUS · fracciónVoz)
 *       · turnoutClima · perkFacción · [ventajaDefensor]
 */
export const computeFactionPresence = (participants: readonly Participant[], ctx: ZoneContext): readonly FactionPresence[] => {
  const byFaction = new Map<number, Participant[]>();
  for (const p of participants) {
    if (presenceOf(p, ctx) <= 0) continue;
    const list = byFaction.get(p.factionId) ?? [];
    list.push(p);
    byFaction.set(p.factionId, list);
  }

  const turnout = WEATHER_MODIFIERS[ctx.weather].rallyTurnout;
  const out: FactionPresence[] = [];

  for (const [factionId, members] of byFaction) {
    const capped = members.slice(0, TERRITORY.HEADCOUNT_CAP);
    const raw = capped.reduce((sum, p) => sum + presenceOf(p, ctx), 0);
    const inner = capped.filter((p) => distanceFlatM(p.position, ctx.center) <= TERRITORY.COHESION_RADIUS_M).length;
    const speaking = capped.filter((p) => p.speaking).length;
    const cohesion = (capped.length > 0 ? inner / capped.length : 0) as Unit;
    const voiceShare = (capped.length > 0 ? speaking / capped.length : 0) as Unit;

    const saturated = Math.pow(raw, TERRITORY.HEADCOUNT_EXPONENT);
    const perk = ctx.holdPerks[factionId] ?? 1;
    const defender = ctx.controlledBy === factionId ? TERRITORY.DEFENDER_ADVANTAGE : 1;

    const effective =
      saturated *
      (1 + TERRITORY.COHESION_BONUS_MAX * cohesion) *
      (1 + TERRITORY.VOICE_BONUS * voiceShare) *
      turnout *
      perk *
      defender;

    out.push({
      factionId,
      raw: Number(raw.toFixed(3)),
      headcount: capped.length,
      cohesion,
      voiceShare,
      effective: Number(effective.toFixed(3)),
    });
  }

  return out.sort((a, b) => b.effective - a.effective);
};

/**
 * Acumulación por tick: S_f ← max(0, S_f · (1 − decay) + PUNTOS · P_f).
 * `decay` se aplica SIEMPRE (también a quien está presente): sostener territorio
 * cuesta trabajo continuo.
 */
export const accumulateScores = (
  current: Readonly<Record<number, number>>,
  presence: readonly FactionPresence[],
  tickSeconds: number = TERRITORY.TICK_SECONDS,
): Record<number, number> => {
  const decay = (TERRITORY.DECAY_PER_MINUTE * tickSeconds) / 60;
  const next: Record<number, number> = {};
  const byFaction = new Map(presence.map((p) => [p.factionId, p]));
  const ids = new Set<number>([...Object.keys(current).map(Number), ...byFaction.keys()]);

  for (const id of ids) {
    const prev = current[id] ?? 0;
    const p = byFaction.get(id);
    const gain = p ? TERRITORY.POINTS_PER_TICK * p.effective : 0;
    next[id] = Math.max(0, Number((prev * (1 - decay) + gain).toFixed(3)));
  }
  return next;
};

export interface ControlResult {
  /** Puntaje normalizado por facción; suma 1 (o 0 si no hay puntaje). */
  readonly normalized: Readonly<Record<number, Unit>>;
  /** Facción que supera el umbral de captura, si alguna. */
  readonly leader?: number;
  readonly leaderShare: Unit;
  /** `true` si el líder cambia el control respecto de `controlledBy`. */
  readonly flips: boolean;
}

/** Normaliza los puntajes y determina captura. */
export const evaluateControl = (scores: Readonly<Record<number, number>>, controlledBy?: number): ControlResult => {
  const entries = Object.entries(scores).map(([k, v]) => [Number(k), v] as const);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) {
    return { normalized: {}, leaderShare: 0 as Unit, flips: false };
  }
  const normalized: Record<number, Unit> = {};
  let leader = entries[0][0];
  let leaderValue = -1;
  for (const [id, v] of entries) {
    const share = v / total;
    normalized[id] = share as Unit;
    if (share > leaderValue) {
      leaderValue = share;
      leader = id;
    }
  }
  const captures = leaderValue >= TERRITORY.CAPTURE_THRESHOLD;
  return {
    normalized,
    ...(captures ? { leader } : {}),
    leaderShare: clamp(leaderValue, 0, 1) as Unit,
    flips: captures && leader !== controlledBy,
  };
};

/**
 * Aporte de una zona a la intención de voto simulada de su facción.
 * `Δsupport = SUPPORT_PER_ZONE · pesoZona · share`
 */
export const zoneSupportDelta = (zoneWeight: number, share: number): number =>
  Number((TERRITORY.SUPPORT_PER_ZONE * zoneWeight * clamp(share, 0, 1)).toFixed(6));

/** Volumen de voz espacial según la distancia (usado también por el cliente). */
export const voiceGain = (distanceM: number, fullVolumeM: number, maxRangeM: number, rolloffExp: number): number => {
  if (distanceM <= fullVolumeM) return 1;
  if (distanceM >= maxRangeM) return 0;
  const t = (distanceM - fullVolumeM) / (maxRangeM - fullVolumeM);
  return Number(Math.pow(1 - t, rolloffExp).toFixed(4));
};
