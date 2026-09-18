import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getConfigAudio } from '@/lib/audio/config';
import { AudioRechazado, registrarAudio } from '@/lib/audio/pipeline';
import { crearDependenciasAudio } from '@/lib/audio/servicio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/audios — recepción del audio grabado en campo (multipart/form-data).
 *
 * Campos: ticket, pregunta_id, archivo, y opcionalmente barrio_id y duracion_s.
 *
 * No existe ninguna ruta que devuelva los bytes del audio: entran, se desgraban y
 * se borran. Ver `docs/audio-y-transcripcion.md`.
 *
 * TODO(fase 4): exigir sesión de encuestador además del flag.
 */
const Entrada = z.object({
  ticket: z.uuid('El ticket tiene que ser un UUID generado en el dispositivo.'),
  pregunta_id: z.string().min(1).max(120),
  barrio_id: z.uuid().optional(),
  duracion_s: z.coerce.number().min(0).max(3600).optional(),
});

export async function POST(request: Request) {
  const config = getConfigAudio();
  if (!config.habilitado) {
    return NextResponse.json(
      { error: 'audio_deshabilitado', detalle: 'FEATURE_AUDIO está apagado.' },
      { status: 503 },
    );
  }

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return NextResponse.json({ error: 'formato_invalido' }, { status: 400 });
  }

  const parseo = Entrada.safeParse({
    ticket: formulario.get('ticket'),
    pregunta_id: formulario.get('pregunta_id'),
    barrio_id: formulario.get('barrio_id') ?? undefined,
    duracion_s: formulario.get('duracion_s') ?? undefined,
  });
  if (!parseo.success) {
    return NextResponse.json(
      { error: 'datos_invalidos', detalle: parseo.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const archivo = formulario.get('archivo');
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'falta_archivo' }, { status: 400 });
  }

  try {
    const deps = crearDependenciasAudio();
    const audio = await registrarAudio(deps, {
      ticket: parseo.data.ticket,
      preguntaId: parseo.data.pregunta_id,
      barrioId: parseo.data.barrio_id ?? null,
      mime: archivo.type || 'application/octet-stream',
      duracionSegundos: parseo.data.duracion_s ?? null,
      bytes: new Uint8Array(await archivo.arrayBuffer()),
    });

    return NextResponse.json(
      {
        audio_id: audio.id,
        estado: audio.estado,
        bytes: audio.bytes,
        // Aviso explícito para el cliente: esto no se guarda para siempre.
        vigencia_horas: config.ttlHoras,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AudioRechazado) {
      const estado = error.causa === 'deshabilitado' ? 503 : 400;
      return NextResponse.json({ error: error.causa, detalle: error.message }, { status: estado });
    }
    console.error('[audios] error al registrar audio:', error);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}
