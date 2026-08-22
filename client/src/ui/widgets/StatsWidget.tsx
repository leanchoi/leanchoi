/**
 * Stats del militante: salud, energía, guita, reputación, XP, rango y facción.
 *
 * La barra de XP muestra el progreso dentro del rango actual, calculado con la
 * misma función que usa el servidor para otorgarla (`rankProgress` de
 * `/shared/util/balance.ts`): el HUD nunca hace su propia cuenta.
 */

import { Coins, Heart, Star, TrendingUp, Zap } from 'lucide-react';
import { RANK_BY_LEVEL, rankProgress, xpToNextRank } from '@esquel/shared';
import { factionOf, formatMoney, useGameStore } from '../../state/gameStore.ts';

interface BarProps {
  readonly icon: JSX.Element;
  readonly value: number;
  readonly max: number;
  readonly color: string;
  readonly label: string;
  readonly text: string;
}

const Bar = ({ icon, value, max, color, label, text }: BarProps): JSX.Element => (
  <div className="stats-row" aria-label={label}>
    <span className="stats-row__label">{icon}</span>
    <span className="stats-row__bar">
      <span
        className="stats-row__fill"
        style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }}
      />
    </span>
    <span className="stats-row__value">{text}</span>
  </div>
);

export const StatsWidget = (): JSX.Element => {
  const player = useGameStore((s) => s.player);
  const rank = RANK_BY_LEVEL[player.rankLevel];
  const faction = factionOf(player.factionId);
  const progress = rankProgress(player.xp);
  const missing = xpToNextRank(player.xp);

  return (
    <div className="hud-panel stats-widget" aria-label="Estado del militante">
      <div className="stats-widget__identity">
        <span className="stats-widget__nick">{player.nick}</span>
        <span className="stats-widget__rank">{rank.name}</span>
        {faction ? (
          <span className="stats-widget__faction" style={{ color: faction.colorPrimary }}>
            {faction.shortName}
          </span>
        ) : (
          <span className="stats-widget__faction">INDEP</span>
        )}
      </div>

      <Bar
        icon={<Heart size={12} strokeWidth={2.5} aria-hidden />}
        value={player.health}
        max={player.healthMax}
        color="var(--hud-red)"
        label="Salud"
        text={`${player.health}/${player.healthMax}`}
      />
      <Bar
        icon={<Zap size={12} strokeWidth={2.5} aria-hidden />}
        value={player.stamina}
        max={player.staminaMax}
        color="var(--hud-green)"
        label="Energía"
        text={`${player.stamina}/${player.staminaMax}`}
      />
      <Bar
        icon={<TrendingUp size={12} strokeWidth={2.5} aria-hidden />}
        value={progress * 100}
        max={100}
        color="var(--hud-purple)"
        label="Experiencia"
        text={missing > 0 ? `${missing.toLocaleString('es-AR')} XP` : 'MÁX'}
      />

      <div className="stats-inline">
        <span className="stats-inline__item stats-inline__item--money">
          <Coins size={12} strokeWidth={2.5} aria-hidden /> {formatMoney(player.money)}
        </span>
        <span className="stats-inline__item stats-inline__item--rep">
          <Star size={12} strokeWidth={2.5} aria-hidden /> {player.reputation} rep
        </span>
        <span className="stats-inline__item stats-inline__item--xp">
          {player.xp.toLocaleString('es-AR')} XP
        </span>
      </div>
    </div>
  );
};
