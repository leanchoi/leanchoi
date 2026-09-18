import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { segundosTotales, TECHO_SEGUNDOS, validarParaPublicar } from '@/lib/cuestionario';
import { conParche, CUESTIONARIO_V1, primeraPregunta } from '../util/cuestionario';

/**
 * REGLA 6: techo de 12 minutos.
 *
 * Cada pregunta declara `segundos_estimados`. Si el total pasa de 720, la
 * publicación falla con error explícito. La duración real de cada encuesta se mide
 * y se guarda.
 */

const RAIZ = resolve(__dirname, '../..');

/** Lleva el cuestionario exactamente a `objetivo` segundos. */
function cuestionarioDe(objetivo: number): unknown {
  const actual = 675;
  return conParche((c) => {
    primeraPregunta(c).segundos_estimados += objetivo - actual;
  });
}

describe('el cuestionario no puede pasar de 720 segundos', () => {
  it('el techo es 12 minutos', () => {
    expect(TECHO_SEGUNDOS).toBe(12 * 60);
  });

  it('exactamente 720 segundos se publica', () => {
    const resultado = validarParaPublicar(cuestionarioDe(720), null);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.segundosTotales).toBe(720);
  });

  it('721 segundos no se publica', () => {
    const resultado = validarParaPublicar(cuestionarioDe(721), null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.some((p) => p.regla === 6)).toBe(true);
  });

  it('el error dice por cuánto se pasa, para saber qué sacar', () => {
    const resultado = validarParaPublicar(cuestionarioDe(800), null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    const mensaje = resultado.problemas.find((p) => p.regla === 6)?.mensaje ?? '';
    expect(mensaje).toContain('800');
    expect(mensaje).toMatch(/pasa por 80 segundos/);
  });

  it('el cuestionario vigente entra en el techo', () => {
    const resultado = validarParaPublicar(CUESTIONARIO_V1, null);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(segundosTotales(resultado.cuestionario)).toBeLessThanOrEqual(TECHO_SEGUNDOS);
  });
});

describe('la duración real se mide y se guarda', () => {
  it('la tabla de respuestas tiene la apertura, el cierre y la duración', () => {
    const schema = readFileSync(join(RAIZ, 'src/db/schema/analitica.ts'), 'utf8');
    expect(schema).toContain("abiertaEn: timestamp('abierta_en'");
    expect(schema).toContain("cerradaEn: timestamp('cerrada_en'");
    expect(schema).toContain("duracionSegundos: integer('duracion_segundos')");
  });
});
