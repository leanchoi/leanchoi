/**
 * Placas de nombre flotantes, estilo arcade: `[Rango] Alias (Facción)`.
 *
 * El color del borde es el de la facción, así que en una movilización se ve de
 * un vistazo quién es de qué bando. Las de lejos se van desvaneciendo para no
 * tapar la ciudad.
 */

import { useGameStore } from '../../state/gameStore.ts';

export const Nameplates = (): JSX.Element => {
  const overlays = useGameStore((s) => s.overlays);

  return (
    <div className="nameplates" aria-hidden>
      {overlays.map((o) => (
        <div
          key={`placa-${o.sessionId}`}
          className={`nameplate${o.speaking ? ' nameplate--habla' : ''}`}
          style={{
            left: `${o.screenX}px`,
            top: `${o.screenY}px`,
            color: o.color,
            opacity: Math.max(0.25, 1 - o.distanceM / 90),
          }}
        >
          {o.nameplate}
        </div>
      ))}
    </div>
  );
};
