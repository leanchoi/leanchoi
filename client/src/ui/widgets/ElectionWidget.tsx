/**
 * Widget de las Elecciones 2027.
 *
 * Todo el juego corre hacia esta fecha, así que el contador está siempre a la
 * vista: días, horas, minutos y segundos hasta que abran las urnas, con el badge
 * de la fase vigente y una barra que muestra cuánto queda de campaña.
 *
 * El contador late localmente cada segundo; la fase la manda el store (y, en la
 * Fase 2, el servidor autoritativo dentro de `WorldState.election`).
 */

import { useEffect, useState } from 'react';
import { Vote } from 'lucide-react';
import { electionCountdown, formatCountdown } from '@esquel/shared';
import { useGameStore } from '../../state/gameStore.ts';

export const ElectionWidget = (): JSX.Element => {
  const election = useGameStore((s) => s.election);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const countdown = electionCountdown(now, election.calendar);
  const progressPct = Math.round(election.progress * 100);

  return (
    <div className="hud-panel hud-panel--accent election-widget" aria-label="Cuenta regresiva electoral">
      <div className="election-widget__head">
        <Vote size={13} strokeWidth={2.5} aria-hidden />
        <span>Comicios 2027</span>
      </div>
      <div className="election-widget__count">{formatCountdown(countdown)}</div>
      <span className={`election-widget__badge badge--${election.phase}`}>{election.badge}</span>
      <div className="election-widget__bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${progressPct}%` }} />
      </div>
      <div className="election-widget__note">
        {election.calendar.estimated ? 'Fecha estimada · sujeta a convocatoria oficial' : 'Fecha oficial confirmada'}
      </div>
    </div>
  );
};
