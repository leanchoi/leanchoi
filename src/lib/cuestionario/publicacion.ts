import type { z } from 'zod';
import {
  CANTIDAD_NUCLEO,
  CuestionarioSchema,
  nucleoDe,
  opcionesDe,
  preguntasDe,
  segundosTotales,
  TECHO_SEGUNDOS,
} from './esquema';
import type { Cuestionario, Pregunta } from './esquema';

/**
 * Motor de publicación del cuestionario.
 *
 * Una versión se publica solo si pasa TODAS las reglas. Los problemas se devuelven
 * juntos y con el número de regla, para que quien arma el instrumento sepa qué
 * corregir sin adivinar.
 */

export type Problema = {
  /** Número de regla en docs/reglas-de-negocio.md. 0 = estructura del JSON. */
  regla: number;
  codigo: string;
  mensaje: string;
};

export type ResultadoValidacion =
  | { ok: true; cuestionario: Cuestionario; segundosTotales: number; advertencias: string[] }
  | { ok: false; problemas: Problema[] };

/** Un mismo texto con distinto espaciado es el mismo texto; con otra palabra, no. */
function normalizarTexto(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

function reglaDelIssue(issue: z.core.$ZodIssue): number {
  const ruta = issue.path.join('.');
  if (ruta.includes('decision')) return 5;
  if (ruta.includes('segundos_estimados')) return 6;
  if (ruta.includes('consentimiento')) return 2;
  return 0;
}

function problemasDeEsquema(error: z.ZodError): Problema[] {
  return error.issues.map((issue) => {
    const ruta = issue.path.join('.') || '(raíz)';
    return {
      regla: reglaDelIssue(issue),
      codigo: 'estructura',
      mensaje: `${ruta}: ${issue.message}`,
    };
  });
}

/** Comparación del núcleo: texto, tipo y opciones tienen que ser idénticos. */
function diferenciasDeNucleo(anterior: Pregunta, nueva: Pregunta): string[] {
  const diferencias: string[] = [];

  if (normalizarTexto(anterior.texto) !== normalizarTexto(nueva.texto)) {
    diferencias.push(`cambió la redacción ("${anterior.texto}" → "${nueva.texto}")`);
  }
  if (anterior.tipo !== nueva.tipo) {
    diferencias.push(`cambió el tipo (${anterior.tipo} → ${nueva.tipo})`);
  }

  const opcionesAnteriores = opcionesDe(anterior).map(normalizarTexto);
  const opcionesNuevas = opcionesDe(nueva).map(normalizarTexto);
  if (opcionesAnteriores.join('|') !== opcionesNuevas.join('|')) {
    diferencias.push(
      `cambiaron las opciones ([${opcionesAnteriores.join(', ')}] → [${opcionesNuevas.join(', ')}])`,
    );
  }

  if ('escala' in anterior || 'escala' in nueva) {
    const a = 'escala' in anterior ? JSON.stringify(anterior.escala) : null;
    const b = 'escala' in nueva ? JSON.stringify(nueva.escala) : null;
    if (a !== b) diferencias.push('cambió la escala');
  }

  return diferencias;
}

/**
 * Valida una definición contra todas las reglas. Si se pasa la versión publicada
 * anterior, además compara el núcleo inmutable (regla 7).
 */
export function validarParaPublicar(
  definicionCruda: unknown,
  anterior?: Cuestionario | null,
): ResultadoValidacion {
  const parseo = CuestionarioSchema.safeParse(definicionCruda);
  if (!parseo.success) {
    return { ok: false, problemas: problemasDeEsquema(parseo.error) };
  }

  const cuestionario = parseo.data;
  const preguntas = preguntasDe(cuestionario);
  const problemas: Problema[] = [];
  const advertencias: string[] = [];

  // --- ids únicos: el payload de las respuestas se indexa por id de pregunta.
  const vistos = new Set<string>();
  for (const pregunta of preguntas) {
    if (vistos.has(pregunta.id)) {
      problemas.push({
        regla: 0,
        codigo: 'id_repetido',
        mensaje: `El id de pregunta "${pregunta.id}" está repetido.`,
      });
    }
    vistos.add(pregunta.id);
  }

  // --- regla 6: techo de 12 minutos.
  const total = segundosTotales(cuestionario);
  if (total > TECHO_SEGUNDOS) {
    problemas.push({
      regla: 6,
      codigo: 'techo_superado',
      mensaje:
        `El cuestionario dura ${total} segundos (${(total / 60).toFixed(1)} minutos) y el techo es ` +
        `${TECHO_SEGUNDOS}. Se pasa por ${total - TECHO_SEGUNDOS} segundos: hay que sacar preguntas.`,
    });
  } else if (TECHO_SEGUNDOS - total < 30) {
    advertencias.push(
      `Quedan ${TECHO_SEGUNDOS - total} segundos de margen: cualquier pregunta nueva va a hacer fallar la publicación.`,
    );
  }

  // --- regla 7: el núcleo son exactamente 10 preguntas.
  const nucleo = nucleoDe(cuestionario);
  if (nucleo.length !== CANTIDAD_NUCLEO) {
    problemas.push({
      regla: 7,
      codigo: 'nucleo_incompleto',
      mensaje: `El núcleo tiene ${nucleo.length} preguntas marcadas \`core\` y tienen que ser ${CANTIDAD_NUCLEO}.`,
    });
  }

  // --- regla 8: coherencia del bloque autoadministrado.
  for (const bloque of cuestionario.bloques) {
    if (bloque.autoadministrada) {
      const sueltas = bloque.preguntas.filter((p) => !p.autoadministrada);
      if (sueltas.length > 0) {
        problemas.push({
          regla: 8,
          codigo: 'bloque_autoadministrado_inconsistente',
          mensaje:
            `El bloque "${bloque.id}" es autoadministrado pero sus preguntas ` +
            `${sueltas.map((p) => p.id).join(', ')} no están marcadas como tales.`,
        });
      }
    }
  }
  const autoadministradasSueltas = cuestionario.bloques
    .filter((b) => !b.autoadministrada)
    .flatMap((b) => b.preguntas.filter((p) => p.autoadministrada));
  if (autoadministradasSueltas.length > 0) {
    problemas.push({
      regla: 8,
      codigo: 'autoadministrada_fuera_de_bloque',
      mensaje:
        `Las preguntas ${autoadministradasSueltas.map((p) => p.id).join(', ')} son autoadministradas ` +
        'pero están en un bloque que no lo es: el modo vecino se entrega por bloque, no por pregunta.',
    });
  }
  if (nucleo.some((p) => p.autoadministrada)) {
    advertencias.push(
      'Hay preguntas de núcleo dentro del bloque autoadministrado: el encuestador no va a poder revisarlas.',
    );
  }

  // --- comparación con la versión publicada anterior.
  if (anterior) {
    if (cuestionario.version <= anterior.version) {
      problemas.push({
        regla: 0,
        codigo: 'version_no_avanza',
        mensaje: `La versión ${cuestionario.version} no es posterior a la vigente (${anterior.version}).`,
      });
    }

    const nucleoAnterior = new Map(nucleoDe(anterior).map((p) => [p.id, p]));
    const nucleoNuevo = new Map(nucleo.map((p) => [p.id, p]));

    for (const [id, preguntaAnterior] of nucleoAnterior) {
      const preguntaNueva = nucleoNuevo.get(id);
      if (!preguntaNueva) {
        problemas.push({
          regla: 7,
          codigo: 'nucleo_pregunta_eliminada',
          mensaje: `La pregunta de núcleo "${id}" desapareció: el núcleo no se toca entre versiones.`,
        });
        continue;
      }
      const diferencias = diferenciasDeNucleo(preguntaAnterior, preguntaNueva);
      if (diferencias.length > 0) {
        problemas.push({
          regla: 7,
          codigo: 'nucleo_modificado',
          mensaje: `La pregunta de núcleo "${id}" ${diferencias.join('; ')}.`,
        });
      }
    }

    for (const id of nucleoNuevo.keys()) {
      if (!nucleoAnterior.has(id)) {
        problemas.push({
          regla: 7,
          codigo: 'nucleo_pregunta_agregada',
          mensaje: `La pregunta "${id}" se agregó al núcleo: el núcleo no se amplía entre versiones.`,
        });
      }
    }
  }

  if (problemas.length > 0) return { ok: false, problemas };
  return { ok: true, cuestionario, segundosTotales: total, advertencias };
}

/** Mensaje de error listo para consola o para la API. */
export function describirProblemas(problemas: Problema[]): string {
  return problemas
    .map((p) => `  - [regla ${p.regla || '—'} · ${p.codigo}] ${p.mensaje}`)
    .join('\n');
}
