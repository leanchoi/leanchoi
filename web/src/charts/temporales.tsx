/** Gráficos de eje temporal: serie diaria, chispas y calendario anual. */

import { useMemo, useRef, useState } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { area as d3area, line as d3line, curveMonotoneX } from 'd3-shape';
import {
  EjeX,
  EjeY,
  Grafico,
  GrillaY,
  LineaReferencia,
  RAMPA_SEQ,
  SinDatos,
  margen,
  pasoRampa,
  ticksLindos,
  useTooltip,
  type Margen,
} from './base';
import { DIAS_ABBR, MESES_ABBR, fechaLarga, iso } from '../lib/formato';

// ==========================================================================
// Serie temporal
// ==========================================================================
export interface PuntoSerie {
  fecha: Date;
  [clave: string]: Date | number | null | string | undefined;
}

export interface DefinicionSerie {
  clave: string;
  etiqueta: string;
  color: string;
  tipo?: 'linea' | 'area' | 'referencia';
  /** Rotula el último punto de la serie directamente sobre el trazo. */
  etiquetarFin?: boolean;
}

export function SerieTemporal({
  datos,
  series,
  alto = 260,
  formatoY,
  formatoValor,
  dominioY,
  recargando,
  etiqueta,
  referencia,
  onSeleccionRango,
  marcasEspeciales,
}: {
  datos: PuntoSerie[];
  series: DefinicionSerie[];
  alto?: number;
  formatoY: (v: number) => string;
  formatoValor: (v: number | null) => string;
  dominioY?: [number, number];
  recargando?: boolean;
  etiqueta: string;
  referencia?: { valor: number; etiqueta: string };
  onSeleccionRango?: (desde: string | null, hasta: string | null) => void;
  /** Días a destacar con una banda de fondo (feriados, eventos). */
  marcasEspeciales?: Array<{ desde: Date; hasta: Date; nombre: string }>;
}) {
  const { mostrar, ocultar } = useTooltip();
  const [hover, setHover] = useState<number | null>(null);
  const arrastre = useRef<{ x0: number; x1: number } | null>(null);
  const [seleccion, setSeleccion] = useState<{ x0: number; x1: number } | null>(null);

  if (!datos.length) return <SinDatos />;

  const m: Margen = margen({ izquierda: 46, derecha: 52, abajo: 30 });

  return (
    <Grafico alto={alto} recargando={recargando} etiqueta={etiqueta}>
      {({ ancho }) => {
        const w = Math.max(0, ancho - m.izquierda - m.derecha);
        const h = Math.max(0, alto - m.arriba - m.abajo);

        const fechas = datos.map((d) => d.fecha);
        const x = scaleTime()
          .domain([fechas[0], fechas[fechas.length - 1]])
          .range([0, w]);

        const valores = series.flatMap((s) =>
          datos.map((d) => d[s.clave]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
        );
        const maxAuto = valores.length ? Math.max(...valores) : 1;
        const dom = dominioY ?? [0, maxAuto * 1.08];
        const y = scaleLinear().domain(dom).range([h, 0]).nice();
        const ticks = ticksLindos(dom[1], 4);

        const gen = (clave: string) =>
          d3line<PuntoSerie>()
            .defined((d) => typeof d[clave] === 'number' && Number.isFinite(d[clave] as number))
            .x((d) => x(d.fecha))
            .y((d) => y(d[clave] as number))
            .curve(curveMonotoneX);

        const genArea = (clave: string) =>
          d3area<PuntoSerie>()
            .defined((d) => typeof d[clave] === 'number' && Number.isFinite(d[clave] as number))
            .x((d) => x(d.fecha))
            .y0(h)
            .y1((d) => y(d[clave] as number))
            .curve(curveMonotoneX);

        const indiceDesdeX = (px: number) => {
          const fecha = x.invert(px);
          let mejor = 0;
          let dist = Infinity;
          for (let i = 0; i < datos.length; i++) {
            const d = Math.abs(datos[i].fecha.getTime() - fecha.getTime());
            if (d < dist) {
              dist = d;
              mejor = i;
            }
          }
          return mejor;
        };

        const alMover = (e: React.MouseEvent<SVGRectElement>) => {
          const caja = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - caja.left;
          const i = indiceDesdeX(px);
          setHover(i);
          if (arrastre.current) {
            arrastre.current.x1 = px;
            setSeleccion({ ...arrastre.current });
          }
          const punto = datos[i];
          mostrar(
            {
              titulo: fechaLarga(punto.fecha),
              filas: series
                .filter((s) => s.tipo !== 'referencia')
                .map((s) => ({
                  etiqueta: s.etiqueta,
                  color: s.color,
                  valor: formatoValor(
                    typeof punto[s.clave] === 'number' ? (punto[s.clave] as number) : null,
                  ),
                })),
              pie: typeof punto.nota === 'string' ? punto.nota : undefined,
            },
            e.clientX,
            e.clientY,
          );
        };

        const alSalir = () => {
          setHover(null);
          ocultar();
        };

        const alBajar = (e: React.MouseEvent<SVGRectElement>) => {
          if (!onSeleccionRango) return;
          const caja = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - caja.left;
          arrastre.current = { x0: px, x1: px };
        };

        const alSoltar = () => {
          if (!arrastre.current || !onSeleccionRango) return;
          const { x0, x1 } = arrastre.current;
          arrastre.current = null;
          if (Math.abs(x1 - x0) < 6) {
            setSeleccion(null);
            onSeleccionRango(null, null);
            return;
          }
          const a = datos[indiceDesdeX(Math.min(x0, x1))].fecha;
          const b = datos[indiceDesdeX(Math.max(x0, x1))].fecha;
          setSeleccion(null);
          onSeleccionRango(iso(a), iso(b));
        };

        return (
          <svg width={ancho} height={alto}>
            <g transform={`translate(${m.izquierda},${m.arriba})`}>
              {/* Bandas de días especiales, por detrás de todo */}
              {marcasEspeciales?.map((mk, i) => {
                const xa = x(mk.desde);
                const xb = x(mk.hasta);
                if (xb < 0 || xa > w) return null;
                return (
                  <rect
                    key={i}
                    className="banda-evento"
                    x={Math.max(0, xa)}
                    width={Math.max(2, Math.min(w, xb) - Math.max(0, xa))}
                    y={0}
                    height={h}
                  >
                    <title>{mk.nombre}</title>
                  </rect>
                );
              })}

              <GrillaY ticks={ticks} escala={y} x0={0} x1={w} />

              {series
                .filter((s) => s.tipo === 'area')
                .map((s) => (
                  <path key={`a-${s.clave}`} d={genArea(s.clave)(datos) ?? ''} fill={s.color} opacity={0.14} />
                ))}

              {series
                .filter((s) => s.tipo !== 'area' || true)
                .map((s) => (
                  <path
                    key={`l-${s.clave}`}
                    d={gen(s.clave)(datos) ?? ''}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.tipo === 'referencia' ? 1.5 : 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={s.tipo === 'referencia' ? 0.75 : 1}
                  />
                ))}

              {/* Días medidos que quedan aislados entre huecos: sin esto,
                  un punto suelto no dibuja ningún trazo y se pierde. */}
              {series
                .filter((s) => s.tipo !== 'referencia')
                .map((s) =>
                  datos.map((d, i) => {
                    const v = d[s.clave];
                    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
                    const definido = (j: number) =>
                      j >= 0 &&
                      j < datos.length &&
                      typeof datos[j][s.clave] === 'number' &&
                      Number.isFinite(datos[j][s.clave] as number);
                    if (definido(i - 1) || definido(i + 1)) return null;
                    return (
                      <circle key={`p-${s.clave}-${i}`} cx={x(d.fecha)} cy={y(v)} r={2.5} fill={s.color} />
                    );
                  }),
                )}

              {referencia && (
                <LineaReferencia
                  y={y(referencia.valor)}
                  x0={0}
                  x1={w}
                  etiqueta={referencia.etiqueta}
                />
              )}

              {/* Etiqueta directa al final del trazo, en vez de un número por punto */}
              {series
                .filter((s) => s.etiquetarFin)
                .map((s) => {
                  for (let i = datos.length - 1; i >= 0; i--) {
                    const v = datos[i][s.clave];
                    if (typeof v === 'number' && Number.isFinite(v)) {
                      return (
                        <text
                          key={`e-${s.clave}`}
                          className="etiqueta-directa"
                          x={x(datos[i].fecha) + 6}
                          y={y(v)}
                          dy="0.32em"
                          fill={s.color}
                        >
                          {formatoValor(v)}
                        </text>
                      );
                    }
                  }
                  return null;
                })}

              {/* Crosshair */}
              {hover !== null && datos[hover] && (
                <g className="crosshair">
                  <line x1={x(datos[hover].fecha)} x2={x(datos[hover].fecha)} y1={0} y2={h} />
                  {series
                    .filter((s) => s.tipo !== 'referencia')
                    .map((s) => {
                      const v = datos[hover][s.clave];
                      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
                      return (
                        <circle
                          key={s.clave}
                          cx={x(datos[hover].fecha)}
                          cy={y(v)}
                          r={4}
                          fill={s.color}
                          stroke="var(--superficie)"
                          strokeWidth={2}
                        />
                      );
                    })}
                </g>
              )}

              {seleccion && (
                <rect
                  className="brush"
                  x={Math.min(seleccion.x0, seleccion.x1)}
                  width={Math.abs(seleccion.x1 - seleccion.x0)}
                  y={0}
                  height={h}
                />
              )}

              <EjeY ticks={ticks} escala={y} x={-8} formato={formatoY} />
              <EjeX
                ticks={x.ticks(Math.max(2, Math.floor(w / 90))).map((t) => ({
                  valor: t.getTime(),
                  x: x(t),
                }))}
                y={h + 4}
                formato={(v) => {
                  const d = new Date(Number(v));
                  return `${d.getUTCDate()} ${MESES_ABBR[d.getUTCMonth()].toLowerCase()}`;
                }}
              />

              <rect
                className="capa-hover"
                x={0}
                y={0}
                width={w}
                height={h}
                onMouseMove={alMover}
                onMouseLeave={alSalir}
                onMouseDown={alBajar}
                onMouseUp={alSoltar}
                style={{ cursor: onSeleccionRango ? 'crosshair' : 'default' }}
              />
            </g>
          </svg>
        );
      }}
    </Grafico>
  );
}

// ==========================================================================
// Chispa (sparkline para los KPI)
// ==========================================================================
export function Chispa({
  valores,
  color = 'var(--serie-1)',
  ancho = 96,
  alto = 28,
}: {
  valores: Array<number | null>;
  color?: string;
  ancho?: number;
  alto?: number;
}) {
  const d = useMemo(() => {
    const validos = valores.filter((v): v is number => v !== null && Number.isFinite(v));
    if (validos.length < 2) return null;
    const min = Math.min(...validos);
    const max = Math.max(...validos);
    const rango = max - min || 1;
    const x = (i: number) => (i / (valores.length - 1)) * (ancho - 2) + 1;
    const y = (v: number) => alto - 2 - ((v - min) / rango) * (alto - 4);
    const linea = d3line<number | null>()
      .defined((v) => v !== null && Number.isFinite(v))
      .x((_, i) => x(i))
      .y((v) => y(v as number))
      .curve(curveMonotoneX);
    return linea(valores);
  }, [valores, ancho, alto]);

  if (!d) return null;
  return (
    <svg className="chispa" width={ancho} height={alto} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

// ==========================================================================
// Calendario anual
// ==========================================================================
export interface DiaCalendario {
  fecha: Date;
  valor: number | null;
  publicable: boolean;
  nota?: string;
}

export function CalendarioAnual({
  dias,
  formatoValor,
  onClickDia,
  seleccionado,
  alto = 150,
  recargando,
  etiqueta,
  dominio,
}: {
  dias: DiaCalendario[];
  formatoValor: (v: number | null) => string;
  onClickDia?: (fecha: Date) => void;
  seleccionado?: string | null;
  alto?: number;
  recargando?: boolean;
  etiqueta: string;
  dominio?: [number, number];
}) {
  const { mostrar, ocultar } = useTooltip();
  if (!dias.length) return <SinDatos />;

  const validos = dias
    .map((d) => d.valor)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const min = dominio?.[0] ?? (validos.length ? Math.min(...validos) : 0);
  const max = dominio?.[1] ?? (validos.length ? Math.max(...validos) : 1);
  const rango = max - min || 1;

  return (
    <Grafico alto={alto} recargando={recargando} etiqueta={etiqueta}>
      {({ ancho }) => {
        const izq = 30;
        const arriba = 18;
        const semanas = Math.ceil(dias.length / 7) + 2;
        const lado = Math.max(6, Math.min(16, Math.floor((ancho - izq - 8) / semanas) - 2));
        const paso = lado + 2; // 2 px de separación entre celdas, sin bordes

        // Semana 0 = la del primer día; las columnas avanzan de lunes a lunes.
        const primera = dias[0].fecha;
        const offsetPrimera = (primera.getUTCDay() + 6) % 7;
        const semanaDe = (i: number) => Math.floor((i + offsetPrimera) / 7);
        const filaDe = (i: number) => (i + offsetPrimera) % 7;

        const etiquetasMes: Array<{ mes: number; x: number }> = [];
        let mesActual = -1;
        dias.forEach((d, i) => {
          const m = d.fecha.getUTCMonth();
          if (m !== mesActual) {
            mesActual = m;
            etiquetasMes.push({ mes: m, x: izq + semanaDe(i) * paso });
          }
        });

        return (
          <svg width={ancho} height={alto}>
            <g className="eje">
              {etiquetasMes.map((e) => (
                <text key={e.mes} x={e.x} y={10} textAnchor="start">
                  {MESES_ABBR[e.mes]}
                </text>
              ))}
              {[0, 2, 4, 6].map((f) => (
                <text key={f} x={izq - 6} y={arriba + f * paso + lado / 2} dy="0.32em" textAnchor="end">
                  {DIAS_ABBR[f]}
                </text>
              ))}
            </g>
            {dias.map((d, i) => {
              const norm = d.valor === null ? null : (d.valor - min) / rango;
              const relleno = d.valor === null ? 'var(--superficie-2)' : pasoRampa(norm, RAMPA_SEQ)!;
              const cx = izq + semanaDe(i) * paso;
              const cy = arriba + filaDe(i) * paso;
              const esSel = seleccionado === iso(d.fecha);
              return (
                <rect
                  key={i}
                  className={`celda-cal${d.valor === null ? ' vacia' : ''}${esSel ? ' seleccionada' : ''}`}
                  x={cx}
                  y={cy}
                  width={lado}
                  height={lado}
                  rx={2}
                  fill={relleno}
                  tabIndex={0}
                  role="button"
                  aria-label={`${fechaLarga(d.fecha)}: ${formatoValor(d.valor)}`}
                  onClick={() => onClickDia?.(d.fecha)}
                  onMouseMove={(e) =>
                    mostrar(
                      {
                        titulo: fechaLarga(d.fecha),
                        filas: [
                          { etiqueta: 'Ocupación', valor: formatoValor(d.valor) },
                          ...(d.publicable
                            ? []
                            : [{ etiqueta: 'Estado', valor: 'Sin dato publicable', tenue: true }]),
                        ],
                        pie: d.nota,
                      },
                      e.clientX,
                      e.clientY,
                    )
                  }
                  onMouseLeave={ocultar}
                />
              );
            })}
          </svg>
        );
      }}
    </Grafico>
  );
}
