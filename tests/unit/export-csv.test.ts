import { describe, expect, it } from 'vitest';
import { aCsv, escaparCampo } from '@/lib/tablero/export';

/**
 * El CSV que se lleva el municipio: tiene que abrirse bien en Excel y no tiene que
 * llevar nada que permita volver al vecino.
 */

describe('armado del CSV', () => {
  it('escapa comas, comillas y saltos de línea', () => {
    expect(escaparCampo('simple')).toBe('simple');
    expect(escaparCampo('con, coma')).toBe('"con, coma"');
    expect(escaparCampo('con "comillas"')).toBe('"con ""comillas"""');
    expect(escaparCampo('con\nsalto')).toBe('"con\nsalto"');
    expect(escaparCampo('punto; y coma')).toBe('"punto; y coma"');
  });

  it('las respuestas de opción múltiple quedan legibles en una celda', () => {
    // Sin comas adentro no hace falta entrecomillar.
    expect(escaparCampo(['Alumbrado público', 'Seguridad'])).toBe('Alumbrado público | Seguridad');
    // Con una opción que lleva coma, sí.
    expect(escaparCampo(['Agua, cloacas', 'Seguridad'])).toBe('"Agua, cloacas | Seguridad"');
  });

  it('los vacíos quedan vacíos, no "null" ni "undefined"', () => {
    expect(escaparCampo(null)).toBe('');
    expect(escaparCampo(undefined)).toBe('');
    expect(escaparCampo(0)).toBe('0');
    expect(escaparCampo(false)).toBe('false');
  });

  it('arranca con BOM para que Excel respete los acentos', () => {
    const csv = aCsv(['barrio'], [{ barrio: 'Estación' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Estación');
  });

  it('respeta el orden de las columnas y completa los faltantes', () => {
    const csv = aCsv(['a', 'b', 'c'], [{ c: 3, a: 1 }]);
    const [encabezado, fila] = csv.replace('﻿', '').trim().split('\r\n');
    expect(encabezado).toBe('a,b,c');
    expect(fila).toBe('1,,3');
  });
});

describe('el export es anonimizado por construcción', () => {
  it('ninguna columna del export de respuestas es identificatoria', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const fuente = readFileSync(
      join(resolve(__dirname, '../..'), 'src/lib/tablero/export.ts'),
      'utf8',
    );

    // Lo que no puede aparecer como columna seleccionada del export.
    for (const prohibido of [
      'respuestas.ticket',
      'respuestas.codigo',
      'respuestas.dispositivoId',
      'respuestas.viviendaId',
      'respuestas.latApertura',
      'respuestas.lngApertura',
      'respuestas.encuestadorId',
      'contactos',
      'identificada',
    ]) {
      expect(fuente).not.toContain(prohibido);
    }
  });

  it('cada export deja rastro en la auditoría', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const fuente = readFileSync(
      join(resolve(__dirname, '../..'), 'src/lib/tablero/export.ts'),
      'utf8',
    );
    const exports = [...fuente.matchAll(/export async function (exportar\w+)/g)].map((m) => m[1]);
    expect(exports.length).toBeGreaterThanOrEqual(3);
    for (const nombre of exports) {
      const desde = fuente.indexOf(`export async function ${nombre}`);
      const hasta = fuente.indexOf('\nexport ', desde + 10);
      const cuerpo = fuente.slice(desde, hasta === -1 ? undefined : hasta);
      expect(cuerpo).toContain('registrarExport');
    }
  });
});
