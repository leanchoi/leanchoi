import { describe, expect, it } from 'vitest';
import {
  CuestionarioSchema,
  nucleoDe,
  preguntasDe,
  PreguntaSchema,
  segundosTotales,
  validarParaPublicar,
} from '@/lib/cuestionario';
import { conParche, CUESTIONARIO_V1, primeraPregunta } from '../util/cuestionario';

describe('el cuestionario v1 pasa el motor completo', () => {
  it('valida y se puede publicar', () => {
    const resultado = validarParaPublicar(CUESTIONARIO_V1, null);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.segundosTotales).toBeLessThanOrEqual(720);
    expect(nucleoDe(resultado.cuestionario)).toHaveLength(10);
    expect(preguntasDe(resultado.cuestionario).length).toBeGreaterThan(10);
  });

  it('descarta los comentarios del JSON pero conserva el contenido', () => {
    const parseo = CuestionarioSchema.safeParse(CUESTIONARIO_V1);
    expect(parseo.success).toBe(true);
    if (!parseo.success) return;
    expect(Object.keys(parseo.data)).not.toContain('_lea_esto_primero');
    expect(parseo.data.bloques[0]?.preguntas[0]?.texto).toBeTruthy();
    expect(segundosTotales(parseo.data)).toBe(675);
  });
});

describe('esquema de una pregunta', () => {
  const base = {
    id: 'prueba-01',
    texto: '¿Una pregunta de prueba?',
    obligatoria: true,
    segundos_estimados: 20,
    decision: 'Sirve para decidir algo concreto en el área.',
  };

  it('exige opciones en las preguntas cerradas', () => {
    expect(PreguntaSchema.safeParse({ ...base, tipo: 'opcion_unica' }).success).toBe(false);
    expect(
      PreguntaSchema.safeParse({ ...base, tipo: 'opcion_unica', opciones: ['Una sola'] }).success,
    ).toBe(false);
    expect(
      PreguntaSchema.safeParse({ ...base, tipo: 'opcion_unica', opciones: ['Sí', 'No'] }).success,
    ).toBe(true);
  });

  it('exige la escala completa en las preguntas de escala', () => {
    expect(PreguntaSchema.safeParse({ ...base, tipo: 'escala' }).success).toBe(false);
    expect(
      PreguntaSchema.safeParse({
        ...base,
        tipo: 'escala',
        escala: { minimo: 1, maximo: 5, etiqueta_minimo: 'Mal', etiqueta_maximo: 'Bien' },
      }).success,
    ).toBe(true);
  });

  it('rechaza tipos que no existen y ids mal formados', () => {
    expect(PreguntaSchema.safeParse({ ...base, tipo: 'ranking' }).success).toBe(false);
    expect(PreguntaSchema.safeParse({ ...base, id: 'Pregunta 1', tipo: 'si_no' }).success).toBe(
      false,
    );
  });

  it('las preguntas por voz no necesitan opciones', () => {
    expect(PreguntaSchema.safeParse({ ...base, tipo: 'abierta_voz' }).success).toBe(true);
  });
});

describe('el motor informa todos los problemas juntos', () => {
  it('junta todos los problemas de estructura en una sola pasada', () => {
    const roto = conParche((c) => {
      const preguntas = c.bloques[0]?.preguntas ?? [];
      if (preguntas[0]) preguntas[0].decision = '';
      if (preguntas[1]) preguntas[1].decision = '';
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas).toHaveLength(2);
    expect(resultado.problemas.every((p) => p.regla === 5)).toBe(true);
  });

  it('junta todos los problemas de reglas en una sola pasada', () => {
    const roto = conParche((c) => {
      const pregunta = primeraPregunta(c);
      pregunta.core = false; // el núcleo queda en 9
      pregunta.segundos_estimados += 60; // y el cuestionario se pasa del techo (735 s)
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.map((p) => p.regla).sort()).toEqual([6, 7]);
  });

  it('avisa cuando queda poco margen de tiempo, sin bloquear', () => {
    const justo = conParche((c) => {
      const pregunta = primeraPregunta(c);
      pregunta.segundos_estimados += 720 - 675 - 10; // deja 10 segundos de margen
    });
    const resultado = validarParaPublicar(justo, null);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.advertencias.join(' ')).toMatch(/margen/);
  });
});
