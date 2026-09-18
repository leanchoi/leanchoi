import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Schema `analitica`: respuestas y trazas del operativo. NUNCA contiene datos
 * identificatorios del vecino. El único puente con el schema `identificada` es
 * el `ticket`, y no existe foreign key entre ambos schemas.
 *
 * Esta fase crea solamente las tablas que necesita el módulo de audio. El resto
 * del modelo (barrios, viviendas, respuestas, derivaciones…) llega en la fase 1,
 * según `docs/modelo-datos.md`.
 */
export const analitica = pgSchema('analitica');

/**
 * Ciclo de vida del audio. El archivo existe solo entre `pendiente` y el momento
 * en que la transcripción queda asegurada: a partir de ahí los bytes se borran y
 * la fila queda como rastro auditable de que existieron.
 */
export const estadoAudio = analitica.enum('estado_audio', [
  'pendiente',
  'procesando',
  'transcripto',
  'error',
  'purgado',
  'purgado_sin_transcribir',
]);

export const audios = analitica.table(
  'audios',
  {
    id: uuid('id').primaryKey(),
    /** Ticket de la encuesta (UUID v7 generado en el celular). Sin FK entre schemas. */
    ticket: uuid('ticket').notNull(),
    /** Identificador de la pregunta abierta dentro del cuestionario. */
    preguntaId: text('pregunta_id').notNull(),
    barrioId: uuid('barrio_id'),

    /** Metadatos del archivo. Sobreviven a la purga; los bytes no. */
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    duracionSegundos: doublePrecision('duracion_segundos'),
    sha256: text('sha256').notNull(),
    /** Ruta relativa dentro de AUDIO_DIR. Se pone en null al purgar. */
    rutaRelativa: text('ruta_relativa'),

    estado: estadoAudio('estado').notNull().default('pendiente'),
    intentos: integer('intentos').notNull().default(0),
    errorDetalle: text('error_detalle'),

    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    transcriptoEn: timestamp('transcripto_en', { withTimezone: true }),
    /** Momento exacto en que los bytes dejaron de existir en el sistema. */
    purgadoEn: timestamp('purgado_en', { withTimezone: true }),
    purgaMotivo: text('purga_motivo'),
  },
  (t) => [
    index('audios_estado_idx').on(t.estado, t.creadoEn),
    index('audios_ticket_idx').on(t.ticket),
  ],
);

export const transcripciones = analitica.table(
  'transcripciones',
  {
    id: uuid('id').primaryKey(),
    audioId: uuid('audio_id')
      .notNull()
      .references(() => audios.id, { onDelete: 'restrict' }),
    ticket: uuid('ticket').notNull(),
    preguntaId: text('pregunta_id').notNull(),

    texto: text('texto').notNull(),
    idioma: text('idioma'),
    proveedor: text('proveedor').notNull(),
    modelo: text('modelo'),
    /** Respuesta cruda del proveedor, sin el audio. Para depurar conexiones. */
    metadata: jsonb('metadata'),
    /** true cuando fue revisada por una persona. */
    revisadaPorPersona: boolean('revisada_por_persona').notNull().default(false),

    duracionProcesoMs: integer('duracion_proceso_ms'),
    creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('transcripciones_ticket_idx').on(t.ticket)],
);

/**
 * Bitácora append-only. La aplicación solo inserta: nunca actualiza ni borra.
 * Registra, entre otras cosas, cada purga de audio y cada cruce ticket ↔ identidad.
 */
export const auditLog = analitica.table(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    usuarioId: uuid('usuario_id'),
    accion: text('accion').notNull(),
    ticket: uuid('ticket'),
    motivo: text('motivo'),
    metadata: jsonb('metadata'),
    ocurridoEn: timestamp('ocurrido_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_accion_idx').on(t.accion, t.ocurridoEn)],
);
