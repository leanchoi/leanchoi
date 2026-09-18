import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * REGLA 10: cuestionario público.
 *
 * `/cuestionario` muestra la versión vigente completa, con fecha de publicación y
 * changelog, sin pedir login. Es el mecanismo de transparencia del operativo.
 *
 * Acá se verifica que la ruta no tenga ninguna puerta de acceso. Que muestre todo
 * el contenido se verifica de punta a punta en `tests/e2e/cuestionario.spec.ts`.
 */

const RAIZ = resolve(__dirname, '../..');
const PAGINA = readFileSync(join(RAIZ, 'src/app/cuestionario/page.tsx'), 'utf8');
const API = readFileSync(join(RAIZ, 'src/app/api/cuestionario/route.ts'), 'utf8');

describe('la ruta pública del cuestionario no pide login', () => {
  it('no lee cookies, sesión ni encabezados de autorización', () => {
    for (const fuente of [PAGINA, API]) {
      expect(fuente).not.toMatch(/cookies\(\)|getSession|requireRol|authorization|redirect\(/i);
    }
  });

  it('muestra la versión, la fecha de publicación y el changelog', () => {
    expect(PAGINA).toMatch(/listarVersiones/);
    expect(PAGINA).toMatch(/publicadoEn/);
    expect(PAGINA).toMatch(/changelog/);
  });

  it('publica también el motivo de cada pregunta', () => {
    expect(PAGINA).toContain('Para qué se pregunta');
    expect(PAGINA).toContain('pregunta.decision');
  });

  it('no toca ninguna tabla de respuestas ni de contactos', () => {
    const REPOSITORIO = readFileSync(join(RAIZ, 'src/lib/cuestionario/repositorio.ts'), 'utf8');

    // Ni la página ni la API leen tablas directamente: pasan por el repositorio.
    for (const fuente of [PAGINA, API]) {
      expect(fuente).not.toMatch(/from '@\/db(\/schema)?'/);
    }

    // Y el repositorio solo conoce la tabla del instrumento.
    const importadas = /import \{([^}]+)\} from '@\/db\/schema'/.exec(REPOSITORIO)?.[1] ?? '';
    expect(importadas.split(',').map((t) => t.trim())).toEqual(['cuestionarios']);
    expect(REPOSITORIO).not.toMatch(/identificada|contactos|acuses/);
  });

  it('es indexable: la transparencia no se esconde de los buscadores', () => {
    expect(PAGINA).toMatch(/robots:\s*\{\s*index:\s*true/);
  });
});
