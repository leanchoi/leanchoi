CREATE SCHEMA IF NOT EXISTS "identificada";
--> statement-breakpoint
CREATE TYPE "analitica"."competencia" AS ENUM('municipal', 'provincial', 'nacional', 'privada');--> statement-breakpoint
CREATE TYPE "analitica"."estado_derivacion" AS ENUM('recibida', 'derivada', 'en_proceso', 'resuelta', 'fuera_de_competencia');--> statement-breakpoint
CREATE TYPE "analitica"."estado_vivienda" AS ENUM('pendiente', 'en_curso', 'relevada', 'cerrada_sin_respuesta');--> statement-breakpoint
CREATE TYPE "analitica"."motivo_no_respuesta" AS ENUM('sin_moradores', 'rechazo', 'deshabitada', 'no_accesible', 'volver_mas_tarde');--> statement-breakpoint
CREATE TYPE "analitica"."rol_usuario" AS ENUM('encuestador', 'coordinador_barrio', 'area', 'conduccion', 'admin');--> statement-breakpoint
CREATE TYPE "identificada"."canal_acuse" AS ENUM('email', 'telefono', 'presencial');--> statement-breakpoint
CREATE TYPE "identificada"."competencia_acuse" AS ENUM('municipal', 'provincial', 'nacional', 'privada');--> statement-breakpoint
CREATE TYPE "identificada"."plantilla_acuse" AS ENUM('acuse', 'derivacion', 'compromiso');--> statement-breakpoint
CREATE TABLE "analitica"."barrios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"sede_vecinal" text,
	"viviendas_estimadas" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barrios_nombre_unique" UNIQUE("nombre"),
	CONSTRAINT "barrios_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "analitica"."codificaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transcripcion_id" uuid NOT NULL,
	"barrio_id" uuid,
	"cluster_id" text NOT NULL,
	"etiqueta" text NOT NULL,
	"cita_textual" text,
	"proveedor" text NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analitica"."cuestionarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"definicion" jsonb NOT NULL,
	"consentimiento_version" text NOT NULL,
	"segundos_totales" integer NOT NULL,
	"changelog" text DEFAULT '' NOT NULL,
	"publicado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuestionarios_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "analitica"."derivaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket" uuid NOT NULL,
	"barrio_id" uuid NOT NULL,
	"competencia" "analitica"."competencia" NOT NULL,
	"area_destino" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"estado" "analitica"."estado_derivacion" DEFAULT 'recibida' NOT NULL,
	"orden_trabajo_nro" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analitica"."encuestadores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"barrio_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encuestadores_usuario_id_unique" UNIQUE("usuario_id")
);
--> statement-breakpoint
CREATE TABLE "analitica"."informes_barrio" (
	"id" uuid PRIMARY KEY NOT NULL,
	"barrio_id" uuid NOT NULL,
	"cuestionario_version" integer NOT NULL,
	"contenido" jsonb NOT NULL,
	"generado_por" uuid,
	"generado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"publicado" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analitica"."no_respuestas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vivienda_id" uuid NOT NULL,
	"barrio_id" uuid NOT NULL,
	"encuestador_id" uuid NOT NULL,
	"motivo" "analitica"."motivo_no_respuesta" NOT NULL,
	"intento" integer DEFAULT 1 NOT NULL,
	"observacion" text,
	"lat" double precision,
	"lng" double precision,
	"precision_m" double precision,
	"registrada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "no_respuestas_vivienda_intento_uq" UNIQUE("vivienda_id","intento")
);
--> statement-breakpoint
CREATE TABLE "analitica"."respuestas" (
	"ticket" uuid PRIMARY KEY NOT NULL,
	"vivienda_id" uuid NOT NULL,
	"barrio_id" uuid NOT NULL,
	"encuestador_id" uuid NOT NULL,
	"cuestionario_version" integer NOT NULL,
	"consentimiento_version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"abierta_en" timestamp with time zone NOT NULL,
	"cerrada_en" timestamp with time zone,
	"duracion_segundos" integer,
	"lat_apertura" double precision,
	"lng_apertura" double precision,
	"precision_apertura_m" double precision,
	"lat_cierre" double precision,
	"lng_cierre" double precision,
	"precision_cierre_m" double precision,
	"dispositivo_id" text,
	"sincronizada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analitica"."usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario" text NOT NULL,
	"hash_password" text NOT NULL,
	"nombre_visible" text NOT NULL,
	"rol" "analitica"."rol_usuario" NOT NULL,
	"barrio_id" uuid,
	"area" text,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_usuario_unique" UNIQUE("usuario")
);
--> statement-breakpoint
CREATE TABLE "analitica"."viviendas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"barrio_id" uuid NOT NULL,
	"identificador" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"precision_m" double precision,
	"estado" "analitica"."estado_vivienda" DEFAULT 'pendiente' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viviendas_barrio_identificador_uq" UNIQUE("barrio_id","identificador")
);
--> statement-breakpoint
CREATE TABLE "identificada"."acuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket" uuid NOT NULL,
	"plantilla" "identificada"."plantilla_acuse" NOT NULL,
	"competencia" "identificada"."competencia_acuse" NOT NULL,
	"canal" "identificada"."canal_acuse" NOT NULL,
	"cuerpo" text NOT NULL,
	"orden_trabajo_nro" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"enviado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identificada"."contactos" (
	"ticket" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"dni_ultimos" varchar(3) NOT NULL,
	"email" text,
	"telefono" text,
	"domicilio" text NOT NULL,
	"barrio_nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analitica"."audit_log" ADD COLUMN "ip" varchar(45);--> statement-breakpoint
ALTER TABLE "analitica"."codificaciones" ADD CONSTRAINT "codificaciones_transcripcion_id_transcripciones_id_fk" FOREIGN KEY ("transcripcion_id") REFERENCES "analitica"."transcripciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."codificaciones" ADD CONSTRAINT "codificaciones_barrio_id_barrios_id_fk" FOREIGN KEY ("barrio_id") REFERENCES "analitica"."barrios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."derivaciones" ADD CONSTRAINT "derivaciones_barrio_id_barrios_id_fk" FOREIGN KEY ("barrio_id") REFERENCES "analitica"."barrios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."encuestadores" ADD CONSTRAINT "encuestadores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "analitica"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."encuestadores" ADD CONSTRAINT "encuestadores_barrio_id_barrios_id_fk" FOREIGN KEY ("barrio_id") REFERENCES "analitica"."barrios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."informes_barrio" ADD CONSTRAINT "informes_barrio_barrio_id_barrios_id_fk" FOREIGN KEY ("barrio_id") REFERENCES "analitica"."barrios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."informes_barrio" ADD CONSTRAINT "informes_barrio_generado_por_usuarios_id_fk" FOREIGN KEY ("generado_por") REFERENCES "analitica"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."no_respuestas" ADD CONSTRAINT "no_respuestas_vivienda_id_viviendas_id_fk" FOREIGN KEY ("vivienda_id") REFERENCES "analitica"."viviendas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."no_respuestas" ADD CONSTRAINT "no_respuestas_barrio_id_barrios_id_fk" FOREIGN KEY ("barrio_id") REFERENCES "analitica"."barrios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."no_respuestas" ADD CONSTRAINT "no_respuestas_encuestador_id_encuestadores_id_fk" FOREIGN KEY ("encuestador_id") REFERENCES "analitica"."encuestadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."respuestas" ADD CONSTRAINT "respuestas_vivienda_id_viviendas_id_fk" FOREIGN KEY ("vivienda_id") REFERENCES "analitica"."viviendas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."respuestas" ADD CONSTRAINT "respuestas_barrio_id_barrios_id_fk" FOREIGN KEY ("barrio_id") REFERENCES "analitica"."barrios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."respuestas" ADD CONSTRAINT "respuestas_encuestador_id_encuestadores_id_fk" FOREIGN KEY ("encuestador_id") REFERENCES "analitica"."encuestadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."respuestas" ADD CONSTRAINT "respuestas_cuestionario_version_cuestionarios_version_fk" FOREIGN KEY ("cuestionario_version") REFERENCES "analitica"."cuestionarios"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."usuarios" ADD CONSTRAINT "usuarios_barrio_id_barrios_id_fk" FOREIGN KEY ("barrio_id") REFERENCES "analitica"."barrios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analitica"."viviendas" ADD CONSTRAINT "viviendas_barrio_id_barrios_id_fk" FOREIGN KEY ("barrio_id") REFERENCES "analitica"."barrios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codificaciones_cluster_idx" ON "analitica"."codificaciones" USING btree ("cluster_id","barrio_id");--> statement-breakpoint
CREATE INDEX "cuestionarios_publicado_idx" ON "analitica"."cuestionarios" USING btree ("publicado_en");--> statement-breakpoint
CREATE INDEX "derivaciones_barrio_estado_idx" ON "analitica"."derivaciones" USING btree ("barrio_id","estado");--> statement-breakpoint
CREATE INDEX "derivaciones_competencia_idx" ON "analitica"."derivaciones" USING btree ("competencia");--> statement-breakpoint
CREATE INDEX "derivaciones_ticket_idx" ON "analitica"."derivaciones" USING btree ("ticket");--> statement-breakpoint
CREATE INDEX "encuestadores_barrio_idx" ON "analitica"."encuestadores" USING btree ("barrio_id");--> statement-breakpoint
CREATE INDEX "informes_barrio_idx" ON "analitica"."informes_barrio" USING btree ("barrio_id","generado_en");--> statement-breakpoint
CREATE INDEX "no_respuestas_barrio_motivo_idx" ON "analitica"."no_respuestas" USING btree ("barrio_id","motivo");--> statement-breakpoint
CREATE INDEX "respuestas_barrio_cerrada_idx" ON "analitica"."respuestas" USING btree ("barrio_id","cerrada_en");--> statement-breakpoint
CREATE INDEX "respuestas_vivienda_idx" ON "analitica"."respuestas" USING btree ("vivienda_id");--> statement-breakpoint
CREATE INDEX "usuarios_rol_idx" ON "analitica"."usuarios" USING btree ("rol");--> statement-breakpoint
CREATE INDEX "viviendas_barrio_estado_idx" ON "analitica"."viviendas" USING btree ("barrio_id","estado");--> statement-breakpoint
CREATE INDEX "acuses_ticket_idx" ON "identificada"."acuses" USING btree ("ticket");--> statement-breakpoint
CREATE INDEX "contactos_apellido_dni_idx" ON "identificada"."contactos" USING btree ("apellido","dni_ultimos");--> statement-breakpoint
ALTER TABLE "analitica"."audit_log" ADD CONSTRAINT "audit_log_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "analitica"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_usuario_idx" ON "analitica"."audit_log" USING btree ("usuario_id","ocurrido_en");