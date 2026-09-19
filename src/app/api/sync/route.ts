import { NextResponse } from 'next/server';
import { exigirPermiso, respuestaDeError } from '@/lib/auth/guardias';
import { aplicarEventos } from '@/lib/sync/aplicar';
import { LoteSchema } from '@/lib/sync/esquemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/sync — lo que el celular junta en la calle.
 *
 * Idempotente y append-only (regla 9): mandar el mismo lote dos veces deja la base
 * igual que mandarlo una vez. La respuesta dice qué quedó confirmado —para que el
 * celular lo borre— y qué falló, con el motivo.
 */
export async function POST(request: Request) {
  try {
    const usuario = await exigirPermiso('cargar_en_su_barrio');

    const parseo = LoteSchema.safeParse(await request.json().catch(() => null));
    if (!parseo.success) {
      return NextResponse.json(
        { error: 'lote_invalido', detalle: parseo.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const resultado = await aplicarEventos(usuario, parseo.data.eventos);

    return NextResponse.json({
      confirmados: resultado.confirmados,
      errores: resultado.errores,
      nuevos: resultado.nuevos,
    });
  } catch (error) {
    const respuesta = respuestaDeError(error);
    if (respuesta) return respuesta;
    console.error('[sync] error inesperado:', error);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}
