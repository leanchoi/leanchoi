ALTER TABLE "analitica"."respuestas" ADD COLUMN "codigo" text;--> statement-breakpoint
ALTER TABLE "analitica"."respuestas" ADD CONSTRAINT "respuestas_codigo_unique" UNIQUE("codigo");