/**
 * Cliente de red: la conexión con el servidor autoritativo del VPS.
 *
 * Envuelve `colyseus.js` para que el resto del cliente no sepa de salas ni de
 * esquemas: le pasa intents y recibe eventos ya tipados.
 *
 * Dos canales, como en el servidor:
 *  · **estado replicado** → el padrón del shard (quién está, de qué facción, en
 *    qué manzana) y el mundo (reloj, clima, fase electoral).
 *  · **canal AOI** → las transformadas finas de los vecinos, 10 veces por
 *    segundo, sólo de los que están a menos de 4 manzanas.
 *
 * El movimiento se manda con *dead reckoning*: sólo cuando el jugador se movió
 * lo suficiente o pasó el tiempo máximo entre paquetes. Parado en una esquina no
 * gasta ancho de banda.
 */

import { Client, type Room } from 'colyseus.js';
import type { AvatarAnimation, Barrio } from '@esquel/shared';
import { C2S, S2C } from '@esquel/shared/protocol';

export interface RosterEntry {
  readonly sessionId: string;
  readonly alias: string;
  readonly factionId: number;
  readonly rankTier: number;
  readonly barrio: Barrio;
  readonly cellCol: number;
  readonly cellRow: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly anim: AvatarAnimation;
  readonly speaking: boolean;
  readonly voiceEnabled: boolean;
  readonly xp: number;
  readonly connected: boolean;
}

export interface AoiPlayer {
  readonly sessionId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly anim: AvatarAnimation;
  readonly voz: boolean;
}

export interface VoicePeer {
  readonly sessionId: string;
  readonly charId: string;
  readonly distanceM: number;
  readonly gain: number;
  readonly pan: number;
  readonly initiator: boolean;
}

export interface ChatMessage {
  readonly from: string;
  readonly nick: string;
  readonly text: string;
  readonly channel: 'local' | 'faccion' | 'global' | 'sistema';
  readonly at: number;
}

export interface WorldSnapshot {
  readonly localMinute: number;
  readonly phase: string;
  readonly weatherCondition: string;
  readonly temperatureC: number;
  readonly windKph: number;
  readonly snowCoverage: number;
  readonly cloudCover: number;
  readonly electionPhase: string;
  readonly electionBadge: string;
  readonly population: number;
  readonly shardName: string;
}

export interface NetworkHandlers {
  onWelcome?(data: { sessionId: string; spawn: { x: number; y: number; z: number }; aoiCells: number }): void;
  onAoi?(players: readonly AoiPlayer[], tick: number): void;
  onAoiLeave?(sessionIds: readonly string[]): void;
  onRoster?(roster: readonly RosterEntry[]): void;
  onWorld?(world: WorldSnapshot): void;
  onChat?(message: ChatMessage): void;
  onVoicePeers?(peers: readonly VoicePeer[], closed: readonly string[]): void;
  onVoiceSignal?(from: string, kind: 'offer' | 'answer' | 'ice', payload: string): void;
  onReconcile?(data: { position: { x: number; y: number; z: number }; reason: string }): void;
  onStatDelta?(data: { xp?: number; reputation?: number; reason: string }): void;
  onToast?(data: { kind: string; text: string; ttlMs: number }): void;
  onKick?(data: { reason: string; message: string }): void;
  onStatus?(status: NetworkStatus, detail?: string): void;
}

export type NetworkStatus = 'desconectado' | 'conectando' | 'conectado' | 'error';

/** Movimiento: se manda si se movió más de esto… */
const MOVE_EPSILON_M = 0.12;
/** …o si pasó este tiempo desde el último paquete (mantiene viva la posición). */
const MOVE_MAX_INTERVAL_MS = 250;
/** Tope de envíos por segundo, alineado con el rate limit del servidor. */
const MOVE_MIN_INTERVAL_MS = 50;

export class NetworkClient {
  private client: Client | null = null;
  private room: Room | null = null;
  private handlers: NetworkHandlers = {};
  private status: NetworkStatus = 'desconectado';
  private seq = 0;
  private lastSent = { x: 0, y: 0, z: 0, yaw: 0, anim: 'IDLE' as AvatarAnimation, at: 0 };
  private rosterCache: RosterEntry[] = [];
  private rosterDirty = false;

  get sessionId(): string {
    return this.room?.sessionId ?? '';
  }

  get connected(): boolean {
    return this.status === 'conectado';
  }

  get currentStatus(): NetworkStatus {
    return this.status;
  }

  get roster(): readonly RosterEntry[] {
    return this.rosterCache;
  }

  setHandlers(handlers: NetworkHandlers): void {
    this.handlers = handlers;
  }

  private setStatus(status: NetworkStatus, detail?: string): void {
    this.status = status;
    this.handlers.onStatus?.(status, detail);
  }

  /**
   * Se conecta a la sala de la ciudad con el token que emitió Hostinger.
   * Devuelve `false` si no se pudo (y el juego sigue andando en modo offline).
   */
  async connect(options: { endpoint: string; accessToken: string; spawn?: { x: number; z: number } }): Promise<boolean> {
    this.setStatus('conectando');
    try {
      this.client = new Client(options.endpoint);
      this.room = await this.client.joinOrCreate('esquel_city', {
        accessToken: options.accessToken,
        ...(options.spawn ? { spawn: options.spawn } : {}),
      });
      this.wire(this.room);
      this.setStatus('conectado');
      return true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn('[red] no se pudo entrar a la sala:', detail);
      this.setStatus('error', detail);
      return false;
    }
  }

  private wire(room: Room): void {
    room.onMessage(S2C.WELCOME, (data: { sessionId: string; spawn: { x: number; y: number; z: number }; aoiCells: number }) => {
      this.handlers.onWelcome?.(data);
    });

    room.onMessage(S2C.AOI, (data: { players: AoiPlayer[]; tick: number }) => {
      this.handlers.onAoi?.(data.players, data.tick);
    });

    room.onMessage('s2c.aoi.leave', (data: { sessionIds: string[] }) => {
      this.handlers.onAoiLeave?.(data.sessionIds);
    });

    room.onMessage(S2C.CHAT, (message: ChatMessage) => this.handlers.onChat?.(message));

    room.onMessage(S2C.VOICE_PEERS, (data: { peers: VoicePeer[]; closed?: string[] }) => {
      this.handlers.onVoicePeers?.(data.peers ?? [], data.closed ?? []);
    });

    room.onMessage(S2C.VOICE_SIGNAL, (data: { from: string; kind: 'offer' | 'answer' | 'ice'; payload: string }) => {
      this.handlers.onVoiceSignal?.(data.from, data.kind, data.payload);
    });

    room.onMessage(S2C.RECONCILE, (data: { position: { x: number; y: number; z: number }; reason: string }) => {
      this.handlers.onReconcile?.(data);
    });

    room.onMessage(S2C.STAT_DELTA, (data: { xp?: number; reputation?: number; reason: string }) => {
      this.handlers.onStatDelta?.(data);
    });

    room.onMessage(S2C.TOAST, (data: { kind: string; text: string; ttlMs: number }) => this.handlers.onToast?.(data));

    room.onMessage(S2C.KICK, (data: { reason: string; message: string }) => {
      this.handlers.onKick?.(data);
      this.setStatus('desconectado', data.message);
    });

    room.onMessage(S2C.PONG, () => {
      /* el RTT se calcula en la capa de diagnóstico */
    });

    // Padrón: alta, baja y cambios. Se marca sucio y se vuelca a 4 Hz para no
    // reconstruir el arreglo en cada patch.
    const players = room.state.players as unknown as {
      onAdd: (cb: () => void) => void;
      onRemove: (cb: () => void) => void;
      forEach: (cb: (value: Record<string, unknown>, key: string) => void) => void;
    };
    players.onAdd(() => {
      this.rosterDirty = true;
    });
    players.onRemove(() => {
      this.rosterDirty = true;
    });

    room.onStateChange(() => {
      this.rosterDirty = true;
    });

    room.onLeave((code) => {
      this.setStatus('desconectado', `código ${code}`);
    });

    room.onError((code, message) => {
      console.warn('[red] error de sala', code, message);
      this.setStatus('error', message);
    });
  }

  /** Vuelca el padrón y el mundo. Se llama desde el bucle, a baja frecuencia. */
  pump(): void {
    if (!this.room || !this.rosterDirty) return;
    this.rosterDirty = false;

    const state = this.room.state as unknown as {
      players: { forEach: (cb: (value: Record<string, unknown>, key: string) => void) => void };
      clock: { localMinute: number; phase: string };
      weather: { condition: string; temperatureC: number; windKph: number; snowCoverage: number; cloudCover: number };
      election: { phase: string; badge: string };
      population: number;
      shardName: string;
    };

    const roster: RosterEntry[] = [];
    state.players.forEach((value, key) => {
      roster.push({
        sessionId: key,
        alias: String(value.alias ?? ''),
        factionId: Number(value.factionId ?? 0),
        rankTier: Number(value.rankTier ?? 1),
        barrio: String(value.barrio ?? 'centro') as Barrio,
        cellCol: Number(value.cellCol ?? 0),
        cellRow: Number(value.cellRow ?? 0),
        x: Number(value.x ?? 0),
        y: Number(value.y ?? 0),
        z: Number(value.z ?? 0),
        anim: String(value.anim ?? 'IDLE') as AvatarAnimation,
        speaking: Boolean(value.speaking),
        voiceEnabled: Boolean(value.voiceEnabled),
        xp: Number(value.xp ?? 0),
        connected: Boolean(value.connected),
      });
    });
    this.rosterCache = roster;
    this.handlers.onRoster?.(roster);

    this.handlers.onWorld?.({
      localMinute: state.clock.localMinute,
      phase: state.clock.phase,
      weatherCondition: state.weather.condition,
      temperatureC: state.weather.temperatureC,
      windKph: state.weather.windKph,
      snowCoverage: state.weather.snowCoverage,
      cloudCover: state.weather.cloudCover,
      electionPhase: state.election.phase,
      electionBadge: state.election.badge,
      population: state.population,
      shardName: state.shardName,
    });
  }

  /** Manda la posición si vale la pena mandarla. */
  sendMove(x: number, y: number, z: number, yaw: number, anim: AvatarAnimation): void {
    if (!this.room) return;
    const now = Date.now();
    const elapsed = now - this.lastSent.at;
    if (elapsed < MOVE_MIN_INTERVAL_MS) return;

    const moved = Math.hypot(x - this.lastSent.x, z - this.lastSent.z) > MOVE_EPSILON_M;
    const turned = Math.abs(yaw - this.lastSent.yaw) > 0.08;
    const changed = anim !== this.lastSent.anim;

    if (!moved && !turned && !changed && elapsed < MOVE_MAX_INTERVAL_MS) return;

    this.seq++;
    this.room.send(C2S.MOVE, { seq: this.seq, position: { x, y, z }, yaw, anim, indoors: false });
    this.lastSent = { x, y, z, yaw, anim, at: now };
  }

  sendChat(text: string, channel: 'local' | 'faccion' | 'global' = 'local'): void {
    this.room?.send(C2S.CHAT, { t: Date.now(), text, channel });
  }

  sendAction(action: string): void {
    this.room?.send(C2S.ACTION, { t: Date.now(), action });
  }

  setVoiceEnabled(enabled: boolean, speaking = false): void {
    this.room?.send(C2S.VOICE_TOGGLE, { t: Date.now(), enabled, speaking });
  }

  setSpeaking(speaking: boolean): void {
    this.room?.send(C2S.VOICE_TOGGLE, { t: Date.now(), enabled: true, speaking });
  }

  sendVoiceSignal(to: string, kind: 'offer' | 'answer' | 'ice', payload: string): void {
    this.room?.send(C2S.VOICE_SIGNAL, { t: Date.now(), to, kind, payload });
  }

  ping(): void {
    this.room?.send(C2S.PING, { t: Date.now() });
  }

  async disconnect(): Promise<void> {
    try {
      await this.room?.leave(true);
    } catch {
      /* ya estaba cerrada */
    }
    this.room = null;
    this.client = null;
    this.rosterCache = [];
    this.setStatus('desconectado');
  }
}

/** Instancia compartida por la aplicación. */
export const networkClient = new NetworkClient();
