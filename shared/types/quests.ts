/**
 * Esquel 2027 — Contrato de Misiones Emergentes (Live-Ops).
 *
 * Una `LiveQuest` es una instancia publicada por el orquestador Live-Ops del VPS
 * a partir de: (a) un `NewsSignal` real de Esquel, (b) el clima/reloj vigente,
 * (c) el estado territorial del shard. El catálogo estático vive en MySQL
 * (`misiones_catalogo`); la instancia vive en memoria y se archiva en
 * `misiones_historial` al cerrarse.
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

/** Las 10 tipologías de misión emergente. */
export const QUEST_TYPES = [
  'afiches_relampago',   // pegar afiches en una arteria antes que el rival
  'volanteada',          // repartir volantes a NPCs/jugadores en una zona
  'mateada_solidaria',   // cebar mates y sostener una ronda X minutos
  'movilizacion_esquina',// sostener presencia coordinada en una esquina clave
  'contracampania',      // tapar/retirar propaganda rival sin ser visto
  'operativo_prensa',    // responder a un periodista NPC: mini-debate exprés
  'caza_baches',         // relevar baches/luminarias y subir el reclamo
  'escrache_debate',     // duelo de debate contra un militante rival
  'censo_vecinal',       // encuesta puerta a puerta (alimenta el motor de inteligencia)
  'emergencia_climatica',// nevada/viento: repartir leña, despejar veredas
] as const;
export type QuestType = (typeof QUEST_TYPES)[number];

/** Cómo se disparó la misión. */
export const QUEST_TRIGGERS = ['noticia', 'clima', 'territorio', 'calendario', 'manual'] as const;
export type QuestTrigger = (typeof QUEST_TRIGGERS)[number];

/** Estado del ciclo de vida de la instancia. */
export const QUEST_STATES = ['anunciada', 'activa', 'en_resolucion', 'cerrada', 'cancelada'] as const;
export type QuestState = (typeof QUEST_STATES)[number];

/** Señal de noticia real, normalizada por `/tools/telemetry-cli` + ingestor del VPS. */
export interface NewsSignal {
  readonly id: string;
  /** Medio de origen (`esquel.gov.ar`, `diario_local`, `radio_local`, `municipio_rss`). */
  readonly source: string;
  readonly headline: string;
  /** Resumen neutralizado (sin nombres propios de personas reales fuera de cargos públicos). */
  readonly summary: string;
  readonly url?: string;
  readonly publishedAt: IsoDateTime;
  /** Temas detectados: `obras`, `seguridad`, `agua`, `nieve`, `turismo`, `presupuesto`… */
  readonly topics: readonly string[];
  /** Barrios mencionados o inferidos. */
  readonly barrios: readonly Barrio[];
  /** Sentimiento del titular [-1,1] (negativo = malas noticias). */
  readonly sentiment: number;
  /** Relevancia [0,1] usada para priorizar qué noticia genera misión. */
  readonly salience: Unit;
}

/** Tipos de objetivo medibles por el servidor. */
export const OBJECTIVE_KINDS = [
  'interactuar',   // usar N veces un punto de interés
  'recolectar',    // juntar N ítems
  'entregar',      // entregar N ítems a NPC/jugador
  'permanecer',    // estar T segundos dentro de un radio
  'alcanzar',      // llegar a una coordenada
  'ganar_debate',  // ganar N duelos
  'encuestar',     // completar N respuestas de censo
  'evitar',        // no ser detectado / no perder salud
] as const;
export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number];

export interface QuestObjective {
  readonly id: string;
  readonly kind: ObjectiveKind;
  /** Texto para el HUD: `"Pegá 12 afiches sobre Av. Alvear"`. */
  readonly label: string;
  /** Cantidad requerida (segundos para `permanecer`). */
  readonly target: number;
  /** Punto de interés involucrado (celda + posición). */
  readonly cell?: GridCell;
  readonly position?: Vec3;
  readonly radiusM?: Meters;
  /** Ítem asociado, para `recolectar`/`entregar`. */
  readonly itemId?: ItemId;
  /** Objetivo opcional: no bloquea el cierre pero da bonus. */
  readonly optional: boolean;
  /** Peso relativo en el cálculo de completitud. */
  readonly weight: number;
}

/** Progreso de un participante sobre los objetivos. */
export interface QuestProgress {
  readonly charId: CharacterId;
  readonly joinedAt: EpochMs;
  /** Progreso por `QuestObjective.id`. */
  readonly counters: Readonly<Record<string, number>>;
  /** Completitud ponderada [0,1]. */
  readonly completion: Unit;
  /** Contribución relativa dentro de una misión grupal [0,1]. */
  readonly contribution: Unit;
  readonly finished: boolean;
}

/** Recompensas base (antes de multiplicadores de clima, rango y buffs). */
export interface QuestRewards {
  readonly xp: number;
  readonly reputation: number;
  readonly money: Centavos;
  readonly items: readonly { readonly itemId: ItemId; readonly qty: number }[];
  /** Aporte al puntaje territorial de la facción del jugador. */
  readonly territoryScore: number;
  /** Aporte al tesoro de la facción, en centavos. */
  readonly factionTreasury: number;
}

/** Requisitos para poder unirse. */
export interface QuestRequirements {
  readonly minRank: RankLevel;
  readonly maxRank?: RankLevel;
  /** Exclusiva de una facción (las de territorio lo suelen ser). */
  readonly factionId?: FactionId;
  /** Restringida a residentes del barrio. */
  readonly barrio?: Barrio;
  /** Reputación mínima (puede ser negativa para misiones turbias). */
  readonly minReputation?: number;
  /** Ítems necesarios en inventario para arrancar. */
  readonly requiredItems: readonly { readonly itemId: ItemId; readonly qty: number }[];
}

/** Instancia viva de misión emergente. */
export interface LiveQuest {
  readonly id: string;
  readonly slug: QuestSlug;
  readonly type: QuestType;
  readonly trigger: QuestTrigger;
  readonly state: QuestState;

  readonly title: string;
  /** Copy in-game, tono satírico local. */
  readonly description: string;
  /** Noticia que la originó, si `trigger === 'noticia'`. */
  readonly news?: NewsSignal;

  /** Dónde ocurre. */
  readonly barrio: Barrio;
  readonly zoneId?: string;
  readonly cells: readonly GridCell[];
  readonly center: Vec3;
  readonly radiusM: Meters;

  /** Ventana temporal (reloj del servidor). */
  readonly announcedAt: EpochMs;
  readonly startsAt: EpochMs;
  readonly endsAt: EpochMs;

  readonly objectives: readonly QuestObjective[];
  readonly requirements: QuestRequirements;
  readonly rewards: QuestRewards;

  /** Grupal: varios jugadores comparten instancia y compiten/cooperan. */
  readonly group: boolean;
  /** Cupo máximo (0 = sin límite). */
  readonly capacity: number;
  /** Participantes actuales por facción, para mostrar la disputa en el mapa. */
  readonly headcount: Readonly<Record<string, number>>;
  /** Facción que lidera el progreso ahora. */
  readonly leadingFaction?: FactionId;
  /** Dificultad [0,1]; escala recompensas y requisitos. */
  readonly difficulty: Unit;
  /** Multiplicador vigente por clima/hora (ver balance-formulas §4). */
  readonly contextMultiplier: number;
}

/** Registro persistido de una participación (fila de `misiones_historial`). */
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
  /** Semilla usada para generar la instancia (reproducibilidad para QA). */
  readonly seed: number;
}

/** Petición del cliente para unirse/abandonar (validada por el servidor). */
export interface QuestJoinIntent {
  readonly questId: string;
}
export interface QuestAbandonIntent {
  readonly questId: string;
  readonly reason?: 'jugador' | 'inactividad';
}
