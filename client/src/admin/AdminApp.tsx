/**
 * Dashboard de Campaña — la ruta `/admin`.
 *
 * Es la otra mitad del proyecto: el juego junta el dato y esto lo muestra. Vive
 * en el mismo bundle porque comparte los contratos de `/shared` y porque en un
 * hosting compartido una segunda aplicación es una segunda cosa que mantener.
 *
 * Lo que se ve acá **ya viene con k-anonimato aplicado desde el backend**. El
 * dashboard no filtra nada: si un número llegó, se puede mostrar. Y cuando un
 * barrio no llega al umbral, se dice cuántos faltan en vez de dibujar un cero
 * que parece un dato.
 */

import { useCallback, useEffect, useState } from 'react';
import { Download, LogOut, RefreshCw } from 'lucide-react';
import type { DashboardSnapshot } from '@esquel/shared';
import { AdminLogin } from './AdminLogin.tsx';
import { HeatMap } from './HeatMap.tsx';
import { LiveOpsConsole } from './LiveOpsConsole.tsx';
import { Projection } from './Projection.tsx';
import { TrendChart } from './TrendChart.tsx';
import { exportarCsv, exportarJson } from './exportData.ts';
import { salir, sesionAdmin, traerEnVivo, traerMetricas, type AdminSession, type LiveIntelResponse } from './api.ts';
import './admin.css';

type Pestana = 'mapa' | 'proyeccion' | 'liveops' | 'comercios';
type ModoMapa = 'dominancia' | 'militancia' | 'humor';

/** Cada cuánto se refresca sola la foto. Dos minutos: no es un monitor de trading. */
const REFRESCO_MS = 120_000;

export const AdminApp = (): JSX.Element => {
  const [session, setSession] = useState<AdminSession | null>(() => sesionAdmin());
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null);
  const [vivo, setVivo] = useState<LiveIntelResponse | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [dias, setDias] = useState(7);
  const [pestana, setPestana] = useState<Pestana>('mapa');
  const [modoMapa, setModoMapa] = useState<ModoMapa>('dominancia');

  const cargar = useCallback(
    async (s: AdminSession, ventana: number): Promise<void> => {
      setCargando(true);
      setError('');
      try {
        setSnap(await traerMetricas(s, ventana));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron traer las métricas.');
      } finally {
        setCargando(false);
      }

      // El VPS es opcional: si el shard está apagado, el histórico igual sirve.
      try {
        setVivo(await traerEnVivo(s));
      } catch {
        setVivo(null);
      }
    },
    [],
  );

  useEffect(() => {
    if (!session) return;
    void cargar(session, dias);
    const id = window.setInterval(() => void cargar(session, dias), REFRESCO_MS);
    return () => window.clearInterval(id);
  }, [session, dias, cargar]);

  if (!session) return <AdminLogin onEntrar={setSession} />;

  return (
    <div className="admin">
      <header className="admin__head">
        <div className="admin__brand">
          <h1>Esquel 2027 · Dashboard de Campaña</h1>
          <p>
            {session.alias} · {session.role}
            {vivo ? (
              <>
                {' '}
                · <span className="admin__vivo">{vivo.online} en línea</span> en {vivo.shards} shard
                {vivo.shards === 1 ? '' : 's'}
              </>
            ) : (
              ' · shard sin conexión'
            )}
          </p>
        </div>

        <div className="admin__acciones">
          <label className="admin-field admin-field--inline">
            <span>Ventana</span>
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              <option value={1}>hoy</option>
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={30}>30 días</option>
            </select>
          </label>

          <button type="button" className="admin-btn admin-btn--fantasma" onClick={() => void cargar(session, dias)} disabled={cargando}>
            <RefreshCw size={13} strokeWidth={2.5} aria-hidden /> {cargando ? 'Trayendo…' : 'Refrescar'}
          </button>

          <button type="button" className="admin-btn admin-btn--fantasma" onClick={() => snap && exportarCsv(snap)} disabled={!snap}>
            <Download size={13} strokeWidth={2.5} aria-hidden /> CSV
          </button>
          <button type="button" className="admin-btn admin-btn--fantasma" onClick={() => snap && exportarJson(snap)} disabled={!snap}>
            <Download size={13} strokeWidth={2.5} aria-hidden /> JSON
          </button>

          <button
            type="button"
            className="admin-btn admin-btn--fantasma"
            onClick={() => {
              salir();
              setSession(null);
            }}
          >
            <LogOut size={13} strokeWidth={2.5} aria-hidden /> Salir
          </button>
        </div>
      </header>

      <nav className="admin__tabs" aria-label="Secciones del dashboard">
        {(
          [
            ['mapa', 'Mapa de calor'],
            ['proyeccion', 'Proyección 2027'],
            ['liveops', 'Consola Live-Ops'],
            ['comercios', 'Auspicios'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={pestana === id ? 'is-active' : ''} onClick={() => setPestana(id)}>
            {label}
          </button>
        ))}
      </nav>

      {error ? <p className="admin__error">{error}</p> : null}

      <main className="admin__main">
        {!snap ? (
          <p className="admin-vacio">{cargando ? 'Trayendo los números…' : 'Sin datos todavía.'}</p>
        ) : pestana === 'mapa' ? (
          <>
            <div className="admin__switch" role="group" aria-label="Qué muestra el mapa">
              {(
                [
                  ['dominancia', 'Quién manda'],
                  ['militancia', 'Dónde se milita'],
                  ['humor', 'Cómo está el humor'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={modoMapa === id ? 'is-active' : ''} onClick={() => setModoMapa(id)}>
                  {label}
                </button>
              ))}
            </div>
            <HeatMap barrios={snap.heat.barrios} kAnonMin={snap.kAnonMin} modo={modoMapa} />
            <p className="admin__nota">
              Ventana de {snap.heat.windowDays} día{snap.heat.windowDays === 1 ? '' : 's'} · un barrio se publica recién con{' '}
              {snap.kAnonMin} vecinos distintos. Los rayados no son ceros: son barrios sin muestra suficiente.
            </p>
          </>
        ) : pestana === 'proyeccion' ? (
          <>
            <Projection projection={snap.projection} kAnonMin={snap.kAnonMin} />
            <TrendChart trend={snap.trend} />
          </>
        ) : pestana === 'liveops' ? (
          <LiveOpsConsole session={session} />
        ) : (
          <figure className="admin-figure">
            <figcaption className="admin-figure__title">Auspicios comerciales</figcaption>
            {snap.sponsors.length === 0 ? (
              <p className="admin-vacio">No hay comercios activos todavía.</p>
            ) : (
              <table className="admin-tabla__plana">
                <thead>
                  <tr>
                    <th scope="col">Comercio</th>
                    <th scope="col">Impresiones</th>
                    <th scope="col">Vecinos distintos</th>
                    <th scope="col">Entradas</th>
                    <th scope="col">Buffs retirados</th>
                    <th scope="col">Conversión</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.sponsors.map((c) => (
                    <tr key={c.sponsorId}>
                      <th scope="row">{c.name}</th>
                      <td>{c.impressions.toLocaleString('es-AR')}</td>
                      <td>{c.uniqueSubjects.toLocaleString('es-AR')}</td>
                      <td>{c.entries.toLocaleString('es-AR')}</td>
                      <td>{c.buffClaims.toLocaleString('es-AR')}</td>
                      <td>{c.impressions > 0 ? `${((c.entries / c.impressions) * 100).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="admin__nota">
              Una impresión es un vecino distinto que pasó a menos de 15 metros del local y se quedó al menos un segundo.
              Volver a pasar cuenta recién después de irse y esperar un minuto y medio.
            </p>
          </figure>
        )}
      </main>

      <footer className="admin__foot">
        Datos agregados con k ≥ {snap?.kAnonMin ?? 15}. Ninguna consulta de este panel toca la tabla cruda de telemetría.
      </footer>
    </div>
  );
};
