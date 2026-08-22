/**
 * Proyección electoral 2027.
 *
 * Dos preguntas distintas, dos gráficos distintos:
 *  · **Intendencia** — barras horizontales con el share ponderado por padrón y
 *    su margen de error dibujado como bigote. Un número sin margen es una
 *    opinión disfrazada de dato.
 *  · **Concejo Deliberante** — las once bancas repartidas por D'Hondt, dibujadas
 *    como once cuadraditos. Un semicírculo quedaría más lindo y se leería peor:
 *    lo que importa es contar bancas, y contar cuadrados alineados es trivial.
 *
 * Cada barra lleva su etiqueta: el color identifica, el texto confirma.
 */

import type { ElectoralProjection } from '@esquel/shared';
import { CONCEJO_SEATS } from '@esquel/shared';
import { SURFACE, factionColor, factionName, factionShortName } from './palette.ts';

interface Props {
  readonly projection: ElectoralProjection;
  readonly kAnonMin: number;
}

const ANCHO = 560;
const FILA = 30;
const ETIQUETA = 62;

export const Projection = ({ projection, kAnonMin }: Props): JSX.Element => {
  const listas = projection.mayor;
  const alto = Math.max(1, listas.length) * FILA + 12;
  const escala = ANCHO - ETIQUETA - 70;
  const maximo = Math.max(0.35, ...listas.map((l) => l.share + l.moe));

  if (!projection.publishable || listas.length === 0) {
    return (
      <figure className="admin-figure">
        <figcaption className="admin-figure__title">Proyección electoral</figcaption>
        <p className="admin-vacio">
          La muestra todavía no alcanza: hay {projection.sampleSize} vecinos distintos y hacen falta {kAnonMin}.
          Cuando haya más gente jugando y contestando, esto se llena solo.
        </p>
      </figure>
    );
  }

  return (
    <figure className="admin-figure">
      <figcaption className="admin-figure__title">
        Intendencia · intención de voto ponderada por padrón
        <span className="admin-figure__sub">
          {projection.sampleSize} vecinos distintos · margen ±{Math.round((listas[0]?.moe ?? 0) * 100)} pts
        </span>
      </figcaption>

      <svg viewBox={`0 0 ${ANCHO} ${alto}`} role="img" aria-label="Intención de voto por lista" className="admin-bars">
        {/* Rejilla al 10%: recesiva, sólo para ubicar la escala. */}
        {[0.1, 0.2, 0.3, 0.4, 0.5].filter((t) => t <= maximo).map((t) => (
          <g key={t}>
            <line
              x1={ETIQUETA + (t / maximo) * escala}
              y1={4}
              x2={ETIQUETA + (t / maximo) * escala}
              y2={alto - 14}
              className="admin-bars__grid"
            />
            <text x={ETIQUETA + (t / maximo) * escala} y={alto - 3} textAnchor="middle" className="admin-bars__tick">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}

        {listas.map((lista, i) => {
          const y = i * FILA + 8;
          const ancho = (lista.share / maximo) * escala;
          const x0 = ETIQUETA;
          const errIzq = ((lista.share - lista.moe) / maximo) * escala;
          const errDer = ((lista.share + lista.moe) / maximo) * escala;

          return (
            <g key={lista.factionId}>
              <title>
                {factionName(lista.factionId)}: {(lista.share * 100).toFixed(1)}% ±{(lista.moe * 100).toFixed(1)} ·{' '}
                {lista.seats} banca{lista.seats === 1 ? '' : 's'}
              </title>
              <text x={ETIQUETA - 8} y={y + 15} textAnchor="end" className="admin-bars__name">
                {factionShortName(lista.factionId)}
              </text>

              {/* Barra: punta redondeada de 4 px, anclada en la línea del cero. */}
              <rect
                x={x0}
                y={y}
                width={Math.max(2, ancho)}
                height={FILA - 14}
                rx={4}
                fill={factionColor(lista.factionId)}
                stroke={SURFACE}
                strokeWidth={2}
              />

              {/* Bigote del margen de error. */}
              <line x1={x0 + errIzq} y1={y + (FILA - 14) / 2} x2={x0 + errDer} y2={y + (FILA - 14) / 2} className="admin-bars__moe" />
              <line x1={x0 + errIzq} y1={y + 3} x2={x0 + errIzq} y2={y + FILA - 17} className="admin-bars__moe" />
              <line x1={x0 + errDer} y1={y + 3} x2={x0 + errDer} y2={y + FILA - 17} className="admin-bars__moe" />

              {/* La etiqueta va después de lo que termine más a la derecha: la
                  barra o la punta del bigote. Si no, se pisan. */}
              <text x={x0 + Math.max(Math.max(2, ancho), errDer) + 10} y={y + 15} className="admin-bars__value">
                {(lista.share * 100).toFixed(1)}%
                <tspan className={lista.deltaPp >= 0 ? 'admin-delta admin-delta--up' : 'admin-delta admin-delta--down'}>
                  {' '}
                  {lista.deltaPp >= 0 ? '▲' : '▼'} {Math.abs(lista.deltaPp).toFixed(1)}
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption className="admin-figure__title admin-figure__title--second">
        Concejo Deliberante · {CONCEJO_SEATS} bancas por D&apos;Hondt, piso del 3%
      </figcaption>

      <div className="admin-seats" role="img" aria-label="Reparto de bancas del Concejo Deliberante">
        {projection.council.map((lista) => (
          <div key={lista.factionId} className="admin-seats__row">
            <span className="admin-seats__name">{factionShortName(lista.factionId)}</span>
            <span className="admin-seats__boxes">
              {Array.from({ length: lista.seats }, (_, i) => (
                <span key={i} className="admin-seats__box" style={{ background: factionColor(lista.factionId) }} />
              ))}
              {lista.seats === 0 ? <span className="admin-seats__none">sin bancas</span> : null}
            </span>
            <span className="admin-seats__count">{lista.seats}</span>
          </div>
        ))}
      </div>

      {/* Vista de tabla: la identidad nunca depende sólo del color. */}
      <details className="admin-tabla">
        <summary>Ver los números en tabla</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Lista</th>
              <th scope="col">Intención</th>
              <th scope="col">Margen</th>
              <th scope="col">Variación</th>
              <th scope="col">Bancas</th>
            </tr>
          </thead>
          <tbody>
            {listas.map((l) => (
              <tr key={l.factionId}>
                <th scope="row">{factionName(l.factionId)}</th>
                <td>{(l.share * 100).toFixed(1)}%</td>
                <td>±{(l.moe * 100).toFixed(1)}</td>
                <td>{l.deltaPp >= 0 ? '+' : ''}{l.deltaPp.toFixed(1)} pts</td>
                <td>{l.seats}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Indecisos / no vota</th>
              <td>{(projection.undecidedShare * 100).toFixed(1)}%</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </details>
    </figure>
  );
};
