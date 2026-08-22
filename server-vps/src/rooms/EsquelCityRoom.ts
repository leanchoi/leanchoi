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
  DEBATE,
  FACTIONS,
  NET,
  RANK_BY_LEVEL,
  TERRITORY,
  VOICE,
  buildElectionState,
  buildWorldClock,
  cellToWorld,
  chatReachOf,
  contextMultiplier,
  isBarrio,
  unlockedItems,
  type AvatarAnimation,
  type Barrio,
  type Participant,
  type QuestSpawnRequest,
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
import {
  HostingerBridge,
  type CampaignDelta,
  type QuestRunDelta,
  type StatDelta,
} from '../services/HostingerBridge.ts';
import { WeatherFeed } from '../services/WeatherFeed.ts';
import { DebateEngine } from '../debate/DebateEngine.ts';
import { TerritoryManager } from '../territory/TerritoryManager.ts';
import { QuestManager } from '../quests/QuestManager.ts';
import type { QuestEvent, QuestEventKind } from '../quests/catalog/index.ts';
import { ModeRegistry, type CampaignResult } from '../modes/ModeRegistry.ts';
import { IntelligenceEngine } from '../intelligence/IntelligenceEngine.ts';
import { registerRoom, unregisterRoom } from './registry.ts';
import type { LiveOpsCommand, LiveOpsResult, NewsSignal, TelemetryEvent } from '@esquel/shared';

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

/**
 * Traduce las colas pendientes al formato del lote de Hostinger. Las claves
 * viajan sólo si hay algo que mandar, así el 99% de los lotes sigue siendo el
 * mismo JSON chico de siempre.
 */
const questPayload = (
  p: PrivatePlayerData,
): { quests?: readonly QuestRunDelta[]; campaigns?: readonly CampaignDelta[] } => {
  const out: { quests?: readonly QuestRunDelta[]; campaigns?: readonly CampaignDelta[] } = {};

  if (p.pendingQuests.length > 0) {
    out.quests = p.pendingQuests.map((q) => ({
      instanceId: q.instanceId,
      slug: q.slug,
      type: q.type,
      trigger: q.trigger,
      barrio: q.barrio,
      ...(q.zoneId ? { zoneId: q.zoneId } : {}),
      factionId: q.factionId,
      rankTier: q.rankTier,
      startedAt: new Date(q.startedAt).toISOString(),
      finishedAt: new Date(q.finishedAt).toISOString(),
      durationS: Math.max(0, Math.round((q.finishedAt - q.startedAt) / 1000)),
      outcome: q.outcome,
      completion: Number(q.completion.toFixed(4)),
      contribution: Number(q.contribution.toFixed(4)),
      counters: q.counters,
      xp: q.xp,
      reputation: q.reputation,
      money: q.money,
      territoryScore: Number(q.territoryScore.toFixed(2)),
      weather: q.weather,
      localHour: q.localHour,
      seed: q.seed,
    }));
  }

  if (p.pendingCampaigns.length > 0) out.campaigns = [...p.pendingCampaigns];

  return out;
};

export class EsquelCityRoom extends Room<EsquelWorldState> {
  private config: ServerConfig = loadConfig();
  private readonly aoi = new AoiIndex();
  private readonly voice = new VoiceSignaling(this.config.world.voiceRangeM);
  private readonly runtimes = new Map<string, PlayerRuntime>();
  private bridge!: HostingerBridge;
  private weatherFeed!: WeatherFeed;
  private readonly debates = new DebateEngine();
  private readonly territory = new TerritoryManager();
  private readonly quests = new QuestManager();
  private readonly modes = new ModeRegistry();
  /** Agregador político en vivo; se instancia con el puente en `onCreate`. */
  private intel!: IntelligenceEngine;
  /** Invitaciones a duelo pendientes: `retado → { duelo, retador, vence }`. */
  private readonly duelInvites = new Map<string, { challenger: string; expiresAt: number; pot: number }>();
  private tickCount = 0;
  /** Métricas para el endpoint de salud. */
  private stats = { aoiPacketsSent: 0, aoiEntriesSent: 0, chatDropped: 0, corrections: 0, duelos: 0, misiones: 0, capturas: 0 };

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

    this.intel = new IntelligenceEngine({
      bridge: this.bridge,
      shardName: state.shardName,
      log: { info: (m) => console.log(m), warn: (m) => console.warn(m), error: (m) => console.error(m) },
    });
    this.intel.start();
    registerRoom(this);

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
        pendingQuests: [],
        pendingCampaigns: [],
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
    unregisterRoom(this);
    this.weatherFeed.stop();
    await this.intel.stop();
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

    /**
     * Telemetría del cliente. Viaja por el socket ya autenticado, así que no hay
     * un endpoint público que inundar; el motor igual la mide por sujeto.
     */
    this.onMessage(C2S.TELEMETRY_BATCH, (client, message: { events?: TelemetryEvent[] }) => {
      const claims = client.auth as UserJWT | undefined;
      const lote = Array.isArray(message?.events) ? message.events.slice(0, 50) : [];
      if (lote.length === 0) return;
      // Sin consentimiento sólo entran los eventos de sistema. El cliente ya
      // filtra, pero el servidor no le cree a nadie.
      const permitidos = claims?.telemetryConsent ? lote : lote.filter((e) => e?.kind === 'sistema');
      this.intel.ingest(permitidos);
    });

    this.onMessage(C2S.VOICE_SIGNAL, (client, message: { to: string; kind: 'offer' | 'answer' | 'ice'; payload: string }) =>
      this.handleVoiceSignal(client, message),
    );

    /* --- duelos de chicanas --- */

    this.onMessage(C2S.DEBATE_CHALLENGE, (client, message: { targetCharId: string; pot?: number }) =>
      this.handleChallenge(client, message),
    );

    this.onMessage(C2S.DEBATE_RESPOND, (client, message: { duelId: string; accept: boolean }) =>
      this.handleDuelResponse(client, message),
    );

    this.onMessage(C2S.DEBATE_PLAY, (client, message: { duelId: string; card: string; expectedTurn: number }) => {
      const charId = this.charIdOf(client.sessionId);
      if (!charId) return;
      const result = this.debates.playCard(message.duelId, charId, message.card, message.expectedTurn);
      if (!result.ok) {
        client.send(S2C.TOAST, { kind: 'alerta', text: result.error, ttlMs: 3500 });
        return;
      }
      this.pushDuelState(message.duelId);
      if (result.finished) this.settleDuel(message.duelId);
    });

    this.onMessage(C2S.DEBATE_PASS, (client, message: { duelId: string }) => {
      const charId = this.charIdOf(client.sessionId);
      if (!charId) return;
      const result = this.debates.pass(message.duelId, charId);
      if (!result.ok) return;
      this.pushDuelState(message.duelId);
      if (result.finished) this.settleDuel(message.duelId);
    });

    this.onMessage(C2S.DEBATE_FORFEIT, (client, message: { duelId: string }) => {
      const charId = this.charIdOf(client.sessionId);
      if (!charId) return;
      const result = this.debates.forfeit(message.duelId, charId, 'abandono');
      if (result.ok) {
        this.pushDuelState(message.duelId);
        this.settleDuel(message.duelId);
      }
    });

    /* --- misiones --- */

    this.onMessage(C2S.QUEST_JOIN, (client, message: { questId: string }) => this.handleQuestJoin(client, message));

    this.onMessage(C2S.QUEST_ABANDON, (client, message: { questId: string }) => {
      const charId = this.charIdOf(client.sessionId);
      if (!charId) return;
      const evento = this.quests.abandon(message.questId, charId, this.questTickInput());
      if (evento) this.dispatchQuestEvents([evento]);
    });

    this.onMessage(
      C2S.QUEST_PROGRESS,
      (client, message: { questId: string; objectiveId: string; amount: number; kind?: string }) =>
        this.handleQuestProgress(client, message),
    );

    /* --- Modo Candidato --- */

    this.onMessage(C2S.CAMPAIGN_SETTLE, (client, message: { result: CampaignResult }) =>
      this.handleCampaignSettle(client, message),
    );

    /* --- panel de admin / webhook de noticias --- */

    this.onMessage(C2S.ADMIN_SPAWN_QUEST, (client, message: { request: QuestSpawnRequest }) => {
      const claims = client.auth as UserJWT | undefined;
      if (!claims || (claims.role !== 'admin' && claims.role !== 'moderator')) {
        client.send(S2C.TOAST, { kind: 'error', text: 'Eso lo publica el panel, no vos.', ttlMs: 3500 });
        return;
      }
      const evento = this.quests.spawn({ ...message.request, trigger: message.request.trigger ?? 'admin' }, this.questTickInput());
      if (evento) this.dispatchQuestEvents([evento]);
    });

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
      // El alcance sale del árbol de carrera: el canal general se gana.
      if (chatReachOf(player.rankTier as RankLevel) !== 'global') {
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
  /* Duelos de chicanas                                                  */
  /* ------------------------------------------------------------------ */

  /** Un militante cruza a otro en la calle y le propone discutir. */
  private handleChallenge(client: Client, message: { targetCharId: string; pot?: number }): void {
    const retador = this.state.players.get(client.sessionId);
    const runtime = this.runtimes.get(client.sessionId);
    if (!retador || !runtime) return;

    const objetivo = [...this.state.players.values()].find((p) => p.characterId === message.targetCharId);
    if (!objetivo) {
      client.send(S2C.TOAST, { kind: 'alerta', text: 'Ese vecino ya no está por acá.', ttlMs: 3000 });
      return;
    }
    if (objetivo.factionId === retador.factionId && objetivo.factionId !== 0) {
      client.send(S2C.TOAST, { kind: 'alerta', text: 'Es de tu bando. Guardate la chicana para el rival.', ttlMs: 4000 });
      return;
    }
    if (Math.abs(objetivo.rankTier - retador.rankTier) > DEBATE.MAX_RANK_GAP) {
      client.send(S2C.TOAST, {
        kind: 'alerta',
        text: 'Está muy lejos en la carrera: buscá a alguien de tu tamaño.',
        ttlMs: 4500,
      });
      return;
    }
    if (this.debates.findByChar(retador.characterId) || this.debates.findByChar(objetivo.characterId)) {
      client.send(S2C.TOAST, { kind: 'alerta', text: 'Alguno de los dos ya está discutiendo.', ttlMs: 3000 });
      return;
    }

    const otro = this.runtimes.get(objetivo.sessionId);
    if (!otro || Math.hypot(otro.x - runtime.x, otro.z - runtime.z) > 18) {
      client.send(S2C.TOAST, { kind: 'alerta', text: 'Acercate: desde ahí no te escucha nadie.', ttlMs: 3500 });
      return;
    }

    const duelId = `duel-${Date.now().toString(36)}-${retador.characterId}`;
    this.duelInvites.set(objetivo.sessionId, {
      challenger: client.sessionId,
      expiresAt: Date.now() + 20_000,
      pot: Math.max(0, Math.min(50_000, message.pot ?? 0)),
    });

    const target = this.clients.find((c) => c.sessionId === objetivo.sessionId);
    target?.send(S2C.DEBATE_INVITE, {
      duelId,
      fromCharId: retador.characterId,
      fromNick: retador.alias,
      pot: message.pot ?? 0,
      expiresAt: Date.now() + 20_000,
    });
    client.send(S2C.TOAST, { kind: 'info', text: `Lo desafiaste. A ver si se anima.`, ttlMs: 3500 });
  }

  /** El desafiado acepta o se hace el distraído. */
  private handleDuelResponse(client: Client, message: { duelId: string; accept: boolean }): void {
    const invitacion = this.duelInvites.get(client.sessionId);
    if (!invitacion || Date.now() > invitacion.expiresAt) {
      this.duelInvites.delete(client.sessionId);
      return;
    }
    this.duelInvites.delete(client.sessionId);

    const retadorCliente = this.clients.find((c) => c.sessionId === invitacion.challenger);
    const retador = this.state.players.get(invitacion.challenger);
    const defensor = this.state.players.get(client.sessionId);
    if (!retador || !defensor || !retadorCliente) return;

    if (!message.accept) {
      retadorCliente.send(S2C.TOAST, { kind: 'alerta', text: `${defensor.alias} se hizo el distraído.`, ttlMs: 4000 });
      return;
    }

    const runtime = this.runtimes.get(client.sessionId);
    const zona = runtime ? this.territory.zoneAt({ x: runtime.x, y: 0, z: runtime.z }) : undefined;
    const espectadores = this.spectatorsAround(client.sessionId);

    const duel = this.debates.create({
      id: message.duelId || `duel-${Date.now().toString(36)}`,
      arena: zona?.seed.id === 'zone:plaza-san-martin' ? 'plaza_san_martin' : 'esquina',
      ...(zona ? { zoneId: zona.seed.id } : {}),
      challenger: {
        charId: retador.characterId,
        nick: retador.alias,
        factionId: retador.factionId,
        rankTier: retador.rankTier,
        reputation: retador.reputation,
      },
      defender: {
        charId: defensor.characterId,
        nick: defensor.alias,
        factionId: defensor.factionId,
        rankTier: defensor.rankTier,
        reputation: defensor.reputation,
      },
      spectators: espectadores,
      pot: invitacion.pot,
      zoneControl: zona
        ? {
            [retador.factionId]: this.territory.controlOf(zona.seed.id, retador.factionId),
            [defensor.factionId]: this.territory.controlOf(zona.seed.id, defensor.factionId),
          }
        : {},
    });

    this.stats.duelos++;
    for (const sessionId of [invitacion.challenger, client.sessionId]) {
      const runtimeLado = this.runtimes.get(sessionId);
      if (runtimeLado) {
        runtimeLado.anim = 'DEBATE_READY';
        runtimeLado.animUntil = Date.now() + 60_000;
      }
    }
    this.pushDuelState(duel.id);
    this.broadcastLocal(client.sessionId, S2C.CHAT, {
      from: 'sistema',
      nick: 'Esquel',
      text: `Se armó: ${retador.alias} contra ${defensor.alias}. Hagan lugar.`,
      channel: 'sistema',
      at: Date.now(),
    }, true);
  }

  /** Manda a cada lado su vista del duelo (la mano del rival va oculta). */
  private pushDuelState(duelId: string): void {
    const duel = this.debates.get(duelId);
    if (!duel) return;
    for (const charId of [duel.challenger.charId, duel.defender.charId]) {
      const sessionId = this.sessionIdOf(charId);
      const cliente = this.clients.find((c) => c.sessionId === sessionId);
      const vista = this.debates.viewFor(duelId, charId);
      if (cliente && vista) cliente.send(S2C.DEBATE_STATE, vista);
    }
  }

  /** Cierre del duelo: XP, reputación, empujón territorial y persistencia. */
  private settleDuel(duelId: string): void {
    const duel = this.debates.get(duelId);
    if (!duel?.outcome) return;
    const outcome = duel.outcome;

    const aplicar = (charId: string, xp: number, rep: number, ganó: boolean): void => {
      const sessionId = this.sessionIdOf(charId);
      const player = this.state.players.get(sessionId ?? '');
      const runtime = this.runtimes.get(sessionId ?? '');
      if (!player || !runtime) return;
      player.xp += Math.max(0, xp);
      player.reputation = Math.max(-1000, Math.min(1000, player.reputation + rep));
      runtime.privateData.pendingXp += Math.max(0, xp);
      runtime.privateData.pendingReputation += rep;
      runtime.anim = 'IDLE';
      runtime.animUntil = 0;

      const cliente = this.clients.find((c) => c.sessionId === sessionId);
      cliente?.send(S2C.DEBATE_RESULT, { duelId, outcome });
      cliente?.send(S2C.STAT_DELTA, {
        charId,
        source: 'debate',
        xp: Math.max(0, xp),
        reputation: rep,
        reason: ganó ? 'Ganaste la discusión. Se van a acordar.' : 'Perdiste esta. Anotala y seguí.',
        at: Date.now(),
      });

      if (ganó && duel.zoneId) {
        this.reportQuestEvent({
          kind: 'duelo_ganado',
          charId,
          factionId: player.factionId,
          rankTier: player.rankTier,
          at: { x: runtime.x, y: 0, z: runtime.z },
        });
      }
    };

    if (outcome.winner && outcome.loser) {
      aplicar(outcome.winner, outcome.rewards.winnerXp, outcome.rewards.winnerRep, true);
      aplicar(outcome.loser, outcome.rewards.loserXp, outcome.rewards.loserRep, false);
    } else {
      aplicar(duel.challenger.charId, outcome.rewards.winnerXp, 0, false);
      aplicar(duel.defender.charId, outcome.rewards.loserXp, 0, false);
    }

    if (outcome.zoneImpact) {
      this.territory.applyDuelImpact(outcome.zoneImpact.zoneId, outcome.zoneImpact.factionId, outcome.zoneImpact.delta);
    }

    this.debates.dispose(duelId);
  }

  /** Cuánta gente hay mirando: el público pesa en el duelo. */
  private spectatorsAround(sessionId: string): number {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return 0;
    let n = 0;
    for (const [otro, r] of this.runtimes) {
      if (otro === sessionId) continue;
      if (Math.hypot(r.x - runtime.x, r.z - runtime.z) <= 30) n++;
    }
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Misiones                                                            */
  /* ------------------------------------------------------------------ */

  private handleQuestJoin(client: Client, message: { questId: string }): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const resultado = this.quests.join(
      message.questId,
      {
        charId: player.characterId,
        sessionId: client.sessionId,
        factionId: player.factionId,
        rankTier: player.rankTier,
        careerItems: unlockedItems(player.rankTier as RankLevel),
      },
      Date.now(),
    );

    if (!resultado.ok) {
      client.send(S2C.TOAST, { kind: 'alerta', text: resultado.error, ttlMs: 4000 });
      return;
    }
    // `joined` sólo va en esta respuesta personal: el QUEST_UPDATED que se
    // difunde al resto lleva únicamente el headcount.
    client.send(S2C.QUEST_UPDATED, {
      questId: resultado.quest.id,
      headcount: resultado.quest.headcount,
      joined: true,
      myCompletion: 0,
    });
    client.send(S2C.TOAST, { kind: 'exito', text: `Te anotaste: ${resultado.quest.title}.`, ttlMs: 4000 });
  }

  /**
   * Avance reportado por el cliente. El servidor confirma que el jugador estaba
   * donde dice que estaba: sin eso, cualquiera completa una misión desde el sillón.
   */
  private handleQuestProgress(
    client: Client,
    message: { questId: string; objectiveId: string; amount: number; kind?: string },
  ): void {
    const player = this.state.players.get(client.sessionId);
    const runtime = this.runtimes.get(client.sessionId);
    if (!player || !runtime) return;
    if (!this.spendIntent(runtime)) return;

    const instancia = this.quests.get(message.questId);
    if (!instancia) return;
    const objetivo = instancia.quest.objectives.find((o) => o.id === message.objectiveId);
    if (!objetivo) return;

    // Validación espacial: el reporte tiene que venir de donde ocurre la misión.
    const referencia = objetivo.position ?? instancia.quest.center;
    const radio = (objetivo.radiusM ?? instancia.quest.radiusM) + 8;
    if (Math.hypot(runtime.x - referencia.x, runtime.z - referencia.z) > radio) {
      client.send(S2C.TOAST, { kind: 'alerta', text: 'Estás lejos de donde pasa la cosa.', ttlMs: 3000 });
      return;
    }

    const kind = (message.kind ?? this.eventKindFor(objetivo.kind)) as QuestEventKind;
    this.reportQuestEvent({
      kind,
      charId: player.characterId,
      factionId: player.factionId,
      rankTier: player.rankTier,
      at: { x: runtime.x, y: runtime.y, z: runtime.z },
      amount: Math.max(1, Math.min(5, Math.round(message.amount || 1))),
      ref: message.objectiveId,
    });
  }

  /** Traduce el tipo de objetivo al evento del mundo que lo hace avanzar. */
  private eventKindFor(kind: string): QuestEventKind {
    switch (kind) {
      case 'pegar':
        return 'afiche_pegado';
      case 'ganar_duelo':
        return 'duelo_ganado';
      case 'transportar':
      case 'entregar':
        return 'bulto_entregado';
      case 'checkpoint':
        return 'checkpoint';
      case 'inaugurar':
        return 'obra_avanzada';
      case 'despejar':
        return 'vereda_despejada';
      case 'responder':
        return 'pregunta_respondida';
      case 'encuestar':
        return 'encuesta_completada';
      default:
        return 'presencia';
    }
  }

  /** Ofrece un hecho del mundo a todas las misiones activas. */
  private reportQuestEvent(event: QuestEvent): void {
    const eventos = this.quests.report(event, this.questTickInput());
    this.dispatchQuestEvents(eventos);
  }

  /** Reparte a los clientes lo que devolvió el gestor de misiones. */
  private dispatchQuestEvents(eventos: ReturnType<QuestManager['tick']>): void {
    for (const evento of eventos) {
      if (evento.kind === 'anunciada') {
        this.stats.misiones++;
        this.broadcast(S2C.QUEST_ANNOUNCED, { quest: evento.quest });
        continue;
      }
      if (evento.kind === 'actualizada') {
        this.broadcast(S2C.QUEST_UPDATED, {
          questId: evento.quest.id,
          headcount: evento.quest.headcount,
        });
        continue;
      }

      const sessionId = this.sessionIdOf(evento.charId);
      const cliente = this.clients.find((c) => c.sessionId === sessionId);
      if (!cliente) continue;

      if (evento.kind === 'progreso') {
        cliente.send(S2C.QUEST_PROGRESS, {
          questId: evento.questId,
          counters: evento.progress.counters,
          completion: evento.progress.completion,
          finished: evento.progress.finished,
        });
        continue;
      }

      // Cierre: XP, reputación, guita y empujón territorial.
      const player = this.state.players.get(sessionId ?? '');
      const runtime = this.runtimes.get(sessionId ?? '');
      if (player && runtime) {
        player.xp += evento.reward.xp;
        player.reputation = Math.max(-1000, Math.min(1000, player.reputation + evento.reward.reputation));
        runtime.privateData.pendingXp += evento.reward.xp;
        runtime.privateData.pendingReputation += evento.reward.reputation;
        runtime.privateData.pendingMoney += evento.reward.money;
        runtime.privateData.money += evento.reward.money;

        const instancia = this.quests.get(evento.questId);
        const zoneId = instancia?.quest.zoneId;
        if (zoneId && evento.outcome === 'completada') {
          this.territory.applyQuestImpact(zoneId, player.factionId, evento.reward.territoryScore);
        }

        // Fila de `misiones_historial`: viaja en el próximo volcado a Hostinger.
        if (instancia) {
          const participante = instancia.participants.get(evento.charId);
          const clock = buildWorldClock(Date.now());
          runtime.privateData.pendingQuests.push({
            instanceId: instancia.quest.id,
            slug: instancia.quest.slug,
            type: instancia.quest.type,
            trigger: instancia.quest.trigger,
            barrio: instancia.quest.barrio,
            ...(instancia.quest.zoneId ? { zoneId: instancia.quest.zoneId } : {}),
            factionId: player.factionId,
            rankTier: player.rankTier,
            startedAt: participante?.progress.joinedAt ?? instancia.quest.startsAt,
            finishedAt: Date.now(),
            outcome: evento.outcome,
            completion: evento.completion,
            contribution: participante?.progress.contribution ?? 1,
            counters: participante?.progress.counters ?? {},
            xp: evento.reward.xp,
            reputation: evento.reward.reputation,
            money: evento.reward.money,
            territoryScore: evento.reward.territoryScore,
            weather: this.weatherFeed.weather.condition,
            localHour: Math.floor(clock.localMinute / 60),
            seed: instancia.seed,
          });
        }
      }

      cliente.send(S2C.QUEST_RESULT, {
        questId: evento.questId,
        outcome: evento.outcome,
        completion: evento.completion,
        delta: {
          charId: evento.charId,
          source: 'mision',
          xp: evento.reward.xp,
          reputation: evento.reward.reputation,
          money: evento.reward.money,
          reason: evento.text,
          at: Date.now(),
        },
      });
    }
  }

  /** Contexto que consumen el gestor de misiones y el de territorio. */
  private questTickInput(): Parameters<QuestManager['tick']>[0] {
    const weather = this.weatherFeed.weather;
    const clock = buildWorldClock(Date.now());
    const online: Record<number, number> = {};
    for (const [, player] of this.state.players) {
      online[player.factionId] = (online[player.factionId] ?? 0) + 1;
    }
    const territoryBuff: Record<number, { xp: number; money: number }> = {};
    for (const faction of FACTIONS) {
      const buff = this.territory.buffFor(faction.id as unknown as number);
      territoryBuff[faction.id as unknown as number] = { xp: buff.xp, money: buff.money };
    }

    return {
      now: Date.now(),
      weather: weather.condition,
      snowCoverage: weather.snowCoverage,
      windGustKph: weather.windGustKph,
      localHour: Math.floor(clock.localMinute / 60),
      electionPhase: this.state.election.phase,
      online,
      zones: this.territory.snapshot(),
      contextMultiplier: contextMultiplier({
        questType: 'SONDEO_VECINAL',
        weather: weather.condition,
        localHour: Math.floor(clock.localMinute / 60),
        difficulty: 0.5,
      }),
      territoryBuff,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Territorio                                                          */
  /* ------------------------------------------------------------------ */

  /** Mide el poder en las cinco zonas y anuncia lo que cambió. */
  private tickTerritory(deltaS: number): void {
    const participantes: Participant[] = [];
    for (const [sessionId, runtime] of this.runtimes) {
      const player = this.state.players.get(sessionId);
      if (!player || player.factionId === 0) continue;
      participantes.push({
        charId: player.characterId,
        factionId: player.factionId,
        rankLevel: Math.max(1, Math.min(10, player.rankTier)) as RankLevel,
        position: { x: runtime.x, y: runtime.y, z: runtime.z },
        afk: player.afk,
        speaking: player.speaking,
      });
    }

    const holdPerks: Record<number, number> = {};
    for (const faction of FACTIONS) {
      holdPerks[faction.id as unknown as number] = faction.perks.territoryHold;
    }

    const eventos = this.territory.tick({
      participants: participantes,
      weather: this.weatherFeed.weather.condition,
      holdPerks,
      now: Date.now(),
      deltaS,
    });

    for (const evento of eventos) {
      if (evento.kind === 'captura') {
        this.stats.capturas++;
        this.state.ticker = evento.text;
        this.broadcast(S2C.ZONE_FLIP, {
          zoneId: evento.zoneId,
          ...(evento.previousFaction ? { from: evento.previousFaction } : {}),
          to: evento.factionId,
          share: evento.share,
          at: Date.now(),
        });
      }
      this.broadcast(S2C.CHAT, {
        from: 'sistema',
        nick: 'Esquel',
        text: evento.text,
        channel: 'sistema',
        at: Date.now(),
      });
    }

    // Presencia en zona = avance de las misiones de aguante.
    for (const participante of participantes) {
      const zona = this.territory.zoneAt(participante.position);
      if (!zona) continue;
      this.reportQuestEvent({
        kind: 'presencia',
        charId: participante.charId,
        factionId: participante.factionId,
        rankTier: participante.rankLevel,
        at: participante.position,
        amount: Math.round(deltaS),
      });
    }

    // El control de zonas mueve la intención de voto simulada.
    const support = this.territory.supportDeltas();
    for (const [factionId, delta] of Object.entries(support)) {
      const resumen = this.state.factions.get(factionId);
      if (resumen) {
        resumen.support = Math.max(0, Math.min(1, resumen.support + delta));
        resumen.territoryCells = this.territory.zonesOf(Number(factionId)).length;
      }
    }
  }

  /** Manda la foto de las zonas a cada cliente, con su buff. */
  private pushZones(): void {
    const snapshot = this.territory.snapshot();
    for (const client of this.clients) {
      const player = this.state.players.get(client.sessionId);
      const buff = this.territory.buffFor(player?.factionId ?? 0);
      client.send(S2C.ZONES, { zones: snapshot, buff });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Modo Candidato                                                      */
  /* ------------------------------------------------------------------ */

  private handleCampaignSettle(client: Client, message: { result: CampaignResult }): void {
    const player = this.state.players.get(client.sessionId);
    const runtime = this.runtimes.get(client.sessionId);
    if (!player || !runtime) return;

    const resultado = this.modes.settleCampaign(message.result, player.rankTier as RankLevel);
    if (!resultado.ok) {
      client.send(S2C.CAMPAIGN_RESULT, { ok: false, xp: 0, reputation: 0, money: 0, text: resultado.error });
      return;
    }

    const { payout } = resultado;
    player.xp += payout.xp;
    player.reputation = Math.max(-1000, Math.min(1000, player.reputation + payout.reputation));
    runtime.privateData.pendingXp += payout.xp;
    runtime.privateData.pendingReputation += payout.reputation;
    runtime.privateData.pendingMoney += payout.money;
    runtime.privateData.money += payout.money;

    // Fila de `campanas_candidato`: la partida queda auditable con su semilla.
    runtime.privateData.pendingCampaigns.push({
      archetype: message.result.archetype,
      seed: message.result.seed,
      decisions: message.result.decisions,
      cajaCampana: Math.round(message.result.finalStats.cajaCampana),
      roscaPolitica: Math.round(message.result.finalStats.roscaPolitica),
      imagenPublica: Math.round(message.result.finalStats.imagenPublica),
      nivelEscandalo: Math.round(message.result.finalStats.nivelEscandalo),
      ending: message.result.ending,
      turnsPlayed: message.result.turnsPlayed,
      xp: payout.xp,
      reputation: payout.reputation,
      money: payout.money,
    });

    client.send(S2C.CAMPAIGN_RESULT, {
      ok: true,
      xp: payout.xp,
      reputation: payout.reputation,
      money: payout.money,
      text: payout.text,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Consola Live-Ops (la usa el dashboard, vía HTTP)                    */
  /* ------------------------------------------------------------------ */

  /** Nombre del shard, para que el registro sepa a quién le habla. */
  get shardName(): string {
    return this.state.shardName;
  }

  /** Población actual del shard. */
  get population(): number {
    return this.state.players.size;
  }

  /** El motor político de esta sala, para la foto en vivo. */
  get intelligence(): IntelligenceEngine {
    return this.intel;
  }

  /**
   * Ejecuta un comando del dashboard. Es el mismo camino que usa el juego, sólo
   * que disparado a mano: una noticia bomba entra al catálogo de misiones igual
   * que una noticia real, y una misión forzada nace con el mismo blueprint.
   */
  runLiveOps(command: LiveOpsCommand): LiveOpsResult {
    const at = new Date().toISOString() as LiveOpsResult['at'];

    switch (command.kind) {
      case 'NOTICIA_BOMBA': {
        const n = command.news;
        const senal: NewsSignal = {
          id: `admin-${Date.now().toString(36)}`,
          source: 'admin',
          headline: n.headline,
          summary: n.body,
          publishedAt: at,
          topics: [n.topic],
          barrios: n.barrio ? [n.barrio] : [],
          sentiment: Math.max(-1, Math.min(1, n.sentiment)),
          salience: n.salience,
          ...(n.factionId !== undefined ? { targetFaction: n.factionId } : {}),
        };

        // La noticia se anuncia en el chat del shard y queda ofrecida al catálogo:
        // las tipologías que reaccionan a noticias deciden solas si aparecen.
        this.broadcast(S2C.CHAT, {
          from: 'sistema',
          nick: 'Esquel Noticias',
          text: `📰 ${n.headline}`,
          channel: 'sistema',
          at: Date.now(),
        });

        const evento = this.quests.spawn(
          {
            type: n.sentiment < -0.3 ? 'OPERACION_DESMENTIDA' : 'CONFERENCIA_PRENSA',
            ...(n.barrio ? { barrio: n.barrio } : {}),
            ...(n.factionId !== undefined ? { factionId: n.factionId } : {}),
            news: senal,
            trigger: 'noticia',
          },
          this.questTickInput(),
        );
        if (evento) this.dispatchQuestEvents([evento]);

        return {
          ok: true,
          command: 'NOTICIA_BOMBA',
          text: evento
            ? `Salió la noticia y se armó una misión en consecuencia.`
            : `Salió la noticia. No entró misión: el cupo del shard está lleno.`,
          ...(evento && evento.kind === 'anunciada' ? { questId: evento.quest.id } : {}),
          at,
        };
      }

      case 'SPAWN_QUEST': {
        const evento = this.quests.spawn(
          {
            type: command.questType,
            ...(command.barrio ? { barrio: command.barrio } : {}),
            ...(command.difficulty !== undefined ? { difficulty: command.difficulty } : {}),
            trigger: 'admin',
          },
          this.questTickInput(),
        );
        if (!evento) {
          return { ok: false, command: 'SPAWN_QUEST', text: 'No entró: el cupo de misiones del shard está lleno.', at };
        }
        this.dispatchQuestEvents([evento]);
        return {
          ok: true,
          command: 'SPAWN_QUEST',
          text: `Se armó ${command.questType} en el shard.`,
          ...(evento.kind === 'anunciada' ? { questId: evento.quest.id } : {}),
          at,
        };
      }

      case 'CERRAR_QUEST': {
        const instancia = this.quests.get(command.questId);
        if (!instancia) return { ok: false, command: 'CERRAR_QUEST', text: 'Esa misión ya no existe.', at };
        this.quests.cancel(command.questId);
        this.broadcast(S2C.QUEST_UPDATED, { questId: command.questId, headcount: {}, cancelled: true });
        return { ok: true, command: 'CERRAR_QUEST', text: 'Misión cerrada a mano.', questId: command.questId, at };
      }

      default:
        return { ok: false, command: 'SPAWN_QUEST', text: 'Comando desconocido.', at };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Índices                                                             */
  /* ------------------------------------------------------------------ */

  private charIdOf(sessionId: string): string | null {
    return this.state.players.get(sessionId)?.characterId ?? null;
  }

  private sessionIdOf(charId: string): string | null {
    for (const [sessionId, player] of this.state.players) {
      if (player.characterId === charId) return sessionId;
    }
    return null;
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
      // Duelos: al que se le va el tiempo, pasa solo.
      for (const [, player] of this.state.players) {
        const duel = this.debates.findByChar(player.characterId);
        if (!duel) continue;
        const resultado = this.debates.checkTimeout(duel.id, now);
        if (resultado?.ok) {
          this.pushDuelState(duel.id);
          if (resultado.finished) this.settleDuel(duel.id);
        }
      }
    }

    // Misiones: se revisa el catálogo cada dos segundos.
    if (this.tickCount % (this.config.world.tickHz * 2) === 0) {
      this.dispatchQuestEvents(this.quests.tick(this.questTickInput()));
    }

    // Territorio: se mide cada diez segundos, como manda la fórmula.
    if (this.tickCount % (this.config.world.tickHz * TERRITORY.TICK_SECONDS) === 0) {
      this.tickTerritory(TERRITORY.TICK_SECONDS);
      this.pushZones();
    }

    if (this.tickCount % (this.config.world.tickHz * 30) === 0) void this.flushStats(false);

    // La ventana en vivo del motor político se recicla sola: el mapa de calor
    // muestra el pueblo de ahora, no el acumulado desde que arrancó el proceso.
    if (this.tickCount % (this.config.world.tickHz * 60) === 0) this.intel.rollWindowIfNeeded();
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
    // `questPayload` está definido fuera de la clase: es una traducción pura de
    // las colas pendientes al formato del lote.

    const deltas: StatDelta[] = [];

    for (const [sessionId, runtime] of this.runtimes) {
      const player = this.state.players.get(sessionId);
      if (!player || !player.characterId) continue;
      const p = runtime.privateData;
      if (
        !final &&
        p.pendingXp === 0 &&
        p.pendingMoney === 0 &&
        p.pendingReputation === 0 &&
        p.pendingQuests.length === 0 &&
        p.pendingCampaigns.length === 0 &&
        p.playSeconds < 30
      ) {
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
        ...questPayload(p),
      });
      p.pendingXp = 0;
      p.pendingMoney = 0;
      p.pendingReputation = 0;
      p.playSeconds = 0;
      p.pendingQuests = [];
      p.pendingCampaigns = [];
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
    if (
      !final &&
      p.pendingXp === 0 &&
      p.pendingReputation === 0 &&
      p.pendingMoney === 0 &&
      p.pendingQuests.length === 0 &&
      p.pendingCampaigns.length === 0
    ) {
      return;
    }

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
          ...questPayload(p),
        },
      ]),
    );
    p.pendingXp = 0;
    p.pendingMoney = 0;
    p.pendingReputation = 0;
    p.playSeconds = 0;
    p.pendingQuests = [];
    p.pendingCampaigns = [];
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
    if (player) {
      const duel = this.debates.findByChar(player.characterId);
      if (duel) {
        this.debates.forfeit(duel.id, player.characterId, 'desconexion');
        this.pushDuelState(duel.id);
        this.settleDuel(duel.id);
      }
      for (const quest of this.quests.questsOf(player.characterId)) {
        const evento = this.quests.abandon(quest.id, player.characterId, this.questTickInput());
        if (evento) this.dispatchQuestEvents([evento]);
      }
      this.modes.remove(sessionId);
    }
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
      duelosAbiertos: this.debates.openDuels,
      duelosJugados: this.stats.duelos,
      misionesActivas: this.quests.activeCount,
      misionesPublicadas: this.stats.misiones,
      zonasCapturadas: this.stats.capturas,
      hostingerOk: this.bridge.healthy,
      lotesPendientes: this.bridge.pendingBatches,
    };
  }
}
