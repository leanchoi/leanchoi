import { NextResponse } from 'next/server';
import { getConfigAudio } from '@/lib/audio/config';
import { RepositorioAudiosDrizzle } from '@/lib/audio/repositorio';
import { tokenWorkerValido } from '@/lib/audio/servicio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/audios/{id} — estado del audio y de su desgrabación.
 *
 * Devuelve SIEMPRE metadatos, nunca el audio. El texto transcripto solo se
 * entrega con el token de worker (hasta que existan los roles de la fase 4).
 */
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  const config = getConfigAudio();
  const repo = new RepositorioAudiosDrizzle();

  const audio = await repo.obtener(id);
  if (!audio) {
    return NextResponse.json({ error: 'no_encontrado' }, { status: 404 });
  }

  const conToken = tokenWorkerValido(
    _request.headers.get('x-audio-worker-token'),
    config.tokenWorker,
  );
  const texto = conToken ? await repo.textoDeTranscripcion(audio.id) : null;

  return NextResponse.json({
    audio_id: audio.id,
    estado: audio.estado,
    intentos: audio.intentos,
    bytes: audio.bytes,
    duracion_segundos: audio.duracionSegundos,
    creado_en: audio.creadoEn,
    transcripto_en: audio.transcriptoEn,
    purgado_en: audio.purgadoEn,
    purga_motivo: audio.purgaMotivo,
    // Confirmación explícita de que los bytes ya no están en el sistema.
    audio_disponible: audio.rutaRelativa !== null,
    tiene_transcripcion: await repo.transcripcionAsegurada(audio.id),
    ...(conToken ? { texto } : {}),
  });
}
