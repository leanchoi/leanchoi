/**
 * Matemática del Duelo de Debates y Chicanas.
 *
 * Vive en `/shared` porque la usan los dos lados: el `DebateEngine` del VPS —que
 * es la autoridad— y el cliente, que previsualiza el daño de cada carta antes de
 * jugarla. Determinista dado el `seed`: un duelo se puede reproducir entero desde
 * su semilla, que es lo que permite auditar el balance y revisar una denuncia.
 *
 * Doc: `/docs/game-design/balance-formulas.md` §3.
 */

import { DEBATE } from '../constants/balance.ts';
import { FAMILY_COUNTERS } from '../types/debate.ts';
import type {
  DebateCard,
  DebateEffect,
  DebateEffectKind,
  DebateFamily,
  DebateLogEntry,
  DebateOutcome,
  DebateSide,
  DebateStatus,
} from '../types/debate.ts';
import type { CharacterId, EpochMs, RankLevel, Unit } from '../types/common.ts';
import { clamp } from './balance.ts';
import type { Rng } from './rng.ts';

/* ------------------------------------------------------------------ */
/* Estadísticas iniciales                                              */
/* ------------------------------------------------------------------ */

/** Credibilidad inicial: 100 en el llano, 250 con la cara en el afiche. */
export const initialCredibility = (rankTier: RankLevel, reputation = 0): number => {
  const porRango = DEBATE.CRED_BASE + DEBATE.CRED_PER_RANK * (rankTier - 1);
  const porFama = Math.min(DEBATE.CRED_REP_CAP, Math.max(0, reputation) * DEBATE.CRED_PER_REP);
  return Math.round(porRango + porFama);
};

export const initialRhetoric = (rankTier: RankLevel): number =>
  Number((DEBATE.RHET_BASE + DEBATE.RHET_PER_RANK * (rankTier - 1)).toFixed(2));

/**
 * Favor inicial del público: parte de 0,5 y se corre por la diferencia de
 * reputación y por los espectadores, que siempre hinchan por el local.
 */
export const initialCrowdFavor = (params: {
  challengerReputation: number;
  defenderReputation: number;
  spectators: number;
  defenderIsLocal: boolean;
}): { challenger: Unit; defender: Unit } => {
  const repShift = clamp((params.challengerReputation - params.defenderReputation) / 2000, -0.2, 0.2);
  const spectatorShift = clamp(params.spectators * DEBATE.SPECTATOR_WEIGHT, 0, DEBATE.SPECTATOR_CAP);
  const challenger = clamp(0.5 + repShift - (params.defenderIsLocal ? spectatorShift : -spectatorShift), 0.05, 0.95);
  return { challenger: challenger as Unit, defender: (1 - challenger) as Unit };
};

/* ------------------------------------------------------------------ */
/* Familias                                                            */
/* ------------------------------------------------------------------ */

/** 1,4 si contrarrestás; 0,75 si te contrarrestan; 1 si es neutro. */
export const familyMultiplier = (attacker: DebateFamily, defenderLast: DebateFamily | null): number => {
  if (!defenderLast) return 1;
  if (FAMILY_COUNTERS[attacker].includes(defenderLast)) return DEBATE.COUNTER_MULT;
  if (FAMILY_COUNTERS[defenderLast].includes(attacker)) return DEBATE.COUNTERED_MULT;
  return 1;
};

/** El líder pesa más donde tu facción manda: de 0,8 (zona ajena) a 1,7 (bastión). */
export const leaderMultiplier = (zoneControl: number): number =>
  Number((DEBATE.LIDER_ZONE_MIN + (DEBATE.LIDER_ZONE_MAX - DEBATE.LIDER_ZONE_MIN) * clamp(zoneControl, 0, 1)).toFixed(3));

/* ------------------------------------------------------------------ */
/* Resolución de una jugada                                            */
/* ------------------------------------------------------------------ */

export interface CardContext {
  readonly card: DebateCard;
  readonly attacker: DebateSide;
  readonly defender: DebateSide;
  /** Familia de la última carta que jugó el defensor. */
  readonly defenderLastFamily: DebateFamily | null;
  /** El atacante milita en la facción con afinidad de la carta. */
  readonly affinity: boolean;
  /** Control de la facción del atacante en la zona [0,1]. */
  readonly zoneControl: number;
  readonly rng: Rng;
}

export interface CardResolution {
  readonly hit: boolean;
  readonly backfired: boolean;
  /** Daño a la credibilidad del rival. */
  readonly damage: number;
  /** Daño que se hace el propio atacante. */
  readonly selfDamage: number;
  /** Credibilidad que recupera el atacante. */
  readonly heal: number;
  /** Labia que le roba al rival. */
  readonly labiaStolen: number;
  /** Labia que recupera. */
  readonly labiaGained: number;
  /** Multiplicador total aplicado (familia × condición × afinidad × zona). */
  readonly multiplier: number;
  /** Corrimiento del favor del público hacia el atacante. */
  readonly crowdDelta: number;
  /** Estados que quedan sobre el atacante. */
  readonly selfStatuses: readonly DebateEffect[];
  /** Estados que quedan sobre el rival. */
  readonly enemyStatuses: readonly DebateEffect[];
  /** `true` si el atacante queda marcado como mentiroso. */
  readonly liar: boolean;
  /** `true` si al rival le rompieron el quórum. */
  readonly blocksAbility: boolean;
  readonly labiaSpent: number;
  /** Frase para el registro del duelo. */
  readonly text: string;
}

const shieldOf = (side: DebateSide): number =>
  clamp(
    side.statuses.filter((s) => s.kind === 'escudo').reduce((sum, s) => sum + s.value, 0),
    0,
    0.7,
  );

/**
 * Resuelve una carta. Acá está toda la mecánica del duelo:
 *
 *   daño = poder · (1 + retórica/60) · familia · condición · afinidad · zona
 *        · (1 − 0,25 · favorPúblicoDefensor) · (1 − escudo)
 */
export const resolveCard = (ctx: CardContext): CardResolution => {
  const { card, attacker, defender, rng } = ctx;
  const family = card.family;

  /* --- multiplicadores --- */
  let multiplier = familyMultiplier(family, ctx.defenderLastFamily);
  let text = '';

  if (family === 'CARPETAZO') {
    // El carpetazo sólo lastima si hay una mentira fresca para restregar.
    if (defender.liedLastTurn) {
      multiplier *= DEBATE.CARPETAZO_ON_LIE;
      text = 'Le sacó la carpeta justo después de la promesa. Eso deja marca.';
    } else {
      multiplier *= DEBATE.CARPETAZO_NO_LIE;
      text = 'Sacó una carpeta vieja y no la pudo enganchar con nada. Ruido y nada más.';
    }
  }

  if (family === 'INVOCAR_AL_LIDER') {
    const zoneBonus = leaderMultiplier(ctx.zoneControl);
    multiplier *= zoneBonus;
    text =
      zoneBonus >= 1.3
        ? 'Invocó al líder en su propio bastión: la esquina entera lo aplaudió.'
        : 'Invocó al líder en zona ajena. Se escuchó flojo.';
  }

  if (ctx.affinity) multiplier *= DEBATE.AFFINITY_MULT;

  /* --- precisión --- */
  const accuracy = clamp(
    card.accuracy * (multiplier >= DEBATE.COUNTER_MULT ? 1.08 : 1) - 0.12 * defender.crowdFavor,
    0.2,
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
      heal: 0,
      labiaStolen: 0,
      labiaGained: 0,
      multiplier,
      crowdDelta: -DEBATE.CROWD_SHIFT * (backfired ? 1.6 : 0.6),
      selfStatuses: [],
      enemyStatuses: [],
      liar: false,
      blocksAbility: false,
      labiaSpent: card.cost,
      text: backfired
        ? 'Se le dio vuelta la chicana y quedó pagando delante de todos.'
        : 'Tiró la carta y no pegó. Se escuchó una tos en el fondo.',
    };
  }

  /* --- efectos --- */
  const crowdDefense = 1 - DEBATE.CROWD_DEFENSE * defender.crowdFavor;
  const shield = 1 - shieldOf(defender);
  const scale = (1 + attacker.rhetoric / DEBATE.RHET_SCALE) * multiplier * crowdDefense * shield;

  let damage = 0;
  let heal = 0;
  let labiaStolen = 0;
  let labiaGained = 0;
  let liar = false;
  let blocksAbility = false;
  const selfStatuses: DebateEffect[] = [];
  const enemyStatuses: DebateEffect[] = [];

  for (const effect of card.effects) {
    switch (effect.kind) {
      case 'daño':
      case 'daño_condicional':
        // El piso comprime la brecha entre la carta barata y la épica.
        damage += Math.max(1, Math.round((effect.value + DEBATE.DAMAGE_FLOOR) * scale));
        break;
      case 'curar':
        heal += Math.round(effect.value * (1 + attacker.rhetoric / (DEBATE.RHET_SCALE * 2)));
        break;
      case 'robar_labia':
        labiaStolen += Math.min(effect.value, defender.labia);
        break;
      case 'ganar_labia':
        labiaGained += effect.value;
        break;
      case 'mentira':
        liar = true;
        break;
      case 'bloquear_habilidad':
        blocksAbility = true;
        enemyStatuses.push(effect);
        break;
      case 'silenciar':
      case 'sangrado':
        enemyStatuses.push(effect);
        break;
      case 'escudo':
        selfStatuses.push(effect);
        break;
      case 'favor_publico':
        break;
      default:
        break;
    }
  }

  // Una carta sin efecto de daño explícito usa su poder como daño base.
  if (damage === 0 && !card.effects.some((e) => e.kind === 'curar' || e.kind === 'robar_labia')) {
    damage = Math.max(1, Math.round((card.power + DEBATE.DAMAGE_FLOOR) * scale));
  }

  const crowdFromEffects = card.effects
    .filter((e) => e.kind === 'favor_publico')
    .reduce((sum, e) => sum + e.value, 0);

  if (!text) {
    text =
      damage > 0
        ? `Le metió ${damage} de daño con "${card.name}".`
        : `Jugó "${card.name}" y acomodó las cosas para el turno que viene.`;
  }

  return {
    hit: true,
    backfired: false,
    damage,
    selfDamage: 0,
    heal,
    labiaStolen,
    labiaGained,
    multiplier: Number(multiplier.toFixed(3)),
    crowdDelta: DEBATE.CROWD_SHIFT * multiplier + crowdFromEffects,
    selfStatuses,
    enemyStatuses,
    liar,
    blocksAbility,
    labiaSpent: card.cost,
    text,
  };
};

/** Convierte una resolución en la entrada del registro del duelo. */
export const toLogEntry = (params: {
  turn: number;
  actor: CharacterId;
  card: DebateCard | null;
  resolution: CardResolution | null;
  at: EpochMs;
  text?: string;
}): DebateLogEntry => ({
  turn: params.turn,
  actor: params.actor,
  card: params.card?.slug ?? null,
  family: params.card?.family ?? null,
  hit: params.resolution?.hit ?? false,
  backfired: params.resolution?.backfired ?? false,
  damage: params.resolution?.damage ?? 0,
  heal: params.resolution?.heal ?? 0,
  labiaStolen: params.resolution?.labiaStolen ?? 0,
  multiplier: params.resolution?.multiplier ?? 1,
  effects: (params.card?.effects ?? []).map((e) => e.kind),
  text: params.text ?? params.resolution?.text ?? 'Pasó el turno y tomó aire.',
  at: params.at,
});

/* ------------------------------------------------------------------ */
/* Estados                                                             */
/* ------------------------------------------------------------------ */

/** Aplica el sangrado y descuenta un turno a cada estado activo. */
export const tickStatuses = (side: DebateSide): { bleed: number; expired: DebateEffectKind[] } => {
  let bleed = 0;
  const expired: DebateEffectKind[] = [];
  const survivors: DebateStatus[] = [];

  for (const status of side.statuses) {
    if (status.kind === 'sangrado') bleed += status.value;
    const turnsLeft = status.turnsLeft - 1;
    if (turnsLeft > 0) survivors.push({ ...status, turnsLeft });
    else expired.push(status.kind);
  }

  side.statuses = survivors;
  return { bleed: Math.round(bleed), expired };
};

/** `true` si esa familia está silenciada para ese lado. */
export const isSilenced = (side: DebateSide, family: DebateFamily): boolean =>
  side.statuses.some((s) => s.kind === 'silenciar' && s.family === family && s.turnsLeft > 0);

/** Cartas que se pueden jugar ahora: alcanza la labia, no hay cooldown ni silencio. */
export const playableCards = (side: DebateSide, catalog: ReadonlyMap<string, DebateCard>): string[] =>
  side.hand.filter((slug) => {
    const card = catalog.get(slug);
    if (!card) return false;
    if (card.cost > side.labia) return false;
    if ((side.cooldowns[slug] ?? 0) > 0) return false;
    if (isSilenced(side, card.family)) return false;
    return true;
  });

/* ------------------------------------------------------------------ */
/* Cierre del duelo                                                    */
/* ------------------------------------------------------------------ */

/** Dominancia [0,1]: 1 es ganar sin despeinarse y rápido. */
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
 * Recompensas. Escalan con la dominancia y con la diferencia de rango: ganarle a
 * uno de arriba rinde hasta 1,9×; ganarle a un chopanero, 0,4×.
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
  const rankDiff = input.loser.rankTier - input.winner.rankTier;
  const rankFactor = clamp(1 + 0.12 * rankDiff, 0.4, 1.9);

  const rewards = {
    winnerXp: Math.round(DEBATE.WIN_XP * (0.7 + 0.6 * dominance) * rankFactor),
    loserXp: Math.round(DEBATE.LOSS_XP * (1.3 - 0.5 * dominance)),
    winnerRep: Math.round(DEBATE.WIN_REP * rankFactor * (0.6 + 0.8 * dominance)),
    loserRep: Math.round(DEBATE.LOSS_REP * (input.reason === 'abandono' ? 2 : 1)),
    pot: input.pot,
  };

  return {
    winner: input.winner.charId,
    loser: input.loser.charId,
    draw: false,
    reason: input.reason,
    turns: input.turns,
    dominance,
    rewards,
    ...(input.zoneId && input.winner.factionId
      ? {
          zoneImpact: {
            zoneId: input.zoneId,
            factionId: input.winner.factionId,
            delta: Number((12 * (0.5 + dominance)).toFixed(2)),
          },
        }
      : {}),
  };
};

/** Validación de mazo: tamaño, copias y rango mínimo. */
export const validateDeck = (
  slugs: readonly string[],
  catalog: ReadonlyMap<string, DebateCard>,
  rankTier: RankLevel,
): { ok: boolean; errors: readonly string[] } => {
  const errors: string[] = [];
  if (slugs.length !== DEBATE.DECK_SIZE) {
    errors.push(`El mazo lleva ${DEBATE.DECK_SIZE} cartas (tenés ${slugs.length}).`);
  }
  const counts = new Map<string, number>();
  for (const slug of slugs) {
    const card = catalog.get(slug);
    if (!card) {
      errors.push(`Carta desconocida: ${slug}`);
      continue;
    }
    if (!card.enabled) errors.push(`"${card.name}" ya no está en el catálogo.`);
    if (card.minRank > rankTier) errors.push(`"${card.name}" pide rango ${card.minRank}.`);
    const n = (counts.get(slug) ?? 0) + 1;
    counts.set(slug, n);
    if (n > card.maxCopies) errors.push(`"${card.name}" admite ${card.maxCopies} copia(s).`);
  }
  return { ok: errors.length === 0, errors };
};
