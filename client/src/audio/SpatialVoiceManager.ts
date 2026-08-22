/**
 * Chat de voz por proximidad.
 *
 * El audio va **directo entre navegadores** (WebRTC): el VPS sólo hace de datero
 * para pasar ofertas, respuestas y candidatos ICE. Nadie escucha por el medio y
 * el servidor no gasta ancho de banda en audio.
 *
 * Lo que hace especial a la voz de Esquel 2027 es el espacio: cada vecino suena
 * desde donde está parado. Un `PannerNode` por par, con la posición del avatar en
 * el mundo y la orientación de la cámara como oído, da la sensación de la vereda:
 * el que te habla desde atrás suena atrás, y el que cruza la calle se va yendo.
 *
 * Detalles que importan en la práctica:
 *  · `echoCancellation`, `noiseSuppression` y `autoGainControl` prendidos: sin eso,
 *    dos personas en la misma pieza generan un acople insoportable.
 *  · Detección de voz (VAD) local con histéresis: el indicador de "está hablando"
 *    no titila con cada respiración.
 *  · Chrome no reproduce un `MediaStream` que sólo pasa por Web Audio: hay que
 *    anclarlo además a un `<audio>` silenciado. Es un bug viejo y conocido.
 */

import { Vector3 } from 'three';
import { VOICE } from '@esquel/shared';
import type { VoicePeer } from '../net/NetworkClient.ts';

export type MicState = 'apagado' | 'pidiendo' | 'encendido' | 'silenciado' | 'denegado';

export interface VoiceHandlers {
  /** Manda un paquete de señalización por el WebSocket del juego. */
  signal(to: string, kind: 'offer' | 'answer' | 'ice', payload: string): void;
  /** Avisa cuando el jugador empieza o deja de hablar (para el HUD y el servidor). */
  onSpeaking?(speaking: boolean): void;
  /** Cambios de estado del micrófono, para el HUD. */
  onMicState?(state: MicState): void;
  /** Se conectó o se cortó un par. */
  onPeersChanged?(count: number): void;
}

interface PeerConnection {
  readonly sessionId: string;
  readonly pc: RTCPeerConnection;
  /** Elemento ancla: Chrome no reproduce el stream sin esto. */
  readonly sink: HTMLAudioElement;
  source: MediaStreamAudioSourceNode | null;
  panner: PannerNode | null;
  gain: GainNode | null;
  /** Ganancia sugerida por el servidor; se usa si no hay posición del avatar. */
  serverGain: number;
  serverPan: number;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

/** Umbral de detección de voz y tiempos de histéresis. */
const VAD_ATTACK_MS = 90;
const VAD_RELEASE_MS = 420;

export class SpatialVoiceManager {
  private handlers: VoiceHandlers;
  private context: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuffer = new Float32Array(new ArrayBuffer(1024 * 4));
  private readonly peers = new Map<string, PeerConnection>();
  private state: MicState = 'apagado';
  private speaking = false;
  private aboveSince = 0;
  private belowSince = 0;
  private readonly tmp = new Vector3();

  constructor(handlers: VoiceHandlers) {
    this.handlers = handlers;
  }

  get micState(): MicState {
    return this.state;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  get peerCount(): number {
    return this.peers.size;
  }

  private setState(state: MicState): void {
    this.state = state;
    this.handlers.onMicState?.(state);
  }

  /**
   * Pide el micrófono y arma el contexto de audio.
   * Devuelve `false` si el vecino dijo que no (y el juego sigue igual, con chat).
   */
  async enable(): Promise<boolean> {
    if (this.state === 'encendido') return true;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.setState('denegado');
      return false;
    }

    this.setState('pidiendo');
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
    } catch (err) {
      console.warn('[voz] no se concedió el micrófono:', err);
      this.setState('denegado');
      return false;
    }

    this.context ??= new AudioContext({ latencyHint: 'interactive' });
    if (this.context.state === 'suspended') await this.context.resume();

    // Analizador para la detección de voz local.
    this.micSource = this.context.createMediaStreamSource(this.micStream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    this.analyserBuffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.micSource.connect(this.analyser);
    // El analizador no va a los parlantes: nadie quiere escucharse a sí mismo.

    this.setState('encendido');
    return true;
  }

  /** Corta el micrófono y todas las conexiones. */
  disable(): void {
    for (const sessionId of [...this.peers.keys()]) this.closePeer(sessionId);
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
    this.micSource?.disconnect();
    this.micSource = null;
    this.analyser = null;
    this.speaking = false;
    this.setState('apagado');
    this.handlers.onSpeaking?.(false);
  }

  /** Silencia sin cortar: las conexiones quedan abiertas y se retoma al instante. */
  toggleMute(): MicState {
    if (!this.micStream) return this.state;
    const muted = this.state !== 'silenciado';
    for (const track of this.micStream.getAudioTracks()) track.enabled = !muted;
    this.setState(muted ? 'silenciado' : 'encendido');
    if (muted && this.speaking) {
      this.speaking = false;
      this.handlers.onSpeaking?.(false);
    }
    return this.state;
  }

  /**
   * Aplica la malla que calculó el servidor: abre los pares nuevos y cierra los
   * que quedaron fuera de rango.
   */
  applyPeers(peers: readonly VoicePeer[], closed: readonly string[]): void {
    for (const sessionId of closed) this.closePeer(sessionId);

    for (const peer of peers) {
      const existing = this.peers.get(peer.sessionId);
      if (existing) {
        existing.serverGain = peer.gain;
        existing.serverPan = peer.pan;
        continue;
      }
      void this.openPeer(peer);
    }

    this.handlers.onPeersChanged?.(this.peers.size);
  }

  private async openPeer(peer: VoicePeer): Promise<void> {
    if (!this.context || !this.micStream) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const sink = document.createElement('audio');
    sink.autoplay = true;
    sink.muted = true; // el sonido sale por Web Audio, no por el elemento
    sink.style.display = 'none';
    document.body.appendChild(sink);

    const entry: PeerConnection = {
      sessionId: peer.sessionId,
      pc,
      sink,
      source: null,
      panner: null,
      gain: null,
      serverGain: peer.gain,
      serverPan: peer.pan,
    };
    this.peers.set(peer.sessionId, entry);

    for (const track of this.micStream.getAudioTracks()) pc.addTrack(track, this.micStream);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.handlers.signal(peer.sessionId, 'ice', JSON.stringify(event.candidate.toJSON()));
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream || !this.context) return;
      entry.sink.srcObject = stream;

      const source = this.context.createMediaStreamSource(stream);
      const panner = this.context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = VOICE.FULL_VOLUME_M;
      panner.maxDistance = VOICE.MAX_RANGE_M;
      panner.rolloffFactor = VOICE.ROLLOFF_EXP;
      // Cono amplio: hablar de espaldas se escucha, apenas más apagado.
      panner.coneInnerAngle = 200;
      panner.coneOuterAngle = 330;
      panner.coneOuterGain = 0.55;

      const gain = this.context.createGain();
      gain.gain.value = entry.serverGain;

      source.connect(panner);
      panner.connect(gain);
      gain.connect(this.context.destination);

      entry.source = source;
      entry.panner = panner;
      entry.gain = gain;
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(peer.sessionId);
      }
    };

    // Sólo ofrece el de sessionId menor: así no se cruzan dos ofertas.
    if (peer.initiator) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      this.handlers.signal(peer.sessionId, 'offer', JSON.stringify(offer));
    }
  }

  /** Procesa la señalización que reenvió el servidor. */
  async handleSignal(from: string, kind: 'offer' | 'answer' | 'ice', payload: string): Promise<void> {
    let entry = this.peers.get(from);

    // Puede llegar una oferta antes que la lista de pares: se abre el par al vuelo.
    if (!entry && kind === 'offer') {
      await this.openPeer({ sessionId: from, charId: '', distanceM: 0, gain: 1, pan: 0, initiator: false });
      entry = this.peers.get(from);
    }
    if (!entry) return;

    try {
      if (kind === 'offer') {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(payload) as RTCSessionDescriptionInit));
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        this.handlers.signal(from, 'answer', JSON.stringify(answer));
      } else if (kind === 'answer') {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(payload) as RTCSessionDescriptionInit));
      } else {
        await entry.pc.addIceCandidate(new RTCIceCandidate(JSON.parse(payload) as RTCIceCandidateInit));
      }
    } catch (err) {
      console.warn(`[voz] señalización con ${from} falló (${kind}):`, err);
    }
  }

  private closePeer(sessionId: string): void {
    const entry = this.peers.get(sessionId);
    if (!entry) return;
    entry.source?.disconnect();
    entry.panner?.disconnect();
    entry.gain?.disconnect();
    entry.sink.srcObject = null;
    entry.sink.remove();
    entry.pc.onicecandidate = null;
    entry.pc.ontrack = null;
    entry.pc.close();
    this.peers.delete(sessionId);
    this.handlers.onPeersChanged?.(this.peers.size);
  }

  /**
   * Actualiza el oído y la posición de cada voz. Se llama una vez por cuadro con
   * la cámara y una función que devuelve dónde está cada vecino.
   */
  updateSpatial(
    listenerPosition: { x: number; y: number; z: number },
    listenerForward: { x: number; y: number; z: number },
    positionOf: (sessionId: string) => { x: number; y: number; z: number } | undefined,
  ): void {
    if (!this.context) return;
    const listener = this.context.listener;
    const t = this.context.currentTime;

    // La API nueva usa AudioParam; la vieja, setPosition/setOrientation.
    if (listener.positionX) {
      listener.positionX.setValueAtTime(listenerPosition.x, t);
      listener.positionY.setValueAtTime(listenerPosition.y + 1.7, t);
      listener.positionZ.setValueAtTime(listenerPosition.z, t);
      listener.forwardX.setValueAtTime(listenerForward.x, t);
      listener.forwardY.setValueAtTime(0, t);
      listener.forwardZ.setValueAtTime(listenerForward.z, t);
      listener.upX.setValueAtTime(0, t);
      listener.upY.setValueAtTime(1, t);
      listener.upZ.setValueAtTime(0, t);
    } else {
      listener.setPosition?.(listenerPosition.x, listenerPosition.y + 1.7, listenerPosition.z);
      listener.setOrientation?.(listenerForward.x, 0, listenerForward.z, 0, 1, 0);
    }

    for (const entry of this.peers.values()) {
      if (!entry.panner) continue;
      const position = positionOf(entry.sessionId);
      if (position) {
        if (entry.panner.positionX) {
          entry.panner.positionX.setValueAtTime(position.x, t);
          entry.panner.positionY.setValueAtTime(position.y + 1.7, t);
          entry.panner.positionZ.setValueAtTime(position.z, t);
        } else {
          entry.panner.setPosition?.(position.x, position.y + 1.7, position.z);
        }
        if (entry.gain) entry.gain.gain.value = 1;
      } else if (entry.gain) {
        // Sin avatar en escena (todavía no llegó su paquete): se usa la ganancia
        // que calculó el servidor, que ya tiene en cuenta la distancia.
        this.tmp.set(listenerPosition.x, listenerPosition.y, listenerPosition.z);
        entry.gain.gain.value = entry.serverGain;
      }
    }
  }

  /** Detección de voz local. Se llama una vez por cuadro. */
  pollVoiceActivity(): void {
    if (!this.analyser || this.state === 'silenciado') return;
    this.analyser.getFloatTimeDomainData(this.analyserBuffer);

    let sum = 0;
    for (let i = 0; i < this.analyserBuffer.length; i++) {
      const sample = this.analyserBuffer[i] as number;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / this.analyserBuffer.length);
    const db = 20 * Math.log10(Math.max(rms, 1e-8));
    const now = performance.now();

    if (db > VOICE.VAD_THRESHOLD_DB) {
      this.belowSince = 0;
      if (this.aboveSince === 0) this.aboveSince = now;
      if (!this.speaking && now - this.aboveSince > VAD_ATTACK_MS) {
        this.speaking = true;
        this.handlers.onSpeaking?.(true);
      }
    } else {
      this.aboveSince = 0;
      if (this.belowSince === 0) this.belowSince = now;
      if (this.speaking && now - this.belowSince > VAD_RELEASE_MS) {
        this.speaking = false;
        this.handlers.onSpeaking?.(false);
      }
    }
  }

  dispose(): void {
    this.disable();
    void this.context?.close();
    this.context = null;
  }
}
