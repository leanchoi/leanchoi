/**
 * Esquel 2027 — Misiones emergentes (Live-Ops).
 *
 * Una `LiveQuest` es una instancia que publica el orquestador del VPS a partir de
 * cuatro disparadores: el **panel de admin**, un **webhook de noticias** reales de
 * Esquel, el **clima** (si nieva de verdad, nieva en el juego) o el estado del
 * **territorio**.
 *
 * Diez tipologías, y cada una se juega distinto: pegar, juntar gente, discutir,
 * transportar, recorrer, inaugurar, despejar, desafiar, aguantar preguntas y
 * encuestar. El catálogo con los objetivos concretos está en
 * `/server-vps/src/quests/catalog/`.
 */

import type {
  Barrio,
  Centavos,
  CharacterId,
  EpochMs,
  FactionId,
  GridCell,
  IsoDateTime,
  ItemId,
  Meters,
  QuestRunId,
  QuestSlug,
  RankLevel,
  Unit,
  Vec3,
} from './common.ts';

/* ------------------------------------------------------------------ */
/* Las diez tipologías                                                 */
/* ------------------------------------------------------------------ */

export const QUEST_TYPES = [
  'PEGATINA_RELAMPAGO',    // 15 afiches en una manzana antes de que expire el tiempo
  'BANDERAZO_CALLEJERO',   // juntar 5 militantes con bombo y bandera en una esquina
  'OPERACION_DESMENTIDA',  // ganar 3 duelos en el Centro después de un escándalo
  'REPARTO_BARRIAL',       // llevar bolsones del depósito al Badén o a Ceferino
  'CARAVANA_DE_BLOQUES',   // 6 puestos de control sin bajarse de la camioneta
  'CORTE_DE_CINTA',        // inaugurar la obra antes que la oposición
  'TEMPORAL_CORDILLERANO', // nieve real: despejar accesos y repartir leña
  'GUERRA_DE_PUNTEROS',    // desafiar al puntero rival que maneja un comercio
  'CONFERENCIA_PRENSA',    // cinco preguntas de periodistas sin perder la credibilidad
  'SONDEO_VECINAL',        // encuestar a 8 vecinos y traer los datos
] as const;
export type QuestType = (typeof QUEST_TYPES)[number];

/** Nombre corto que ve el jugador. */
export const QUEST_LABELS: Readonly<Record<QuestType, string>> = {
  PEGATINA_RELAMPAGO: 'Pegatina relámpago',
  BANDERAZO_CALLEJERO: 'Banderazo callejero',
  OPERACION_DESMENTIDA: 'Operación desmentida',
  REPARTO_BARRIAL: 'Reparto barrial',
  CARAVANA_DE_BLOQUES: 'Caravana de bloques',
  CORTE_DE_CINTA: 'Corte de cinta',
  TEMPORAL_CORDILLERANO: 'Temporal cordillerano',
  GUERRA_DE_PUNTEROS: 'Guerra de punteros',
  CONFERENCIA_PRENSA: 'Conferencia de prensa',
  SONDEO_VECINAL: 'Sondeo vecinal',
};

/** De dónde salió la misión. */
export const QUEST_TRIGGERS = ['noticia', 'clima', 'territorio', 'calendario', 'admin'] as const;
export type QuestTrigger = (typeof QUEST_TRIGGERS)[number];

/** Ciclo de vida de la instancia. */
export const QUEST_STATES = ['anunciada', 'activa', 'en_resolucion', 'cerrada', 'cancelada'] as const;
export type QuestState = (typeof QUEST_STATES)[number];

/* ------------------------------------------------------------------ */
/* Señal de noticia                                                    */
/* ------------------------------------------------------------------ */

/** Noticia real normalizada, tal como entra por el webhook. */
export interface NewsSignal {
  readonly id: string;
  /** Medio de origen (`municipio_rss`, `diario_local`, `radio_local`, `admin`). */
  readonly source: string;
  readonly headline: string;
  readonly summary: string;
  readonly url?: string;
  readonly publishedAt: IsoDateTime;
  /** Temas detectados: `obras`, `agua`, `nieve`, `seguridad`, `presupuesto`… */
  readonly topics: readonly string[];
  readonly barrios: readonly Barrio[];
  /** Sentimiento del titular [-1,1]. */
  readonly sentiment: number;
  /** Relevancia [0,1]: decide si amerita misión. */
  readonly salience: Unit;
  /** Facción salpicada, si la noticia apunta a alguien. */
  readonly targetFaction?: FactionId;
}

/* ------------------------------------------------------------------ */
/* Objetivos                                                           */
/* ------------------------------------------------------------------ */

/** Lo que el servidor sabe medir. Cada tipología usa dos o tres. */
export const OBJECTIVE_KINDS = [
  'pegar',        // pegar afiches en los slots de una manzana
  'concentrar',   // juntar N militantes de tu facción en un radio
  'ganar_duelo',  // ganar N duelos de chicanas
  'transportar',  // llevar N bultos de A a B
  'checkpoint',   // pasar por un puesto de control en orden
  'inaugurar',    // completar la obra antes que el rival
  'despejar',     // limpiar N tramos de vereda o acceso
  'entregar',     // entregar N ítems a vecinos
  'responder',    // aguantar N preguntas de prensa
  'encuestar',    // completar N encuestas
  'permanecer',   // estar T segundos en el radio
  'evitar',       // que no te vean / no perder credibilidad
] as const;
export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number];

export interface QuestObjective {
  readonly id: string;
  readonly kind: ObjectiveKind;
  /** Texto para el HUD: `"Pegá 15 afiches sobre la manzana de Alvear"`. */
  readonly label: string;
  /** Cantidad requerida (segundos para `permanecer`). */
  readonly target: number;
  readonly cell?: GridCell;
  readonly position?: Vec3;
  readonly radiusM?: Meters;
  readonly itemId?: ItemId;
  /** Orden dentro de una secuencia (caravana). `0` = sin orden. */
  readonly order?: number;
  /** No bloquea el cierre, pero da bonus. */
  readonly optional: boolean;
  /** Peso en el cálculo de completitud. */
  readonly weight: number;
}

export interface QuestProgress {
  readonly charId: CharacterId;
  readonly joinedAt: EpochMs;
  /** Progreso por `QuestObjective.id`. */
  readonly counters: Readonly<Record<string, number>>;
  readonly completion: Unit;
  /** Contribución relativa dentro de una misión grupal [0,1]. */
  readonly contribution: Unit;
  readonly finished: boolean;
  /** `true` si falló una condición de `evitar`. */
  readonly failed: boolean;
}

/* ------------------------------------------------------------------ */
/* Recompensas y requisitos                                            */
/* ------------------------------------------------------------------ */

export interface QuestRewards {
  readonly xp: number;
  readonly reputation: number;
  readonly money: Centavos;
  readonly items: readonly { readonly itemId: ItemId; readonly qty: number }[];
  /** Aporte al puntaje territorial de la facción. */
  readonly territoryScore: number;
  readonly factionTreasury: number;
}

export interface QuestRequirements {
  readonly minRank: RankLevel;
  readonly maxRank?: RankLevel;
  readonly factionId?: FactionId;
  readonly barrio?: Barrio;
  readonly minReputation?: number;
  readonly requiredItems: readonly { readonly itemId: ItemId; readonly qty: number }[];
  /** Herramienta de carrera que hace falta (megáfono, camioneta…). */
  readonly requiredCareerItem?: string;
}

/* ------------------------------------------------------------------ */
/* Instancia viva                                                      */
/* ------------------------------------------------------------------ */

export interface LiveQuest {
  readonly id: string;
  readonly slug: QuestSlug;
  readonly type: QuestType;
  readonly trigger: QuestTrigger;
  readonly state: QuestState;

  readonly title: string;
  readonly description: string;
  readonly news?: NewsSignal;

  readonly barrio: Barrio;
  readonly zoneId?: string;
  readonly cells: readonly GridCell[];
  readonly center: Vec3;
  readonly radiusM: Meters;

  readonly announcedAt: EpochMs;
  readonly startsAt: EpochMs;
  readonly endsAt: EpochMs;

  readonly objectives: readonly QuestObjective[];
  readonly requirements: QuestRequirements;
  readonly rewards: QuestRewards;

  /** Grupal: varios comparten instancia y compiten o cooperan. */
  readonly group: boolean;
  readonly capacity: number;
  readonly headcount: Readonly<Record<string, number>>;
  readonly leadingFaction?: FactionId;
  readonly difficulty: Unit;
  /** Multiplicador vigente por clima, hora y fase electoral. */
  readonly contextMultiplier: number;
  /** `true` si es una carrera contra la facción rival (corte de cinta, pegatina). */
  readonly contested: boolean;
}

/** Fila de `misiones_historial`. */
export interface QuestRunRecord {
  readonly id: QuestRunId;
  readonly charId: CharacterId;
  readonly questSlug: QuestSlug;
  readonly questType: QuestType;
  readonly trigger: QuestTrigger;
  readonly barrio: Barrio;
  readonly zoneId?: string;
  readonly startedAt: IsoDateTime;
  readonly endedAt?: IsoDateTime;
  readonly outcome: 'completada' | 'parcial' | 'fallada' | 'abandonada' | 'expirada';
  readonly completion: Unit;
  readonly xpGained: number;
  readonly repGained: number;
  readonly moneyGained: Centavos;
  readonly territoryScore: number;
  readonly seed: number;
}

/* ------------------------------------------------------------------ */
/* Intents                                                             */
/* ------------------------------------------------------------------ */

export interface QuestJoinIntent {
  readonly questId: string;
}

export interface QuestAbandonIntent {
  readonly questId: string;
  readonly reason?: 'jugador' | 'inactividad';
}

/** Avance reportado por el cliente; el servidor lo valida contra el mundo. */
export interface QuestProgressIntent {
  readonly questId: string;
  readonly objectiveId: string;
  readonly amount: number;
  /** Dónde ocurrió, para que el servidor confirme que estaba ahí. */
  readonly at?: Vec3;
}

/** Alta manual desde el panel de admin o el webhook de noticias. */
export interface QuestSpawnRequest {
  readonly type: QuestType;
  readonly barrio?: Barrio;
  readonly zoneId?: string;
  readonly durationS?: number;
  readonly difficulty?: number;
  readonly factionId?: FactionId;
  readonly news?: NewsSignal;
  readonly trigger?: QuestTrigger;
}
