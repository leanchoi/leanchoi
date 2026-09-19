import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { closePool } from '@/db/client';
import {
  audios,
  auditLog,
  barrios,
  codificaciones,
  encuestadores,
  respuestas,
  transcripciones,
  usuarios,
  viviendas,
} from '@/db/schema';
import { codificarPendientes } from '@/lib/codificacion/pipeline';
import { ProveedorStub } from '@/lib/codificacion/proveedores/stub';
import { RepositorioCodificacionDrizzle } from '@/lib/codificacion/repositorio';
import { clustersConCitas } from '@/lib/tablero/consultas';

/**
 * Codificación contra una base Postgres real. Si no hay DATABASE_URL, se saltea.
 *
 * Lo que se verifica acá y no se puede verificar en memoria: que el barrio de la
 * transcripción se resuelva desde `respuestas` sin tocar `identificada`, que el
 * worker sea idempotente y que el tablero lea los temas con sus citas.
 */

const HAY_BASE = Boolean(process.env.DATABASE_URL);

const ID = {
  barrio: '01a0c000-0000-7000-8000-0000000f0001',
  vivienda: '01a0c000-0000-7000-8000-0000000f0002',
  ticket: '01a0c000-0000-7000-8000-0000000f0003',
  usuario: '01a0c000-0000-7000-8000-0000000f0004',
  encuestador: '01a0c000-0000-7000-8000-0000000f0005',
};

const TEXTOS = [
  'No hay luz en toda la cuadra. La luminaria de la esquina está quemada hace meses.',
  'Quedamos a oscuras desde las siete de la tarde, falta alumbrado en el pasaje.',
  'La calle es un barro cuando llueve y no entra la ambulancia.',
  'La calle está sin asfalto y los pozos rompen los autos.',
  'El recolector no llega hasta el fondo y se junta basura en el baldío.',
  'Hay perros sueltos y el mes pasado mordieron a un chico.',
];

function idAudio(n: number): string {
  return `01a0c000-0000-7000-8000-0000000fa0${String(n).padStart(2, '0')}`;
}
function idTranscripcion(n: number): string {
  return `01a0c000-0000-7000-8000-0000000fb0${String(n).padStart(2, '0')}`;
}

const CONFIG = {
  habilitado: true,
  proveedor: 'stub' as const,
  maximoClusters: 10,
  loteProceso: 100,
  minimoFragmentos: 3,
};

function deps() {
  return { repo: new RepositorioCodificacionDrizzle(), proveedor: new ProveedorStub(), config: CONFIG };
}

async function limpiar() {
  const db = getDb();
  const ids = TEXTOS.map((_, i) => idTranscripcion(i));
  await db.delete(codificaciones).where(inArray(codificaciones.transcripcionId, ids));
  await db.delete(transcripciones).where(inArray(transcripciones.id, ids));
  await db.delete(audios).where(inArray(audios.id, TEXTOS.map((_, i) => idAudio(i))));
  await db.delete(auditLog).where(eq(auditLog.accion, 'codificacion.pregunta'));
  await db.delete(respuestas).where(eq(respuestas.ticket, ID.ticket));
  await db.delete(encuestadores).where(eq(encuestadores.id, ID.encuestador));
  await db.delete(viviendas).where(eq(viviendas.id, ID.vivienda));
  await db.delete(usuarios).where(eq(usuarios.id, ID.usuario));
  await db.delete(barrios).where(eq(barrios.id, ID.barrio));
}

beforeAll(async () => {
  if (!HAY_BASE) return;
  await limpiar();
  const db = getDb();

  await db
    .insert(barrios)
    .values({ id: ID.barrio, nombre: 'Barrio codificación', slug: 'barrio-codificacion' });
  await db
    .insert(viviendas)
    .values({ id: ID.vivienda, barrioId: ID.barrio, identificador: 'COD-01' });
  await db.insert(usuarios).values({
    id: ID.usuario,
    usuario: 'prueba.codificacion',
    hashPassword: 'no-importa',
    nombreVisible: 'Encuestador de prueba',
    rol: 'encuestador',
    barrioId: ID.barrio,
  });
  await db.insert(encuestadores).values({
    id: ID.encuestador,
    usuarioId: ID.usuario,
    barrioId: ID.barrio,
    alias: 'Prueba',
  });
  await db.insert(respuestas).values({
    ticket: ID.ticket,
    encuestadorId: ID.encuestador,
    viviendaId: ID.vivienda,
    barrioId: ID.barrio,
    cuestionarioVersion: 1,
    consentimientoVersion: 'consentimiento-v1',
    payload: {},
    abiertaEn: new Date(Date.now() - 600_000),
    cerradaEn: new Date(),
    duracionSegundos: 600,
    dispositivoId: 'prueba',
  });

  for (const [i, texto] of TEXTOS.entries()) {
    await db.insert(audios).values({
      id: idAudio(i),
      ticket: ID.ticket,
      preguntaId: 'abierta-01',
      barrioId: ID.barrio,
      mime: 'audio/webm',
      bytes: 1,
      sha256: `sha-${i}`,
      rutaRelativa: null,
      estado: 'purgado',
    });
    await db.insert(transcripciones).values({
      id: idTranscripcion(i),
      audioId: idAudio(i),
      ticket: ID.ticket,
      preguntaId: 'abierta-01',
      texto,
      proveedor: 'stub',
    });
  }
});

afterAll(async () => {
  if (HAY_BASE) await limpiar();
  await closePool();
});

describe.skipIf(!HAY_BASE)('codificación sobre la base real', () => {
  it('codifica cada transcripción y le resuelve el barrio desde `respuestas`', async () => {
    const resumen = await codificarPendientes(deps());

    expect(resumen.fragmentos).toBe(TEXTOS.length);
    expect(resumen.codificaciones).toBe(TEXTOS.length);
    expect(resumen.citasDescartadas).toBe(0);

    const filas = await getDb()
      .select()
      .from(codificaciones)
      .where(inArray(codificaciones.transcripcionId, TEXTOS.map((_, i) => idTranscripcion(i))));

    expect(filas).toHaveLength(TEXTOS.length);
    expect(filas.every((fila) => fila.barrioId === ID.barrio)).toBe(true);
    expect(filas.every((fila) => fila.proveedor === 'stub')).toBe(true);
  });

  it('es idempotente: correrlo de nuevo no duplica nada', async () => {
    const resumen = await codificarPendientes(deps());

    expect(resumen.codificaciones).toBe(0);

    const filas = await getDb()
      .select()
      .from(codificaciones)
      .where(inArray(codificaciones.transcripcionId, TEXTOS.map((_, i) => idTranscripcion(i))));
    expect(filas).toHaveLength(TEXTOS.length);
  });

  it('deja rastro de la corrida en la auditoría', async () => {
    const filas = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.accion, 'codificacion.pregunta'));

    expect(filas.length).toBeGreaterThanOrEqual(1);
    expect(filas[0]?.metadata).toMatchObject({ preguntaId: 'abierta-01', proveedor: 'stub' });
  });

  it('el tablero lee los temas del barrio con sus citas textuales', async () => {
    const { suficiente, total, clusters } = await clustersConCitas(ID.barrio);

    expect(suficiente).toBe(true);
    expect(total).toBe(TEXTOS.length);

    const alumbrado = clusters.find((cluster) => cluster.clusterId === 'alumbrado');
    expect(alumbrado?.cantidad).toBe(2);
    expect(alumbrado?.citas.length).toBeGreaterThan(0);

    // Toda cita que llega al tablero salió tal cual de alguna transcripción.
    for (const cluster of clusters) {
      for (const cita of cluster.citas) {
        expect(TEXTOS.some((texto) => texto.includes(cita))).toBe(true);
      }
    }

    // Y ordena por cantidad: el tema más nombrado, primero.
    const cantidades = clusters.map((cluster) => cluster.cantidad);
    expect([...cantidades].sort((a, b) => b - a)).toEqual(cantidades);
  });
});
