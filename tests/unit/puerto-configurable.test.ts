import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regla de infraestructura: el puerto se define UNA sola vez, en la variable de
 * entorno PORT. Este test recorre el código y falla si aparece un puerto literal
 * en una línea que no esté hablando de PORT.
 */

const RAIZ = resolve(__dirname, '../..');
const CARPETAS = ['src', 'scripts'];
const ARCHIVOS_SUELTOS = [
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.dev.yml',
  'playwright.config.ts',
  'next.config.ts',
  'vitest.config.ts',
];
const PUERTOS_SOSPECHOSOS = /\b(3000|8080|5432)\b/;

function listarArchivos(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return listarArchivos(ruta);
    return /\.(ts|tsx|mjs|js|css)$/.test(entrada) ? [ruta] : [];
  });
}

function lineasConPuertoHardcodeado(ruta: string): string[] {
  return (
    readFileSync(ruta, 'utf8')
      .split('\n')
      .map((linea, i) => ({ linea, i: i + 1 }))
      .filter(({ linea }) => PUERTOS_SOSPECHOSOS.test(linea))
      // Se permite un literal solo como valor por defecto junto a la variable de entorno.
      .filter(({ linea }) => !/PORT|POSTGRES_PUBLIC_PORT/i.test(linea))
      .map(({ linea, i }) => `${relative(RAIZ, ruta)}:${i}: ${linea.trim()}`)
  );
}

describe('el puerto es totalmente configurable por entorno', () => {
  it('no hay puertos hardcodeados en el código ni en la infraestructura', () => {
    const archivos = [
      ...CARPETAS.flatMap((c) => listarArchivos(join(RAIZ, c))),
      ...ARCHIVOS_SUELTOS.map((f) => join(RAIZ, f)),
    ];
    const hallazgos = archivos.flatMap(lineasConPuertoHardcodeado);
    expect(hallazgos).toEqual([]);
  });

  it('docker compose publica el puerto que define .env', () => {
    const compose = readFileSync(join(RAIZ, 'docker-compose.yml'), 'utf8');
    expect(compose).toContain('${PORT}:${PORT}');
    expect(compose).toContain('PORT: ${PORT:?Falta PORT en .env}');
  });

  it('.env.example documenta PORT', () => {
    const ejemplo = readFileSync(join(RAIZ, '.env.example'), 'utf8');
    expect(ejemplo).toMatch(/^PORT=/m);
  });
});
