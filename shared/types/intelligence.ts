/**
 * Esquel 2027 — Motor de Inteligencia Política: qué se deriva y qué se publica.
 *
 * La separación con `telemetry.ts` es deliberada y vale la pena entenderla:
 *
 *   telemetry.ts   → el **evento crudo** que emite el cliente (`vote_intent`,
 *                    `sponsor_enter`, …). Formato de entrada, alto volumen.
 *   intelligence.ts→ la **señal agregada** que consume el dashboard
 *                    (`VOTE_INTENTION`, `SPONSOR_INTERACTION`, …). Seis familias,
 *                    ya con k-anonimato y matriz demográfica aplicada.
 *
 * Nadie consulta la tabla cruda desde el dashboard: se consultan estas señales.
 * Es la misma regla que rige el resto del proyecto —el que muestra no decide—
 * aplicada a los datos: el que mira no toca la fuente.
 */

import type {
  AgeBand,
  Barrio,
  FactionId,
  GenderIdentity,
  IsoDate,
  IsoDateTime,
  Unit,
} from './common.ts';
import type { QuestType } from './quests.ts';
import type { TelemetryEventName } from './telemetry.ts';

/* ------------------------------------------------------------------ */
/* 1. Las seis señales                                                 */
/* ------------------------------------------------------------------ */

export const INTEL_SIGNALS = [
  'VOTE_INTENTION',      // a quién votaría hoy, y cuán seguro está
  'FACTION_SHIFT',       // quién se cambió de bando y desde dónde
  'CANDIDATE_OPINION',   // aprobación de una figura representada en el juego
  'BARRIO_HEAT',         // temperatura del barrio: militancia, humor y presencia
  'QUEST_PARTICIPATION', // qué tipo de rosca engancha a qué segmento
  'SPONSOR_INTERACTION', // tránsito, entradas y conversión de los comercios
] as const;
export type IntelSignal = (typeof INTEL_SIGNALS)[number];

export const INTEL_SIGNAL_LABELS: Readonly<Record<IntelSignal, string>> = {
  VOTE_INTENTION: 'Intención de voto',
  FACTION_SHIFT: 'Cambios de bando',
  CANDIDATE_OPINION: 'Opinión sobre candidatos',
  BARRIO_HEAT: 'Temperatura del barrio',
  QUEST_PARTICIPATION: 'Participación en misiones',
  SPONSOR_INTERACTION: 'Auspicios comerciales',
};

/**
 * De qué eventos crudos se alimenta cada señal.
 *
 * Es la única traducción entre las dos capas y vive acá para que agregar un
 * evento nuevo obligue a decidir explícitamente a qué señal aporta (o a
 * ninguna: los eventos de sistema y sesión no alimentan inteligencia política).
 */
export const SIGNAL_SOURCES: Readonly<Record<IntelSignal, readonly TelemetryEventName[]>> = {
  VOTE_INTENTION: ['vote_intent', 'issue_priority'],
  FACTION_SHIFT: ['faction_switch'],
  CANDIDATE_OPINION: ['candidate_reaction', 'news_reaction', 'debate_finish'],
  BARRIO_HEAT: ['cell_enter', 'zone_dwell', 'rally_join', 'poi_visit'],
  QUEST_PARTICIPATION: ['quest_start', 'quest_finish'],
  SPONSOR_INTERACTION: ['sponsor_impression', 'sponsor_enter', 'sponsor_buff_claim', 'sponsor_cta_click'],
};

/** Señal a la que aporta un evento, o `null` si no alimenta ninguna. */
export const signalOfEvent = (event: TelemetryEventName): IntelSignal | null => {
  for (const signal of INTEL_SIGNALS) {
    if (SIGNAL_SOURCES[signal].includes(event)) return signal;
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* 2. Matriz demográfica                                               */
/* ------------------------------------------------------------------ */

/**
 * Franjas de **reporte**. El dato se recolecta con las seis bandas finas de
 * `AgeBand` (que es lo que declara el jugador y lo que guarda la base), y se
 * publica con estas cuatro, que son las que usa cualquier informe político y
 * las que sostienen el k-anonimato: cuatro cubetas se llenan, seis no.
 */
export const AGE_GROUPS = ['16-24', '25-39', '40-59', '60+'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

/** Colapsa la banda fina declarada a la franja de reporte. */
export const ageGroupOf = (band: AgeBand): AgeGroup => {
  switch (band) {
    case '16-17':
    case '18-24':
      return '16-24';
    case '25-34':
      return '25-39';
    case '35-49':
      // 35-49 cae a caballo de dos franjas de reporte; se asigna a 40-59 porque
      // el grueso del padrón de esa banda está por encima de los 40.
      return '40-59';
    case '50-64':
      return '40-59';
    case '65+':
      return '60+';
    default:
      return '25-39';
  }
};

/** Celda de la matriz: el cruce que se publica. Nunca una persona. */
export interface DemographicKey {
  readonly barrio: Barrio;
  readonly ageGroup: AgeGroup;
  readonly gender: GenderIdentity;
}

/** Serializa la celda a una clave estable, para mapas y CSV. */
export const demographicKey = (k: DemographicKey): string => `${k.barrio}|${k.ageGroup}|${k.gender}`;

export interface DemographicCell extends DemographicKey {
  /** Sujetos distintos que aportaron a la celda. */
  readonly n: number;
  readonly value: number;
  /** Margen de error al 95%. */
  readonly moe: number;
  /** `false` si `n < K_ANON_MIN`: el valor va en `null` al salir. */
  readonly publishable: boolean;
}

/** Matriz completa de una señal para un día. */
export interface DemographicMatrix {
  readonly signal: IntelSignal;
  readonly day: IsoDate;
  /** Dimensión libre: facción, candidato, tipo de misión, comercio. */
  readonly dimension: string;
  readonly cells: readonly DemographicCell[];
  /** Sujetos distintos en toda la matriz. */
  readonly totalSubjects: number;
}

/* ------------------------------------------------------------------ */
/* 3. Mapa de calor                                                    */
/* ------------------------------------------------------------------ */

/** Temperatura de un barrio: quién manda, cuánto se milita y qué humor hay. */
export interface BarrioHeat {
  readonly barrio: Barrio;
  /** Facción con más intención de voto declarada. `null` si nadie llega a k. */
  readonly dominantFaction: FactionId | null;
  /** Ventaja del dominante sobre el segundo, en puntos [0,1]. */
  readonly dominanceMargin: Unit;
  /** Militancia: actividad de juego normalizada contra el barrio más activo. */
  readonly militancy: Unit;
  /** Humor social medio [-1,1]. */
  readonly mood: number;
  /** Sujetos distintos vistos en el barrio en la ventana. */
  readonly subjects: number;
  /** `false` si el barrio no llegó al mínimo: se dibuja gris, no se inventa. */
  readonly publishable: boolean;
}

export interface HeatMapSnapshot {
  readonly day: IsoDate;
  readonly generatedAt: IsoDateTime;
  readonly barrios: readonly BarrioHeat[];
  /** Ventana de agregación en días (1 = hoy). */
  readonly windowDays: number;
}

/* ------------------------------------------------------------------ */
/* 4. Proyección electoral                                             */
/* ------------------------------------------------------------------ */

/** Bancas del Concejo Deliberante de Esquel que se renuevan en 2027. */
export const CONCEJO_SEATS = 11 as const;
/** Piso electoral para entrar al reparto de bancas. */
export const CONCEJO_THRESHOLD = 0.03 as const;

export interface FactionProjection {
  readonly factionId: FactionId;
  /** Share ponderado por padrón de barrio [0,1]. */
  readonly share: Unit;
  /** Variación en puntos porcentuales contra el corte anterior. */
  readonly deltaPp: number;
  /** Margen de error al 95%, en puntos [0,1]. */
  readonly moe: Unit;
  /** Bancas proyectadas por D'Hondt. */
  readonly seats: number;
  /** Sujetos distintos que sostienen el número. */
  readonly n: number;
}

export interface ElectoralProjection {
  readonly day: IsoDate;
  readonly generatedAt: IsoDateTime;
  /** Intendencia: gana el que saca más, sin ballotage municipal. */
  readonly mayor: readonly FactionProjection[];
  /** Concejo Deliberante: las mismas listas, repartidas por D'Hondt. */
  readonly council: readonly FactionProjection[];
  readonly undecidedShare: Unit;
  /** Sujetos distintos en toda la proyección. */
  readonly sampleSize: number;
  /** `false` si la muestra no alcanza: el dashboard lo dice, no lo maquilla. */
  readonly publishable: boolean;
}

/* ------------------------------------------------------------------ */
/* 5. Consola Live-Ops                                                 */
/* ------------------------------------------------------------------ */

export const LIVEOPS_COMMANDS = ['NOTICIA_BOMBA', 'SPAWN_QUEST', 'CERRAR_QUEST'] as const;
export type LiveOpsCommandKind = (typeof LIVEOPS_COMMANDS)[number];

/** Noticia inventada por el administrador para agitar el pueblo. */
export interface NewsBomb {
  readonly headline: string;
  readonly body: string;
  /** Sentimiento que carga la noticia [-1,1]. */
  readonly sentiment: number;
  /** Cuánto importa [0,1]: define si dispara misiones sola. */
  readonly salience: Unit;
  readonly topic: string;
  /** Barrio al que apunta; sin él, va a todo el shard. */
  readonly barrio?: Barrio;
  /** Facción salpicada, si la hay. */
  readonly factionId?: FactionId;
}

export type LiveOpsCommand =
  | { readonly kind: 'NOTICIA_BOMBA'; readonly news: NewsBomb }
  | { readonly kind: 'SPAWN_QUEST'; readonly questType: QuestType; readonly barrio?: Barrio; readonly difficulty?: Unit }
  | { readonly kind: 'CERRAR_QUEST'; readonly questId: string };

export interface LiveOpsResult {
  readonly ok: boolean;
  readonly command: LiveOpsCommandKind;
  /** Qué pasó, en criollo, para el log de la consola. */
  readonly text: string;
  readonly questId?: string;
  readonly at: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* 6. Lo que devuelve el backend al dashboard                          */
/* ------------------------------------------------------------------ */

/** Todo lo que el dashboard necesita para pintarse de una sola llamada. */
export interface DashboardSnapshot {
  readonly day: IsoDate;
  readonly generatedAt: IsoDateTime;
  readonly heat: HeatMapSnapshot;
  readonly projection: ElectoralProjection;
  /** Serie de share por facción, del más viejo al más nuevo. */
  readonly trend: readonly {
    readonly day: IsoDate;
    readonly byFaction: Readonly<Record<number, number>>;
    readonly undecided: number;
  }[];
  readonly participation: readonly {
    readonly questType: QuestType;
    readonly starts: number;
    readonly finishes: number;
    readonly completionAvg: Unit;
  }[];
  readonly sponsors: readonly {
    readonly sponsorId: number;
    readonly name: string;
    readonly impressions: number;
    readonly uniqueSubjects: number;
    readonly entries: number;
    readonly buffClaims: number;
  }[];
  /** Población en línea ahora mismo, por shard. */
  readonly live: { readonly online: number; readonly shards: number };
  /** Umbral de k-anonimato vigente en el backend, para mostrarlo en pantalla. */
  readonly kAnonMin: number;
}

/** Formatos de exportación del reporte consolidado. */
export const EXPORT_FORMATS = ['csv', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
