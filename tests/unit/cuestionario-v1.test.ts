import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANTIDAD_NUCLEO,
  preguntasDe,
  segundosTotales,
  TECHO_SEGUNDOS,
  verificarCuestionario,
} from '@/lib/cuestionario/basico';
import type { CuestionarioBasico } from '@/lib/cuestionario/basico';

const CUESTIONARIO = JSON.parse(
  readFileSync(resolve(__dirname, '../../docs/cuestionario-v1.json'), 'utf8'),
) as CuestionarioBasico;

function conParche(cambio: (c: CuestionarioBasico) => void): CuestionarioBasico {
  const copia = structuredClone(CUESTIONARIO);
  cambio(copia);
  return copia;
}

describe('cuestionario v1 (el que carga el seed)', () => {
  it('pasa la verificación estructural', () => {
    expect(verificarCuestionario(CUESTIONARIO)).toEqual([]);
  });

  it('entra en los 12 minutos', () => {
    const total = segundosTotales(CUESTIONARIO);
    expect(total).toBeLessThanOrEqual(TECHO_SEGUNDOS);
    expect(total).toBeGreaterThan(0);
  });

  it('tiene exactamente 10 preguntas de núcleo', () => {
    expect(preguntasDe(CUESTIONARIO).filter((p) => p.core).length).toBe(CANTIDAD_NUCLEO);
  });

  it('todas las preguntas declaran qué decisión se toma con la respuesta', () => {
    const sinDecision = preguntasDe(CUESTIONARIO).filter((p) => !p.decision?.trim());
    expect(sinDecision.map((p) => p.id)).toEqual([]);
  });

  it('tiene un bloque autoadministrado con preguntas de seguridad, convivencia y junta vecinal', () => {
    const autoadministradas = preguntasDe(CUESTIONARIO).filter((p) => p.autoadministrada);
    expect(autoadministradas.length).toBeGreaterThan(0);
    const bloque = CUESTIONARIO.bloques.find((b) => b.autoadministrada);
    expect(bloque).toBeDefined();
    expect(bloque?.preguntas.every((p) => p.autoadministrada)).toBe(true);
  });

  it('trae el consentimiento versionado con finalidad declarada', () => {
    expect(CUESTIONARIO.consentimiento.version).toBeTruthy();
    expect(CUESTIONARIO.consentimiento.texto.length).toBeGreaterThan(100);
    expect(CUESTIONARIO.consentimiento.finalidad).toBeTruthy();
  });
});

describe('la verificación rechaza lo que tiene que rechazar', () => {
  it('una pregunta sin decisión', () => {
    const roto = conParche((c) => {
      const primera = c.bloques[0]?.preguntas[0];
      if (primera) primera.decision = '   ';
    });
    expect(verificarCuestionario(roto).join(' ')).toMatch(/no declara qué decisión/);
  });

  it('un cuestionario que se pasa del techo de 12 minutos', () => {
    const roto = conParche((c) => {
      const primera = c.bloques[0]?.preguntas[0];
      if (primera) primera.segundos_estimados += TECHO_SEGUNDOS;
    });
    expect(verificarCuestionario(roto).join(' ')).toMatch(/techo es 720/);
  });

  it('un núcleo que dejó de tener 10 preguntas', () => {
    const roto = conParche((c) => {
      const primera = c.bloques[0]?.preguntas[0];
      if (primera) primera.core = false;
    });
    expect(verificarCuestionario(roto).join(' ')).toMatch(/El núcleo tiene 9/);
  });

  it('ids de pregunta repetidos', () => {
    const roto = conParche((c) => {
      const preguntas = c.bloques[0]?.preguntas;
      if (preguntas?.[0] && preguntas[1]) preguntas[1].id = preguntas[0].id;
    });
    expect(verificarCuestionario(roto).join(' ')).toMatch(/está repetido/);
  });

  it('un consentimiento sin finalidad declarada', () => {
    const roto = conParche((c) => {
      c.consentimiento.finalidad = '';
    });
    expect(verificarCuestionario(roto).join(' ')).toMatch(/finalidad declarada/);
  });
});
