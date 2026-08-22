/**
 * Clima en vivo de Esquel (lado cliente).
 *
 * Consulta el proveedor y normaliza con los helpers de `/shared`, que son los
 * mismos que usa el VPS. Mientras el jugador está conectado a una sala manda el
 * servidor; esta clase cubre el arranque y el modo desconectado, y nunca se queda
 * sin dato: si el proveedor falla, entra la climatología del mes y el HUD lo
 * muestra como estimado.
 *
 * Proveedores: `open-meteo` (sin clave) y `openweathermap` (con clave).
 */

import {
  climatologicalFallback,
  openMeteoUrl,
  parseOpenMeteo,
  conditionFromOwm,
  toWorldWeather,
  type OpenMeteoResponse,
  type WeatherObservation,
  type WorldWeather,
} from '@esquel/shared';
import { CONFIG, type WeatherProvider } from '../config.ts';

export type WeatherListener = (weather: WorldWeather) => void;

/** Se reexporta para que el store pueda pintar algo antes de la primera respuesta. */
export { climatologicalFallback };

interface OwmResponse {
  weather?: { id: number }[];
  main?: { temp?: number; feels_like?: number; humidity?: number };
  wind?: { speed?: number; deg?: number; gust?: number };
  clouds?: { all?: number };
  rain?: { '1h'?: number };
  snow?: { '1h'?: number };
  visibility?: number;
}

const fetchOpenMeteo = async (signal: AbortSignal): Promise<WeatherObservation> => {
  const res = await fetch(openMeteoUrl(CONFIG.weather.lat, CONFIG.weather.lon), { signal });
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
  return parseOpenMeteo((await res.json()) as OpenMeteoResponse);
};

const fetchOpenWeather = async (signal: AbortSignal): Promise<WeatherObservation> => {
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

const PROVIDERS: Readonly<Record<WeatherProvider, (signal: AbortSignal) => Promise<WeatherObservation>>> = {
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
