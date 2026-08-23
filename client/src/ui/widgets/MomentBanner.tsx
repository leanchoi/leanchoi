/**
 * Cartel de los momentos grandes: el ascenso y la captura de una esquina.
 *
 * Los dos son el pago de una curva larga —el ascenso corona horas de militancia,
 * la captura corona cinco minutos de aguantar— y hasta ahora los dos llegaban
 * como una línea más del chat, entre un choripán y un ladrido. Un momento que se
 * pierde en el scroll no es un momento.
 *
 * Se muestra unos segundos y se va solo. No pide un click: el jugador está
 * jugando, no administrando notificaciones.
 */

import { useEffect, useState } from 'react';
import { Flag, TrendingUp } from 'lucide-react';
import { factionCssColor } from '../../entities/AvatarBuilder.ts';
import { useGameStore } from '../../state/gameStore.ts';

/** Cuánto queda en pantalla cada cartel. */
const ASCENSO_MS = 7_000;
const CAPTURA_MS = 5_000;

export const MomentBanner = (): JSX.Element | null => {
  const rankUp = useGameStore((s) => s.rankUp);
  const zoneFlip = useGameStore((s) => s.zoneFlip);
  const setRankUp = useGameStore((s) => s.setRankUp);
  const setZoneFlip = useGameStore((s) => s.setZoneFlip);
  const [saliendo, setSaliendo] = useState(false);

  // El ascenso gana: si los dos caen juntos, primero el que costó más.
  const momento = rankUp ? ('ascenso' as const) : zoneFlip ? ('captura' as const) : null;

  useEffect(() => {
    if (!momento) return;
    setSaliendo(false);
    const duracion = momento === 'ascenso' ? ASCENSO_MS : CAPTURA_MS;
    // La animación de salida arranca antes de que el cartel se borre.
    const fade = window.setTimeout(() => setSaliendo(true), duracion - 600);
    const limpiar = window.setTimeout(() => {
      if (momento === 'ascenso') setRankUp(null);
      else setZoneFlip(null);
    }, duracion);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(limpiar);
    };
  }, [momento, rankUp?.at, zoneFlip?.at, setRankUp, setZoneFlip]);

  if (!momento) return null;

  if (momento === 'ascenso' && rankUp) {
    return (
      <div className={`momento momento--ascenso${saliendo ? ' is-saliendo' : ''}`} role="status">
        <span className="momento__icono">
          <TrendingUp size={20} strokeWidth={2.5} aria-hidden />
        </span>
        <span className="momento__texto">
          <strong>{rankUp.rankName}</strong>
          <small>{rankUp.job}</small>
        </span>
      </div>
    );
  }

  if (momento === 'captura' && zoneFlip) {
    return (
      <div className={`momento momento--captura${saliendo ? ' is-saliendo' : ''}`} role="status">
        <span className="momento__icono" style={{ color: factionCssColor(zoneFlip.to) }}>
          <Flag size={20} strokeWidth={2.5} aria-hidden />
        </span>
        <span className="momento__texto">
          <strong>{zoneFlip.zoneName}</strong>
          <small>{zoneFlip.mine ? 'La esquina es de ustedes. A bancarla.' : 'Se la llevó el otro bando.'}</small>
        </span>
      </div>
    );
  }

  return null;
};
