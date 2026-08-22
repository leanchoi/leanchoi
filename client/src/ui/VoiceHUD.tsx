/**
 * Voz por proximidad: control del micrófono e indicador de quién está hablando.
 *
 * Sobre la cabeza de cada vecino que habla aparecen tres ondas en bloques, del
 * color de su facción. Es la señal que necesitás para saber de dónde viene la voz
 * antes de darte vuelta.
 *
 * El botón del micrófono tiene tres estados: apagado, encendido y silenciado.
 * La `V` los cicla sin sacar las manos del teclado.
 */

import { useEffect } from 'react';
import { Mic, MicOff, Radio, Users } from 'lucide-react';
import { useGameStore } from '../state/gameStore.ts';

export interface VoiceHUDProps {
  /** Prende el micrófono (pide permiso la primera vez). */
  readonly onEnable: () => void;
  /** Silencia o vuelve a abrir el micrófono. */
  readonly onToggleMute: () => void;
}

const ETIQUETAS: Record<string, string> = {
  apagado: 'Micrófono apagado',
  pidiendo: 'Pidiendo permiso…',
  encendido: 'Micrófono abierto',
  silenciado: 'Silenciado',
  denegado: 'Sin permiso de micrófono',
};

export const VoiceHUD = ({ onEnable, onToggleMute }: VoiceHUDProps): JSX.Element => {
  const net = useGameStore((s) => s.net);
  const overlays = useGameStore((s) => s.overlays);

  // V: prende el micrófono o alterna el silencio.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyV' || e.repeat) return;
      if (document.activeElement instanceof HTMLInputElement) return;
      if (useGameStore.getState().chatOpen) return;
      if (net.micState === 'apagado' || net.micState === 'denegado') onEnable();
      else onToggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [net.micState, onEnable, onToggleMute]);

  const activo = net.micState === 'encendido';
  const hablando = overlays.filter((o) => o.speaking);

  return (
    <>
      {/* Ondas sobre la cabeza de los que están hablando */}
      <div className="voice-indicators" aria-hidden>
        {hablando.map((o) => (
          <div
            key={`voz-${o.sessionId}`}
            className="voice-wave"
            style={{ left: `${o.screenX}px`, top: `${o.screenY - 58}px`, color: o.color }}
          >
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>

      {/* Control del micrófono */}
      <div className="hud-panel voice-panel" aria-label="Chat de voz">
        <button
          type="button"
          className={`voice-panel__mic${activo ? ' is-live' : ''}${net.speaking ? ' is-speaking' : ''}`}
          onClick={() => (net.micState === 'apagado' || net.micState === 'denegado' ? onEnable() : onToggleMute())}
          title={`${ETIQUETAS[net.micState] ?? ''} · tecla V`}
        >
          {activo || net.micState === 'silenciado' ? <Mic size={16} strokeWidth={2.5} /> : <MicOff size={16} strokeWidth={2.5} />}
        </button>

        <div className="voice-panel__info">
          <div className="voice-panel__state">{ETIQUETAS[net.micState] ?? net.micState}</div>
          <div className="voice-panel__meta">
            <Users size={11} strokeWidth={2.5} aria-hidden /> {net.voicePeers} en la vereda
            {net.status === 'conectado' ? (
              <>
                {' · '}
                <Radio size={11} strokeWidth={2.5} aria-hidden /> {net.population} en el shard
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};
