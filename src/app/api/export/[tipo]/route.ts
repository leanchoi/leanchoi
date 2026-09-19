import { NextResponse } from 'next/server';
import { exigirPermiso, respuestaDeError } from '@/lib/auth/guardias';
import { limitadoASuBarrio } from '@/lib/auth/roles';
import { exportar, TIPOS_EXPORT } from '@/lib/tablero/export';
import type { TipoExport } from '@/lib/tablero/export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/export/{respuestas|cobertura|no-respuestas}.csv
 *
 * Exports anonimizados. Cada descarga queda registrada en `audit_log` con quién la
 * pidió y cuántas filas se llevó.
 */
export async function GET(request: Request, contexto: { params: Promise<{ tipo: string }> }) {
  try {
    const usuario = await exigirPermiso('exportar');
    const { tipo } = await contexto.params;
    const limpio = tipo.replace(/\.csv$/, '') as TipoExport;

    if (!TIPOS_EXPORT.includes(limpio)) {
      return NextResponse.json({ error: 'export_desconocido' }, { status: 404 });
    }

    const pedido = new URL(request.url).searchParams.get('barrio');
    const barrioId = limitadoASuBarrio(usuario.rol) ? usuario.barrioId : pedido;

    const csv = await exportar(usuario, limpio, barrioId);
    const fecha = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="relevamiento-${limpio}-${fecha}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const respuesta = respuestaDeError(error);
    if (respuesta) return respuesta;
    throw error;
  }
}
