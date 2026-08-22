/**
 * Jugadores remotos: aparición, desaparición y suavizado.
 *
 * El servidor manda posiciones diez veces por segundo; la pantalla dibuja
 * sesenta. Entre paquete y paquete, cada avatar remoto se interpola hacia su
 * última posición conocida (lerp con una constante de tiempo corta), así los
 * vecinos caminan suave en vez de dar saltitos.
 *
 * También aplica la regla del AOI: si alguien deja de aparecer en los paquetes,
 * a los pocos segundos se lo saca de la escena. No hay avatares fantasma de
 * gente que se fue a seis manzanas.
 */

import { MathUtils, Group, type Scene, Vector3 } from 'three';
import type { AvatarAnimation } from '@esquel/shared';
import { buildAvatar, nameplateFor, type BuiltAvatar } from './AvatarBuilder.ts';
import type { AoiPlayer, RosterEntry } from '../net/NetworkClient.ts';

/** Segundos sin recibir paquetes antes de sacar a alguien de la escena. */
const STALE_SECONDS = 4;
/** Constante de suavizado: más alto, más pegado al servidor. */
const LERP_LAMBDA = 12;

export interface RemotePlayerView {
  readonly sessionId: string;
  /** `personajes.id`: lo necesita el desafío de duelo. */
  readonly characterId: string;
  readonly alias: string;
  readonly nameplate: string;
  readonly factionId: number;
  readonly rankTier: number;
  readonly speaking: boolean;
  /** Posición interpolada actual. */
  readonly position: Vector3;
  /** Altura de la cabeza, para colgar la placa y la burbuja. */
  readonly headY: number;
}

interface RemotePlayer {
  readonly sessionId: string;
  characterId: string;
  readonly avatar: BuiltAvatar;
  readonly group: Group;
  /** Objetivo del servidor. */
  target: Vector3;
  targetYaw: number;
  anim: AvatarAnimation;
  speaking: boolean;
  alias: string;
  nameplate: string;
  factionId: number;
  rankTier: number;
  lastSeen: number;
  /** Velocidad estimada, para la cadencia de la caminata. */
  speed: number;
}

export class RemotePlayerManager {
  private readonly scene: Scene;
  private readonly players = new Map<string, RemotePlayer>();
  private readonly root = new Group();
  /** Identidad que llega por el estado replicado (alias, facción, rango). */
  private roster = new Map<string, RosterEntry>();
  private selfSessionId = '';

  constructor(scene: Scene) {
    this.scene = scene;
    this.root.name = 'RemotePlayers';
    this.scene.add(this.root);
  }

  setSelf(sessionId: string): void {
    this.selfSessionId = sessionId;
  }

  /** Padrón del shard: identidad y datos que no viajan en el canal rápido. */
  updateRoster(entries: readonly RosterEntry[]): void {
    this.roster = new Map(entries.map((entry) => [entry.sessionId, entry]));
    for (const [sessionId, player] of this.players) {
      const entry = this.roster.get(sessionId);
      if (!entry) continue;
      if (entry.factionId !== player.factionId) {
        player.factionId = entry.factionId;
        player.avatar.setFaction(entry.factionId);
      }
      if (entry.rankTier !== player.rankTier) {
        player.rankTier = entry.rankTier;
        player.avatar.setRank(entry.rankTier);
      }
      player.alias = entry.alias;
      player.characterId = entry.characterId;
      player.nameplate = nameplateFor(entry.alias, entry.rankTier, entry.factionId);
    }
  }

  /** Paquete del canal AOI: las transformadas finas de los vecinos. */
  applyAoi(packet: readonly AoiPlayer[]): void {
    const now = performance.now() / 1000;
    for (const remote of packet) {
      if (remote.sessionId === this.selfSessionId) continue;
      let player = this.players.get(remote.sessionId);

      if (!player) {
        const entry = this.roster.get(remote.sessionId);
        const factionId = entry?.factionId ?? 0;
        const rankTier = entry?.rankTier ?? 1;
        const alias = entry?.alias ?? 'Vecino';
        const avatar = buildAvatar({ factionId, rankTier, seed: remote.sessionId });
        avatar.group.position.set(remote.x, remote.y, remote.z);
        this.root.add(avatar.group);

        player = {
          sessionId: remote.sessionId,
          characterId: entry?.characterId ?? '',
          avatar,
          group: avatar.group,
          target: new Vector3(remote.x, remote.y, remote.z),
          targetYaw: remote.yaw,
          anim: remote.anim,
          speaking: remote.voz,
          alias,
          nameplate: nameplateFor(alias, rankTier, factionId),
          factionId,
          rankTier,
          lastSeen: now,
          speed: 0,
        };
        this.players.set(remote.sessionId, player);
      }

      const dx = remote.x - player.target.x;
      const dz = remote.z - player.target.z;
      const dt = Math.max(0.05, now - player.lastSeen);
      player.speed = Math.hypot(dx, dz) / dt;
      player.target.set(remote.x, remote.y, remote.z);
      player.targetYaw = remote.yaw;
      player.anim = remote.anim;
      player.speaking = remote.voz;
      player.lastSeen = now;
    }
  }

  /** El servidor avisa quién salió del radio de interés. */
  removeMany(sessionIds: readonly string[]): void {
    for (const sessionId of sessionIds) this.remove(sessionId);
  }

  remove(sessionId: string): void {
    const player = this.players.get(sessionId);
    if (!player) return;
    player.avatar.dispose();
    this.players.delete(sessionId);
  }

  /** Interpola y anima. Se llama una vez por cuadro. */
  update(dt: number): void {
    const now = performance.now() / 1000;
    for (const [sessionId, player] of this.players) {
      if (now - player.lastSeen > STALE_SECONDS) {
        this.remove(sessionId);
        continue;
      }

      const g = player.group;
      g.position.x = MathUtils.damp(g.position.x, player.target.x, LERP_LAMBDA, dt);
      g.position.z = MathUtils.damp(g.position.z, player.target.z, LERP_LAMBDA, dt);

      const bob = player.avatar.update(dt, player.speed, player.anim);
      g.position.y = MathUtils.damp(g.position.y, player.target.y + bob, LERP_LAMBDA, dt);

      // Giro por el camino corto.
      let delta = player.targetYaw - g.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      g.rotation.y += delta * (1 - Math.exp(-10 * dt));
    }
  }

  /** Vista para la capa de HUD: placas de nombre, burbujas e indicador de voz. */
  views(): RemotePlayerView[] {
    const out: RemotePlayerView[] = [];
    for (const player of this.players.values()) {
      out.push({
        sessionId: player.sessionId,
        characterId: player.characterId,
        alias: player.alias,
        nameplate: player.nameplate,
        factionId: player.factionId,
        rankTier: player.rankTier,
        speaking: player.speaking,
        position: player.group.position,
        headY: 2.15,
      });
    }
    return out;
  }

  /** Posición actual de un vecino, para el paneo del audio espacial. */
  positionOf(sessionId: string): Vector3 | undefined {
    return this.players.get(sessionId)?.group.position;
  }

  get count(): number {
    return this.players.size;
  }

  dispose(): void {
    for (const player of this.players.values()) player.avatar.dispose();
    this.players.clear();
    this.root.removeFromParent();
  }
}
