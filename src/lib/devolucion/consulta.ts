import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditLog, barrios, respuestas } from '@/db/schema';
import { acusesDeTicket, ticketPorApellidoYDni } from '@/lib/identificada/acceso';
import { derivacionesDeTicket } from './derivaciones';
import type { Derivacion } from './tipos';

/**
 * Consulta del vecino: en qué quedó lo que pidió.
 *
 * Sin cuenta y sin login. Devuelve el estado del pedido y **ningún dato personal**:
 * ni el nombre, ni el domicilio, ni las respuestas que dio. Solo qué se hizo con su
 * reclamo, que es lo que vino a preguntar.
 */

export type PasoDelPedido = {
  competencia: Derivacion['competencia'];
  areaDestino: string;
  descripcion: string;
  estado: Derivacion['estado'];
  ordenTrabajoNro: string | null;
  actualizadaEn: Date;
};

export type EstadoTicket = {
  codigo: string;
  barrioNombre: string;
  recibidoEn: Date;
  derivaciones: PasoDelPedido[];
  comunicaciones: { plantilla: string; canal: string; enviadoEn: Date | null }[];
};

async function armarEstado(ticket: string): Promise<EstadoTicket | null> {
  const [fila] = await getDb()
    .select({
      codigo: respuestas.codigo,
      ticket: respuestas.ticket,
      barrioNombre: barrios.nombre,
      recibidoEn: respuestas.sincronizadaEn,
      cerradaEn: respuestas.cerradaEn,
    })
    .from(respuestas)
    .innerJoin(barrios, eq(barrios.id, respuestas.barrioId))
    .where(eq(respuestas.ticket, ticket))
    .limit(1);

  if (!fila) return null;

  const derivaciones = await derivacionesDeTicket(ticket);
  const comunicaciones = await acusesDeTicket(ticket);

  return {
    codigo: fila.codigo ?? '',
    barrioNombre: fila.barrioNombre,
    recibidoEn: fila.cerradaEn ?? fila.recibidoEn,
    derivaciones: derivaciones.map((derivacion) => ({
      competencia: derivacion.competencia,
      areaDestino: derivacion.areaDestino,
      descripcion: derivacion.descripcion,
      estado: derivacion.estado,
      ordenTrabajoNro: derivacion.ordenTrabajoNro,
      actualizadaEn: derivacion.actualizadaEn,
    })),
    comunicaciones: comunicaciones.map((acuse) => ({
      plantilla: acuse.plantilla,
      canal: acuse.canal,
      enviadoEn: acuse.enviadoEn,
    })),
  };
}

export async function consultarPorCodigo(codigo: string): Promise<EstadoTicket | null> {
  const normalizado = codigo.trim().toUpperCase();
  const [fila] = await getDb()
    .select({ ticket: respuestas.ticket })
    .from(respuestas)
    .where(eq(respuestas.codigo, normalizado))
    .limit(1);

  if (!fila) return null;
  await registrarConsulta('codigo');
  return armarEstado(fila.ticket);
}

export async function consultarPorApellidoYDni(
  apellido: string,
  dniUltimos: string,
): Promise<EstadoTicket | null> {
  const ticket = await ticketPorApellidoYDni(apellido, dniUltimos);
  if (!ticket) return null;
  await registrarConsulta('apellido_dni');
  return armarEstado(ticket);
}

/** Queda el rastro de que hubo una consulta, sin registrar quién la hizo. */
async function registrarConsulta(via: 'codigo' | 'apellido_dni'): Promise<void> {
  await getDb().insert(auditLog).values({
    accion: 'consulta_vecino',
    metadata: { via },
  });
}
