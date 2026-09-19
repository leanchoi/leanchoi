import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { getDb } from '@/db';
import { acuses, auditLog, contactos } from '@/db/schema';
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

/**
 * Usa los datos de contacto para armar y mandar algo, SIN devolverlos.
 *
 * Es la forma de que el sistema le escriba al vecino sin que ninguna capa de arriba
 * —ni la API, ni el panel, ni los logs— vea su nombre o su correo. Lo que vuelve es
 * únicamente el resultado del envío.
 */
export async function conContactoParaEnvio<T>(
  ticket: string,
  usar: (contacto: { nombre: string; email: string | null; telefono: string | null }) => Promise<T>,
): Promise<T | null> {
  const [fila] = await getDb()
    .select({ nombre: contactos.nombre, email: contactos.email, telefono: contactos.telefono })
    .from(contactos)
    .where(eq(contactos.ticket, ticket))
    .limit(1);

  if (!fila) return null;
  return usar(fila);
}

export type AcuseGuardado = {
  ticket: string;
  plantilla: 'acuse' | 'derivacion' | 'compromiso';
  competencia: 'municipal' | 'provincial' | 'nacional' | 'privada';
  canal: 'email' | 'telefono' | 'presencial';
  cuerpo: string;
  ordenTrabajoNro?: string | null;
  enviado: boolean;
};

/** Guarda lo que efectivamente se le dijo al vecino, se haya podido enviar o no. */
export async function registrarAcuse(datos: AcuseGuardado, usuarioId: string): Promise<string> {
  const id = uuidv7();

  await getDb()
    .insert(acuses)
    .values({
      id,
      ticket: datos.ticket,
      plantilla: datos.plantilla,
      competencia: datos.competencia,
      canal: datos.canal,
      cuerpo: datos.cuerpo,
      ordenTrabajoNro: datos.ordenTrabajoNro ?? null,
      enviadoEn: datos.enviado ? new Date() : null,
    });

  await getDb()
    .insert(auditLog)
    .values({
      usuarioId,
      accion: 'acuse_enviado',
      ticket: datos.ticket,
      metadata: { plantilla: datos.plantilla, canal: datos.canal, enviado: datos.enviado },
    });

  return id;
}

/** Cuántas comunicaciones se le mandaron a un ticket. Sin datos personales. */
export async function acusesDeTicket(ticket: string) {
  return getDb()
    .select({
      plantilla: acuses.plantilla,
      competencia: acuses.competencia,
      canal: acuses.canal,
      enviadoEn: acuses.enviadoEn,
      creadoEn: acuses.creadoEn,
    })
    .from(acuses)
    .where(eq(acuses.ticket, ticket));
}

export function nuevoIdAcuse(): string {
  return uuidv7();
}
