/**
 * Aplica las migraciones versionadas de Drizzle.
 *
 *   npm run db:migrate
 *
 * Es idempotente: se puede correr en cada deploy. Antes de migrar se asegura de
 * que existan los dos schemas del sistema (`analitica` e `identificada`).
 *
 * NOTA para quien genere migraciones nuevas con `npm run db:generate`: drizzle-kit
 * emite `CREATE SCHEMA "x";` sin `IF NOT EXISTS`. Hay que agregárselo a mano en el
 * .sql generado, porque acá los schemas ya se crearon.
 */
import 'dotenv/config';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const CARPETA_MIGRACIONES = resolve(process.cwd(), 'drizzle');

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('✖ DATABASE_URL no está definida. Copiá .env.example a .env y completala.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    await pool.query('create schema if not exists analitica');
    await pool.query('create schema if not exists identificada');
    console.log('✔ Schemas analitica e identificada verificados.');

    const hayMigraciones =
      existsSync(CARPETA_MIGRACIONES) &&
      readdirSync(CARPETA_MIGRACIONES).some((f) => f.endsWith('.sql'));

    if (!hayMigraciones) {
      console.log(
        '· Todavía no hay migraciones en ./drizzle (se generan en la fase 1). Nada que aplicar.',
      );
      return;
    }

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES, migrationsSchema: 'drizzle' });
    console.log('✔ Migraciones aplicadas.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('✖ Falló la migración:', error instanceof Error ? error.message : error);
  process.exit(1);
});
