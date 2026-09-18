import { describe, expect, it } from 'vitest';
import { BARRIOS_ESQUEL } from '@/db/datos/barrios-esquel';

describe('listado de barrios del seed', () => {
  it('trae los 15 barrios del listado inicial', () => {
    expect(BARRIOS_ESQUEL).toHaveLength(15);
    expect(BARRIOS_ESQUEL.map((b) => b.nombre)).toContain('28 de Junio');
    expect(BARRIOS_ESQUEL.map((b) => b.nombre)).toContain('Lennart Englund');
  });

  it('no repite nombres ni slugs', () => {
    expect(new Set(BARRIOS_ESQUEL.map((b) => b.nombre)).size).toBe(BARRIOS_ESQUEL.length);
    expect(new Set(BARRIOS_ESQUEL.map((b) => b.slug)).size).toBe(BARRIOS_ESQUEL.length);
  });

  it('los slugs son urls limpias: minúsculas, sin acentos ni espacios', () => {
    for (const barrio of BARRIOS_ESQUEL) {
      expect(barrio.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});
