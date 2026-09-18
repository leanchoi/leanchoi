import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from './client';
import * as schema from './schema';

export type BaseDeDatos = ReturnType<typeof crearDb>;

function crearDb() {
  return drizzle(getPool(), { schema });
}

declare global {
  var __rbeDb: BaseDeDatos | undefined;
}

/** Instancia Drizzle compartida por proceso. */
export function getDb(): BaseDeDatos {
  globalThis.__rbeDb ??= crearDb();
  return globalThis.__rbeDb;
}

export { schema };
