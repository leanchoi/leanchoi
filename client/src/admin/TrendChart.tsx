/**
 * Tendencia de intención de voto.
 *
 * Una línea por lista a lo largo de la ventana. Es el gráfico que contesta la
 * única pregunta que un candidato hace de verdad: «¿voy para arriba o para
 * abajo?». Por eso la etiqueta va al final de cada línea, pegada al último
 * punto: se lee el nombre donde está mirando el ojo, sin ir y volver a una
 * leyenda.
 *
 * Un solo eje. Nunca dos escalas: si algo no entra en el mismo eje, es otro
 * gráfico.
 */

import { useMemo, useState } from 'react';
import type { DashboardSnapshot } from '@esquel/shared';
import { SURFACE, factionColor, factionShortName } from './palette.ts';

interface Props {
  readonly trend: DashboardSnapshot['trend'];
}

const ANCHO = 640;
const ALTO = 240;
const M = { top: 14, right: 74, bottom: 26, left: 38 };

export const TrendChart = ({ trend }: Props): JSX.Element => {
  const [dia, setDia] = useState<number | null>(null);

  const { series, maximo, dias } = useMemo(() => {
    const ids = new Set<number>();
    for (const punto of trend) for (const id of Object.keys(punto.byFaction)) ids.add(Number(id));

    const series = [...ids].sort((a, b) => a - b).map((id) => ({
      id,
      puntos: trend.map((p) => p.byFaction[id] ?? 0),
    }));
    const maximo = Math.max(0.35, ...series.flatMap((s) => s.puntos));
    return { series, maximo, dias: trend.map((p) => p.day) };
  }, [trend]);

  if (trend.length < 2) {
    return (
      <figure className="admin-figure">
        <figcaption className="admin-figure__title">Tendencia</figcaption>
        <p className="admin-vacio">
          Hace falta más de un día de datos para dibujar una tendencia. Con un solo corte no hay línea, hay un punto.
        </p>
      </figure>
    );
  }

  const px = (i: number): number => M.left + (i / Math.max(1, dias.length - 1)) * (ANCHO - M.left - M.right);
  const py = (v: number): number => M.top + (1 - v / maximo) * (ALTO - M.top - M.bottom);

  return (
    <figure className="admin-figure">
      <figcaption className="admin-figure__title">
        Tendencia de intención de voto
        <span className="admin-figure__sub">{dias.length} días · share diario sobre los que contestaron</span>
      </figcaption>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label="Tendencia diaria de intención de voto por lista"
        className="admin-trend"
        onMouseLeave={() => setDia(null)}
        onMouseMove={(e) => {
          const caja = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - caja.left) / caja.width) * ANCHO;
          const t = (x - M.left) / (ANCHO - M.left - M.right);
          setDia(Math.max(0, Math.min(dias.length - 1, Math.round(t * (dias.length - 1)))));
        }}
      >
        {/* Rejilla horizontal, recesiva. */}
        {[0.1, 0.2, 0.3, 0.4, 0.5].filter((t) => t <= maximo).map((t) => (
          <g key={t}>
            <line x1={M.left} y1={py(t)} x2={ANCHO - M.right} y2={py(t)} className="admin-trend__grid" />
            <text x={M.left - 6} y={py(t) + 4} textAnchor="end" className="admin-bars__tick">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}

        {/* Cruz del día bajo el mouse. */}
        {dia !== null ? <line x1={px(dia)} y1={M.top} x2={px(dia)} y2={ALTO - M.bottom} className="admin-trend__cross" /> : null}

        {series.map((serie) => {
          const d = serie.puntos.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
          const ultimo = serie.puntos[serie.puntos.length - 1] ?? 0;
          return (
            <g key={serie.id}>
              <path d={d} fill="none" stroke={factionColor(serie.id)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {dia !== null ? (
                <circle
                  cx={px(dia)}
                  cy={py(serie.puntos[dia] ?? 0)}
                  r={4.5}
                  fill={factionColor(serie.id)}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
              ) : null}
              {/* Etiqueta directa al final de la línea. */}
              <text x={ANCHO - M.right + 8} y={py(ultimo) + 4} className="admin-trend__label" fill={factionColor(serie.id)}>
                {factionShortName(serie.id)}
              </text>
            </g>
          );
        })}

        {/* Fechas: sólo la primera y la última, para no amontonar. */}
        <text x={M.left} y={ALTO - 6} className="admin-bars__tick">
          {dias[0]?.slice(5)}
        </text>
        <text x={ANCHO - M.right} y={ALTO - 6} textAnchor="end" className="admin-bars__tick">
          {dias[dias.length - 1]?.slice(5)}
        </text>
      </svg>

      {dia !== null ? (
        <div className="admin-trend__tooltip" aria-live="polite">
          <strong>{dias[dia]}</strong>
          {series.map((s) => (
            <span key={s.id}>
              <span className="admin-swatch" style={{ background: factionColor(s.id) }} aria-hidden />
              {factionShortName(s.id)} {((s.puntos[dia] ?? 0) * 100).toFixed(1)}%
            </span>
          ))}
          <span className="admin-trend__tooltip-undecided">
            indecisos {((trend[dia]?.undecided ?? 0) * 100).toFixed(1)}%
          </span>
        </div>
      ) : (
        <p className="admin-figure__hint">Pasá el mouse por el gráfico para ver el corte de cada día.</p>
      )}
    </figure>
  );
};
