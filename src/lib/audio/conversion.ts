import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ErrorTranscripcion } from './tipos';

/**
 * Conversión de formato para los proveedores que no aceptan lo que graba el
 * celular. Android graba `audio/webm;codecs=opus`, que Google no lista entre los
 * formatos soportados; OGG sí. Esta conversión es el puente.
 *
 * Es opcional: si no hay ffmpeg disponible, el audio queda pendiente con un error
 * explícito y NO se pierde (se reintenta o se purga por TTL).
 */

export const MIME_DESTINO_POR_DEFECTO = 'audio/ogg';

const EXTENSION: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/flac': 'flac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
};

function argumentosDeSalida(mimeDestino: string): string[] {
  switch (mimeDestino) {
    case 'audio/ogg':
      return ['-c:a', 'libopus', '-b:a', '32k'];
    case 'audio/wav':
      return ['-c:a', 'pcm_s16le', '-ar', '16000', '-ac', '1'];
    case 'audio/flac':
      return ['-c:a', 'flac', '-ar', '16000', '-ac', '1'];
    case 'audio/mpeg':
      return ['-c:a', 'libmp3lame', '-b:a', '64k'];
    default:
      return [];
  }
}

export type ResultadoConversion = { bytes: Uint8Array; mime: string };

export async function convertirAudio(
  bytes: Uint8Array,
  mimeOrigen: string,
  mimeDestino: string,
  ffmpegPath: string | undefined,
): Promise<ResultadoConversion> {
  const binario = ffmpegPath ?? 'ffmpeg';
  const extOrigen = EXTENSION[mimeOrigen.split(';')[0]?.trim() ?? ''] ?? 'bin';
  const extDestino = EXTENSION[mimeDestino] ?? 'ogg';

  const carpeta = await mkdtemp(join(tmpdir(), 'rbe-audio-'));
  const origen = join(carpeta, `entrada.${extOrigen}`);
  const destino = join(carpeta, `salida.${extDestino}`);

  try {
    await writeFile(origen, bytes, { mode: 0o600 });

    await new Promise<void>((resolver, rechazar) => {
      const proceso = spawn(
        binario,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          origen,
          ...argumentosDeSalida(mimeDestino),
          destino,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let stderr = '';
      proceso.stderr?.on('data', (dato: Buffer) => {
        stderr += dato.toString();
      });
      proceso.on('error', (error) => {
        rechazar(
          new ErrorTranscripcion(
            'formato_no_soportado',
            `El proveedor no acepta ${mimeOrigen} y no se pudo ejecutar ffmpeg (${error.message}). ` +
              'Instalá ffmpeg en la imagen o configurá FFMPEG_PATH.',
            { reintentable: false },
          ),
        );
      });
      proceso.on('close', (codigo) => {
        if (codigo === 0) resolver();
        else
          rechazar(
            new ErrorTranscripcion(
              'formato_no_soportado',
              `ffmpeg falló al convertir ${mimeOrigen} a ${mimeDestino}: ${stderr.slice(0, 300)}`,
              { reintentable: false },
            ),
          );
      });
    });

    return { bytes: new Uint8Array(await readFile(destino)), mime: mimeDestino };
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
