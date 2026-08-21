/**
 * Esquel 2027 — Contrato de Duelos de Debate y Chicana.
 *
 * El duelo es un combate retórico por turnos, autoritativo en el VPS.
 * Tres recursos enfrentados: CREDIBILIDAD (vida), RETÓRICA (ataque) y
 * ARGUMENTOS (recurso por turno, "aire"). La resolución matemática completa
 * está en `/docs/game-design/balance-formulas.md` §3 y su implementación de
 * referencia en `/shared/util/debate.ts`.
 */

import type {
  CharacterId,
  DebateCardSlug,
  EpochMs,
  FactionId,
  RankLevel,
  Unit,
} from './common.ts';

/** Familias de carta. La rueda de ventajas se define en `DEBATE_COUNTERS`. */
export const DEBATE_FAMILIES = [
  'chicana',
  'archivo_historico',
  'promesa_inviable',
  'chanchullo',
  'invocar_al_lider',
  'dato_duro',
  'empatia_vecinal',
  'defensa',
] as const;
export type DebateFamily = (typeof DEBATE_FAMILIES)[number];

/**
 * Rueda de ventajas (piedra-papel-tijera extendida).
 * `DEBATE_COUNTERS[a]` = familias sobre las que `a` obtiene el bonus de contraataque.
 */
export const DEBATE_COUNTERS: Readonly<Record<DebateFamily, readonly DebateFamily[]>> = {
  chicana: ['promesa_inviable', 'empatia_vecinal'],
  archivo_historico: ['chicana', 'invocar_al_lider'],
  promesa_inviable: ['dato_duro', 'defensa'],
  chanchullo: ['archivo_historico', 'dato_duro'],
  invocar_al_lider: ['chanchullo', 'promesa_inviable'],
  dato_duro: ['chicana', 'archivo_historico'],
  empatia_vecinal: ['chanchullo', 'invocar_al_lider'],
  defensa: ['chicana', 'chanchullo'],
} as const;

export const DEBATE_RARITIES = ['comun', 'infrecuente', 'rara', 'epica', 'mitica'] as const;
export type DebateRarity = (typeof DEBATE_RARITIES)[number];

/** Efectos secundarios aplicables por una carta. */
export const DEBATE_EFFECT_KINDS = [
  'silenciar',        // el rival no puede jugar una familia el próximo turno
  'robar_argumento',  // roba "aire" al rival
  'escudo',           // reduce el próximo golpe recibido
  'reflejar',         // devuelve parte del daño
  'sangrado',         // daño por turno a la credibilidad
  'inspirar',         // sube la retórica propia
  'desmentir',        // anula el efecto activo del rival
  'robar_publico',    // transfiere favor del público
] as const;
export type DebateEffectKind = (typeof DEBATE_EFFECT_KINDS)[number];

export interface DebateEffect {
  readonly kind: DebateEffectKind;
  /** Magnitud del efecto; su unidad depende del `kind` (puntos o factor). */
  readonly value: number;
  /** Turnos de duración. `0` = instantáneo. */
  readonly turns: number;
  /** Familia afectada, para `silenciar`. */
  readonly family?: DebateFamily;
  /** Probabilidad de aplicarse [0,1]. Default `1`. */
  readonly chance?: Unit;
}

/**
 * Definición inmutable de una carta (catálogo, tabla `cartas_debate`).
 * El servidor jamás confía en la copia del cliente: valida contra su catálogo.
 */
export interface DebateCard {
  readonly slug: DebateCardSlug;
  readonly name: string;
  /** Texto de sabor, en clave humorística local. */
  readonly flavor: string;
  readonly family: DebateFamily;
  readonly rarity: DebateRarity;

  /** Coste en ARGUMENTOS (aire) para jugarla. */
  readonly cost: number;
  /** Daño base a la CREDIBILIDAD del rival. */
  readonly power: number;
  /** Precisión base [0,1]; el fallo cuesta el turno y regala favor del público. */
  readonly accuracy: Unit;
  /** Riesgo de contragolpe [0,1]: si sale, el rival roba iniciativa. */
  readonly backfire: Unit;
  /** Efectos aplicados al impactar. */
  readonly effects: readonly DebateEffect[];

  /** Rango militante mínimo para llevarla en el mazo. */
  readonly minRank: RankLevel;
  /** Facción con afinidad: +10% de poder si el portador milita ahí. */
  readonly factionAffinity?: FactionId;
  /** Turnos de recarga tras usarla dentro del mismo duelo. */
  readonly cooldown: number;
  /** Copias máximas por mazo. */
  readonly maxCopies: number;
  /** Icono en el atlas de cartas. */
  readonly icon: string;
  /** `false` cuando se retira del catálogo sin borrar historial. */
  readonly enabled: boolean;
}

/** Mazo del jugador: 12 cartas exactas, validado por el servidor al iniciar el duelo. */
export interface DebateDeck {
  readonly charId: CharacterId;
  readonly name: string;
  readonly cards: readonly DebateCardSlug[];
  readonly updatedAt: EpochMs;
}

/** Escenarios de duelo; modifican el peso del público y los recursos iniciales. */
export const DEBATE_ARENAS = [
  'esquina',          // duelo callejero improvisado
  'plaza_san_martin', // público numeroso, la reputación pesa más
  'radio_local',      // sin público visual, la credibilidad pesa más
  'concejo',          // formal: la chicana se penaliza
  'asado',            // informal: la empatía se premia
] as const;
export type DebateArena = (typeof DEBATE_ARENAS)[number];

/** Estado por combatiente dentro del duelo. */
export interface DebateSide {
  readonly charId: CharacterId;
  readonly nick: string;
  readonly factionId?: FactionId;
  readonly rankLevel: RankLevel;

  /** CREDIBILIDAD restante (vida). Llegar a 0 = derrota. */
  readonly credibility: number;
  readonly credibilityMax: number;
  /** RETÓRICA: escala el daño de las cartas. */
  readonly rhetoric: number;
  /** ARGUMENTOS disponibles este turno (aire). */
  readonly arguments: number;
  readonly argumentsMax: number;

  /** Mano actual (sólo se envía al dueño; al rival se manda el `handSize`). */
  readonly hand?: readonly DebateCardSlug[];
  readonly handSize: number;
  readonly deckRemaining: number;
  readonly discard: readonly DebateCardSlug[];

  /** Efectos activos sobre este lado. */
  readonly statuses: readonly (DebateEffect & { readonly turnsLeft: number })[];
  /** Cooldowns vigentes por carta. */
  readonly cooldowns: Readonly<Record<string, number>>;
  /** Favor del público [0,1]; la suma de ambos lados es 1. */
  readonly crowdFavor: Unit;
  /** Se quedó sin tiempo de turno (30 s) y pasó automáticamente. */
  readonly timedOut: boolean;
}

/** Duelo en curso, replicado a ambos participantes y a los espectadores. */
export interface DebateDuel {
  readonly id: string;
  readonly arena: DebateArena;
  readonly startedAt: EpochMs;
  /** Turno actual (1-based). Empate técnico al superar `maxTurns`. */
  readonly turn: number;
  readonly maxTurns: number;
  /** `charId` del lado con la iniciativa. */
  readonly activeSide: CharacterId;
  /** Vence el turno del lado activo. */
  readonly turnEndsAt: EpochMs;
  readonly challenger: DebateSide;
  readonly defender: DebateSide;
  /** Semilla del RNG determinista del duelo (auditable en el historial). */
  readonly seed: number;
  readonly log: readonly DebateLogEntry[];
  readonly finished: boolean;
  readonly outcome?: DebateOutcome;
  /** Espectadores presentes: suman peso al favor del público. */
  readonly spectators: number;
}

/** Entrada del log de duelo (también se persiste para auditar el balance). */
export interface DebateLogEntry {
  readonly turn: number;
  readonly actor: CharacterId;
  readonly card: DebateCardSlug;
  readonly hit: boolean;
  readonly backfired: boolean;
  /** Daño efectivo aplicado a la credibilidad rival. */
  readonly damage: number;
  /** Multiplicador de contra (rueda de familias) aplicado. */
  readonly counterMult: number;
  readonly crowdDelta: number;
  readonly effectsApplied: readonly DebateEffectKind[];
  readonly at: EpochMs;
}

/** Resultado y recompensas del duelo. */
export interface DebateOutcome {
  readonly winner?: CharacterId;
  readonly loser?: CharacterId;
  readonly draw: boolean;
  /** Motivo del cierre. */
  readonly reason: 'credibilidad' | 'turnos' | 'abandono' | 'desconexion' | 'moderacion';
  readonly turns: number;
  /** Margen [0,1]: 1 = paliza sin recibir daño. */
  readonly dominance: Unit;
  readonly rewards: {
    readonly winnerXp: number;
    readonly loserXp: number;
    readonly winnerRep: number;
    readonly loserRep: number;
    /** Apuesta de la esquina, en centavos (0 si no hubo). */
    readonly pot: number;
  };
  /** Impacto del duelo sobre el control de la zona donde ocurrió. */
  readonly zoneImpact?: { readonly zoneId: string; readonly delta: number };
}

/** Intent del cliente: jugar una carta. El servidor valida coste, cooldown y mano. */
export interface DebatePlayCardIntent {
  readonly duelId: string;
  readonly card: DebateCardSlug;
  /** Turno esperado; si no coincide, el servidor descarta el intent (anti-lag). */
  readonly expectedTurn: number;
}
