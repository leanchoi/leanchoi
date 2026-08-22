/**
 * Esquel 2027 — Ciclo electoral (mecánica de end-game).
 *
 * Todo el juego corre hacia una fecha: los comicios municipales de Esquel 2027.
 * La fase electoral es estado global del mundo: condiciona misiones, multiplicadores
 * de reputación, qué se puede publicar y qué muestra el HUD.
 *
 * El servidor es la autoridad: calcula la fase en cada tick y la replica dentro de
 * `WorldState.election`. El cliente puede recalcularla localmente (misma función en
 * `/shared/util/election.ts`) para animar la cuenta regresiva entre patches.
 */

import type { IsoDateTime } from './common.ts';

/**
 * Fases del ciclo. `POST_ELECTION` es el estado terminal: el mundo sigue en pie,
 * se muestran resultados y se abre el prestigio/temporada siguiente.
 */
export const ELECTION_PHASES = [
  'PRE_CAMPAIGN',
  'OFFICIAL_CAMPAIGN',
  'VEDA',
  'ELECTION_DAY',
  'POST_ELECTION',
] as const;
export type ElectionPhase = (typeof ELECTION_PHASES)[number];

/** Calendario del comicio. Todos los instantes son absolutos en UTC. */
export interface ElectionCalendar {
  /** Etiqueta visible: `Elecciones Municipales Esquel 2027`. */
  readonly label: string;
  /** Apertura de urnas (08:00 hora de Esquel). */
  readonly opensAt: IsoDateTime;
  /** Cierre de urnas (18:00 hora de Esquel). */
  readonly closesAt: IsoDateTime;
  /** Arranque de la campaña oficial. */
  readonly campaignStartsAt: IsoDateTime;
  /** Inicio de la veda (48 h antes de la apertura). */
  readonly vedaStartsAt: IsoDateTime;
  /** Fin de la veda / cierre del día de comicio. */
  readonly vedaEndsAt: IsoDateTime;
  /** `true` mientras la fecha sea una estimación y no la fecha oficial publicada. */
  readonly estimated: boolean;
}

/** Cuenta regresiva desagregada, lista para pintar en el HUD. */
export interface ElectionCountdown {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  /** Milisegundos totales hasta la apertura de urnas (0 si ya pasó). */
  readonly totalMs: number;
  /** `true` cuando el comicio ya ocurrió. */
  readonly finished: boolean;
}

/** Estado electoral replicado dentro de `WorldState`. */
export interface ElectionState {
  readonly phase: ElectionPhase;
  /** Texto corto para el badge del HUD: `Campaña Abierta`, `Veda`, `¡Se vota!`. */
  readonly badge: string;
  readonly calendar: ElectionCalendar;
  readonly countdown: ElectionCountdown;
  /** Progreso [0,1] del ciclo completo, desde el arranque de campaña al comicio. */
  readonly progress: number;
  /** Multiplicadores que la fase impone sobre el gameplay. */
  readonly modifiers: ElectionPhaseModifiers;
}

/** Cómo altera cada fase el balance. Tabla completa en `/shared/constants/election.ts`. */
export interface ElectionPhaseModifiers {
  /** Multiplicador de XP de misiones. */
  readonly questXp: number;
  /** Multiplicador de ganancia de reputación. */
  readonly repGain: number;
  /** Multiplicador del puntaje territorial. */
  readonly territory: number;
  /** Frecuencia de aparición de misiones Live-Ops. */
  readonly questSpawnRate: number;
  /** `false` durante la veda: se apagan afiches, spots y proselitismo activo. */
  readonly propagandaAllowed: boolean;
  /** `false` durante la veda: no se publican cortes de intención de voto. */
  readonly pollsPublishable: boolean;
  /** `true` sólo el día del comicio: habilita votar en las urnas del juego. */
  readonly votingOpen: boolean;
}
