"use client";

import React, { useState } from "react";

// Paleta categórica y rampa secuencial
export const SERIES_COLORS = [
  "var(--s1)",
  "var(--s2)",
  "var(--s3)",
  "var(--s4)",
  "var(--s5)",
  "var(--s6)",
];

export const RAMP_COLORS = [
  "var(--q1)",
  "var(--q2)",
  "var(--q3)",
  "var(--q4)",
  "var(--q5)",
  "var(--q6)",
  "var(--q7)",
];

export function fmt(n: number, d = 0): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function compact(n: number): string {
  if (Math.abs(n) >= 1e6) {
    return (n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "M";
  }
  if (Math.abs(n) >= 1e3) {
    return (n / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "K";
  }
  return fmt(n);
}

function barPath(x: number, y: number, w: number, h: number, r: number, dir: "up" | "right"): string {
  r = Math.min(r, w / 2, h);
  if (h <= 0.5) return "";
  if (dir === "up") {
    return `M${x} ${y + h} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + h} Z`;
  }
  return `M${x} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} L${x} ${y + h} Z`;
}

// -------------------------------------------------------------
// 1. LineChart Component
// -------------------------------------------------------------
export interface LineSeries {
  name: string;
  values: (number | null)[];
  dashFrom?: number;
  color?: string;
  area?: boolean;
  endLabel?: string | false;
}

export interface LineChartProps {
  labels: string[];
  series: LineSeries[];
  height?: number;
  min?: number;
  max?: number;
  yFmt?: (v: number) => string;
  band?: [number, number];
  ariaLabel?: string;
  tableTitle?: string;
}

export function LineChart({
  labels,
  series,
  height = 210,
  min: userMin,
  max: userMax,
  yFmt,
  band,
  ariaLabel = "Gráfico de líneas",
  tableTitle = "Datos de serie",
}: LineChartProps) {
  const [showTable, setShowTable] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const W = 640;
  const H = height;
  const pad = { t: 14, r: 46, b: 24, l: 42 };

  const allValues = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const dataMin = userMin != null ? userMin : Math.min(...allValues);
  const dataMax = userMax != null ? userMax : Math.max(...allValues);

  const ticksCount = 4;
  const span = dataMax - dataMin || 1;
  const rawStep = span / ticksCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(dataMin / step) * step; v <= dataMax + 1e-9; v += step) {
    ticks.push(+v.toFixed(6));
  }

  const lo = Math.min(dataMin, ticks[0] ?? dataMin);
  const hi = Math.max(dataMax, ticks[ticks.length - 1] ?? dataMax);

  const scaleY = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo || 1));
  const scaleX = (i: number) => pad.l + (W - pad.l - pad.r) * (i / (labels.length - 1 || 1));

  return (
    <div>
      <div className="row-between mb-2">
        <span className="card-note">{tableTitle}</span>
        <button
          type="button"
          className="btn btn-ghost tiny"
          onClick={() => setShowTable(!showTable)}
        >
          {showTable ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>

      {showTable ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Período</th>
                {series.map((s) => (
                  <th key={s.name} className="n">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((lbl, i) => (
                <tr key={lbl}>
                  <td className="strong">{lbl}</td>
                  {series.map((s) => (
                    <td key={s.name} className="n">
                      {s.values[i] != null
                        ? yFmt
                          ? yFmt(s.values[i]!)
                          : compact(s.values[i]!)
                        : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg
            className="chart"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={ariaLabel}
          >
            {/* Banda de referencia opcional */}
            {band && (
              <rect
                x={pad.l}
                y={scaleY(band[1])}
                width={W - pad.l - pad.r}
                height={Math.max(0, scaleY(band[0]) - scaleY(band[1]))}
                fill="var(--ok)"
                opacity={0.07}
              />
            )}

            {/* Grilla y marcas de eje Y */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  className="gridline"
                  x1={pad.l}
                  x2={W - pad.r}
                  y1={scaleY(t)}
                  y2={scaleY(t)}
                />
                <text
                  className="tick"
                  x={pad.l - 8}
                  y={scaleY(t) + 3.5}
                  textAnchor="end"
                >
                  {yFmt ? yFmt(t) : compact(t)}
                </text>
              </g>
            ))}
            <line
              className="axis-line"
              x1={pad.l}
              x2={W - pad.r}
              y1={scaleY(lo)}
              y2={scaleY(lo)}
            />

            {/* Marcas de eje X */}
            {labels.map((lbl, i) => {
              if (labels.length > 8 && i % 2 !== 0) return null;
              return (
                <text
                  key={lbl}
                  x={scaleX(i)}
                  y={H - 6}
                  textAnchor="middle"
                >
                  {lbl}
                </text>
              );
            })}

            {/* Series */}
            {series.map((s, si) => {
              const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
              const validPts: [number, number, number][] = [];
              s.values.forEach((v, i) => {
                if (v != null) validPts.push([scaleX(i), scaleY(v), i]);
              });
              if (validPts.length === 0) return null;

              const cut = s.dashFrom != null ? s.dashFrom : validPts.length - 1;
              const solidPts = validPts.slice(0, cut + 1);
              const dashedPts = validPts.slice(cut);

              const lastPt = validPts[validPts.length - 1];

              return (
                <g key={s.name}>
                  {s.area && (
                    <path
                      d={
                        validPts
                          .map((p, i) => (i === 0 ? `M${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`))
                          .join(" ") +
                        ` L${lastPt[0]} ${scaleY(lo)} L${validPts[0][0]} ${scaleY(lo)} Z`
                      }
                      fill={color}
                      opacity={0.1}
                    />
                  )}

                  {solidPts.length >= 2 && (
                    <path
                      d={solidPts
                        .map((p, i) => (i === 0 ? `M${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`))
                        .join(" ")}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}

                  {dashedPts.length >= 2 && (
                    <path
                      d={dashedPts
                        .map((p, i) => (i === 0 ? `M${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`))
                        .join(" ")}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeDasharray="4 4"
                      opacity={0.65}
                    />
                  )}

                  <circle
                    cx={lastPt[0]}
                    cy={lastPt[1]}
                    r={4.5}
                    fill={color}
                    className="dot-ring"
                  />

                  {s.endLabel !== false && (
                    <text
                      className="lbl"
                      x={lastPt[0] + 9}
                      y={lastPt[1] + 4}
                    >
                      {s.endLabel ||
                        (yFmt
                          ? yFmt(s.values[s.values.length - 1]!)
                          : compact(s.values[s.values.length - 1]!))}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Crosshair interactivo */}
            {activeIdx != null && (
              <g>
                <line
                  className="gridline"
                  x1={scaleX(activeIdx)}
                  x2={scaleX(activeIdx)}
                  y1={pad.t}
                  y2={scaleY(lo)}
                  stroke="var(--ink-3)"
                  opacity={0.4}
                />
                {series.map((s, si) => {
                  const val = s.values[activeIdx];
                  if (val == null) return null;
                  const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
                  return (
                    <circle
                      key={s.name}
                      cx={scaleX(activeIdx)}
                      cy={scaleY(val)}
                      r={4.5}
                      fill={color}
                      className="dot-ring"
                    />
                  );
                })}
              </g>
            )}

            {/* Áreas de captura para interacción */}
            {labels.map((lbl, i) => {
              const half = (W - pad.l - pad.r) / (labels.length - 1 || 1) / 2;
              return (
                <rect
                  key={lbl}
                  className="hit"
                  x={scaleX(i) - half}
                  y={pad.t}
                  width={half * 2}
                  height={scaleY(lo) - pad.t}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx(null)}
                />
              );
            })}
          </svg>

          {/* Tooltip */}
          {activeIdx != null && (
            <div
              className="tip"
              style={{
                opacity: 1,
                left: `${(scaleX(activeIdx) / W) * 100}%`,
                top: `${pad.t}px`,
              }}
            >
              <span className="tip-k">{labels[activeIdx]}</span>
              {series.map((s) => {
                const val = s.values[activeIdx];
                if (val == null) return null;
                return (
                  <div key={s.name}>
                    <strong>{yFmt ? yFmt(val) : compact(val)}</strong> · {s.name}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Leyenda obligatoria con 2+ series */}
      {series.length >= 2 && (
        <div className="legend">
          {series.map((s, si) => {
            const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
            return (
              <div key={s.name} className="legend-item">
                <span className="swatch line" style={{ background: color }} />
                <span>{s.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 2. BarsH Component (Barras Horizontales / Embudo)
// -------------------------------------------------------------
export interface BarHItem {
  label: string;
  value: number;
  display?: string;
  note?: string;
  tipNote?: string;
  color?: string;
}

export interface BarsHProps {
  data: BarHItem[];
  color?: string;
  ariaLabel?: string;
  tableTitle?: string;
}

export function BarsH({
  data,
  color = "var(--s1)",
  ariaLabel = "Barras horizontales",
  tableTitle = "Datos del embudo",
}: BarsHProps) {
  const [showTable, setShowTable] = useState(false);
  const W = 560;
  const rowH = 34;
  const barH = Math.min(22, rowH - 12);
  const H = data.length * rowH + 6;
  const padL = 150;
  const padR = 62;
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div>
      <div className="row-between mb-2">
        <span className="card-note">{tableTitle}</span>
        <button
          type="button"
          className="btn btn-ghost tiny"
          onClick={() => setShowTable(!showTable)}
        >
          {showTable ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>

      {showTable ? (
        <table>
          <thead>
            <tr>
              <th>Etapa</th>
              <th className="n">Cantidad</th>
              <th>Variación / Nota</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td className="strong">{d.label}</td>
                <td className="n">{d.display || fmt(d.value)}</td>
                <td className="muted">{d.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
          {data.map((d, i) => {
            const y = i * rowH + 4;
            const w = Math.max(0, (W - padL - padR) * (d.value / maxValue));
            const c = d.color || color;

            return (
              <g key={d.label}>
                <text
                  x={padL - 12}
                  y={y + barH / 2 + 4}
                  textAnchor="end"
                  fill="var(--ink-2)"
                  fontSize="11.5"
                >
                  {d.label}
                </text>

                <rect
                  x={padL}
                  y={y}
                  width={W - padL - padR}
                  height={barH}
                  rx={4}
                  fill="var(--grid)"
                  opacity={0.55}
                />

                <path d={barPath(padL, y, w, barH, 4, "right")} fill={c} />

                <text className="lbl tick" x={padL + w + 9} y={y + barH / 2 + 4}>
                  {d.display || compact(d.value)}
                </text>

                {d.note && (
                  <text
                    x={W - 4}
                    y={y + barH / 2 + 4}
                    textAnchor="end"
                    fill="var(--ink-3)"
                    fontSize="10.5"
                  >
                    {d.note}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 3. BarsV Component (Columnas Verticales Agrupadas)
// -------------------------------------------------------------
export interface BarsVSeries {
  name: string;
  values: number[];
  color?: string;
}

export interface BarsVProps {
  labels: string[];
  series: BarsVSeries[];
  height?: number;
  ariaLabel?: string;
  tableTitle?: string;
}

export function BarsV({
  labels,
  series,
  height = 200,
  ariaLabel = "Columnas agrupadas",
  tableTitle = "Comparativa por nivel",
}: BarsVProps) {
  const [showTable, setShowTable] = useState(false);
  const W = 560;
  const H = height;
  const pad = { t: 12, r: 8, b: 26, l: 40 };

  const allVals = series.flatMap((s) => s.values);
  const max = Math.max(...allVals, 1);

  const ticksCount = 3;
  const rawStep = max / ticksCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const norm = rawStep / (mag || 1);
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * (mag || 1);
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6));
  const hi = Math.max(max, ticks[ticks.length - 1] ?? max);

  const scaleY = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / (hi || 1));
  const band = (W - pad.l - pad.r) / labels.length;
  const GAP = 2; // Separación exacta de 2px según spec
  const bw = Math.min(24, (band * 0.62 - GAP * (series.length - 1)) / series.length);

  return (
    <div>
      <div className="row-between mb-2">
        <span className="card-note">{tableTitle}</span>
        <button
          type="button"
          className="btn btn-ghost tiny"
          onClick={() => setShowTable(!showTable)}
        >
          {showTable ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>

      {showTable ? (
        <table>
          <thead>
            <tr>
              <th>Nivel</th>
              {series.map((s) => (
                <th key={s.name} className="n">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((lbl, i) => (
              <tr key={lbl}>
                <td className="strong">{lbl}</td>
                {series.map((s) => (
                  <td key={s.name} className="n">
                    {s.values[i]}%
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                className="gridline"
                x1={pad.l}
                x2={W - pad.r}
                y1={scaleY(t)}
                y2={scaleY(t)}
              />
              <text className="tick" x={pad.l - 8} y={scaleY(t) + 3.5} textAnchor="end">
                {compact(t)}
              </text>
            </g>
          ))}

          {labels.map((l, i) => {
            const groupW = bw * series.length + GAP * (series.length - 1);
            const x0 = pad.l + band * i + (band - groupW) / 2;

            return (
              <g key={l}>
                {series.map((s, si) => {
                  const x = x0 + si * (bw + GAP);
                  const y = scaleY(s.values[i]);
                  const h = scaleY(0) - y;
                  const c = s.color || SERIES_COLORS[si % SERIES_COLORS.length];

                  return <path key={s.name} d={barPath(x, y, bw, h, 4, "up")} fill={c} />;
                })}
                <text x={pad.l + band * i + band / 2} y={H - 8} textAnchor="middle">
                  {l}
                </text>
              </g>
            );
          })}
          <line
            className="axis-line"
            x1={pad.l}
            x2={W - pad.r}
            y1={scaleY(0)}
            y2={scaleY(0)}
          />
        </svg>
      )}

      {series.length >= 2 && (
        <div className="legend">
          {series.map((s, si) => {
            const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
            return (
              <div key={s.name} className="legend-item">
                <span className="swatch" style={{ background: color }} />
                <span>{s.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 4. Cartogram Component (Cartograma Esquemático de Barrios)
// -------------------------------------------------------------
export interface CartoCell {
  label: string;
  value: number;
  display?: string;
  note?: string;
}

export interface CartogramProps {
  cells: CartoCell[];
  cols?: number;
  size?: number;
  tableTitle?: string;
}

export function Cartogram({
  cells,
  cols = 5,
  size = 72,
  tableTitle = "Distribución por barrio",
}: CartogramProps) {
  const [showTable, setShowTable] = useState(false);
  const gap = 5;
  const rows = Math.ceil(cells.length / cols);
  const W = cols * (size + gap);
  const H = rows * (size + gap);
  const max = Math.max(...cells.map((c) => c.value), 1);

  return (
    <div>
      <div className="row-between mb-2">
        <span className="card-note">{tableTitle}</span>
        <button
          type="button"
          className="btn btn-ghost tiny"
          onClick={() => setShowTable(!showTable)}
        >
          {showTable ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>

      {showTable ? (
        <table>
          <thead>
            <tr>
              <th>Barrio</th>
              <th className="n">Casos</th>
              <th>Detalle territorial</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => (
              <tr key={c.label}>
                <td className="strong">{c.label}</td>
                <td className="n">{c.display || c.value}</td>
                <td className="muted">{c.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg
          className="chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Cartograma de barrios"
        >
          {cells.map((c, i) => {
            const x = (i % cols) * (size + gap);
            const y = Math.floor(i / cols) * (size + gap);
            const rampIdx = Math.min(
              RAMP_COLORS.length - 1,
              Math.floor((c.value / max) * (RAMP_COLORS.length - 1) + 0.001)
            );
            const fill = RAMP_COLORS[rampIdx];
            const maxCh = Math.floor((size - 12) / 4.9);
            const truncatedLabel =
              c.label.length > maxCh ? c.label.slice(0, maxCh - 1) + "…" : c.label;

            return (
              <g key={c.label}>
                <rect
                  className="carto-cell"
                  x={x}
                  y={y}
                  width={size}
                  height={size}
                  rx={6}
                  fill={fill}
                />
                <text
                  className="carto-lbl"
                  x={x + 7}
                  y={y + 15}
                  fill={rampIdx >= 4 ? "rgba(251,250,247,.85)" : "rgba(20,26,31,.65)"}
                >
                  {truncatedLabel}
                </text>
                <text
                  x={x + 7}
                  y={y + size - 11}
                  fill={rampIdx >= 4 ? "#FBFAF7" : "#141A1F"}
                  fontSize="19"
                  fontWeight="600"
                  className="num"
                >
                  {c.display || c.value}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 5. Sparkline Component
// -------------------------------------------------------------
export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  accent?: string;
}

export function Sparkline({
  values,
  width = 110,
  height = 30,
  color = "var(--ink-3)",
  accent = "var(--accent)",
}: SparklineProps) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const W = width;
  const H = height;

  const X = (i: number) => 2 + (W - 4) * (i / (values.length - 1));
  const Y = (v: number) => 4 + (H - 8) * (1 - (v - min) / (max - min || 1));

  const n = values.length;
  const pathD = values
    .map((v, i) => (i === 0 ? `M${X(i)} ${Y(v)}` : `L${X(i)} ${Y(v)}`))
    .join(" ");

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: `${W}px`, height: `${H}px` }}
      aria-hidden="true"
    >
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      />
      <path
        d={`M${X(n - 2)} ${Y(values[n - 2])} L${X(n - 1)} ${Y(values[n - 1])}`}
        fill="none"
        stroke={accent}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle
        cx={X(n - 1)}
        cy={Y(values[n - 1])}
        r={2.6}
        fill={accent}
      />
    </svg>
  );
}

// -------------------------------------------------------------
// 6. ProgressRing Component (Portal del Estudiante)
// -------------------------------------------------------------
export interface ProgressRingProps {
  percentage: number;
  size?: number;
  color?: string;
}

export function ProgressRing({
  percentage,
  size = 84,
  color = "var(--s3)",
}: ProgressRingProps) {
  const S = size;
  const r = S / 2 - 7;
  const C = 2 * Math.PI * r;
  const dashoffset = C - (C * Math.min(100, Math.max(0, percentage))) / 100;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${S} ${S}`}
      width={S}
      height={S}
      role="img"
      aria-label={`${percentage}% completado`}
    >
      <circle
        cx={S / 2}
        cy={S / 2}
        r={r}
        fill="none"
        stroke="var(--q1)"
        strokeWidth={7}
      />
      <circle
        cx={S / 2}
        cy={S / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={dashoffset}
        transform={`rotate(-90 ${S / 2} ${S / 2})`}
      />
      <text
        x={S / 2}
        y={S / 2 + 6}
        textAnchor="middle"
        fill="var(--ink-1)"
        fontSize="19"
        fontWeight="600"
      >
        {percentage}%
      </text>
    </svg>
  );
}