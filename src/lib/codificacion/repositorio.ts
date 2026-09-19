import { asc, eq, inArray, notExists, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { getDb } from '@/db';
import { auditLog, codificaciones, respuestas, transcripciones } from '@/db/schema';
import type { FragmentoACodificar } from './tipos';

export type FilaCodificacion = {
  id: string;
  transcripcionId: string;
  barrioId: string | null;
  clusterId: string;
  etiqueta: string;
  citaTextual: string | null;
  proveedor: string;
};

export type EventoAuditoria = {
  accion: string;
  motivo?: string | null;
  metadata?: Record<string, unknown>;
};

export interface RepositorioCodificacion {
  /** Transcripciones que todavía no fueron codificadas, más viejas primero. */
  listarSinCodificar(limite: number): Promise<FragmentoACodificar[]>;
  guardar(filas: readonly Omit<FilaCodificacion, 'id'>[]): Promise<number>;
  registrarAuditoria(evento: EventoAuditoria): Promise<void>;
}

export class RepositorioCodificacionDrizzle implements RepositorioCodificacion {
  async listarSinCodificar(limite: number): Promise<FragmentoACodificar[]> {
    const db = getDb();
    const filas = await db
      .select({
        transcripcionId: transcripciones.id,
        ticket: transcripciones.ticket,
        preguntaId: transcripciones.preguntaId,
        texto: transcripciones.texto,
        // El barrio no está en la transcripción: se resuelve por el ticket, que es
        // el único puente. Nunca se toca el esquema `identificada`.
        barrioId: respuestas.barrioId,
      })
      .from(transcripciones)
      .leftJoin(respuestas, eq(respuestas.ticket, transcripciones.ticket))
      .where(
        notExists(
          db
            .select({ uno: sql`1` })
            .from(codificaciones)
            .where(eq(codificaciones.transcripcionId, transcripciones.id)),
        ),
      )
      .orderBy(asc(transcripciones.creadaEn))
      .limit(limite);

    return filas.map((fila) => ({ ...fila, barrioId: fila.barrioId ?? null }));
  }

  async guardar(filas: readonly Omit<FilaCodificacion, 'id'>[]): Promise<number> {
    if (filas.length === 0) return 0;
    const insertadas = await getDb()
      .insert(codificaciones)
      .values(filas.map((fila) => ({ id: uuidv7(), ...fila })))
      .returning({ id: codificaciones.id });
    return insertadas.length;
  }

  async registrarAuditoria(evento: EventoAuditoria): Promise<void> {
    await getDb()
      .insert(auditLog)
      .values({
        accion: evento.accion,
        motivo: evento.motivo ?? null,
        metadata: evento.metadata ?? null,
      });
  }

  /** Borra la codificación de esas transcripciones para volver a agruparlas. */
  async rehacer(transcripcionIds: readonly string[]): Promise<void> {
    if (transcripcionIds.length === 0) return;
    await getDb()
      .delete(codificaciones)
      .where(inArray(codificaciones.transcripcionId, [...transcripcionIds]));
  }
}
