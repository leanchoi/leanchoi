import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** El cuestionario v1 real, el que carga el seed. */
export const CUESTIONARIO_V1: Record<string, unknown> = JSON.parse(
  readFileSync(resolve(__dirname, '../../docs/cuestionario-v1.json'), 'utf8'),
) as Record<string, unknown>;

type Editable = {
  version: number;
  changelog: string;
  consentimiento: Record<string, string>;
  bloques: {
    id: string;
    autoadministrada?: boolean;
    preguntas: {
      id: string;
      texto: string;
      tipo: string;
      opciones?: string[];
      core?: boolean;
      autoadministrada?: boolean;
      segundos_estimados: number;
      decision: string;
    }[];
  }[];
};

/** Copia del v1 con un retoque, para probar qué rechaza el motor. */
export function conParche(cambio: (c: Editable) => void): unknown {
  const copia = structuredClone(CUESTIONARIO_V1) as Editable;
  cambio(copia);
  return copia;
}

export function primeraPregunta(c: Editable) {
  const pregunta = c.bloques[0]?.preguntas[0];
  if (!pregunta) throw new Error('El cuestionario de prueba no tiene preguntas.');
  return pregunta;
}
