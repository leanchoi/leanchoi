import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validarParaPublicar } from '@/lib/cuestionario';
import { conParche, CUESTIONARIO_V1 } from '../util/cuestionario';

/**
 * REGLA 2: consentimiento explícito.
 *
 * No se puede iniciar una encuesta sin registrar el consentimiento con la finalidad
 * declarada (Ley 25.326). El texto se versiona junto al cuestionario y se guarda qué
 * versión aceptó cada vecino.
 */

const RAIZ = resolve(__dirname, '../..');

function sqlDeMigraciones(): string {
  const carpeta = join(RAIZ, 'drizzle');
  return readdirSync(carpeta)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(carpeta, f), 'utf8'))
    .join('\n');
}

describe('el consentimiento viaja versionado con el cuestionario', () => {
  it('el cuestionario vigente lo trae completo', () => {
    const resultado = validarParaPublicar(CUESTIONARIO_V1, null);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const { consentimiento } = resultado.cuestionario;
    expect(consentimiento.version).toBeTruthy();
    expect(consentimiento.finalidad.length).toBeGreaterThan(20);
    expect(consentimiento.responsable).toBeTruthy();
  });

  it('sin consentimiento no se publica', () => {
    const roto = conParche((c) => {
      delete (c as { consentimiento?: unknown }).consentimiento;
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.some((p) => p.regla === 2)).toBe(true);
  });

  it('sin finalidad declarada no se publica', () => {
    const roto = conParche((c) => {
      c.consentimiento.finalidad = '';
    });
    const resultado = validarParaPublicar(roto, null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.some((p) => p.regla === 2)).toBe(true);
  });

  it('sin versión del consentimiento no se publica', () => {
    const roto = conParche((c) => {
      c.consentimiento.version = '';
    });
    expect(validarParaPublicar(roto, null).ok).toBe(false);
  });

  it('un texto de una línea no alcanza como consentimiento', () => {
    const roto = conParche((c) => {
      c.consentimiento.texto = 'Autoriza?';
    });
    expect(validarParaPublicar(roto, null).ok).toBe(false);
  });
});

describe('la base exige el consentimiento de cada vecino', () => {
  it('respuestas.consentimiento_version es NOT NULL', () => {
    const sql = sqlDeMigraciones();
    expect(sql).toMatch(/"consentimiento_version" text NOT NULL/);
  });

  it('cada versión del cuestionario guarda qué consentimiento le corresponde', () => {
    const schema = readFileSync(join(RAIZ, 'src/db/schema/analitica.ts'), 'utf8');
    expect(schema).toMatch(/consentimientoVersion: text\('consentimiento_version'\)\.notNull\(\)/);
  });
});
