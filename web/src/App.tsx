/** Armazón del tablero: navegación, barra superior, filtros y sección activa. */

import { useEffect, useState } from 'react';
import { ProveedorTooltip } from './charts/base';
import { BarraFiltros } from './components/BarraFiltros';
import { Segmentado } from './components/ui';
import { useApp } from './state/app';
import { Panorama } from './secciones/Panorama';
import { Estacionalidad } from './secciones/Estacionalidad';
import { Categorias } from './secciones/Categorias';
import { Demanda } from './secciones/Demanda';
import { Calidad } from './secciones/Calidad';
import { Establecimientos } from './secciones/Establecimientos';
import { Metodologia } from './secciones/Metodologia';
import { fechaIso } from './lib/formato';

interface Seccion {
  id: string;
  etiqueta: string;
  icono: string;
  grupo: string;
  componente: () => JSX.Element;
}

const SECCIONES: Seccion[] = [
  { id: 'panorama', etiqueta: 'Panorama', icono: '◱', grupo: 'Lectura', componente: Panorama },
  { id: 'estacionalidad', etiqueta: 'Estacionalidad', icono: '◷', grupo: 'Lectura', componente: Estacionalidad },
  { id: 'categorias', etiqueta: 'Categorías y oferta', icono: '▤', grupo: 'Lectura', componente: Categorias },
  { id: 'demanda', etiqueta: 'Demanda y derrame', icono: '◈', grupo: 'Lectura', componente: Demanda },
  { id: 'calidad', etiqueta: 'Calidad del dato', icono: '◉', grupo: 'Gestión', componente: Calidad },
  { id: 'establecimientos', etiqueta: 'Establecimientos', icono: '⌂', grupo: 'Gestión', componente: Establecimientos },
  { id: 'metodologia', etiqueta: 'Metodología', icono: '✎', grupo: 'Gestión', componente: Metodologia },
];

export default function App() {
  const { meta, listo, progreso, error, tema, setTema } = useApp();
  const [seccionId, setSeccionId] = useState(() => window.location.hash.slice(1) || 'panorama');

  useEffect(() => {
    const alCambiar = () => setSeccionId(window.location.hash.slice(1) || 'panorama');
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  const ir = (id: string) => {
    window.location.hash = id;
    setSeccionId(id);
    document.querySelector('.contenido')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (error) {
    return (
      <div className="pantalla-carga">
        <div className="error-caja">
          <h1>No se pudo cargar el tablero</h1>
          <p style={{ color: 'var(--ink-2)', marginTop: 'var(--e-2)' }}>
            El motor analítico o el dataset no están disponibles. Si acabás de desplegar, verificá que la
            carpeta <code>data/</code> esté publicada junto al sitio y que el servidor entregue los{' '}
            <code>.parquet</code> y <code>.wasm</code> con su tipo MIME.
          </p>
          <pre>{error}</pre>
          <button type="button" className="boton-texto" onClick={() => window.location.reload()} style={{ marginTop: 'var(--e-4)' }}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!listo) {
    return (
      <div className="pantalla-carga">
        <div className="carga-caja">
          <h1>Observatorio de Inteligencia Turística</h1>
          <p>{meta ? `${meta.destino.nombre} · ${meta.destino.provincia}` : 'Cargando'}</p>
          <div className="barra-progreso">
            <div style={{ width: `${Math.round(progreso.progreso * 100)}%` }} />
          </div>
          <p className="carga-detalle">{progreso.detalle}…</p>
        </div>
      </div>
    );
  }

  const seccion = SECCIONES.find((s) => s.id === seccionId) ?? SECCIONES[0];
  const Componente = seccion.componente;
  const grupos = Array.from(new Set(SECCIONES.map((s) => s.grupo)));

  return (
    <ProveedorTooltip>
      <div className="app">
        <nav className="nav-lateral" aria-label="Secciones del tablero">
          <div className="marca-org">
            <span className="marca-escudo" aria-hidden="true">
              OIT
            </span>
            <span className="marca-texto">
              <strong>Inteligencia Turística</strong>
              <span>{meta?.destino.organismo}</span>
            </span>
          </div>

          {grupos.map((g) => (
            <div key={g}>
              <div className="nav-grupo-titulo">{g}</div>
              {SECCIONES.filter((s) => s.grupo === g).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`nav-item${s.id === seccion.id ? ' activo' : ''}`}
                  onClick={() => ir(s.id)}
                  aria-current={s.id === seccion.id ? 'page' : undefined}
                >
                  <span className="icono" aria-hidden="true">
                    {s.icono}
                  </span>
                  <span className="etiqueta">{s.etiqueta}</span>
                </button>
              ))}
            </div>
          ))}

          <div className="nav-pie">
            <div>{meta?.destino.area}</div>
            <div>
              Datos al {meta ? fechaIso(meta.periodo.hasta) : '—'}
            </div>
            {meta?.destino.contacto && <div>{meta.destino.contacto}</div>}
          </div>
        </nav>

        <div className="contenido">
          <header className="barra-superior">
            <h1>{seccion.etiqueta}</h1>
            <span className="periodo">
              {meta && `${fechaIso(meta.periodo.desde)} – ${fechaIso(meta.periodo.hasta)}`}
            </span>
            <div className="derecha">
              <Segmentado
                etiqueta="Tema"
                valor={tema}
                onChange={setTema}
                opciones={[
                  { valor: 'claro', etiqueta: '☀', titulo: 'Tema claro' },
                  { valor: 'sistema', etiqueta: '◐', titulo: 'Seguir al sistema' },
                  { valor: 'oscuro', etiqueta: '☾', titulo: 'Tema oscuro' },
                ]}
              />
              <button type="button" className="boton-texto" onClick={() => window.print()}>
                Imprimir
              </button>
            </div>
          </header>

          <BarraFiltros />

          <main className="panel">
            <Componente />
          </main>
        </div>
      </div>
    </ProveedorTooltip>
  );
}
