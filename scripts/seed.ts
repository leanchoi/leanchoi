/**
 * Carga los datos iniciales: barrios de Esquel, cuestionario v1 y usuarios de prueba.
 *
 *   npm run db:seed
 *
 * Es idempotente (no duplica filas si se corre dos veces).
 */
import 'dotenv/config';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('✖ DATABASE_URL no está definida. Copiá .env.example a .env y completala.');
    process.exit(1);
  }

  // TODO(fase 1): sembrar barrios, cuestionario v1 y usuarios de demostración.
  console.log('· Seed pendiente: los datos iniciales se cargan a partir de la fase 1.');
}

main().catch((error: unknown) => {
  console.error('✖ Falló el seed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
