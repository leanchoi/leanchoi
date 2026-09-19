import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { getDb } from '@/db';
import { auditLog, barrios, encuestadores, noRespuestas, respuestas, viviendas } from '@/db/schema';
import { limitadoASuBarrio } from '@/lib/auth/roles';
import { codigoCorto } from '@/lib/campo/ticket';
import type { UsuarioSesion } from '@/lib/auth/usuarios';
import { registrarContacto } from '@/lib/identificada/acceso';
import {
  ContactoEntranteSchema,
  EncuestaEntranteSchema,
  NoRespuestaEntranteSchema,
  ViviendaEntranteSchema,
} from './esquemas';
import type { EventoEntrante } from './esquemas';

/**
 * Aplicación de lo que llega del celular.
 *
 * REGLA 9: es idempotente y append-only. Cada inserción usa la clave natural del
 * evento —el ticket de la encuesta, el par vivienda+intento de la no-respuesta— con
 * `on conflict do nothing`: mandar dos veces el mismo lote deja la base igual que
 * mandarlo una vez, y **nunca** se pisa lo que ya estaba.
 */

export type ResultadoAplicacion = {
  confirmados: string[];
  errores: { id: string; error: string }[];
  /** Cuántos entraron de verdad (el resto ya estaban). */
  nuevos: number;
};

/** Primero las viviendas: una encuesta puede venir de una casa recién agregada. */
const ORDEN: Record<EventoEntrante['tipo'], number> = {
  vivienda_nueva: 0,
  encuesta: 1,
  no_respuesta: 1,
  contacto: 2,
};

export async function aplicarEventos(
  usuario: UsuarioSesion,
  eventos: EventoEntrante[],
): Promise<ResultadoAplicacion> {
  const resultado: ResultadoAplicacion = { confirmados: [], errores: [], nuevos: 0 };
  const ordenados = [...eventos].sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);

  for (const evento of ordenados) {
    try {
      const entro = await aplicarUno(usuario, evento);
      if (entro) resultado.nuevos += 1;
      resultado.confirmados.push(evento.id);
    } catch (error) {
      resultado.errores.push({
        id: evento.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await getDb()
    .insert(auditLog)
    .values({
      usuarioId: usuario.id,
      accion: 'sync_lote',
      metadata: {
        recibidos: eventos.length,
        confirmados: resultado.confirmados.length,
        nuevos: resultado.nuevos,
        errores: resultado.errores.length,
      },
    });

  return resultado;
}

class EventoRechazado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'EventoRechazado';
  }
}

/** El encuestador solo carga en su barrio. */
function verificarBarrio(usuario: UsuarioSesion, barrioId: string): void {
  if (!limitadoASuBarrio(usuario.rol)) return;
  if (usuario.barrioId !== barrioId) {
    throw new EventoRechazado('Ese barrio no es el asignado a tu usuario.');
  }
}

/** Fila de encuestador para este usuario en este barrio; se crea al primer envío. */
async function encuestadorDe(usuario: UsuarioSesion, barrioId: string): Promise<string> {
  const [existente] = await getDb()
    .select({ id: encuestadores.id })
    .from(encuestadores)
    .where(and(eq(encuestadores.usuarioId, usuario.id), eq(encuestadores.barrioId, barrioId)))
    .limit(1);
  if (existente) return existente.id;

  const [creado] = await getDb()
    .insert(encuestadores)
    .values({
      id: uuidv7(),
      usuarioId: usuario.id,
      barrioId,
      alias: usuario.nombreVisible,
    })
    .onConflictDoNothing()
    .returning({ id: encuestadores.id });

  if (creado) return creado.id;

  const [reintento] = await getDb()
    .select({ id: encuestadores.id })
    .from(encuestadores)
    .where(eq(encuestadores.usuarioId, usuario.id))
    .limit(1);
  if (!reintento) throw new EventoRechazado('No se pudo registrar al encuestador.');
  return reintento.id;
}

async function aplicarUno(usuario: UsuarioSesion, evento: EventoEntrante): Promise<boolean> {
  switch (evento.tipo) {
    case 'vivienda_nueva':
      return aplicarVivienda(usuario, evento);
    case 'encuesta':
      return aplicarEncuesta(usuario, evento);
    case 'no_respuesta':
      return aplicarNoRespuesta(usuario, evento);
    case 'contacto':
      return aplicarContacto(usuario, evento);
    default:
      throw new EventoRechazado('Tipo de evento desconocido.');
  }
}

async function aplicarVivienda(usuario: UsuarioSesion, evento: EventoEntrante): Promise<boolean> {
  const datos = ViviendaEntranteSchema.parse(evento.payload);
  verificarBarrio(usuario, datos.barrioId);

  const [fila] = await getDb()
    .insert(viviendas)
    .values({ id: datos.id, barrioId: datos.barrioId, identificador: datos.identificador })
    .onConflictDoNothing()
    .returning({ id: viviendas.id });

  return Boolean(fila);
}

async function aplicarEncuesta(usuario: UsuarioSesion, evento: EventoEntrante): Promise<boolean> {
  const datos = EncuestaEntranteSchema.parse(evento.payload);
  verificarBarrio(usuario, datos.barrioId);

  const [vivienda] = await getDb()
    .select({ id: viviendas.id })
    .from(viviendas)
    .where(eq(viviendas.id, datos.viviendaId))
    .limit(1);
  if (!vivienda) {
    throw new EventoRechazado('La vivienda todavía no llegó al servidor; se reintenta después.');
  }

  const encuestadorId = await encuestadorDe(usuario, datos.barrioId);

  const [fila] = await getDb()
    .insert(respuestas)
    .values({
      ticket: datos.ticket,
      // El código que el vecino se llevó en el papel o en el QR.
      codigo: codigoCorto(datos.ticket),
      viviendaId: datos.viviendaId,
      barrioId: datos.barrioId,
      encuestadorId,
      cuestionarioVersion: datos.cuestionarioVersion,
      consentimientoVersion: datos.consentimientoVersion,
      payload: datos.respuestas,
      abiertaEn: new Date(datos.abiertaEn),
      cerradaEn: datos.cerradaEn ? new Date(datos.cerradaEn) : null,
      duracionSegundos: datos.duracionSegundos ?? null,
      latApertura: datos.gpsApertura?.lat ?? null,
      lngApertura: datos.gpsApertura?.lng ?? null,
      precisionAperturaM: datos.gpsApertura?.precisionM ?? null,
      latCierre: datos.gpsCierre?.lat ?? null,
      lngCierre: datos.gpsCierre?.lng ?? null,
      precisionCierreM: datos.gpsCierre?.precisionM ?? null,
      dispositivoId: datos.dispositivoId,
    })
    // El ticket es la clave: reenviar el mismo no duplica ni sobrescribe.
    .onConflictDoNothing({ target: respuestas.ticket })
    .returning({ ticket: respuestas.ticket });

  if (fila) {
    await getDb()
      .update(viviendas)
      .set({ estado: 'relevada', actualizadoEn: new Date() })
      .where(eq(viviendas.id, datos.viviendaId));
  }

  return Boolean(fila);
}

async function aplicarNoRespuesta(
  usuario: UsuarioSesion,
  evento: EventoEntrante,
): Promise<boolean> {
  const datos = NoRespuestaEntranteSchema.parse(evento.payload);
  verificarBarrio(usuario, datos.barrioId);

  const [vivienda] = await getDb()
    .select({ id: viviendas.id })
    .from(viviendas)
    .where(eq(viviendas.id, datos.viviendaId))
    .limit(1);
  if (!vivienda) {
    throw new EventoRechazado('La vivienda todavía no llegó al servidor; se reintenta después.');
  }

  const encuestadorId = await encuestadorDe(usuario, datos.barrioId);

  const [fila] = await getDb()
    .insert(noRespuestas)
    .values({
      id: datos.id,
      viviendaId: datos.viviendaId,
      barrioId: datos.barrioId,
      encuestadorId,
      motivo: datos.motivo,
      intento: datos.intento,
      observacion: datos.observacion || null,
      lat: datos.gps?.lat ?? null,
      lng: datos.gps?.lng ?? null,
      precisionM: datos.gps?.precisionM ?? null,
      registradaEn: new Date(datos.registradaEn),
    })
    // Clave natural: una sola no-respuesta por vivienda e intento.
    .onConflictDoNothing({ target: [noRespuestas.viviendaId, noRespuestas.intento] })
    .returning({ id: noRespuestas.id });

  if (fila) {
    await getDb()
      .update(viviendas)
      .set({
        estado: datos.motivo === 'volver_mas_tarde' ? 'pendiente' : 'cerrada_sin_respuesta',
        actualizadoEn: new Date(),
      })
      .where(eq(viviendas.id, datos.viviendaId));
  }

  return Boolean(fila);
}

async function aplicarContacto(usuario: UsuarioSesion, evento: EventoEntrante): Promise<boolean> {
  const datos = ContactoEntranteSchema.parse(evento.payload);

  // El contacto va al otro schema, por su única puerta.
  return registrarContacto(
    {
      ticket: datos.ticket,
      nombre: datos.nombre,
      apellido: datos.apellido,
      dniUltimos: datos.dniUltimos,
      email: datos.email ?? null,
      telefono: datos.telefono ?? null,
      domicilio: datos.domicilio,
      barrioNombre: datos.barrioNombre,
    },
    usuario.id,
  );
}

/** Nombre del barrio, para el contacto. */
export async function nombreDeBarrio(barrioId: string): Promise<string | null> {
  const [fila] = await getDb()
    .select({ nombre: barrios.nombre })
    .from(barrios)
    .where(eq(barrios.id, barrioId))
    .limit(1);
  return fila?.nombre ?? null;
}
