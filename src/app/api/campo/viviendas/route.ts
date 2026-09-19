import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { barrios, viviendas } from '@/db/schema';
import { exigirPermiso, respuestaDeError } from '@/lib/auth/guardias';
import { limitadoASuBarrio } from '@/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/campo/viviendas?barrio=slug — lista de trabajo del encuestador.
 *
 * Devuelve el identificador de manzana/lote y el punto de referencia. NUNCA calle,
 * número ni nada del schema `identificada`. Solo el barrio asignado.
 */
export async function GET(request: Request) {
  try {
    const usuario = await exigirPermiso('cargar_en_su_barrio');

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

    if (limitadoASuBarrio(usuario.rol) && usuario.barrioId !== barrio.id) {
      return NextResponse.json(
        { error: 'prohibido', detalle: 'Ese barrio no es el asignado a tu usuario.' },
        { status: 403 },
      );
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
  } catch (error) {
    const respuesta = respuestaDeError(error);
    if (respuesta) return respuesta;
    throw error;
  }
}
