import { Pool, type PoolConfig } from 'pg';
import { getEnv } from '@/lib/env';

/**
 * Pool de conexiones a Postgres. Se crea una sola vez por proceso y de forma
 * perezosa, para que el build no necesite una base disponible.
 *
 * Las dos bases lógicas del sistema (schemas `analitica` e `identificada`) viven
 * en la misma instancia de Postgres pero están separadas a nivel de schema y de
 * permisos. No hay foreign key navegable entre ellas: el único puente es el ticket.
 */

declare global {
  var __rbePgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (globalThis.__rbePgPool) return globalThis.__rbePgPool;

  const env = getEnv();
  const config: PoolConfig = {
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    application_name: 'relevamiento-barrial-esquel',
    ...(env.DATABASE_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
  };

  const pool = new Pool(config);
  pool.on('error', (err) => {
    console.error('[db] error inesperado en el pool:', err.message);
  });

  globalThis.__rbePgPool = pool;
  return pool;
}

export type PingResult =
  { ok: true; latenciaMs: number } | { ok: false; latenciaMs: number; error: string };

/** Verificación mínima de conectividad usada por el healthcheck. */
export async function pingDatabase(): Promise<PingResult> {
  const inicio = Date.now();
  try {
    const pool = getPool();
    await pool.query('select 1');
    return { ok: true, latenciaMs: Date.now() - inicio };
  } catch (error) {
    return {
      ok: false,
      latenciaMs: Date.now() - inicio,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closePool(): Promise<void> {
  if (globalThis.__rbePgPool) {
    await globalThis.__rbePgPool.end();
    globalThis.__rbePgPool = undefined;
  }
}
