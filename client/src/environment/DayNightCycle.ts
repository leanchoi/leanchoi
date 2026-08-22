/**
 * Ciclo solar de Esquel.
 *
 * La hora del juego es la hora real de Esquel (UTC-3, sin horario de verano) y la
 * posición del sol se calcula con `suncalc` para las coordenadas de la ciudad.
 * En invierno el sol se pone antes de las seis de la tarde y el atardecer dura
 * mucho, con esa luz baja y dorada que se te mete en los ojos por Alvear: eso es
 * lo que reproduce el gradiente de abajo.
 *
 * `/shared/util/time.ts` hace el mismo cálculo del lado del servidor. Acá se usa
 * suncalc porque es más preciso para el azimut y porque el cliente necesita
 * recalcular la posición del sol cada cuadro sin costo.
 */

import SunCalc from 'suncalc';
import { Color, Vector3 } from 'three';
import {
  bearingToWorldRad,
  buildWorldClock,
  ESQUEL_UTC_OFFSET_MINUTES,
  formatMinute,
  type WorldClock,
} from '@esquel/shared';
import { CONFIG } from '../config.ts';

export interface SkyState {
  /** Dirección hacia el sol, normalizada (apunta desde la escena al sol). */
  readonly sunDirection: Vector3;
  /** Elevación solar en grados; negativa de noche. */
  readonly elevationDeg: number;
  /** Azimut geográfico en grados (0 = norte, 90 = este). */
  readonly azimuthDeg: number;
  /** Color de la luz direccional. */
  readonly sunColor: Color;
  /** Intensidad de la direccional: ~0.18 de noche, ~3.0 al mediodía. */
  readonly sunIntensity: number;
  /** Color y fuerza de la luz ambiente (cielo rebotado). */
  readonly ambientColor: Color;
  readonly ambientIntensity: number;
  /** Colores del domo: cenit y horizonte. */
  readonly zenith: Color;
  readonly horizon: Color;
  /** Color de niebla atmosférica. */
  readonly fog: Color;
  /** `true` con el sol bajo el horizonte. */
  readonly night: boolean;
  /** Reloj de Esquel, ya formateado y crudo. */
  readonly clock: WorldClock;
  readonly localTime: string;
  /** Fase visual: útil para el HUD y para decidir efectos. */
  readonly phase: WorldClock['phase'];
  /** Fracción del ciclo diurno [0,1]: 0 = medianoche, 0.5 = mediodía. */
  readonly dayFraction: number;
}

/** Paleta del cielo por altura del sol. Los tonos son de la Patagonia, no genéricos. */
const KEYFRAMES: readonly { elev: number; zenith: number; horizon: number; sun: number; ambient: number }[] = [
  { elev: -18, zenith: 0x05070f, horizon: 0x0b1020, sun: 0x2a3358, ambient: 0x141a2e },
  { elev: -6, zenith: 0x101a35, horizon: 0x2d3355, sun: 0x4a5480, ambient: 0x232a45 },
  { elev: 0, zenith: 0x27436b, horizon: 0xd08a54, sun: 0xff9d5c, ambient: 0x4a4a63 },
  { elev: 6, zenith: 0x3d6ea1, horizon: 0xf0b070, sun: 0xffc078, ambient: 0x7a7a86 },
  { elev: 18, zenith: 0x2f7ec4, horizon: 0xbcd8ea, sun: 0xfff0d0, ambient: 0x9aa9b8 },
  { elev: 45, zenith: 0x1f6fc4, horizon: 0xc9e2f2, sun: 0xfffaf0, ambient: 0xa8bccc },
  { elev: 90, zenith: 0x1a63b8, horizon: 0xd4eaf7, sun: 0xffffff, ambient: 0xb0c4d4 },
];

const lerpColor = (a: number, b: number, t: number): Color => new Color(a).lerp(new Color(b), t);

const sampleSky = (elevationDeg: number): { zenith: Color; horizon: Color; sun: Color; ambient: Color } => {
  const first = KEYFRAMES[0];
  const last = KEYFRAMES[KEYFRAMES.length - 1];
  if (elevationDeg <= first.elev) {
    return {
      zenith: new Color(first.zenith),
      horizon: new Color(first.horizon),
      sun: new Color(first.sun),
      ambient: new Color(first.ambient),
    };
  }
  if (elevationDeg >= last.elev) {
    return {
      zenith: new Color(last.zenith),
      horizon: new Color(last.horizon),
      sun: new Color(last.sun),
      ambient: new Color(last.ambient),
    };
  }
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];
    if (elevationDeg >= a.elev && elevationDeg <= b.elev) {
      const t = (elevationDeg - a.elev) / (b.elev - a.elev);
      return {
        zenith: lerpColor(a.zenith, b.zenith, t),
        horizon: lerpColor(a.horizon, b.horizon, t),
        sun: lerpColor(a.sun, b.sun, t),
        ambient: lerpColor(a.ambient, b.ambient, t),
      };
    }
  }
  return {
    zenith: new Color(last.zenith),
    horizon: new Color(last.horizon),
    sun: new Color(last.sun),
    ambient: new Color(last.ambient),
  };
};

export interface CycleOptions {
  /** Acelera el paso del tiempo. `1` = tiempo real (por defecto). */
  readonly timeScale?: number;
  /** Fuerza una hora local de Esquel (0..24) para pruebas y capturas. */
  readonly forcedHour?: number;
  /** Cobertura nubosa [0,1]: apaga la direccional y levanta la ambiente. */
  readonly cloudCover?: number;
}

export class DayNightCycle {
  private readonly lat: number;
  private readonly lon: number;
  private timeScale: number;
  private forcedHour: number | null;
  private cloudCover = 0;
  /** Desfase acumulado por `timeScale`, en milisegundos. */
  private offsetMs = 0;
  private lastRealMs = Date.now();

  constructor(options: CycleOptions = {}) {
    this.lat = CONFIG.weather.lat;
    this.lon = CONFIG.weather.lon;
    this.timeScale = options.timeScale ?? 1;
    this.forcedHour = options.forcedHour ?? null;
    this.cloudCover = options.cloudCover ?? 0;
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, scale);
  }

  /** Fija una hora local de Esquel; `null` vuelve al tiempo real. */
  setForcedHour(hour: number | null): void {
    this.forcedHour = hour;
  }

  setCloudCover(cover: number): void {
    this.cloudCover = Math.min(1, Math.max(0, cover));
  }

  /** Instante simulado actual. */
  now(): Date {
    const realMs = Date.now();
    if (this.timeScale !== 1) {
      const delta = realMs - this.lastRealMs;
      this.offsetMs += delta * (this.timeScale - 1);
    }
    this.lastRealMs = realMs;

    if (this.forcedHour === null) return new Date(realMs + this.offsetMs);

    // Hora local forzada: se arma el instante UTC equivalente para hoy.
    const base = new Date(realMs + ESQUEL_UTC_OFFSET_MINUTES * 60_000);
    const localMidnightUtc = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
    return new Date(localMidnightUtc + this.forcedHour * 3_600_000 - ESQUEL_UTC_OFFSET_MINUTES * 60_000);
  }

  /** Calcula todo el estado del cielo para el instante actual. */
  sample(): SkyState {
    const date = this.now();
    const pos = SunCalc.getPosition(date, this.lat, this.lon);
    const elevationDeg = (pos.altitude * 180) / Math.PI;
    // SunCalc mide el azimut desde el sur hacia el oeste: +180° lo pasa a brújula.
    const azimuthDeg = (((pos.azimuth * 180) / Math.PI + 180) % 360 + 360) % 360;

    const horizontal = Math.cos(pos.altitude);
    const worldRad = bearingToWorldRad(azimuthDeg);
    const sunDirection = new Vector3(
      Math.sin(worldRad) * horizontal,
      Math.sin(pos.altitude),
      Math.cos(worldRad) * horizontal,
    ).normalize();

    const sky = sampleSky(elevationDeg);
    const night = elevationDeg < -0.83;
    const clock = buildWorldClock(date.getTime(), this.timeScale);

    // La direccional se apaga bajo el horizonte y con nubes.
    // Desde three r155 las luces usan unidades físicas: una direccional de 1.0 deja
    // la escena casi negra, así que el rango útil acá es 0.2 (noche) a 3.0 (mediodía).
    // Dos rampas: el crepúsculo (de -8° a +2°) y el día pleno (de +2° a +18°).
    // Sin saltos en el horizonte: el atardecer patagónico se apaga de a poco.
    const twilight = Math.max(0, Math.min(1, (elevationDeg + 8) / 10));
    const day = Math.max(0, Math.min(1, (elevationDeg - 2) / 16));
    const cloudFactor = 1 - this.cloudCover * 0.5;
    const sunIntensity = (0.18 + twilight * 0.8 + day * 2.0) * cloudFactor;
    const ambientIntensity = 0.5 + twilight * 0.35 + day * 0.35 + this.cloudCover * 0.4;

    const fog = sky.horizon.clone().lerp(sky.zenith, 0.35);
    if (this.cloudCover > 0) fog.lerp(new Color(0x9aa4ad), this.cloudCover * 0.4);

    return {
      sunDirection,
      elevationDeg,
      azimuthDeg,
      sunColor: sky.sun,
      sunIntensity,
      ambientColor: sky.ambient,
      ambientIntensity,
      zenith: sky.zenith,
      horizon: sky.horizon,
      fog,
      night,
      clock,
      localTime: formatMinute(clock.localMinute),
      phase: clock.phase,
      dayFraction: clock.localMinute / 1440,
    };
  }

  /** Horarios de orto y ocaso de hoy, para el HUD. */
  sunTimes(): { sunrise: string; sunset: string } {
    const times = SunCalc.getTimes(this.now(), this.lat, this.lon);
    const fmt = (d: Date): string => {
      if (Number.isNaN(d.getTime())) return '--:--';
      const local = new Date(d.getTime() + ESQUEL_UTC_OFFSET_MINUTES * 60_000);
      return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    };
    return { sunrise: fmt(times.sunrise), sunset: fmt(times.sunset) };
  }
}
