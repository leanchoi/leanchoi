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
import { CampaignModal } from './CampaignModal.tsx';
import { CareerPanel } from './CareerPanel.tsx';
import { DebateModal } from './DebateModal.tsx';
import { QuestTracker } from './QuestTracker.tsx';
import { MomentBanner } from './widgets/MomentBanner.tsx';
import { ZoneBanner } from './widgets/ZoneBanner.tsx';
import { VoiceHUD } from './VoiceHUD.tsx';
import { alternarSilencio, habilitarVoz } from '../audio/voice.ts';
import { useGameStore } from '../state/gameStore.ts';
import { useState } from 'react';

const ESTADO_RED: Record<string, string> = {
  desconectado: 'Sin conexión',
  conectando: 'Conectando…',
  conectado: 'En línea',
  error: 'Error de conexión',
};

export const PlayerHUD = (): JSX.Element => {
  const location = useGameStore((s) => s.location);
  const net = useGameStore((s) => s.net);
  const prompt = useGameStore((s) => s.interactPrompt);
  const [pantalla, setPantalla] = useState<'ninguna' | 'campana' | 'carrera'>('ninguna');

  return (
    <div className="hud-root">
      <div className="hud-topcenter">{location}</div>

      <div className="hud-topright">
        <WeatherClockWidget />
        <ElectionWidget />
        <ZoneBanner />
        <VoiceHUD onEnable={() => void habilitarVoz()} onToggleMute={alternarSilencio} />
        <div className="net-badge">
          <span className={`net-badge__dot net-badge__dot--${net.status}`} />
          {ESTADO_RED[net.status] ?? net.status}
          {net.status === 'conectado' && net.shardName ? ` · ${net.shardName}` : ''}
        </div>
        <QuestTracker />
      </div>

      <div className="hud-bottomleft">
        <StatsWidget />
      </div>

      {prompt ? (
        <div className={`npc-prompt${prompt.urgent ? ' is-urgent' : ''}`} role="status">
          {prompt.hint}
        </div>
      ) : null}

      <div className="hud-modos">
        <button type="button" className="hud-modo" onClick={() => setPantalla('carrera')}>
          Carrera
        </button>
        <button type="button" className="hud-modo" onClick={() => setPantalla('campana')}>
          Modo Candidato
        </button>
      </div>

      <div className="hud-bottomright">
        WASD mover · SHIFT correr · ESPACIO saltar · E afiche · Q mate
        <br />
        F hablar · G encarar · ENTER chat · V micrófono · C cámara · F3 datos
      </div>

      <MomentBanner />
      <Nameplates />
      <ChatBubbles />
      <DebateModal />
      {pantalla === 'campana' ? <CampaignModal onClose={() => setPantalla('ninguna')} /> : null}
      {pantalla === 'carrera' ? <CareerPanel onClose={() => setPantalla('ninguna')} /> : null}
      <DiagnosticsPanel />
    </div>
  );
};
