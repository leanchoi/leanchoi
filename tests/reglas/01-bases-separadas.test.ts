import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * REGLA 1: dos bases separadas.
 *
 * `analitica` guarda respuestas sin ningún dato identificatorio; `identificada`
 * guarda quién es quién sin ninguna respuesta. No hay foreign key navegable entre
 * ambos schemas: el único puente es el `ticket`.
 *
 * Este test mira el código y el SQL de las migraciones, así que corre sin base.
 */

const RAIZ = resolve(__dirname, '../..');
const ANALITICA = readFileSync(join(RAIZ, 'src/db/schema/analitica.ts'), 'utf8');
const IDENTIFICADA = readFileSync(join(RAIZ, 'src/db/schema/identificada.ts'), 'utf8');

function sqlDeMigraciones(): string {
  const carpeta = join(RAIZ, 'drizzle');
  return readdirSync(carpeta)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(carpeta, f), 'utf8'))
    .join('\n');
}

describe('los dos schemas están separados', () => {
  it('ningún schema importa el otro', () => {
    expect(IDENTIFICADA).not.toMatch(/from\s+['"]\.\/analitica['"]/);
    expect(ANALITICA).not.toMatch(/from\s+['"]\.\/identificada['"]/);
  });

  it('no hay ninguna foreign key que cruce de un schema al otro', () => {
    const sql = sqlDeMigraciones();
    const claves = [
      ...sql.matchAll(/ALTER TABLE "(\w+)"\."[^"]+" ADD CONSTRAINT [^;]*REFERENCES "(\w+)"\./g),
    ];
    expect(claves.length).toBeGreaterThan(0); // hay FKs internas: el test está mirando algo real
    const cruces = claves.filter(([, origen, destino]) => origen !== destino);
    expect(cruces.map((c) => c[0])).toEqual([]);
  });

  it('`analitica` no tiene columnas identificatorias del vecino', () => {
    const prohibidas = ['dni', 'apellido', 'telefono', 'email', 'domicilio', 'direccion'];
    const encontradas = prohibidas.filter((c) => new RegExp(`['"\`]${c}`, 'i').test(ANALITICA));
    expect(encontradas).toEqual([]);
  });

  it('`identificada` no guarda respuestas', () => {
    const prohibidas = ['payload', 'respuesta', 'cuestionario_version', 'consentimiento_version'];
    const encontradas = prohibidas.filter((c) => new RegExp(`['"\`]${c}`, 'i').test(IDENTIFICADA));
    expect(encontradas).toEqual([]);
  });

  it('el ticket existe de los dos lados, como columna suelta', () => {
    expect(ANALITICA).toMatch(/ticket: uuid\('ticket'\)/);
    expect(IDENTIFICADA).toMatch(/ticket: uuid\('ticket'\)/);
    // y del lado identificada nunca con .references()
    const lineasTicket = IDENTIFICADA.split('\n').filter((l) => l.includes("uuid('ticket')"));
    expect(lineasTicket.every((l) => !l.includes('references'))).toBe(true);
  });

  it('el DNI del vecino se guarda recortado a 3 dígitos', () => {
    expect(IDENTIFICADA).toMatch(/dniUltimos: varchar\('dni_ultimos', \{ length: 3 \}\)/);
  });

  it('la bitácora de auditoría existe y guarda usuario, motivo y momento', () => {
    expect(ANALITICA).toMatch(/auditLog = analitica\.table\(/);
    for (const campo of ['usuarioId', 'accion', 'motivo', 'ocurridoEn']) {
      expect(ANALITICA).toContain(campo);
    }
  });
});
