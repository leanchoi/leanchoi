import { describe, expect, it } from 'vitest';
import {
  CANTIDAD_NUCLEO,
  CuestionarioSchema,
  nucleoDe,
  validarParaPublicar,
} from '@/lib/cuestionario';
import type { Cuestionario } from '@/lib/cuestionario';
import { conParche, CUESTIONARIO_V1 } from '../util/cuestionario';

/**
 * REGLA 7: núcleo inmutable.
 *
 * Las 10 preguntas marcadas `core: true` no pueden cambiar de redacción ni de
 * opciones entre versiones. Es lo que permite comparar barrios entre sí y repetir
 * el relevamiento el año que viene.
 */

const V1 = CuestionarioSchema.parse(CUESTIONARIO_V1) as Cuestionario;

/** Una versión 2 con el cambio que se quiera probar. */
function version2(
  cambio: (c: Parameters<typeof conParche>[0] extends (c: infer T) => void ? T : never) => void,
): unknown {
  return conParche((c) => {
    c.version = 2;
    c.changelog = 'Versión de prueba.';
    cambio(c);
  });
}

describe('el núcleo son 10 preguntas y no se toca', () => {
  it('el cuestionario vigente tiene exactamente 10 preguntas de núcleo', () => {
    expect(nucleoDe(V1)).toHaveLength(CANTIDAD_NUCLEO);
  });

  it('una versión nueva idéntica en el núcleo se publica', () => {
    const resultado = validarParaPublicar(
      version2(() => {}),
      V1,
    );
    expect(resultado.ok).toBe(true);
  });

  it('cambiar la redacción de una pregunta de núcleo hace fallar la publicación', () => {
    const nueva = version2((c) => {
      const pregunta = c.bloques[0]?.preguntas[0];
      if (pregunta) pregunta.texto = '¿Desde qué año vive en este barrio?';
    });
    const resultado = validarParaPublicar(nueva, V1);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    const problema = resultado.problemas.find((p) => p.regla === 7);
    expect(problema?.codigo).toBe('nucleo_modificado');
    expect(problema?.mensaje).toContain('nucleo-01');
    expect(problema?.mensaje).toMatch(/cambió la redacción/);
  });

  it('cambiar una opción de una pregunta de núcleo hace fallar la publicación', () => {
    const nueva = version2((c) => {
      const pregunta = c.bloques[0]?.preguntas[0];
      if (pregunta?.opciones) pregunta.opciones[0] = 'Menos de dos años';
    });
    const resultado = validarParaPublicar(nueva, V1);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.find((p) => p.regla === 7)?.mensaje).toMatch(
      /cambiaron las opciones/,
    );
  });

  it('hasta cambiar el ORDEN de las opciones hace fallar: el orden sesga la respuesta', () => {
    const nueva = version2((c) => {
      const pregunta = c.bloques[0]?.preguntas[0];
      if (pregunta?.opciones) pregunta.opciones.reverse();
    });
    expect(validarParaPublicar(nueva, V1).ok).toBe(false);
  });

  it('un espacio de más no cuenta como cambio de redacción', () => {
    const nueva = version2((c) => {
      const pregunta = c.bloques[0]?.preguntas[0];
      if (pregunta) pregunta.texto = `  ${pregunta.texto.replace(' ', '  ')}  `;
    });
    expect(validarParaPublicar(nueva, V1).ok).toBe(true);
  });

  it('sacar una pregunta del núcleo hace fallar la publicación', () => {
    const nueva = version2((c) => {
      const pregunta = c.bloques[0]?.preguntas[0];
      if (pregunta) pregunta.core = false;
    });
    const resultado = validarParaPublicar(nueva, V1);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.map((p) => p.codigo)).toContain('nucleo_incompleto');
  });

  it('agregar una pregunta al núcleo también hace fallar', () => {
    const nueva = version2((c) => {
      const primera = c.bloques[0]?.preguntas[0];
      const deArea = c.bloques[1]?.preguntas[0];
      if (primera) primera.core = false;
      if (deArea) deArea.core = true;
    });
    const resultado = validarParaPublicar(nueva, V1);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.map((p) => p.codigo)).toContain('nucleo_pregunta_agregada');
    expect(resultado.problemas.map((p) => p.codigo)).toContain('nucleo_pregunta_eliminada');
  });
});

describe('los bloques de área sí cambian libremente', () => {
  it('se puede reescribir una pregunta de área entre versiones', () => {
    const nueva = version2((c) => {
      const pregunta = c.bloques[1]?.preguntas[0];
      if (pregunta) {
        pregunta.texto = '¿La vereda de su casa está en condiciones?';
        if (pregunta.opciones) pregunta.opciones = ['Sí', 'No', 'No hay vereda'];
      }
    });
    expect(validarParaPublicar(nueva, V1).ok).toBe(true);
  });

  it('la versión nueva tiene que avanzar el número', () => {
    const resultado = validarParaPublicar(CUESTIONARIO_V1, V1);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.map((p) => p.codigo)).toContain('version_no_avanza');
  });
});
