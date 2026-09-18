CREATE SCHEMA IF NOT EXISTS "analitica";
--> statement-breakpoint
CREATE TYPE "analitica"."estado_audio" AS ENUM('pendiente', 'procesando', 'transcripto', 'error', 'purgado', 'purgado_sin_transcribir');--> statement-breakpoint
CREATE TABLE "analitica"."audios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket" uuid NOT NULL,
	"pregunta_id" text NOT NULL,
	"barrio_id" uuid,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"duracion_segundos" double precision,
	"sha256" text NOT NULL,
	"ruta_relativa" text,
	"estado" "analitica"."estado_audio" DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"error_detalle" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"transcripto_en" timestamp with time zone,
	"purgado_en" timestamp with time zone,
	"purga_motivo" text
);
--> statement-breakpoint
CREATE TABLE "analitica"."audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"usuario_id" uuid,
	"accion" text NOT NULL,
	"ticket" uuid,
	"motivo" text,
	"metadata" jsonb,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analitica"."transcripciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"audio_id" uuid NOT NULL,
	"ticket" uuid NOT NULL,
	"pregunta_id" text NOT NULL,
	"texto" text NOT NULL,
	"idioma" text,
	"proveedor" text NOT NULL,
	"modelo" text,
	"metadata" jsonb,
	"revisada_por_persona" boolean DEFAULT false NOT NULL,
	"duracion_proceso_ms" integer,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analitica"."transcripciones" ADD CONSTRAINT "transcripciones_audio_id_audios_id_fk" FOREIGN KEY ("audio_id") REFERENCES "analitica"."audios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audios_estado_idx" ON "analitica"."audios" USING btree ("estado","creado_en");--> statement-breakpoint
CREATE INDEX "audios_ticket_idx" ON "analitica"."audios" USING btree ("ticket");--> statement-breakpoint
CREATE INDEX "audit_log_accion_idx" ON "analitica"."audit_log" USING btree ("accion","ocurrido_en");--> statement-breakpoint
CREATE INDEX "transcripciones_ticket_idx" ON "analitica"."transcripciones" USING btree ("ticket");