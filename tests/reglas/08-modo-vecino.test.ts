import { describe, expect, it } from 'vitest';
import {
  CuestionarioSchema,
  preguntasAutoadministradas,
  validarParaPublicar,
} from '@/lib/cuestionario';
import { conParche, CUESTIONARIO_V1 } from '../util/cuestionario';

/**
 * REGLA 8: bloque sensible autoadministrado.
 *
 * Las preguntas de seguridad, convivencia y evaluación de la junta vecinal se
 * contestan en modo vecino: el encuestador entrega el celular y al cerrar el bloque
 * no puede volver atrás a verlo.
 *
 * Acá se verifica la parte que vive en el instrumento: que el bloque exista y que
 * esté marcado de forma coherente. La parte de interfaz —pantalla limpia, sin vuelta
 * atrás— se verifica en la fase 3, cuando exista la app de campo.
 */

describe('el instrumento declara el bloque autoadministrado', () => {
  it('el cuestionario vigente tiene un bloque autoadministrado con sus preguntas marcadas', () => {
    const cuestionario = CuestionarioSchema.parse(CUESTIONARIO_V1);
    const bloques = cuestionario.bloques.filter((b) => b.autoadministrada);
    expect(bloques).toHaveLength(1);
    expect(bloques[0]?.preguntas.every((p) => p.autoadministrada)).toBe(true);
    expect(preguntasAutoadministradas(cuestionario).length).toBeGreaterThan(0);
  });

  it('un bloque autoadministrado con una pregunta sin marcar no se publica', () => {
    const roto = conParche((c) => {
      const bloque = c.bloques.find((b) => b.autoadministrada);
      const pregunta = bloque?.preguntas[0];
      if (pregunta) pregunta.autoadministrada = false;
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.map((p) => p.codigo)).toContain(
      'bloque_autoadministrado_inconsistente',
    );
  });

  it('una pregunta autoadministrada suelta en un bloque común no se publica', () => {
    const roto = conParche((c) => {
      const pregunta = c.bloques[1]?.preguntas[0];
      if (pregunta) pregunta.autoadministrada = true;
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.map((p) => p.codigo)).toContain('autoadministrada_fuera_de_bloque');
  });

  it('el bloque cubre seguridad, convivencia y la propia junta vecinal', () => {
    const cuestionario = CuestionarioSchema.parse(CUESTIONARIO_V1);
    const textos = preguntasAutoadministradas(cuestionario)
      .map((p) => p.texto.toLowerCase())
      .join(' ');
    expect(textos).toMatch(/segur/);
    expect(textos).toMatch(/convivencia/);
    expect(textos).toMatch(/junta vecinal/);
  });
});
