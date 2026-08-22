/**
 * Clima en vivo de Esquel.
 *
 * Consulta una API meteorológica real y la normaliza al contrato `WorldWeather`
 * de `/shared`, que es el mismo que produce el servidor autoritativo. Así el
 * cliente puede arrancar mostrando el clima antes de conectarse al VPS y, cuando
 * llega el primer patch de estado, no hay salto: los dos hablan el mismo idioma.
 *
 * Proveedores:
 *   · `open-meteo`      — sin clave, ideal para desarrollo y para producción chica.
 *   · `openweathermap`  — con clave; usar una restringida por dominio.
 *
 * Si el proveedor falla, entra la climatología: promedios mensuales de Esquel.
 * El juego nunca se queda sin clima; queda marcado `stale: true` y el HUD lo
 * muestra atenuado.
 */

import {
  WEATHER_MODIFIERS,
  clampUnit,
  type IsoDateTime,
  type Meters,
  type Unit,
  type WeatherCondition,
  type WorldWeather,
} from '@esquel/shared';
import { CONFIG, type WeatherProvider } from '../config.ts';

export type WeatherListener = (weather: WorldWeather) => void;

/** Promedios mensuales de Esquel (enero = índice 0). Fuente: climatología local. */
const CLIMATOLOGY: readonly { tMax: number; tMin: number; wind: number; snow: boolean }[] = [
  { tMax: 22, tMin: 8, wind: 18, snow: false }, // ene
  { tMax: 21, tMin: 7, wind: 17, snow: false }, // feb
  { tMax: 18, tMin: 5, wind: 15, snow: false }, // mar
  { tMax: 14, tMin: 3, wind: 14, snow: false }, // abr
  { tMax: 9, tMin: 0, wind: 13, snow: true }, // may
  { tMax: 6, tMin: -2, wind: 12, snow: true }, // jun
  { tMax: 5, tMin: -3, wind: 13, snow: true }, // jul
  { tMax: 8, tMin: -2, wind: 15, snow: true }, // ago
  { tMax: 11, tMin: 0, wind: 18, snow: true }, // sep
  { tMax: 15, tMin: 2, wind: 20, snow: false }, // oct
  { tMax: 18, tMin: 5, wind: 20, snow: false }, // nov
  { tMax: 21, tMin: 7, wind: 19, snow: false }, // dic
];

/** Códigos WMO de Open-Meteo → condiciones del juego. */
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

const conditionFromWmo = (code: number): WeatherCondition => {
  for (const row of WMO_MAP) if (code <= row.max) return row.condition;
  return 'nublado';
};

/** Códigos de OpenWeatherMap (grupo de centena) → condiciones del juego. */
const conditionFromOwm = (id: number): WeatherCondition => {
  if (id >= 200 && id < 300) return 'tormenta';
  if (id >= 300 && id < 400) return 'llovizna';
  if (id >= 500 && id < 600) return id >= 511 ? 'aguanieve' : 'lluvia';
  if (id >= 600 && id < 700) return id === 611 || id === 612 || id === 613 ? 'aguanieve' : 'nieve';
  if (id >= 700 && id < 800) return 'niebla';
  if (id === 800) return 'despejado';
  if (id === 801 || id === 802) return 'parcial';
  return 'nublado';
};

/** El viento manda en la Patagonia: por encima de 70 km/h la condición cambia. */
const applyWindOverride = (condition: WeatherCondition, gustKph: number): WeatherCondition =>
  gustKph >= 70 && (condition === 'despejado' || condition === 'parcial' || condition === 'nublado')
    ? 'viento_fuerte'
    : condition;

interface RawObservation {
  condition: WeatherCondition;
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  windDirDeg: number;
  windGustKph: number;
  precipMmH: number;
  snowCmH: number;
  cloudCover: number;
  visibilityM: number;
}

/** Nieve acumulada estimada: no todas las APIs la publican. */
const estimateSnowCoverage = (obs: RawObservation): number => {
  if (obs.snowCmH > 0) return clampUnit(0.3 + obs.snowCmH * 0.25);
  if (obs.condition === 'nieve' || obs.condition === 'aguanieve') return 0.45;
  if (obs.temperatureC <= 0 && obs.humidity > 0.7) return 0.25;
  return 0;
};

const toWorldWeather = (obs: RawObservation, stale: boolean): WorldWeather => {
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

/** Clima de respaldo, derivado de la climatología del mes en curso. */
export const climatologicalFallback = (now = new Date()): WorldWeather => {
  const month = now.getUTCMonth();
  const c = CLIMATOLOGY[month];
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
      windDirDeg: 270, // el viento del oeste, siempre
      windGustKph: c.wind * 1.8,
      precipMmH: 0,
      snowCmH: c.snow && cold ? 0.4 : 0,
      cloudCover: 0.5,
      visibilityM: 20000,
    },
    true,
  );
};

interface OpenMeteoResponse {
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

interface OwmResponse {
  weather?: { id: number }[];
  main?: { temp?: number; feels_like?: number; humidity?: number };
  wind?: { speed?: number; deg?: number; gust?: number };
  clouds?: { all?: number };
  rain?: { '1h'?: number };
  snow?: { '1h'?: number };
  visibility?: number;
}

const fetchOpenMeteo = async (signal: AbortSignal): Promise<RawObservation> => {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.weather.lat}&longitude=${CONFIG.weather.lon}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,snowfall,weather_code,' +
    'cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&timezone=UTC';
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;
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

const fetchOpenWeather = async (signal: AbortSignal): Promise<RawObservation> => {
  if (!CONFIG.weather.apiKey) throw new Error('falta VITE_OPENWEATHER_API_KEY');
  const url =
    `https://api.openweathermap.org/data/2.5/weather?lat=${CONFIG.weather.lat}&lon=${CONFIG.weather.lon}` +
    `&units=metric&lang=es&appid=${CONFIG.weather.apiKey}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`openweathermap HTTP ${res.status}`);
  const data = (await res.json()) as OwmResponse;
  const windMs = data.wind?.speed ?? 0;
  return {
    condition: conditionFromOwm(data.weather?.[0]?.id ?? 800),
    temperatureC: data.main?.temp ?? 10,
    feelsLikeC: data.main?.feels_like ?? data.main?.temp ?? 10,
    humidity: (data.main?.humidity ?? 60) / 100,
    windKph: windMs * 3.6,
    windDirDeg: data.wind?.deg ?? 270,
    windGustKph: (data.wind?.gust ?? windMs * 1.5) * 3.6,
    precipMmH: data.rain?.['1h'] ?? 0,
    snowCmH: (data.snow?.['1h'] ?? 0) / 10,
    cloudCover: (data.clouds?.all ?? 50) / 100,
    visibilityM: data.visibility ?? 20000,
  };
};

const PROVIDERS: Readonly<Record<WeatherProvider, (signal: AbortSignal) => Promise<RawObservation>>> = {
  'open-meteo': fetchOpenMeteo,
  openweathermap: fetchOpenWeather,
};

export class WeatherService {
  private readonly listeners = new Set<WeatherListener>();
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private current: WorldWeather = climatologicalFallback();
  private started = false;

  /** Último clima conocido. Nunca es `null`: arranca con la climatología. */
  get weather(): WorldWeather {
    return this.current;
  }

  subscribe(listener: WeatherListener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  private emit(weather: WorldWeather): void {
    this.current = weather;
    for (const listener of this.listeners) listener(weather);
  }

  /** Arranca el sondeo periódico. Idempotente. */
  start(): void {
    if (this.started) return;
    this.started = true;
    void this.refresh();
  }

  /** Consulta puntual. Devuelve el clima resultante (real o de respaldo). */
  async refresh(): Promise<WorldWeather> {
    this.controller?.abort();
    this.controller = new AbortController();
    const provider = PROVIDERS[CONFIG.weather.provider] ?? fetchOpenMeteo;
    try {
      const obs = await provider(this.controller.signal);
      this.failures = 0;
      this.emit(toWorldWeather(obs, false));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return this.current;
      this.failures++;
      console.warn(`[clima] proveedor caído (intento ${this.failures}), uso climatología:`, err);
      this.emit(climatologicalFallback());
    }
    this.schedule();
    return this.current;
  }

  /** Reintento con backoff exponencial acotado a una hora. */
  private schedule(): void {
    if (!this.started) return;
    if (this.timer) clearTimeout(this.timer);
    const base = CONFIG.weather.refreshMinutes * 60_000;
    const delay = this.failures === 0 ? base : Math.min(3_600_000, base * 2 ** Math.min(this.failures, 5));
    this.timer = setTimeout(() => void this.refresh(), delay);
  }

  stop(): void {
    this.started = false;
    this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}

/** Instancia compartida. */
export const weatherService = new WeatherService();
