/**
 * Esquel 2027 — Contrato del estado de jugador.
 *
 * `PlayerState` es la unidad replicada por Colyseus (una entrada del mapa
 * `WorldState.players`). Está pensada para serializarse con @colyseus/schema:
 * sólo tipos primitivos, arrays homogéneos y objetos planos anidados.
 *
 * Presupuesto de red: <= 220 bytes por jugador en delta típico (movimiento),
 * <= 1.2 KB en snapshot completo de alta (join).
 */

import type {
  Barrio,
  CharacterId,
  Centavos,
  EpochMs,
  FactionId,
  ItemId,
  Meters,
  Quat,
  RankId,
  RankLevel,
  Radians,
  Reputation,
  SessionId,
  Unit,
  UserId,
  Vec3,
  Xp,
} from './common.ts';

/** Estados de locomoción; dirigen la máquina de animación del cliente. */
export const LOCOMOTION_STATES = [
  'idle',
  'walk',
  'run',
  'sprint',
  'jump',
  'fall',
  'sit',
  'knocked',
  'emote',
] as const;
export type LocomotionState = (typeof LOCOMOTION_STATES)[number];

/**
 * Animación activa del avatar, tal como viaja por la red.
 *
 * Las cuatro primeras son locomoción; las tres últimas son la militancia en acto:
 * cebando un mate en la esquina, pegando un afiche en la columna o parado de manos
 * listo para el duelo de chicanas.
 */
export const AVATAR_ANIMATIONS = ['IDLE', 'WALK', 'RUN', 'JUMP', 'MATE', 'AFICHE', 'DEBATE_READY'] as const;
export type AvatarAnimation = (typeof AVATAR_ANIMATIONS)[number];

/** Traduce el estado de locomoción interno a la animación que se replica. */
export const animationFromLocomotion = (loco: LocomotionState, activity?: PlayerActivity): AvatarAnimation => {
  if (activity === 'debate') return 'DEBATE_READY';
  switch (loco) {
    case 'walk':
      return 'WALK';
    case 'run':
    case 'sprint':
      return 'RUN';
    case 'jump':
    case 'fall':
      return 'JUMP';
    default:
      return 'IDLE';
  }
};

/** Actividad de alto nivel: define qué UI muestra el HUD y qué inputs se aceptan. */
export const PLAYER_ACTIVITIES = [
  'libre',
  'mision',
  'debate',
  'movilizacion',
  'comercio',
  'menu',
  'espectador',
] as const;
export type PlayerActivity = (typeof PLAYER_ACTIVITIES)[number];

/** Fuentes de modificación de stats. Toda mutación autoritativa declara su causa. */
export const STAT_SOURCES = [
  'mision',
  'debate',
  'movilizacion',
  'npc',
  'comercio',
  'sponsor_buff',
  'clima',
  'penalizacion',
  'admin',
  'regeneracion',
] as const;
export type StatSource = (typeof STAT_SOURCES)[number];

/** Apariencia voxel del avatar. Todo índice referencia `/client/src/assets/avatar-atlas.json`. */
export interface AvatarAppearance {
  /** Índice del cuerpo base (altura/contextura en bloques). */
  readonly body: number;
  /** Color de piel en formato `#RRGGBB`. */
  readonly skin: string;
  /** Índice de peinado; `0` = sin pelo. */
  readonly hair: number;
  readonly hairColor: string;
  /** Prenda superior, inferior, calzado y accesorio (0 = ninguno). */
  readonly top: number;
  readonly bottom: number;
  readonly shoes: number;
  readonly accessory: number;
  /** Color primario de facción aplicado a la pechera/pechera de campaña. */
  readonly factionTint: string;
}

/** Buff/debuff temporal (sponsor, clima, consumible, evento). */
export interface ActiveBuff {
  /** Slug del buff: `cafe_melipal_focus`, `frio_patagonico`, `mate_cebado`. */
  readonly slug: string;
  /** Nombre visible en el HUD. */
  readonly label: string;
  /** Multiplicadores aplicados de forma multiplicativa sobre el stat base. */
  readonly modifiers: Readonly<Partial<Record<BuffTarget, number>>>;
  /** Momento de expiración (reloj del servidor). */
  readonly expiresAt: EpochMs;
  /** Comercio patrocinador que lo otorgó, si aplica. */
  readonly sponsorId?: number;
  /** Apilable con otros buffs del mismo slug. */
  readonly stackable: boolean;
}

export const BUFF_TARGETS = [
  'xpGain',
  'repGain',
  'moneyGain',
  'moveSpeed',
  'staminaRegen',
  'debateCredibility',
  'debateRhetoric',
  'questSpeed',
  'voiceRange',
] as const;
export type BuffTarget = (typeof BUFF_TARGETS)[number];

/** Stats visibles en el HUD superior. */
export interface PlayerVitals {
  /** Salud actual [0, max]. Llegar a 0 ⇒ `knocked` + respawn en hospital zonal. */
  readonly health: number;
  readonly healthMax: number;
  /** Energía para correr / pegar afiches. */
  readonly stamina: number;
  readonly staminaMax: number;
  /** Temperatura corporal [0,1]: baja con nieve/viento, sube en interiores. */
  readonly warmth: Unit;
}

/** Progresión política del personaje. */
export interface PlayerProgression {
  readonly xp: Xp;
  /** XP acumulada necesaria para el rango siguiente (0 si ya es rango 10). */
  readonly xpToNext: Xp;
  readonly rank: RankId;
  readonly rankLevel: RankLevel;
  readonly reputation: Reputation;
  /** Lealtad a la facción [0,1]; cae al cambiar de bando y bloquea ascensos. */
  readonly loyalty: Unit;
  /** Militancias completadas hoy (anti-farmeo, se reinicia 05:00 hora Esquel). */
  readonly dailyQuestsDone: number;
}

/** Entrada de inventario replicada (espejo parcial de la tabla `inventario`). */
export interface InventoryEntry {
  readonly itemId: ItemId;
  /** Slug legible, redundante pero evita un fetch al catálogo en el cliente. */
  readonly slug: string;
  readonly qty: number;
  /** Equipado en el slot correspondiente. */
  readonly equipped: boolean;
  /** Durabilidad [0,1] para ítems consumibles por uso (balde de engrudo, megáfono). */
  readonly durability?: Unit;
}

/** Estado de voz espacial (WebRTC) de un jugador. */
export interface VoiceState {
  /** El jugador tiene el micrófono habilitado y permiso concedido. */
  readonly enabled: boolean;
  /** Está transmitiendo en este instante (para el indicador sobre la cabeza). */
  readonly speaking: boolean;
  /** Silenciado por moderación (el VPS deja de retransmitir su oferta SDP). */
  readonly mutedByMod: boolean;
  /** Radio de audibilidad efectivo en metros (megáfono lo amplía). */
  readonly rangeM: Meters;
}

/**
 * Estado autoritativo de un jugador dentro de una sala.
 * Sólo el servidor lo muta; el cliente envía intents (`/shared/protocol`).
 */
export interface PlayerState {
  /* --- identidad --- */
  readonly sessionId: SessionId;
  readonly userId: UserId;
  readonly charId: CharacterId;
  readonly nick: string;
  readonly factionId?: FactionId;
  readonly barrio: Barrio;
  readonly appearance: AvatarAppearance;

  /* --- transform --- */
  readonly position: Vec3;
  /** Yaw del cuerpo. El pitch de cámara no se replica (es local). */
  readonly yaw: Radians;
  /** Rotación completa sólo para poses especiales (sentado, emotes anclados). */
  readonly rotation?: Quat;
  /** Velocidad lineal en m/s (para interpolación/extrapolación del cliente). */
  readonly velocity: Vec3;
  readonly locomotion: LocomotionState;
  /** `true` mientras el jugador está dentro de un interior (afecta clima/voz). */
  readonly indoors: boolean;

  /* --- stats --- */
  readonly vitals: PlayerVitals;
  readonly money: Centavos;
  readonly progression: PlayerProgression;
  readonly buffs: readonly ActiveBuff[];
  readonly inventory: readonly InventoryEntry[];

  /* --- actividad --- */
  readonly activity: PlayerActivity;
  /** Id de la misión en curso (`misiones_historial.id`), si `activity === 'mision'`. */
  readonly questRunId?: string;
  /** Id del duelo de debate en curso, si `activity === 'debate'`. */
  readonly debateId?: string;
  /** Celda de movilización que está ocupando, si corresponde. */
  readonly rallyZoneId?: string;

  /* --- social --- */
  readonly voice: VoiceState;
  /** Última burbuja de chat emitida (se limpia a los `CHAT_BUBBLE_TTL_MS`). */
  readonly lastChat?: { readonly text: string; readonly at: EpochMs };
  /** AFK detectado por el servidor (sin input > 180 s): deja de contar para territorio. */
  readonly afk: boolean;

  /* --- red --- */
  /** Tick del servidor en el que se calculó este estado. */
  readonly tick: number;
  /** RTT observado, en ms; el cliente lo usa para el indicador de conexión. */
  readonly rttMs: number;
  readonly joinedAt: EpochMs;
}

/** Delta de stats emitido por el servidor para animar el HUD ("+35 XP"). */
export interface StatDelta {
  readonly charId: CharacterId;
  readonly source: StatSource;
  readonly xp?: number;
  readonly reputation?: number;
  readonly money?: Centavos;
  readonly health?: number;
  readonly stamina?: number;
  /** Texto corto para el toast: `"Pegaste 12 afiches en Alvear"`. */
  readonly reason: string;
  readonly at: EpochMs;
}

/** Proyección persistente de `PlayerState` (lo que PHP guarda en `personajes`). */
export interface CharacterPersistence {
  readonly charId: CharacterId;
  readonly userId: UserId;
  readonly nick: string;
  readonly factionId: FactionId | null;
  readonly barrio: Barrio;
  readonly appearance: AvatarAppearance;
  readonly xp: Xp;
  readonly rankLevel: RankLevel;
  readonly reputation: Reputation;
  readonly loyalty: Unit;
  readonly money: Centavos;
  readonly health: number;
  readonly lastPosition: Vec3;
  readonly playtimeSeconds: number;
}
