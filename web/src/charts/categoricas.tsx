/** Gráficos por categoría: barras, mancuernas, pendientes, apiladas y embudo. */

import { scaleLinear } from 'd3-scale';
import {
  EjeX,
  Grafico,
  Leyenda,
  SinDatos,
  margen,
  ticksLindos,
  useTooltip,
  type ItemLeyenda,
} from './base';

const GAP = 2; // separación entre rellenos contiguos, en vez de bordes

// ==========================================================================
// Barras horizontales ordenadas
// ==========================================================================
export interface FilaBarra {
  clave: string;
  etiqueta: string;
  valor: number | null;
  /** Marca sobre la barra (mínimo requerido, meta, promedio). */
  referencia?: number | null;
  etiquetaReferencia?: string;
  nota?: string;
  /** Valor sostenido por muy pocos casos: se atenúa y se rotula el n. */
  confianzaBaja?: boolean;
  /** Texto corto después del valor (p. ej. cuántos días lo sostienen). */
  sufijo?: string;
}

export function BarrasHorizontales({
  filas,
  formatoValor,
  formatoEje,
  onClickFila,
  seleccionadas = [],
  altoFila = 26,
  color = 'var(--serie-1)',
  recargando,
  etiqueta,
  maxDominio,
  leyenda,
}: {
  filas: FilaBarra[];
  formatoValor: (v: number | null) => string;
  formatoEje?: (v: number) => string;
  onClickFila?: (clave: string) => void;
  seleccionadas?: string[];
  altoFila?: number;
  color?: string;
  recargando?: boolean;
  etiqueta: string;
  maxDominio?: number;
  leyenda?: ItemLeyenda[];
}) {
  const { mostrar, ocultar } = useTooltip();
  if (!filas.length) return <SinDatos />;

  const m = margen({ izquierda: 132, derecha: 68, arriba: 6, abajo: 22 });
  const alto = filas.length * altoFila + m.arriba + m.abajo;
  const hayFoco = seleccionadas.length > 0;

  return (
    <>
      {leyenda && <Leyenda items={leyenda} />}
      <Grafico alto={alto} recargando={recargando} etiqueta={etiqueta}>
        {({ ancho }) => {
          const w = Math.max(0, ancho - m.izquierda - m.derecha);
          const valores = filas
            .map((f) => f.valor)
            .filter((v): v is number => v !== null && Number.isFinite(v));
          const max = maxDominio ?? (valores.length ? Math.max(...valores) : 1);
          const x = scaleLinear().domain([0, max || 1]).range([0, w]);
          const ticks = ticksLindos(max || 1, 3);

          return (
            <svg width={ancho} height={alto}>
              <g transform={`translate(${m.izquierda},${m.arriba})`}>
                <g className="grilla" aria-hidden="true">
                  {ticks.map((t) => (
                    <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={filas.length * altoFila} />
                  ))}
                </g>

                {filas.map((f, i) => {
                  const y = i * altoFila;
                  const sel = seleccionadas.includes(f.clave);
                  const atenuada = hayFoco && !sel;
                  const largo = f.valor === null ? 0 : Math.max(0, x(f.valor));
                  return (
                    <g
                      key={f.clave}
                      className={`fila-barra${atenuada ? ' atenuada' : ''}${
                        onClickFila ? ' clickeable' : ''
                      }`}
                      onClick={() => onClickFila?.(f.clave)}
                      onMouseMove={(e) =>
                        mostrar(
                          {
                            titulo: f.etiqueta,
                            filas: [
                              { etiqueta: 'Valor', valor: formatoValor(f.valor), color },
                              ...(f.referencia != null
                                ? [
                                    {
                                      etiqueta: f.etiquetaReferencia ?? 'Referencia',
                                      valor: formatoValor(f.referencia),
                                      tenue: true,
                                    },
                                  ]
                                : []),
                            ],
                            pie: f.nota ?? (onClickFila ? 'Clic para filtrar el tablero' : undefined),
                          },
                          e.clientX,
                          e.clientY,
                        )
                      }
                      onMouseLeave={ocultar}
                      tabIndex={onClickFila ? 0 : undefined}
                      role={onClickFila ? 'button' : undefined}
                      onKeyDown={(e) => {
                        if (onClickFila && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          onClickFila(f.clave);
                        }
                      }}
                    >
                      <rect className="pista" x={0} y={y} width={w} height={altoFila} />
                      <text className="etiqueta-fila" x={-10} y={y + altoFila / 2} dy="0.32em" textAnchor="end">
                        {f.etiqueta}
                      </text>
                      {f.valor === null ? (
                        <text className="valor-vacio" x={4} y={y + altoFila / 2} dy="0.32em">
                          sin dato
                        </text>
                      ) : (
                        <rect
                          x={0}
                          y={y + GAP}
                          width={largo}
                          height={altoFila - GAP * 2}
                          rx={4}
                          fill={sel || !hayFoco ? color : 'var(--linea-fuerte)'}
                          opacity={f.confianzaBaja ? 0.42 : 1}
                        />
                      )}
                      {f.referencia != null && Number.isFinite(f.referencia) && (
                        <line
                          className="marca-referencia"
                          x1={x(f.referencia)}
                          x2={x(f.referencia)}
                          y1={y + GAP}
                          y2={y + altoFila - GAP}
                        />
                      )}
                      {f.valor !== null && (
                        <text
                          className="valor-directo"
                          /* Se ubica después de la marca más a la derecha (barra o
                             referencia) para que nunca queden encimadas. */
                          x={Math.max(largo, f.referencia != null ? x(f.referencia) : 0) + 9}
                          y={y + altoFila / 2}
                          dy="0.32em"
                        >
                          {formatoValor(f.valor)}
                          {f.sufijo && <tspan className="sufijo-valor"> {f.sufijo}</tspan>}
                        </text>
                      )}
                    </g>
                  );
                })}

                {formatoEje && (
                  <EjeX
                    ticks={ticks.map((t) => ({ valor: t, x: x(t) }))}
                    y={filas.length * altoFila + 2}
                    formato={(v) => formatoEje(Number(v))}
                  />
                )}
              </g>
            </svg>
          );
        }}
      </Grafico>
    </>
  );
}

// ==========================================================================
// Mancuerna (dos valores por categoría, unidos)
// ==========================================================================
export interface FilaMancuerna {
  clave: string;
  etiqueta: string;
  a: number | null;
  b: number | null;
}

export function Mancuerna({
  filas,
  etiquetaA,
  etiquetaB,
  colorA = 'var(--linea-fuerte)',
  colorB = 'var(--serie-1)',
  formatoValor,
  formatoEje,
  onClickFila,
  seleccionadas = [],
  recargando,
  etiqueta,
  altoFila = 28,
}: {
  filas: FilaMancuerna[];
  etiquetaA: string;
  etiquetaB: string;
  colorA?: string;
  colorB?: string;
  formatoValor: (v: number | null) => string;
  formatoEje: (v: number) => string;
  onClickFila?: (clave: string) => void;
  seleccionadas?: string[];
  recargando?: boolean;
  etiqueta: string;
  altoFila?: number;
}) {
  const { mostrar, ocultar } = useTooltip();
  if (!filas.length) return <SinDatos />;

  const m = margen({ izquierda: 132, derecha: 62, arriba: 6, abajo: 24 });
  const alto = filas.length * altoFila + m.arriba + m.abajo;
  const hayFoco = seleccionadas.length > 0;

  return (
    <>
      <Leyenda
        items={[
          { etiqueta: etiquetaA, color: colorA, forma: 'punto' },
          { etiqueta: etiquetaB, color: colorB, forma: 'punto' },
        ]}
      />
      <Grafico alto={alto} recargando={recargando} etiqueta={etiqueta}>
        {({ ancho }) => {
          const w = Math.max(0, ancho - m.izquierda - m.derecha);
          const todos = filas
            .flatMap((f) => [f.a, f.b])
            .filter((v): v is number => v !== null && Number.isFinite(v));
          const max = todos.length ? Math.max(...todos) : 1;
          const x = scaleLinear().domain([0, max * 1.05]).range([0, w]);
          const ticks = ticksLindos(max * 1.05, 4);

          return (
            <svg width={ancho} height={alto}>
              <g transform={`translate(${m.izquierda},${m.arriba})`}>
                <g className="grilla" aria-hidden="true">
                  {ticks.map((t) => (
                    <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={filas.length * altoFila} />
                  ))}
                </g>

                {filas.map((f, i) => {
                  const y = i * altoFila + altoFila / 2;
                  const sel = seleccionadas.includes(f.clave);
                  const atenuada = hayFoco && !sel;
                  const brecha = f.a !== null && f.b !== null ? f.a - f.b : null;
                  return (
                    <g
                      key={f.clave}
                      className={`fila-mancuerna${atenuada ? ' atenuada' : ''}${
                        onClickFila ? ' clickeable' : ''
                      }`}
                      onClick={() => onClickFila?.(f.clave)}
                      onMouseMove={(e) =>
                        mostrar(
                          {
                            titulo: f.etiqueta,
                            filas: [
                              { etiqueta: etiquetaA, valor: formatoValor(f.a), color: colorA },
                              { etiqueta: etiquetaB, valor: formatoValor(f.b), color: colorB },
                              ...(brecha !== null
                                ? [{ etiqueta: 'Brecha', valor: formatoValor(brecha), tenue: true }]
                                : []),
                            ],
                          },
                          e.clientX,
                          e.clientY,
                        )
                      }
                      onMouseLeave={ocultar}
                    >
                      <rect className="pista" x={0} y={i * altoFila} width={w} height={altoFila} />
                      <text className="etiqueta-fila" x={-10} y={y} dy="0.32em" textAnchor="end">
                        {f.etiqueta}
                      </text>
                      {f.a !== null && f.b !== null && (
                        <line
                          className="conector"
                          x1={x(Math.min(f.a, f.b))}
                          x2={x(Math.max(f.a, f.b))}
                          y1={y}
                          y2={y}
                        />
                      )}
                      {f.a !== null && (
                        <circle cx={x(f.a)} cy={y} r={5} fill={colorA} stroke="var(--superficie)" strokeWidth={2} />
                      )}
                      {f.b !== null && (
                        <circle cx={x(f.b)} cy={y} r={5} fill={colorB} stroke="var(--superficie)" strokeWidth={2} />
                      )}
                      {f.a !== null && f.b !== null && (
                        <text className="valor-directo" x={x(Math.max(f.a, f.b)) + 10} y={y} dy="0.32em">
                          {formatoValor(Math.abs(f.a - f.b))}
                        </text>
                      )}
                    </g>
                  );
                })}

                <EjeX
                  ticks={ticks.map((t) => ({ valor: t, x: x(t) }))}
                  y={filas.length * altoFila + 2}
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

// ==========================================================================
// Pendiente (slope): dos momentos, una línea por categoría
// ==========================================================================
export function Pendiente({
  filas,
  etiquetaA,
  etiquetaB,
  formatoValor,
  alto = 300,
  onClickFila,
  seleccionadas = [],
  recargando,
  etiqueta,
}: {
  filas: FilaMancuerna[];
  etiquetaA: string;
  etiquetaB: string;
  formatoValor: (v: number | null) => string;
  alto?: number;
  onClickFila?: (clave: string) => void;
  seleccionadas?: string[];
  recargando?: boolean;
  etiqueta: string;
}) {
  const { mostrar, ocultar } = useTooltip();
  const validas = filas.filter((f) => f.a !== null && f.b !== null);
  if (!validas.length) return <SinDatos />;

  const m = margen({ izquierda: 96, derecha: 96, arriba: 24, abajo: 24 });
  const hayFoco = seleccionadas.length > 0;

  return (
    <Grafico alto={alto} recargando={recargando} etiqueta={etiqueta}>
      {({ ancho }) => {
        const w = Math.max(0, ancho - m.izquierda - m.derecha);
        const h = Math.max(0, alto - m.arriba - m.abajo);
        const todos = validas.flatMap((f) => [f.a as number, f.b as number]);
        const min = Math.min(...todos);
        const max = Math.max(...todos);
        const pad = (max - min) * 0.12 || 0.02;
        const y = scaleLinear().domain([min - pad, max + pad]).range([h, 0]);

        return (
          <svg width={ancho} height={alto}>
            <g transform={`translate(${m.izquierda},${m.arriba})`}>
              <text className="eje-titulo" x={0} y={-10} textAnchor="middle">
                {etiquetaA}
              </text>
              <text className="eje-titulo" x={w} y={-10} textAnchor="middle">
                {etiquetaB}
              </text>
              <line className="eje-vertical" x1={0} x2={0} y1={0} y2={h} />
              <line className="eje-vertical" x1={w} x2={w} y1={0} y2={h} />

              {validas.map((f) => {
                const sel = seleccionadas.includes(f.clave);
                const atenuada = hayFoco && !sel;
                const sube = (f.b as number) >= (f.a as number);
                const color = atenuada
                  ? 'var(--linea-fuerte)'
                  : sube
                    ? 'var(--serie-1)'
                    : 'var(--serie-2)';
                return (
                  <g
                    key={f.clave}
                    className={`linea-pendiente${atenuada ? ' atenuada' : ''}${
                      onClickFila ? ' clickeable' : ''
                    }`}
                    onClick={() => onClickFila?.(f.clave)}
                    onMouseMove={(e) =>
                      mostrar(
                        {
                          titulo: f.etiqueta,
                          filas: [
                            { etiqueta: etiquetaA, valor: formatoValor(f.a) },
                            { etiqueta: etiquetaB, valor: formatoValor(f.b) },
                            {
                              etiqueta: 'Variación',
                              valor: formatoValor((f.b as number) - (f.a as number)),
                              tenue: true,
                            },
                          ],
                        },
                        e.clientX,
                        e.clientY,
                      )
                    }
                    onMouseLeave={ocultar}
                  >
                    <line
                      x1={0}
                      x2={w}
                      y1={y(f.a as number)}
                      y2={y(f.b as number)}
                      stroke={color}
                      strokeWidth={2}
                    />
                    <circle cx={0} cy={y(f.a as number)} r={4} fill={color} stroke="var(--superficie)" strokeWidth={2} />
                    <circle cx={w} cy={y(f.b as number)} r={4} fill={color} stroke="var(--superficie)" strokeWidth={2} />
                    <text className="etiqueta-pendiente" x={-10} y={y(f.a as number)} dy="0.32em" textAnchor="end">
                      {f.etiqueta}
                    </text>
                    <text className="valor-directo" x={w + 10} y={y(f.b as number)} dy="0.32em">
                      {formatoValor(f.b)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        );
      }}
    </Grafico>
  );
}

// ==========================================================================
// Barras apiladas al 100 % (composición)
// ==========================================================================
export interface SegmentoApilado {
  clave: string;
  etiqueta: string;
  valor: number;
  color: string;
}

export function BarraApilada({
  segmentos,
  total,
  formatoValor,
  alto = 34,
  mostrarLeyenda = true,
}: {
  segmentos: SegmentoApilado[];
  total?: number;
  formatoValor: (v: number) => string;
  alto?: number;
  mostrarLeyenda?: boolean;
}) {
  const { mostrar, ocultar } = useTooltip();
  const suma = total ?? segmentos.reduce((a, s) => a + s.valor, 0);
  if (!suma) return <SinDatos />;

  return (
    <>
      <Grafico alto={alto} etiqueta="Composición">
        {({ ancho }) => {
          let acumulado = 0;
          return (
            <svg width={ancho} height={alto}>
              {segmentos.map((s) => {
                const w = (s.valor / suma) * ancho;
                const x = acumulado;
                acumulado += w;
                const anchoDibujo = Math.max(0, w - GAP);
                // Solo se rotula adentro si el texto entra con aire.
                const cabeTexto = anchoDibujo > 46;
                return (
                  <g
                    key={s.clave}
                    onMouseMove={(e) =>
                      mostrar(
                        {
                          titulo: s.etiqueta,
                          filas: [
                            { etiqueta: 'Cantidad', valor: formatoValor(s.valor), color: s.color },
                            {
                              etiqueta: 'Participación',
                              valor: `${((s.valor / suma) * 100).toFixed(1)} %`,
                              tenue: true,
                            },
                          ],
                        },
                        e.clientX,
                        e.clientY,
                      )
                    }
                    onMouseLeave={ocultar}
                  >
                    <rect x={x} y={0} width={anchoDibujo} height={alto} rx={3} fill={s.color} />
                    {cabeTexto && (
                      <text className="etiqueta-apilada" x={x + anchoDibujo / 2} y={alto / 2} dy="0.32em">
                        {((s.valor / suma) * 100).toFixed(0)} %
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          );
        }}
      </Grafico>
      {mostrarLeyenda && (
        <Leyenda items={segmentos.map((s) => ({ etiqueta: s.etiqueta, color: s.color, forma: 'cuadro' }))} />
      )}
    </>
  );
}

// ==========================================================================
// Embudo de capacidad (habilitada → trabajando → ocupada)
// ==========================================================================
export interface EtapaEmbudo {
  clave: string;
  etiqueta: string;
  valor: number;
  descripcion: string;
}

export function Embudo({
  etapas,
  formatoValor,
  recargando,
}: {
  etapas: EtapaEmbudo[];
  formatoValor: (v: number) => string;
  recargando?: boolean;
}) {
  const { mostrar, ocultar } = useTooltip();
  if (!etapas.length || etapas[0].valor <= 0) return <SinDatos />;

  const base = etapas[0].valor;
  // Rampa ordinal: la etapa más "estrecha" es la más oscura.
  const colores = ['var(--seq-2)', 'var(--seq-4)', 'var(--seq-6)'];
  const altoEtapa = 46;
  const alto = etapas.length * altoEtapa + 16;

  return (
    <Grafico alto={alto} recargando={recargando} etiqueta="Embudo de capacidad">
      {({ ancho }) => {
        // Se reserva lugar a la derecha para el valor de la etapa más ancha.
        const util = Math.max(40, ancho - 78);
        return (
        <svg width={ancho} height={alto}>
          {etapas.map((e, i) => {
            const w = (e.valor / base) * util;
            const y = i * altoEtapa;
            const previa = i > 0 ? etapas[i - 1].valor : null;
            const caida = previa ? (previa - e.valor) / previa : null;
            return (
              <g
                key={e.clave}
                onMouseMove={(ev) =>
                  mostrar(
                    {
                      titulo: e.etiqueta,
                      subtitulo: e.descripcion,
                      filas: [
                        { etiqueta: 'Cantidad', valor: formatoValor(e.valor) },
                        { etiqueta: 'Sobre el total', valor: `${((e.valor / base) * 100).toFixed(1)} %`, tenue: true },
                        ...(caida !== null
                          ? [{ etiqueta: 'Caída vs. etapa previa', valor: `−${(caida * 100).toFixed(1)} %`, tenue: true }]
                          : []),
                      ],
                    },
                    ev.clientX,
                    ev.clientY,
                  )
                }
                onMouseLeave={ocultar}
              >
                <rect
                  x={0}
                  y={y + GAP}
                  width={Math.max(2, w)}
                  height={altoEtapa - GAP * 2 - 6}
                  rx={4}
                  fill={colores[Math.min(i, colores.length - 1)]}
                />
                <text className="etiqueta-embudo" x={10} y={y + (altoEtapa - 6) / 2} dy="0.32em">
                  {e.etiqueta}
                </text>
                <text className="valor-embudo" x={Math.max(2, w) + 10} y={y + (altoEtapa - 6) / 2} dy="0.32em">
                  {formatoValor(e.valor)}
                </text>
              </g>
            );
          })}
        </svg>
        );
      }}
    </Grafico>
  );
}
