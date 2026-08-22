/**
 * Mapa de calor de Esquel.
 *
 * Cada barrio es una celda del mapa, plantada donde está en el mundo: el Centro
 * al medio, el Badén al oeste, Villa Ayelén arriba a la derecha. No es una
 * proyección cartográfica, es la grilla del juego — y como el juego está
 * georreferenciado, se parece bastante al pueblo.
 *
 * Tres capas de información en la misma celda:
 *  · **Color** — la facción que domina (identidad, tono fijo por facción).
 *  · **Intensidad del borde** — la militancia (magnitud, un solo tono).
 *  · **Etiqueta** — el nombre y el número, siempre. El color nunca es lo único
 *    que dice de quién es la celda: con daltonismo severo el par más parecido
 *    del set queda justo en el piso, así que la etiqueta no es decorativa.
 *
 * Un barrio sin gente suficiente se dibuja rayado y dice cuántos faltan. No se
 * pinta de un color inventado ni se deja en blanco sin explicación.
 */

import { useState } from 'react';
import { BARRIO_BY_ID, type Barrio, type BarrioHeat } from '@esquel/shared';
import { SURFACE, factionColor, factionShortName, militancyColor, moodColor } from './palette.ts';

interface Props {
  readonly barrios: readonly BarrioHeat[];
  readonly kAnonMin: number;
  /** Qué pinta la celda: quién domina o cuánto se milita. */
  readonly modo: 'dominancia' | 'militancia' | 'humor';
}

/** Celda del mapa en coordenadas de grilla del dibujo. */
interface Celda {
  readonly barrio: Barrio;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Traduce el rectángulo de manzanas de cada barrio a la grilla del dibujo.
 * El mundo va de −12 a 12 en las dos direcciones; el norte queda arriba, que es
 * al revés del eje Z, por eso la fila se invierte.
 */
const CELDAS: readonly Celda[] = Object.values(BARRIO_BY_ID)
  .filter((b) => b.id !== 'otro')
  .map((b) => {
    const [minCol, minRow, maxCol, maxRow] = b.cells;
    return {
      barrio: b.id,
      x: minCol + 12,
      y: 12 - maxRow,
      w: maxCol - minCol + 1,
      h: maxRow - minRow + 1,
    };
  });

const CELDA_PX = 13;
const PADDING = 2;

/**
 * El lienzo se recorta a lo que ocupan los barrios.
 *
 * La grilla del mundo va de −12 a 12 en las dos direcciones, pero los barrios no
 * llenan las esquinas: dibujar los 25×25 dejaba media pantalla vacía y empujaba
 * el mapa abajo del pliegue.
 */
const LIMITES = CELDAS.reduce(
  (acc, c) => ({
    x0: Math.min(acc.x0, c.x),
    y0: Math.min(acc.y0, c.y),
    x1: Math.max(acc.x1, c.x + c.w),
    y1: Math.max(acc.y1, c.y + c.h),
  }),
  { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
);

export const HeatMap = ({ barrios, kAnonMin, modo }: Props): JSX.Element => {
  const [encima, setEncima] = useState<BarrioHeat | null>(null);
  const porBarrio = new Map(barrios.map((b) => [b.barrio, b]));

  const ancho = (LIMITES.x1 - LIMITES.x0) * CELDA_PX;
  const alto = (LIMITES.y1 - LIMITES.y0) * CELDA_PX;

  const relleno = (heat: BarrioHeat | undefined): string => {
    if (!heat || !heat.publishable) return 'url(#sinDatos)';
    if (modo === 'militancia') return militancyColor(heat.militancy);
    if (modo === 'humor') return moodColor(heat.mood);
    return factionColor(heat.dominantFaction);
  };

  const valor = (heat: BarrioHeat | undefined): string => {
    if (!heat || !heat.publishable) return `faltan ${Math.max(0, kAnonMin - (heat?.subjects ?? 0))}`;
    if (modo === 'militancia') return `${Math.round(heat.militancy * 100)}%`;
    if (modo === 'humor') return heat.mood > 0 ? `+${heat.mood.toFixed(2)}` : heat.mood.toFixed(2);
    return factionShortName(heat.dominantFaction);
  };

  return (
    <figure className="admin-figure">
      <figcaption className="admin-figure__title">
        {modo === 'dominancia' ? 'Quién manda en cada barrio' : modo === 'militancia' ? 'Dónde se milita' : 'Cómo está el humor'}
      </figcaption>

      <div className="admin-heat">
        <svg
          viewBox={`${LIMITES.x0 * CELDA_PX} ${LIMITES.y0 * CELDA_PX} ${ancho} ${alto}`}
          role="img"
          aria-label="Mapa de calor de Esquel por barrio"
          className="admin-heat__svg"
        >
          <defs>
            {/* Rayado para lo que no llega al umbral: se ve que hay algo y que no se puede decir. */}
            <pattern id="sinDatos" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#1a1d24" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#2f343d" strokeWidth="2" />
            </pattern>
          </defs>

          {CELDAS.map((celda) => {
            const heat = porBarrio.get(celda.barrio);
            const def = BARRIO_BY_ID[celda.barrio];
            const x = celda.x * CELDA_PX + PADDING;
            const y = celda.y * CELDA_PX + PADDING;
            const w = celda.w * CELDA_PX - PADDING * 2;
            const h = celda.h * CELDA_PX - PADDING * 2;
            const activo = encima?.barrio === celda.barrio;

            return (
              <g
                key={celda.barrio}
                onMouseEnter={() => setEncima(heat ?? null)}
                onMouseLeave={() => setEncima(null)}
                className="admin-heat__cell"
              >
                {/* El anillo del color de la superficie separa celdas vecinas. */}
                <rect x={x} y={y} width={w} height={h} rx={3} fill={relleno(heat)} stroke={SURFACE} strokeWidth={2} />
                {activo ? <rect x={x} y={y} width={w} height={h} rx={3} fill="none" stroke="#f2b441" strokeWidth={2} /> : null}
                <text x={x + w / 2} y={y + h / 2 - 3} textAnchor="middle" className="admin-heat__label">
                  {def.name}
                </text>
                <text x={x + w / 2} y={y + h / 2 + 10} textAnchor="middle" className="admin-heat__value">
                  {valor(heat)}
                </text>
              </g>
            );
          })}
        </svg>

        <aside className="admin-heat__detail" aria-live="polite">
          {encima ? (
            <>
              <h4>{BARRIO_BY_ID[encima.barrio].name}</h4>
              {encima.publishable ? (
                <dl>
                  <div>
                    <dt>Domina</dt>
                    <dd>
                      <span className="admin-swatch" style={{ background: factionColor(encima.dominantFaction) }} aria-hidden />
                      {factionShortName(encima.dominantFaction)} · +{Math.round(encima.dominanceMargin * 100)} pts
                    </dd>
                  </div>
                  <div>
                    <dt>Militancia</dt>
                    <dd>{Math.round(encima.militancy * 100)}% del barrio más movido</dd>
                  </div>
                  <div>
                    <dt>Humor</dt>
                    <dd>{encima.mood > 0 ? `+${encima.mood.toFixed(2)}` : encima.mood.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Muestra</dt>
                    <dd>{encima.subjects} vecinos distintos</dd>
                  </div>
                </dl>
              ) : (
                <p className="admin-heat__hueco">
                  Sólo {encima.subjects} vecinos distintos. Hacen falta {kAnonMin} para publicar algo de este barrio.
                </p>
              )}
            </>
          ) : (
            <p className="admin-heat__hueco">Pasá el mouse por un barrio.</p>
          )}
        </aside>
      </div>

      <div className="admin-legend">
        {modo === 'dominancia' ? (
          [1, 2, 3, 4, 5].map((id) => (
            <span key={id} className="admin-legend__item">
              <span className="admin-swatch" style={{ background: factionColor(id) }} aria-hidden />
              {factionShortName(id)}
            </span>
          ))
        ) : modo === 'militancia' ? (
          <>
            <span className="admin-legend__item">poca</span>
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <span key={v} className="admin-swatch" style={{ background: militancyColor(v) }} aria-hidden />
            ))}
            <span className="admin-legend__item">mucha</span>
          </>
        ) : (
          <>
            <span className="admin-legend__item">bronca</span>
            {[-1, -0.5, 0, 0.5, 1].map((v) => (
              <span key={v} className="admin-swatch" style={{ background: moodColor(v) }} aria-hidden />
            ))}
            <span className="admin-legend__item">contentos</span>
          </>
        )}
        <span className="admin-legend__item admin-legend__item--muted">
          <span className="admin-swatch admin-swatch--rayado" aria-hidden /> sin muestra suficiente
        </span>
      </div>
    </figure>
  );
};
