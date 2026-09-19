import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  listarViviendas,
  MotivoInvalido,
  registrarNoRespuesta,
  resumenDelBarrio,
} from '@/lib/campo/almacen';
import type { BaseCampo } from '@/lib/campo/db';
import { contarPendientes, pendientes } from '@/lib/campo/outbox';
import { MOTIVOS_NO_RESPUESTA } from '@/lib/campo/tipos';
import type { MotivoNoRespuesta } from '@/lib/campo/tipos';
import { baseDePrueba, BARRIO, DISPOSITIVO, viviendaDePrueba } from '../util/campo';

/**
 * REGLA 3: la no-respuesta es un dato obligatorio.
 *
 * El encuestador no puede saltear una vivienda: la cierra con motivo tipificado y
 * número de intento. Sin eso no hay cobertura, y sin cobertura los porcentajes
 * mienten.
 */

describe('los motivos son cinco y están tipificados', () => {
  it('son exactamente los cinco del operativo', () => {
    expect([...MOTIVOS_NO_RESPUESTA]).toEqual([
      'sin_moradores',
      'rechazo',
      'deshabitada',
      'no_accesible',
      'volver_mas_tarde',
    ]);
  });

  it('el schema de la base usa el mismo enum, sin un sexto valor', () => {
    const schema = readFileSync(
      join(resolve(__dirname, '../..'), 'src/db/schema/analitica.ts'),
      'utf8',
    );
    for (const motivo of MOTIVOS_NO_RESPUESTA) expect(schema).toContain(`'${motivo}'`);
  });
});

describe('cerrar una vivienda sin encuesta exige motivo e intento', () => {
  let base: BaseCampo;

  beforeEach(async () => {
    base = await baseDePrueba();
  });

  it('registra el motivo, el intento y deja la vivienda cerrada', async () => {
    const vivienda = viviendaDePrueba();
    await base.viviendas.put(vivienda);

    const registro = await registrarNoRespuesta(base, {
      vivienda,
      motivo: 'sin_moradores',
      dispositivoId: DISPOSITIVO,
    });

    expect(registro.motivo).toBe('sin_moradores');
    expect(registro.intento).toBe(1);

    const [guardada] = await listarViviendas(base, BARRIO.slug);
    expect(guardada?.estado).toBe('cerrada_sin_respuesta');
    expect(guardada?.intentos).toBe(1);
  });

  it('un motivo que no está en la lista es rechazado', async () => {
    const vivienda = viviendaDePrueba();
    await base.viviendas.put(vivienda);

    await expect(
      registrarNoRespuesta(base, {
        vivienda,
        motivo: 'no_me_atendieron' as MotivoNoRespuesta,
        dispositivoId: DISPOSITIVO,
      }),
    ).rejects.toBeInstanceOf(MotivoInvalido);
  });

  it('"volver más tarde" deja la vivienda pendiente y suma el intento', async () => {
    const vivienda = viviendaDePrueba();
    await base.viviendas.put(vivienda);

    await registrarNoRespuesta(base, {
      vivienda,
      motivo: 'volver_mas_tarde',
      dispositivoId: DISPOSITIVO,
    });

    const [primera] = await listarViviendas(base, BARRIO.slug);
    expect(primera?.estado).toBe('pendiente');
    expect(primera?.intentos).toBe(1);

    // Segunda vuelta: el intento es el 2 y ahora sí se cierra.
    await registrarNoRespuesta(base, {
      vivienda: primera!,
      motivo: 'rechazo',
      dispositivoId: DISPOSITIVO,
    });

    const [segunda] = await listarViviendas(base, BARRIO.slug);
    expect(segunda?.estado).toBe('cerrada_sin_respuesta');
    expect(segunda?.intentos).toBe(2);
  });

  it('cada intento viaja al servidor como un evento propio, sin pisar el anterior', async () => {
    const vivienda = viviendaDePrueba();
    await base.viviendas.put(vivienda);

    await registrarNoRespuesta(base, {
      vivienda,
      motivo: 'volver_mas_tarde',
      dispositivoId: DISPOSITIVO,
    });
    const [conUnIntento] = await listarViviendas(base, BARRIO.slug);
    await registrarNoRespuesta(base, {
      vivienda: conUnIntento!,
      motivo: 'sin_moradores',
      dispositivoId: DISPOSITIVO,
    });

    expect(await contarPendientes(base)).toBe(2);
    const eventos = await pendientes(base);
    expect(eventos.map((e) => (e.payload as { intento: number }).intento).sort()).toEqual([1, 2]);
  });

  it('la cobertura del barrio se puede calcular desde el celular', async () => {
    const relevada = viviendaDePrueba('M01-L01');
    const cerrada = viviendaDePrueba('M01-L02');
    const pendiente = viviendaDePrueba('M01-L03');
    await base.viviendas.bulkPut([relevada, cerrada, pendiente]);
    await base.viviendas.put({ ...relevada, estado: 'relevada' });
    await registrarNoRespuesta(base, {
      vivienda: cerrada,
      motivo: 'deshabitada',
      dispositivoId: DISPOSITIVO,
    });

    const resumen = await resumenDelBarrio(base, BARRIO.slug);
    expect(resumen).toMatchObject({
      total: 3,
      relevadas: 1,
      cerradasSinRespuesta: 1,
      pendientes: 1,
    });
  });
});

describe('no existe ninguna forma de saltear una vivienda', () => {
  it('los únicos caminos que la sacan de pendientes son la encuesta y la no-respuesta', () => {
    const almacen = readFileSync(
      join(resolve(__dirname, '../..'), 'src/lib/campo/almacen.ts'),
      'utf8',
    );
    const funcionesQueCierran = [...almacen.matchAll(/export async function (\w+)/g)]
      .map((m) => m[1])
      .filter((nombre) => {
        const cuerpo = almacen.slice(almacen.indexOf(`export async function ${nombre}`));
        const hasta = cuerpo.indexOf('\nexport ', 10);
        const bloque = hasta === -1 ? cuerpo : cuerpo.slice(0, hasta);
        return /estado:[^,\n]*'(relevada|cerrada_sin_respuesta)'/.test(bloque);
      });

    expect(funcionesQueCierran.sort()).toEqual(['cerrarEncuesta', 'registrarNoRespuesta']);
  });
});
