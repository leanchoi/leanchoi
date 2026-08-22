/**
 * Esquel 2027 — Calendario y balance del ciclo electoral.
 *
 * FECHA: los comicios municipales de Esquel 2027 todavía no tienen fecha oficial
 * publicada. Se toma como estimación el **domingo 13 de junio de 2027**, dentro de
 * la ventana abril-agosto. Está marcada con `estimated: true`; cuando se publique la
 * fecha real se cambia acá (y en `VITE_ELECTION_DAY` del cliente) y todo el sistema
 * —HUD, fases, misiones— se reacomoda solo.
 */

import type { ElectionCalendar, ElectionPhase, ElectionPhaseModifiers } from '../types/election.ts';
import type { IsoDateTime } from '../types/common.ts';

/** Día del comicio, 08:00 hora de Esquel (UTC-3) = 11:00 UTC. */
export const ELECTION_DAY_ISO = '2027-06-13T11:00:00.000Z' as IsoDateTime;

/** Duración del comicio: urnas abiertas de 08:00 a 18:00 hora local. */
export const ELECTION_OPEN_HOURS = 10;

/** La campaña oficial arranca 45 días antes de la apertura de urnas. */
export const CAMPAIGN_LEAD_DAYS = 45;

/** La veda arranca 48 h antes de la apertura y termina con el cierre de urnas. */
export const VEDA_LEAD_HOURS = 48;

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

const shift = (iso: string, ms: number): IsoDateTime =>
  new Date(new Date(iso).getTime() + ms).toISOString() as IsoDateTime;

/** Calendario derivado de `ELECTION_DAY_ISO`. */
export const buildElectionCalendar = (
  electionDayIso: string = ELECTION_DAY_ISO,
  estimated = true,
): ElectionCalendar => ({
  label: 'Elecciones Municipales Esquel 2027',
  opensAt: electionDayIso as IsoDateTime,
  closesAt: shift(electionDayIso, ELECTION_OPEN_HOURS * MS_HOUR),
  campaignStartsAt: shift(electionDayIso, -CAMPAIGN_LEAD_DAYS * MS_DAY),
  vedaStartsAt: shift(electionDayIso, -VEDA_LEAD_HOURS * MS_HOUR),
  vedaEndsAt: shift(electionDayIso, ELECTION_OPEN_HOURS * MS_HOUR),
  estimated,
});

export const ELECTION_CALENDAR: ElectionCalendar = buildElectionCalendar();

/** Etiqueta del badge del HUD por fase. */
export const ELECTION_BADGES: Readonly<Record<ElectionPhase, string>> = {
  PRE_CAMPAIGN: 'Precampaña',
  OFFICIAL_CAMPAIGN: 'Campaña Abierta',
  VEDA: 'Veda Electoral',
  ELECTION_DAY: '¡Se vota!',
  POST_ELECTION: 'Escrutinio',
};

/**
 * Cómo cambia el juego según la fase.
 *
 * La campaña abierta es la temporada alta: más misiones, más XP, más territorio en
 * disputa. La veda apaga la propaganda y los cortes de intención de voto —el juego
 * se pone tenso y silencioso— y el día del comicio todo se juega en las urnas.
 */
export const ELECTION_MODIFIERS: Readonly<Record<ElectionPhase, ElectionPhaseModifiers>> = {
  PRE_CAMPAIGN: {
    questXp: 1.0,
    repGain: 1.0,
    territory: 1.0,
    questSpawnRate: 1.0,
    propagandaAllowed: true,
    pollsPublishable: true,
    votingOpen: false,
  },
  OFFICIAL_CAMPAIGN: {
    questXp: 1.25,
    repGain: 1.2,
    territory: 1.35,
    questSpawnRate: 1.6,
    propagandaAllowed: true,
    pollsPublishable: true,
    votingOpen: false,
  },
  VEDA: {
    questXp: 0.7,
    repGain: 0.8,
    territory: 1.1,
    questSpawnRate: 0.4,
    propagandaAllowed: false,
    pollsPublishable: false,
    votingOpen: false,
  },
  ELECTION_DAY: {
    questXp: 1.5,
    repGain: 1.5,
    territory: 1.5,
    questSpawnRate: 1.2,
    propagandaAllowed: false,
    pollsPublishable: false,
    votingOpen: true,
  },
  POST_ELECTION: {
    questXp: 0.9,
    repGain: 1.0,
    territory: 0.8,
    questSpawnRate: 0.7,
    propagandaAllowed: true,
    pollsPublishable: true,
    votingOpen: false,
  },
};
