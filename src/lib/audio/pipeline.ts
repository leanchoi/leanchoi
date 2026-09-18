import { v7 as uuidv7 } from 'uuid';
import type { AlmacenamientoAudio } from './almacenamiento';
import { rutaDeAudio, sha256 } from './almacenamiento';
import type { ConfigAudio } from './config';
import { convertirAudio, MIME_DESTINO_POR_DEFECTO } from './conversion';
import type { AudioFila, RepositorioAudios } from './repositorio';
import { ErrorTranscripcion, soportaMime } from './tipos';
import type { TranscriptionProvider } from './tipos';

/**
 * El ciclo de vida del audio, completo y en un solo lugar.
 *
 *   recibir  →  guardar bytes  →  desgrabar  →  asegurar el texto  →  BORRAR los bytes
 *
 * La única forma de que un audio sobreviva es que todavía no se haya podido
 * desgrabar. Pasado el TTL se borra igual, con o sin transcripción: el sistema no
 * guarda voz de vecinos más allá de lo imprescindible.
 */

export type DependenciasAudio = {
  repo: RepositorioAudios;
  almacen: AlmacenamientoAudio;
  proveedor: TranscriptionProvider;
  config: ConfigAudio;
  ahora?: () => Date;
};

export class AudioRechazado extends Error {
  constructor(
    readonly causa: 'deshabilitado' | 'mime_no_permitido' | 'demasiado_grande' | 'vacio',
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'AudioRechazado';
  }
}

export type EntradaAudioNuevo = {
  ticket: string;
  preguntaId: string;
  barrioId?: string | null;
  mime: string;
  duracionSegundos?: number | null;
  bytes: Uint8Array;
};

/** Paso 1: recibir el audio del celular y dejarlo en cola. */
export async function registrarAudio(
  deps: DependenciasAudio,
  entrada: EntradaAudioNuevo,
): Promise<AudioFila> {
  const { config } = deps;

  if (!config.habilitado) {
    throw new AudioRechazado(
      'deshabilitado',
      'La grabación de audio está apagada (FEATURE_AUDIO).',
    );
  }
  if (entrada.bytes.byteLength === 0) {
    throw new AudioRechazado('vacio', 'El audio llegó vacío.');
  }
  if (entrada.bytes.byteLength > config.maxBytes) {
    throw new AudioRechazado(
      'demasiado_grande',
      `El audio pesa ${entrada.bytes.byteLength} bytes y el máximo es ${config.maxBytes}.`,
    );
  }
  const mimeBase = entrada.mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!config.mimesPermitidos.includes(mimeBase)) {
    throw new AudioRechazado('mime_no_permitido', `Formato de audio no permitido: ${entrada.mime}`);
  }

  const id = uuidv7();
  const ruta = rutaDeAudio(entrada.ticket, id, mimeBase);

  await deps.almacen.guardar(ruta, entrada.bytes);
  const fila = await deps.repo.crear({
    id,
    ticket: entrada.ticket,
    preguntaId: entrada.preguntaId,
    barrioId: entrada.barrioId ?? null,
    mime: mimeBase,
    bytes: entrada.bytes.byteLength,
    duracionSegundos: entrada.duracionSegundos ?? null,
    sha256: sha256(entrada.bytes),
    rutaRelativa: ruta,
  });

  await deps.repo.registrarAuditoria({
    accion: 'audio_recibido',
    ticket: entrada.ticket,
    metadata: { audioId: id, bytes: entrada.bytes.byteLength, mime: mimeBase },
  });

  return fila;
}

export type ResultadoProceso =
  | { estado: 'transcripto'; audioId: string; transcripcionId: string; purgado: true }
  | { estado: 'error'; audioId: string; detalle: string; reintentable: boolean; purgado: false }
  | { estado: 'omitido'; audioId: string; motivo: string; purgado: false };

/** Paso 2 y 3: desgrabar y, apenas el texto está asegurado, borrar el audio. */
export async function procesarAudio(
  deps: DependenciasAudio,
  audio: AudioFila,
): Promise<ResultadoProceso> {
  if (!audio.rutaRelativa) {
    return {
      estado: 'omitido',
      audioId: audio.id,
      motivo: 'el audio ya fue purgado',
      purgado: false,
    };
  }

  const inicio = Date.now();
  await deps.repo.marcarProcesando(audio.id);

  try {
    let bytes = await deps.almacen.leer(audio.rutaRelativa);
    let mime = audio.mime;

    // El proveedor puede no aceptar el formato que graba el celular.
    if (!soportaMime(deps.proveedor, mime)) {
      const destino = deps.proveedor.mimesSoportados.includes(MIME_DESTINO_POR_DEFECTO)
        ? MIME_DESTINO_POR_DEFECTO
        : (deps.proveedor.mimesSoportados[0] ?? MIME_DESTINO_POR_DEFECTO);
      const convertido = await convertirAudio(bytes, mime, destino, deps.config.ffmpegPath);
      bytes = convertido.bytes;
      mime = convertido.mime;
    }

    const resultado = await deps.proveedor.transcribir({
      audioId: audio.id,
      bytes,
      mime,
      duracionSegundos: audio.duracionSegundos ?? undefined,
      idiomaSugerido: deps.config.idioma,
    });

    if (!resultado.texto.trim()) {
      throw new ErrorTranscripcion('vacio', 'El proveedor devolvió una transcripción vacía.');
    }

    const transcripcionId = await deps.repo.guardarTranscripcion(
      audio,
      resultado,
      Date.now() - inicio,
    );

    // Relectura de confirmación: recién acá se puede borrar el audio.
    const asegurada = await deps.repo.transcripcionAsegurada(audio.id);
    if (!asegurada) {
      await deps.repo.marcarError(audio.id, 'La transcripción no quedó confirmada en la base.');
      return {
        estado: 'error',
        audioId: audio.id,
        detalle: 'transcripcion_no_confirmada',
        reintentable: true,
        purgado: false,
      };
    }

    await purgarBytes(deps, audio, 'transcripto', 'transcripcion_asegurada');

    return { estado: 'transcripto', audioId: audio.id, transcripcionId, purgado: true };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    const reintentable = error instanceof ErrorTranscripcion ? error.reintentable : true;
    await deps.repo.marcarError(audio.id, detalle);
    return { estado: 'error', audioId: audio.id, detalle, reintentable, purgado: false };
  }
}

/** Borra los bytes y deja el rastro. Es el único camino por el que desaparece un audio. */
async function purgarBytes(
  deps: DependenciasAudio,
  audio: AudioFila,
  estado: 'transcripto' | 'purgado' | 'purgado_sin_transcribir',
  motivo: string,
): Promise<void> {
  if (audio.rutaRelativa) {
    await deps.almacen.borrar(audio.rutaRelativa);
  }
  await deps.repo.marcarPurgado(audio.id, estado, motivo);
  await deps.repo.registrarAuditoria({
    accion: 'audio_purgado',
    ticket: audio.ticket,
    motivo,
    metadata: { audioId: audio.id, estado, sha256: audio.sha256 },
  });
}

export type ResumenLote = {
  procesados: number;
  transcriptos: number;
  errores: number;
  omitidos: number;
};

export async function procesarPendientes(deps: DependenciasAudio): Promise<ResumenLote> {
  const pendientes = await deps.repo.listarPendientes(
    deps.config.loteProceso,
    deps.config.reintentosMax,
  );
  const resumen: ResumenLote = { procesados: 0, transcriptos: 0, errores: 0, omitidos: 0 };

  for (const audio of pendientes) {
    const resultado = await procesarAudio(deps, audio);
    resumen.procesados += 1;
    if (resultado.estado === 'transcripto') resumen.transcriptos += 1;
    else if (resultado.estado === 'error') resumen.errores += 1;
    else resumen.omitidos += 1;
  }

  return resumen;
}

export type ResumenPurga = {
  revisados: number;
  purgados: number;
  porTtl: number;
  porTexto: number;
};

/**
 * Barrido de purga. Borra los bytes de:
 *  - los audios ya transcriptos a los que les falló el borrado en su momento;
 *  - los audios vencidos por TTL, con o sin transcripción.
 * Se corre por cron. Ver `scripts/purgar-audios.ts`.
 */
export async function purgarAudiosVencidos(deps: DependenciasAudio): Promise<ResumenPurga> {
  const ahora = deps.ahora?.() ?? new Date();
  const limite = new Date(ahora.getTime() - deps.config.ttlHoras * 3600_000);
  const candidatos = await deps.repo.listarParaPurgar(limite);
  const resumen: ResumenPurga = {
    revisados: candidatos.length,
    purgados: 0,
    porTtl: 0,
    porTexto: 0,
  };

  for (const audio of candidatos) {
    if (!audio.rutaRelativa) continue;
    const tieneTexto = await deps.repo.transcripcionAsegurada(audio.id);

    if (tieneTexto) {
      await purgarBytes(deps, audio, 'transcripto', 'transcripcion_asegurada');
      resumen.porTexto += 1;
    } else if (audio.creadoEn.getTime() < limite.getTime()) {
      await purgarBytes(deps, audio, 'purgado_sin_transcribir', 'ttl_vencido');
      resumen.porTtl += 1;
    } else {
      continue;
    }
    resumen.purgados += 1;
  }

  return resumen;
}
