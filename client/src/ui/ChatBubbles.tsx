/**
 * Chat de texto: burbujas flotantes sobre los avatares y la caja para escribir.
 *
 * Las burbujas son HTML posicionado sobre el canvas, no geometría 3D: se leen
 * nítidas en cualquier resolución y no cuestan un draw call. La escena proyecta
 * las posiciones a coordenadas de pantalla 15 veces por segundo y este componente
 * sólo las pinta.
 *
 * ENTER abre la caja, ENTER manda, ESC cancela. Mientras está abierta, el
 * teclado deja de mover al personaje (si no, escribís "wasabi" y salís corriendo).
 */

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../state/gameStore.ts';
import { networkClient } from '../net/NetworkClient.ts';

const CANALES = [
  { id: 'local', label: 'Esquina', hint: 'te escuchan a 25 metros' },
  { id: 'faccion', label: 'Bando', hint: 'sólo tu facción' },
  { id: 'global', label: 'General', hint: 'toda la ciudad · de Subsecretario para arriba' },
] as const;

type Canal = (typeof CANALES)[number]['id'];

export const ChatBubbles = (): JSX.Element => {
  const overlays = useGameStore((s) => s.overlays);
  const chatLog = useGameStore((s) => s.chatLog);
  const chatOpen = useGameStore((s) => s.chatOpen);
  const setChatOpen = useGameStore((s) => s.setChatOpen);
  const connected = useGameStore((s) => s.net.status === 'conectado');
  const [texto, setTexto] = useState('');
  const [canal, setCanal] = useState<Canal>('local');
  const inputRef = useRef<HTMLInputElement>(null);

  // El foco se pide cuando React ya montó el input, no en un setTimeout(0):
  // con render concurrente, el ref todavía puede estar vacío en ese momento.
  useEffect(() => {
    if (chatOpen) inputRef.current?.focus();
  }, [chatOpen]);

  // ENTER abre la caja desde cualquier lado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const escribiendo = document.activeElement instanceof HTMLInputElement;
      if (e.code === 'Enter' && !escribiendo && connected) {
        e.preventDefault();
        setChatOpen(true);
      }
      if (e.code === 'Escape' && escribiendo) {
        setChatOpen(false);
        setTexto('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connected, setChatOpen]);

  const enviar = (): void => {
    const limpio = texto.trim();
    if (limpio.length > 0) networkClient.sendChat(limpio, canal);
    setTexto('');
    setChatOpen(false);
    inputRef.current?.blur();
  };

  const recientes = chatLog.slice(-6);

  return (
    <>
      {/* Burbujas sobre las cabezas */}
      <div className="chat-bubbles" aria-hidden>
        {overlays
          .filter((o) => o.chatText)
          .map((o) => (
            <div
              key={`bubble-${o.sessionId}`}
              className="chat-bubble"
              style={{
                left: `${o.screenX}px`,
                top: `${o.screenY - 34}px`,
                borderColor: o.color,
                opacity: Math.max(0.35, 1 - o.distanceM / 60),
              }}
            >
              {o.chatText}
            </div>
          ))}
      </div>

      {/* Últimos mensajes */}
      {recientes.length > 0 ? (
        <div className="chat-log" aria-label="Chat reciente">
          {recientes.map((entry) => (
            <div key={entry.id} className={`chat-log__line chat-log__line--${entry.channel}`}>
              <span className="chat-log__nick">{entry.nick}</span>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Caja de escritura */}
      {chatOpen ? (
        <div className="chat-input">
          <div className="chat-input__canales">
            {CANALES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chat-input__canal${canal === c.id ? ' is-active' : ''}`}
                onClick={() => setCanal(c.id)}
                title={c.hint}
              >
                {c.label}
              </button>
            ))}
          </div>
          <input
            ref={inputRef}
            autoFocus
            value={texto}
            maxLength={180}
            placeholder="Decí algo…"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                enviar();
              }
            }}
            onBlur={() => setChatOpen(false)}
          />
        </div>
      ) : connected ? (
        <div className="chat-hint">ENTER para hablar</div>
      ) : null}
    </>
  );
};
