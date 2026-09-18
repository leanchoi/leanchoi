'use client';

import { useCallback, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { Button } from '@/components/ui/button';

/**
 * Banco de pruebas del envío de audio. Graba, sube y consulta el estado.
 *
 * La app de campo definitiva (fase 3) reutiliza este mismo camino, pero guardando
 * primero en IndexedDB y enviando desde la cola de sincronización cuando hay señal.
 * Nada de esto usa localStorage ni sessionStorage.
 */

/** Formatos preferidos, en orden: los primeros son los que más proveedores aceptan. */
const FORMATOS_PREFERIDOS = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
];

function elegirFormato(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return FORMATOS_PREFERIDOS.find((formato) => MediaRecorder.isTypeSupported(formato));
}

type EstadoEnvio =
  | { tipo: 'inicial' }
  | { tipo: 'grabando' }
  | { tipo: 'enviando' }
  | { tipo: 'enviado'; audioId: string; bytes: number; vigenciaHoras: number }
  | { tipo: 'error'; mensaje: string };

type EstadoAudio = {
  estado: string;
  audio_disponible: boolean;
  tiene_transcripcion: boolean;
  purga_motivo: string | null;
  intentos: number;
};

export function Grabador({ preguntaId }: { preguntaId: string }) {
  const [ticket] = useState(() => uuidv7());
  const [envio, setEnvio] = useState<EstadoEnvio>({ tipo: 'inicial' });
  const [consulta, setConsulta] = useState<EstadoAudio | null>(null);
  const grabadorRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<Blob[]>([]);
  const inicioRef = useRef<number>(0);

  const enviar = useCallback(
    async (blob: Blob, duracionSegundos: number) => {
      setEnvio({ tipo: 'enviando' });
      const formulario = new FormData();
      formulario.append('ticket', ticket);
      formulario.append('pregunta_id', preguntaId);
      formulario.append('duracion_s', duracionSegundos.toFixed(1));
      formulario.append('archivo', blob, 'respuesta');

      try {
        const respuesta = await fetch('/api/audios', { method: 'POST', body: formulario });
        const cuerpo = await respuesta.json();
        if (!respuesta.ok) {
          setEnvio({
            tipo: 'error',
            mensaje: `${cuerpo.error ?? respuesta.status}: ${cuerpo.detalle ?? ''}`,
          });
          return;
        }
        setEnvio({
          tipo: 'enviado',
          audioId: cuerpo.audio_id,
          bytes: cuerpo.bytes,
          vigenciaHoras: cuerpo.vigencia_horas,
        });
      } catch (error) {
        setEnvio({
          tipo: 'error',
          mensaje: error instanceof Error ? error.message : 'Falló el envío',
        });
      }
    },
    [preguntaId, ticket],
  );

  const comenzar = useCallback(async () => {
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const formato = elegirFormato();
      const grabador = new MediaRecorder(flujo, formato ? { mimeType: formato } : undefined);
      trozosRef.current = [];
      inicioRef.current = Date.now();

      grabador.ondataavailable = (evento) => {
        if (evento.data.size > 0) trozosRef.current.push(evento.data);
      };
      grabador.onstop = () => {
        for (const pista of flujo.getTracks()) pista.stop();
        const blob = new Blob(trozosRef.current, { type: grabador.mimeType });
        void enviar(blob, (Date.now() - inicioRef.current) / 1000);
      };

      grabador.start();
      grabadorRef.current = grabador;
      setEnvio({ tipo: 'grabando' });
      setConsulta(null);
    } catch (error) {
      setEnvio({
        tipo: 'error',
        mensaje: `No se pudo acceder al micrófono: ${error instanceof Error ? error.message : ''}`,
      });
    }
  }, [enviar]);

  const detener = useCallback(() => {
    grabadorRef.current?.stop();
    grabadorRef.current = null;
  }, []);

  const consultarEstado = useCallback(async () => {
    if (envio.tipo !== 'enviado') return;
    const respuesta = await fetch(`/api/audios/${envio.audioId}`, { cache: 'no-store' });
    if (respuesta.ok) setConsulta((await respuesta.json()) as EstadoAudio);
  }, [envio]);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Ticket de prueba: <code className="text-xs">{ticket}</code>
      </p>

      <div className="flex flex-wrap gap-3">
        {envio.tipo === 'grabando' ? (
          <Button size="lg" variant="destructive" onClick={detener}>
            Detener y enviar
          </Button>
        ) : (
          <Button size="lg" onClick={comenzar} disabled={envio.tipo === 'enviando'}>
            {envio.tipo === 'enviando' ? 'Enviando…' : 'Grabar respuesta'}
          </Button>
        )}
        {envio.tipo === 'enviado' && (
          <Button size="lg" variant="outline" onClick={consultarEstado}>
            Consultar estado
          </Button>
        )}
      </div>

      {envio.tipo === 'enviado' && (
        <div className="rounded-lg border p-4 text-sm">
          <p>
            Audio recibido: <code className="text-xs">{envio.audioId}</code> ({envio.bytes} bytes).
          </p>
          <p className="text-muted-foreground mt-1">
            Se conserva como máximo {envio.vigenciaHoras} horas, y se borra apenas la desgrabación
            queda asegurada.
          </p>
        </div>
      )}

      {envio.tipo === 'error' && (
        <p className="text-destructive text-sm" role="alert">
          {envio.mensaje}
        </p>
      )}

      {consulta && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border p-4 text-sm">
          <dt className="text-muted-foreground">Estado</dt>
          <dd>{consulta.estado}</dd>
          <dt className="text-muted-foreground">Bytes del audio en el sistema</dt>
          <dd>{consulta.audio_disponible ? 'todavía guardados' : 'ya borrados'}</dd>
          <dt className="text-muted-foreground">Transcripción</dt>
          <dd>{consulta.tiene_transcripcion ? 'asegurada' : 'pendiente'}</dd>
          <dt className="text-muted-foreground">Motivo de purga</dt>
          <dd>{consulta.purga_motivo ?? '—'}</dd>
          <dt className="text-muted-foreground">Intentos</dt>
          <dd>{consulta.intentos}</dd>
        </dl>
      )}
    </div>
  );
}
