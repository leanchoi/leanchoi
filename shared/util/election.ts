/**
 * Resolución de la fase electoral y de la cuenta regresiva al comicio.
 *
 * La misma función corre en el servidor (autoridad) y en el cliente (para animar el
 * contador entre patches sin pedirle nada al servidor).
 */

import { ELECTION_BADGES, ELECTION_CALENDAR, ELECTION_MODIFIERS } from '../constants/election.ts';
import type {
  ElectionCalendar,
  ElectionCountdown,
  ElectionPhase,
  ElectionState,
} from '../types/election.ts';

const ms = (iso: string): number => new Date(iso).getTime();

/** Fase vigente en un instante dado. */
export const resolveElectionPhase = (
  nowMs: number,
  calendar: ElectionCalendar = ELECTION_CALENDAR,
): ElectionPhase => {
  if (nowMs >= ms(calendar.closesAt)) return 'POST_ELECTION';
  if (nowMs >= ms(calendar.opensAt)) return 'ELECTION_DAY';
  if (nowMs >= ms(calendar.vedaStartsAt)) return 'VEDA';
  if (nowMs >= ms(calendar.campaignStartsAt)) return 'OFFICIAL_CAMPAIGN';
  return 'PRE_CAMPAIGN';
};

/** Cuenta regresiva hasta la apertura de urnas, desagregada para el HUD. */
export const electionCountdown = (
  nowMs: number,
  calendar: ElectionCalendar = ELECTION_CALENDAR,
): ElectionCountdown => {
  const totalMs = Math.max(0, ms(calendar.opensAt) - nowMs);
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalMs,
    finished: totalMs === 0,
  };
};

/**
 * Progreso [0,1] del ciclo: 0 al arrancar la campaña oficial, 1 al abrir las urnas.
 * Antes de la campaña devuelve 0; después del comicio, 1.
 */
export const electionProgress = (
  nowMs: number,
  calendar: ElectionCalendar = ELECTION_CALENDAR,
): number => {
  const from = ms(calendar.campaignStartsAt);
  const to = ms(calendar.opensAt);
  if (nowMs <= from) return 0;
  if (nowMs >= to) return 1;
  return Number(((nowMs - from) / (to - from)).toFixed(4));
};

/** Estado electoral completo, tal como viaja dentro de `WorldState`. */
export const buildElectionState = (
  nowMs: number,
  calendar: ElectionCalendar = ELECTION_CALENDAR,
): ElectionState => {
  const phase = resolveElectionPhase(nowMs, calendar);
  return {
    phase,
    badge: ELECTION_BADGES[phase],
    calendar,
    countdown: electionCountdown(nowMs, calendar),
    progress: electionProgress(nowMs, calendar),
    modifiers: ELECTION_MODIFIERS[phase],
  };
};

/** Formato compacto para el widget: `128d 04:37:12`. */
export const formatCountdown = (c: ElectionCountdown): string => {
  if (c.finished) return '¡Se vota!';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${c.days}d ${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
};
