/**
 * Instancia compartida del chat de voz.
 *
 * Vive fuera de React porque la usan dos lugares a la vez: la escena 3D (que
 * actualiza el oído y la posición de cada voz cada cuadro) y el HUD (el botón
 * del micrófono). Acá se la cablea con la red y con el store.
 */

import { SpatialVoiceManager } from './SpatialVoiceManager.ts';
import { networkClient } from '../net/NetworkClient.ts';
import { useGameStore } from '../state/gameStore.ts';

export const spatialVoice = new SpatialVoiceManager({
  signal: (to, kind, payload) => networkClient.sendVoiceSignal(to, kind, payload),

  onSpeaking: (speaking) => {
    useGameStore.getState().setNet({ speaking });
    // El servidor lo replica a los vecinos para las ondas sobre la cabeza.
    networkClient.setSpeaking(speaking);
  },

  onMicState: (micState) => {
    useGameStore.getState().setNet({ micState });
    if (micState === 'encendido') networkClient.setVoiceEnabled(true);
    if (micState === 'apagado' || micState === 'denegado') networkClient.setVoiceEnabled(false);
  },

  onPeersChanged: (voicePeers) => useGameStore.getState().setNet({ voicePeers }),
});

/** Prende el micrófono (pide permiso la primera vez). */
export const habilitarVoz = async (): Promise<void> => {
  const ok = await spatialVoice.enable();
  if (!ok) {
    useGameStore.getState().pushChat({
      nick: 'Esquel',
      text: 'Sin micrófono no hay voz, pero el chat de texto anda igual.',
      channel: 'sistema',
      at: Date.now(),
    });
  }
};

/** Silencia o vuelve a abrir. */
export const alternarSilencio = (): void => {
  spatialVoice.toggleMute();
};
