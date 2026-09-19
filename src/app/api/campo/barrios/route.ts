import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { barrios } from '@/db/schema';
import { exigirSesion, respuestaDeError } from '@/lib/auth/guardias';
import { limitadoASuBarrio } from '@/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/campo/barrios — barrios en los que puede trabajar quien pide.
 *
 * El encuestador y la coordinación de barrio ven únicamente el suyo. Solo nombres y
 * slugs: acá no hay ningún dato de vecinos.
 */
export async function GET() {
  try {
    const usuario = await exigirSesion();

    const consulta = getDb()
      .select({ id: barrios.id, slug: barrios.slug, nombre: barrios.nombre })
      .from(barrios);

    const filas =
      limitadoASuBarrio(usuario.rol) && usuario.barrioId
        ? await consulta.where(eq(barrios.id, usuario.barrioId))
        : await consulta.where(eq(barrios.activo, true)).orderBy(asc(barrios.nombre));

    return NextResponse.json({ barrios: filas, barrioAsignado: usuario.barrioId });
  } catch (error) {
    const respuesta = respuestaDeError(error);
    if (respuesta) return respuesta;
    throw error;
  }
}
