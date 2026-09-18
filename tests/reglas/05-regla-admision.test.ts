import { describe, expect, it } from 'vitest';
import { preguntasDe, validarParaPublicar } from '@/lib/cuestionario';
import { conParche, CUESTIONARIO_V1, primeraPregunta } from '../util/cuestionario';

/**
 * REGLA 5: regla de admisión de preguntas.
 *
 * Cada pregunta declara `decision`: qué decisión concreta toma el área con esa
 * respuesta. Sin eso, la pregunta no entra y la versión no se publica.
 */

describe('sin decisión declarada la pregunta no entra', () => {
  it('todas las preguntas del cuestionario vigente declaran su decisión', () => {
    const resultado = validarParaPublicar(CUESTIONARIO_V1, null);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    for (const pregunta of preguntasDe(resultado.cuestionario)) {
      expect(pregunta.decision.trim().length).toBeGreaterThan(14);
    }
  });

  it('una pregunta sin el campo `decision` hace fallar la publicación', () => {
    const roto = conParche((c) => {
      delete (primeraPregunta(c) as { decision?: string }).decision;
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.some((p) => p.regla === 5)).toBe(true);
  });

  it('el error nombra la pregunta que hay que arreglar', () => {
    const roto = conParche((c) => {
      const pregunta = c.bloques[1]?.preguntas[0];
      if (pregunta) pregunta.decision = '';
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    const mensajes = resultado.problemas.map((p) => p.mensaje).join(' ');
    expect(mensajes).toMatch(/bloques\.1\.preguntas\.0\.decision/);
  });

  it('una decisión de compromiso ("es interesante saberlo") no pasa el filtro', () => {
    const roto = conParche((c) => {
      primeraPregunta(c).decision = 'Sirve.';
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.some((p) => p.regla === 5)).toBe(true);
  });
});
