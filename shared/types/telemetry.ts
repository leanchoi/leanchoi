/**
 * Esquel 2027 — Contrato del Motor de Inteligencia Política.
 *
 * Cuatro decisiones técnicas que definen el formato (detalle en
 * `/docs/architecture/privacidad-telemetria.md`):
 *  1. La unidad de análisis es el par (barrio declarado, franja etaria).
 *  2. `TelemetryEvent.subject` es un seudónimo HMAC rotativo, no el user id: así
 *     se cuentan personas distintas sin arrastrar quién es cada una.
 *  3. Sin `telemetryConsent` en el JWT sólo entran los eventos `kind: 'sistema'`.
 *  4. Las agregaciones se publican con k >= 15 (`K_ANON_MIN`); por debajo, `null`.
 */

import type {
  AgeBand,
  Barrio,
  EpochMs,
  FactionId,
  GenderIdentity,
  GridCell,
  IsoDate,
  IsoDateTime,
  PoliticalInterest,
  RankLevel,
  Unit,
  Uuid,
} from './common.ts';
import type { QuestType } from './quests.ts';

/** Pseudónimo rotativo del sujeto (HMAC del user id). 32 hex. */
export type SubjectPseudonym = string;

/** Categorías de evento. Determina la retención y el gating por consentimiento. */
export const TELEMETRY_KINDS = [
  'sistema',      // performance, errores, FPS — sin consentimiento
  'sesion',       // login, tiempo de juego, retención
  'movimiento',   // mapa de calor de recorridos (celda, no coordenada fina)
  'progresion',   // XP, rango, misiones
  'social',       // chat/voz agregado (métricas, nunca contenido)
  'economia',     // gasto in-game, sponsors
  'politico',     // intención de voto, sentimiento, reacción a noticias
  'comercial',    // impresiones y conversiones de comercios patrocinados
] as const;
export type TelemetryKind = (typeof TELEMETRY_KINDS)[number];

/** Nombres de evento estables. El backend rechaza cualquier otro (`allow-list`). */
export const TELEMETRY_EVENTS = [
  // sistema
  'app_boot', 'frame_stats', 'client_error', 'asset_load_fail',
  // sesion
  'session_start', 'session_end', 'onboarding_complete', 'shard_join', 'shard_leave',
  // movimiento
  'cell_enter', 'poi_visit', 'zone_dwell',
  // progresion
  'quest_start', 'quest_finish', 'rank_up', 'debate_finish', 'rally_join',
  // social
  'chat_volume', 'voice_minutes', 'report_submitted',
  // economia
  'shop_purchase', 'item_use', 'money_sink',
  // politico
  'vote_intent', 'issue_priority', 'candidate_reaction', 'news_reaction', 'faction_switch',
  // comercial
  'sponsor_impression', 'sponsor_enter', 'sponsor_buff_claim', 'sponsor_cta_click',
] as const;
export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[number];

/** Contexto compartido por todos los eventos: describe al segmento, no a la persona. */
export interface TelemetryContext {
  readonly barrio: Barrio;
  readonly ageBand: AgeBand;
  readonly gender: GenderIdentity;
  readonly interest: PoliticalInterest;
  readonly factionId?: FactionId;
  readonly rankLevel?: RankLevel;
  /** Celda del mundo donde ocurrió (granularidad de manzana, nunca metros). */
  readonly cell?: GridCell;
  /** Plataforma del cliente. */
  readonly platform: 'desktop' | 'mobile' | 'tablet';
  /** Versión del bundle. */
  readonly clientVersion: string;
  /** Hora local de Esquel al momento del evento (0..23), para estacionalidad. */
  readonly localHour: number;
}

/** Payloads tipados por evento (unión discriminada por `name`). */
export type TelemetryPayload =
  | { readonly name: 'app_boot'; readonly loadMs: number; readonly webgpu: boolean }
  | { readonly name: 'frame_stats'; readonly fpsAvg: number; readonly fpsP1: number; readonly drawCalls: number }
  | { readonly name: 'client_error'; readonly code: string; readonly fatal: boolean }
  | { readonly name: 'asset_load_fail'; readonly asset: string; readonly httpStatus: number }
  | { readonly name: 'session_start'; readonly mode: 'candidato' | 'ciudadano' }
  | { readonly name: 'session_end'; readonly seconds: number; readonly reason: 'logout' | 'timeout' | 'crash' }
  | { readonly name: 'onboarding_complete'; readonly seconds: number; readonly skipped: boolean }
  | { readonly name: 'shard_join'; readonly shard: string }
  | { readonly name: 'shard_leave'; readonly shard: string; readonly seconds: number }
  | { readonly name: 'cell_enter'; readonly cell: GridCell; readonly fromCell?: GridCell }
  | { readonly name: 'poi_visit'; readonly poiId: string; readonly seconds: number }
  | { readonly name: 'zone_dwell'; readonly zoneId: string; readonly seconds: number }
  | { readonly name: 'quest_start'; readonly questType: QuestType; readonly questSlug: string }
  | {
      readonly name: 'quest_finish';
      readonly questType: QuestType;
      readonly questSlug: string;
      readonly outcome: 'completada' | 'parcial' | 'fallada' | 'abandonada' | 'expirada';
      readonly completion: Unit;
      readonly seconds: number;
    }
  | { readonly name: 'rank_up'; readonly from: RankLevel; readonly to: RankLevel; readonly hoursPlayed: number }
  | { readonly name: 'debate_finish'; readonly won: boolean; readonly turns: number; readonly arena: string }
  | { readonly name: 'rally_join'; readonly zoneId: string; readonly headcount: number }
  | { readonly name: 'chat_volume'; readonly messages: number; readonly windowSeconds: number }
  | { readonly name: 'voice_minutes'; readonly minutes: number; readonly peers: number }
  | { readonly name: 'report_submitted'; readonly category: string }
  | { readonly name: 'shop_purchase'; readonly itemSlug: string; readonly centavos: number }
  | { readonly name: 'item_use'; readonly itemSlug: string }
  | { readonly name: 'money_sink'; readonly sink: string; readonly centavos: number }
  /** Intención de voto declarada en una urna in-game o en una encuesta de misión. */
  | {
      readonly name: 'vote_intent';
      readonly targetFaction?: FactionId;
      /** `true` si el jugador eligió "no sé / no voto". */
      readonly undecided: boolean;
      /** Confianza declarada [0,1]. */
      readonly certainty: Unit;
      /** De dónde salió el dato. */
      readonly instrument: 'urna_plaza' | 'censo_vecinal' | 'encuesta_hud' | 'evento';
    }
  /** Prioridad de temas: el jugador ordena problemas del pueblo. */
  | { readonly name: 'issue_priority'; readonly issue: string; readonly rank: number; readonly of: number }
  /** Reacción a una figura/cargo público representado en el juego. */
  | {
      readonly name: 'candidate_reaction';
      readonly candidateSlug: string;
      /** Aprobación [-1,1]. */
      readonly approval: number;
      readonly context: 'debate' | 'spot' | 'npc' | 'noticia';
    }
  /** Reacción a una noticia real que generó una misión. */
  | { readonly name: 'news_reaction'; readonly newsId: string; readonly sentiment: number; readonly acted: boolean }
  | { readonly name: 'faction_switch'; readonly from?: FactionId; readonly to?: FactionId; readonly daysInPrev: number }
  | { readonly name: 'sponsor_impression'; readonly sponsorId: number; readonly seconds: number; readonly distanceM: number }
  | { readonly name: 'sponsor_enter'; readonly sponsorId: number }
  | { readonly name: 'sponsor_buff_claim'; readonly sponsorId: number; readonly buffSlug: string }
  | { readonly name: 'sponsor_cta_click'; readonly sponsorId: number; readonly cta: string };

/**
 * Evento de telemetría. Es el ÚNICO formato aceptado por
 * `POST /api/v1/telemetry/batch` (Hostinger) y por el relay del VPS.
 */
export interface TelemetryEvent<P extends TelemetryPayload = TelemetryPayload> {
  /** Id de evento generado en el cliente; idempotencia de reintentos. */
  readonly eventId: Uuid;
  readonly kind: TelemetryKind;
  readonly name: P['name'];
  /** Pseudónimo rotativo, nunca el user id. */
  readonly subject: SubjectPseudonym;
  /** Sesión de juego (efímera, se descarta a los 30 días). */
  readonly sessionRef: Uuid;
  readonly at: IsoDateTime;
  /** Reloj del servidor al recibirlo (detecta relojes adulterados). */
  readonly receivedAt?: EpochMs;
  readonly context: TelemetryContext;
  readonly payload: P;
  /** Versión del esquema de telemetría; permite migrar sin romper el histórico. */
  readonly schemaVersion: 1;
}

/** Lote enviado por el cliente (máx. 50 eventos, 64 KB). */
export interface TelemetryBatch {
  readonly events: readonly TelemetryEvent[];
  /** Firma HMAC del lote con la clave de sesión: evita inyección desde consola. */
  readonly sig: string;
}

/* ------------------------------------------------------------------------- */
/* Salidas agregadas del Motor de Inteligencia (consumidas por el dashboard)   */
/* ------------------------------------------------------------------------- */

/** Celda de agregación con k-anonimato aplicado. */
export interface IntelCell {
  readonly barrio: Barrio;
  readonly ageBand: AgeBand;
  /** Cantidad de sujetos distintos. `null` en la respuesta si `n < K_ANON_MIN`. */
  readonly n: number;
  /** Valor agregado (share de voto, sentimiento medio, etc.). */
  readonly value: number;
  /** Margen de error estimado (±) al 95%. */
  readonly moe: number;
}

/** Corte de intención de voto por facción. */
export interface VoteIntentionSnapshot {
  readonly day: IsoDate;
  readonly factionId?: FactionId;
  readonly undecidedShare: Unit;
  readonly cells: readonly IntelCell[];
  /** Share global ponderado por padrón estimado de cada barrio. */
  readonly weightedShare: Unit;
  /** Variación en puntos porcentuales contra el corte anterior. */
  readonly deltaPp: number;
}

/** Mapa de sentimiento por barrio para un tema. */
export interface SentimentMap {
  readonly day: IsoDate;
  readonly topic: string;
  /** Sentimiento medio [-1,1] por barrio. */
  readonly byBarrio: Readonly<Partial<Record<Barrio, number>>>;
  readonly sampleSize: number;
}

/** Rendimiento de un comercio patrocinado. */
export interface SponsorReport {
  readonly sponsorId: number;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly impressions: number;
  readonly uniqueSubjects: number;
  readonly entries: number;
  readonly buffClaims: number;
  readonly ctaClicks: number;
  /** Impresiones por franja horaria local (24 posiciones). */
  readonly byHour: readonly number[];
  /** Alcance por barrio, con k-anonimato. */
  readonly byBarrio: readonly IntelCell[];
}

/** Umbral mínimo de k-anonimato. Debe coincidir con el backend PHP. */
export const K_ANON_MIN = 15 as const;
