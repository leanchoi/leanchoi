import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { getDb } from '@/db';
import { auditLog, contactos } from '@/db/schema';
import type { UsuarioSesion } from '@/lib/auth/usuarios';
import { puede } from '@/lib/auth/roles';

/**
 * ÚNICA puerta al schema `identificada`.
 *
 * REGLA 1: cruzar el ticket con la identidad del vecino requiere rol `admin` y un
 * motivo escrito, y deja siempre una fila en `analitica.audit_log`. Ningún otro
 * módulo del sistema importa las tablas de `identificada`.
 */

export class CruceProhibido extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'CruceProhibido';
  }
}

export type DatosContacto = {
  ticket: string;
  nombre: string;
  apellido: string;
  dniUltimos: string;
  email?: string | null;
  telefono?: string | null;
  domicilio: string;
  barrioNombre: string;
};

/**
 * Guarda los datos de contacto que el vecino dio en la puerta. Escribir no es
 * cruzar: quien carga no puede después leer lo que cargó.
 */
export async function registrarContacto(datos: DatosContacto, usuarioId: string): Promise<boolean> {
  const [fila] = await getDb()
    .insert(contactos)
    .values({
      ticket: datos.ticket,
      nombre: datos.nombre.trim(),
      apellido: datos.apellido.trim(),
      dniUltimos: datos.dniUltimos.trim().slice(-3),
      email: datos.email?.trim() || null,
      telefono: datos.telefono?.trim() || null,
      domicilio: datos.domicilio.trim(),
      barrioNombre: datos.barrioNombre,
    })
    .onConflictDoNothing({ target: contactos.ticket })
    .returning({ ticket: contactos.ticket });

  if (fila) {
    await getDb()
      .insert(auditLog)
      .values({
        usuarioId,
        accion: 'contacto_registrado',
        ticket: datos.ticket,
        metadata: { origen: 'sync' },
      });
  }

  return Boolean(fila);
}

export type Identidad = {
  ticket: string;
  nombre: string;
  apellido: string;
  dniUltimos: string;
  email: string | null;
  telefono: string | null;
  domicilio: string;
  barrioNombre: string;
};

/**
 * Cruza un ticket con la identidad del vecino. Solo `admin`, solo con motivo
 * escrito, y siempre auditado ANTES de devolver nada.
 */
export async function cruzarTicket(
  usuario: UsuarioSesion,
  ticket: string,
  motivo: string,
): Promise<Identidad | null> {
  if (!puede(usuario.rol, 'cruzar_identidad')) {
    throw new CruceProhibido('Solo el rol admin puede cruzar un ticket con la identidad.');
  }
  if (motivo.trim().length < 15) {
    throw new CruceProhibido('Hay que escribir un motivo concreto para cruzar un ticket.');
  }

  // Primero queda el rastro; después se devuelve el dato.
  await getDb()
    .insert(auditLog)
    .values({
      usuarioId: usuario.id,
      accion: 'cruce_ticket_identidad',
      ticket,
      motivo: motivo.trim(),
      metadata: { rol: usuario.rol },
    });

  const [fila] = await getDb()
    .select()
    .from(contactos)
    .where(eq(contactos.ticket, ticket))
    .limit(1);
  return fila ?? null;
}

/**
 * Consulta del propio vecino: apellido + últimos 3 del DNI. No devuelve datos
 * personales, solo confirma a qué ticket corresponde para poder mostrar su estado.
 */
export async function ticketPorApellidoYDni(
  apellido: string,
  dniUltimos: string,
): Promise<string | null> {
  const [fila] = await getDb()
    .select({ ticket: contactos.ticket })
    .from(contactos)
    .where(
      and(
        eq(contactos.apellido, apellido.trim()),
        eq(contactos.dniUltimos, dniUltimos.trim().slice(-3)),
      ),
    )
    .limit(1);
  return fila?.ticket ?? null;
}

export function nuevoIdAcuse(): string {
  return uuidv7();
}
