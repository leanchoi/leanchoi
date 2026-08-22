/**
 * Normalización del clima de Esquel.
 *
 * Vive en `/shared` porque lo usan los dos lados: el VPS (que es la autoridad y
 * lo replica dentro de `WorldState.weather`) y el cliente (que consulta por su
 * cuenta mientras no está conectado a una sala). Una sola tabla de mapeo, una
 * sola climatología de respaldo, cero chance de que muestren cosas distintas.
 */

import { WEATHER_MODIFIERS } from '../constants/balance.ts';
import { clampUnit, type IsoDateTime, type Meters, type Unit, type WeatherCondition } from '../types/common.ts';
import type { WorldWeather } from '../types/world.ts';

/** Observación cruda, ya despegada del formato de cada proveedor. */
export interface WeatherObservation {
  condition: WeatherCondition;
  temperatureC: number;
  feelsLikeC: number;
  /** Humedad relativa [0,1]. */
  humidity: number;
  windKph: number;
  windDirDeg: number;
  windGustKph: number;
  precipMmH: number;
  snowCmH: number;
  /** Cobertura nubosa [0,1]. */
  cloudCover: number;
  visibilityM: number;
}

/** Promedios mensuales de Esquel (enero = índice 0). */
export const ESQUEL_CLIMATOLOGY: readonly { tMax: number; tMin: number; wind: number; snow: boolean }[] = [
  { tMax: 22, tMin: 8, wind: 18, snow: false },
  { tMax: 21, tMin: 7, wind: 17, snow: false },
  { tMax: 18, tMin: 5, wind: 15, snow: false },
  { tMax: 14, tMin: 3, wind: 14, snow: false },
  { tMax: 9, tMin: 0, wind: 13, snow: true },
  { tMax: 6, tMin: -2, wind: 12, snow: true },
  { tMax: 5, tMin: -3, wind: 13, snow: true },
  { tMax: 8, tMin: -2, wind: 15, snow: true },
  { tMax: 11, tMin: 0, wind: 18, snow: true },
  { tMax: 15, tMin: 2, wind: 20, snow: false },
  { tMax: 18, tMin: 5, wind: 20, snow: false },
  { tMax: 21, tMin: 7, wind: 19, snow: false },
];

/** Códigos WMO (Open-Meteo) → condición del juego. */
const WMO_MAP: readonly { max: number; condition: WeatherCondition }[] = [
  { max: 0, condition: 'despejado' },
  { max: 2, condition: 'parcial' },
  { max: 3, condition: 'nublado' },
  { max: 49, condition: 'niebla' },
  { max: 55, condition: 'llovizna' },
  { max: 57, condition: 'aguanieve' },
  { max: 65, condition: 'lluvia' },
  { max: 67, condition: 'aguanieve' },
  { max: 77, condition: 'nieve' },
  { max: 82, condition: 'lluvia' },
  { max: 86, condition: 'nieve' },
  { max: 99, condition: 'tormenta' },
];

export const conditionFromWmo = (code: number): WeatherCondition => {
  for (const row of WMO_MAP) if (code <= row.max) return row.condition;
  return 'nublado';
};

/** Códigos de OpenWeatherMap → condición del juego. */
export const conditionFromOwm = (id: number): WeatherCondition => {
  if (id >= 200 && id < 300) return 'tormenta';
  if (id >= 300 && id < 400) return 'llovizna';
  if (id >= 500 && id < 600) return id >= 511 ? 'aguanieve' : 'lluvia';
  if (id >= 600 && id < 700) return id === 611 || id === 612 || id === 613 ? 'aguanieve' : 'nieve';
  if (id >= 700 && id < 800) return 'niebla';
  if (id === 800) return 'despejado';
  if (id === 801 || id === 802) return 'parcial';
  return 'nublado';
};

/** En la Patagonia el viento manda: por encima de 70 km/h la condición cambia. */
export const applyWindOverride = (condition: WeatherCondition, gustKph: number): WeatherCondition =>
  gustKph >= 70 && (condition === 'despejado' || condition === 'parcial' || condition === 'nublado')
    ? 'viento_fuerte'
    : condition;

/** Nieve acumulada estimada: no todas las APIs la publican. */
export const estimateSnowCoverage = (obs: WeatherObservation): number => {
  if (obs.snowCmH > 0) return clampUnit(0.3 + obs.snowCmH * 0.25);
  if (obs.condition === 'nieve' || obs.condition === 'aguanieve') return 0.45;
  if (obs.temperatureC <= 0 && obs.humidity > 0.7) return 0.25;
  return 0;
};

/** Observación cruda → contrato `WorldWeather`, con sus multiplicadores. */
export const toWorldWeather = (obs: WeatherObservation, stale: boolean): WorldWeather => {
  const condition = applyWindOverride(obs.condition, obs.windGustKph);
  const mods = WEATHER_MODIFIERS[condition];
  return {
    condition,
    temperatureC: Number(obs.temperatureC.toFixed(1)),
    feelsLikeC: Number(obs.feelsLikeC.toFixed(1)),
    humidity: clampUnit(obs.humidity),
    windKph: Number(obs.windKph.toFixed(1)),
    windDirDeg: Math.round(obs.windDirDeg),
    windGustKph: Number(obs.windGustKph.toFixed(1)),
    precipMmH: Number(obs.precipMmH.toFixed(2)),
    snowCmH: Number(obs.snowCmH.toFixed(2)),
    cloudCover: clampUnit(obs.cloudCover),
    snowCoverage: clampUnit(estimateSnowCoverage(obs)) as Unit,
    visibilityM: Math.round(obs.visibilityM) as Meters,
    fetchedAt: new Date().toISOString() as IsoDateTime,
    stale,
    gameplayModifiers: {
      moveSpeed: mods.moveSpeed,
      rallyTurnout: mods.rallyTurnout,
      posterLifetime: mods.posterLifetime,
      outdoorXp: mods.outdoorXp,
    },
  };
};

/** Clima de respaldo cuando el proveedor no contesta: la climatología del mes. */
export const climatologicalFallback = (now = new Date()): WorldWeather => {
  const month = now.getUTCMonth();
  const c = ESQUEL_CLIMATOLOGY[month];
  // Ciclo diario simple: mínima a las 6, máxima a las 15 (hora de Esquel).
  const localHour = ((now.getUTCHours() + 21) % 24) + now.getUTCMinutes() / 60;
  const t = 0.5 - 0.5 * Math.cos(((localHour - 6) / 24) * Math.PI * 2);
  const temperature = c.tMin + (c.tMax - c.tMin) * t;
  const cold = temperature < 2;
  return toWorldWeather(
    {
      condition: c.snow && cold ? 'nieve' : c.wind >= 20 ? 'viento_fuerte' : 'parcial',
      temperatureC: temperature,
      feelsLikeC: temperature - c.wind / 12,
      humidity: 0.6,
      windKph: c.wind,
      windDirDeg: 270, // viento del oeste, siempre
      windGustKph: c.wind * 1.8,
      precipMmH: 0,
      snowCmH: c.snow && cold ? 0.4 : 0,
      cloudCover: 0.5,
      visibilityM: 20000,
    },
    true,
  );
};

/** URL de Open-Meteo para las coordenadas dadas (no necesita clave). */
export const openMeteoUrl = (lat: number, lon: number): string =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,snowfall,weather_code,' +
  'cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&timezone=UTC';

/** Respuesta de Open-Meteo, sólo los campos que se usan. */
export interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    snowfall?: number;
    weather_code?: number;
    cloud_cover?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
    visibility?: number;
  };
}

/** Open-Meteo → observación cruda. */
export const parseOpenMeteo = (data: OpenMeteoResponse): WeatherObservation => {
  const c = data.current ?? {};
  return {
    condition: conditionFromWmo(c.weather_code ?? 3),
    temperatureC: c.temperature_2m ?? 10,
    feelsLikeC: c.apparent_temperature ?? c.temperature_2m ?? 10,
    humidity: (c.relative_humidity_2m ?? 60) / 100,
    windKph: c.wind_speed_10m ?? 0,
    windDirDeg: c.wind_direction_10m ?? 270,
    windGustKph: c.wind_gusts_10m ?? (c.wind_speed_10m ?? 0) * 1.5,
    precipMmH: c.precipitation ?? 0,
    snowCmH: c.snowfall ?? 0,
    cloudCover: (c.cloud_cover ?? 50) / 100,
    visibilityM: c.visibility ?? 20000,
  };
};
