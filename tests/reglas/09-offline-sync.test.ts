import { beforeEach, describe, expect, it } from 'vitest';
import {
  cerrarEncuesta,
  guardarAvance,
  guardarCuestionario,
  iniciarEncuesta,
  obtenerEncuesta,
  encuestaEnCurso,
} from '@/lib/campo/almacen';
import type { BaseCampo } from '@/lib/campo/db';
import { avanzar, construirPasos, responder } from '@/lib/campo/encuesta';
import { contarPendientes, encolar, pendientes, sincronizar } from '@/lib/campo/outbox';
import type { EventoSync } from '@/lib/campo/tipos';
import { baseDePrueba, CUESTIONARIO, DISPOSITIVO, viviendaDePrueba } from '../util/campo';

/**
 * REGLA 9: offline-first real.
 *
 * El ticket se genera en el celular, la sincronización es idempotente y
 * append-only, y una encuesta interrumpida se retoma donde estaba.
 */

const PASOS = construirPasos(CUESTIONARIO);

async function encuestaAMedias(base: BaseCampo) {
  const vivienda = viviendaDePrueba();
  await base.viviendas.put(vivienda);
  let encuesta = await iniciarEncuesta(base, {
    vivienda,
    cuestionario: CUESTIONARIO,
    dispositivoId: DISPOSITIVO,
  });

  // Consentimiento y tres preguntas, guardando en cada paso.
  encuesta = { ...encuesta, consentimientoVersion: CUESTIONARIO.consentimiento.version };
  await guardarAvance(base, encuesta);
  for (let i = 0; i < 3; i += 1) {
    encuesta = avanzar(encuesta, PASOS);
    const paso = PASOS[encuesta.paso];
    if (paso?.tipo === 'pregunta') encuesta = responder(encuesta, paso.pregunta.id, 'respuesta');
    await guardarAvance(base, encuesta);
  }

  return { vivienda, encuesta };
}

describe('el ticket se genera en el celular', () => {
  let base: BaseCampo;
  beforeEach(async () => {
    base = await baseDePrueba();
  });

  it('la encuesta arranca con ticket propio, sin pedirle nada al servidor', async () => {
    const vivienda = viviendaDePrueba();
    await base.viviendas.put(vivienda);
    const encuesta = await iniciarEncuesta(base, {
      vivienda,
      cuestionario: CUESTIONARIO,
      dispositivoId: DISPOSITIVO,
    });

    // UUID v7: ordenable por tiempo y generado localmente.
    expect(encuesta.ticket).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('dos encuestas seguidas tienen tickets distintos y ordenados', async () => {
    const a = viviendaDePrueba('M01-L01');
    const b = viviendaDePrueba('M01-L02');
    await base.viviendas.bulkPut([a, b]);
    const primera = await iniciarEncuesta(base, {
      vivienda: a,
      cuestionario: CUESTIONARIO,
      dispositivoId: DISPOSITIVO,
    });
    const segunda = await iniciarEncuesta(base, {
      vivienda: b,
      cuestionario: CUESTIONARIO,
      dispositivoId: DISPOSITIVO,
    });
    expect(primera.ticket).not.toBe(segunda.ticket);
    expect([primera.ticket, segunda.ticket].sort()).toEqual([primera.ticket, segunda.ticket]);
  });
});

describe('si el celular se apaga, se retoma donde estaba', () => {
  let base: BaseCampo;
  beforeEach(async () => {
    base = await baseDePrueba();
  });

  it('el avance quedó guardado paso a paso', async () => {
    const { encuesta, vivienda } = await encuestaAMedias(base);

    // "Se apagó el teléfono": se vuelve a abrir la base desde cero.
    const recuperada = await obtenerEncuesta(base, encuesta.ticket);
    expect(recuperada).toBeDefined();
    expect(recuperada?.paso).toBe(encuesta.paso);
    expect(Object.keys(recuperada?.respuestas ?? {})).toHaveLength(3);
    expect(recuperada?.consentimientoVersion).toBe(CUESTIONARIO.consentimiento.version);

    // Y la app la encuentra sola al volver a la vivienda.
    const enCurso = await encuestaEnCurso(base, vivienda.id);
    expect(enCurso?.ticket).toBe(encuesta.ticket);
  });

  it('el cuestionario queda cacheado para trabajar sin señal', async () => {
    const guardado = await guardarCuestionario(base, CUESTIONARIO);
    expect(guardado.version).toBe(CUESTIONARIO.version);
    const leido = await base.cuestionario.get('vigente');
    expect(leido?.definicion.bloques.length).toBe(CUESTIONARIO.bloques.length);
  });
});

describe('la cola de salida es idempotente y append-only', () => {
  let base: BaseCampo;
  beforeEach(async () => {
    base = await baseDePrueba();
  });

  it('encolar dos veces el mismo evento no duplica', async () => {
    await encolar(base, { ticket: 't1', tipo: 'encuesta', payload: { a: 1 } });
    await encolar(base, { ticket: 't1', tipo: 'encuesta', payload: { a: 1 } });
    expect(await contarPendientes(base)).toBe(1);
  });

  it('reencolar NO pisa lo que ya estaba', async () => {
    await encolar(base, { ticket: 't1', tipo: 'encuesta', payload: { version: 'original' } });
    await encolar(base, { ticket: 't1', tipo: 'encuesta', payload: { version: 'pisada' } });
    const [evento] = await pendientes(base);
    expect((evento?.payload as { version: string }).version).toBe('original');
  });

  it('cerrar la encuesta encola exactamente un evento, con el mismo ticket', async () => {
    const { encuesta } = await encuestaAMedias(base);
    const cerrada = await cerrarEncuesta(base, encuesta, { cuestionario: CUESTIONARIO });

    const cola = await pendientes(base);
    expect(cola).toHaveLength(1);
    expect(cola[0]?.ticket).toBe(cerrada.ticket);
    expect(cola[0]?.tipo).toBe('encuesta');
    expect(cerrada.duracionSegundos).not.toBeNull();
  });
});

describe('sincronización', () => {
  let base: BaseCampo;
  beforeEach(async () => {
    base = await baseDePrueba();
  });

  it('sin señal, lo pendiente queda pendiente y se anota el error', async () => {
    const { encuesta } = await encuestaAMedias(base);
    await cerrarEncuesta(base, encuesta, { cuestionario: CUESTIONARIO });

    const resumen = await sincronizar(base, async () => {
      throw new Error('Failed to fetch');
    });

    expect(resumen).toMatchObject({ intentados: 1, confirmados: 0, fallados: 1 });
    expect(await contarPendientes(base)).toBe(1);
    const [evento] = await pendientes(base);
    expect(evento?.intentos).toBe(1);
    expect(evento?.ultimoError).toContain('Failed to fetch');
  });

  it('reintentar después no duplica nada del lado del celular', async () => {
    const { encuesta } = await encuestaAMedias(base);
    await cerrarEncuesta(base, encuesta, { cuestionario: CUESTIONARIO });

    const enviados: EventoSync[][] = [];
    const transporte = async (lote: EventoSync[]) => {
      enviados.push(lote);
      return {
        confirmados: [] as string[],
        errores: lote.map((e) => ({ id: e.id, error: 'timeout' })),
      };
    };

    await sincronizar(base, transporte);
    await sincronizar(base, transporte);

    expect(enviados[0]?.[0]?.id).toBe(enviados[1]?.[0]?.id);
    expect(await contarPendientes(base)).toBe(1);
  });

  it('confirmada la sincronización, los datos del vecino se borran del celular', async () => {
    const { encuesta } = await encuestaAMedias(base);
    const cerrada = await cerrarEncuesta(base, encuesta, { cuestionario: CUESTIONARIO });

    const resumen = await sincronizar(base, async (lote) => ({
      confirmados: lote.map((e) => e.id),
      errores: [],
    }));

    expect(resumen).toMatchObject({ confirmados: 1, purgados: 1 });
    expect(await contarPendientes(base)).toBe(0);
    // El borrador con las respuestas ya no está en el dispositivo.
    expect(await obtenerEncuesta(base, cerrada.ticket)).toBeUndefined();
  });
});

describe('los datos de vecinos no tocan localStorage', () => {
  it('ningún módulo de campo usa localStorage ni sessionStorage', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const carpeta = join(resolve(__dirname, '../..'), 'src/lib/campo');
    const archivos = readdirSync(carpeta).filter((f) => f.endsWith('.ts'));
    for (const archivo of archivos) {
      // Se miran solo las líneas de código: los comentarios pueden nombrarlos.
      const codigo = readFileSync(join(carpeta, archivo), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(codigo).not.toMatch(/\b(localStorage|sessionStorage)\b/);
    }
  });
});
