/**
 * Primitivas compartidas por todos los gráficos.
 *
 * El tablero no usa una librería de charts: dibuja SVG con escalas de D3. La
 * razón es coherencia — un solo juego de ejes, grillas, tooltips y leyendas
 * significa que veinte gráficos distintos se leen como un sistema, y que el
 * tema claro/oscuro se define una sola vez.
 *
 * Reglas que se aplican en todo el kit:
 *   · marcas finas, grilla y ejes en hairline recesivo, nunca punteados;
 *   · 2 px de separación entre rellenos contiguos, en vez de bordes;
 *   · etiquetas directas selectivas (extremos), nunca un número por punto;
 *   · leyenda siempre presente con dos o más series;
 *   · tooltip como refuerzo, nunca como única vía para leer un valor;
 *   · todo gráfico tiene su vista de tabla equivalente.
 */

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// --------------------------------------------------------------------------
// Medición responsiva
// --------------------------------------------------------------------------
export function useMedida<T extends HTMLElement>(): [React.RefObject<T>, { ancho: number; alto: number }] {
  const ref = useRef<T>(null);
  const [medida, setMedida] = useState({ ancho: 0, alto: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entradas) => {
      for (const e of entradas) {
        const { width, height } = e.contentRect;
        setMedida((prev) =>
          Math.abs(prev.ancho - width) < 1 && Math.abs(prev.alto - height) < 1
            ? prev
            : { ancho: width, alto: height },
        );
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, medida];
}

// --------------------------------------------------------------------------
// Márgenes
// --------------------------------------------------------------------------
export interface Margen {
  arriba: number;
  derecha: number;
  abajo: number;
  izquierda: number;
}

export const MARGEN: Margen = { arriba: 12, derecha: 16, abajo: 28, izquierda: 44 };

export function margen(parcial: Partial<Margen> = {}): Margen {
  return { ...MARGEN, ...parcial };
}

// --------------------------------------------------------------------------
// Tooltip compartido
// --------------------------------------------------------------------------
export interface FilaTooltip {
  etiqueta: string;
  valor: string;
  color?: string;
  tenue?: boolean;
}

export interface ContenidoTooltip {
  titulo: string;
  subtitulo?: string;
  filas: FilaTooltip[];
  pie?: string;
}

interface TooltipCtx {
  mostrar: (c: ContenidoTooltip, x: number, y: number) => void;
  ocultar: () => void;
}

const CtxTooltip = createContext<TooltipCtx>({ mostrar: () => {}, ocultar: () => {} });

export function ProveedorTooltip({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<{ c: ContenidoTooltip; x: number; y: number } | null>(null);
  const refCaja = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const mostrar = useCallback((c: ContenidoTooltip, x: number, y: number) => {
    setEstado({ c, x, y });
  }, []);
  const ocultar = useCallback(() => setEstado(null), []);

  // El tooltip se reposiciona para no salirse de la ventana.
  useLayoutEffect(() => {
    if (!estado || !refCaja.current) return;
    const caja = refCaja.current.getBoundingClientRect();
    const desplazamiento = 14;
    let x = estado.x + desplazamiento;
    let y = estado.y + desplazamiento;
    if (x + caja.width > window.innerWidth - 8) x = estado.x - caja.width - desplazamiento;
    if (y + caja.height > window.innerHeight - 8) y = estado.y - caja.height - desplazamiento;
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [estado]);

  const valor = useMemo(() => ({ mostrar, ocultar }), [mostrar, ocultar]);

  return (
    <CtxTooltip.Provider value={valor}>
      {children}
      {estado &&
        createPortal(
          <div
            ref={refCaja}
            className="tooltip"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
            role="tooltip"
          >
            <div className="tooltip-titulo">{estado.c.titulo}</div>
            {estado.c.subtitulo && <div className="tooltip-sub">{estado.c.subtitulo}</div>}
            {estado.c.filas.length > 0 && (
              <table className="tooltip-tabla">
                <tbody>
                  {estado.c.filas.map((f, i) => (
                    <tr key={i} className={f.tenue ? 'tenue' : undefined}>
                      <td>
                        {f.color && <span className="punto" style={{ background: f.color }} />}
                        {f.etiqueta}
                      </td>
                      <td className="valor">{f.valor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {estado.c.pie && <div className="tooltip-pie">{estado.c.pie}</div>}
          </div>,
          document.body,
        )}
    </CtxTooltip.Provider>
  );
}

export function useTooltip() {
  return useContext(CtxTooltip);
}

/** Handlers listos para pegar en cualquier marca SVG. */
export function usarMarcaHover(contenido: () => ContenidoTooltip) {
  const { mostrar, ocultar } = useTooltip();
  return {
    onMouseEnter: (e: React.MouseEvent) => mostrar(contenido(), e.clientX, e.clientY),
    onMouseMove: (e: React.MouseEvent) => mostrar(contenido(), e.clientX, e.clientY),
    onMouseLeave: ocultar,
    onFocus: (e: React.FocusEvent<SVGElement>) => {
      const r = (e.target as SVGGraphicsElement).getBoundingClientRect();
      mostrar(contenido(), r.left + r.width / 2, r.top);
    },
    onBlur: ocultar,
  };
}

// --------------------------------------------------------------------------
// Ejes y grilla
// --------------------------------------------------------------------------
export function GrillaY({
  ticks,
  escala,
  x0,
  x1,
}: {
  ticks: number[];
  escala: (v: number) => number;
  x0: number;
  x1: number;
}) {
  return (
    <g className="grilla" aria-hidden="true">
      {ticks.map((t) => (
        <line key={t} x1={x0} x2={x1} y1={escala(t)} y2={escala(t)} />
      ))}
    </g>
  );
}

export function EjeY({
  ticks,
  escala,
  x,
  formato,
}: {
  ticks: number[];
  escala: (v: number) => number;
  x: number;
  formato: (v: number) => string;
}) {
  return (
    <g className="eje" aria-hidden="true">
      {ticks.map((t) => (
        <text key={t} x={x} y={escala(t)} dy="0.32em" textAnchor="end">
          {formato(t)}
        </text>
      ))}
    </g>
  );
}

export function EjeX({
  ticks,
  y,
  formato,
  rotar = false,
}: {
  ticks: Array<{ valor: number | string; x: number }>;
  y: number;
  formato: (v: number | string) => string;
  rotar?: boolean;
}) {
  return (
    <g className="eje" aria-hidden="true">
      {ticks.map((t, i) => (
        <text
          key={`${t.valor}-${i}`}
          x={t.x}
          y={y}
          dy={rotar ? '0.32em' : '0.9em'}
          textAnchor={rotar ? 'end' : 'middle'}
          transform={rotar ? `rotate(-45 ${t.x} ${y})` : undefined}
        >
          {formato(t.valor)}
        </text>
      ))}
    </g>
  );
}

/** Línea de referencia (meta, promedio, umbral). Sólida y rotulada, nunca punteada. */
export function LineaReferencia({
  y,
  x0,
  x1,
  etiqueta,
  color = 'var(--ink-3)',
}: {
  y: number;
  x0: number;
  x1: number;
  etiqueta: string;
  color?: string;
}) {
  return (
    <g className="referencia">
      <line x1={x0} x2={x1} y1={y} y2={y} stroke={color} strokeWidth={1} />
      <text x={x1} y={y - 4} textAnchor="end" fill={color}>
        {etiqueta}
      </text>
    </g>
  );
}

// --------------------------------------------------------------------------
// Leyenda
// --------------------------------------------------------------------------
export interface ItemLeyenda {
  etiqueta: string;
  color: string;
  forma?: 'linea' | 'area' | 'punto' | 'cuadro';
  activo?: boolean;
  onClick?: () => void;
}

export function Leyenda({ items, alineacion = 'izquierda' }: { items: ItemLeyenda[]; alineacion?: 'izquierda' | 'derecha' }) {
  if (items.length === 0) return null;
  return (
    <div className={`leyenda leyenda-${alineacion}`}>
      {items.map((it) => {
        const Etiqueta = it.onClick ? 'button' : 'span';
        return (
          <Etiqueta
            key={it.etiqueta}
            className={`leyenda-item${it.activo === false ? ' inactivo' : ''}`}
            onClick={it.onClick}
            type={it.onClick ? 'button' : undefined}
          >
            <span className={`marca marca-${it.forma ?? 'linea'}`} style={{ background: it.color }} />
            {it.etiqueta}
          </Etiqueta>
        );
      })}
    </div>
  );
}

/** Leyenda de rampa secuencial, con extremos rotulados. */
export function LeyendaRampa({
  pasos,
  min,
  max,
  formato,
  titulo,
}: {
  pasos: string[];
  min: number;
  max: number;
  formato: (v: number) => string;
  titulo?: string;
}) {
  return (
    <div className="leyenda-rampa">
      {titulo && <span className="rampa-titulo">{titulo}</span>}
      <span className="rampa-extremo">{formato(min)}</span>
      <span className="rampa-celdas">
        {pasos.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </span>
      <span className="rampa-extremo">{formato(max)}</span>
    </div>
  );
}

// --------------------------------------------------------------------------
// Rampas
// --------------------------------------------------------------------------
export const RAMPA_SEQ = [
  'var(--seq-1)',
  'var(--seq-2)',
  'var(--seq-3)',
  'var(--seq-4)',
  'var(--seq-5)',
  'var(--seq-6)',
  'var(--seq-7)',
];

export const RAMPA_SEQ2 = [
  'var(--seq2-1)',
  'var(--seq2-2)',
  'var(--seq2-3)',
  'var(--seq2-4)',
  'var(--seq2-5)',
  'var(--seq2-6)',
];

export const RAMPA_DIV = [
  'var(--div-neg-3)',
  'var(--div-neg-2)',
  'var(--div-neg-1)',
  'var(--div-0)',
  'var(--div-pos-1)',
  'var(--div-pos-2)',
  'var(--div-pos-3)',
];

export const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)'];

/** Índice de rampa para un valor normalizado 0..1. */
export function pasoRampa(v: number | null, rampa: string[] = RAMPA_SEQ): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  const i = Math.min(rampa.length - 1, Math.max(0, Math.floor(v * rampa.length)));
  return rampa[i];
}

// --------------------------------------------------------------------------
// Utilidades numéricas
// --------------------------------------------------------------------------
/** Ticks "redondos" para un dominio [0, max]. */
export function ticksLindos(max: number, cantidad = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const bruto = max / cantidad;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / mag;
  const paso = (norm >= 5 ? 5 : norm >= 2 ? 2 : norm >= 1 ? 1 : 0.5) * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + paso * 0.5; v += paso) out.push(Number(v.toFixed(10)));
  return out;
}

/** Media móvil centrada, ignorando huecos. Devuelve `null` donde no hay soporte. */
export function mediaMovil(valores: Array<number | null>, ventana = 7): Array<number | null> {
  const medio = Math.floor(ventana / 2);
  return valores.map((_, i) => {
    let suma = 0;
    let n = 0;
    for (let j = i - medio; j <= i + medio; j++) {
      const v = valores[j];
      if (j >= 0 && j < valores.length && v !== null && Number.isFinite(v)) {
        suma += v;
        n++;
      }
    }
    return n >= Math.ceil(ventana / 3) ? suma / n : null;
  });
}

// --------------------------------------------------------------------------
// Envoltorio de gráfico
// --------------------------------------------------------------------------
export function Grafico({
  alto,
  children,
  recargando,
  etiqueta,
}: {
  alto: number;
  children: (dim: { ancho: number; alto: number }) => ReactNode;
  recargando?: boolean;
  etiqueta: string;
}) {
  const [ref, { ancho }] = useMedida<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`grafico${recargando ? ' recargando' : ''}`}
      style={{ height: alto }}
      role="img"
      aria-label={etiqueta}
    >
      {ancho > 0 && children({ ancho, alto })}
    </div>
  );
}

/** Estado vacío honesto: dice por qué no hay nada que mostrar. */
export function SinDatos({ mensaje = 'Sin datos para el recorte seleccionado' }: { mensaje?: string }) {
  return (
    <div className="sin-datos">
      <span>{mensaje}</span>
    </div>
  );
}
