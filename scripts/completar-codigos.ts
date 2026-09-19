/**
 * Completa el código corto de las respuestas que se sincronizaron antes de que la
 * columna existiera (migración 0002).
 *
 *   npm run db:completar-codigos
 *
 * Es idempotente: solo toca las filas que tienen el código en null.
 */
import 'dotenv/config';
import { isNull } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { closePool } from '@/db/client';
import { respuestas } from '@/db/schema';
import { codigoCorto } from '@/lib/campo/ticket';

async function main(): Promise<void> {
  const pendientes = await getDb()
    .select({ ticket: respuestas.ticket })
    .from(respuestas)
    .where(isNull(respuestas.codigo));

  if (pendientes.length === 0) {
    console.log('· Todas las respuestas ya tienen su código.');
    return;
  }

  for (const fila of pendientes) {
    await getDb()
      .update(respuestas)
      .set({ codigo: codigoCorto(fila.ticket) })
      .where(eq(respuestas.ticket, fila.ticket));
  }

  console.log(`✔ Códigos completados: ${pendientes.length}.`);
}

main()
  .catch((error: unknown) => {
    console.error('✖ Falló:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
