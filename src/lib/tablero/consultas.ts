import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { barrios, derivaciones, noRespuestas, respuestas, viviendas } from '@/db/schema';
import { ETIQUETA_MOTIVO, MOTIVOS_NO_RESPUESTA } from '@/lib/campo/tipos';
import type { MotivoNoRespuesta } from '@/lib/campo/tipos';
import type { Competencia } from '@/lib/devolucion/plantillas';
import type { EstadoDerivacion } from '@/lib/devolucion/tipos';

/**
 * Las consultas del tablero. Todo agregado: acá no se ve ninguna respuesta
 * individual ni nada del schema `identificada`.
 *
 * Umbral de agregación: por debajo de cierta cantidad de respuestas, un porcentaje
 * en un barrio chico deja de ser un agregado y empieza a ser un dato de una familia
 * en particular. Por eso las distribuciones se ocultan hasta llegar al mínimo.
 */
export const MINIMO_PARA_AGREGAR = 5;

export type CoberturaBarrio = {
  barrioId: string;
  barrio: string;
  slug: string;
  viviendas: number;
  relevadas: number;
  sinRespuesta: number;
  pendientes: number;
  enCurso: number;
  porcentajeRelevado: number;
  porcentajeNoRespuesta: number;
};

function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;
}

/** Cobertura por barrio: relevadas sobre el total y cuántas quedaron sin respuesta. */
export async function coberturaPorBarrio(barrioId?: string | null): Promise<CoberturaBarrio[]> {
  const filas = await getDb()
    .select({
      barrioId: barrios.id,
      barrio: barrios.nombre,
      slug: barrios.slug,
      viviendas: sql<number>`count(${viviendas.id})::int`,
      relevadas: sql<number>`count(*) filter (where ${viviendas.estado} = 'relevada')::int`,
      sinRespuesta: sql<number>`count(*) filter (where ${viviendas.estado} = 'cerrada_sin_respuesta')::int`,
      pendientes: sql<number>`count(*) filter (where ${viviendas.estado} = 'pendiente')::int`,
      enCurso: sql<number>`count(*) filter (where ${viviendas.estado} = 'en_curso')::int`,
    })
    .from(barrios)
    .leftJoin(viviendas, eq(viviendas.barrioId, barrios.id))
    .where(barrioId ? eq(barrios.id, barrioId) : undefined)
    .groupBy(barrios.id, barrios.nombre, barrios.slug)
    .orderBy(barrios.nombre);

  return filas.map((fila) => ({
    ...fila,
    porcentajeRelevado: porcentaje(fila.relevadas, fila.viviendas),
    porcentajeNoRespuesta: porcentaje(fila.sinRespuesta, fila.viviendas),
  }));
}

export type NoRespuestaPorMotivo = {
  motivo: MotivoNoRespuesta;
  etiqueta: string;
  cantidad: number;
  porcentaje: number;
};

/**
 * La tasa de no-respuesta por motivo. Es métrica de primer nivel (regla 3): sin
 * esto, los porcentajes de las respuestas no significan nada.
 */
export async function noRespuestaPorMotivo(
  barrioId?: string | null,
): Promise<NoRespuestaPorMotivo[]> {
  const filas = await getDb()
    .select({ motivo: noRespuestas.motivo, cantidad: sql<number>`count(*)::int` })
    .from(noRespuestas)
    .where(barrioId ? eq(noRespuestas.barrioId, barrioId) : undefined)
    .groupBy(noRespuestas.motivo);

  const total = filas.reduce((suma, fila) => suma + fila.cantidad, 0);
  const porMotivo = new Map(filas.map((fila) => [fila.motivo as MotivoNoRespuesta, fila.cantidad]));

  return MOTIVOS_NO_RESPUESTA.map((motivo) => {
    const cantidad = porMotivo.get(motivo) ?? 0;
    return {
      motivo,
      etiqueta: ETIQUETA_MOTIVO[motivo],
      cantidad,
      porcentaje: porcentaje(cantidad, total),
    };
  }).sort((a, b) => b.cantidad - a.cantidad);
}

export type ResumenOperativo = {
  barrios: number;
  viviendas: number;
  relevadas: number;
  sinRespuesta: number;
  porcentajeRelevado: number;
  porcentajeNoRespuesta: number;
  encuestas: number;
  duracionMedianaSegundos: number | null;
  duracionMaximaSegundos: number | null;
  derivaciones: number;
  compromisos: number;
};

export async function resumenOperativo(barrioId?: string | null): Promise<ResumenOperativo> {
  const cobertura = await coberturaPorBarrio(barrioId);
  const totales = cobertura.reduce(
    (acumulado, fila) => ({
      viviendas: acumulado.viviendas + fila.viviendas,
      relevadas: acumulado.relevadas + fila.relevadas,
      sinRespuesta: acumulado.sinRespuesta + fila.sinRespuesta,
    }),
    { viviendas: 0, relevadas: 0, sinRespuesta: 0 },
  );

  const [duraciones] = await getDb()
    .select({
      encuestas: sql<number>`count(*)::int`,
      mediana: sql<
        number | null
      >`percentile_cont(0.5) within group (order by ${respuestas.duracionSegundos})`,
      maxima: sql<number | null>`max(${respuestas.duracionSegundos})`,
    })
    .from(respuestas)
    .where(barrioId ? eq(respuestas.barrioId, barrioId) : undefined);

  const [conteoDerivaciones] = await getDb()
    .select({
      total: sql<number>`count(*)::int`,
      compromisos: sql<number>`count(*) filter (where ${derivaciones.ordenTrabajoNro} is not null)::int`,
    })
    .from(derivaciones)
    .where(barrioId ? eq(derivaciones.barrioId, barrioId) : undefined);

  return {
    barrios: cobertura.length,
    ...totales,
    porcentajeRelevado: porcentaje(totales.relevadas, totales.viviendas),
    porcentajeNoRespuesta: porcentaje(totales.sinRespuesta, totales.viviendas),
    encuestas: duraciones?.encuestas ?? 0,
    duracionMedianaSegundos: duraciones?.mediana ? Math.round(Number(duraciones.mediana)) : null,
    duracionMaximaSegundos: duraciones?.maxima ? Number(duraciones.maxima) : null,
    derivaciones: conteoDerivaciones?.total ?? 0,
    compromisos: conteoDerivaciones?.compromisos ?? 0,
  };
}

export type Distribucion = {
  opcion: string;
  cantidad: number;
  porcentaje: number;
};

/**
 * Distribución de las respuestas de una pregunta. Sirve tanto para las de opción
 * única como para las múltiples: se leen los valores del JSON y se cuentan.
 *
 * Devuelve lista vacía si el barrio todavía no llegó al mínimo de casos.
 */
export async function distribucionDePregunta(
  preguntaId: string,
  barrioId?: string | null,
): Promise<{ total: number; suficiente: boolean; filas: Distribucion[] }> {
  const [conteo] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(respuestas)
    .where(
      and(
        barrioId ? eq(respuestas.barrioId, barrioId) : undefined,
        sql`${respuestas.payload} ? ${preguntaId}`,
      ),
    );

  const total = conteo?.total ?? 0;
  if (total < MINIMO_PARA_AGREGAR) return { total, suficiente: false, filas: [] };

  // Postgres no deja usar una función que devuelve conjuntos dentro de un CASE,
  // así que las respuestas múltiples y las simples se resuelven por separado y se
  // unen. Las múltiples cuentan una vez por opción elegida.
  const filtroBarrio = barrioId ? sql`and r.barrio_id = ${barrioId}` : sql``;
  const filas = await getDb().execute<{ opcion: string; cantidad: number }>(sql`
    select valor as opcion, count(*)::int as cantidad
    from (
      select jsonb_array_elements_text(r.payload -> ${preguntaId}) as valor
      from ${respuestas} r
      where r.payload ? ${preguntaId}
        and jsonb_typeof(r.payload -> ${preguntaId}) = 'array'
        ${filtroBarrio}
      union all
      select trim(both '"' from (r.payload -> ${preguntaId})::text) as valor
      from ${respuestas} r
      where r.payload ? ${preguntaId}
        and jsonb_typeof(r.payload -> ${preguntaId}) <> 'array'
        ${filtroBarrio}
    ) valores
    where valor <> ''
    group by valor
    order by cantidad desc
    limit 20
  `);

  return {
    total,
    suficiente: true,
    filas: (filas.rows ?? []).map((fila) => ({
      opcion: fila.opcion,
      cantidad: fila.cantidad,
      porcentaje: porcentaje(fila.cantidad, total),
    })),
  };
}

export type ResumenDerivaciones = {
  porEstado: { estado: EstadoDerivacion; cantidad: number }[];
  porCompetencia: { competencia: Competencia; cantidad: number }[];
  sinOrdenDeTrabajo: number;
};

export async function resumenDerivaciones(barrioId?: string | null): Promise<ResumenDerivaciones> {
  const condicion = barrioId ? eq(derivaciones.barrioId, barrioId) : undefined;

  const porEstado = await getDb()
    .select({ estado: derivaciones.estado, cantidad: sql<number>`count(*)::int` })
    .from(derivaciones)
    .where(condicion)
    .groupBy(derivaciones.estado);

  const porCompetencia = await getDb()
    .select({ competencia: derivaciones.competencia, cantidad: sql<number>`count(*)::int` })
    .from(derivaciones)
    .where(condicion)
    .groupBy(derivaciones.competencia);

  const [sinOrden] = await getDb()
    .select({ cantidad: sql<number>`count(*)::int` })
    .from(derivaciones)
    .where(and(condicion, sql`${derivaciones.ordenTrabajoNro} is null`));

  return {
    porEstado: porEstado.map((fila) => ({
      estado: fila.estado as EstadoDerivacion,
      cantidad: fila.cantidad,
    })),
    porCompetencia: porCompetencia.map((fila) => ({
      competencia: fila.competencia as Competencia,
      cantidad: fila.cantidad,
    })),
    sinOrdenDeTrabajo: sinOrden?.cantidad ?? 0,
  };
}

export async function listarBarrios(): Promise<{ id: string; nombre: string; slug: string }[]> {
  return getDb()
    .select({ id: barrios.id, nombre: barrios.nombre, slug: barrios.slug })
    .from(barrios)
    .orderBy(barrios.nombre);
}
