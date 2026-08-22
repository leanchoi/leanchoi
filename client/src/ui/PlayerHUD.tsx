/**
 * Overlay del HUD.
 *
 * Es HTML puro sobre el canvas: no cuesta un draw call y se lee nítido en
 * cualquier resolución, que es justo lo que necesita una interfaz pixel-art.
 *
 *   arriba a la derecha  → clima y hora reales, contador al comicio, voz
 *   arriba al centro     → dónde estás parado, en criollo
 *   abajo a la izquierda → salud, energía, XP, guita, reputación, rango, facción
 *   sobre los avatares   → placa de nombre, burbuja de chat y ondas de voz
 *   F3                   → diagnóstico del motor
 */

import './hud.css';
import { DiagnosticsPanel } from './widgets/DiagnosticsPanel.tsx';
import { ElectionWidget } from './widgets/ElectionWidget.tsx';
import { Nameplates } from './widgets/Nameplates.tsx';
import { StatsWidget } from './widgets/StatsWidget.tsx';
import { WeatherClockWidget } from './widgets/WeatherClockWidget.tsx';
import { ChatBubbles } from './ChatBubbles.tsx';
import { VoiceHUD } from './VoiceHUD.tsx';
import { alternarSilencio, habilitarVoz } from '../audio/voice.ts';
import { useGameStore } from '../state/gameStore.ts';

const ESTADO_RED: Record<string, string> = {
  desconectado: 'Sin conexión',
  conectando: 'Conectando…',
  conectado: 'En línea',
  error: 'Error de conexión',
};

export const PlayerHUD = (): JSX.Element => {
  const location = useGameStore((s) => s.location);
  const net = useGameStore((s) => s.net);

  return (
    <div className="hud-root">
      <div className="hud-topcenter">{location}</div>

      <div className="hud-topright">
        <WeatherClockWidget />
        <ElectionWidget />
        <VoiceHUD onEnable={() => void habilitarVoz()} onToggleMute={alternarSilencio} />
        <div className="net-badge">
          <span className={`net-badge__dot net-badge__dot--${net.status}`} />
          {ESTADO_RED[net.status] ?? net.status}
          {net.status === 'conectado' && net.shardName ? ` · ${net.shardName}` : ''}
        </div>
      </div>

      <div className="hud-bottomleft">
        <StatsWidget />
      </div>

      <div className="hud-bottomright">
        WASD mover · SHIFT correr · ESPACIO saltar · E afiche · Q mate
        <br />
        ENTER chat · V micrófono · C cámara · F3 datos
      </div>

      <Nameplates />
      <ChatBubbles />
      <DiagnosticsPanel />
    </div>
  );
};
