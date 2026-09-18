/**
 * Prueba la conexión con el proveedor de desgrabación SIN tocar la base ni el
 * operativo. Es la herramienta para dejar andando la conexión con Gemini (o con
 * cualquier otro servicio) antes de habilitar el flag.
 *
 *   npm run audio:verificar -- ruta/al/audio.ogg
 *
 * Imprime el proveedor, el tiempo que tardó y el texto devuelto. Si falla, dice
 * exactamente en qué paso.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { getEnv } from '@/lib/env';
import { crearProveedorTranscripcion } from '@/lib/audio/registro';
import { ErrorTranscripcion } from '@/lib/audio/tipos';
import { soportaMime } from '@/lib/audio/tipos';

const MIME_POR_EXTENSION: Record<string, string> = {
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  aac: 'audio/aac',
  aiff: 'audio/aiff',
};

async function main(): Promise<void> {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error('Uso: npm run audio:verificar -- ruta/al/audio.ogg');
    process.exit(2);
  }

  const env = getEnv();
  const proveedor = crearProveedorTranscripcion();
  console.log(`· Proveedor configurado: ${proveedor.nombre}`);
  if (proveedor.nombre === 'gemini') {
    console.log(`· Modelo: ${env.GEMINI_MODEL} · estilo: ${env.GEMINI_ESTILO}`);
    console.log(`· Endpoint base: ${env.GEMINI_API_BASE}`);
  }

  const verificacion = proveedor.verificarConfiguracion();
  if (!verificacion.ok) {
    console.error('✖ Configuración incompleta:');
    for (const problema of verificacion.problemas) console.error(`  - ${problema}`);
    process.exit(1);
  }

  const extension = ruta.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME_POR_EXTENSION[extension] ?? 'application/octet-stream';
  const bytes = new Uint8Array(await readFile(ruta));
  console.log(`· Archivo: ${ruta} (${bytes.byteLength} bytes, ${mime})`);

  if (!soportaMime(proveedor, mime)) {
    console.warn(
      `⚠ El proveedor no declara soporte para ${mime}. En el pipeline real se convierte con ffmpeg; ` +
        'acá se envía tal cual para ver qué responde el servicio.',
    );
  }

  const inicio = Date.now();
  try {
    const resultado = await proveedor.transcribir({
      audioId: 'verificacion-manual',
      bytes,
      mime,
      idiomaSugerido: env.AUDIO_IDIOMA,
    });
    console.log(`✔ Desgrabación en ${Date.now() - inicio} ms`);
    console.log(`  proveedor: ${resultado.proveedor} · modelo: ${resultado.modelo ?? '—'}`);
    console.log('--- texto ---');
    console.log(resultado.texto);
  } catch (error) {
    if (error instanceof ErrorTranscripcion) {
      console.error(
        `✖ Falló (${error.causa}, reintentable=${error.reintentable}): ${error.message}`,
      );
      if (error.detalle) console.error('  detalle:', JSON.stringify(error.detalle));
    } else {
      console.error('✖ Falló:', error instanceof Error ? error.message : error);
    }
    process.exit(1);
  }
}

void main();
