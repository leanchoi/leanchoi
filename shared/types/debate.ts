/**
 * Esquel 2027 — Duelo de Debates y Chicanas.
 *
 * Dos militantes de bandos rivales se cruzan en la vereda y se arma. No hay
 * golpes: hay chicana, carpetazo y promesa inviable. Gana el que deja al otro
 * sin CREDIBILIDAD.
 *
 * DOS RECURSOS
 *   · **Credibilidad** — la vida. De 100 (Chopanero) a 250 (Candidato Provincial).
 *   · **Labia** — la energía. Arranca en 5, se recupera 3 por turno y llega a 12.
 *     Cada carta cuesta labia; pasar el turno recupera de más.
 *
 * SEIS FAMILIAS, cada una con su mecánica propia (nada de "carta que hace daño"):
 *   CHICANA           daño directo, barato y confiable
 *   CARPETAZO         daño masivo SI el rival mintió el turno anterior
 *   PROMESA_INVIABLE  te sube la credibilidad, pero quedás marcado como mentiroso
 *   ROMPER_QUORUM     cancela la habilidad especial del rival y le silencia una familia
 *   CHANCHULLO        le robás labia al contrincante
 *   INVOCAR_AL_LIDER  golpe definitivo, escala con el control de tu facción en la zona
 *
 * El servidor (`/server-vps/src/debate/DebateEngine.ts`) es la autoridad: valida
 * cada jugada, calcula el daño con estas mismas funciones y emite XP y reputación.
 */

import type { CharacterId, DebateCardSlug, EpochMs, FactionId, RankLevel, Unit } from './common.ts';

/* ------------------------------------------------------------------ */
/* Familias                                                            */
/* ------------------------------------------------------------------ */

export const DEBATE_FAMILIES = [
  'CHICANA',
  'CARPETAZO',
  'PROMESA_INVIABLE',
  'ROMPER_QUORUM',
  'CHANCHULLO',
  'INVOCAR_AL_LIDER',
] as const;
export type DebateFamily = (typeof DEBATE_FAMILIES)[number];

/** Cómo se lee cada familia en el HUD. */
export const FAMILY_LABELS: Readonly<Record<DebateFamily, string>> = {
  CHICANA: 'Chicana',
  CARPETAZO: 'Carpetazo',
  PROMESA_INVIABLE: 'Promesa Inviable',
  ROMPER_QUORUM: 'Romper Quórum',
  CHANCHULLO: 'Chanchullo',
  INVOCAR_AL_LIDER: 'Invocar al Líder',
};

/** Color de cada familia en la UI arcade. */
export const FAMILY_COLORS: Readonly<Record<DebateFamily, string>> = {
  CHICANA: '#f2b441',
  CARPETAZO: '#d9534f',
  PROMESA_INVIABLE: '#6fbf73',
  ROMPER_QUORUM: '#74acdf',
  CHANCHULLO: '#b48ce0',
  INVOCAR_AL_LIDER: '#e08b3a',
};

/**
 * Ventajas entre familias. Es corta a propósito: la profundidad del duelo sale de
 * los estados (mentira, silencio, escudo), no de una tabla que hay que memorizar.
 */
export const FAMILY_COUNTERS: Readonly<Record<DebateFamily, readonly DebateFamily[]>> = {
  CHICANA: ['PROMESA_INVIABLE'],
  // El carpetazo NO contrarresta a la promesa por familia: ya la castiga con su
  // multiplicador condicional. Apilar las dos cosas lo volvía imbatible.
  CARPETAZO: ['INVOCAR_AL_LIDER'],
  PROMESA_INVIABLE: ['CHANCHULLO'],
  ROMPER_QUORUM: ['CARPETAZO', 'INVOCAR_AL_LIDER'],
  CHANCHULLO: ['ROMPER_QUORUM'],
  INVOCAR_AL_LIDER: ['CHICANA', 'CHANCHULLO'],
};

export const DEBATE_RARITIES = ['comun', 'infrecuente', 'rara', 'epica'] as const;
export type DebateRarity = (typeof DEBATE_RARITIES)[number];

/* ------------------------------------------------------------------ */
/* Efectos                                                             */
/* ------------------------------------------------------------------ */

export const DEBATE_EFFECT_KINDS = [
  'daño',              // baja credibilidad del rival
  'daño_condicional',  // daño extra si el rival mintió el turno anterior
  'curar',             // recupera credibilidad propia
  'mentira',           // te marca como mentiroso: el carpetazo te va a doler
  'silenciar',         // el rival no puede jugar esa familia por N turnos
  'bloquear_habilidad',// cancela la habilidad especial del rival
  'robar_labia',       // le sacás energía al rival
  'ganar_labia',       // recuperás energía
  'escudo',            // reduce el próximo golpe recibido
  'sangrado',          // daño por turno
  'favor_publico',     // corre el favor de la gente hacia vos
] as const;
export type DebateEffectKind = (typeof DEBATE_EFFECT_KINDS)[number];

export interface DebateEffect {
  readonly kind: DebateEffectKind;
  /** Magnitud; la unidad depende del `kind` (puntos o fracción). */
  readonly value: number;
  /** Turnos que dura. `0` = instantáneo. */
  readonly turns: number;
  /** Familia afectada, para `silenciar`. */
  readonly family?: DebateFamily;
}

/* ------------------------------------------------------------------ */
/* Cartas                                                              */
/* ------------------------------------------------------------------ */

/** Definición inmutable de una carta del catálogo (`cartas_debate` en MySQL). */
export interface DebateCard {
  readonly slug: DebateCardSlug;
  readonly name: string;
  /** Texto de sabor, en criollo. */
  readonly flavor: string;
  readonly family: DebateFamily;
  readonly rarity: DebateRarity;
  /** Coste en labia. */
  readonly cost: number;
  /** Daño o magnitud base. */
  readonly power: number;
  /** Probabilidad de que salga bien [0,1]. */
  readonly accuracy: Unit;
  /** Riesgo de que se te vuelva en contra [0,1]. */
  readonly backfire: Unit;
  readonly effects: readonly DebateEffect[];
  readonly minRank: RankLevel;
  /** Facción con afinidad: +10% de potencia si el que la juega milita ahí. */
  readonly factionAffinity?: FactionId;
  /** Turnos de recarga dentro del mismo duelo. */
  readonly cooldown: number;
  readonly maxCopies: number;
  readonly icon: string;
  readonly enabled: boolean;
}

/** Mazo del jugador: 12 cartas exactas, validado por el servidor al empezar. */
export interface DebateDeck {
  readonly charId: CharacterId;
  readonly name: string;
  readonly cards: readonly DebateCardSlug[];
  readonly updatedAt: EpochMs;
}

/* ------------------------------------------------------------------ */
/* Duelo                                                               */
/* ------------------------------------------------------------------ */

/** Dónde se arma. Cambia el peso del público y los recursos iniciales. */
export const DEBATE_ARENAS = [
  'esquina',           // cruce callejero improvisado
  'plaza_san_martin',  // mucha gente: la reputación pesa más
  'radio_local',       // sin público: manda la credibilidad
  'concejo',           // formal: la chicana se penaliza
  'asado',             // informal: la promesa inviable rinde
] as const;
export type DebateArena = (typeof DEBATE_ARENAS)[number];

/** Estado activo sobre un lado del duelo. */
export interface DebateStatus {
  readonly kind: DebateEffectKind;
  readonly value: number;
  turnsLeft: number;
  readonly family?: DebateFamily;
}

export interface DebateSide {
  readonly charId: CharacterId;
  readonly nick: string;
  readonly factionId?: FactionId;
  readonly rankTier: RankLevel;

  /** CREDIBILIDAD restante. Llegar a 0 es perder. */
  credibility: number;
  readonly credibilityMax: number;
  /** LABIA disponible. */
  labia: number;
  readonly labiaMax: number;
  /** Escala el daño de las cartas. */
  readonly rhetoric: number;

  /** Mano actual. Al rival se le manda sólo `handSize`. */
  hand: DebateCardSlug[];
  handSize: number;
  deck: DebateCardSlug[];
  discard: DebateCardSlug[];

  statuses: DebateStatus[];
  cooldowns: Record<string, number>;
  /** Favor del público [0,1]; entre los dos lados suma 1. */
  crowdFavor: Unit;

  /** `true` si prometió cualquier cosa el turno anterior: el carpetazo lo espera. */
  liedLastTurn: boolean;
  /** `true` si le rompieron el quórum: sin habilidad especial este turno. */
  abilityBlocked: boolean;
  /** Se quedó sin tiempo y pasó automáticamente. */
  timedOut: boolean;
}

export interface DebateLogEntry {
  readonly turn: number;
  readonly actor: CharacterId;
  readonly card: DebateCardSlug | null;
  readonly family: DebateFamily | null;
  readonly hit: boolean;
  readonly backfired: boolean;
  readonly damage: number;
  readonly heal: number;
  readonly labiaStolen: number;
  /** Multiplicador aplicado por familia/condición. */
  readonly multiplier: number;
  readonly effects: readonly DebateEffectKind[];
  /** Frase que se muestra en el registro del duelo. */
  readonly text: string;
  readonly at: EpochMs;
}

export interface DebateDuel {
  readonly id: string;
  readonly arena: DebateArena;
  /** Zona de disputa donde ocurre: define el bonus de `INVOCAR_AL_LIDER`. */
  readonly zoneId?: string;
  readonly startedAt: EpochMs;
  /** Turno actual (1-based). Un turno = juegan los dos. */
  turn: number;
  readonly maxTurns: number;
  /** A quién le toca. */
  activeSide: CharacterId;
  /** Vence el turno del lado activo. */
  turnEndsAt: EpochMs;
  challenger: DebateSide;
  defender: DebateSide;
  /** Semilla del RNG: el duelo entero es reproducible. */
  readonly seed: number;
  log: DebateLogEntry[];
  finished: boolean;
  outcome?: DebateOutcome;
  spectators: number;
}

export interface DebateOutcome {
  readonly winner?: CharacterId;
  readonly loser?: CharacterId;
  readonly draw: boolean;
  readonly reason: 'credibilidad' | 'turnos' | 'abandono' | 'desconexion' | 'moderacion';
  readonly turns: number;
  /** Margen [0,1]: 1 es paliza sin despeinarse. */
  readonly dominance: Unit;
  readonly rewards: {
    readonly winnerXp: number;
    readonly loserXp: number;
    readonly winnerRep: number;
    readonly loserRep: number;
    /** Apuesta de la esquina, en centavos. */
    readonly pot: number;
  };
  /** Lo que el duelo le mueve al control territorial. */
  readonly zoneImpact?: { readonly zoneId: string; readonly factionId: number; readonly delta: number };
}

/* ------------------------------------------------------------------ */
/* Mensajes                                                            */
/* ------------------------------------------------------------------ */

/** Vista del duelo que recibe cada jugador: la mano del rival va oculta. */
export interface DebateView {
  readonly duel: Omit<DebateDuel, 'challenger' | 'defender'> & {
    readonly challenger: Omit<DebateSide, 'hand' | 'deck'> & { readonly hand?: readonly DebateCardSlug[] };
    readonly defender: Omit<DebateSide, 'hand' | 'deck'> & { readonly hand?: readonly DebateCardSlug[] };
  };
  /** `true` si el que mira es el retador. */
  readonly isChallenger: boolean;
  /** Cartas jugables ahora mismo, ya filtradas por labia, cooldown y silencios. */
  readonly playable: readonly DebateCardSlug[];
}

export interface DebatePlayCardIntent {
  readonly duelId: string;
  readonly card: DebateCardSlug;
  /** Turno esperado; si no coincide, el servidor descarta el intent. */
  readonly expectedTurn: number;
}
