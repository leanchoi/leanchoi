/**
 * Panel de carrera militante.
 *
 * Los diez escalones, de Chopanero a Candidato Provincial, con lo que ya tenés
 * en la mochila y lo que se desbloquea en el próximo. Contesta la única
 * pregunta que importa en el comité: qué falta para el ascenso.
 */

import { CAREER_TREE, careerLabel, type RankLevel } from '@esquel/shared';
import { careerProgressOf, nextUnlocks, promotionHint } from '../modes/CitizenMode.ts';
import { useGameStore } from '../state/gameStore.ts';
import { X } from 'lucide-react';

interface Props {
  readonly onClose: () => void;
}

export const CareerPanel = ({ onClose }: Props): JSX.Element => {
  const player = useGameStore((s) => s.player);
  const progreso = careerProgressOf({
    xp: player.xp,
    reputation: player.reputation,
    loyalty: 1,
    rankTier: player.rankLevel,
  });
  const proximos = nextUnlocks(progreso.level);

  return (
    <div className="campaign" role="dialog" aria-label="Carrera militante">
      <div className="campaign__panel campaign__panel--carrera">
        <header className="campaign__head">
          <h2>
            Carrera militante
            <small>{progreso.rank.name}</small>
          </h2>
          <button type="button" className="campaign__cerrar" onClick={onClose} aria-label="Cerrar">
            <X size={14} strokeWidth={3} />
          </button>
        </header>

        <p className="campaign__outcome">{promotionHint(progreso)}</p>

        <div className="carrera__barra" role="progressbar" aria-valuenow={Math.round(progreso.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.round(progreso.progress * 100)}%` }} />
        </div>

        <ol className="carrera__escalones">
          {CAREER_TREE.map((rango) => {
            const alcanzado = rango.level <= progreso.level;
            const actual = rango.level === progreso.level;
            return (
              <li
                key={rango.id}
                className={`carrera__escalon${alcanzado ? ' is-done' : ''}${actual ? ' is-current' : ''}`}
              >
                <span className="carrera__nivel">{rango.level}</span>
                <span className="carrera__nombre">{rango.name}</span>
                <span className="carrera__trabajo">{rango.job}</span>
              </li>
            );
          })}
        </ol>

        <div className="carrera__mochila">
          <div>
            <h3>En la mochila</h3>
            <p>{progreso.items.length > 0 ? progreso.items.map(careerLabel).join(' · ') : 'Nada todavía: a militar.'}</p>
          </div>
          <div>
            <h3>Se desbloquea arriba</h3>
            <p>
              {progreso.level >= (10 as RankLevel)
                ? 'Ya no hay escalón que subir.'
                : [...proximos.items, ...proximos.abilities].map(careerLabel).join(' · ')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
