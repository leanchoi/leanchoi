/**
 * Variables de entorno del servidor autoritativo.
 *
 * Un único lugar que lee `process.env`, valida y falla temprano: si falta el
 * secreto del JWT, el proceso no arranca. Nada de `process.env.LO_QUE_SEA` suelto
 * por el código.
 */

export type NodeEnv = 'development' | 'staging' | 'production';

export interface ServerConfig {
  readonly env: NodeEnv;
  readonly port: number;
  readonly logLevel: string;

  /** Identidad del shard, visible en el selector y en las métricas. */
  readonly shardName: string;
  readonly capacity: number;

  readonly jwt: {
    /** Secreto compartido con Hostinger. HS256 en los dos lados. */
    readonly secret: string;
    readonly issuer: string;
    readonly audience: string;
    /** Tolerancia de reloj entre Hostinger y el VPS, en segundos. */
    readonly clockToleranceS: number;
  };

  readonly hostinger: {
    /** Base de la API PHP, sin barra final. */
    readonly apiUrl: string;
    /** Secreto del endpoint interno de persistencia. */
    readonly apiKey: string;
    /** Cada cuánto se vuelcan las stats sucias, en milisegundos. */
    readonly flushIntervalMs: number;
    /** Timeout de cada request al backend. */
    readonly timeoutMs: number;
  };

  /** Orígenes permitidos para CORS y para el handshake WebSocket. */
  readonly corsOrigins: readonly string[];

  readonly world: {
    /** Radio de interés en manzanas. */
    readonly aoiCells: number;
    /** Distancia máxima para escuchar a alguien por voz, en metros. */
    readonly voiceRangeM: number;
    /** Frecuencia de simulación. */
    readonly tickHz: number;
    /** Frecuencia del canal AOI de transformadas. */
    readonly aoiHz: number;
  };
}

const str = (key: string, fallback?: string): string => {
  const value = process.env[key];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Falta la variable de entorno ${key}. Ver server-vps/.env.example`);
};

const int = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw new Error(`${key} debe ser un número entero, llegó "${raw}"`);
  return parsed;
};

const list = (key: string, fallback: string): readonly string[] =>
  str(key, fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

let cached: ServerConfig | null = null;

/** Lee y valida la configuración una sola vez por proceso. */
export const loadConfig = (): ServerConfig => {
  if (cached) return cached;

  const env = str('NODE_ENV', 'development') as NodeEnv;
  const secret = str('JWT_SECRET', env === 'development' ? 'esquel-dev-secret-cambiar-en-produccion' : undefined);

  if (env === 'production' && secret.length < 32) {
    throw new Error('JWT_SECRET tiene que tener al menos 32 caracteres en producción.');
  }

  cached = {
    env,
    port: int('PORT', 2567),
    logLevel: str('LOG_LEVEL', env === 'production' ? 'info' : 'debug'),
    shardName: str('SHARD_NAME', 'Esquel — Centro 01'),
    capacity: int('SHARD_CAPACITY', 120),
    jwt: {
      secret,
      issuer: str('JWT_ISSUER', 'https://esquel2027.ar'),
      audience: str('JWT_AUDIENCE', 'esquel-realtime'),
      clockToleranceS: int('JWT_CLOCK_TOLERANCE_S', 60),
    },
    hostinger: {
      apiUrl: str('HOSTINGER_API_URL', 'https://esquel2027.ar/api').replace(/\/$/, ''),
      apiKey: str('HOSTINGER_API_KEY', env === 'development' ? 'esquel-dev-api-key' : undefined),
      flushIntervalMs: int('HOSTINGER_FLUSH_MS', 30_000),
      timeoutMs: int('HOSTINGER_TIMEOUT_MS', 8_000),
    },
    corsOrigins: list(
      'CORS_ORIGIN',
      'http://localhost:5173,http://localhost:4173,https://esquel2027.ar,https://www.esquel2027.ar',
    ),
    world: {
      aoiCells: int('AOI_CELLS', 4),
      voiceRangeM: int('VOICE_RANGE_M', 25),
      tickHz: int('TICK_HZ', 20),
      aoiHz: int('AOI_HZ', 10),
    },
  };

  return cached;
};

/** Reinicia el cache (sólo para tests). */
export const resetConfig = (): void => {
  cached = null;
};
