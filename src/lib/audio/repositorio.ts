import { and, asc, eq, isNotNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { audios, auditLog, transcripciones } from '@/db/schema';
import type { ResultadoTranscripcion } from './tipos';

export type EstadoAudio =
  'pendiente' | 'procesando' | 'transcripto' | 'error' | 'purgado' | 'purgado_sin_transcribir';

export type AudioFila = {
  id: string;
  ticket: string;
  preguntaId: string;
  barrioId: string | null;
  mime: string;
  bytes: number;
  duracionSegundos: number | null;
  sha256: string;
  rutaRelativa: string | null;
  estado: EstadoAudio;
  intentos: number;
  errorDetalle: string | null;
  creadoEn: Date;
  transcriptoEn: Date | null;
  purgadoEn: Date | null;
  purgaMotivo: string | null;
};

export type NuevoAudio = {
  id: string;
  ticket: string;
  preguntaId: string;
  barrioId?: string | null;
  mime: string;
  bytes: number;
  duracionSegundos?: number | null;
  sha256: string;
  rutaRelativa: string;
};

export type EventoAuditoria = {
  accion: string;
  ticket?: string | null;
  motivo?: string | null;
  metadata?: Record<string, unknown>;
};

export interface RepositorioAudios {
  crear(nuevo: NuevoAudio): Promise<AudioFila>;
  obtener(id: string): Promise<AudioFila | null>;
  /** Audios que todavía tienen bytes y esperan desgrabación. */
  listarPendientes(limite: number, reintentosMax: number): Promise<AudioFila[]>;
  /** Audios cuyos bytes deben desaparecer: vencidos por TTL o ya transcriptos. */
  listarParaPurgar(vencidosAntesDe: Date): Promise<AudioFila[]>;
  marcarProcesando(id: string): Promise<void>;
  guardarTranscripcion(
    audio: AudioFila,
    resultado: ResultadoTranscripcion,
    duracionProcesoMs: number,
  ): Promise<string>;
  /** Relectura de confirmación: ¿la transcripción quedó realmente escrita? */
  transcripcionAsegurada(audioId: string): Promise<boolean>;
  marcarPurgado(id: string, estado: EstadoAudio, motivo: string): Promise<void>;
  marcarError(id: string, detalle: string): Promise<void>;
  registrarAuditoria(evento: EventoAuditoria): Promise<void>;
  textoDeTranscripcion(audioId: string): Promise<string | null>;
}

function aFila(fila: typeof audios.$inferSelect): AudioFila {
  return {
    ...fila,
    estado: fila.estado as EstadoAudio,
  };
}

export class RepositorioAudiosDrizzle implements RepositorioAudios {
  async crear(nuevo: NuevoAudio): Promise<AudioFila> {
    const [fila] = await getDb()
      .insert(audios)
      .values({
        id: nuevo.id,
        ticket: nuevo.ticket,
        preguntaId: nuevo.preguntaId,
        barrioId: nuevo.barrioId ?? null,
        mime: nuevo.mime,
        bytes: nuevo.bytes,
        duracionSegundos: nuevo.duracionSegundos ?? null,
        sha256: nuevo.sha256,
        rutaRelativa: nuevo.rutaRelativa,
      })
      .returning();
    if (!fila) throw new Error('No se pudo registrar el audio');
    return aFila(fila);
  }

  async obtener(id: string): Promise<AudioFila | null> {
    const [fila] = await getDb().select().from(audios).where(eq(audios.id, id)).limit(1);
    return fila ? aFila(fila) : null;
  }

  async listarPendientes(limite: number, reintentosMax: number): Promise<AudioFila[]> {
    const filas = await getDb()
      .select()
      .from(audios)
      .where(
        and(
          isNotNull(audios.rutaRelativa),
          or(eq(audios.estado, 'pendiente'), eq(audios.estado, 'error')),
          lt(audios.intentos, reintentosMax),
        ),
      )
      .orderBy(asc(audios.creadoEn))
      .limit(limite);
    return filas.map(aFila);
  }

  async listarParaPurgar(vencidosAntesDe: Date): Promise<AudioFila[]> {
    const filas = await getDb()
      .select()
      .from(audios)
      .where(
        and(
          isNotNull(audios.rutaRelativa),
          or(lt(audios.creadoEn, vencidosAntesDe), eq(audios.estado, 'transcripto')),
        ),
      )
      .orderBy(asc(audios.creadoEn));
    return filas.map(aFila);
  }

  async marcarProcesando(id: string): Promise<void> {
    await getDb()
      .update(audios)
      .set({ estado: 'procesando', intentos: sql`${audios.intentos} + 1` })
      .where(eq(audios.id, id));
  }

  async guardarTranscripcion(
    audio: AudioFila,
    resultado: ResultadoTranscripcion,
    duracionProcesoMs: number,
  ): Promise<string> {
    const id = crypto.randomUUID();
    await getDb()
      .insert(transcripciones)
      .values({
        id,
        audioId: audio.id,
        ticket: audio.ticket,
        preguntaId: audio.preguntaId,
        texto: resultado.texto,
        idioma: resultado.idioma ?? null,
        proveedor: resultado.proveedor,
        modelo: resultado.modelo ?? null,
        metadata: resultado.metadata ?? null,
        duracionProcesoMs,
      });
    return id;
  }

  async transcripcionAsegurada(audioId: string): Promise<boolean> {
    const [fila] = await getDb()
      .select({ texto: transcripciones.texto })
      .from(transcripciones)
      .where(eq(transcripciones.audioId, audioId))
      .limit(1);
    return Boolean(fila && fila.texto.trim().length > 0);
  }

  async marcarPurgado(id: string, estado: EstadoAudio, motivo: string): Promise<void> {
    await getDb()
      .update(audios)
      .set({
        estado,
        rutaRelativa: null,
        purgadoEn: new Date(),
        purgaMotivo: motivo,
        ...(estado === 'transcripto' ? { transcriptoEn: new Date() } : {}),
      })
      .where(eq(audios.id, id));
  }

  async marcarError(id: string, detalle: string): Promise<void> {
    await getDb()
      .update(audios)
      .set({ estado: 'error', errorDetalle: detalle.slice(0, 500) })
      .where(eq(audios.id, id));
  }

  async registrarAuditoria(evento: EventoAuditoria): Promise<void> {
    await getDb()
      .insert(auditLog)
      .values({
        accion: evento.accion,
        ticket: evento.ticket ?? null,
        motivo: evento.motivo ?? null,
        metadata: evento.metadata ?? null,
      });
  }

  async textoDeTranscripcion(audioId: string): Promise<string | null> {
    const [fila] = await getDb()
      .select({ texto: transcripciones.texto })
      .from(transcripciones)
      .where(eq(transcripciones.audioId, audioId))
      .limit(1);
    return fila?.texto ?? null;
  }
}
