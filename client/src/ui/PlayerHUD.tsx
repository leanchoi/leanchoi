/**
 * Overlay del HUD.
 *
 * Es HTML puro sobre el canvas: no cuesta un draw call y se lee nítido en
 * cualquier resolución, que es justo lo que necesita una interfaz pixel-art.
 *
 *   arriba a la derecha → clima + hora real de Esquel, y el contador al comicio
 *   arriba al centro    → dónde estás parado, en criollo
 *   abajo a la izquierda→ salud, energía, XP, guita, reputación, rango y facción
 *   F3                  → diagnóstico del motor
 */

import './hud.css';
import { DiagnosticsPanel } from './widgets/DiagnosticsPanel.tsx';
import { ElectionWidget } from './widgets/ElectionWidget.tsx';
import { StatsWidget } from './widgets/StatsWidget.tsx';
import { WeatherClockWidget } from './widgets/WeatherClockWidget.tsx';
import { useGameStore } from '../state/gameStore.ts';

export const PlayerHUD = (): JSX.Element => {
  const location = useGameStore((s) => s.location);

  return (
    <div className="hud-root">
      <div className="hud-topcenter">{location}</div>

      <div className="hud-topright">
        <WeatherClockWidget />
        <ElectionWidget />
      </div>

      <div className="hud-bottomleft">
        <StatsWidget />
      </div>

      <div className="hud-bottomright">
        WASD mover · SHIFT correr · ESPACIO saltar
        <br />
        arrastrar para girar · rueda para acercar · C cámara · F3 datos
      </div>

      <DiagnosticsPanel />
    </div>
  );
};
