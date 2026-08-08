/** Distribución y relación: cajas, dispersión, tiras y pequeños múltiplos. */

import { scaleLinear } from 'd3-scale';
import { area as d3area, line as d3line, curveMonotoneX } from 'd3-shape';
import {
  EjeX,
  EjeY,
  Grafico,
  GrillaY,
  SinDatos,
  margen,
  ticksLindos,
  useTooltip,
} from './base';

// ==========================================================================
// Caja y bigotes: distribución de los días dentro de cada grupo
// ==========================================================================
export interface Caja {
  clave: string;
  etiqueta: string;
  min: number;
  q1: number;
  mediana: number;
  q3: number;
  max: number;
  n: number;
}

/** Cuartiles por interpolación lineal (mismo método que `quantile_cont` de DuckDB). */
export function calcularCaja(clave: string, etiqueta: string, valores: number[]): Caja | null {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 2) return null;
  const q = (p: number) => {
    const i = p * (v.length - 1);
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return {
    clave,
    etiqueta,
    min: v[0],
    q1: q(0.25),
    mediana: q(0.5),
    q3: q(0.75),
    max: v[v.length - 1],
    n: v.length,
  };
}

export function CajasYBigotes({
  cajas,
  formatoValor,
  formatoEje,
  alto = 260,
  onClickCaja,
  seleccionadas = [],
  recargando,
  etiqueta,
  color = 'var(--serie-1)',
}: {
  cajas: Caja[];
  formatoValor: (v: number | null) => string;
  formatoEje: (v: number) => string;
  alto?: number;
  onClickCaja?: (clave: string) => void;
  seleccionadas?: string[];
  recargando?: boolean;
  etiqueta: string;
  color?: string;
}) {
  const { mostrar, ocultar } = useTooltip();
  if (!cajas.length) return <SinDatos />;

  const m = margen({ izquierda: 46, abajo: 28, arriba: 10 });
  const hayFoco = seleccionadas.length > 0;

  return (
    <Grafico alto={alto} recargando={recargando} etiqueta={etiqueta}>
      {({ ancho }) => {
        const w = Math.max(0, ancho - m.izquierda - m.derecha);
        const h = Math.max(0, alto - m.arriba - m.abajo);
        const max = Math.max(...cajas.map((c) => c.max));
        const y = scaleLinear().domain([0, max * 1.08]).range([h, 0]).nice();
        const ticks = ticksLindos(max * 1.08, 4);
        const paso = w / cajas.length;
        const anchoCaja = Math.min(30, paso * 0.5);

        return (
          <svg width={ancho} height={alto}>
            <g transform={`translate(${m.izquierda},${m.arriba})`}>
              <GrillaY ticks={ticks} escala={y} x0={0} x1={w} />

              {cajas.map((c, i) => {
                const cx = paso * i + paso / 2;
                const sel = seleccionadas.includes(c.clave);
                const atenuada = hayFoco && !sel;
                const relleno = atenuada ? 'var(--linea-fuerte)' : color;
                return (
                  <g
                    key={c.clave}
                    className={`caja${atenuada ? ' atenuada' : ''}${onClickCaja ? ' clickeable' : ''}`}
                    onClick={() => onClickCaja?.(c.clave)}
                    onMouseMove={(e) =>
                      mostrar(
                        {
                          titulo: c.etiqueta,
                          subtitulo: `${c.n} días con dato`,
                          filas: [
                            { etiqueta: 'Máximo', valor: formatoValor(c.max), tenue: true },
                            { etiqueta: 'Cuartil 3', valor: formatoValor(c.q3) },
                            { etiqueta: 'Mediana', valor: formatoValor(c.mediana), color: relleno },
                            { etiqueta: 'Cuartil 1', valor: formatoValor(c.q1) },
                            { etiqueta: 'Mínimo', valor: formatoValor(c.min), tenue: true },
                          ],
                        },
                        e.clientX,
                        e.clientY,
                      )
                    }
                    onMouseLeave={ocultar}
                  >
                    <rect className="pista" x={paso * i} y={0} width={paso} height={h} />
                    {/* Bigotes */}
                    <line className="bigote" x1={cx} x2={cx} y1={y(c.max)} y2={y(c.q3)} />
                    <line className="bigote" x1={cx} x2={cx} y1={y(c.q1)} y2={y(c.min)} />
                    <line className="bigote-tapa" x1={cx - 6} x2={cx + 6} y1={y(c.max)} y2={y(c.max)} />
                    <line className="bigote-tapa" x1={cx - 6} x2={cx + 6} y1={y(c.min)} y2={y(c.min)} />
                    {/* Caja intercuartil */}
                    <rect
                      x={cx - anchoCaja / 2}
                      y={y(c.q3)}
                      width={anchoCaja}
                      height={Math.max(1, y(c.q1) - y(c.q3))}
                      rx={3}
                      fill={relleno}
                      opacity={0.28}
                    />
                    <rect
                      x={cx - anchoCaja / 2}
                      y={y(c.q3)}
                      width={anchoCaja}
                      height={Math.max(1, y(c.q1) - y(c.q3))}
                      rx={3}
                      fill="none"
                      stroke={relleno}
                      strokeWidth={1.5}
                    />
                    {/* Mediana */}
                    <line
                      x1={cx - anchoCaja / 2}
                      x2={cx + anchoCaja / 2}
                      y1={y(c.mediana)}
                      y2={y(c.mediana)}
                      stroke={relleno}
                      strokeWidth={2.5}
                    />
                  </g>
                );
              })}

              <EjeY ticks={ticks} escala={y} x={-8} formato={formatoEje} />
              <EjeX
                ticks={cajas.map((c, i) => ({ valor: c.etiqueta, x: paso * i + paso / 2 }))}
                y={h + 4}
                formato={(v) => String(v)}
              />
            </g>
          </svg>
        );
      }}
    </Grafico>
  );
}

// ==========================================================================
// Dispersión
// ==========================================================================
export interface PuntoDispersion {
  clave: string;
  etiqueta: string;
  x: number;
  y: number;
  tamano?: number;
  detalle?: Array<{ etiqueta: string; valor: string }>;
}

export function Dispersion({
  puntos,
  tituloX,
  tituloY,
  formatoX,
  formatoY,
  alto = 300,
  onClickPunto,
  seleccionados = [],
  recargando,
  etiqueta,
  color = 'var(--serie-1)',
}: {
  puntos: PuntoDispersion[];
  tituloX: string;
  tituloY: string;
  formatoX: (v: number) => string;
  formatoY: (v: number) => string;
  alto?: number;
  onClickPunto?: (clave: string) => void;
  seleccionados?: string[];
  recargando?: boolean;
  etiqueta: string;
  color?: string;
}) {
  const { mostrar, ocultar } = useTooltip();
  if (!puntos.length) return <SinDatos />;

  const m = margen({ izquierda: 52, abajo: 42, derecha: 24, arriba: 12 });
  const hayFoco = seleccionados.length > 0;

  return (
    <Grafico alto={alto} recargando={recargando} etiqueta={etiqueta}>
      {({ ancho }) => {
        const w = Math.max(0, ancho - m.izquierda - m.derecha);
        const h = Math.max(0, alto - m.arriba - m.abajo);
        const maxX = Math.max(...puntos.map((p) => p.x)) * 1.08 || 1;
        const maxY = Math.max(...puntos.map((p) => p.y)) * 1.08 || 1;
        const x = scaleLinear().domain([0, maxX]).range([0, w]);
        const y = scaleLinear().domain([0, maxY]).range([h, 0]);
        const ticksX = ticksLindos(maxX, 4);
        const ticksY = ticksLindos(maxY, 4);
        const maxTam = Math.max(...puntos.map((p) => p.tamano ?? 1)) || 1;
        const r = (t: number | undefined) => 4 + Math.sqrt((t ?? 1) / maxTam) * 11;

        return (
          <svg width={ancho} height={alto}>
            <g transform={`translate(${m.izquierda},${m.arriba})`}>
              <GrillaY ticks={ticksY} escala={y} x0={0} x1={w} />
              <g className="grilla" aria-hidden="true">
                {ticksX.map((t) => (
                  <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={h} />
                ))}
              </g>

              {puntos.map((p) => {
                const sel = seleccionados.includes(p.clave);
                const atenuado = hayFoco && !sel;
                return (
                  <circle
                    key={p.clave}
                    className={`punto-dispersion${atenuado ? ' atenuado' : ''}${
                      onClickPunto ? ' clickeable' : ''
                    }`}
                    cx={x(p.x)}
                    cy={y(p.y)}
                    r={r(p.tamano)}
                    fill={atenuado ? 'var(--linea-fuerte)' : color}
                    stroke="var(--superficie)"
                    strokeWidth={2}
                    onClick={() => onClickPunto?.(p.clave)}
                    onMouseMove={(e) =>
                      mostrar(
                        {
                          titulo: p.etiqueta,
                          filas: [
                            { etiqueta: tituloX, valor: formatoX(p.x) },
                            { etiqueta: tituloY, valor: formatoY(p.y) },
                            ...(p.detalle ?? []).map((d) => ({ ...d, tenue: true })),
                          ],
                        },
                        e.clientX,
                        e.clientY,
                      )
                    }
                    onMouseLeave={ocultar}
                  />
                );
              })}

              <EjeY ticks={ticksY} escala={y} x={-8} formato={formatoY} />
              <EjeX
                ticks={ticksX.map((t) => ({ valor: t, x: x(t) }))}
                y={h + 4}
                formato={(v) => formatoX(Number(v))}
              />
              <text className="eje-titulo" x={w / 2} y={h + 34} textAnchor="middle">
                {tituloX}
              </text>
              <text
                className="eje-titulo"
                transform={`translate(${-38},${h / 2}) rotate(-90)`}
                textAnchor="middle"
              >
                {tituloY}
              </text>
            </g>
          </svg>
        );
      }}
    </Grafico>
  );
}

// ==========================================================================
// Pequeños múltiplos
// ==========================================================================
export interface PanelMultiple {
  clave: string;
  etiqueta: string;
  valores: Array<number | null>;
  resumen?: string;
}

export function PequenosMultiples({
  paneles,
  etiquetasX,
  formatoValor,
  onClickPanel,
  seleccionados = [],
  altoPanel = 74,
  columnas = 4,
  recargando,
  etiqueta,
  dominioComun = true,
  color = 'var(--serie-1)',
}: {
  paneles: PanelMultiple[];
  etiquetasX: string[];
  formatoValor: (v: number | null) => string;
  onClickPanel?: (clave: string) => void;
  seleccionados?: string[];
  altoPanel?: number;
  columnas?: number;
  recargando?: boolean;
  etiqueta: string;
  /** Escala compartida: es lo que hace comparables los paneles entre sí. */
  dominioComun?: boolean;
  color?: string;
}) {
  const { mostrar, ocultar } = useTooltip();
  if (!paneles.length) return <SinDatos />;

  const todos = paneles
    .flatMap((p) => p.valores)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const maxGlobal = todos.length ? Math.max(...todos) : 1;
  const hayFoco = seleccionados.length > 0;

  return (
    <div className={`multiples${recargando ? ' recargando' : ''}`} role="img" aria-label={etiqueta}>
      {paneles.map((p) => {
        const sel = seleccionados.includes(p.clave);
        const atenuado = hayFoco && !sel;
        const propios = p.valores.filter((v): v is number => v !== null && Number.isFinite(v));
        const max = dominioComun ? maxGlobal : propios.length ? Math.max(...propios) : 1;

        return (
          <div
            key={p.clave}
            className={`panel-multiple${atenuado ? ' atenuado' : ''}${
              onClickPanel ? ' clickeable' : ''
            }`}
            style={{ flexBasis: `calc(${100 / columnas}% - var(--e-3))` }}
            onClick={() => onClickPanel?.(p.clave)}
            role={onClickPanel ? 'button' : undefined}
            tabIndex={onClickPanel ? 0 : undefined}
            onKeyDown={(e) => {
              if (onClickPanel && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onClickPanel(p.clave);
              }
            }}
          >
            <div className="panel-titulo">
              <span>{p.etiqueta}</span>
              {p.resumen && <strong>{p.resumen}</strong>}
            </div>
            <Grafico alto={altoPanel} etiqueta={p.etiqueta}>
              {({ ancho }) => {
                const w = ancho;
                const h = altoPanel;
                const x = (i: number) => (i / Math.max(1, p.valores.length - 1)) * (w - 4) + 2;
                const y = (v: number) => h - 4 - (v / (max || 1)) * (h - 10);
                const linea = d3line<number | null>()
                  .defined((v) => v !== null && Number.isFinite(v))
                  .x((_, i) => x(i))
                  .y((v) => y(v as number))
                  .curve(curveMonotoneX);
                const relleno = d3area<number | null>()
                  .defined((v) => v !== null && Number.isFinite(v))
                  .x((_, i) => x(i))
                  .y0(h - 2)
                  .y1((v) => y(v as number))
                  .curve(curveMonotoneX);

                const trazoColor = atenuado ? 'var(--linea-fuerte)' : color;

                return (
                  <svg
                    width={w}
                    height={h}
                    onMouseMove={(e) => {
                      const caja = e.currentTarget.getBoundingClientRect();
                      const px = e.clientX - caja.left;
                      const i = Math.round(((px - 2) / (w - 4)) * (p.valores.length - 1));
                      const idx = Math.min(p.valores.length - 1, Math.max(0, i));
                      mostrar(
                        {
                          titulo: p.etiqueta,
                          subtitulo: etiquetasX[idx],
                          filas: [{ etiqueta: 'Valor', valor: formatoValor(p.valores[idx]), color: trazoColor }],
                        },
                        e.clientX,
                        e.clientY,
                      );
                    }}
                    onMouseLeave={ocultar}
                  >
                    <path d={relleno(p.valores) ?? ''} fill={trazoColor} opacity={0.13} />
                    <path
                      d={linea(p.valores) ?? ''}
                      fill="none"
                      stroke={trazoColor}
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                );
              }}
            </Grafico>
          </div>
        );
      })}
    </div>
  );
}

// ==========================================================================
// Tira de puntos (un punto por establecimiento)
// ==========================================================================
export interface PuntoTira {
  clave: string;
  etiqueta: string;
  grupo: string;
  valor: number;
  tamano?: number;
  detalle?: Array<{ etiqueta: string; valor: string }>;
}

export function TiraPuntos({
  puntos,
  grupos,
  etiquetaGrupo,
  formatoValor,
  formatoEje,
  altoGrupo = 34,
  recargando,
  etiqueta,
  onClickGrupo,
  gruposSeleccionados = [],
  leyenda,
}: {
  puntos: PuntoTira[];
  grupos: string[];
  etiquetaGrupo: (g: string) => string;
  formatoValor: (v: number) => string;
  formatoEje: (v: number) => string;
  altoGrupo?: number;
  recargando?: boolean;
  etiqueta: string;
  onClickGrupo?: (g: string) => void;
  gruposSeleccionados?: string[];
  leyenda?: string;
}) {
  const { mostrar, ocultar } = useTooltip();
  if (!puntos.length) return <SinDatos />;

  const m = margen({ izquierda: 132, derecha: 24, arriba: 8, abajo: 26 });
  const alto = grupos.length * altoGrupo + m.arriba + m.abajo;
  const hayFoco = gruposSeleccionados.length > 0;
  const maxTam = Math.max(...puntos.map((p) => p.tamano ?? 1)) || 1;

  return (
    <>
      {leyenda && <p className="nota-grafico">{leyenda}</p>}
      <Grafico alto={alto} recargando={recargando} etiqueta={etiqueta}>
        {({ ancho }) => {
          const w = Math.max(0, ancho - m.izquierda - m.derecha);
          const max = Math.max(...puntos.map((p) => p.valor)) || 1;
          const x = scaleLinear().domain([0, max * 1.05]).range([0, w]);
          const ticks = ticksLindos(max * 1.05, 4);

          return (
            <svg width={ancho} height={alto}>
              <g transform={`translate(${m.izquierda},${m.arriba})`}>
                <g className="grilla" aria-hidden="true">
                  {ticks.map((t) => (
                    <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={grupos.length * altoGrupo} />
                  ))}
                </g>

                {grupos.map((g, gi) => {
                  const delGrupo = puntos.filter((p) => p.grupo === g);
                  const atenuado = hayFoco && !gruposSeleccionados.includes(g);
                  const cy = gi * altoGrupo + altoGrupo / 2;
                  return (
                    <g key={g} className={atenuado ? 'atenuada' : undefined}>
                      <rect className="pista" x={0} y={gi * altoGrupo} width={w} height={altoGrupo} />
                      <text
                        className="etiqueta-fila"
                        x={-10}
                        y={cy}
                        dy="0.32em"
                        textAnchor="end"
                        onClick={() => onClickGrupo?.(g)}
                        style={{ cursor: onClickGrupo ? 'pointer' : undefined }}
                      >
                        {etiquetaGrupo(g)}
                      </text>
                      {delGrupo.map((p, i) => {
                        // Desplazamiento vertical determinista para separar solapes.
                        const jitter = ((i * 37) % 11) / 11 - 0.5;
                        return (
                          <circle
                            key={p.clave}
                            className="punto-tira"
                            cx={x(p.valor)}
                            cy={cy + jitter * (altoGrupo - 12)}
                            r={3 + Math.sqrt((p.tamano ?? 1) / maxTam) * 6}
                            onMouseMove={(e) =>
                              mostrar(
                                {
                                  titulo: p.etiqueta,
                                  subtitulo: etiquetaGrupo(g),
                                  filas: [
                                    { etiqueta: 'Valor', valor: formatoValor(p.valor) },
                                    ...(p.detalle ?? []).map((d) => ({ ...d, tenue: true })),
                                  ],
                                },
                                e.clientX,
                                e.clientY,
                              )
                            }
                            onMouseLeave={ocultar}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                <EjeX
                  ticks={ticks.map((t) => ({ valor: t, x: x(t) }))}
                  y={grupos.length * altoGrupo + 2}
                  formato={(v) => formatoEje(Number(v))}
                />
              </g>
            </svg>
          );
        }}
      </Grafico>
    </>
  );
}
