/**
 * Zonas en disputa.
 *
 * Cinco puntos del pueblo se pelean todo el tiempo: la Plaza, la explanada de
 * la Muni, la estación de La Trochita, Alvear y 25 y el acceso de La Zeta. Este
 * panel muestra quién tiene cada una, cuánto le falta al que está aguantando y
 * el multiplicador que gana tu facción por bancar la esquina.
 */

import { Landmark } from 'lucide-react';
import { TERRITORY } from '@esquel/shared';
import { factionCssColor } from '../../entities/AvatarBuilder.ts';
import { useGameStore } from '../../state/gameStore.ts';

export const ZoneBanner = (): JSX.Element | null => {
  const zones = useGameStore((s) => s.zones);
  const buff = useGameStore((s) => s.territoryBuff);
  const miFaccion = useGameStore((s) => s.player.factionId);

  if (zones.length === 0) return null;

  return (
    <div className="hud-panel zones" aria-label="Zonas en disputa">
      <div className="zones__head">
        <Landmark size={13} strokeWidth={2.5} aria-hidden />
        <span>La calle</span>
        {buff.zones > 0 ? <span className="zones__buff">{buff.zones} bajo control</span> : null}
      </div>

      <ul className="zones__list">
        {zones.map((zone) => {
          const propia = zone.controlledBy !== 0 && zone.controlledBy === miFaccion;
          const aguantando = zone.holdSeconds > 0 && zone.holdSeconds < TERRITORY.CAPTURE_HOLD_S;
          const falta = Math.max(0, Math.ceil((TERRITORY.CAPTURE_HOLD_S - zone.holdSeconds) / 60));
          return (
            <li key={zone.id} className={`zones__row${propia ? ' is-mine' : ''}`}>
              <span className="zones__dot" style={{ background: factionCssColor(zone.controlledBy) }} aria-hidden />
              <span className="zones__name">{zone.name}</span>
              <span className="zones__share">
                {aguantando ? `aguantando · ${falta} min` : `${Math.round(zone.leadShare * 100)}%`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
