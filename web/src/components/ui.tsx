/** Piezas de interfaz compartidas: tarjetas, KPI, controles y tablas. */

import { useMemo, useState, type ReactNode } from 'react';
import { Chispa } from '../charts/temporales';
import { SIN_DATO } from '../lib/formato';

// ==========================================================================
// Tarjeta
// ==========================================================================
export function Tarjeta({
  titulo,
  bajada,
  acciones,
  children,
  ancho = 'completo',
  nota,
  tabla,
  recargando,
}: {
  titulo: string;
  bajada?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  ancho?: 'completo' | 'medio' | 'tercio' | 'dos-tercios';
  nota?: ReactNode;
  /** Vista de tabla equivalente: toda visualización debe tener una. */
  tabla?: { columnas: string[]; filas: Array<Array<string | number>> };
  recargando?: boolean;
}) {
  const [verTabla, setVerTabla] = useState(false);

  return (
    <section className={`tarjeta tarjeta-${ancho}${recargando ? ' recargando' : ''}`}>
      <header className="tarjeta-cabecera">
        <div>
          <h3>{titulo}</h3>
          {bajada && <p className="bajada">{bajada}</p>}
        </div>
        <div className="tarjeta-acciones">
          {acciones}
          {tabla && (
            <button
              type="button"
              className={`boton-icono${verTabla ? ' activo' : ''}`}
              onClick={() => setVerTabla((v) => !v)}
              title={verTabla ? 'Ver el gráfico' : 'Ver los datos en tabla'}
              aria-pressed={verTabla}
            >
              {verTabla ? '▤' : '▦'}
            </button>
          )}
        </div>
      </header>
      <div className="tarjeta-cuerpo">
        {verTabla && tabla ? <TablaDatos columnas={tabla.columnas} filas={tabla.filas} /> : children}
      </div>
      {nota && <footer className="tarjeta-nota">{nota}</footer>}
    </section>
  );
}

// ==========================================================================
// KPI
// ==========================================================================
export interface DatosKpi {
  etiqueta: string;
  valor: string;
  unidad?: string;
  contexto?: string;
  delta?: { texto: string; sentido: 'bueno' | 'malo' | 'neutro' };
  chispa?: Array<number | null>;
  color?: string;
  alerta?: string;
}

export function Kpi({ datos }: { datos: DatosKpi }) {
  return (
    <div className="kpi">
      <div className="kpi-etiqueta">{datos.etiqueta}</div>
      <div className="kpi-valor-fila">
        <span className="kpi-valor">
          {datos.valor}
          {datos.unidad && <span className="kpi-unidad">{datos.unidad}</span>}
        </span>
        {datos.chispa && <Chispa valores={datos.chispa} color={datos.color ?? 'var(--serie-1)'} />}
      </div>
      <div className="kpi-pie">
        {datos.delta && (
          <span className={`delta delta-${datos.delta.sentido}`}>
            {datos.delta.sentido === 'bueno' ? '▲' : datos.delta.sentido === 'malo' ? '▼' : '•'}{' '}
            {datos.delta.texto}
          </span>
        )}
        {datos.contexto && <span className="kpi-contexto">{datos.contexto}</span>}
      </div>
      {datos.alerta && (
        <div className="kpi-alerta" role="note">
          <span aria-hidden="true">⚠</span> {datos.alerta}
        </div>
      )}
    </div>
  );
}

export function FilaKpis({ items, cargando }: { items: DatosKpi[]; cargando?: boolean }) {
  if (cargando) {
    return (
      <div className="fila-kpis">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="kpi kpi-esqueleto" />
        ))}
      </div>
    );
  }
  return (
    <div className="fila-kpis">
      {items.map((k) => (
        <Kpi key={k.etiqueta} datos={k} />
      ))}
    </div>
  );
}

// ==========================================================================
// Controles
// ==========================================================================
export interface OpcionSegmento<T extends string> {
  valor: T;
  etiqueta: string;
  titulo?: string;
}

export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: OpcionSegmento<T>[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div className="segmentado" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          className={o.valor === valor ? 'activo' : undefined}
          onClick={() => onChange(o.valor)}
          aria-pressed={o.valor === valor}
          title={o.titulo}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

export function GrupoBotones({
  opciones,
  seleccionados,
  onAlternar,
  etiqueta,
}: {
  opciones: Array<{ valor: string | number; etiqueta: string; titulo?: string }>;
  seleccionados: Array<string | number>;
  onAlternar: (v: string | number) => void;
  etiqueta: string;
}) {
  return (
    <div className="grupo-botones" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          className={seleccionados.includes(o.valor) ? 'activo' : undefined}
          onClick={() => onAlternar(o.valor)}
          aria-pressed={seleccionados.includes(o.valor)}
          title={o.titulo}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

// ==========================================================================
// Tabla de datos
// ==========================================================================
export function TablaDatos({
  columnas,
  filas,
  ordenable = true,
  maxAlto,
}: {
  columnas: string[];
  filas: Array<Array<string | number>>;
  ordenable?: boolean;
  maxAlto?: number;
}) {
  const [orden, setOrden] = useState<{ col: number; asc: boolean } | null>(null);

  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    const copia = [...filas];
    copia.sort((a, b) => {
      const va = a[orden.col];
      const vb = b[orden.col];
      // Los valores sin dato van siempre al final, sin importar la dirección.
      if (va === SIN_DATO) return 1;
      if (vb === SIN_DATO) return -1;
      const na = typeof va === 'number' ? va : parseFloat(String(va).replace(/[^\d,.-]/g, '').replace(',', '.'));
      const nb = typeof vb === 'number' ? vb : parseFloat(String(vb).replace(/[^\d,.-]/g, '').replace(',', '.'));
      if (Number.isFinite(na) && Number.isFinite(nb)) return orden.asc ? na - nb : nb - na;
      return orden.asc
        ? String(va).localeCompare(String(vb), 'es')
        : String(vb).localeCompare(String(va), 'es');
    });
    return copia;
  }, [filas, orden]);

  return (
    <div className="tabla-envoltorio" style={maxAlto ? { maxHeight: maxAlto } : undefined}>
      <table className="tabla-datos">
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th
                key={c}
                onClick={
                  ordenable
                    ? () => setOrden((o) => (o?.col === i ? { col: i, asc: !o.asc } : { col: i, asc: false }))
                    : undefined
                }
                className={ordenable ? 'ordenable' : undefined}
                aria-sort={orden?.col === i ? (orden.asc ? 'ascending' : 'descending') : undefined}
              >
                {c}
                {orden?.col === i && <span className="flecha">{orden.asc ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f, i) => (
            <tr key={i}>
              {f.map((v, j) => (
                <td key={j} className={typeof v === 'number' || j > 0 ? 'numerico' : undefined}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {ordenadas.length === 0 && <p className="tabla-vacia">Sin filas para el recorte seleccionado.</p>}
    </div>
  );
}

// ==========================================================================
// Avisos
// ==========================================================================
export function Aviso({
  tono = 'info',
  titulo,
  children,
}: {
  tono?: 'info' | 'aviso' | 'critico' | 'bien';
  titulo?: string;
  children: ReactNode;
}) {
  const icono = { info: 'ℹ', aviso: '⚠', critico: '⨯', bien: '✓' }[tono];
  return (
    <div className={`aviso aviso-${tono}`} role="note">
      <span className="aviso-icono" aria-hidden="true">
        {icono}
      </span>
      <div>
        {titulo && <strong>{titulo}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Grilla de secciones: dos columnas que colapsan a una en pantallas chicas. */
export function Grilla({ children }: { children: ReactNode }) {
  return <div className="grilla-tarjetas">{children}</div>;
}

export function EncabezadoSeccion({
  titulo,
  bajada,
  acciones,
}: {
  titulo: string;
  bajada: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="encabezado-seccion">
      <div>
        <h2>{titulo}</h2>
        <p>{bajada}</p>
      </div>
      {acciones && <div className="encabezado-acciones">{acciones}</div>}
    </div>
  );
}
