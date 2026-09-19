'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CodigoQR } from '@/components/campo/qr';
import { PantallaEncuesta } from '@/components/campo/pantalla-encuesta';
import {
  agregarVivienda,
  encuestaEnCurso,
  guardarCuestionario,
  guardarSesion,
  guardarViviendas,
  iniciarEncuesta,
  listarViviendas,
  obtenerCuestionario,
  obtenerSesion,
  registrarNoRespuesta,
  resumenDelBarrio,
} from '@/lib/campo/almacen';
import type { ResumenBarrio } from '@/lib/campo/almacen';
import { getBaseCampo } from '@/lib/campo/db';
import type { BaseCampo } from '@/lib/campo/db';
import { iniciarSeguimiento, ultimaUbicacion } from '@/lib/campo/gps';
import { contarPendientes, pendientes, sincronizar } from '@/lib/campo/outbox';
import { codigoCorto } from '@/lib/campo/ticket';
import { crearTransporteHttp } from '@/lib/campo/transporte';
import { ETIQUETA_MOTIVO, MOTIVOS_NO_RESPUESTA } from '@/lib/campo/tipos';
import type { EventoSync, MotivoNoRespuesta, SesionCampo, ViviendaLocal } from '@/lib/campo/tipos';
import { CuestionarioSchema } from '@/lib/cuestionario';
import type { Cuestionario } from '@/lib/cuestionario';
import { nuevoDispositivoId } from '@/lib/campo/ticket';

/**
 * La app de campo. Todo lo que hace falta para relevar una cuadra entera sin una
 * barra de señal: el cuestionario y la lista de viviendas quedan en el teléfono, y
 * lo cargado espera en la cola hasta que haya red.
 */

type Vista =
  | { tipo: 'cargando' }
  | { tipo: 'inicio' }
  | { tipo: 'barrio' }
  | { tipo: 'vivienda'; viviendaId: string }
  | { tipo: 'encuesta'; ticket: string }
  | { tipo: 'ticket'; ticket: string }
  | { tipo: 'cola' };

type BarrioRemoto = { id: string; slug: string; nombre: string };

export function AppCampo({ audioHabilitado }: { audioHabilitado: boolean }) {
  const [base, setBase] = useState<BaseCampo | null>(null);
  const [vista, setVista] = useState<Vista>({ tipo: 'cargando' });
  const [sesion, setSesion] = useState<SesionCampo | null>(null);
  const [cuestionario, setCuestionario] = useState<Cuestionario | null>(null);
  const [viviendas, setViviendas] = useState<ViviendaLocal[]>([]);
  const [resumen, setResumen] = useState<ResumenBarrio | null>(null);
  const [cola, setCola] = useState<EventoSync[]>([]);
  const [contador, setContador] = useState(0);
  const [enLinea, setEnLinea] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    setBase(getBaseCampo());
    setEnLinea(navigator.onLine);
    // El GPS corre de fondo: cuando haga falta la posición, ya está.
    iniciarSeguimiento();
    const cambio = () => setEnLinea(navigator.onLine);
    window.addEventListener('online', cambio);
    window.addEventListener('offline', cambio);
    return () => {
      window.removeEventListener('online', cambio);
      window.removeEventListener('offline', cambio);
    };
  }, []);

  const refrescar = useCallback(async (baseActual: BaseCampo, sesionActual: SesionCampo | null) => {
    setContador(await contarPendientes(baseActual));
    setCola(await pendientes(baseActual));
    if (!sesionActual) return;
    setViviendas(await listarViviendas(baseActual, sesionActual.barrioSlug));
    setResumen(await resumenDelBarrio(baseActual, sesionActual.barrioSlug));
  }, []);

  useEffect(() => {
    if (!base) return;
    void (async () => {
      const guardada = (await obtenerSesion(base)) ?? null;
      const cacheado = await obtenerCuestionario(base);
      setSesion(guardada);
      setCuestionario(cacheado?.definicion ?? null);
      await refrescar(base, guardada);
      setVista(guardada && cacheado ? { tipo: 'barrio' } : { tipo: 'inicio' });
    })();
  }, [base, refrescar]);

  const sincronizarAhora = useCallback(async () => {
    if (!base) return;
    setMensaje('Sincronizando…');
    const resultado = await sincronizar(base, crearTransporteHttp(base));
    await refrescar(base, sesion);
    setMensaje(
      resultado.intentados === 0
        ? 'No hay nada pendiente.'
        : `Enviados ${resultado.confirmados} de ${resultado.intentados}. ${resultado.fallados > 0 ? 'Lo que no salió queda en la cola.' : ''}`,
    );
  }, [base, refrescar, sesion]);

  if (!base || vista.tipo === 'cargando') {
    return <p className="text-muted-foreground p-6">Abriendo la app de campo…</p>;
  }

  if (vista.tipo === 'inicio') {
    return (
      <PantallaInicio
        onListo={async (barrio, alias) => {
          const dispositivoId = (await obtenerSesion(base))?.dispositivoId ?? nuevoDispositivoId();
          const nueva: SesionCampo = {
            id: 'actual',
            dispositivoId,
            barrioId: barrio.id,
            barrioSlug: barrio.slug,
            barrioNombre: barrio.nombre,
            alias,
            iniciadaEn: new Date().toISOString(),
          };
          await guardarSesion(base, nueva);
          setSesion(nueva);

          const definicion = await descargarCuestionario();
          if (definicion) {
            await guardarCuestionario(base, definicion);
            setCuestionario(definicion);
          }
          await descargarViviendas(base, barrio);
          await refrescar(base, nueva);
          setVista({ tipo: 'barrio' });
        }}
      />
    );
  }

  if (!sesion || !cuestionario) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Falta descargar el cuestionario. Conectate a internet una vez y volvé a entrar.
        </p>
        <Button className="mt-4" onClick={() => setVista({ tipo: 'inicio' })}>
          Volver a empezar
        </Button>
      </div>
    );
  }

  const encabezado = (
    <header className="sticky top-0 z-10 border-b bg-[var(--background)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{sesion.barrioNombre}</p>
          <p className="text-muted-foreground text-xs">{sesion.alias}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={enLinea ? 'secondary' : 'outline'}>
            {enLinea ? 'con señal' : 'sin señal'}
          </Badge>
          <button
            type="button"
            onClick={() => setVista({ tipo: 'cola' })}
            className="rounded-md border px-3 py-1.5 text-sm"
          >
            Cola {contador > 0 ? `(${contador})` : ''}
          </button>
        </div>
      </div>
    </header>
  );

  if (vista.tipo === 'cola') {
    return (
      <div>
        {encabezado}
        <PantallaCola
          cola={cola}
          enLinea={enLinea}
          mensaje={mensaje}
          onSincronizar={sincronizarAhora}
          onVolver={() => setVista({ tipo: 'barrio' })}
        />
      </div>
    );
  }

  if (vista.tipo === 'ticket') {
    return (
      <div>
        {encabezado}
        <PantallaTicket ticket={vista.ticket} onVolver={() => setVista({ tipo: 'barrio' })} />
      </div>
    );
  }

  if (vista.tipo === 'encuesta') {
    return (
      <PantallaEncuesta
        base={base}
        cuestionario={cuestionario}
        ticket={vista.ticket}
        audioHabilitado={audioHabilitado}
        onTerminada={async (ticket) => {
          await refrescar(base, sesion);
          setVista({ tipo: 'ticket', ticket });
        }}
        onRechazo={async () => {
          const encuestaActual = viviendas.find((v) => v.estado === 'en_curso');
          if (encuestaActual) {
            await registrarNoRespuesta(base, {
              vivienda: encuestaActual,
              motivo: 'rechazo',
              dispositivoId: sesion.dispositivoId,
              gps: ultimaUbicacion(),
            });
          }
          await refrescar(base, sesion);
          setVista({ tipo: 'barrio' });
        }}
        onSalir={async () => {
          await refrescar(base, sesion);
          setVista({ tipo: 'barrio' });
        }}
      />
    );
  }

  if (vista.tipo === 'vivienda') {
    const vivienda = viviendas.find((v) => v.id === vista.viviendaId);
    if (!vivienda) {
      setVista({ tipo: 'barrio' });
      return null;
    }
    return (
      <div>
        {encabezado}
        <PantallaVivienda
          vivienda={vivienda}
          onEncuestar={async () => {
            const enCurso = await encuestaEnCurso(base, vivienda.id);
            if (enCurso) {
              setVista({ tipo: 'encuesta', ticket: enCurso.ticket });
              return;
            }
            const encuesta = await iniciarEncuesta(base, {
              vivienda,
              cuestionario,
              dispositivoId: sesion.dispositivoId,
              gps: ultimaUbicacion(),
            });
            await refrescar(base, sesion);
            setVista({ tipo: 'encuesta', ticket: encuesta.ticket });
          }}
          onNoRespuesta={async (motivo, observacion) => {
            await registrarNoRespuesta(base, {
              vivienda,
              motivo,
              observacion,
              dispositivoId: sesion.dispositivoId,
              gps: ultimaUbicacion(),
            });
            await refrescar(base, sesion);
            setVista({ tipo: 'barrio' });
          }}
          onVolver={() => setVista({ tipo: 'barrio' })}
        />
      </div>
    );
  }

  return (
    <div>
      {encabezado}
      <PantallaBarrio
        viviendas={viviendas}
        resumen={resumen}
        mensaje={mensaje}
        onAbrir={(id) => setVista({ tipo: 'vivienda', viviendaId: id })}
        onAgregar={async (identificador) => {
          await agregarVivienda(base, {
            barrioId: sesion.barrioId,
            barrioSlug: sesion.barrioSlug,
            identificador,
          });
          await refrescar(base, sesion);
        }}
        onSincronizar={sincronizarAhora}
      />
    </div>
  );
}

// ---------------------------------------------------------------- descargas

async function descargarCuestionario(): Promise<Cuestionario | null> {
  try {
    const respuesta = await fetch('/api/cuestionario', { cache: 'no-store' });
    if (!respuesta.ok) return null;
    const cuerpo = (await respuesta.json()) as { definicion: unknown };
    const parseo = CuestionarioSchema.safeParse(cuerpo.definicion);
    return parseo.success ? parseo.data : null;
  } catch {
    return null;
  }
}

async function descargarViviendas(base: BaseCampo, barrio: BarrioRemoto): Promise<void> {
  try {
    const respuesta = await fetch(
      `/api/campo/viviendas?barrio=${encodeURIComponent(barrio.slug)}`,
      {
        cache: 'no-store',
      },
    );
    if (!respuesta.ok) return;
    const cuerpo = (await respuesta.json()) as {
      viviendas: { id: string; identificador: string; estado: string }[];
    };
    await guardarViviendas(
      base,
      cuerpo.viviendas.map((v) => ({
        id: v.id,
        barrioId: barrio.id,
        barrioSlug: barrio.slug,
        identificador: v.identificador,
        estado: 'pendiente' as const,
        intentos: 0,
        agregadaEnCampo: false,
        actualizadaEn: new Date().toISOString(),
      })),
    );
  } catch {
    // Sin señal no se baja la lista; se puede trabajar agregando viviendas a mano.
  }
}

// ---------------------------------------------------------------- pantallas

function PantallaInicio({
  onListo,
}: {
  onListo: (barrio: BarrioRemoto, alias: string) => Promise<void>;
}) {
  const [barrios, setBarrios] = useState<BarrioRemoto[]>([]);
  const [barrioId, setBarrioId] = useState('');
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void fetch('/api/campo/barrios', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { barrios: [] }))
      .then((cuerpo: { barrios: BarrioRemoto[] }) => setBarrios(cuerpo.barrios))
      .catch(() => setError('No se pudo traer la lista de barrios. Probá con señal.'));
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Relevamiento barrial</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Elegí tu barrio y poné tu nombre. Se descarga el cuestionario y la lista de viviendas para
        poder trabajar sin señal.
      </p>

      <label className="mt-8 block">
        <span className="text-sm font-medium">Barrio</span>
        <select
          value={barrioId}
          onChange={(evento) => setBarrioId(evento.target.value)}
          className="mt-1 h-14 w-full rounded-lg border bg-transparent px-3 text-base"
        >
          <option value="">Elegir…</option>
          {barrios.map((barrio) => (
            <option key={barrio.id} value={barrio.id}>
              {barrio.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block">
        <span className="text-sm font-medium">Tu nombre</span>
        <input
          type="text"
          value={alias}
          onChange={(evento) => setAlias(evento.target.value)}
          className="mt-1 h-14 w-full rounded-lg border bg-transparent px-3 text-base"
        />
      </label>

      {error && (
        <p className="text-destructive mt-4 text-sm" role="alert">
          {error}
        </p>
      )}

      <Button
        size="lg"
        className="mt-8 w-full"
        disabled={!barrioId || alias.trim().length < 2 || ocupado}
        onClick={async () => {
          const barrio = barrios.find((b) => b.id === barrioId);
          if (!barrio) return;
          setOcupado(true);
          await onListo(barrio, alias.trim());
          setOcupado(false);
        }}
      >
        {ocupado ? 'Descargando…' : 'Empezar la jornada'}
      </Button>

      <p className="text-muted-foreground mt-6 text-xs">
        TODO(fase 4): esta pantalla se reemplaza por el inicio de sesión con usuario y contraseña.
      </p>
    </div>
  );
}

const ETIQUETA_ESTADO: Record<ViviendaLocal['estado'], string> = {
  pendiente: 'Pendiente',
  en_curso: 'Empezada',
  relevada: 'Relevada',
  cerrada_sin_respuesta: 'Cerrada sin respuesta',
};

function PantallaBarrio({
  viviendas,
  resumen,
  mensaje,
  onAbrir,
  onAgregar,
  onSincronizar,
}: {
  viviendas: ViviendaLocal[];
  resumen: ResumenBarrio | null;
  mensaje: string | null;
  onAbrir: (id: string) => void;
  onAgregar: (identificador: string) => Promise<void>;
  onSincronizar: () => Promise<void>;
}) {
  const [nueva, setNueva] = useState('');

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      {resumen && (
        <section className="grid grid-cols-4 gap-2 text-center">
          {[
            { etiqueta: 'Total', valor: resumen.total },
            { etiqueta: 'Relevadas', valor: resumen.relevadas },
            { etiqueta: 'Sin respuesta', valor: resumen.cerradasSinRespuesta },
            { etiqueta: 'Pendientes', valor: resumen.pendientes },
          ].map((dato) => (
            <div key={dato.etiqueta} className="rounded-lg border p-2">
              <p className="text-xl font-semibold tabular-nums">{dato.valor}</p>
              <p className="text-muted-foreground text-xs">{dato.etiqueta}</p>
            </div>
          ))}
        </section>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="lg" className="flex-1" onClick={onSincronizar}>
          Sincronizar
        </Button>
      </div>
      {mensaje && <p className="text-muted-foreground mt-2 text-sm">{mensaje}</p>}

      <h2 className="mt-8 text-lg font-semibold">Viviendas</h2>
      <ul className="mt-3 space-y-2">
        {viviendas.map((vivienda) => (
          <li key={vivienda.id}>
            <button
              type="button"
              onClick={() => onAbrir(vivienda.id)}
              className="hover:bg-accent flex min-h-16 w-full items-center justify-between rounded-lg border px-4 py-3 text-left"
            >
              <span>
                <span className="font-medium">{vivienda.identificador}</span>
                {vivienda.intentos > 0 && (
                  <span className="text-muted-foreground block text-xs">
                    {vivienda.intentos} {vivienda.intentos === 1 ? 'intento' : 'intentos'}
                  </span>
                )}
              </span>
              <Badge variant={vivienda.estado === 'pendiente' ? 'outline' : 'secondary'}>
                {ETIQUETA_ESTADO[vivienda.estado]}
              </Badge>
            </button>
          </li>
        ))}
        {viviendas.length === 0 && (
          <li className="text-muted-foreground text-sm">
            No hay viviendas en la lista. Agregá las que vayas visitando.
          </li>
        )}
      </ul>

      <div className="mt-6 rounded-lg border p-4">
        <p className="text-sm font-medium">Agregar una vivienda que no está en la lista</p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={nueva}
            onChange={(evento) => setNueva(evento.target.value)}
            placeholder="Manzana / lote o referencia"
            className="h-12 flex-1 rounded-lg border bg-transparent px-3"
          />
          <Button
            onClick={async () => {
              if (nueva.trim().length < 2) return;
              await onAgregar(nueva);
              setNueva('');
            }}
          >
            Agregar
          </Button>
        </div>
      </div>
    </div>
  );
}

function PantallaVivienda({
  vivienda,
  onEncuestar,
  onNoRespuesta,
  onVolver,
}: {
  vivienda: ViviendaLocal;
  onEncuestar: () => Promise<void>;
  onNoRespuesta: (motivo: MotivoNoRespuesta, observacion: string) => Promise<void>;
  onVolver: () => void;
}) {
  const [cerrando, setCerrando] = useState(false);
  const [observacion, setObservacion] = useState('');

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <button type="button" onClick={onVolver} className="text-muted-foreground text-sm underline">
        Volver
      </button>

      <h1 className="mt-4 text-2xl font-semibold">{vivienda.identificador}</h1>
      <p className="text-muted-foreground text-sm">
        {ETIQUETA_ESTADO[vivienda.estado]}
        {vivienda.intentos > 0 && ` · ${vivienda.intentos} intento(s)`}
      </p>

      {!cerrando ? (
        <div className="mt-8 space-y-3">
          <Button size="lg" className="w-full" onClick={onEncuestar}>
            {vivienda.estado === 'en_curso' ? 'Retomar la encuesta' : 'Hacer la encuesta'}
          </Button>
          <Button size="lg" variant="outline" className="w-full" onClick={() => setCerrando(true)}>
            Cerrar sin respuesta
          </Button>
          <p className="text-muted-foreground pt-2 text-sm">
            Una vivienda no se saltea: o se hace la encuesta, o se cierra con un motivo. Así se sabe
            la cobertura real del barrio.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          <p className="font-medium">¿Por qué no se pudo hacer?</p>
          {MOTIVOS_NO_RESPUESTA.map((motivo) => (
            <Button
              key={motivo}
              size="lg"
              variant="outline"
              className="w-full justify-start"
              onClick={() => void onNoRespuesta(motivo, observacion)}
            >
              {ETIQUETA_MOTIVO[motivo]}
            </Button>
          ))}
          <textarea
            value={observacion}
            onChange={(evento) => setObservacion(evento.target.value)}
            placeholder="Observación (opcional)"
            rows={2}
            className="w-full rounded-lg border bg-transparent p-3 text-sm"
          />
          <Button variant="ghost" className="w-full" onClick={() => setCerrando(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

function PantallaTicket({ ticket, onVolver }: { ticket: string; onVolver: () => void }) {
  const codigo = codigoCorto(ticket);
  const url =
    typeof window !== 'undefined' ? `${window.location.origin}/ticket?codigo=${codigo}` : codigo;

  return (
    <div className="mx-auto max-w-md px-4 py-8 text-center">
      <h1 className="text-2xl font-semibold">Listo. Este es el comprobante</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Mostrale la pantalla para que le saque una foto.
      </p>

      <p className="mt-8 font-mono text-3xl font-semibold tracking-wider">{codigo}</p>

      <div className="mt-6 flex justify-center">
        <CodigoQR texto={url} />
      </div>

      <p className="text-muted-foreground mt-6 text-sm">
        Con este código —o con su apellido y los últimos 3 números del DNI— puede consultar en qué
        quedó su pedido.
      </p>

      <Button size="lg" className="mt-8 w-full" onClick={onVolver}>
        Seguir con la próxima vivienda
      </Button>
    </div>
  );
}

function PantallaCola({
  cola,
  enLinea,
  mensaje,
  onSincronizar,
  onVolver,
}: {
  cola: EventoSync[];
  enLinea: boolean;
  mensaje: string | null;
  onSincronizar: () => Promise<void>;
  onVolver: () => void;
}) {
  const nombre: Record<EventoSync['tipo'], string> = {
    encuesta: 'Encuesta',
    no_respuesta: 'Cierre sin respuesta',
    vivienda_nueva: 'Vivienda agregada',
    audio: 'Audio de respuesta abierta',
  };

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <button type="button" onClick={onVolver} className="text-muted-foreground text-sm underline">
        Volver
      </button>

      <h1 className="mt-4 text-2xl font-semibold">Cola de envío</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {cola.length === 0
          ? 'No hay nada esperando: todo lo cargado ya está en el servidor.'
          : `${cola.length} cosa(s) esperando señal. Nada se borra del teléfono hasta que el servidor confirme que las recibió.`}
      </p>

      <Button size="lg" className="mt-4 w-full" onClick={onSincronizar} disabled={!enLinea}>
        {enLinea ? 'Sincronizar ahora' : 'Sin señal'}
      </Button>
      {mensaje && <p className="text-muted-foreground mt-2 text-sm">{mensaje}</p>}

      <ul className="mt-6 space-y-2">
        {cola.map((evento) => (
          <li key={evento.id} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{nombre[evento.tipo]}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {new Date(evento.creadoEn).toLocaleTimeString('es-AR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {evento.intentos > 0 && (
              <p className="text-muted-foreground mt-1 text-xs">
                {evento.intentos} intento(s) · {evento.ultimoError}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
