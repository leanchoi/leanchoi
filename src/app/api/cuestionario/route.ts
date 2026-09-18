import { NextResponse } from 'next/server';
import { listarVersiones, obtenerVigente } from '@/lib/cuestionario/repositorio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cuestionario — la versión vigente, en datos, sin login (regla 10).
 *
 * Devuelve la definición tal cual se publicó. No expone ninguna respuesta de
 * vecinos: es solo el instrumento.
 */
export async function GET() {
  const vigente = await obtenerVigente();

  if (!vigente) {
    return NextResponse.json({ error: 'sin_version_publicada' }, { status: 404 });
  }

  return NextResponse.json({
    version: vigente.version,
    publicado_en: vigente.publicadoEn,
    changelog: vigente.changelog,
    segundos_totales: vigente.segundosTotales,
    consentimiento_version: vigente.consentimientoVersion,
    definicion: vigente.definicionCruda,
    versiones: (await listarVersiones()).map((v) => ({
      version: v.version,
      publicado_en: v.publicadoEn,
      changelog: v.changelog,
    })),
  });
}
