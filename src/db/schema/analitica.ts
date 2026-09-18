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
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Schema `analitica`: respuestas y trazas del operativo.
 *
 * NUNCA contiene datos identificatorios del vecino. El único puente con el schema
 * `identificada` es el `ticket`, y **no existe foreign key entre ambos schemas**:
 * el cruce es una operación explícita del rol `admin`, siempre auditada.
 */
export const analitica = pgSchema('analitica');

// ---------------------------------------------------------------- enumeraciones

export const rolUsuario = analitica.enum('rol_usuario', [
  'encuestador',
  'coordinador_barrio',
  'area',
  'conduccion',
  'admin',
]);

export const estadoVivienda = analitica.enum('estado_vivienda', [
  'pendiente',
  'en_curso',
  'relevada',
  'cerrada_sin_respuesta',
]);

/** Los cinco motivos tipificados. No hay un sexto camino para cerrar una vivienda. */
export const motivoNoRespuesta = analitica.enum('motivo_no_respuesta', [
  'sin_moradores',
  'rechazo',
  'deshabitada',
  'no_accesible',
  'volver_mas_tarde',
]);

export const competencia = analitica.enum('competencia', [
  'municipal',
  'provincial',
  'nacional',
  'privada',
]);

export const estadoDerivacion = analitica.enum('estado_derivacion', [
  'recibida',
  'derivada',
  'en_proceso',
  'resuelta',
  'fuera_de_competencia',
]);

export const estadoAudio = analitica.enum('estado_audio', [
  'pendiente',
  'procesando',
  'transcripto',
  'error',
  'purgado',
  'purgado_sin_transcribir',
]);

// ---------------------------------------------------------------- territorio

export const barrios = analitica.table('barrios', {
  id: uuid('id').primaryKey(),
  nombre: text('nombre').notNull().unique(),
  slug: text('slug').notNull().unique(),
  /** TODO: completar con el listado oficial de sedes vecinales del municipio. */
  sedeVecinal: text('sede_vecinal'),
  /** Denominador de la cobertura. TODO: definir la fuente con la Dirección. */
  viviendasEstimadas: integer('viviendas_estimadas'),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Unidad de relevamiento y lista de trabajo del encuestador.
 * `identificador` es manzana/lote o una referencia: NO lleva calle ni número exacto,
 * que son dato identificatorio y viven en el otro schema.
 */
export const viviendas = analitica.table(
  'viviendas',
  {
    id: uuid('id').primaryKey(),
    barrioId: uuid('barrio_id')
      .notNull()
      .references(() => barrios.id, { onDelete: 'restrict' }),
    identificador: text('identificador').notNull(),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    precisionM: doublePrecision('precision_m'),
    estado: estadoVivienda('estado').notNull().default('pendiente'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('viviendas_barrio_identificador_uq').on(t.barrioId, t.identificador),
    index('viviendas_barrio_estado_idx').on(t.barrioId, t.estado),
  ],
);

// ---------------------------------------------------------------- personas del equipo

export const usuarios = analitica.table(
  'usuarios',
  {
    id: uuid('id').primaryKey(),
    usuario: text('usuario').notNull().unique(),
    hashPassword: text('hash_password').notNull(),
    /** Personal municipal y vecinalistas. Nunca vecinos encuestados. */
    nombreVisible: text('nombre_visible').notNull(),
    rol: rolUsuario('rol').notNull(),
    barrioId: uuid('barrio_id').references(() => barrios.id, { onDelete: 'restrict' }),
    area: text('area'),
    activo: boolean('activo').notNull().default(true),
    ultimoAcceso: timestamp('ultimo_acceso', { withTimezone: true }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('usuarios_rol_idx').on(t.rol)],
);

export const encuestadores = analitica.table(
  'encuestadores',
  {
    id: uuid('id').primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' })
      .unique(),
    barrioId: uuid('barrio_id')
      .notNull()
      .references(() => barrios.id, { onDelete: 'restrict' }),
    /** Nombre de pila o apodo para el tablero. */
    alias: text('alias').notNull(),
    activo: boolean('activo').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('encuestadores_barrio_idx').on(t.barrioId)],
);

// ---------------------------------------------------------------- instrumento

/**
 * Definición JSON versionada del cuestionario. `publicado_en` en null = borrador.
 * Las validaciones (regla de admisión, techo de 12 minutos, núcleo inmutable) se
 * aplican al publicar: fase 2.
 */
export const cuestionarios = analitica.table(
  'cuestionarios',
  {
    id: uuid('id').primaryKey(),
    version: integer('version').notNull().unique(),
    definicion: jsonb('definicion').notNull(),
    /** Versión del texto de consentimiento que viaja dentro de la definición. */
    consentimientoVersion: text('consentimiento_version').notNull(),
    /** Suma de `segundos_estimados`. Nunca mayor a 720 (regla 6). */
    segundosTotales: integer('segundos_totales').notNull(),
    changelog: text('changelog').notNull().default(''),
    publicadoEn: timestamp('publicado_en', { withTimezone: true }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cuestionarios_publicado_idx').on(t.publicadoEn)],
);

// ---------------------------------------------------------------- relevamiento

export const respuestas = analitica.table(
  'respuestas',
  {
    /** UUID v7 generado en el celular. Es el puente con `identificada` y el código del vecino. */
    ticket: uuid('ticket').primaryKey(),
    viviendaId: uuid('vivienda_id')
      .notNull()
      .references(() => viviendas.id, { onDelete: 'restrict' }),
    barrioId: uuid('barrio_id')
      .notNull()
      .references(() => barrios.id, { onDelete: 'restrict' }),
    encuestadorId: uuid('encuestador_id')
      .notNull()
      .references(() => encuestadores.id, { onDelete: 'restrict' }),
    cuestionarioVersion: integer('cuestionario_version')
      .notNull()
      .references(() => cuestionarios.version, { onDelete: 'restrict' }),
    /** Sin consentimiento registrado no hay encuesta (regla 2). */
    consentimientoVersion: text('consentimiento_version').notNull(),
    payload: jsonb('payload').notNull(),

    abiertaEn: timestamp('abierta_en', { withTimezone: true }).notNull(),
    cerradaEn: timestamp('cerrada_en', { withTimezone: true }),
    /** Duración real medida en el dispositivo (regla 6). */
    duracionSegundos: integer('duracion_segundos'),

    // GPS: es dato, no validación. Nunca bloquea una carga.
    latApertura: doublePrecision('lat_apertura'),
    lngApertura: doublePrecision('lng_apertura'),
    precisionAperturaM: doublePrecision('precision_apertura_m'),
    latCierre: doublePrecision('lat_cierre'),
    lngCierre: doublePrecision('lng_cierre'),
    precisionCierreM: doublePrecision('precision_cierre_m'),

    dispositivoId: text('dispositivo_id'),
    sincronizadaEn: timestamp('sincronizada_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('respuestas_barrio_cerrada_idx').on(t.barrioId, t.cerradaEn),
    index('respuestas_vivienda_idx').on(t.viviendaId),
  ],
);

export const noRespuestas = analitica.table(
  'no_respuestas',
  {
    id: uuid('id').primaryKey(),
    viviendaId: uuid('vivienda_id')
      .notNull()
      .references(() => viviendas.id, { onDelete: 'restrict' }),
    barrioId: uuid('barrio_id')
      .notNull()
      .references(() => barrios.id, { onDelete: 'restrict' }),
    encuestadorId: uuid('encuestador_id')
      .notNull()
      .references(() => encuestadores.id, { onDelete: 'restrict' }),
    /** Obligatorio y tipificado (regla 3). */
    motivo: motivoNoRespuesta('motivo').notNull(),
    intento: integer('intento').notNull().default(1),
    observacion: text('observacion'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    precisionM: doublePrecision('precision_m'),
    registradaEn: timestamp('registrada_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('no_respuestas_barrio_motivo_idx').on(t.barrioId, t.motivo),
    unique('no_respuestas_vivienda_intento_uq').on(t.viviendaId, t.intento),
  ],
);

// ---------------------------------------------------------------- audio y codificación

export const audios = analitica.table(
  'audios',
  {
    id: uuid('id').primaryKey(),
    ticket: uuid('ticket').notNull(),
    preguntaId: text('pregunta_id').notNull(),
    barrioId: uuid('barrio_id'),

    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    duracionSegundos: doublePrecision('duracion_segundos'),
    sha256: text('sha256').notNull(),
    /** Ruta relativa dentro de AUDIO_DIR. `null` = los bytes ya se borraron. */
    rutaRelativa: text('ruta_relativa'),

    estado: estadoAudio('estado').notNull().default('pendiente'),
    intentos: integer('intentos').notNull().default(0),
    errorDetalle: text('error_detalle'),

    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    transcriptoEn: timestamp('transcripto_en', { withTimezone: true }),
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
    metadata: jsonb('metadata'),
    revisadaPorPersona: boolean('revisada_por_persona').notNull().default(false),

    duracionProcesoMs: integer('duracion_proceso_ms'),
    creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('transcripciones_ticket_idx').on(t.ticket)],
);

/** Agrupamiento temático de las respuestas abiertas (fase 7). */
export const codificaciones = analitica.table(
  'codificaciones',
  {
    id: uuid('id').primaryKey(),
    transcripcionId: uuid('transcripcion_id')
      .notNull()
      .references(() => transcripciones.id, { onDelete: 'cascade' }),
    barrioId: uuid('barrio_id').references(() => barrios.id, { onDelete: 'restrict' }),
    clusterId: text('cluster_id').notNull(),
    etiqueta: text('etiqueta').notNull(),
    citaTextual: text('cita_textual'),
    proveedor: text('proveedor').notNull(),
    creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('codificaciones_cluster_idx').on(t.clusterId, t.barrioId)],
);

// ---------------------------------------------------------------- devolución

export const derivaciones = analitica.table(
  'derivaciones',
  {
    id: uuid('id').primaryKey(),
    /** Sin FK a `identificada`: el ticket es el único puente. */
    ticket: uuid('ticket').notNull(),
    barrioId: uuid('barrio_id')
      .notNull()
      .references(() => barrios.id, { onDelete: 'restrict' }),
    competencia: competencia('competencia').notNull(),
    areaDestino: text('area_destino').notNull(),
    descripcion: text('descripcion').notNull().default(''),
    estado: estadoDerivacion('estado').notNull().default('recibida'),
    /** Sin esto no se puede enviar una plantilla de tipo `compromiso` (regla 4). */
    ordenTrabajoNro: text('orden_trabajo_nro'),
    creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadaEn: timestamp('actualizada_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('derivaciones_barrio_estado_idx').on(t.barrioId, t.estado),
    index('derivaciones_competencia_idx').on(t.competencia),
    index('derivaciones_ticket_idx').on(t.ticket),
  ],
);

/** Una carilla A4/A3 por barrio, imprimible, con los compromisos asumidos. */
export const informesBarrio = analitica.table(
  'informes_barrio',
  {
    id: uuid('id').primaryKey(),
    barrioId: uuid('barrio_id')
      .notNull()
      .references(() => barrios.id, { onDelete: 'restrict' }),
    cuestionarioVersion: integer('cuestionario_version').notNull(),
    contenido: jsonb('contenido').notNull(),
    generadoPor: uuid('generado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    generadoEn: timestamp('generado_en', { withTimezone: true }).notNull().defaultNow(),
    publicado: boolean('publicado').notNull().default(false),
  },
  (t) => [index('informes_barrio_idx').on(t.barrioId, t.generadoEn)],
);

// ---------------------------------------------------------------- auditoría

/**
 * Bitácora append-only. La aplicación solo inserta: nunca actualiza ni borra.
 * Registra cada cruce ticket ↔ identidad, cada export y cada purga de audio.
 */
export const auditLog = analitica.table(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    accion: text('accion').notNull(),
    ticket: uuid('ticket'),
    /** Obligatorio por código en los cruces: lo escribe la persona (regla 1). */
    motivo: text('motivo'),
    metadata: jsonb('metadata'),
    ip: varchar('ip', { length: 45 }),
    ocurridoEn: timestamp('ocurrido_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_accion_idx').on(t.accion, t.ocurridoEn),
    index('audit_log_usuario_idx').on(t.usuarioId, t.ocurridoEn),
  ],
);
