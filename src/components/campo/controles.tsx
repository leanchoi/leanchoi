'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Pregunta } from '@/lib/cuestionario';
import type { ValorRespuesta } from '@/lib/campo/tipos';

/**
 * Los controles de la encuesta. Botones grandes: se usa parado en la vereda, con
 * sol, a veces con guantes y con una sola mano.
 */

type Props = {
  pregunta: Pregunta;
  valor: ValorRespuesta;
  onCambio: (valor: ValorRespuesta) => void;
  audio?: {
    habilitado: boolean;
    grabado: boolean;
    onGrabado: (blob: Blob, mime: string, duracionSegundos: number) => void | Promise<void>;
  };
};

function BotonOpcion({
  seleccionado,
  children,
  onClick,
}: {
  seleccionado: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionado}
      className={cn(
        'min-h-14 w-full rounded-lg border px-4 py-3 text-left text-base transition-colors',
        seleccionado
          ? 'border-primary bg-primary text-primary-foreground font-medium'
          : 'bg-background hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

export function ControlPregunta({ pregunta, valor, onCambio, audio }: Props) {
  switch (pregunta.tipo) {
    case 'si_no':
      return (
        <div className="grid grid-cols-2 gap-3">
          {[
            { etiqueta: 'Sí', valor: true },
            { etiqueta: 'No', valor: false },
          ].map((opcion) => (
            <BotonOpcion
              key={opcion.etiqueta}
              seleccionado={valor === opcion.valor}
              onClick={() => onCambio(opcion.valor)}
            >
              {opcion.etiqueta}
            </BotonOpcion>
          ))}
        </div>
      );

    case 'opcion_unica':
      return (
        <div className="space-y-3">
          {pregunta.opciones.map((opcion) => (
            <BotonOpcion
              key={opcion}
              seleccionado={valor === opcion}
              onClick={() => onCambio(opcion)}
            >
              {opcion}
            </BotonOpcion>
          ))}
        </div>
      );

    case 'opcion_multiple': {
      const elegidas = Array.isArray(valor) ? valor : [];
      const tope = pregunta.maximo_opciones;
      const alternar = (opcion: string) => {
        if (elegidas.includes(opcion)) {
          onCambio(elegidas.filter((o) => o !== opcion));
          return;
        }
        if (tope && elegidas.length >= tope) return;
        onCambio([...elegidas, opcion]);
      };
      return (
        <div className="space-y-3">
          {tope && (
            <p className="text-muted-foreground text-sm">
              Hasta {tope} opciones · elegidas {elegidas.length}
            </p>
          )}
          {pregunta.opciones.map((opcion) => (
            <BotonOpcion
              key={opcion}
              seleccionado={elegidas.includes(opcion)}
              onClick={() => alternar(opcion)}
            >
              {opcion}
            </BotonOpcion>
          ))}
        </div>
      );
    }

    case 'escala': {
      const { minimo, maximo, etiqueta_minimo, etiqueta_maximo } = pregunta.escala;
      const valores = Array.from({ length: maximo - minimo + 1 }, (_, i) => minimo + i);
      return (
        <div>
          <div className="flex gap-2">
            {valores.map((numero) => (
              <button
                key={numero}
                type="button"
                onClick={() => onCambio(numero)}
                aria-pressed={valor === numero}
                className={cn(
                  'h-16 flex-1 rounded-lg border text-lg font-medium transition-colors',
                  valor === numero
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background',
                )}
              >
                {numero}
              </button>
            ))}
          </div>
          <div className="text-muted-foreground mt-2 flex justify-between text-sm">
            <span>{etiqueta_minimo}</span>
            <span>{etiqueta_maximo}</span>
          </div>
        </div>
      );
    }

    case 'numero': {
      const numero = typeof valor === 'number' ? valor : 0;
      return (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onCambio(Math.max(pregunta.minimo ?? 0, numero - 1))}
            aria-label="Restar uno"
          >
            −
          </Button>
          <input
            type="number"
            inputMode="numeric"
            value={typeof valor === 'number' ? valor : ''}
            onChange={(evento) =>
              onCambio(evento.target.value === '' ? null : Number(evento.target.value))
            }
            className="h-14 flex-1 rounded-lg border bg-transparent text-center text-2xl"
          />
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onCambio(numero + 1)}
            aria-label="Sumar uno"
          >
            +
          </Button>
        </div>
      );
    }

    case 'texto_corto':
      return (
        <input
          type="text"
          value={typeof valor === 'string' ? valor : ''}
          onChange={(evento) => onCambio(evento.target.value)}
          maxLength={pregunta.largo_maximo ?? 200}
          className="h-14 w-full rounded-lg border bg-transparent px-4 text-base"
        />
      );

    case 'abierta_voz':
      return (
        <RespuestaHablada
          valor={typeof valor === 'string' ? valor : ''}
          onCambio={onCambio}
          audio={audio}
        />
      );

    default:
      return null;
  }
}

/**
 * Las preguntas abiertas se contestan hablando. Si el audio está apagado —o el
 * teléfono no puede grabar— queda el texto escrito: nunca se pierde la respuesta.
 */
function RespuestaHablada({
  valor,
  onCambio,
  audio,
}: {
  valor: string;
  onCambio: (valor: ValorRespuesta) => void;
  audio: Props['audio'];
}) {
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(audio?.grabado ?? false);
  const grabadorRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<Blob[]>([]);
  const inicioRef = useRef(0);

  const comenzar = useCallback(async () => {
    setError(null);
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const formato = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find((f) =>
        typeof MediaRecorder !== 'undefined' ? MediaRecorder.isTypeSupported(f) : false,
      );
      const grabador = new MediaRecorder(flujo, formato ? { mimeType: formato } : undefined);
      trozosRef.current = [];
      inicioRef.current = Date.now();
      grabador.ondataavailable = (evento) => {
        if (evento.data.size > 0) trozosRef.current.push(evento.data);
      };
      grabador.onstop = () => {
        for (const pista of flujo.getTracks()) pista.stop();
        const blob = new Blob(trozosRef.current, { type: grabador.mimeType });
        void audio?.onGrabado(blob, grabador.mimeType, (Date.now() - inicioRef.current) / 1000);
        setListo(true);
      };
      grabador.start();
      grabadorRef.current = grabador;
      setGrabando(true);
    } catch {
      setError('No se pudo usar el micrófono. Escribí la respuesta.');
    }
  }, [audio]);

  const detener = useCallback(() => {
    grabadorRef.current?.stop();
    grabadorRef.current = null;
    setGrabando(false);
  }, []);

  return (
    <div className="space-y-4">
      {audio?.habilitado && (
        <div>
          {grabando ? (
            <Button
              type="button"
              size="lg"
              variant="destructive"
              className="w-full"
              onClick={detener}
            >
              Detener la grabación
            </Button>
          ) : (
            <Button type="button" size="lg" className="w-full" onClick={comenzar}>
              {listo ? 'Grabar de nuevo' : 'Grabar la respuesta'}
            </Button>
          )}
          {listo && !grabando && (
            <p className="text-muted-foreground mt-2 text-sm">
              Audio guardado en el teléfono. Se sube cuando haya señal y se borra apenas se
              desgraba.
            </p>
          )}
          {error && (
            <p className="text-destructive mt-2 text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      <label className="block">
        <span className="text-muted-foreground text-sm">
          {audio?.habilitado ? 'O anotá lo que dijo:' : 'Anotá lo que dijo:'}
        </span>
        <textarea
          value={valor}
          onChange={(evento) => onCambio(evento.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border bg-transparent p-3 text-base"
        />
      </label>
    </div>
  );
}
