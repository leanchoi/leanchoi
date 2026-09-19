import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { barrios } from '@/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/campo/barrios — listado de barrios para elegir al empezar la jornada.
 * Solo nombres y slugs: no hay ningún dato de vecinos acá.
 *
 * TODO(fase 4): limitar el listado al barrio asignado según la sesión del encuestador.
 */
export async function GET() {
  const filas = await getDb()
    .select({ id: barrios.id, slug: barrios.slug, nombre: barrios.nombre })
    .from(barrios)
    .where(eq(barrios.activo, true))
    .orderBy(asc(barrios.nombre));

  return NextResponse.json({ barrios: filas });
}
