/**
 * Esquel 2027 — Protocolo de red cliente ↔ servidor autoritativo.
 *
 * Transporte: WebSocket (Colyseus). El estado se replica con @colyseus/schema
 * (delta binario); estos mensajes son los EVENTOS fuera de banda.
 *
 * Convenciones:
 *  - `C2S_*`: intención del cliente. NUNCA es una orden: el servidor valida todo.
 *  - `S2C_*`: hecho ya ocurrido en el servidor. El cliente sólo lo representa.
 *  - Todo mensaje lleva `t` (tick del cliente) para medir RTT y ordenar intents.
 */

import type {
  CharacterId,
  DebateCardSlug,
  EpochMs,
  FactionId,
  SessionId,
  Unit,
  Vec3,
} from '../types/common.ts';
import type { DebateDuel, DebateOutcome } from '../types/debate.ts';
import type { LiveQuest } from '../types/quests.ts';
import type { AvatarAnimation, StatDelta } from '../types/player.ts';

/* ------------------------------------------------------------------ */
/* Cliente → Servidor                                                  */
/* ------------------------------------------------------------------ */

export const C2S = {
  MOVE: 'c2s.move',
  ACTION: 'c2s.action',
  CHAT: 'c2s.chat',
  QUEST_JOIN: 'c2s.quest.join',
  QUEST_ABANDON: 'c2s.quest.abandon',
  QUEST_PROGRESS: 'c2s.quest.progress',
  DEBATE_CHALLENGE: 'c2s.debate.challenge',
  DEBATE_RESPOND: 'c2s.debate.respond',
  DEBATE_PLAY: 'c2s.debate.play',
  DEBATE_PASS: 'c2s.debate.pass',
  DEBATE_FORFEIT: 'c2s.debate.forfeit',
  /** Cierre de una partida del Modo Candidato: el servidor la valida y liquida. */
  CAMPAIGN_SETTLE: 'c2s.campaign.settle',
  /** Alta de misión desde el panel de admin o el webhook de noticias. */
  ADMIN_SPAWN_QUEST: 'c2s.admin.quest',
  /** Lote de telemetría del cliente: viaja por el socket ya autenticado. */
  TELEMETRY_BATCH: 'c2s.telemetry.batch',
  VOICE_SIGNAL: 'c2s.voice.signal',
  VOICE_TOGGLE: 'c2s.voice.toggle',
  REPORT: 'c2s.report',
  PING: 'c2s.ping',
} as const;
export type C2SType = (typeof C2S)[keyof typeof C2S];

/** Input de movimiento: el cliente predice, el servidor reconcilia. */
export interface C2SMove {
  readonly t: number;
  /** Secuencia monótona del input, para la reconciliación. */
  readonly seq: number;
  readonly position: Vec3;
  readonly yaw: number;
  readonly velocity: Vec3;
  readonly locomotion: 'idle' | 'walk' | 'run' | 'sprint' | 'jump' | 'fall';
  /** Animación activa que se replica a los demás. */
  readonly anim: AvatarAnimation;
  readonly indoors: boolean;
}

/** Acciones puntuales del mundo (pegar afiche, cebar mate, repartir volante). */
export interface C2SAction {
  readonly t: number;
  readonly action: 'pegar_afiche' | 'repartir_volante' | 'cebar_mate' | 'tapar_afiche' | 'relevar_bache' | 'encuestar';
  /** Objetivo: slot de afiche, NPC, punto de interés. */
  readonly targetId?: string;
  readonly position: Vec3;
}

export interface C2SChat {
  readonly t: number;
  readonly text: string;
  readonly channel: 'local' | 'faccion' | 'global';
}


export interface C2SDebateChallenge {
  readonly t: number;
  readonly targetCharId: CharacterId;
  /** Apuesta opcional, en centavos. */
  readonly pot?: number;
}

export interface C2SDebateRespond {
  readonly t: number;
  readonly duelId: string;
  readonly accept: boolean;
}

export interface C2SDebatePlay {
  readonly t: number;
  readonly duelId: string;
  readonly card: DebateCardSlug;
  readonly expectedTurn: number;
}


/** Señalización WebRTC para la malla de voz por proximidad. */
export interface C2SVoiceSignal {
  readonly t: number;
  readonly to: SessionId;
  readonly kind: 'offer' | 'answer' | 'ice';
  /** SDP o candidato ICE serializado. El servidor sólo lo reenvía. */
  readonly payload: string;
}

export interface C2SVoiceToggle {
  readonly t: number;
  readonly enabled: boolean;
}

export interface C2SReport {
  readonly t: number;
  readonly targetSessionId: SessionId;
  readonly category: 'insultos' | 'spam' | 'trampa' | 'nombre' | 'otro';
  readonly note?: string;
}

/* ------------------------------------------------------------------ */
/* Servidor → Cliente                                                  */
/* ------------------------------------------------------------------ */

export const S2C = {
  WELCOME: 's2c.welcome',
  AOI: 's2c.aoi',
  RECONCILE: 's2c.reconcile',
  STAT_DELTA: 's2c.stat.delta',
  CHAT: 's2c.chat',
  TOAST: 's2c.toast',
  QUEST_ANNOUNCED: 's2c.quest.announced',
  QUEST_UPDATED: 's2c.quest.updated',
  QUEST_RESULT: 's2c.quest.result',
  QUEST_PROGRESS: 's2c.quest.progress',
  ZONES: 's2c.zones',
  CAMPAIGN_RESULT: 's2c.campaign.result',
  DEBATE_INVITE: 's2c.debate.invite',
  DEBATE_STATE: 's2c.debate.state',
  DEBATE_RESULT: 's2c.debate.result',
  RANK_UP: 's2c.rank.up',
  ZONE_FLIP: 's2c.zone.flip',
  VOICE_PEERS: 's2c.voice.peers',
  VOICE_SIGNAL: 's2c.voice.signal',
  KICK: 's2c.kick',
  PONG: 's2c.pong',
} as const;
export type S2CType = (typeof S2C)[keyof typeof S2C];

export interface S2CWelcome {
  readonly sessionId: SessionId;
  readonly charId: CharacterId;
  readonly serverTime: EpochMs;
  readonly protocolVersion: string;
  /** URL del índice de prefabs a descargar para este shard. */
  readonly prefabIndexUrl: string;
  readonly tickRate: number;
  /** Radio de interés en manzanas: más allá de esto no llegan paquetes. */
  readonly aoiCells: number;
  /** Punto de aparición asignado por el servidor. */
  readonly spawn: Vec3;
}

/**
 * Instantánea de los vecinos dentro del radio de interés.
 *
 * Es el canal de alta frecuencia del juego: 10 veces por segundo, y **sólo** con
 * los jugadores que están a menos de `AOI_CELLS` manzanas. El estado replicado de
 * Colyseus lleva el padrón (quién está y en qué manzana); las coordenadas finas
 * viajan por acá, que es lo que de verdad consume ancho de banda.
 */
export interface S2CAoi {
  readonly tick: number;
  readonly t: EpochMs;
  readonly players: readonly {
    readonly sessionId: SessionId;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly anim: AvatarAnimation;
    /** `true` si está transmitiendo por voz en este instante. */
    readonly voz: boolean;
  }[];
}

/** Corrección de posición cuando el cliente se desvía más de la tolerancia. */
export interface S2CReconcile {
  readonly seq: number;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly reason: 'deriva' | 'colision' | 'anticheat' | 'teleport';
}

export interface S2CChat {
  readonly from: SessionId;
  readonly nick: string;
  readonly text: string;
  readonly channel: 'local' | 'faccion' | 'global' | 'sistema';
  readonly at: EpochMs;
}

export interface S2CToast {
  readonly kind: 'info' | 'exito' | 'alerta' | 'error';
  readonly text: string;
  readonly ttlMs: number;
}

export interface S2CQuestAnnounced {
  readonly quest: LiveQuest;
}

export interface S2CQuestUpdated {
  readonly questId: string;
  readonly headcount: Readonly<Record<string, number>>;
  readonly leadingFaction?: FactionId;
  readonly myCompletion?: Unit;
}

/** Avance de los objetivos de una misión, para el rastreador del HUD. */
export interface S2CQuestProgress {
  readonly questId: string;
  readonly counters: Readonly<Record<string, number>>;
  readonly completion: number;
  readonly finished: boolean;
}

/** Foto de las cinco zonas de disputa: quién manda y cuánto le falta al rival. */
export interface S2CZones {
  readonly zones: readonly {
    readonly id: string;
    readonly name: string;
    readonly centerX: number;
    readonly centerZ: number;
    readonly radiusM: number;
    /** 0 = sin dueño. */
    readonly controlledBy: number;
    readonly leadShare: number;
    readonly holdSeconds: number;
    readonly headcount: Readonly<Record<string, number>>;
  }[];
  /** Buff vigente de la facción del jugador. */
  readonly buff: { readonly xp: number; readonly money: number; readonly zones: number };
}

/** Liquidación de una campaña del Modo Candidato. */
export interface S2CCampaignResult {
  readonly ok: boolean;
  readonly xp: number;
  readonly reputation: number;
  readonly money: number;
  readonly text: string;
}

export interface S2CQuestResult {
  readonly questId: string;
  readonly outcome: 'completada' | 'parcial' | 'fallada' | 'abandonada' | 'expirada';
  readonly completion: Unit;
  readonly delta: StatDelta;
}

export interface S2CDebateInvite {
  readonly duelId: string;
  readonly fromCharId: CharacterId;
  readonly fromNick: string;
  readonly pot: number;
  readonly expiresAt: EpochMs;
}

export interface S2CDebateState {
  /** El duelo completo, con la mano oculta del rival ya filtrada. */
  readonly duel: DebateDuel;
}

export interface S2CDebateResult {
  readonly duelId: string;
  readonly outcome: DebateOutcome;
}

export interface S2CRankUp {
  readonly charId: CharacterId;
  readonly from: number;
  readonly to: number;
  readonly unlocks: readonly string[];
}

export interface S2CZoneFlip {
  readonly zoneId: string;
  readonly from?: FactionId;
  readonly to: FactionId;
  readonly share: Unit;
  readonly at: EpochMs;
}


/** Pares de voz que el cliente debe mantener conectados (malla por proximidad). */
export interface S2CVoicePeers {
  readonly peers: readonly {
    readonly sessionId: SessionId;
    readonly charId: CharacterId;
    readonly distanceM: number;
    /** Ganancia sugerida [0,1]; el cliente la aplica al `GainNode`. */
    readonly gain: number;
    /** Paneo estéreo [-1,1] según el ángulo relativo a la cámara. */
    readonly pan: number;
    /** El cliente debe iniciar la oferta SDP (evita ofertas cruzadas). */
    readonly initiator: boolean;
  }[];
}

export interface S2CVoiceSignal {
  readonly from: SessionId;
  readonly kind: 'offer' | 'answer' | 'ice';
  readonly payload: string;
}

export interface S2CKick {
  readonly reason: 'moderacion' | 'anticheat' | 'mantenimiento' | 'duplicado' | 'version';
  readonly message: string;
  readonly until?: EpochMs;
}

/** Mapa tipado mensaje → payload, para tipar `room.send` y `room.onMessage`. */
export interface ProtocolMap {
  [C2S.MOVE]: C2SMove;
  [C2S.ACTION]: C2SAction;
  [C2S.CHAT]: C2SChat;
  [C2S.QUEST_JOIN]: { readonly t: number; readonly questId: string };
  [C2S.QUEST_ABANDON]: { readonly t: number; readonly questId: string };
  [C2S.QUEST_PROGRESS]: { readonly t: number; readonly questId: string; readonly objectiveId: string; readonly amount: number };
  [C2S.DEBATE_CHALLENGE]: C2SDebateChallenge;
  [C2S.DEBATE_RESPOND]: C2SDebateRespond;
  [C2S.DEBATE_PLAY]: C2SDebatePlay;
  [C2S.DEBATE_PASS]: { readonly t: number; readonly duelId: string };
  [C2S.DEBATE_FORFEIT]: { readonly t: number; readonly duelId: string };
  [C2S.CAMPAIGN_SETTLE]: { readonly t: number; readonly result: unknown };
  [C2S.ADMIN_SPAWN_QUEST]: { readonly t: number; readonly request: unknown };
  [C2S.VOICE_SIGNAL]: C2SVoiceSignal;
  [C2S.VOICE_TOGGLE]: C2SVoiceToggle;
  [C2S.REPORT]: C2SReport;
  [C2S.PING]: { readonly t: number };
  [S2C.WELCOME]: S2CWelcome;
  [S2C.AOI]: S2CAoi;
  [S2C.RECONCILE]: S2CReconcile;
  [S2C.STAT_DELTA]: StatDelta;
  [S2C.CHAT]: S2CChat;
  [S2C.TOAST]: S2CToast;
  [S2C.QUEST_ANNOUNCED]: S2CQuestAnnounced;
  [S2C.QUEST_UPDATED]: S2CQuestUpdated;
  [S2C.QUEST_RESULT]: S2CQuestResult;
  [S2C.QUEST_PROGRESS]: S2CQuestProgress;
  [S2C.ZONES]: S2CZones;
  [S2C.CAMPAIGN_RESULT]: S2CCampaignResult;
  [S2C.DEBATE_INVITE]: S2CDebateInvite;
  [S2C.DEBATE_STATE]: S2CDebateState;
  [S2C.DEBATE_RESULT]: S2CDebateResult;
  [S2C.RANK_UP]: S2CRankUp;
  [S2C.ZONE_FLIP]: S2CZoneFlip;
  [S2C.VOICE_PEERS]: S2CVoicePeers;
  [S2C.VOICE_SIGNAL]: S2CVoiceSignal;
  [S2C.KICK]: S2CKick;
  [S2C.PONG]: { readonly t: number; readonly serverTime: EpochMs };
}

/** Versión del protocolo. Mayor distinto ⇒ el cliente debe recargar el bundle. */
export const PROTOCOL_VERSION = '0.1.0' as const;
