/**
 * Reloj y ciclo solar de Esquel.
 *
 * El servidor es la única autoridad: calcula `WorldClock` cada segundo y lo
 * replica. El cliente sólo interpola entre patches para mover el sol suavemente.
 *
 * Modelo solar: algoritmo NOAA simplificado (error < 1° en elevación), suficiente
 * para orientar la luz direccional y las sombras del voxel world.
 */

import { ESQUEL_ORIGIN, ESQUEL_UTC_OFFSET_MINUTES } from '../constants/world.ts';
import type { MinuteOfDay, Season } from '../types/common.ts';
import type { WorldClock } from '../types/world.ts';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Minutos desde medianoche en hora de Esquel. */
export const localMinuteOf = (utcMs: number): MinuteOfDay => {
  const shifted = utcMs + ESQUEL_UTC_OFFSET_MINUTES * 60_000;
  const d = new Date(shifted);
  return (d.getUTCHours() * 60 + d.getUTCMinutes()) as MinuteOfDay;
};

/** Día del año (1..366) en hora local. */
export const dayOfYearOf = (utcMs: number): number => {
  const d = new Date(utcMs + ESQUEL_UTC_OFFSET_MINUTES * 60_000);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
};

/** Estación del hemisferio sur. */
export const seasonOf = (utcMs: number): Season => {
  const m = new Date(utcMs + ESQUEL_UTC_OFFSET_MINUTES * 60_000).getUTCMonth() + 1;
  if (m === 12 || m <= 2) return 'verano';
  if (m <= 5) return 'otonio';
  if (m <= 8) return 'invierno';
  return 'primavera';
};

/** Declinación solar en grados. */
const declinationDeg = (doy: number): number =>
  -23.44 * Math.cos(DEG2RAD * ((360 / 365) * (doy + 10)));

/** Ecuación del tiempo, en minutos. */
const equationOfTimeMin = (doy: number): number => {
  const b = DEG2RAD * ((360 / 365) * (doy - 81));
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
};

export interface SunPosition {
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly sunriseMinute: MinuteOfDay;
  readonly sunsetMinute: MinuteOfDay;
}

/** Posición solar y orto/ocaso para Esquel en un instante dado. */
export const sunPositionAt = (utcMs: number): SunPosition => {
  const doy = dayOfYearOf(utcMs);
  const lat = ESQUEL_ORIGIN.lat;
  const lon = ESQUEL_ORIGIN.lon;
  const decl = declinationDeg(doy);

  // Hora solar verdadera.
  const localMin = localMinuteOf(utcMs);
  const tzOffsetHours = ESQUEL_UTC_OFFSET_MINUTES / 60;
  const timeOffset = equationOfTimeMin(doy) + 4 * lon - 60 * tzOffsetHours;
  const trueSolarMin = localMin + timeOffset;
  const hourAngle = trueSolarMin / 4 - 180;

  const latR = lat * DEG2RAD;
  const declR = decl * DEG2RAD;
  const haR = hourAngle * DEG2RAD;

  const sinEl = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(haR);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl))) * RAD2DEG;

  const cosAz =
    (Math.sin(declR) - Math.sin(latR) * sinEl) / (Math.cos(latR) * Math.cos(Math.asin(sinEl)) || 1e-6);
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD2DEG;
  if (hourAngle > 0) azimuth = 360 - azimuth;

  // Ángulo horario del orto (incluye refracción: -0.833°).
  const cosH0 =
    (Math.cos(90.833 * DEG2RAD) - Math.sin(latR) * Math.sin(declR)) / (Math.cos(latR) * Math.cos(declR));
  let sunrise = 0;
  let sunset = 1439;
  if (cosH0 >= -1 && cosH0 <= 1) {
    const h0 = Math.acos(cosH0) * RAD2DEG;
    sunrise = Math.round(720 - 4 * (lon + h0) - equationOfTimeMin(doy) + 60 * tzOffsetHours);
    sunset = Math.round(720 - 4 * (lon - h0) - equationOfTimeMin(doy) + 60 * tzOffsetHours);
  }
  const clampMin = (m: number): MinuteOfDay => (((m % 1440) + 1440) % 1440) as MinuteOfDay;

  return {
    elevationDeg: elevation,
    azimuthDeg: azimuth,
    sunriseMinute: clampMin(sunrise),
    sunsetMinute: clampMin(sunset),
  };
};

/** Fase visual del día, derivada de la elevación solar. */
export const dayPhaseOf = (elevationDeg: number, rising: boolean): WorldClock['phase'] => {
  if (elevationDeg > 8) return 'dia';
  if (elevationDeg < -6) return 'noche';
  return rising ? 'amanecer' : 'atardecer';
};

/** Construye el `WorldClock` autoritativo. */
export const buildWorldClock = (utcMs: number, timeScale = 1): WorldClock => {
  const sun = sunPositionAt(utcMs);
  const sunLater = sunPositionAt(utcMs + 600_000);
  const local = localMinuteOf(utcMs);
  const localDate = new Date(utcMs + ESQUEL_UTC_OFFSET_MINUTES * 60_000);
  return {
    utc: new Date(utcMs).toISOString() as WorldClock['utc'],
    localMinute: local,
    weekday: localDate.getUTCDay() as WorldClock['weekday'],
    season: seasonOf(utcMs),
    sunElevationDeg: Number(sun.elevationDeg.toFixed(2)),
    sunAzimuthDeg: Number(sun.azimuthDeg.toFixed(2)),
    sunriseMinute: sun.sunriseMinute,
    sunsetMinute: sun.sunsetMinute,
    phase: dayPhaseOf(sun.elevationDeg, sunLater.elevationDeg > sun.elevationDeg),
    timeScale,
  };
};

/** Formatea `MinuteOfDay` como `HH:MM` para el HUD. */
export const formatMinute = (m: number): string => {
  const h = Math.floor(m / 60) % 24;
  const mm = Math.floor(m % 60);
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
