/**
 * Desgraba los audios pendientes y purga los que ya no deben existir.
 *
 *   npm run audio:procesar
 *
 * Pensado para correr por cron cada pocos minutos. Es seguro correrlo en paralelo
 * con la app: cada audio se marca como `procesando` antes de salir a la red.
 */
import 'dotenv/config';
import { closePool } from '@/db/client';
import { procesarPendientes, purgarAudiosVencidos } from '@/lib/audio/pipeline';
import { crearDependenciasAudio } from '@/lib/audio/servicio';

async function main(): Promise<void> {
  const deps = crearDependenciasAudio();

  if (!deps.config.habilitado) {
    console.log('· FEATURE_AUDIO está apagado: no hay nada que procesar.');
    return;
  }

  const verificacion = deps.proveedor.verificarConfiguracion();
  if (!verificacion.ok) {
    console.error(`✖ Proveedor "${deps.proveedor.nombre}" mal configurado:`);
    for (const problema of verificacion.problemas) console.error(`  - ${problema}`);
    process.exitCode = 1;
    return;
  }

  console.log(`· Proveedor: ${deps.proveedor.nombre}`);
  const proceso = await procesarPendientes(deps);
  console.log(
    `✔ Procesados ${proceso.procesados}: ${proceso.transcriptos} transcriptos, ` +
      `${proceso.errores} con error, ${proceso.omitidos} omitidos.`,
  );

  const purga = await purgarAudiosVencidos(deps);
  console.log(
    `✔ Purga: ${purga.purgados} audios borrados de ${purga.revisados} revisados ` +
      `(${purga.porTexto} por transcripción asegurada, ${purga.porTtl} por TTL vencido).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      '✖ Falló el procesamiento de audios:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(() => closePool());
