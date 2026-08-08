/** Matrices de calor: categoría × período, y cobertura del relevamiento. */

import { Grafico, LeyendaRampa, RAMPA_SEQ, SinDatos, pasoRampa, useTooltip } from './base';

export interface CeldaMatriz {
  fila: string;
  columna: string | number;
  valor: number | null;
  /** Texto adicional en el tooltip (n de muestra, si es publicable, etc.). */
  detalle?: Array<{ etiqueta: string; valor: string }>;
}

export function MatrizCalor({
  celdas,
  filas,
  columnas,
  etiquetaFila,
  etiquetaColumna,
  formatoValor,
  onClickFila,
  onClickColumna,
  filasSeleccionadas = [],
  columnasSeleccionadas = [],
  altoFila = 26,
  recargando,
  etiqueta,
  rampa = RAMPA_SEQ,
  tituloRampa,
  dominio,
  anchoEtiqueta = 148,
}: {
  celdas: CeldaMatriz[];
  filas: string[];
  columnas: Array<string | number>;
  etiquetaFila: (f: string) => string;
  etiquetaColumna: (c: string | number) => string;
  formatoValor: (v: number | null) => string;
  onClickFila?: (f: string) => void;
  onClickColumna?: (c: string | number) => void;
  filasSeleccionadas?: string[];
  columnasSeleccionadas?: Array<string | number>;
  altoFila?: number;
  recargando?: boolean;
  etiqueta: string;
  rampa?: string[];
  tituloRampa?: string;
  dominio?: [number, number];
  anchoEtiqueta?: number;
}) {
  const { mostrar, ocultar } = useTooltip();
  if (!filas.length || !columnas.length) return <SinDatos />;

  const mapa = new Map<string, CeldaMatriz>();
  for (const c of celdas) mapa.set(`${c.fila}|${c.columna}`, c);

  const validos = celdas
    .map((c) => c.valor)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const min = dominio?.[0] ?? (validos.length ? Math.min(...validos) : 0);
  const max = dominio?.[1] ?? (validos.length ? Math.max(...validos) : 1);
  const rango = max - min || 1;

  const arriba = 22;
  const alto = filas.length * altoFila + arriba + 8;
  const hayFocoFila = filasSeleccionadas.length > 0;

  return (
    <>
      <Grafico alto={alto} recargando={recargando} etiqueta={etiqueta}>
        {({ ancho }) => {
          const w = Math.max(0, ancho - anchoEtiqueta - 8);
          const anchoCol = w / columnas.length;

          return (
            <svg width={ancho} height={alto}>
              <g className="eje">
                {columnas.map((c, i) => (
                  <text
                    key={String(c)}
                    x={anchoEtiqueta + i * anchoCol + anchoCol / 2}
                    y={13}
                    textAnchor="middle"
                    className={
                      columnasSeleccionadas.includes(c) ? 'col-seleccionada' : undefined
                    }
                    onClick={() => onClickColumna?.(c)}
                    style={{ cursor: onClickColumna ? 'pointer' : undefined }}
                  >
                    {etiquetaColumna(c)}
                  </text>
                ))}
              </g>

              {filas.map((f, fi) => {
                const selFila = filasSeleccionadas.includes(f);
                const atenuada = hayFocoFila && !selFila;
                return (
                  <g key={f} className={atenuada ? 'atenuada' : undefined}>
                    <text
                      className="etiqueta-fila"
                      x={anchoEtiqueta - 10}
                      y={arriba + fi * altoFila + altoFila / 2}
                      dy="0.32em"
                      textAnchor="end"
                      onClick={() => onClickFila?.(f)}
                      style={{ cursor: onClickFila ? 'pointer' : undefined }}
                    >
                      {etiquetaFila(f)}
                    </text>
                    {columnas.map((c, ci) => {
                      const celda = mapa.get(`${f}|${c}`);
                      const v = celda?.valor ?? null;
                      const norm = v === null ? null : (v - min) / rango;
                      const relleno = v === null ? 'var(--superficie-2)' : pasoRampa(norm, rampa)!;
                      return (
                        <rect
                          key={String(c)}
                          className={`celda-matriz${v === null ? ' vacia' : ''}`}
                          x={anchoEtiqueta + ci * anchoCol + 1}
                          y={arriba + fi * altoFila + 1}
                          width={Math.max(1, anchoCol - 2)}
                          height={altoFila - 2}
                          rx={2}
                          fill={relleno}
                          onClick={() => onClickFila?.(f)}
                          onMouseMove={(e) =>
                            mostrar(
                              {
                                titulo: etiquetaFila(f),
                                subtitulo: etiquetaColumna(c),
                                filas: [
                                  { etiqueta: 'Valor', valor: formatoValor(v) },
                                  ...(celda?.detalle ?? []).map((d) => ({
                                    etiqueta: d.etiqueta,
                                    valor: d.valor,
                                    tenue: true,
                                  })),
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
            </svg>
          );
        }}
      </Grafico>
      <LeyendaRampa
        pasos={rampa}
        min={min}
        max={max}
        formato={(v) => formatoValor(v)}
        titulo={tituloRampa}
      />
    </>
  );
}

// ==========================================================================
// Matriz de cobertura: una celda por (categoría, día)
// ==========================================================================
export interface CeldaCobertura {
  fila: string;
  indice: number;
  estado: 'publicable' | 'con_dato' | 'sin_dato';
  detalle: Array<{ etiqueta: string; valor: string }>;
  titulo: string;
}

const COLOR_COBERTURA: Record<CeldaCobertura['estado'], string> = {
  // Estado, no serie: verde = publicable, ámbar = hay dato pero no alcanza,
  // superficie = no hubo relevamiento. Siempre con leyenda rotulada.
  publicable: 'var(--estado-bien)',
  con_dato: 'var(--estado-aviso)',
  sin_dato: 'var(--superficie-2)',
};

export function MatrizCobertura({
  celdas,
  filas,
  totalColumnas,
  etiquetaFila,
  etiquetaColumna,
  onClickFila,
  filasSeleccionadas = [],
  altoFila = 22,
  recargando,
  etiqueta,
  anchoEtiqueta = 148,
  marcasColumna,
}: {
  celdas: CeldaCobertura[];
  filas: string[];
  totalColumnas: number;
  etiquetaFila: (f: string) => string;
  etiquetaColumna: (i: number) => string;
  onClickFila?: (f: string) => void;
  filasSeleccionadas?: string[];
  altoFila?: number;
  recargando?: boolean;
  etiqueta: string;
  anchoEtiqueta?: number;
  /** Marcas de referencia sobre el eje superior (inicios de mes). */
  marcasColumna?: Array<{ indice: number; texto: string }>;
}) {
  const { mostrar, ocultar } = useTooltip();
  if (!filas.length || !totalColumnas) return <SinDatos />;

  const mapa = new Map<string, CeldaCobertura>();
  for (const c of celdas) mapa.set(`${c.fila}|${c.indice}`, c);

  const arriba = 18;
  const alto = filas.length * altoFila + arriba + 8;
  const hayFoco = filasSeleccionadas.length > 0;

  return (
    <>
      <Grafico alto={alto} recargando={recargando} etiqueta={etiqueta}>
        {({ ancho }) => {
          const w = Math.max(0, ancho - anchoEtiqueta - 8);
          const anchoCol = w / totalColumnas;

          return (
            <svg width={ancho} height={alto}>
              <g className="eje">
                {marcasColumna?.map((m) => (
                  <text key={m.indice} x={anchoEtiqueta + m.indice * anchoCol} y={11} textAnchor="start">
                    {m.texto}
                  </text>
                ))}
              </g>

              {filas.map((f, fi) => {
                const atenuada = hayFoco && !filasSeleccionadas.includes(f);
                return (
                  <g key={f} className={atenuada ? 'atenuada' : undefined}>
                    <text
                      className="etiqueta-fila"
                      x={anchoEtiqueta - 10}
                      y={arriba + fi * altoFila + altoFila / 2}
                      dy="0.32em"
                      textAnchor="end"
                      onClick={() => onClickFila?.(f)}
                      style={{ cursor: onClickFila ? 'pointer' : undefined }}
                    >
                      {etiquetaFila(f)}
                    </text>
                    {Array.from({ length: totalColumnas }, (_, ci) => {
                      const celda = mapa.get(`${f}|${ci}`);
                      const estado = celda?.estado ?? 'sin_dato';
                      return (
                        <rect
                          key={ci}
                          className="celda-cobertura"
                          x={anchoEtiqueta + ci * anchoCol}
                          y={arriba + fi * altoFila + 1}
                          width={Math.max(0.6, anchoCol - 0.6)}
                          height={altoFila - 2}
                          fill={COLOR_COBERTURA[estado]}
                          onMouseMove={(e) =>
                            mostrar(
                              {
                                titulo: etiquetaFila(f),
                                subtitulo: celda?.titulo ?? etiquetaColumna(ci),
                                filas: celda
                                  ? celda.detalle
                                  : [{ etiqueta: 'Estado', valor: 'Sin relevamiento' }],
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
            </svg>
          );
        }}
      </Grafico>
      <div className="leyenda">
        <span className="leyenda-item">
          <span className="marca marca-cuadro" style={{ background: COLOR_COBERTURA.publicable }} />
          Publicable (alcanza el mínimo)
        </span>
        <span className="leyenda-item">
          <span className="marca marca-cuadro" style={{ background: COLOR_COBERTURA.con_dato }} />
          Con dato, por debajo del mínimo
        </span>
        <span className="leyenda-item">
          <span className="marca marca-cuadro marca-borde" style={{ background: COLOR_COBERTURA.sin_dato }} />
          Sin relevamiento
        </span>
      </div>
    </>
  );
}
