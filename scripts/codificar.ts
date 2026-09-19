/**
 * Agrupa en temas las respuestas abiertas ya desgrabadas y guarda las citas.
 *
 *   npm run codificar
 *
 * Pensado para correr por cron unas pocas veces por día, después del worker de
 * audio. Es opcional: con FEATURE_CLUSTERING apagado no hace nada y el resto del
 * sistema funciona igual.
 */
import 'dotenv/config';
import { closePool } from '@/db/client';
import { codificarPendientes } from '@/lib/codificacion/pipeline';
import { crearDependenciasCodificacion } from '@/lib/codificacion/servicio';

async function main(): Promise<void> {
  const deps = crearDependenciasCodificacion();

  if (!deps.config.habilitado) {
    console.log('· FEATURE_CLUSTERING está apagado: no hay nada que codificar.');
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
  const resumen = await codificarPendientes(deps);

  if (resumen.motivo) {
    console.log(`· ${resumen.motivo}`);
    return;
  }

  console.log(
    `✔ ${resumen.preguntas} pregunta(s), ${resumen.fragmentos} texto(s), ` +
      `${resumen.clusters} tema(s), ${resumen.codificaciones} codificación(es).`,
  );
  console.log(
    `✔ Citas: ${resumen.citasVerificadas} verificadas, ` +
      `${resumen.citasDescartadas} descartadas por no ser literales.`,
  );
  if (resumen.omitidas > 0) {
    console.log(`· ${resumen.omitidas} texto(s) quedaron para la próxima corrida (pocos casos).`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('✖ Falló la codificación:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
