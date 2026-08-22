/**
 * Contrato de una tipología de misión.
 *
 * Cada una de las diez sabe tres cosas: **cuándo aparece**, **qué objetivos
 * arma** y **qué evento del mundo la hace avanzar**. El `QuestManager` no sabe
 * nada de afiches ni de bolsones: sólo orquesta.
 */

import type {
  Barrio,
  GridCell,
  LiveQuest,
  NewsSignal,
  QuestObjective,
  QuestType,
  Vec3,
  WeatherCondition,
} from '@esquel/shared';

/** Lo que pasa en la calle y puede hacer avanzar una misión. */
export type QuestEventKind =
  | 'afiche_pegado'
  | 'duelo_ganado'
  | 'bulto_entregado'
  | 'checkpoint'
  | 'obra_avanzada'
  | 'vereda_despejada'
  | 'lenia_entregada'
  | 'pregunta_respondida'
  | 'encuesta_completada'
  | 'presencia'
  | 'credibilidad_baja'
  | 'visto_por_rival';

export interface QuestEvent {
  readonly kind: QuestEventKind;
  readonly charId: string;
  readonly factionId: number;
  readonly rankTier: number;
  readonly at: Vec3;
  /** Cantidad reportada (1 por defecto). */
  readonly amount?: number;
  /** Dato extra: id del checkpoint, del comercio, de la pregunta. */
  readonly ref?: string;
}

/** Contexto que ve la tipología para decidir si aparece y cómo se arma. */
export interface QuestContext {
  readonly now: number;
  readonly weather: WeatherCondition;
  readonly snowCoverage: number;
  readonly windGustKph: number;
  /** Hora local de Esquel, 0..23. */
  readonly localHour: number;
  /** Fase del ciclo electoral. */
  readonly electionPhase: string;
  /** Jugadores conectados por facción. */
  readonly online: Readonly<Record<number, number>>;
  /** Zonas de disputa con su controlador actual. */
  readonly zones: readonly { id: string; name: string; centerX: number; centerZ: number; radiusM: number; controlledBy: number }[];
  /** Noticia que disparó la misión, si viene por webhook. */
  readonly news?: NewsSignal;
}

/** Dónde se planta la misión. */
export interface QuestPlacement {
  readonly barrio: Barrio;
  readonly zoneId?: string;
  readonly center: Vec3;
  readonly radiusM: number;
  readonly cells: readonly GridCell[];
}

export interface QuestBlueprint {
  readonly type: QuestType;
  readonly slug: string;
  /** Título y copy, con el tono del juego. */
  readonly title: string;
  readonly description: (ctx: QuestContext, placement: QuestPlacement) => string;
  /** Rango mínimo para entrar. */
  readonly minRank: number;
  /** Herramienta de carrera que hace falta (megáfono, camioneta…). */
  readonly requiredCareerItem?: string;
  /** Grupal: varios comparten instancia. */
  readonly group: boolean;
  /** Es una carrera contra la facción rival. */
  readonly contested: boolean;
  /** Duración en segundos. */
  readonly durationS: number;
  /** Cupo (0 = sin límite). */
  readonly capacity: number;
  /**
   * `true` si el contexto amerita que aparezca sola. El panel de admin puede
   * forzarla igual.
   */
  readonly autoSpawn: (ctx: QuestContext) => boolean;
  /** Dónde plantarla. */
  readonly place: (ctx: QuestContext, rng: () => number) => QuestPlacement;
  /** Objetivos concretos de esta instancia. */
  readonly objectives: (ctx: QuestContext, placement: QuestPlacement, difficulty: number) => QuestObjective[];
  /** Traduce un evento del mundo en avance de un objetivo. */
  readonly onEvent: (
    event: QuestEvent,
    quest: LiveQuest,
  ) => { objectiveId: string; amount: number; fail?: boolean } | null;
}

/** Ayuda: ¿el evento cayó dentro del radio de la misión? */
export const withinQuest = (event: QuestEvent, quest: LiveQuest): boolean => {
  const dx = event.at.x - quest.center.x;
  const dz = event.at.z - quest.center.z;
  return Math.hypot(dx, dz) <= quest.radiusM;
};

/** Ayuda: objetivo por id. */
export const objectiveOf = (quest: LiveQuest, id: string): QuestObjective | undefined =>
  quest.objectives.find((o) => o.id === id);
