/**
 * Señalización WebRTC para el chat de voz por proximidad.
 *
 * El audio **nunca** pasa por el servidor: es P2P entre navegadores. Lo que hace
 * el VPS es de datero: decirle a cada uno con quién tiene que abrir una conexión
 * (los que están a menos de 25 metros, que es la distancia a la que se escucha
 * una charla en la vereda) y reenviar las ofertas, respuestas y candidatos ICE
 * por el WebSocket que ya está abierto. Cero infraestructura extra.
 *
 * Reglas de la malla:
 *  · Se abre par cuando dos jugadores entran en rango, y se cierra al salir, con
 *    histéresis para que caminar en el borde no genere un abrir-cerrar constante.
 *  · Tope de pares simultáneos: por encima de eso se priorizan los más cercanos.
 *    En una movilización de 30 personas no se abren 30 conexiones: se abren las 8
 *    más cercanas y el resto es murmullo.
 *  · Quien tiene el `sessionId` menor inicia la oferta, para no cruzar ofertas.
 *  · Un jugador silenciado por moderación deja de ser retransmitido: sus paquetes
 *    de señalización se descartan en el borde.
 */

import { VOICE } from '@esquel/shared';

export interface VoicePeerInfo {
  readonly sessionId: string;
  readonly charId: string;
  readonly distanceM: number;
  /** Ganancia sugerida [0,1]; el cliente la aplica a su `GainNode`. */
  readonly gain: number;
  /** Paneo estéreo [-1,1] según el ángulo relativo. */
  readonly pan: number;
  /** El cliente debe iniciar la oferta SDP. */
  readonly initiator: boolean;
}

export interface VoiceParticipant {
  readonly sessionId: string;
  readonly charId: string;
  readonly x: number;
  readonly z: number;
  /** Rumbo del cuerpo, para el paneo estéreo. */
  readonly yaw: number;
  readonly voiceEnabled: boolean;
  readonly muted: boolean;
  /** Radio efectivo: el megáfono lo amplía. */
  readonly rangeM: number;
}

export type SignalKind = 'offer' | 'answer' | 'ice';

export interface SignalPacket {
  readonly to: string;
  readonly kind: SignalKind;
  readonly payload: string;
}

/** Histéresis: se abre a 25 m y recién se cierra a 30 m. */
const CLOSE_FACTOR = 1.2;
/** Tamaño máximo de un SDP/candidato aceptado, en bytes. */
const MAX_PAYLOAD_BYTES = 16_384;

export interface PeerDiff {
  /** Pares que hay que abrir o refrescar. */
  readonly peers: VoicePeerInfo[];
  /** Pares que hay que cerrar. */
  readonly closed: string[];
}

export class VoiceSignaling {
  /** Pares abiertos por sesión. */
  private readonly open = new Map<string, Set<string>>();
  private readonly rangeM: number;

  constructor(rangeM: number = VOICE.MAX_RANGE_M) {
    this.rangeM = rangeM;
  }

  /** Volumen por distancia: caída exponencial, igual que en el cliente. */
  static gainFor(distanceM: number, rangeM: number): number {
    if (distanceM <= VOICE.FULL_VOLUME_M) return 1;
    if (distanceM >= rangeM) return 0;
    const t = (distanceM - VOICE.FULL_VOLUME_M) / (rangeM - VOICE.FULL_VOLUME_M);
    return Number(Math.pow(1 - t, VOICE.ROLLOFF_EXP).toFixed(4));
  }

  /** Paneo estéreo: -1 a la izquierda, +1 a la derecha del oyente. */
  static panFor(listener: VoiceParticipant, speaker: VoiceParticipant): number {
    const dx = speaker.x - listener.x;
    const dz = speaker.z - listener.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.5) return 0;
    // Ángulo del hablante respecto de hacia dónde mira el oyente.
    const angle = Math.atan2(dx, dz) - listener.yaw;
    return Number(Math.max(-1, Math.min(1, Math.sin(angle))).toFixed(3));
  }

  /**
   * Recalcula con quién tiene que estar conectado un jugador.
   * Devuelve los pares a abrir/refrescar y los que hay que cerrar.
   */
  computePeers(listener: VoiceParticipant, candidates: readonly VoiceParticipant[]): PeerDiff {
    const current = this.open.get(listener.sessionId) ?? new Set<string>();

    if (!listener.voiceEnabled || listener.muted) {
      const closed = [...current];
      this.open.set(listener.sessionId, new Set());
      return { peers: [], closed };
    }

    const inRange: VoicePeerInfo[] = [];
    for (const other of candidates) {
      if (other.sessionId === listener.sessionId) continue;
      if (!other.voiceEnabled || other.muted) continue;

      const distance = Math.hypot(other.x - listener.x, other.z - listener.z);
      // El rango efectivo es el mayor de los dos: con megáfono se escucha de lejos.
      const effective = Math.max(listener.rangeM, other.rangeM, this.rangeM);
      const alreadyOpen = current.has(other.sessionId);
      const limit = alreadyOpen ? effective * CLOSE_FACTOR : effective;
      if (distance > limit) continue;

      inRange.push({
        sessionId: other.sessionId,
        charId: other.charId,
        distanceM: Number(distance.toFixed(2)),
        gain: VoiceSignaling.gainFor(distance, effective),
        pan: VoiceSignaling.panFor(listener, other),
        // El de sessionId menor ofrece: así no se cruzan dos ofertas.
        initiator: listener.sessionId < other.sessionId,
      });
    }

    // Si hay multitud, quedan los más cercanos.
    inRange.sort((a, b) => a.distanceM - b.distanceM);
    const peers = inRange.slice(0, VOICE.MESH_PEER_LIMIT);

    const next = new Set(peers.map((p) => p.sessionId));
    const closed = [...current].filter((id) => !next.has(id));
    this.open.set(listener.sessionId, next);

    return { peers, closed };
  }

  /**
   * Valida un paquete de señalización antes de reenviarlo.
   *
   * Sólo se reenvía entre pares que el servidor abrió: nadie puede mandarle una
   * oferta a alguien que está a diez cuadras para espiarlo.
   */
  canRelay(from: string, to: string, payload: string): { ok: true } | { ok: false; reason: string } {
    if (from === to) return { ok: false, reason: 'No se puede señalizar contra uno mismo.' };
    if (typeof payload !== 'string' || payload.length === 0) {
      return { ok: false, reason: 'Payload vacío.' };
    }
    if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      return { ok: false, reason: 'Payload de señalización demasiado grande.' };
    }
    if (!this.open.get(from)?.has(to)) {
      return { ok: false, reason: 'Ese par no está abierto: fuera de rango de voz.' };
    }
    return { ok: true };
  }

  /** Pares abiertos de una sesión. */
  peersOf(sessionId: string): readonly string[] {
    return [...(this.open.get(sessionId) ?? [])];
  }

  /** Saca a alguien de la malla (se fue, lo silenciaron, apagó el micrófono). */
  remove(sessionId: string): string[] {
    const affected: string[] = [];
    for (const [id, peers] of this.open) {
      if (peers.delete(sessionId)) affected.push(id);
    }
    this.open.delete(sessionId);
    return affected;
  }

  clear(): void {
    this.open.clear();
  }

  /** Cantidad de conexiones P2P abiertas en el shard (métrica de diagnóstico). */
  get openPairs(): number {
    let total = 0;
    for (const peers of this.open.values()) total += peers.size;
    return Math.floor(total / 2);
  }
}
