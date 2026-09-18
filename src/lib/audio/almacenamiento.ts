import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Almacenamiento del audio mientras existe. Es deliberadamente pobre: archivos en
 * disco, dentro de un único directorio configurable (`AUDIO_DIR`), sin ningún
 * servicio externo. Nada de esto se sirve por HTTP: no hay ruta que devuelva bytes
 * de audio.
 */
export interface AlmacenamientoAudio {
  guardar(rutaRelativa: string, bytes: Uint8Array): Promise<void>;
  leer(rutaRelativa: string): Promise<Uint8Array>;
  borrar(rutaRelativa: string): Promise<void>;
  existe(rutaRelativa: string): Promise<boolean>;
}

const RUTA_VALIDA = /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/;

export class RutaAudioInvalida extends Error {
  constructor(ruta: string) {
    super(`Ruta de audio inválida: ${ruta}`);
    this.name = 'RutaAudioInvalida';
  }
}

export class AlmacenamientoEnDisco implements AlmacenamientoAudio {
  private readonly base: string;

  constructor(directorio: string) {
    this.base = resolve(directorio);
  }

  private rutaAbsoluta(rutaRelativa: string): string {
    if (!RUTA_VALIDA.test(rutaRelativa)) throw new RutaAudioInvalida(rutaRelativa);
    const absoluta = resolve(join(this.base, rutaRelativa));
    if (absoluta !== this.base && !absoluta.startsWith(this.base + sep)) {
      throw new RutaAudioInvalida(rutaRelativa);
    }
    return absoluta;
  }

  async guardar(rutaRelativa: string, bytes: Uint8Array): Promise<void> {
    const destino = this.rutaAbsoluta(rutaRelativa);
    await mkdir(dirname(destino), { recursive: true, mode: 0o700 });
    await writeFile(destino, bytes, { mode: 0o600 });
  }

  async leer(rutaRelativa: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.rutaAbsoluta(rutaRelativa)));
  }

  async borrar(rutaRelativa: string): Promise<void> {
    await rm(this.rutaAbsoluta(rutaRelativa), { force: true });
  }

  async existe(rutaRelativa: string): Promise<boolean> {
    try {
      await stat(this.rutaAbsoluta(rutaRelativa));
      return true;
    } catch {
      return false;
    }
  }
}

/** Almacenamiento en memoria: solo para tests. */
export class AlmacenamientoEnMemoria implements AlmacenamientoAudio {
  private readonly archivos = new Map<string, Uint8Array>();

  async guardar(rutaRelativa: string, bytes: Uint8Array): Promise<void> {
    if (!RUTA_VALIDA.test(rutaRelativa)) throw new RutaAudioInvalida(rutaRelativa);
    this.archivos.set(rutaRelativa, bytes);
  }

  async leer(rutaRelativa: string): Promise<Uint8Array> {
    const bytes = this.archivos.get(rutaRelativa);
    if (!bytes) throw new Error(`No existe el audio ${rutaRelativa}`);
    return bytes;
  }

  async borrar(rutaRelativa: string): Promise<void> {
    this.archivos.delete(rutaRelativa);
  }

  async existe(rutaRelativa: string): Promise<boolean> {
    return this.archivos.has(rutaRelativa);
  }

  /** Solo para tests: cuántos audios quedan realmente guardados. */
  get cantidad(): number {
    return this.archivos.size;
  }
}

const EXTENSION_POR_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/aac': 'aac',
  'audio/aiff': 'aiff',
};

export function extensionDeMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return EXTENSION_POR_MIME[base] ?? 'bin';
}

export function rutaDeAudio(ticket: string, audioId: string, mime: string): string {
  return `${ticket}/${audioId}.${extensionDeMime(mime)}`;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
