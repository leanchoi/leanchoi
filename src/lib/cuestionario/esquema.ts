import { z } from 'zod';

/**
 * Esquema del cuestionario, compartido por cliente y servidor.
 *
 * Es el lugar donde viven, escritas como código, las reglas que hacen que el
 * instrumento sea publicable:
 *   - regla 2: consentimiento versionado, con finalidad declarada;
 *   - regla 5: cada pregunta declara qué decisión se toma con la respuesta;
 *   - regla 6: cada pregunta declara cuántos segundos lleva;
 *   - regla 7: el núcleo está marcado con `core: true`;
 *   - regla 8: el bloque sensible se marca `autoadministrada: true`.
 *
 * Las claves que empiezan con guión bajo son comentarios para quien edita el JSON
 * y el esquema las descarta.
 */

export const TECHO_SEGUNDOS = 720;
export const CANTIDAD_NUCLEO = 10;

const ID_PREGUNTA = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Sin esto la pregunta no entra al cuestionario (regla de admisión). */
const decision = z
  .string()
  .trim()
  .min(15, 'La decisión declarada es demasiado corta: escribí qué hace el área con esa respuesta.');

const comunes = {
  id: z.string().regex(ID_PREGUNTA, 'El id de la pregunta va en minúsculas y con guiones.'),
  texto: z.string().trim().min(5),
  ayuda: z.string().trim().optional(),
  obligatoria: z.boolean().default(false),
  core: z.boolean().default(false),
  autoadministrada: z.boolean().default(false),
  segundos_estimados: z
    .number()
    .int()
    .min(1, 'Ninguna pregunta lleva cero segundos.')
    .max(TECHO_SEGUNDOS, `Ninguna pregunta puede llevar más que el cuestionario entero.`),
  decision,
};

const opciones = z
  .array(z.string().trim().min(1))
  .min(2, 'Una pregunta cerrada necesita al menos dos opciones.');

export const PreguntaSchema = z.discriminatedUnion('tipo', [
  z.object({ ...comunes, tipo: z.literal('opcion_unica'), opciones }),
  z.object({
    ...comunes,
    tipo: z.literal('opcion_multiple'),
    opciones,
    maximo_opciones: z.number().int().min(1).optional(),
  }),
  z.object({ ...comunes, tipo: z.literal('si_no') }),
  z.object({
    ...comunes,
    tipo: z.literal('numero'),
    minimo: z.number().optional(),
    maximo: z.number().optional(),
  }),
  z.object({
    ...comunes,
    tipo: z.literal('escala'),
    escala: z.object({
      minimo: z.number().int(),
      maximo: z.number().int(),
      etiqueta_minimo: z.string().trim().min(1),
      etiqueta_maximo: z.string().trim().min(1),
    }),
  }),
  z.object({
    ...comunes,
    tipo: z.literal('texto_corto'),
    largo_maximo: z.number().int().optional(),
  }),
  // Se contesta por voz: el audio se desgraba y se descarta (módulo de audio).
  z.object({ ...comunes, tipo: z.literal('abierta_voz') }),
]);

export type Pregunta = z.infer<typeof PreguntaSchema>;
export type TipoPregunta = Pregunta['tipo'];

export const BloqueSchema = z.object({
  id: z.string().regex(ID_PREGUNTA),
  titulo: z.string().trim().min(3),
  area: z.string().trim().optional(),
  /** El bloque entero se contesta en modo vecino (regla 8). */
  autoadministrada: z.boolean().default(false),
  preguntas: z.array(PreguntaSchema).min(1, 'Un bloque sin preguntas no tiene sentido.'),
});

export type Bloque = z.infer<typeof BloqueSchema>;

export const ConsentimientoSchema = z.object({
  version: z.string().trim().min(3),
  titulo: z.string().trim().min(3).default('Antes de empezar'),
  texto: z.string().trim().min(100, 'El texto del consentimiento no puede ser una línea suelta.'),
  finalidad: z.string().trim().min(20, 'Hay que declarar para qué se usan los datos (Ley 25.326).'),
  responsable: z.string().trim().min(3),
  base_legal: z.string().trim().optional(),
});

export type Consentimiento = z.infer<typeof ConsentimientoSchema>;

export const CuestionarioSchema = z.object({
  version: z.number().int().min(1),
  titulo: z.string().trim().min(3),
  changelog: z.string().trim().default(''),
  idioma: z.string().trim().default('es-AR'),
  consentimiento: ConsentimientoSchema,
  bloques: z.array(BloqueSchema).min(1),
});

export type Cuestionario = z.infer<typeof CuestionarioSchema>;

// ---------------------------------------------------------------- utilidades

export function preguntasDe(cuestionario: Cuestionario): Pregunta[] {
  return cuestionario.bloques.flatMap((bloque) => bloque.preguntas);
}

export function segundosTotales(cuestionario: Cuestionario): number {
  return preguntasDe(cuestionario).reduce((suma, p) => suma + p.segundos_estimados, 0);
}

export function nucleoDe(cuestionario: Cuestionario): Pregunta[] {
  return preguntasDe(cuestionario).filter((p) => p.core);
}

export function preguntasAutoadministradas(cuestionario: Cuestionario): Pregunta[] {
  return preguntasDe(cuestionario).filter((p) => p.autoadministrada);
}

/** Las opciones de una pregunta, si el tipo las tiene. */
export function opcionesDe(pregunta: Pregunta): string[] {
  return 'opciones' in pregunta ? pregunta.opciones : [];
}
