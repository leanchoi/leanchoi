/**
 * Clima autoritativo del shard.
 *
 * El servidor consulta Open-Meteo cada diez minutos y replica el resultado dentro
 * del estado del mundo. Así los 120 jugadores del shard ven exactamente la misma
 * nevada al mismo tiempo: si el cliente consultara por su cuenta, dos vecinos
 * parados en la misma esquina podrían ver climas distintos.
 *
 * Si el proveedor no contesta, entra la climatología de Esquel del mes en curso y
 * el dato queda marcado `stale`.
 */

import {
  climatologicalFallback,
  openMeteoUrl,
  parseOpenMeteo,
  toWorldWeather,
  type OpenMeteoResponse,
  type WorldWeather,
} from '@esquel/shared';

/** Coordenadas de Esquel. */
export const ESQUEL_LAT = -42.9115;
export const ESQUEL_LON = -71.3195;

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

export class WeatherFeed {
  private current: WorldWeather = climatologicalFallback();
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly log: Logger;
  private failures = 0;

  constructor(intervalMs = 600_000, log: Logger = { info: () => {}, warn: () => {} }) {
    this.intervalMs = intervalMs;
    this.log = log;
  }

  get weather(): WorldWeather {
    return this.current;
  }

  /** Arranca el sondeo periódico. */
  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.intervalMs);
    // No hace falta que este timer mantenga vivo el proceso.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async refresh(): Promise<WorldWeather> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(openMeteoUrl(ESQUEL_LAT, ESQUEL_LON), { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const observation = parseOpenMeteo((await res.json()) as OpenMeteoResponse);
      this.current = toWorldWeather(observation, false);
      this.failures = 0;
      this.log.info(`[clima] ${this.current.condition} ${this.current.temperatureC}°C, viento ${this.current.windKph} km/h`);
    } catch (err) {
      this.failures++;
      this.current = climatologicalFallback();
      this.log.warn(`[clima] proveedor caído (${this.failures}), va la climatología: ${String(err)}`);
    } finally {
      clearTimeout(timeout);
    }
    return this.current;
  }
}
