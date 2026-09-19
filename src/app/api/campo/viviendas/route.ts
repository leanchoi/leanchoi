import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { barrios, viviendas } from '@/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/campo/viviendas?barrio=slug — lista de trabajo del encuestador.
 *
 * Devuelve el identificador de manzana/lote y el punto de referencia. NUNCA calle,
 * número ni nada del schema `identificada`.
 *
 * TODO(fase 4): exigir sesión de encuestador y que el barrio sea el asignado.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('barrio');
  if (!slug) {
    return NextResponse.json({ error: 'falta_barrio' }, { status: 400 });
  }

  const [barrio] = await getDb()
    .select({ id: barrios.id, slug: barrios.slug, nombre: barrios.nombre })
    .from(barrios)
    .where(eq(barrios.slug, slug))
    .limit(1);

  if (!barrio) {
    return NextResponse.json({ error: 'barrio_no_encontrado' }, { status: 404 });
  }

  const filas = await getDb()
    .select({
      id: viviendas.id,
      identificador: viviendas.identificador,
      estado: viviendas.estado,
      lat: viviendas.lat,
      lng: viviendas.lng,
    })
    .from(viviendas)
    .where(eq(viviendas.barrioId, barrio.id))
    .orderBy(asc(viviendas.identificador));

  return NextResponse.json({ barrio, viviendas: filas });
}
