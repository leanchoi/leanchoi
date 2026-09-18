/**
 * Publica una versión nueva del cuestionario.
 *
 *   npm run cuestionario:publicar -- docs/cuestionario-v2.json
 *
 * Valida TODAS las reglas antes de escribir nada: decisión declarada por pregunta,
 * techo de 12 minutos, núcleo inmutable comparado contra la versión vigente,
 * consentimiento versionado y coherencia del bloque autoadministrado.
 * Si algo falla, no publica y dice exactamente qué corregir.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closePool } from '@/db/client';
import {
  CuestionarioInvalido,
  obtenerVigente,
  publicarCuestionario,
} from '@/lib/cuestionario/repositorio';

async function main(): Promise<void> {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error('Uso: npm run cuestionario:publicar -- ruta/al/cuestionario.json');
    process.exit(2);
  }

  const definicionCruda: unknown = JSON.parse(await readFile(resolve(ruta), 'utf8'));

  const vigente = await obtenerVigente();
  console.log(
    vigente
      ? `· Versión vigente: ${vigente.version} (publicada el ${vigente.publicadoEn.toISOString().slice(0, 10)}).`
      : '· No hay ninguna versión publicada todavía.',
  );

  const resultado = await publicarCuestionario(definicionCruda);
  console.log(
    `✔ Publicada la versión ${resultado.version}: ${resultado.segundosTotales} segundos ` +
      `(${(resultado.segundosTotales / 60).toFixed(1)} min de 12).`,
  );
  for (const advertencia of resultado.advertencias) console.log(`  ⚠ ${advertencia}`);
  console.log('· Ya está visible en /cuestionario.');
}

main()
  .catch((error: unknown) => {
    if (error instanceof CuestionarioInvalido) {
      console.error(`✖ ${error.message}`);
    } else {
      console.error('✖ Falló la publicación:', error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  })
  .finally(() => closePool());
