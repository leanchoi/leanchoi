'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { codigoCorto } from '@/lib/campo/ticket';
import { ESTADOS_DERIVACION, ETIQUETA_ESTADO } from '@/lib/devolucion/tipos';
import type { Derivacion, EstadoDerivacion } from '@/lib/devolucion/tipos';
import {
  DESCRIPCION_PLANTILLA,
  plantillaDisponible,
  TIPOS_PLANTILLA,
} from '@/lib/devolucion/plantillas';
import type { TipoPlantilla } from '@/lib/devolucion/plantillas';

/**
 * Gestión de derivaciones.
 *
 * El botón de "compromiso" está apagado mientras no haya orden de trabajo: la regla
 * también vive en el servidor, pero acá se ve el motivo antes de intentarlo.
 */
export function GestorDerivaciones({ iniciales }: { iniciales: Derivacion[] }) {
  const [derivaciones, setDerivaciones] = useState(iniciales);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const actualizar = async (id: string, cambio: Record<string, unknown>) => {
    const respuesta = await fetch(`/api/derivaciones/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cambio),
    });
    if (!respuesta.ok) {
      setMensaje('No se pudo guardar el cambio.');
      return;
    }
    const cuerpo = (await respuesta.json()) as { derivacion: Derivacion };
    setDerivaciones((actuales) =>
      actuales.map((derivacion) => (derivacion.id === id ? cuerpo.derivacion : derivacion)),
    );
    setMensaje('Cambio guardado.');
  };

  const enviar = async (id: string, tipo: TipoPlantilla) => {
    setMensaje('Enviando…');
    const respuesta = await fetch(`/api/derivaciones/${id}/acuse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo }),
    });
    const cuerpo = await respuesta.json();

    if (respuesta.status === 409) {
      setMensaje(`No se envió: ${cuerpo.detalle}`);
      return;
    }
    if (!respuesta.ok) {
      setMensaje('No se pudo enviar.');
      return;
    }
    setMensaje(
      cuerpo.acuse.enviado
        ? 'Comunicación enviada al vecino.'
        : `Comunicación registrada (${cuerpo.acuse.detalle ?? 'sin envío'}). Queda para entregar en la sede.`,
    );
  };

  if (derivaciones.length === 0) {
    return (
      <p className="text-muted-foreground">
        Todavía no hay derivaciones cargadas. Se crean a partir de lo que pidieron los vecinos.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {mensaje && <p className="text-sm">{mensaje}</p>}

      {derivaciones.map((derivacion) => {
        const compromisoDisponible = plantillaDisponible('compromiso', derivacion.ordenTrabajoNro);
        const estaAbierta = abierta === derivacion.id;

        return (
          <article key={derivacion.id} className="rounded-xl border p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{codigoCorto(derivacion.ticket)}</span>
              <Badge>{ETIQUETA_ESTADO[derivacion.estado]}</Badge>
              <Badge variant="outline">{derivacion.competencia}</Badge>
              <span className="text-muted-foreground text-sm">{derivacion.barrioNombre}</span>
            </div>

            <p className="mt-3">{derivacion.descripcion}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              A cargo de: {derivacion.areaDestino}
            </p>
            <p className="mt-2 text-sm">
              {derivacion.ordenTrabajoNro ? (
                <>
                  Orden de trabajo: <strong>{derivacion.ordenTrabajoNro}</strong>
                </>
              ) : (
                <span className="text-muted-foreground">Sin orden de trabajo.</span>
              )}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAbierta(estaAbierta ? null : derivacion.id)}
              >
                {estaAbierta ? 'Cerrar' : 'Editar'}
              </Button>

              {TIPOS_PLANTILLA.map((tipo) => {
                const disponible = tipo !== 'compromiso' || compromisoDisponible.ok;
                return (
                  <Button
                    key={tipo}
                    size="sm"
                    variant={tipo === 'compromiso' ? 'default' : 'secondary'}
                    disabled={!disponible}
                    title={
                      disponible
                        ? DESCRIPCION_PLANTILLA[tipo]
                        : !compromisoDisponible.ok
                          ? compromisoDisponible.motivo
                          : ''
                    }
                    onClick={() => void enviar(derivacion.id, tipo)}
                  >
                    Enviar {tipo}
                  </Button>
                );
              })}
            </div>

            {!compromisoDisponible.ok && (
              <p className="text-muted-foreground mt-2 text-xs">{compromisoDisponible.motivo}</p>
            )}

            {estaAbierta && (
              <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium">Estado</span>
                  <select
                    defaultValue={derivacion.estado}
                    onChange={(evento) =>
                      void actualizar(derivacion.id, {
                        estado: evento.target.value as EstadoDerivacion,
                      })
                    }
                    className="mt-1 h-11 w-full rounded-lg border bg-transparent px-2"
                  >
                    {ESTADOS_DERIVACION.map((estado) => (
                      <option key={estado} value={estado}>
                        {ETIQUETA_ESTADO[estado]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="font-medium">Orden de trabajo</span>
                  <input
                    type="text"
                    defaultValue={derivacion.ordenTrabajoNro ?? ''}
                    placeholder="OT-2026-00000"
                    onBlur={(evento) =>
                      void actualizar(derivacion.id, {
                        ordenTrabajoNro: evento.target.value.trim() || null,
                      })
                    }
                    className="mt-1 h-11 w-full rounded-lg border bg-transparent px-2"
                  />
                </label>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
