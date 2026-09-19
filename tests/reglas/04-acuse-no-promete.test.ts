import { describe, expect, it } from 'vitest';
import {
  COMPETENCIAS,
  construirMensaje,
  ETIQUETA_COMPETENCIA,
  plantillaDisponible,
  PromesaSinRespaldo,
  TIPOS_PLANTILLA,
} from '@/lib/devolucion/plantillas';
import type { DatosMensaje } from '@/lib/devolucion/plantillas';

/**
 * REGLA 4: el acuse no promete.
 *
 * Toda comunicación automática acusa recibo y clasifica la demanda por competencia.
 * El sistema IMPIDE a nivel de código enviar una plantilla de tipo `compromiso` si la
 * derivación no tiene número de orden de trabajo.
 */

const BASE: DatosMensaje = {
  ticket: '01a0c000-0000-7000-8000-00000000d001',
  codigo: 'ESQ-ABCD-EFGH',
  nombre: 'Marta',
  barrioNombre: '28 de Junio',
  competencia: 'municipal',
  areaDestino: 'Secretaría de Obras Públicas',
  descripcion: 'Falta alumbrado en el pasaje desde la esquina hasta el fondo.',
  ordenTrabajoNro: null,
  urlConsulta: 'https://ejemplo/ticket',
};

describe('sin orden de trabajo no hay compromiso', () => {
  it('la plantilla `compromiso` sin orden de trabajo LANZA y no produce mensaje', () => {
    expect(() => construirMensaje('compromiso', BASE)).toThrow(PromesaSinRespaldo);
  });

  it('una orden vacía o con espacios tampoco sirve', () => {
    expect(() => construirMensaje('compromiso', { ...BASE, ordenTrabajoNro: '' })).toThrow(
      PromesaSinRespaldo,
    );
    expect(() => construirMensaje('compromiso', { ...BASE, ordenTrabajoNro: '   ' })).toThrow(
      PromesaSinRespaldo,
    );
  });

  it('el error dice exactamente qué falta y para qué ticket', () => {
    try {
      construirMensaje('compromiso', BASE);
      expect.unreachable('tendría que haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(PromesaSinRespaldo);
      expect((error as Error).message).toContain(BASE.ticket);
      expect((error as Error).message).toMatch(/orden de trabajo/i);
    }
  });

  it('con orden de trabajo sí se puede comprometer, y el número va en el mensaje', () => {
    const mensaje = construirMensaje('compromiso', { ...BASE, ordenTrabajoNro: 'OT-2026-00412' });
    expect(mensaje.cuerpo).toContain('OT-2026-00412');
    expect(mensaje.cuerpo).toContain(BASE.areaDestino);
  });

  it('la interfaz sabe de antemano que no puede ofrecer el compromiso', () => {
    expect(plantillaDisponible('compromiso', null).ok).toBe(false);
    expect(plantillaDisponible('compromiso', 'OT-1').ok).toBe(true);
    expect(plantillaDisponible('acuse', null).ok).toBe(true);
    expect(plantillaDisponible('derivacion', null).ok).toBe(true);
  });
});

describe('acusar recibo no es prometer', () => {
  it('el acuse sale sin orden de trabajo y dice que no es una respuesta', () => {
    const mensaje = construirMensaje('acuse', BASE);
    expect(mensaje.cuerpo).toMatch(/acuse de recibo/i);
    expect(mensaje.cuerpo).toMatch(/todavía no es una respuesta ni un compromiso/i);
  });

  it('ninguna plantilla que no sea `compromiso` promete trabajo', () => {
    const promesas = /vamos a (arreglar|resolver|hacer|construir|reparar)/i;
    for (const tipo of ['acuse', 'derivacion'] as const) {
      const mensaje = construirMensaje(tipo, BASE);
      expect(mensaje.cuerpo).not.toMatch(promesas);
    }
  });

  it('el vecino siempre se lleva su código para seguir el pedido', () => {
    for (const tipo of TIPOS_PLANTILLA) {
      const mensaje = construirMensaje(tipo, { ...BASE, ordenTrabajoNro: 'OT-1' });
      expect(mensaje.cuerpo).toContain(BASE.codigo);
      expect(mensaje.cuerpo).toContain(BASE.urlConsulta);
    }
  });
});

describe('toda comunicación dice de quién es la competencia', () => {
  it('la derivación nombra la jurisdicción y a dónde fue', () => {
    for (const competencia of COMPETENCIAS) {
      const mensaje = construirMensaje('derivacion', { ...BASE, competencia });
      expect(mensaje.cuerpo).toContain(ETIQUETA_COMPETENCIA[competencia]);
      expect(mensaje.cuerpo).toContain(BASE.areaDestino);
    }
  });

  it('cuando no es municipal, se le dice al vecino que el municipio no lo resuelve', () => {
    const mensaje = construirMensaje('derivacion', { ...BASE, competencia: 'provincial' });
    expect(mensaje.cuerpo).toMatch(/el municipio no puede resolverlo/i);
  });

  it('cuando es municipal, no se le manda a reclamar a otro lado', () => {
    const mensaje = construirMensaje('derivacion', { ...BASE, competencia: 'municipal' });
    expect(mensaje.cuerpo).not.toMatch(/el municipio no puede resolverlo/i);
  });

  it('el mensaje funciona igual si el vecino no dejó su nombre', () => {
    const mensaje = construirMensaje('acuse', { ...BASE, nombre: null });
    expect(mensaje.cuerpo.startsWith('Hola:')).toBe(true);
  });
});

describe('la única puerta de salida pasa por la plantilla', () => {
  it('el módulo de envío usa construirMensaje antes de cualquier registro', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const fuente = readFileSync(
      join(resolve(__dirname, '../..'), 'src/lib/devolucion/acuses.ts'),
      'utf8',
    );
    const posicionMensaje = fuente.indexOf('construirMensaje(opciones.tipo');
    const posicionRegistro = fuente.indexOf('registrarAcuse(');
    expect(posicionMensaje).toBeGreaterThan(-1);
    expect(posicionMensaje).toBeLessThan(posicionRegistro);
  });
});
