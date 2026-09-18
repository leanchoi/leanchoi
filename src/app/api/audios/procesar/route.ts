import { NextResponse } from 'next/server';
import { getConfigAudio } from '@/lib/audio/config';
import { procesarPendientes, purgarAudiosVencidos } from '@/lib/audio/pipeline';
import { crearDependenciasAudio, tokenWorkerValido } from '@/lib/audio/servicio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/audios/procesar — dispara la desgrabación de los audios pendientes y
 * el barrido de purga. Pensado para un cron (`scripts/procesar-audios.ts` hace lo
 * mismo sin HTTP).
 *
 * Requiere la cabecera `x-audio-worker-token` con el valor de AUDIO_WORKER_TOKEN.
 */
export async function POST(request: Request) {
  const config = getConfigAudio();

  if (!config.habilitado) {
    return NextResponse.json({ error: 'audio_deshabilitado' }, { status: 503 });
  }
  if (!config.tokenWorker) {
    return NextResponse.json(
      { error: 'sin_token_configurado', detalle: 'Definí AUDIO_WORKER_TOKEN para usar esta ruta.' },
      { status: 503 },
    );
  }
  if (!tokenWorkerValido(request.headers.get('x-audio-worker-token'), config.tokenWorker)) {
    return NextResponse.json({ error: 'no_autorizado' }, { status: 401 });
  }

  const deps = crearDependenciasAudio();
  const verificacion = deps.proveedor.verificarConfiguracion();
  if (!verificacion.ok) {
    return NextResponse.json(
      {
        error: 'proveedor_mal_configurado',
        proveedor: deps.proveedor.nombre,
        detalle: verificacion.problemas,
      },
      { status: 503 },
    );
  }

  const proceso = await procesarPendientes(deps);
  const purga = await purgarAudiosVencidos(deps);

  return NextResponse.json({ proveedor: deps.proveedor.nombre, proceso, purga });
}
