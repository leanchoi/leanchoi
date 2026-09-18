import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

loadEnv({ path: '.env', quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL no está definida. Copiá .env.example a .env y completala.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.ts',
  out: './drizzle',
  dbCredentials: { url },
  // Las dos bases lógicas del sistema viven en schemas separados de Postgres.
  schemaFilter: ['analitica', 'identificada'],
  verbose: true,
  strict: true,
});
