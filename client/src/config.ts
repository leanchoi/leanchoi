/**
 * Configuración del cliente, leída de las variables `VITE_*` con valores por
 * defecto sensatos para desarrollo. Todo lo que el cliente necesita saber del
 * entorno pasa por acá: ningún módulo lee `import.meta.env` por su cuenta.
 */

import { ELECTION_DAY_ISO } from '@esquel/shared';

const env = import.meta.env as Record<string, string | undefined>;

const num = (key: string, fallback: number): number => {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const str = (key: string, fallback: string): string => {
  const raw = env[key];
  return raw === undefined || raw === '' ? fallback : raw;
};

const bool = (key: string, fallback: boolean): boolean => {
  const raw = env[key];
  return raw === undefined || raw === '' ? fallback : raw === 'true' || raw === '1';
};

export type WeatherProvider = 'open-meteo' | 'openweathermap';

export interface ClientConfig {
  /** Versión del bundle; viaja en la telemetría para cruzar bugs con despliegues. */
  readonly version: string;
  readonly weather: {
    readonly provider: WeatherProvider;
    readonly apiKey: string;
    readonly refreshMinutes: number;
    /** Coordenadas de Esquel usadas para clima y sol. */
    readonly lat: number;
    readonly lon: number;
  };
  readonly api: {
    readonly baseUrl: string;
    readonly realtimeUrl: string;
  };
  readonly election: {
    /** Apertura de urnas en ISO UTC. */
    readonly dayIso: string;
    /** `false` mientras la fecha siga siendo una estimación. */
    readonly official: boolean;
  };
  readonly render: {
    /** Radio de chunks (manzanas) que se construyen alrededor del jugador. */
    readonly distanceCells: number;
    readonly maxPixelRatio: number;
    /** Chunks con detalle completo; más allá se usa la silueta simplificada. */
    readonly detailCells: number;
  };
}

export const CONFIG: ClientConfig = {
  version: str('VITE_APP_VERSION', '0.4.0'),
  weather: {
    provider: str('VITE_WEATHER_PROVIDER', 'open-meteo') as WeatherProvider,
    apiKey: str('VITE_OPENWEATHER_API_KEY', ''),
    refreshMinutes: num('VITE_WEATHER_REFRESH_MINUTES', 10),
    lat: num('VITE_ESQUEL_LAT', -42.9115),
    lon: num('VITE_ESQUEL_LON', -71.3195),
  },
  api: {
    baseUrl: str('VITE_API_BASE_URL', 'https://esquel2027.ar/api/v1'),
    realtimeUrl: str('VITE_REALTIME_URL', 'wss://rt.esquel2027.ar'),
  },
  election: {
    dayIso: str('VITE_ELECTION_DAY', ELECTION_DAY_ISO),
    official: bool('VITE_ELECTION_DATE_OFFICIAL', false),
  },
  render: {
    distanceCells: num('VITE_RENDER_DISTANCE_CELLS', 6),
    maxPixelRatio: num('VITE_MAX_PIXEL_RATIO', 2),
    detailCells: num('VITE_DETAIL_CELLS', 2),
  },
};
