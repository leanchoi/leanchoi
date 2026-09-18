/**
 * Verificación estructural mínima del cuestionario, usada por el seed para no
 * cargar un instrumento inválido.
 *
 * El motor completo —esquema Zod, núcleo inmutable comparado contra la versión
 * anterior, publicación y changelog— llega en la fase 2. Lo que está acá es el
 * subconjunto que ya se puede exigir hoy.
 */

export const TECHO_SEGUNDOS = 720;
export const CANTIDAD_NUCLEO = 10;

export type PreguntaBasica = {
  id: string;
  texto: string;
  tipo: string;
  segundos_estimados: number;
  decision?: string;
  core?: boolean;
  autoadministrada?: boolean;
};

export type BloqueBasico = {
  id: string;
  titulo: string;
  area?: string;
  autoadministrada?: boolean;
  preguntas: PreguntaBasica[];
};

export type CuestionarioBasico = {
  version: number;
  titulo: string;
  changelog?: string;
  consentimiento: { version: string; texto: string; finalidad: string };
  bloques: BloqueBasico[];
};

export function preguntasDe(cuestionario: CuestionarioBasico): PreguntaBasica[] {
  return cuestionario.bloques.flatMap((b) => b.preguntas);
}

export function segundosTotales(cuestionario: CuestionarioBasico): number {
  return preguntasDe(cuestionario).reduce((suma, p) => suma + (p.segundos_estimados ?? 0), 0);
}

/** Devuelve la lista de problemas. Vacía = el cuestionario se puede cargar. */
export function verificarCuestionario(cuestionario: CuestionarioBasico): string[] {
  const problemas: string[] = [];
  const preguntas = preguntasDe(cuestionario);

  if (preguntas.length === 0) problemas.push('El cuestionario no tiene preguntas.');

  // Regla 5: sin `decision` la pregunta no entra.
  for (const pregunta of preguntas) {
    if (!pregunta.decision || !pregunta.decision.trim()) {
      problemas.push(
        `La pregunta "${pregunta.id}" no declara qué decisión se toma con esa respuesta.`,
      );
    }
    if (!Number.isFinite(pregunta.segundos_estimados) || pregunta.segundos_estimados <= 0) {
      problemas.push(`La pregunta "${pregunta.id}" no declara segundos_estimados válidos.`);
    }
  }

  // Regla 6: techo de 12 minutos.
  const total = segundosTotales(cuestionario);
  if (total > TECHO_SEGUNDOS) {
    problemas.push(
      `El cuestionario dura ${total} segundos y el techo es ${TECHO_SEGUNDOS} (se pasa por ${total - TECHO_SEGUNDOS}).`,
    );
  }

  // Regla 7: el núcleo son exactamente 10 preguntas.
  const nucleo = preguntas.filter((p) => p.core === true);
  if (nucleo.length !== CANTIDAD_NUCLEO) {
    problemas.push(
      `El núcleo tiene ${nucleo.length} preguntas y tienen que ser ${CANTIDAD_NUCLEO}.`,
    );
  }

  // Ids únicos: el payload de las respuestas se indexa por id de pregunta.
  const vistos = new Set<string>();
  for (const pregunta of preguntas) {
    if (vistos.has(pregunta.id))
      problemas.push(`El id de pregunta "${pregunta.id}" está repetido.`);
    vistos.add(pregunta.id);
  }

  // Regla 2: el consentimiento viaja versionado dentro del cuestionario.
  if (!cuestionario.consentimiento?.version?.trim()) {
    problemas.push('Falta la versión del consentimiento.');
  }
  if (!cuestionario.consentimiento?.texto?.trim()) {
    problemas.push('Falta el texto del consentimiento.');
  }
  if (!cuestionario.consentimiento?.finalidad?.trim()) {
    problemas.push('Falta la finalidad declarada del consentimiento (Ley 25.326).');
  }

  return problemas;
}
