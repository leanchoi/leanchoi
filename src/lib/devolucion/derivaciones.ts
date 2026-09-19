import { and, desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { getDb } from '@/db';
import { auditLog, barrios, derivaciones } from '@/db/schema';
import type { UsuarioSesion } from '@/lib/auth/usuarios';
import type { Competencia } from './plantillas';
import { ESTADOS_DERIVACION, ETIQUETA_ESTADO } from './tipos';
import type { Derivacion, EstadoDerivacion } from './tipos';

/**
 * Derivaciones: a quién le corresponde cada cosa que pidió el vecino.
 *
 * La competencia (municipal, provincial, nacional o privada) es obligatoria: es lo
 * que permite decirle a la gente "esto no lo resuelve el municipio" en lugar de
 * dejar el reclamo dando vueltas.
 */

export { ESTADOS_DERIVACION, ETIQUETA_ESTADO };
export type { Derivacion, EstadoDerivacion };

const SELECCION = {
  id: derivaciones.id,
  ticket: derivaciones.ticket,
  barrioId: derivaciones.barrioId,
  barrioNombre: barrios.nombre,
  competencia: derivaciones.competencia,
  areaDestino: derivaciones.areaDestino,
  descripcion: derivaciones.descripcion,
  estado: derivaciones.estado,
  ordenTrabajoNro: derivaciones.ordenTrabajoNro,
  creadaEn: derivaciones.creadaEn,
  actualizadaEn: derivaciones.actualizadaEn,
};

export type NuevaDerivacion = {
  ticket: string;
  barrioId: string;
  competencia: Competencia;
  areaDestino: string;
  descripcion: string;
  estado?: EstadoDerivacion;
  ordenTrabajoNro?: string | null;
};

export async function crearDerivacion(
  usuario: UsuarioSesion,
  datos: NuevaDerivacion,
): Promise<Derivacion> {
  const id = uuidv7();

  await getDb()
    .insert(derivaciones)
    .values({
      id,
      ticket: datos.ticket,
      barrioId: datos.barrioId,
      competencia: datos.competencia,
      areaDestino: datos.areaDestino.trim(),
      descripcion: datos.descripcion.trim(),
      estado: datos.estado ?? (datos.competencia === 'municipal' ? 'recibida' : 'derivada'),
      ordenTrabajoNro: datos.ordenTrabajoNro?.trim() || null,
    });

  await getDb()
    .insert(auditLog)
    .values({
      usuarioId: usuario.id,
      accion: 'derivacion_creada',
      ticket: datos.ticket,
      metadata: { competencia: datos.competencia, areaDestino: datos.areaDestino },
    });

  const derivacion = await obtenerDerivacion(id);
  if (!derivacion) throw new Error('No se pudo leer la derivación recién creada.');
  return derivacion;
}

export async function obtenerDerivacion(id: string): Promise<Derivacion | null> {
  const [fila] = await getDb()
    .select(SELECCION)
    .from(derivaciones)
    .innerJoin(barrios, eq(barrios.id, derivaciones.barrioId))
    .where(eq(derivaciones.id, id))
    .limit(1);
  return (fila as Derivacion | undefined) ?? null;
}

export async function derivacionesDeTicket(ticket: string): Promise<Derivacion[]> {
  const filas = await getDb()
    .select(SELECCION)
    .from(derivaciones)
    .innerJoin(barrios, eq(barrios.id, derivaciones.barrioId))
    .where(eq(derivaciones.ticket, ticket))
    .orderBy(desc(derivaciones.creadaEn));
  return filas as Derivacion[];
}

export async function listarDerivaciones(filtros?: {
  barrioId?: string | null;
  estado?: EstadoDerivacion;
  limite?: number;
}): Promise<Derivacion[]> {
  const condiciones = [
    filtros?.barrioId ? eq(derivaciones.barrioId, filtros.barrioId) : undefined,
    filtros?.estado ? eq(derivaciones.estado, filtros.estado) : undefined,
  ].filter(Boolean);

  const consulta = getDb()
    .select(SELECCION)
    .from(derivaciones)
    .innerJoin(barrios, eq(barrios.id, derivaciones.barrioId))
    .orderBy(desc(derivaciones.creadaEn))
    .limit(filtros?.limite ?? 200);

  const filas = condiciones.length > 0 ? await consulta.where(and(...condiciones)) : await consulta;
  return filas as Derivacion[];
}

export type CambioDerivacion = {
  estado?: EstadoDerivacion;
  ordenTrabajoNro?: string | null;
  areaDestino?: string;
};

export async function actualizarDerivacion(
  usuario: UsuarioSesion,
  id: string,
  cambio: CambioDerivacion,
): Promise<Derivacion | null> {
  const antes = await obtenerDerivacion(id);
  if (!antes) return null;

  await getDb()
    .update(derivaciones)
    .set({
      ...(cambio.estado ? { estado: cambio.estado } : {}),
      ...(cambio.areaDestino ? { areaDestino: cambio.areaDestino.trim() } : {}),
      ...(cambio.ordenTrabajoNro !== undefined
        ? { ordenTrabajoNro: cambio.ordenTrabajoNro?.trim() || null }
        : {}),
      actualizadaEn: new Date(),
    })
    .where(eq(derivaciones.id, id));

  await getDb()
    .insert(auditLog)
    .values({
      usuarioId: usuario.id,
      accion: 'derivacion_actualizada',
      ticket: antes.ticket,
      metadata: { id, antes: { estado: antes.estado, orden: antes.ordenTrabajoNro }, cambio },
    });

  return obtenerDerivacion(id);
}
