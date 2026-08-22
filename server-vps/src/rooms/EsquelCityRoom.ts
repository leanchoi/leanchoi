/**
 * `EsquelCityRoom` — la sala donde pasa todo.
 *
 * Es el servidor autoritativo de un pedazo de Esquel: hasta 120 vecinos caminando
 * las mismas calles, hablándose por la vereda, pegando afiches y cebando mates,
 * con el reloj y el clima reales de la ciudad.
 *
 * CÓMO SE REPARTE EL ANCHO DE BANDA
 *
 *   estado replicado (Colyseus)      → padrón + mundo, escritura gruesa a 1 Hz
 *   canal AOI (`s2c.aoi`, dirigido)  → transformadas finas a 10 Hz, sólo vecinos
 *   voz (WebRTC P2P)                 → audio directo entre navegadores, < 25 m
 *
 * El canal AOI es el que sostiene la promesa: **nadie recibe paquetes de alguien
 * que está a más de 4 manzanas**. Con 120 jugadores desparramados por el centro,
 * cada uno recibe entre 3 y 20 transformadas por paquete en vez de 119.
 */

// `colyseus` es CommonJS y Node no le detecta los named exports desde ESM:
// se importa el default y se desestructura. Los tipos sí se importan directo.
import colyseusPkg from 'colyseus';
import type { Client } from 'colyseus';

const { Room } = colyseusPkg;
import {
  BARRIO_BY_ID,
  CELL_PITCH_M,
  CHAT,
  FACTIONS,
  NET,
  RANK_BY_LEVEL,
  VOICE,
  buildElectionState,
  buildWorldClock,
  cellToWorld,
  isBarrio,
  type AvatarAnimation,
  type Barrio,
  type RankLevel,
  type UserJWT,
} from '@esquel/shared';
import { C2S, PROTOCOL_VERSION, S2C } from '@esquel/shared/protocol';
import { loadConfig, type ServerConfig } from '../config/env.ts';
import { hasScope, verifyToken } from '../auth/jwt.ts';
import { EsquelWorldState, FactionSummary } from '../schema/EsquelWorldState.ts';
import { PlayerState, type PrivatePlayerData } from '../schema/PlayerState.ts';
import { AoiIndex } from '../systems/AoiIndex.ts';
import { MovementValidator, type MovementSample } from '../systems/MovementValidator.ts';
import { VoiceSignaling, type VoiceParticipant } from '../voice/VoiceSignaling.ts';
import { HostingerBridge, type StatDelta } from '../services/HostingerBridge.ts';
import { WeatherFeed } from '../services/WeatherFeed.ts';

/** Estado servidor-side de un jugador: lo que no se replica. */
interface PlayerRuntime {
  readonly sessionId: string;
  /** Transformada fina, la que viaja por el canal AOI. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: AvatarAnimation;
  /** Última muestra válida, para el anti-cheat. */
  lastValid: MovementSample;
  /** Momento del último input recibido. */
  lastInputAt: number;
  /** Secuencia del último input aceptado (reconciliación del cliente). */
  lastSeq: number;
  readonly validator: MovementValidator;
  readonly privateData: PrivatePlayerData;
  /** Mensajes de chat en la ventana actual. */
  chatBudget: number;
  chatWindowAt: number;
  /** Intents por segundo, para cortar el spam. */
  intentBudget: number;
  intentWindowAt: number;
  /** Cooldown de acciones de militancia. */
  actionCooldownUntil: number;
  /** Fin de la animación de acción (después vuelve a IDLE/WALK). */
  animUntil: number;
  /** Radio de voz efectivo: crece con el megáfono. */
  voiceRangeM: number;
  /** Vecinos a los que se les mandó el último paquete AOI. */
  lastAoiPeers: Set<string>;
  joinedAt: number;
}

/** Copo satírico: lo que grita el servidor cuando alguien hace algo. */
const ACTION_FEEDBACK: Record<string, { anim: AvatarAnimation; xp: number; rep: number; toast: string; ms: number }> = {
  pegar_afiche: { anim: 'AFICHE', xp: 18, rep: 1, toast: 'Pegaste un afiche. Que aguante la lluvia es otra historia.', ms: 2600 },
  tapar_afiche: { anim: 'AFICHE', xp: 22, rep: -2, toast: 'Tapaste el afiche del rival. Nadie te vio. Eso creés.', ms: 2600 },
  repartir_volante: { anim: 'WALK', xp: 12, rep: 1, toast: 'Repartiste volantes. Tres llegaron al tacho antes que a la esquina.', ms: 1200 },
  cebar_mate: { anim: 'MATE', xp: 10, rep: 3, toast: 'Cebaste un mate. Acá se milita con agua a punto.', ms: 3200 },
  relevar_bache: { anim: 'IDLE', xp: 14, rep: 2, toast: 'Anotaste el bache. Van 47 en la planilla.', ms: 1800 },
  encuestar: { anim: 'IDLE', xp: 16, rep: 2, toast: 'Encuesta cargada. El vecino habló veinte minutos.', ms: 2400 },
};

export interface CityRoomOptions {
  /** Nombre visible del shard. */
  shardName?: string;
  /** Sólo en desarrollo: fuerza un punto de aparición. */
  spawn?: { x: number; z: number };
}

export class EsquelCityRoom extends Room<EsquelWorldState> {
  private config: ServerConfig = loadConfig();
  private readonly aoi = new AoiIndex();
  private readonly voice = new VoiceSignaling(this.config.world.voiceRangeM);
  private readonly runtimes = new Map<string, PlayerRuntime>();
  private bridge!: HostingerBridge;
  private weatherFeed!: WeatherFeed;
  private tickCount = 0;
  /** Métricas para el endpoint de salud. */
  private stats = { aoiPacketsSent: 0, aoiEntriesSent: 0, chatDropped: 0, corrections: 0 };

  /* ------------------------------------------------------------------ */
  /* Ciclo de vida                                                       */
  /* ------------------------------------------------------------------ */

  override onCreate(options: CityRoomOptions = {}): void {
    this.config = loadConfig();
    this.maxClients = Math.min(this.config.capacity, NET.MAX_PLAYERS_PER_ROOM);

    const state = new EsquelWorldState();
    state.shardName = options.shardName ?? this.config.shardName;
    state.protocolVersion = PROTOCOL_VERSION;
    state.capacity = this.maxClients;
    this.setState(state);

    for (const faction of FACTIONS) {
      const summary = new FactionSummary();
      summary.id = faction.id as unknown as number;
      summary.slug = faction.slug;
      summary.shortName = faction.shortName;
      summary.colorPrimary = faction.colorPrimary;
      summary.support = 1 / FACTIONS.length;
      state.factions.set(String(faction.id), summary);
    }

    this.bridge = new HostingerBridge(this.config, {
      info: (m) => console.log(m),
      warn: (m) => console.warn(m),
      error: (m) => console.error(m),
    });
    this.weatherFeed = new WeatherFeed(600_000, { info: (m) => console.log(m), warn: (m) => console.warn(m) });
    this.weatherFeed.start();

    this.registerHandlers();
    this.setPatchRate(1000 / NET.PATCH_HZ);
    this.setSimulationInterval((dt) => this.simulate(dt), 1000 / this.config.world.tickHz);
    this.refreshWorld();

    console.log(`[sala] ${state.shardName} lista · aforo ${this.maxClients} · AOI ${this.config.world.aoiCells} manzanas`);
  }

  /**
   * Autenticación: el JWT firmado por Hostinger es el único documento que se pide
   * en la puerta. El VPS no consulta MySQL en el camino caliente.
   */
  override async onAuth(_client: Client, options: { accessToken?: string; token?: string }): Promise<UserJWT> {
    const token = options?.accessToken ?? options?.token ?? '';
    if (!token) throw new Error('Falta el access token: pedilo en /api/auth/login.php');

    const result = verifyToken(token, {
      secret: this.config.jwt.secret,
      issuer: this.config.jwt.issuer,
      audience: this.config.jwt.audience,
      clockToleranceS: this.config.jwt.clockToleranceS,
    });

    if (!result.ok) throw new Error(`Token rechazado (${result.reason}): ${result.detail}`);
    if (!hasScope(result.claims, 'game:play')) throw new Error('El token no tiene el ámbito game:play.');

    return result.claims;
  }

  override onJoin(client: Client, options: CityRoomOptions = {}, auth?: UserJWT): void {
    const claims = auth ?? (client.auth as UserJWT);
    const barrio: Barrio = claims.barrio && isBarrio(claims.barrio) ? claims.barrio : 'centro';
    const spawn = this.spawnFor(barrio, options.spawn);

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = claims.userId;
    player.characterId = claims.characterId ?? '';
    player.alias = claims.alias || claims.nick || 'Vecino';
    player.factionId = (claims.factionId as unknown as number) ?? 0;
    player.rankTier = (claims.rankTier as unknown as number) ?? 1;
    player.barrio = barrio;
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    player.anim = 'IDLE';
    player.joinedAt = Date.now();
    player.connected = true;

    const cell = AoiIndex.cellOf(spawn.x, spawn.z);
    player.cellCol = cell.col;
    player.cellRow = cell.row;

    this.state.players.set(client.sessionId, player);
    this.state.population = this.state.players.size;

    this.runtimes.set(client.sessionId, {
      sessionId: client.sessionId,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      yaw: 0,
      anim: 'IDLE',
      lastValid: { x: spawn.x, y: spawn.y, z: spawn.z, at: Date.now() },
      lastInputAt: Date.now(),
      lastSeq: 0,
      validator: new MovementValidator(),
      privateData: {
        money: 250_000,
        loyalty: 0.2,
        pendingXp: 0,
        pendingMoney: 0,
        pendingReputation: 0,
        playSeconds: 0,
      },
      chatBudget: CHAT.RATE_LIMIT,
      chatWindowAt: Date.now(),
      intentBudget: NET.INTENT_RATE_LIMIT,
      intentWindowAt: Date.now(),
      actionCooldownUntil: 0,
      animUntil: 0,
      voiceRangeM: VOICE.MAX_RANGE_M,
      lastAoiPeers: new Set<string>(),
      joinedAt: Date.now(),
    });

    this.aoi.update(client.sessionId, spawn.x, spawn.z);
    this.refreshFactionCounts();

    client.send(S2C.WELCOME, {
      sessionId: client.sessionId,
      charId: player.characterId,
      serverTime: Date.now(),
      protocolVersion: PROTOCOL_VERSION,
      prefabIndexUrl: '/prefabs/index.json',
      tickRate: this.config.world.tickHz,
      aoiCells: this.config.world.aoiCells,
      spawn,
    });

    const rank = RANK_BY_LEVEL[player.rankTier as RankLevel];
    this.broadcastLocal(client.sessionId, S2C.CHAT, {
      from: 'sistema',
      nick: 'Esquel',
      text: `Llegó ${player.alias} (${rank?.name ?? 'Chopanero'}) por ${BARRIO_BY_ID[barrio].name}.`,
      channel: 'sistema',
      at: Date.now(),
    });

    console.log(`[sala] entró ${player.alias} (${client.sessionId}) en ${barrio} · población ${this.state.population}`);
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    // Ventana de reconexión: si se le cortó el wifi, el avatar lo espera en la
    // vereda 30 segundos antes de desaparecer.
    if (!consented) {
      try {
        await this.allowReconnection(client, NET.DISCONNECT_GRACE_MS / 1000);
        const back = this.state.players.get(client.sessionId);
        if (back) back.connected = true;
        console.log(`[sala] volvió ${back?.alias ?? client.sessionId}`);
        return;
      } catch {
        // Se agotó la ventana: sigue el camino normal de salida.
      }
    }

    await this.persistPlayer(client.sessionId, true);
    this.dropPlayer(client.sessionId);
  }

  override async onDispose(): Promise<void> {
    this.weatherFeed.stop();
    await this.flushStats(true);
    this.aoi.clear();
    this.voice.clear();
    this.runtimes.clear();
    console.log('[sala] cerrada');
  }

  /* ------------------------------------------------------------------ */
  /* Mensajes del cliente                                                */
  /* ------------------------------------------------------------------ */

  private registerHandlers(): void {
    this.onMessage(C2S.MOVE, (client, message: { seq: number; position: { x: number; y: number; z: number }; yaw: number; anim: AvatarAnimation }) =>
      this.handleMove(client, message),
    );

    this.onMessage(C2S.CHAT, (client, message: { text: string; channel: 'local' | 'faccion' | 'global' }) =>
      this.handleChat(client, message),
    );

    this.onMessage(C2S.ACTION, (client, message: { action: string }) => this.handleAction(client, message));

    this.onMessage(C2S.VOICE_TOGGLE, (client, message: { enabled: boolean; speaking?: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.muted) return;
      player.voiceEnabled = Boolean(message?.enabled);
      if (!player.voiceEnabled) {
        player.speaking = false;
        this.closeVoicePeers(client.sessionId);
      }
      if (typeof message?.speaking === 'boolean') player.speaking = message.speaking && player.voiceEnabled;
    });

    this.onMessage(C2S.VOICE_SIGNAL, (client, message: { to: string; kind: 'offer' | 'answer' | 'ice'; payload: string }) =>
      this.handleVoiceSignal(client, message),
    );

    this.onMessage(C2S.PING, (client, message: { t?: number }) => {
      client.send(S2C.PONG, { t: message?.t ?? 0, serverTime: Date.now() });
    });

    this.onMessage(C2S.REPORT, (client, message: { targetSessionId: string; category: string; note?: string }) => {
      // La denuncia se persiste en la Fase 4 con el resto de moderación; por ahora
      // queda en el log del shard, que es lo que un moderador mira en vivo.
      console.warn(
        `[moderación] ${client.sessionId} denuncia a ${message?.targetSessionId} por ${message?.category}: ${message?.note ?? ''}`,
      );
      client.send(S2C.TOAST, { kind: 'info', text: 'Denuncia registrada. Un moderador la va a mirar.', ttlMs: 4000 });
    });
  }

  /** Movimiento: valida, acepta o corrige. */
  private handleMove(
    client: Client,
    message: { seq: number; position: { x: number; y: number; z: number }; yaw: number; anim: AvatarAnimation },
  ): void {
    const runtime = this.runtimes.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!runtime || !player || !message?.position) return;
    if (!this.spendIntent(runtime)) return;

    const now = Date.now();
    const sample: MovementSample = {
      x: message.position.x,
      y: message.position.y,
      z: message.position.z,
      at: now,
    };

    const verdict = runtime.validator.validate(runtime.lastValid, sample);
    if (!verdict.ok) {
      this.stats.corrections++;
      client.send(S2C.RECONCILE, {
        seq: message.seq ?? runtime.lastSeq,
        position: { x: runtime.lastValid.x, y: runtime.lastValid.y, z: runtime.lastValid.z },
        velocity: { x: 0, y: 0, z: 0 },
        reason: verdict.reason === 'velocidad' || verdict.reason === 'teleport' ? 'anticheat' : 'deriva',
      });

      if (runtime.validator.shouldKick) {
        console.warn(`[anticheat] ${player.alias} desconectado: ${verdict.reason} · ${verdict.detail}`);
        client.send(S2C.KICK, {
          reason: 'anticheat',
          message: 'Movimiento imposible detectado. Si creés que es un error, reconectá.',
        });
        client.leave(4000);
      }
      return;
    }

    runtime.x = sample.x;
    runtime.y = sample.y;
    runtime.z = sample.z;
    runtime.yaw = Number.isFinite(message.yaw) ? message.yaw : runtime.yaw;
    runtime.lastValid = sample;
    runtime.lastInputAt = now;
    runtime.lastSeq = message.seq ?? runtime.lastSeq;

    // La animación de una acción manda por encima de la locomoción.
    if (now >= runtime.animUntil) {
      runtime.anim = message.anim ?? 'IDLE';
    }

    if (player.afk) player.afk = false;
    this.aoi.update(client.sessionId, sample.x, sample.z);
  }

  /**
   * Chat. Tres canales, con la misma lógica de siempre en la calle: lo que se
   * grita en la esquina lo escucha la esquina.
   */
  private handleChat(client: Client, message: { text: string; channel: 'local' | 'faccion' | 'global' }): void {
    const runtime = this.runtimes.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!runtime || !player) return;

    const text = String(message?.text ?? '').slice(0, CHAT.MAX_LENGTH).trim();
    if (!text) return;

    const now = Date.now();
    if (now - runtime.chatWindowAt > 10_000) {
      runtime.chatWindowAt = now;
      runtime.chatBudget = CHAT.RATE_LIMIT;
    }
    if (runtime.chatBudget <= 0) {
      this.stats.chatDropped++;
      client.send(S2C.TOAST, { kind: 'alerta', text: 'Pará un poco con el chat, que no se entiende nada.', ttlMs: 3000 });
      return;
    }
    runtime.chatBudget--;

    const channel = message?.channel ?? 'local';
    const payload = { from: client.sessionId, nick: player.alias, text, channel, at: now };

    if (channel === 'global') {
      // El canal global es de los que llegaron arriba: recién de Subsecretario
      // para arriba tenés micrófono abierto a toda la ciudad.
      if (player.rankTier < 7) {
        client.send(S2C.TOAST, {
          kind: 'alerta',
          text: 'El canal general es de Subsecretario para arriba. Seguí caminando el barrio.',
          ttlMs: 4500,
        });
        return;
      }
      this.broadcast(S2C.CHAT, payload);
      return;
    }

    if (channel === 'faccion') {
      if (player.factionId === 0) {
        client.send(S2C.TOAST, { kind: 'alerta', text: 'No tenés bando. Afiliate y después hablamos.', ttlMs: 4000 });
        return;
      }
      for (const other of this.clients) {
        const target = this.state.players.get(other.sessionId);
        if (target?.factionId === player.factionId) other.send(S2C.CHAT, payload);
      }
      return;
    }

    this.broadcastLocal(client.sessionId, S2C.CHAT, payload, true);
  }

  /** Acciones de militancia: afiche, volante, mate, bache, encuesta. */
  private handleAction(client: Client, message: { action: string }): void {
    const runtime = this.runtimes.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!runtime || !player) return;

    const now = Date.now();
    if (now < runtime.actionCooldownUntil) return;
    if (!this.spendIntent(runtime)) return;

    const feedback = ACTION_FEEDBACK[message?.action ?? ''];
    if (!feedback) return;

    runtime.actionCooldownUntil = now + Math.max(1500, feedback.ms);
    runtime.anim = feedback.anim;
    runtime.animUntil = now + feedback.ms;

    const rank = RANK_BY_LEVEL[player.rankTier as RankLevel];
    const xp = Math.round(feedback.xp * (rank?.xpMultiplier ?? 1));
    player.xp += xp;
    player.reputation = Math.max(-1000, Math.min(1000, player.reputation + feedback.rep));
    runtime.privateData.pendingXp += xp;
    runtime.privateData.pendingReputation += feedback.rep;

    client.send(S2C.STAT_DELTA, {
      charId: player.characterId,
      source: 'mision',
      xp,
      reputation: feedback.rep,
      reason: feedback.toast,
      at: now,
    });
  }

  /** Reenvío de señalización WebRTC entre vecinos que el servidor emparejó. */
  private handleVoiceSignal(client: Client, message: { to: string; kind: 'offer' | 'answer' | 'ice'; payload: string }): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.muted || !player.voiceEnabled) return;

    const to = String(message?.to ?? '');
    const check = this.voice.canRelay(client.sessionId, to, String(message?.payload ?? ''));
    if (!check.ok) return;

    const target = this.clients.find((c) => c.sessionId === to);
    if (!target) return;

    target.send(S2C.VOICE_SIGNAL, {
      from: client.sessionId,
      kind: message.kind,
      payload: message.payload,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Bucle de simulación                                                 */
  /* ------------------------------------------------------------------ */

  private simulate(_deltaMs: number): void {
    this.tickCount++;
    const now = Date.now();
    this.state.tick = this.tickCount;
    this.state.serverTime = now;

    const ticksPerAoi = Math.max(1, Math.round(this.config.world.tickHz / this.config.world.aoiHz));

    // AFK: sin input por más de tres minutos deja de contar para el territorio.
    for (const [sessionId, runtime] of this.runtimes) {
      const player = this.state.players.get(sessionId);
      if (!player) continue;
      const idle = now - runtime.lastInputAt > NET.HEARTBEAT_MS * 36;
      if (player.afk !== idle) player.afk = idle;
      if (now >= runtime.animUntil && runtime.anim !== 'IDLE' && runtime.anim !== 'WALK' && runtime.anim !== 'RUN') {
        runtime.anim = 'IDLE';
      }
    }

    if (this.tickCount % ticksPerAoi === 0) this.broadcastAoi(now);
    if (this.tickCount % (this.config.world.tickHz * 0.5) === 0) this.updateVoicePeers();
    if (this.tickCount % this.config.world.tickHz === 0) {
      this.writeCoarseState();
      this.refreshWorld();
    }
    if (this.tickCount % (this.config.world.tickHz * 30) === 0) void this.flushStats(false);
  }

  /**
   * Reparte las transformadas finas. Cada cliente recibe **sólo** a los que tiene
   * a menos de `aoiCells` manzanas: es el corazón del interest management.
   */
  private broadcastAoi(now: number): void {
    const radius = this.config.world.aoiCells;

    for (const client of this.clients) {
      const cell = this.aoi.cellOf(client.sessionId);
      if (!cell) continue;

      const neighbors = this.aoi.neighbors(cell.col, cell.row, radius, client.sessionId);
      const players: {
        sessionId: string;
        x: number;
        y: number;
        z: number;
        yaw: number;
        anim: AvatarAnimation;
        voz: boolean;
      }[] = [];

      for (const sessionId of neighbors) {
        const runtime = this.runtimes.get(sessionId);
        const state = this.state.players.get(sessionId);
        if (!runtime || !state) continue;
        players.push({
          sessionId,
          x: Number(runtime.x.toFixed(2)),
          y: Number(runtime.y.toFixed(2)),
          z: Number(runtime.z.toFixed(2)),
          yaw: Number(runtime.yaw.toFixed(3)),
          anim: runtime.anim,
          voz: state.speaking,
        });
      }

      const runtime = this.runtimes.get(client.sessionId);
      if (runtime) {
        // Aviso de salida: los que dejaron de estar cerca se despawnean en el cliente.
        const current = new Set(players.map((p) => p.sessionId));
        const gone = [...runtime.lastAoiPeers].filter((id) => !current.has(id));
        runtime.lastAoiPeers = current;
        if (gone.length > 0) client.send('s2c.aoi.leave', { sessionIds: gone });
      }

      client.send(S2C.AOI, { tick: this.tickCount, t: now, players });
      this.stats.aoiPacketsSent++;
      this.stats.aoiEntriesSent += players.length;
    }
  }

  /** Recalcula la malla de voz: quién escucha a quién, con qué volumen y paneo. */
  private updateVoicePeers(): void {
    const participants: VoiceParticipant[] = [];
    for (const [sessionId, runtime] of this.runtimes) {
      const player = this.state.players.get(sessionId);
      if (!player) continue;
      participants.push({
        sessionId,
        charId: player.characterId,
        x: runtime.x,
        z: runtime.z,
        yaw: runtime.yaw,
        voiceEnabled: player.voiceEnabled,
        muted: player.muted,
        rangeM: runtime.voiceRangeM,
      });
    }

    for (const client of this.clients) {
      const listener = participants.find((p) => p.sessionId === client.sessionId);
      if (!listener) continue;

      // Sólo se consideran los que están en el radio de interés: nadie negocia
      // una conexión con alguien que está en la otra punta de Esquel.
      const cell = this.aoi.cellOf(client.sessionId);
      const nearby = cell
        ? new Set(this.aoi.neighbors(cell.col, cell.row, 1, client.sessionId))
        : new Set<string>();
      const candidates = participants.filter((p) => nearby.has(p.sessionId));

      const diff = this.voice.computePeers(listener, candidates);
      client.send(S2C.VOICE_PEERS, { peers: diff.peers, closed: diff.closed });
    }
  }

  /** Vuelca al estado replicado la foto gruesa: padrón, manzana y actividad. */
  private writeCoarseState(): void {
    for (const [sessionId, runtime] of this.runtimes) {
      const player = this.state.players.get(sessionId);
      if (!player) continue;
      player.x = Number(runtime.x.toFixed(1));
      player.y = Number(runtime.y.toFixed(1));
      player.z = Number(runtime.z.toFixed(1));
      player.yaw = Number(runtime.yaw.toFixed(2));
      player.anim = runtime.anim;
      const cell = AoiIndex.cellOf(runtime.x, runtime.z);
      player.cellCol = cell.col;
      player.cellRow = cell.row;
      runtime.privateData.playSeconds += 1;
    }
    this.state.population = this.state.players.size;
  }

  /** Reloj de Esquel, clima y fase electoral: iguales para todo el shard. */
  private refreshWorld(): void {
    const now = Date.now();
    const clock = buildWorldClock(now);
    this.state.clock.localMinute = clock.localMinute;
    this.state.clock.weekday = clock.weekday;
    this.state.clock.season = clock.season;
    this.state.clock.phase = clock.phase;
    this.state.clock.sunElevationDeg = clock.sunElevationDeg;
    this.state.clock.sunAzimuthDeg = clock.sunAzimuthDeg;

    const weather = this.weatherFeed.weather;
    this.state.weather.condition = weather.condition;
    this.state.weather.temperatureC = weather.temperatureC;
    this.state.weather.feelsLikeC = weather.feelsLikeC;
    this.state.weather.windKph = weather.windKph;
    this.state.weather.windDirDeg = weather.windDirDeg;
    this.state.weather.windGustKph = weather.windGustKph;
    this.state.weather.cloudCover = weather.cloudCover;
    this.state.weather.snowCoverage = weather.snowCoverage;
    this.state.weather.visibilityM = weather.visibilityM;
    this.state.weather.stale = weather.stale;

    const election = buildElectionState(now);
    this.state.election.phase = election.phase;
    this.state.election.badge = election.badge;
    this.state.election.opensAt = election.calendar.opensAt;
    this.state.election.progress = election.progress;
    this.state.election.propagandaAllowed = election.modifiers.propagandaAllowed;
    this.state.election.votingOpen = election.modifiers.votingOpen;
  }

  private refreshFactionCounts(): void {
    const counts = new Map<number, number>();
    for (const [, player] of this.state.players) {
      counts.set(player.factionId, (counts.get(player.factionId) ?? 0) + 1);
    }
    for (const [id, summary] of this.state.factions) {
      summary.online = counts.get(Number(id)) ?? 0;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Persistencia                                                        */
  /* ------------------------------------------------------------------ */

  /** Junta lo acumulado y lo manda a Hostinger. */
  private async flushStats(final: boolean): Promise<void> {
    const deltas: StatDelta[] = [];

    for (const [sessionId, runtime] of this.runtimes) {
      const player = this.state.players.get(sessionId);
      if (!player || !player.characterId) continue;
      const p = runtime.privateData;
      if (!final && p.pendingXp === 0 && p.pendingMoney === 0 && p.pendingReputation === 0 && p.playSeconds < 30) {
        continue;
      }
      deltas.push({
        characterId: player.characterId,
        xp: p.pendingXp,
        reputation: p.pendingReputation,
        money: p.pendingMoney,
        playSeconds: Math.round(p.playSeconds),
        x: Number(runtime.x.toFixed(2)),
        y: Number(runtime.y.toFixed(2)),
        z: Number(runtime.z.toFixed(2)),
        rankTier: player.rankTier,
        health: player.health,
      });
      p.pendingXp = 0;
      p.pendingMoney = 0;
      p.pendingReputation = 0;
      p.playSeconds = 0;
    }

    await this.bridge.retryPending();
    if (deltas.length > 0) await this.bridge.flush(this.bridge.buildBatch(deltas));
  }

  /** Volcado puntual de un jugador que se va. */
  private async persistPlayer(sessionId: string, final: boolean): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!runtime || !player || !player.characterId) return;
    const p = runtime.privateData;
    if (!final && p.pendingXp === 0 && p.pendingReputation === 0 && p.pendingMoney === 0) return;

    await this.bridge.flush(
      this.bridge.buildBatch([
        {
          characterId: player.characterId,
          xp: p.pendingXp,
          reputation: p.pendingReputation,
          money: p.pendingMoney,
          playSeconds: Math.round(p.playSeconds),
          x: Number(runtime.x.toFixed(2)),
          y: Number(runtime.y.toFixed(2)),
          z: Number(runtime.z.toFixed(2)),
          rankTier: player.rankTier,
          health: player.health,
        },
      ]),
    );
    p.pendingXp = 0;
    p.pendingMoney = 0;
    p.pendingReputation = 0;
    p.playSeconds = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  /** Punto de aparición: la esquina del barrio que declaró en el onboarding. */
  private spawnFor(barrio: Barrio, override?: { x: number; z: number }): { x: number; y: number; z: number } {
    if (override && Number.isFinite(override.x) && Number.isFinite(override.z)) {
      return { x: override.x, y: 0, z: override.z };
    }
    const definition = BARRIO_BY_ID[barrio];
    const center = cellToWorld(definition.spawnCell);
    // Dispersión dentro de la manzana para que no aparezcan todos encimados.
    const spread = CELL_PITCH_M * 0.18;
    return {
      x: Number((center.x + (Math.random() - 0.5) * spread).toFixed(2)),
      y: 0,
      z: Number((center.z + (Math.random() - 0.5) * spread).toFixed(2)),
    };
  }

  /** Presupuesto de intents por segundo: corta el spam de paquetes. */
  private spendIntent(runtime: PlayerRuntime): boolean {
    const now = Date.now();
    if (now - runtime.intentWindowAt > 1000) {
      runtime.intentWindowAt = now;
      runtime.intentBudget = NET.INTENT_RATE_LIMIT;
    }
    if (runtime.intentBudget <= 0) return false;
    runtime.intentBudget--;
    return true;
  }

  /** Manda un mensaje sólo a quienes están dentro del radio de chat local. */
  private broadcastLocal(originSessionId: string, type: string, payload: unknown, includeSelf = false): void {
    const origin = this.runtimes.get(originSessionId);
    if (!origin) return;

    for (const client of this.clients) {
      if (!includeSelf && client.sessionId === originSessionId) continue;
      const other = this.runtimes.get(client.sessionId);
      if (!other) continue;
      const distance = Math.hypot(other.x - origin.x, other.z - origin.z);
      if (distance <= CHAT.LOCAL_RADIUS_M) client.send(type, payload);
    }
  }

  private closeVoicePeers(sessionId: string): void {
    const affected = this.voice.remove(sessionId);
    for (const client of this.clients) {
      if (affected.includes(client.sessionId)) {
        client.send(S2C.VOICE_PEERS, { peers: [], closed: [sessionId] });
      }
    }
  }

  private dropPlayer(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    this.closeVoicePeers(sessionId);
    this.aoi.remove(sessionId);
    this.runtimes.delete(sessionId);
    this.state.players.delete(sessionId);
    this.state.population = this.state.players.size;
    this.refreshFactionCounts();
    if (player) console.log(`[sala] se fue ${player.alias} · población ${this.state.population}`);
  }

  /** Métricas para `/health` y para el panel de operación. */
  metrics(): Record<string, number | boolean | string> {
    const entriesPerPacket =
      this.stats.aoiPacketsSent === 0 ? 0 : this.stats.aoiEntriesSent / this.stats.aoiPacketsSent;
    return {
      shard: this.state.shardName,
      tick: this.tickCount,
      poblacion: this.state.population,
      aforo: this.maxClients,
      manzanasOcupadas: this.aoi.occupiedCells().length,
      paresDeVoz: this.voice.openPairs,
      aoiEntradasPorPaquete: Number(entriesPerPacket.toFixed(2)),
      correcciones: this.stats.corrections,
      chatDescartado: this.stats.chatDropped,
      hostingerOk: this.bridge.healthy,
      lotesPendientes: this.bridge.pendingBatches,
    };
  }
}
