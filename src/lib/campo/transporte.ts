import type { BaseCampo } from './db';
import type { ResultadoEnvio, Transporte } from './outbox';
import type { EventoSync } from './tipos';

/**
 * Cómo habla el celular con el servidor.
 *
 * Los audios se suben uno por uno con multipart (el archivo se lee de IndexedDB
 * recién en ese momento). El resto viaja junto en un lote JSON a /api/sync, que es
 * idempotente del lado del servidor: reenviar el mismo ticket no duplica nada.
 */
export function crearTransporteHttp(base: BaseCampo, baseUrl = ''): Transporte {
  return async (eventos: EventoSync[]): Promise<ResultadoEnvio> => {
    const confirmados: string[] = [];
    const errores: { id: string; error: string }[] = [];

    const audios = eventos.filter((evento) => evento.tipo === 'audio');
    const resto = eventos.filter((evento) => evento.tipo !== 'audio');

    for (const evento of audios) {
      try {
        await subirAudio(base, evento, baseUrl);
        confirmados.push(evento.id);
      } catch (error) {
        errores.push({ id: evento.id, error: mensaje(error) });
      }
    }

    if (resto.length > 0) {
      try {
        const respuesta = await fetch(`${baseUrl}/api/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eventos: resto.map((evento) => ({
              id: evento.id,
              ticket: evento.ticket,
              tipo: evento.tipo,
              payload: evento.payload,
              creadoEn: evento.creadoEn,
            })),
          }),
        });

        if (!respuesta.ok) {
          const detalle =
            respuesta.status === 404
              ? 'El servidor de sincronización todavía no está disponible (llega en la fase 4).'
              : `El servidor respondió ${respuesta.status}.`;
          for (const evento of resto) errores.push({ id: evento.id, error: detalle });
        } else {
          const cuerpo = (await respuesta.json()) as {
            confirmados?: string[];
            errores?: { id: string; error: string }[];
          };
          confirmados.push(...(cuerpo.confirmados ?? []));
          errores.push(...(cuerpo.errores ?? []));
        }
      } catch (error) {
        for (const evento of resto) errores.push({ id: evento.id, error: mensaje(error) });
      }
    }

    return { confirmados, errores };
  };
}

async function subirAudio(base: BaseCampo, evento: EventoSync, baseUrl: string): Promise<void> {
  const referencia = evento.payload as { id: string; preguntaId: string; duracionSegundos: number };
  const audio = await base.audios.get(referencia.id);
  if (!audio) return; // ya se subió y se purgó

  const formulario = new FormData();
  formulario.append('ticket', evento.ticket);
  formulario.append('pregunta_id', referencia.preguntaId);
  formulario.append('duracion_s', String(referencia.duracionSegundos));
  formulario.append('archivo', audio.blob, `${referencia.id}`);

  const respuesta = await fetch(`${baseUrl}/api/audios`, { method: 'POST', body: formulario });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
    throw new Error(cuerpo?.error ?? `El servidor respondió ${respuesta.status}.`);
  }
}

function mensaje(error: unknown): string {
  if (error instanceof Error) {
    return error.message === 'Failed to fetch' ? 'Sin conexión.' : error.message;
  }
  return String(error);
}
