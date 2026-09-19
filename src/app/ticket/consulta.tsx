'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Consulta del vecino. Dos formas de entrar: el código del comprobante, o el
 * apellido con los últimos tres números del documento. Sin cuenta.
 */

type Paso = {
  competencia: string;
  areaDestino: string;
  descripcion: string;
  estado: string;
  ordenTrabajoNro: string | null;
  actualizadaEn: string;
};

type Estado = {
  codigo: string;
  barrioNombre: string;
  recibidoEn: string;
  derivaciones: Paso[];
  comunicaciones: { plantilla: string; canal: string; enviadoEn: string | null }[];
};

const ETIQUETA_ESTADO: Record<string, string> = {
  recibida: 'Recibida',
  derivada: 'Derivada',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
  fuera_de_competencia: 'No le corresponde al municipio',
};

const ETIQUETA_COMPETENCIA: Record<string, string> = {
  municipal: 'Municipal',
  provincial: 'Provincial',
  nacional: 'Nacional',
  privada: 'Empresa prestadora',
};

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(iso));
}

export function ConsultaTicket({ codigoInicial }: { codigoInicial?: string }) {
  const [modo, setModo] = useState<'codigo' | 'dni'>(codigoInicial ? 'codigo' : 'codigo');
  const [codigo, setCodigo] = useState(codigoInicial ?? '');
  const [apellido, setApellido] = useState('');
  const [dni, setDni] = useState('');
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  const consultar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setError(null);
    setEstado(null);
    setBuscando(true);
    try {
      const cuerpo = modo === 'codigo' ? { codigo } : { apellido, dni };
      const respuesta = await fetch('/api/ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        setError(datos.detalle ?? 'No se pudo consultar.');
        return;
      }
      setEstado(datos.estado as Estado);
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        {(['codigo', 'dni'] as const).map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => setModo(opcion)}
            aria-pressed={modo === opcion}
            className={`min-h-12 flex-1 rounded-lg border px-3 text-sm ${
              modo === opcion
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background'
            }`}
          >
            {opcion === 'codigo' ? 'Con el código' : 'Con apellido y DNI'}
          </button>
        ))}
      </div>

      <form onSubmit={consultar} className="mt-6 space-y-4">
        {modo === 'codigo' ? (
          <label className="block">
            <span className="text-sm font-medium">Código del comprobante</span>
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="ESQ-XXXX-XXXX"
              className="mt-1 h-14 w-full rounded-lg border bg-transparent px-3 font-mono text-base"
              required
            />
          </label>
        ) : (
          <>
            <label className="block">
              <span className="text-sm font-medium">Apellido</span>
              <input
                type="text"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                className="mt-1 h-14 w-full rounded-lg border bg-transparent px-3 text-base"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Últimos 3 números del DNI</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                className="mt-1 h-14 w-full rounded-lg border bg-transparent px-3 text-base"
                required
              />
            </label>
          </>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={buscando}>
          {buscando ? 'Buscando…' : 'Consultar'}
        </Button>
      </form>

      {error && (
        <p className="text-muted-foreground mt-6 text-sm" role="alert">
          {error}
        </p>
      )}

      {estado && (
        <section className="mt-8 space-y-6">
          <div className="rounded-xl border p-5">
            <p className="text-muted-foreground text-sm">Pedido</p>
            <p className="font-mono text-xl font-semibold">{estado.codigo}</p>
            <p className="text-muted-foreground mt-2 text-sm">
              Barrio {estado.barrioNombre} · registrado el {fecha(estado.recibidoEn)}
            </p>
          </div>

          {estado.derivaciones.length === 0 ? (
            <p className="text-sm">
              Su pedido está registrado y todavía no fue derivado. Cuando se asigne a un área, va a
              poder verlo acá.
            </p>
          ) : (
            <ol className="space-y-4">
              {estado.derivaciones.map((paso, i) => (
                <li key={`${paso.areaDestino}-${i}`} className="rounded-xl border p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{ETIQUETA_ESTADO[paso.estado] ?? paso.estado}</Badge>
                    <Badge variant="outline">
                      {ETIQUETA_COMPETENCIA[paso.competencia] ?? paso.competencia}
                    </Badge>
                  </div>
                  <p className="mt-3">{paso.descripcion}</p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    A cargo de: {paso.areaDestino}
                  </p>
                  {paso.ordenTrabajoNro ? (
                    <p className="mt-2 text-sm">
                      Orden de trabajo N° <strong>{paso.ordenTrabajoNro}</strong>
                    </p>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-sm">
                      Todavía no hay una orden de trabajo asociada.
                    </p>
                  )}
                  <p className="text-muted-foreground mt-2 text-xs">
                    Última novedad: {fecha(paso.actualizadaEn)}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {estado.comunicaciones.length > 0 && (
            <div className="text-muted-foreground text-sm">
              <p className="font-medium">Comunicaciones que le enviamos</p>
              <ul className="mt-2 space-y-1">
                {estado.comunicaciones.map((comunicacion, i) => (
                  <li key={i}>
                    {comunicacion.plantilla} · {comunicacion.canal}
                    {comunicacion.enviadoEn
                      ? ` · ${fecha(comunicacion.enviadoEn)}`
                      : ' · pendiente de envío'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
