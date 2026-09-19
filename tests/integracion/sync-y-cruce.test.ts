import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { closePool } from '@/db/client';
import {
  acuses,
  auditLog,
  barrios,
  contactos,
  derivaciones,
  encuestadores,
  noRespuestas,
  respuestas,
  usuarios,
  viviendas,
} from '@/db/schema';
import type { UsuarioSesion } from '@/lib/auth/usuarios';
import { enviarAcuse } from '@/lib/devolucion/acuses';
import { consultarPorCodigo } from '@/lib/devolucion/consulta';
import { actualizarDerivacion, crearDerivacion } from '@/lib/devolucion/derivaciones';
import { PromesaSinRespaldo } from '@/lib/devolucion/plantillas';
import { CruceProhibido, cruzarTicket } from '@/lib/identificada/acceso';
import { aplicarEventos } from '@/lib/sync/aplicar';
import {
  coberturaPorBarrio,
  distribucionDePregunta,
  MINIMO_PARA_AGREGAR,
  noRespuestaPorMotivo,
  resumenOperativo,
} from '@/lib/tablero/consultas';
import { exportarCobertura, exportarRespuestas } from '@/lib/tablero/export';
import type { EventoEntrante } from '@/lib/sync/esquemas';

/**
 * Pruebas contra una base Postgres real. Si no hay DATABASE_URL, se saltean.
 *
 * Verifican las dos reglas que solo se pueden comprobar del lado del servidor:
 * la sincronización idempotente y append-only (regla 9), y que el cruce entre el
 * ticket y la identidad del vecino exija admin, motivo y quede auditado (regla 1).
 */

const HAY_BASE = Boolean(process.env.DATABASE_URL);

const ID = {
  barrio: '01a0c000-0000-7000-8000-00000000b001',
  otroBarrio: '01a0c000-0000-7000-8000-00000000b002',
  usuario: '01a0c000-0000-7000-8000-00000000a001',
  admin: '01a0c000-0000-7000-8000-00000000a002',
  vivienda: '01a0c000-0000-7000-8000-00000000c001',
  ticket: '01a0c000-0000-7000-8000-00000000d001',
  noRespuesta: '01a0c000-0000-7000-8000-00000000e001',
  viviendaNueva: '01a0c000-0000-7000-8000-00000000c002',
};

const ENCUESTADOR: UsuarioSesion = {
  id: ID.usuario,
  usuario: 'prueba.encuestador',
  nombreVisible: 'Encuestador de prueba',
  rol: 'encuestador',
  barrioId: ID.barrio,
  area: null,
};

const ADMIN: UsuarioSesion = {
  id: ID.admin,
  usuario: 'prueba.admin',
  nombreVisible: 'Admin de prueba',
  rol: 'admin',
  barrioId: null,
  area: null,
};

function eventoEncuesta(extra: Record<string, unknown> = {}): EventoEntrante {
  return {
    id: `${ID.ticket}:encuesta`,
    ticket: ID.ticket,
    tipo: 'encuesta',
    creadoEn: new Date().toISOString(),
    payload: {
      ticket: ID.ticket,
      viviendaId: ID.vivienda,
      barrioId: ID.barrio,
      cuestionarioVersion: 1,
      consentimientoVersion: 'consentimiento-v1',
      respuestas: { 'nucleo-01': 'Más de 10 años', 'nucleo-02': 4 },
      abiertaEn: new Date(Date.now() - 600_000).toISOString(),
      cerradaEn: new Date().toISOString(),
      duracionSegundos: 600,
      gpsApertura: { lat: -42.9, lng: -71.3, precisionM: 12, tomadaEn: new Date().toISOString() },
      gpsCierre: null,
      dispositivoId: 'dispositivo-de-prueba',
      ...extra,
    },
  };
}

async function limpiar() {
  const db = getDb();
  await db.delete(respuestas).where(eq(respuestas.ticket, ID.ticket));
  await db.delete(noRespuestas).where(eq(noRespuestas.viviendaId, ID.vivienda));
  await db.delete(acuses).where(eq(acuses.ticket, ID.ticket));
  await db.delete(contactos).where(eq(contactos.ticket, ID.ticket));
  await db.delete(derivaciones).where(eq(derivaciones.ticket, ID.ticket));
  await db.delete(auditLog).where(inArray(auditLog.usuarioId, [ID.usuario, ID.admin]));
  await db.delete(encuestadores).where(inArray(encuestadores.usuarioId, [ID.usuario, ID.admin]));
  await db.delete(viviendas).where(inArray(viviendas.id, [ID.vivienda, ID.viviendaNueva]));
  await db.delete(usuarios).where(inArray(usuarios.id, [ID.usuario, ID.admin]));
  await db.delete(barrios).where(inArray(barrios.id, [ID.barrio, ID.otroBarrio]));
}

beforeAll(async () => {
  if (!HAY_BASE) return;
  await limpiar();
  {
    const db = getDb();
    await db.insert(barrios).values([
      { id: ID.barrio, nombre: 'Barrio de prueba', slug: 'barrio-de-prueba' },
      { id: ID.otroBarrio, nombre: 'Otro barrio de prueba', slug: 'otro-barrio-de-prueba' },
    ]);
    await db.insert(usuarios).values([
      {
        id: ID.usuario,
        usuario: ENCUESTADOR.usuario,
        hashPassword: 'no-importa',
        nombreVisible: ENCUESTADOR.nombreVisible,
        rol: 'encuestador',
        barrioId: ID.barrio,
      },
      {
        id: ID.admin,
        usuario: ADMIN.usuario,
        hashPassword: 'no-importa',
        nombreVisible: ADMIN.nombreVisible,
        rol: 'admin',
      },
    ]);
    await db
      .insert(viviendas)
      .values({ id: ID.vivienda, barrioId: ID.barrio, identificador: 'PRUEBA-01' });
  }
});

afterAll(async () => {
  if (!HAY_BASE) return;
  await limpiar();
  await closePool();
});

describe.skipIf(!HAY_BASE)('sincronización contra la base real', () => {
  it('mandar el mismo lote dos veces deja la base igual que mandarlo una vez', async () => {
    const lote = [eventoEncuesta()];

    const primera = await aplicarEventos(ENCUESTADOR, lote);
    expect(primera.errores).toEqual([]);
    expect(primera.nuevos).toBe(1);

    const segunda = await aplicarEventos(ENCUESTADOR, lote);
    expect(segunda.errores).toEqual([]);
    // Se confirma igual —para que el celular lo borre— pero no entra nada nuevo.
    expect(segunda.confirmados).toEqual(primera.confirmados);
    expect(segunda.nuevos).toBe(0);

    const filas = await getDb().select().from(respuestas).where(eq(respuestas.ticket, ID.ticket));
    expect(filas).toHaveLength(1);
    expect(filas[0]?.consentimientoVersion).toBe('consentimiento-v1');
    expect(filas[0]?.duracionSegundos).toBe(600);
  });

  it('un reenvío NO pisa lo que ya estaba', async () => {
    const modificado = eventoEncuesta({ respuestas: { 'nucleo-01': 'PISADO' } });
    await aplicarEventos(ENCUESTADOR, [modificado]);

    const [fila] = await getDb().select().from(respuestas).where(eq(respuestas.ticket, ID.ticket));
    expect((fila?.payload as Record<string, unknown>)['nucleo-01']).toBe('Más de 10 años');
  });

  it('una encuesta sin consentimiento no entra (regla 2)', async () => {
    const sinConsentimiento = {
      ...eventoEncuesta(),
      id: 'ticket-sin-consentimiento:encuesta',
      ticket: '01a0c000-0000-7000-8000-00000000d999',
    };
    (sinConsentimiento.payload as Record<string, unknown>).consentimientoVersion = '';
    (sinConsentimiento.payload as Record<string, unknown>).ticket =
      '01a0c000-0000-7000-8000-00000000d999';

    const resultado = await aplicarEventos(ENCUESTADOR, [sinConsentimiento]);
    expect(resultado.confirmados).toEqual([]);
    expect(resultado.errores[0]?.error).toMatch(/consentimiento/i);
  });

  it('el encuestador no puede cargar en un barrio que no es el suyo', async () => {
    const ajeno = eventoEncuesta();
    (ajeno.payload as Record<string, unknown>).barrioId = ID.otroBarrio;
    ajeno.id = 'ajeno:encuesta';

    const resultado = await aplicarEventos(ENCUESTADOR, [ajeno]);
    expect(resultado.confirmados).toEqual([]);
    expect(resultado.errores[0]?.error).toMatch(/no es el asignado/i);
  });

  it('cada intento de no-respuesta entra una sola vez', async () => {
    const evento: EventoEntrante = {
      id: `${ID.noRespuesta}:no_respuesta:1`,
      ticket: ID.noRespuesta,
      tipo: 'no_respuesta',
      creadoEn: new Date().toISOString(),
      payload: {
        id: ID.noRespuesta,
        viviendaId: ID.vivienda,
        barrioId: ID.barrio,
        motivo: 'sin_moradores',
        intento: 1,
        observacion: '',
        gps: null,
        registradaEn: new Date().toISOString(),
        dispositivoId: 'dispositivo-de-prueba',
      },
    };

    await aplicarEventos(ENCUESTADOR, [evento]);
    await aplicarEventos(ENCUESTADOR, [evento]);

    const filas = await getDb()
      .select()
      .from(noRespuestas)
      .where(eq(noRespuestas.viviendaId, ID.vivienda));
    expect(filas).toHaveLength(1);
    expect(filas[0]?.motivo).toBe('sin_moradores');
  });

  it('la vivienda agregada en la calle entra antes que su encuesta', async () => {
    const eventos: EventoEntrante[] = [
      {
        id: `${ID.viviendaNueva}:vivienda_nueva`,
        ticket: ID.viviendaNueva,
        tipo: 'vivienda_nueva',
        creadoEn: new Date().toISOString(),
        payload: { id: ID.viviendaNueva, barrioId: ID.barrio, identificador: 'PRUEBA-NUEVA' },
      },
    ];

    const resultado = await aplicarEventos(ENCUESTADOR, eventos);
    expect(resultado.errores).toEqual([]);

    const filas = await getDb().select().from(viviendas).where(eq(viviendas.id, ID.viviendaNueva));
    expect(filas).toHaveLength(1);
  });

  it('cada lote deja su rastro en la auditoría', async () => {
    const antes = await getDb().select().from(auditLog).where(eq(auditLog.usuarioId, ID.usuario));
    await aplicarEventos(ENCUESTADOR, [eventoEncuesta()]);
    const despues = await getDb().select().from(auditLog).where(eq(auditLog.usuarioId, ID.usuario));
    expect(despues.length).toBe(antes.length + 1);
    expect(despues.at(-1)?.accion).toBe('sync_lote');
  });
});

describe.skipIf(!HAY_BASE)('cruce entre el ticket y la identidad (regla 1)', () => {
  beforeAll(async () => {
    if (!HAY_BASE) return;
    await getDb()
      .insert(contactos)
      .values({
        ticket: ID.ticket,
        nombre: 'Vecina',
        apellido: 'DePrueba',
        dniUltimos: '123',
        domicilio: 'Domicilio de prueba 123',
        barrioNombre: 'Barrio de prueba',
      })
      .onConflictDoNothing();
  });

  it('un encuestador NO puede cruzar', async () => {
    await expect(
      cruzarTicket(ENCUESTADOR, ID.ticket, 'Quiero ver quién contestó esto, nada más.'),
    ).rejects.toBeInstanceOf(CruceProhibido);
  });

  it('el admin tampoco puede cruzar sin escribir un motivo', async () => {
    await expect(cruzarTicket(ADMIN, ID.ticket, 'porque sí')).rejects.toBeInstanceOf(
      CruceProhibido,
    );
  });

  it('el admin con motivo cruza, y queda registrado antes de devolver el dato', async () => {
    const motivo = 'Pedido formal del vecino para corregir su domicilio en el acuse.';
    const identidad = await cruzarTicket(ADMIN, ID.ticket, motivo);

    expect(identidad?.apellido).toBe('DePrueba');
    expect(identidad?.dniUltimos).toBe('123');

    const filas = await getDb().select().from(auditLog).where(eq(auditLog.usuarioId, ID.admin));
    const cruces = filas.filter((fila) => fila.accion === 'cruce_ticket_identidad');
    expect(cruces).toHaveLength(1);
    expect(cruces[0]?.ticket).toBe(ID.ticket);
    expect(cruces[0]?.motivo).toBe(motivo);
  });

  it('un cruce fallido no deja pasar el dato', async () => {
    const identidad = await cruzarTicket(
      ADMIN,
      '01a0c000-0000-7000-8000-00000000dead',
      'Verificación de un ticket que el vecino dice haber recibido.',
    ).catch(() => 'error');
    expect(identidad).toBeNull();
  });
});

describe.skipIf(!HAY_BASE)('devolución: el acuse no promete (regla 4)', () => {
  let derivacionId = '';

  beforeAll(async () => {
    if (!HAY_BASE) return;
    // La encuesta del bloque anterior ya está cargada; se le arma su derivación.
    const derivacion = await crearDerivacion(ADMIN, {
      ticket: ID.ticket,
      barrioId: ID.barrio,
      competencia: 'municipal',
      areaDestino: 'Secretaría de Obras Públicas',
      descripcion: 'Falta alumbrado en el pasaje.',
    });
    derivacionId = derivacion.id;
  });

  it('el compromiso sin orden de trabajo se corta y NO registra nada', async () => {
    const antes = await getDb().select().from(acuses).where(eq(acuses.ticket, ID.ticket));

    await expect(enviarAcuse(ADMIN, { derivacionId, tipo: 'compromiso' })).rejects.toBeInstanceOf(
      PromesaSinRespaldo,
    );

    const despues = await getDb().select().from(acuses).where(eq(acuses.ticket, ID.ticket));
    expect(despues.length).toBe(antes.length);
  });

  it('el acuse de recibo sí sale, aunque no haya orden de trabajo', async () => {
    const resultado = await enviarAcuse(ADMIN, { derivacionId, tipo: 'acuse' });
    expect(resultado.cuerpo).toMatch(/acuse de recibo/i);

    const guardados = await getDb().select().from(acuses).where(eq(acuses.ticket, ID.ticket));
    expect(guardados.some((fila) => fila.plantilla === 'acuse')).toBe(true);
  });

  it('cargada la orden de trabajo, el compromiso sale y queda con su número', async () => {
    await actualizarDerivacion(ADMIN, derivacionId, {
      ordenTrabajoNro: 'OT-2026-00999',
      estado: 'en_proceso',
    });

    const resultado = await enviarAcuse(ADMIN, { derivacionId, tipo: 'compromiso' });
    expect(resultado.cuerpo).toContain('OT-2026-00999');

    const guardados = await getDb().select().from(acuses).where(eq(acuses.ticket, ID.ticket));
    const compromiso = guardados.find((fila) => fila.plantilla === 'compromiso');
    expect(compromiso?.ordenTrabajoNro).toBe('OT-2026-00999');
  });

  it('el cuerpo guardado no lleva el nombre del vecino', async () => {
    const guardados = await getDb().select().from(acuses).where(eq(acuses.ticket, ID.ticket));
    for (const fila of guardados) {
      // El apellido es inequívoco; "Vecina" aparecería dentro de "Juntas Vecinales".
      expect(fila.cuerpo).not.toContain('DePrueba');
      // Y el saludo es el genérico, no el personalizado.
      expect(fila.cuerpo.startsWith('Hola:')).toBe(true);
    }
  });

  it('la consulta del vecino muestra el estado sin ningún dato personal', async () => {
    const [fila] = await getDb()
      .select({ codigo: respuestas.codigo })
      .from(respuestas)
      .where(eq(respuestas.ticket, ID.ticket));

    const estado = await consultarPorCodigo(fila?.codigo ?? '');
    expect(estado).not.toBeNull();
    expect(estado?.derivaciones[0]?.ordenTrabajoNro).toBe('OT-2026-00999');
    expect(estado?.comunicaciones.length).toBeGreaterThan(0);

    const serializado = JSON.stringify(estado);
    expect(serializado).not.toContain('DePrueba');
    expect(serializado).not.toContain('Domicilio de prueba');
  });
});

describe.skipIf(!HAY_BASE)('tablero y exports', () => {
  const viviendasExtra = Array.from(
    { length: MINIMO_PARA_AGREGAR },
    (_, i) => `01a0c000-0000-7000-8000-00000000f00${i}`,
  );

  beforeAll(async () => {
    if (!HAY_BASE) return;
    // Cinco encuestas más, para pasar el umbral de agregación.
    const eventos: EventoEntrante[] = viviendasExtra.flatMap((viviendaId, i) => {
      const ticket = `01a0c000-0000-7000-8000-00000000e10${i}`;
      return [
        {
          id: `${viviendaId}:vivienda_nueva`,
          ticket: viviendaId,
          tipo: 'vivienda_nueva' as const,
          creadoEn: new Date().toISOString(),
          payload: { id: viviendaId, barrioId: ID.barrio, identificador: `PRUEBA-1${i}` },
        },
        {
          id: `${ticket}:encuesta`,
          ticket,
          tipo: 'encuesta' as const,
          creadoEn: new Date().toISOString(),
          payload: {
            ticket,
            viviendaId,
            barrioId: ID.barrio,
            cuestionarioVersion: 1,
            consentimientoVersion: 'consentimiento-v1',
            respuestas: {
              'nucleo-01': 'Más de 10 años',
              'nucleo-06': i % 2 === 0 ? ['Alumbrado público', 'Agua'] : ['Alumbrado público'],
            },
            abiertaEn: new Date(Date.now() - 400_000).toISOString(),
            cerradaEn: new Date().toISOString(),
            duracionSegundos: 400 + i,
            gpsApertura: null,
            gpsCierre: null,
            dispositivoId: 'dispositivo-de-prueba',
          },
        },
      ];
    });

    await aplicarEventos(ENCUESTADOR, eventos);
  });

  afterAll(async () => {
    if (!HAY_BASE) return;
    const db = getDb();
    await db.delete(respuestas).where(eq(respuestas.barrioId, ID.barrio));
    await db.delete(noRespuestas).where(eq(noRespuestas.barrioId, ID.barrio));
    await db.delete(viviendas).where(inArray(viviendas.id, viviendasExtra));
  });

  it('la cobertura cuenta relevadas, sin respuesta y pendientes', async () => {
    const [fila] = await coberturaPorBarrio(ID.barrio);
    expect(fila?.barrio).toBe('Barrio de prueba');
    expect(fila?.viviendas).toBeGreaterThanOrEqual(MINIMO_PARA_AGREGAR);
    expect(fila?.relevadas).toBeGreaterThanOrEqual(MINIMO_PARA_AGREGAR);
    expect(fila?.porcentajeRelevado).toBeGreaterThan(0);
  });

  it('la no-respuesta se informa por motivo, incluidos los que están en cero', async () => {
    const motivos = await noRespuestaPorMotivo(ID.barrio);
    expect(motivos).toHaveLength(5);
    expect(motivos.some((motivo) => motivo.motivo === 'sin_moradores' && motivo.cantidad > 0)).toBe(
      true,
    );
  });

  it('el resumen mide la duración real de las encuestas', async () => {
    const resumen = await resumenOperativo(ID.barrio);
    expect(resumen.encuestas).toBeGreaterThanOrEqual(MINIMO_PARA_AGREGAR);
    expect(resumen.duracionMedianaSegundos).toBeGreaterThan(0);
    expect(resumen.duracionMedianaSegundos).toBeLessThanOrEqual(720);
  });

  it('con suficientes casos se muestra la distribución', async () => {
    const distribucion = await distribucionDePregunta('nucleo-06', ID.barrio);
    expect(distribucion.suficiente).toBe(true);
    expect(distribucion.filas[0]?.opcion).toBe('Alumbrado público');
    expect(distribucion.filas[0]?.porcentaje).toBeGreaterThan(0);
  });

  it('con pocos casos NO se muestra: un porcentaje sería el dato de una familia', async () => {
    const distribucion = await distribucionDePregunta(
      'pregunta-que-casi-nadie-contesto',
      ID.barrio,
    );
    expect(distribucion.suficiente).toBe(false);
    expect(distribucion.filas).toEqual([]);
  });

  it('el CSV de respuestas no lleva nada que permita volver al vecino', async () => {
    const csv = await exportarRespuestas(ADMIN, ID.barrio);

    expect(csv).toContain('Barrio de prueba');
    expect(csv).toContain('nucleo-01');

    // Ni el ticket, ni el código, ni el dispositivo, ni coordenadas.
    expect(csv).not.toContain(ID.ticket);
    expect(csv).not.toContain('ESQ-');
    expect(csv).not.toContain('dispositivo-de-prueba');
    expect(csv).not.toMatch(/-42\.\d+/);
    expect(csv.split('\r\n')[0]).not.toMatch(/ticket|codigo|dispositivo|lat|lng|vivienda/i);
  });

  it('cada export queda registrado con quién se lo llevó', async () => {
    const antes = await getDb().select().from(auditLog).where(eq(auditLog.usuarioId, ID.admin));
    await exportarCobertura(ADMIN, ID.barrio);
    const despues = await getDb().select().from(auditLog).where(eq(auditLog.usuarioId, ID.admin));

    const exports = despues.filter((fila) => fila.accion === 'export_csv');
    expect(despues.length).toBe(antes.length + 1);
    expect(exports.at(-1)?.metadata).toMatchObject({ tipo: 'cobertura' });
  });
});
