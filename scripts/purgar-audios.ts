/**
 * Borra los bytes de los audios que ya no deben existir, sin intentar desgrabarlos.
 *
 *   npm run audio:purgar
 *
 * Borra: (a) audios con transcripción asegurada, (b) audios vencidos por
 * AUDIO_TTL_HORAS, con o sin transcripción. Es idempotente y no borra filas: la
 * traza de que el audio existió queda en la base y en audit_log.
 */
import 'dotenv/config';
import { closePool } from '@/db/client';
import { purgarAudiosVencidos } from '@/lib/audio/pipeline';
import { crearDependenciasAudio } from '@/lib/audio/servicio';

async function main(): Promise<void> {
  const deps = crearDependenciasAudio();
  console.log(`· TTL configurado: ${deps.config.ttlHoras} horas.`);
  const purga = await purgarAudiosVencidos(deps);
  console.log(
    `✔ Purga: ${purga.purgados} audios borrados de ${purga.revisados} revisados ` +
      `(${purga.porTexto} por transcripción asegurada, ${purga.porTtl} por TTL vencido).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('✖ Falló la purga:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
