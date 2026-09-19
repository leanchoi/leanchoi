import { desc, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { getDb } from '@/db';
import {
  barrios,
  derivaciones,
  informesBarrio,
  noRespuestas,
  respuestas,
  viviendas,
} from '@/db/schema';
import type { UsuarioSesion } from '@/lib/auth/usuarios';
import { ETIQUETA_MOTIVO } from '@/lib/campo/tipos';
import type { MotivoNoRespuesta } from '@/lib/campo/tipos';
import { obtenerVigente } from '@/lib/cuestionario/repositorio';
import type { Competencia } from './plantillas';

/**
 * El informe de barrio: una carilla que se imprime y se cuelga en la sede vecinal.
 *
 * Es la parte del ciclo que la gente ve. Dice cuántas casas se visitaron, cuántas no
 * se pudieron relevar y por qué, qué contestó el barrio, y —lo más importante— qué
 * se comprometió el municipio, con número de orden de trabajo. Sin eso, el
 * relevamiento es una encuesta más.
 */

/**
 * Pregunta del núcleo de la que salen los problemas priorizados. Es parte del núcleo
 * inmutable, así que su id no cambia entre versiones (regla 7).
 */
const PREGUNTA_PROBLEMAS = 'nucleo-06';

export type Cobertura = {
  viviendas: number;
  relevadas: number;
  sinRespuesta: number;
  pendientes: number;
  porcentajeRelevado: number;
  porcentajeNoRespuesta: number;
  porMotivo: { motivo: MotivoNoRespuesta; etiqueta: string; cantidad: number }[];
};

export type Problema = { opcion: string; cantidad: number; porcentaje: number };

export type Compromiso = {
  areaDestino: string;
  descripcion: string;
  ordenTrabajoNro: string;
  estado: string;
};

export type ContenidoInforme = {
  barrio: { nombre: string; slug: string };
  generadoEn: string;
  cuestionarioVersion: number;
  totalRespuestas: number;
  cobertura: Cobertura;
  topProblemas: Problema[];
  compromisos: Compromiso[];
  derivacionesPorCompetencia: { competencia: Competencia; cantidad: number }[];
};

function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;
}

export async function calcularInforme(slug: string): Promise<ContenidoInforme | null> {
  const db = getDb();

  const [barrio] = await db
    .select({ id: barrios.id, nombre: barrios.nombre, slug: barrios.slug })
    .from(barrios)
    .where(eq(barrios.slug, slug))
    .limit(1);
  if (!barrio) return null;

  const [conteoViviendas] = await db
    .select({
      total: sql<number>`count(*)::int`,
      relevadas: sql<number>`count(*) filter (where ${viviendas.estado} = 'relevada')::int`,
      sinRespuesta: sql<number>`count(*) filter (where ${viviendas.estado} = 'cerrada_sin_respuesta')::int`,
      pendientes: sql<number>`count(*) filter (where ${viviendas.estado} in ('pendiente','en_curso'))::int`,
    })
    .from(viviendas)
    .where(eq(viviendas.barrioId, barrio.id));

  const motivos = await db
    .select({ motivo: noRespuestas.motivo, cantidad: sql<number>`count(*)::int` })
    .from(noRespuestas)
    .where(eq(noRespuestas.barrioId, barrio.id))
    .groupBy(noRespuestas.motivo);

  const [totalRespuestas] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(respuestas)
    .where(eq(respuestas.barrioId, barrio.id));

  // Los tres problemas más elegidos del barrio.
  const problemas = await db.execute<{ opcion: string; cantidad: number }>(sql`
    select opcion, count(*)::int as cantidad
    from ${respuestas} r,
         lateral jsonb_array_elements_text(r.payload -> ${PREGUNTA_PROBLEMAS}) as opcion
    where r.barrio_id = ${barrio.id}
    group by opcion
    order by cantidad desc
    limit 8
  `);

  const derivacionesDelBarrio = await db
    .select({
      competencia: derivaciones.competencia,
      areaDestino: derivaciones.areaDestino,
      descripcion: derivaciones.descripcion,
      ordenTrabajoNro: derivaciones.ordenTrabajoNro,
      estado: derivaciones.estado,
    })
    .from(derivaciones)
    .where(eq(derivaciones.barrioId, barrio.id));

  const porCompetencia = new Map<Competencia, number>();
  for (const derivacion of derivacionesDelBarrio) {
    const clave = derivacion.competencia as Competencia;
    porCompetencia.set(clave, (porCompetencia.get(clave) ?? 0) + 1);
  }

  const totalViviendas = conteoViviendas?.total ?? 0;
  const relevadas = conteoViviendas?.relevadas ?? 0;
  const sinRespuesta = conteoViviendas?.sinRespuesta ?? 0;
  const respuestasTotales = totalRespuestas?.total ?? 0;

  const cuestionario = await obtenerVigente();

  return {
    barrio: { nombre: barrio.nombre, slug: barrio.slug },
    generadoEn: new Date().toISOString(),
    cuestionarioVersion: cuestionario?.version ?? 0,
    totalRespuestas: respuestasTotales,
    cobertura: {
      viviendas: totalViviendas,
      relevadas,
      sinRespuesta,
      pendientes: conteoViviendas?.pendientes ?? 0,
      porcentajeRelevado: porcentaje(relevadas, totalViviendas),
      porcentajeNoRespuesta: porcentaje(sinRespuesta, totalViviendas),
      porMotivo: motivos.map((fila) => ({
        motivo: fila.motivo as MotivoNoRespuesta,
        etiqueta: ETIQUETA_MOTIVO[fila.motivo as MotivoNoRespuesta] ?? fila.motivo,
        cantidad: fila.cantidad,
      })),
    },
    topProblemas: (problemas.rows ?? []).map((fila) => ({
      opcion: fila.opcion,
      cantidad: fila.cantidad,
      porcentaje: porcentaje(fila.cantidad, respuestasTotales),
    })),
    // Compromiso es solo lo que tiene orden de trabajo. Lo demás no se promete.
    compromisos: derivacionesDelBarrio
      .filter((derivacion) => derivacion.ordenTrabajoNro)
      .map((derivacion) => ({
        areaDestino: derivacion.areaDestino,
        descripcion: derivacion.descripcion,
        ordenTrabajoNro: derivacion.ordenTrabajoNro as string,
        estado: derivacion.estado,
      })),
    derivacionesPorCompetencia: [...porCompetencia.entries()].map(([competencia, cantidad]) => ({
      competencia,
      cantidad,
    })),
  };
}

/** Genera el informe y lo guarda. Queda publicado para que el barrio lo vea. */
export async function generarInforme(
  usuario: UsuarioSesion,
  slug: string,
  publicar = true,
): Promise<ContenidoInforme | null> {
  const contenido = await calcularInforme(slug);
  if (!contenido) return null;

  const [barrio] = await getDb()
    .select({ id: barrios.id })
    .from(barrios)
    .where(eq(barrios.slug, slug))
    .limit(1);
  if (!barrio) return null;

  await getDb().insert(informesBarrio).values({
    id: uuidv7(),
    barrioId: barrio.id,
    cuestionarioVersion: contenido.cuestionarioVersion,
    contenido,
    generadoPor: usuario.id,
    publicado: publicar,
  });

  return contenido;
}

export async function informePublicado(slug: string): Promise<ContenidoInforme | null> {
  const [fila] = await getDb()
    .select({ contenido: informesBarrio.contenido, publicado: informesBarrio.publicado })
    .from(informesBarrio)
    .innerJoin(barrios, eq(barrios.id, informesBarrio.barrioId))
    .where(eq(barrios.slug, slug))
    .orderBy(desc(informesBarrio.generadoEn))
    .limit(1);

  if (!fila || !fila.publicado) return null;
  return fila.contenido as ContenidoInforme;
}

export async function barriosConInforme(): Promise<
  { nombre: string; slug: string; generadoEn: Date }[]
> {
  const filas = await getDb()
    .select({
      nombre: barrios.nombre,
      slug: barrios.slug,
      generadoEn: informesBarrio.generadoEn,
      publicado: informesBarrio.publicado,
    })
    .from(informesBarrio)
    .innerJoin(barrios, eq(barrios.id, informesBarrio.barrioId))
    .orderBy(desc(informesBarrio.generadoEn));

  const vistos = new Set<string>();
  return filas
    .filter((fila) => fila.publicado && !vistos.has(fila.slug) && vistos.add(fila.slug))
    .map(({ nombre, slug, generadoEn }) => ({ nombre, slug, generadoEn }));
}
