import { index, integer, pgSchema, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Schema `identificada`: quién es quién.
 *
 * No contiene NINGUNA respuesta. No tiene ninguna foreign key hacia `analitica`
 * (ni al revés): el único puente es el `ticket`, y cruzarlo requiere rol `admin` y
 * queda registrado en `analitica.audit_log` con usuario, timestamp y motivo.
 *
 * Ninguna API pública devuelve nada de este schema.
 */
export const identificada = pgSchema('identificada');

export const plantillaAcuse = identificada.enum('plantilla_acuse', [
  'acuse',
  'derivacion',
  /** Solo se puede enviar con orden de trabajo cargada (regla 4). */
  'compromiso',
]);

export const competenciaAcuse = identificada.enum('competencia_acuse', [
  'municipal',
  'provincial',
  'nacional',
  'privada',
]);

export const canalAcuse = identificada.enum('canal_acuse', ['email', 'telefono', 'presencial']);

export const contactos = identificada.table(
  'contactos',
  {
    /** El puente. Mismo valor que `analitica.respuestas.ticket`, sin constraint que los una. */
    ticket: uuid('ticket').primaryKey(),
    nombre: text('nombre').notNull(),
    apellido: text('apellido').notNull(),
    /**
     * Solo los últimos 3 dígitos del DNI: alcanzan para que el vecino consulte su
     * ticket y no permiten reconstruir el documento.
     */
    dniUltimos: varchar('dni_ultimos', { length: 3 }).notNull(),
    email: text('email'),
    telefono: text('telefono'),
    domicilio: text('domicilio').notNull(),
    /** Texto, no FK: este schema no conoce las tablas del otro. */
    barrioNombre: text('barrio_nombre').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('contactos_apellido_dni_idx').on(t.apellido, t.dniUltimos)],
);

export const acuses = identificada.table(
  'acuses',
  {
    id: uuid('id').primaryKey(),
    ticket: uuid('ticket').notNull(),
    plantilla: plantillaAcuse('plantilla').notNull(),
    competencia: competenciaAcuse('competencia').notNull(),
    canal: canalAcuse('canal').notNull(),
    /** Lo que efectivamente se le dijo al vecino. */
    cuerpo: text('cuerpo').notNull(),
    /** Referencia a la orden de trabajo cuando la plantilla es `compromiso`. */
    ordenTrabajoNro: text('orden_trabajo_nro'),
    intentos: integer('intentos').notNull().default(0),
    /** `null` = generado pero todavía no enviado. */
    enviadoEn: timestamp('enviado_en', { withTimezone: true }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('acuses_ticket_idx').on(t.ticket)],
);
