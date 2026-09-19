'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ControlPregunta } from '@/components/campo/controles';
import {
  audioDePregunta,
  cerrarEncuesta,
  guardarAudio,
  guardarAvance,
  obtenerEncuesta,
} from '@/lib/campo/almacen';
import type { BaseCampo } from '@/lib/campo/db';
import {
  aceptarConsentimiento,
  avanzar,
  construirPasos,
  impedimentoParaAvanzar,
  pasoActual,
  progreso,
  puedeRetroceder,
  responder,
  respuestasVisiblesParaEncuestador,
  retroceder,
} from '@/lib/campo/encuesta';
import { ultimaUbicacion } from '@/lib/campo/gps';
import type { EncuestaLocal, ValorRespuesta } from '@/lib/campo/tipos';
import type { Cuestionario } from '@/lib/cuestionario';

/**
 * La encuesta paso a paso. Una pantalla por pregunta, guardando en cada paso: si
 * el teléfono se apaga, al volver se retoma exactamente acá (regla 9).
 *
 * El bloque autoadministrado se entrega al vecino y, al cerrarlo, se sella: el
 * encuestador no vuelve a verlo (regla 8).
 */
export function PantallaEncuesta({
  base,
  cuestionario,
  ticket,
  audioHabilitado,
  onTerminada,
  onRechazo,
  onSalir,
}: {
  base: BaseCampo;
  cuestionario: Cuestionario;
  ticket: string;
  audioHabilitado: boolean;
  onTerminada: (ticket: string) => void;
  onRechazo: () => void;
  onSalir: () => void;
}) {
  const pasos = useMemo(() => construirPasos(cuestionario), [cuestionario]);
  const [encuesta, setEncuesta] = useState<EncuestaLocal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tieneAudio, setTieneAudio] = useState(false);

  useEffect(() => {
    void obtenerEncuesta(base, ticket).then((guardada) => setEncuesta(guardada ?? null));
  }, [base, ticket]);

  const actualizar = useCallback(
    async (siguiente: EncuestaLocal) => {
      setEncuesta(siguiente);
      await guardarAvance(base, siguiente);
    },
    [base],
  );

  const paso = encuesta ? pasoActual(encuesta, pasos) : null;

  useEffect(() => {
    if (!encuesta || paso?.tipo !== 'pregunta') return;
    void audioDePregunta(base, encuesta.ticket, paso.pregunta.id).then((audio) =>
      setTieneAudio(Boolean(audio)),
    );
  }, [base, encuesta, paso]);

  if (!encuesta || !paso) {
    return <p className="text-muted-foreground p-6">Abriendo la encuesta…</p>;
  }

  const avance = progreso(encuesta, pasos);
  const enModoVecino = paso.tipo === 'pregunta' && paso.autoadministrada;

  const siguiente = async () => {
    const impedimento = impedimentoParaAvanzar(encuesta, pasos);
    if (impedimento) {
      setAviso(impedimento.mensaje);
      return;
    }
    setAviso(null);
    await actualizar(avanzar(encuesta, pasos));
  };

  const atras = async () => {
    setAviso(null);
    await actualizar(retroceder(encuesta, pasos));
  };

  const cerrar = async () => {
    const cerrada = await cerrarEncuesta(base, encuesta, { cuestionario, gps: ultimaUbicacion() });
    onTerminada(cerrada.ticket);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* En modo vecino la pantalla queda limpia: sin barra, sin progreso, sin nada del encuestador. */}
      {!enModoVecino && (
        <header className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onSalir}
              className="text-muted-foreground text-sm underline"
            >
              Salir
            </button>
            <span className="text-muted-foreground text-sm tabular-nums">
              {avance.actual} de {avance.total}
            </span>
          </div>
          <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-all"
              style={{ width: `${avance.porcentaje}%` }}
            />
          </div>
        </header>
      )}

      <main className="flex-1 px-4 py-6">
        {paso.tipo === 'consentimiento' && (
          <section className="space-y-5">
            <h1 className="text-2xl font-semibold">{cuestionario.consentimiento.titulo}</h1>
            <p className="text-base leading-relaxed whitespace-pre-line">
              {cuestionario.consentimiento.texto}
            </p>
            <div className="bg-muted/40 rounded-lg border p-4 text-sm">
              <p className="font-medium">Para qué se usan los datos</p>
              <p className="text-muted-foreground mt-1">{cuestionario.consentimiento.finalidad}</p>
              <p className="text-muted-foreground mt-2">
                Responsable: {cuestionario.consentimiento.responsable}
              </p>
            </div>
            <div className="space-y-3">
              <Button
                size="lg"
                className="w-full"
                onClick={async () => {
                  const aceptada = aceptarConsentimiento(
                    encuesta,
                    cuestionario.consentimiento.version,
                  );
                  await actualizar(avanzar(aceptada, pasos));
                }}
              >
                El vecino acepta y empezamos
              </Button>
              <Button size="lg" variant="outline" className="w-full" onClick={onRechazo}>
                No acepta — cerrar como rechazo
              </Button>
            </div>
          </section>
        )}

        {paso.tipo === 'entrega_celular' && (
          <section className="flex min-h-[60vh] flex-col justify-center space-y-6 text-center">
            <h1 className="text-2xl font-semibold">Entregale el celular al vecino</h1>
            <p className="text-muted-foreground text-base">
              Las próximas preguntas —{paso.titulo.toLowerCase()}— las contesta la persona sola.
              Cuando termine, te devuelve el teléfono y vos no vas a ver lo que contestó.
            </p>
            <Button size="lg" className="w-full" onClick={siguiente}>
              Listo, se lo entregué
            </Button>
          </section>
        )}

        {paso.tipo === 'pregunta' && (
          <section className="space-y-6">
            {enModoVecino && (
              <p className="text-muted-foreground text-sm">
                Contestá vos mismo. El encuestador no va a ver estas respuestas.
              </p>
            )}
            <h1 className="text-xl font-semibold leading-snug">{paso.pregunta.texto}</h1>
            <ControlPregunta
              pregunta={paso.pregunta}
              valor={encuesta.respuestas[paso.pregunta.id] ?? null}
              onCambio={(valor: ValorRespuesta) =>
                void actualizar(responder(encuesta, paso.pregunta.id, valor))
              }
              audio={{
                habilitado: audioHabilitado,
                grabado: tieneAudio,
                onGrabado: async (blob, mime, duracion) => {
                  await guardarAudio(base, {
                    ticket: encuesta.ticket,
                    preguntaId: paso.pregunta.id,
                    blob,
                    mime,
                    duracionSegundos: duracion,
                  });
                  setTieneAudio(true);
                },
              }}
            />
            {!paso.pregunta.obligatoria && (
              <p className="text-muted-foreground text-sm">Se puede no contestar.</p>
            )}
          </section>
        )}

        {paso.tipo === 'devolucion_celular' && (
          <section className="flex min-h-[60vh] flex-col justify-center space-y-6 text-center">
            <h1 className="text-2xl font-semibold">Gracias</h1>
            <p className="text-muted-foreground text-base">
              Devolvele el celular al encuestador. Estas respuestas quedan guardadas y nadie del
              barrio las va a ver.
            </p>
            <Button size="lg" className="w-full" onClick={siguiente}>
              Cerrar el bloque y devolver el teléfono
            </Button>
          </section>
        )}

        {paso.tipo === 'cierre' && (
          <section className="space-y-5">
            <h1 className="text-2xl font-semibold">Terminamos</h1>
            <p className="text-muted-foreground">
              {Object.keys(respuestasVisiblesParaEncuestador(encuesta, pasos)).length} respuestas
              cargadas
              {encuesta.bloquesSellados.length > 0 && ', más el bloque que contestó el vecino'}.
            </p>
            <Button size="lg" className="w-full" onClick={cerrar}>
              Cerrar la encuesta y darle el ticket
            </Button>
          </section>
        )}

        {aviso && (
          <p className="text-destructive mt-4 text-sm" role="alert">
            {aviso}
          </p>
        )}
      </main>

      {paso.tipo === 'pregunta' && (
        <footer className="sticky bottom-0 border-t bg-[var(--background)] px-4 py-3">
          <div className="flex gap-3">
            {puedeRetroceder(encuesta, pasos) && (
              <Button variant="outline" size="lg" onClick={atras}>
                Atrás
              </Button>
            )}
            <Button size="lg" className="flex-1" onClick={siguiente}>
              Siguiente
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
