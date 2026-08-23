/**
 * Escena de la ciudad: el punto donde se juntan el motor voxel, el clima real,
 * el ciclo solar, el jugador y —desde la Fase 2— los demás vecinos.
 *
 * Todo el trabajo pesado vive en clases fuera de React (`VoxelWorld`,
 * `DayNightCycle`, `WeatherParticles`, `PlayerController`, `RemotePlayerManager`).
 * Este componente las crea, las conecta al bucle de render y empuja al store lo
 * que el HUD necesita, a baja frecuencia.
 *
 * Ritmos del bucle:
 *   60 Hz  render, interpolación de avatares remotos, audio espacial
 *   ~20 Hz envío de movimiento al servidor (con dead reckoning)
 *   15 Hz  proyección de placas y burbujas a coordenadas de pantalla
 *    4 Hz  volcado del HUD y del padrón
 *    1 Hz  clima, nieve en los techos, luces encendidas
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CircleGeometry,
  Color,
  DoubleSide,
  FogExp2,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
  Vector3,
  type DirectionalLight,
  type HemisphereLight,
  type PerspectiveCamera,
} from 'three';
import {
  FACTION_BY_ID,
  animationFromLocomotion,
  barrioOfCell,
  careerLabel,
  clampUnit,
  worldToCell,
  type AvatarAnimation,
  type AgeBand,
  type DebateOutcome,
  type DebateView,
  type GenderIdentity,
  type LiveQuest,
  type PoliticalInterest,
} from '@esquel/shared';
import { CONFIG } from '../config.ts';
import { VoxelWorld } from '../engine/VoxelWorld.ts';
import { PALETTE } from '../engine/VoxelPalette.ts';
import { DayNightCycle } from '../environment/DayNightCycle.ts';
import { WeatherParticles } from '../environment/ParticleEffects.ts';
import { createSkyMaterial, updateSkyMaterial } from '../environment/WeatherShaders.ts';
import { weatherService } from '../environment/WeatherService.ts';
import { buildAvatar, factionCssColor, nameplateFor } from '../entities/AvatarBuilder.ts';
import { RemotePlayerManager } from '../entities/RemotePlayerManager.ts';
import { NPCManager, type NpcEffect } from '../entities/npc/NPCManager.ts';
import { SponsorManager } from '../world/sponsorship/SponsorManager.ts';
import type { SponsorBuff } from '@esquel/shared';
import { PlayerController } from '../player/PlayerController.ts';
import type { InputState } from '../player/useKeyboard.ts';
import { networkClient } from '../net/NetworkClient.ts';
import { spatialVoice } from '../audio/voice.ts';
import type { Sesion } from '../net/session.ts';
import { describePosition } from '../world/EsquelStreetGrid.ts';
import { useGameStore, type OverlayEntry, type ZoneEntry } from '../state/gameStore.ts';
import { initTelemetry, stopTelemetry, telemetry, track } from '../intelligence/TelemetryCollector.ts';

export interface CitySceneProps {
  readonly input: React.MutableRefObject<InputState>;
  /** Hora local forzada (0..24) para capturas y pruebas; `null` = hora real. */
  readonly forcedHour?: number | null;
  /** Punto de aparición alternativo (x,z de mundo); `null` = el del store. */
  readonly spawn?: { x: number; z: number } | null;
  /** Sesión con Hostinger. Sin ella, el juego corre en modo desconectado. */
  readonly session?: Sesion | null;
}

/** Fracción del año en que los álamos están dorados (marzo-mayo en el sur). */
const autumnFactor = (month: number): number => {
  if (month === 2) return 0.4;
  if (month === 3) return 0.9;
  if (month === 4) return 0.7;
  if (month === 5) return 0.2;
  return 0;
};

/** Cuánto dura una burbuja de chat sobre la cabeza. */
const BURBUJA_MS = 7000;

/**
 * Alcance del encare, en metros. El servidor exige 18: se pide con 17 para que
 * un paso del rival no convierta el desafío en un rechazo.
 */
const DESAFIO_ALCANCE_M = 17;

/** El militante de otro bando más cercano dentro del alcance de un encare. */
const rivalMasCercano = (
  vistas: readonly { characterId: string; factionId: number; position: Vector3 }[],
  desde: Vector3,
  miFaccion: number,
): { characterId: string } | null => {
  let mejor: { characterId: string } | null = null;
  let mejorD = DESAFIO_ALCANCE_M;
  for (const v of vistas) {
    if (!v.characterId || v.factionId === 0 || v.factionId === miFaccion) continue;
    const d = v.position.distanceTo(desde);
    if (d <= mejorD) {
      mejor = { characterId: v.characterId };
      mejorD = d;
    }
  }
  return mejor;
};

/** Traduce el resultado del duelo a una línea de chat que se entienda de una. */
const resumenDuelo = (outcome: DebateOutcome, miCharId: string): string => {
  const turnos = `${outcome.turns} turno${outcome.turns === 1 ? '' : 's'}`;
  if (outcome.draw) return `Empate técnico en ${turnos}: nadie se llevó la esquina.`;
  const gane = outcome.winner === miCharId;
  if (outcome.reason === 'abandono') {
    return gane ? `Se te rajó en ${turnos}. Punto tuyo.` : `Te rajaste en ${turnos}. Pasa.`;
  }
  if (outcome.reason === 'desconexion') return gane ? 'Se le cortó justo. Ganaste igual.' : 'Se te cortó el duelo.';
  if (outcome.reason === 'turnos') {
    return gane ? `Ganaste por puntos en ${turnos}.` : `Perdiste por puntos en ${turnos}.`;
  }
  if (gane) {
    const xp = outcome.rewards.winnerXp;
    return outcome.dominance > 0.6
      ? `Lo dejaste sin palabras en ${turnos}. +${xp} XP y la vereda es tuya.`
      : `Le ganaste raspando en ${turnos}. +${xp} XP.`;
  }
  return outcome.dominance > 0.6
    ? `Te hicieron pelota en ${turnos}. A entrenar la labia.`
    : `Perdiste por poco en ${turnos}. La próxima.`;
};

export const CityScene = ({
  input,
  forcedHour = null,
  spawn: spawnOverride = null,
  session = null,
}: CitySceneProps): JSX.Element => {
  const { scene, camera, gl } = useThree();
  const dirLightRef = useRef<DirectionalLight>(null);
  const hemiLightRef = useRef<HemisphereLight>(null);

  const store = useGameStore;
  const spawn = useGameStore((s) => s.player.position);
  const factionId = useGameStore((s) => s.player.factionId);

  /* --- piezas del motor, creadas una sola vez --- */
  const world = useMemo(
    () =>
      new VoxelWorld(scene, {
        renderDistanceCells: CONFIG.render.distanceCells,
        detailCells: CONFIG.render.detailCells,
        buildBudget: 2,
      }),
    [scene],
  );

  const cycle = useMemo(() => new DayNightCycle(forcedHour === null ? {} : { forcedHour }), [forcedHour]);
  const particles = useMemo(() => new WeatherParticles(scene), [scene]);
  const remotes = useMemo(() => new RemotePlayerManager(scene), [scene]);

  /** Buff temporal de piernas (choque de manos del Deportista). */
  const buffPiernas = useRef({ mult: 1, hasta: 0 });

  /** Aplica lo que dejó una interacción con un NPC. */
  const aplicarEfecto = useCallback(
    (efecto: NpcEffect): void => {
      const s = store.getState();
      switch (efecto.kind) {
        case 'salud':
          s.setPlayer({ health: Math.max(0, Math.min(s.player.healthMax, s.player.health + efecto.amount)) });
          break;
        case 'reputacion':
          s.setPlayer({ reputation: s.player.reputation + efecto.amount });
          break;
        case 'guita':
          s.setPlayer({ money: Math.max(0, s.player.money + efecto.amount) });
          break;
        case 'velocidad':
          buffPiernas.current = { mult: efecto.mult, hasta: Date.now() + efecto.seconds * 1000 };
          break;
        case 'accion':
          networkClient.sendAction(efecto.action);
          break;
      }
    },
    [store],
  );

  /** Buff de abrigo: la nieve deja de frenarte hasta que se corte. */
  const abrigoHasta = useRef(0);

  const aplicarBuffComercial = useCallback(
    (buff: SponsorBuff): void => {
      switch (buff.kind) {
        case 'velocidad':
          buffPiernas.current = { mult: buff.magnitude, hasta: Date.now() + buff.seconds * 1000 };
          break;
        case 'abrigo':
          abrigoHasta.current = Date.now() + buff.seconds * 1000;
          break;
        case 'labia':
          // La labia se resuelve en el servidor: el cliente sólo avisa que se
          // tomó el chocolate y el duelo lo tiene en cuenta al abrirse.
          networkClient.sendAction(`buff:${buff.slug}`);
          break;
      }
    },
    [],
  );

  const sponsors = useMemo(
    () =>
      new SponsorManager({
        scene,
        moneyOf: () => store.getState().player.money,
        onEvent: (evento) => {
          const s = store.getState();
          switch (evento.kind) {
            case 'impresion':
              track({ name: 'sponsor_impression', sponsorId: evento.sponsor.id, seconds: evento.seconds, distanceM: evento.distanceM });
              break;
            case 'entrada':
              track({ name: 'sponsor_enter', sponsorId: evento.sponsor.id });
              s.pushChat({ nick: evento.sponsor.name, text: evento.sponsor.greeting, channel: 'sistema', at: Date.now() });
              break;
            case 'consumo': {
              track({ name: 'sponsor_buff_claim', sponsorId: evento.sponsor.id, buffSlug: evento.buff.slug });
              if (evento.buff.priceCentavos > 0) {
                s.setPlayer({ money: Math.max(0, s.player.money - evento.buff.priceCentavos) });
                track({ name: 'shop_purchase', itemSlug: evento.buff.slug, centavos: evento.buff.priceCentavos });
              }
              aplicarBuffComercial(evento.buff);
              s.pushChat({ nick: 'Esquel', text: evento.buff.description, channel: 'sistema', at: Date.now() });
              break;
            }
            case 'sin_guita':
              s.pushChat({
                nick: evento.sponsor.name,
                text: `Te faltan $ ${Math.ceil(evento.faltan / 100)}. Volvé cuando cobres.`,
                channel: 'sistema',
                at: Date.now(),
              });
              break;
            case 'cerrado':
              s.pushChat({ nick: 'Esquel', text: `${evento.sponsor.name} está cerrado a esta hora.`, channel: 'sistema', at: Date.now() });
              break;
          }
        },
      }),
    // `aplicarBuffComercial` es estable: usa refs y el store, no props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, store],
  );

  const npcs = useMemo(
    () =>
      new NPCManager({
        scene,
        seed: 'esquel-2027',
        onEvent: (evento) => {
          store.getState().pushChat({ nick: 'Esquel', text: evento.line, channel: 'sistema', at: Date.now() });
          for (const efecto of evento.effects) aplicarEfecto(efecto);
        },
      }),
    [scene, store, aplicarEfecto],
  );

  const avatar = useMemo(
    () =>
      buildAvatar({
        factionId: session?.player.factionId ?? factionId ?? 0,
        rankTier: session?.player.rankTier ?? 1,
        seed: session?.player.characterId ?? 'local',
      }),
    // El avatar propio se arma una vez; facción y rango se actualizan aparte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const controller = useMemo(
    () =>
      new PlayerController({
        spawn: spawnOverride ? { x: spawnOverride.x, y: 0, z: spawnOverride.z } : { x: spawn.x, y: spawn.y, z: spawn.z },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const skyMaterial = useMemo(() => createSkyMaterial(), []);
  const skyMesh = useMemo(() => {
    const mesh = new Mesh(new SphereGeometry(3000, 24, 16), skyMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = -100;
    mesh.name = 'SkyDome';
    return mesh;
  }, [skyMaterial]);

  /** Burbujas de chat vigentes por sesión. */
  const burbujas = useRef(new Map<string, { text: string; hasta: number }>());

  /* --- montaje --------------------------------------------------------- */
  useEffect(() => {
    scene.add(skyMesh);
    scene.add(avatar.group);
    scene.fog = new FogExp2(0xc9e2f2, 0.0016);

    const ground = new Mesh(
      new CircleGeometry(2600, 48),
      new MeshLambertMaterial({ color: PALETTE.grassDry, side: DoubleSide, fog: true }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.9;
    ground.name = 'ValleFloor';
    ground.frustumCulled = false;
    scene.add(ground);

    weatherService.start();

    // Manija de diagnóstico para QA y para las pruebas de navegador: desde la
    // consola se puede inspeccionar la escena, teletransportarse o contar luces.
    (window as unknown as { __esquel?: unknown }).__esquel = {
      scene,
      camera,
      gl,
      world,
      controller,
      remotes,
      red: networkClient,
    };

    return () => {
      scene.remove(skyMesh, avatar.group, ground);
      ground.geometry.dispose();
      (ground.material as MeshLambertMaterial).dispose();
      skyMesh.geometry.dispose();
      skyMaterial.dispose();
      particles.dispose();
      remotes.dispose();
      npcs.dispose();
      sponsors.dispose();
      avatar.dispose();
      world.dispose();
    };
  }, [scene, skyMesh, skyMaterial, avatar, particles, remotes, npcs, sponsors, world]);

  /* --- facción del avatar propio --------------------------------------- */
  useEffect(() => {
    avatar.setFaction(session?.player.factionId ?? factionId ?? 0);
    avatar.setRank(session?.player.rankTier ?? 1);
  }, [avatar, factionId, session]);

  /* --- clima real → mundo, partículas y store -------------------------- */
  useEffect(() => {
    const unsubscribe = weatherService.subscribe((weather) => {
      // Con sala conectada manda el servidor; esto cubre el modo desconectado.
      if (!networkClient.connected) store.getState().setWeather(weather);
      cycle.setCloudCover(weather.cloudCover);
      controller.weatherSpeed = weather.gameplayModifiers.moveSpeed;
      particles.setWeather(weather, controller.position);
    });
    return unsubscribe;
  }, [cycle, controller, particles, store]);

  /* --- conexión con el servidor autoritativo --------------------------- */
  useEffect(() => {
    if (!session?.accessToken) return;

    const s = store.getState();
    s.setPlayer({
      nick: session.player.alias,
      factionId: session.player.factionId === 0 ? null : session.player.factionId,
      rankLevel: Math.max(1, Math.min(10, session.player.rankTier)) as never,
      xp: session.player.xp ?? 0,
      reputation: session.player.reputacion ?? 0,
      money: session.player.guitaCentavos ?? 250_000,
    });

    // Telemetría: el colector arranca con la sesión y manda por el mismo socket.
    const perfil = session.telemetry;
    const colector = initTelemetry({
      subject: perfil?.subject ?? 'anonimo',
      sessionRef: crypto.randomUUID(),
      consent: perfil?.consent ?? false,
      context: {
        barrio: session.player.barrio,
        ageBand: (perfil?.ageBand ?? '25-34') as AgeBand,
        gender: (perfil?.gender ?? 'prefiere_no_decir') as GenderIdentity,
        interest: (perfil?.interest ?? 'medio') as PoliticalInterest,
        factionId: session.player.factionId as never,
        rankLevel: session.player.rankTier as never,
        platform: matchMedia?.('(pointer: coarse)').matches ? 'mobile' : 'desktop',
        clientVersion: CONFIG.version,
        localHour: new Date().getUTCHours(),
      },
      transport: (events) => networkClient.sendTelemetry(events),
    });
    colector.track({ name: 'app_boot', loadMs: Math.round(performance.now()), webgpu: 'gpu' in navigator });

    networkClient.setHandlers({
      onStatus: (status, detail) => store.getState().setNet({ status, detail: detail ?? '' }),

      onWelcome: (data) => {
        remotes.setSelf(data.sessionId);
        track({ name: 'session_start', mode: 'ciudadano' });
        track({ name: 'shard_join', shard: session.realtimeEndpoint });
        controller.teleport(data.spawn.x, data.spawn.y, data.spawn.z);
        store.getState().setNet({ sessionId: data.sessionId });
        store.getState().pushChat({
          nick: 'Esquel',
          text: `Entraste al shard. Sos ${session.player.alias}. La plaza queda para el norte.`,
          channel: 'sistema',
          at: Date.now(),
        });
      },

      onAoi: (players) => remotes.applyAoi(players),
      onAoiLeave: (sessionIds) => remotes.removeMany(sessionIds),
      onRoster: (roster) => {
        remotes.updateRoster(roster);
        // El padrón replicado trae la XP y la reputación **acumuladas**, que es
        // lo que el servidor usa para decidir un ascenso. El HUD las tomaba de
        // la sesión —que arranca en cero— y por eso el panel de carrera decía
        // "te faltan 882 XP para Soldado" a alguien que ya tenía 919.
        const mio = roster.find((r) => r.sessionId === networkClient.sessionId);
        if (mio) {
          const actual = store.getState().player;
          if (mio.xp !== actual.xp) store.getState().setPlayer({ xp: mio.xp });
        }
      },

      onWorld: (snapshot) => {
        store.getState().setNet({ population: snapshot.population, shardName: snapshot.shardName });
      },

      onChat: (message) => {
        store.getState().pushChat({
          nick: message.nick,
          text: message.text,
          channel: message.channel,
          at: message.at,
        });
        if (message.channel === 'local' && message.from !== networkClient.sessionId) {
          burbujas.current.set(message.from, { text: message.text, hasta: Date.now() + BURBUJA_MS });
        }
      },

      onVoicePeers: (peers, closed) => spatialVoice.applyPeers(peers, closed),
      onVoiceSignal: (from, kind, payload) => void spatialVoice.handleSignal(from, kind, payload),

      onReconcile: (data) => {
        // El servidor manda: si corrige, se acata sin discutir.
        controller.teleport(data.position.x, data.position.y, data.position.z);
      },

      onStatDelta: (data) => {
        const player = store.getState().player;
        store.getState().setPlayer({
          xp: player.xp + (data.xp ?? 0),
          reputation: player.reputation + (data.reputation ?? 0),
        });
        store.getState().pushChat({ nick: 'Esquel', text: data.reason, channel: 'sistema', at: Date.now() });
      },

      /**
       * Ascenso. Es el momento de la progresión: el HUD lo levanta, el chat lo
       * canta y la telemetría lo registra —`rank_up` es la señal que dice cuánto
       * tarda de verdad la curva, que es distinto de cuánto dice la tabla.
       */
      onRankUp: (data) => {
        const s = store.getState();
        s.setPlayer({ rankLevel: data.to as never });
        s.setRankUp({ from: data.from, to: data.to, rankName: data.rankName, job: data.job, at: Date.now() });
        s.pushChat({
          nick: 'Esquel',
          text: `Ascendiste a ${data.rankName}. ${data.job}`,
          channel: 'sistema',
          at: Date.now(),
        });
        if (data.items.length > 0) {
          s.pushChat({
            nick: 'Esquel',
            text: `Se te desbloqueó: ${data.items.map(careerLabel).join(', ')}.`,
            channel: 'sistema',
            at: Date.now(),
          });
        }
        track({
          name: 'rank_up',
          from: data.from as never,
          to: data.to as never,
          hoursPlayed: Number((performance.now() / 3_600_000).toFixed(2)),
        });
      },

      /** Captura de zona: la bandera cambió de manos después de cinco minutos. */
      onZoneFlip: (data) => {
        const zona = store.getState().zones.find((z) => z.id === data.zoneId);
        store.getState().setZoneFlip({
          zoneId: data.zoneId,
          zoneName: zona?.name ?? data.zoneId,
          to: data.to,
          mine: data.to === (store.getState().player.factionId ?? -1),
          at: Date.now(),
        });
      },

      onToast: (data) =>
        store.getState().pushChat({ nick: 'Esquel', text: data.text, channel: 'sistema', at: Date.now() }),

      onKick: (data) =>
        store.getState().pushChat({ nick: 'Esquel', text: data.message, channel: 'sistema', at: Date.now() }),

      /* --- fase 3: duelos, misiones y territorio --- */

      onDebateInvite: (invite) => {
        store.getState().setDebateInvite({
          duelId: invite.duelId,
          fromCharId: invite.fromCharId,
          fromAlias: invite.fromNick,
          pot: invite.pot,
          expiresAt: invite.expiresAt,
        });
        store.getState().pushChat({
          nick: 'Esquel',
          text: `${invite.fromNick} te encaró para discutir. F5 no te salva: contestá.`,
          channel: 'sistema',
          at: Date.now(),
        });
      },

      onDebateState: (view) => {
        const vista = view as DebateView;
        const yo = vista.isChallenger ? vista.duel.challenger : vista.duel.defender;
        store.getState().setDebateInvite(null);
        store.getState().setDebate({
          duelId: vista.duel.id,
          view: vista,
          playable: vista.playable,
          isMyTurn: vista.duel.activeSide === yo.charId,
        });
      },

      onDebateResult: (data) => {
        const outcome = data.outcome as DebateOutcome;
        track({
          name: 'debate_finish',
          won: outcome.winner === session.player.characterId,
          turns: outcome.turns,
          arena: 'esquina',
        });
        store.getState().setDebate(null);
        store.getState().setDebateInvite(null);
        store.getState().pushChat({
          nick: 'Esquel',
          text: resumenDuelo(outcome, session.player.characterId),
          channel: 'sistema',
          at: Date.now(),
        });
      },

      onQuestAnnounced: (payload) => {
        // `NetworkClient` ya desenvuelve `{ quest }`: acá llega la misión pelada.
        const quest = payload as LiveQuest;
        if (!quest?.id) return;
        store.getState().upsertQuest({
          id: quest.id,
          title: quest.title,
          description: quest.description,
          type: quest.type,
          barrio: quest.barrio,
          endsAt: quest.endsAt,
          objectives: quest.objectives.map((o) => ({
            id: o.id,
            label: o.label,
            target: o.target,
            optional: o.optional,
          })),
          joined: false,
          counters: {},
          completion: 0,
          rewards: { xp: quest.rewards.xp, reputation: quest.rewards.reputation, money: quest.rewards.money },
          contested: quest.contested,
        });
        store.getState().pushChat({ nick: 'Esquel', text: `Se armó: ${quest.title}`, channel: 'sistema', at: Date.now() });
      },

      onQuestUpdated: (data) => {
        // Sólo la respuesta al «Anotarme» trae `joined`; el resto es headcount.
        if (data.joined) store.getState().patchQuest(data.questId, { joined: true });
      },

      onQuestProgress: (data) => {
        store.getState().patchQuest(data.questId, {
          joined: true,
          counters: data.counters,
          completion: data.completion,
        });
      },

      onQuestResult: (data) => {
        const mision = store.getState().quests.find((q) => q.id === data.questId);
        if (mision) {
          track({
            name: 'quest_finish',
            questType: mision.type as never,
            questSlug: mision.id,
            outcome: data.outcome as never,
            completion: clampUnit(data.completion),
            seconds: Math.max(0, Math.round((Date.now() - (mision.endsAt - 600_000)) / 1000)),
          });
        }
        // Si te bajaste, la misión sigue en la calle: deja de ser tuya y listo.
        if (data.outcome === 'abandonada') store.getState().patchQuest(data.questId, { joined: false, completion: 0 });
        else store.getState().removeQuest(data.questId);
        store.getState().pushChat({ nick: 'Esquel', text: data.delta.reason, channel: 'sistema', at: Date.now() });
      },

      onZones: (data) => {
        store.getState().setZones(data.zones as ZoneEntry[], data.buff);
      },

      onCampaignResult: (data) => {
        store.getState().pushChat({ nick: 'Esquel', text: data.text, channel: 'sistema', at: Date.now() });
        if (data.ok) {
          const player = store.getState().player;
          store.getState().setPlayer({
            xp: player.xp + data.xp,
            reputation: player.reputation + data.reputation,
            money: player.money + data.money,
          });
        }
      },
    });

    void networkClient.connect({
      endpoint: session.realtimeEndpoint || CONFIG.api.realtimeUrl,
      accessToken: session.accessToken,
      ...(spawnOverride ? { spawn: spawnOverride } : {}),
    });

    return () => {
      track({ name: 'session_end', seconds: Math.round(performance.now() / 1000), reason: 'logout' });
      void stopTelemetry();
      void networkClient.disconnect();
      spatialVoice.disable();
    };
  }, [session, controller, remotes, store, spawnOverride]);

  /* --- acumuladores del bucle ------------------------------------------ */
  const acc = useRef({ hud: 0, stats: 0, overlay: 0, pump: 0, elapsed: 0, frames: 0, fpsWindow: 0 });
  const camForward = useRef(new Vector3());
  /** Última manzana pisada, para emitir `cell_enter` sólo cuando cambia. */
  const ultimaCelda = useRef<{ col: number; row: number } | null>(null);
  /** Hora de Esquel en minutos: la usan los horarios de los comercios. */
  const minutoLocal = useRef(12 * 60);
  const proj = useRef(new Vector3());

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.1);
    const a = acc.current;
    a.elapsed += dt;
    a.frames += 1;
    a.fpsWindow += dt;

    /* 1. Entrada del jugador (el chat abierto se queda con el teclado). */
    const state = input.current;
    const escribiendo = store.getState().chatOpen;
    if (state.drag.x !== 0 || state.drag.y !== 0) {
      controller.orbit(state.drag.x, state.drag.y);
      state.drag.x = 0;
      state.drag.y = 0;
    }
    if (state.wheel !== 0) {
      controller.zoom(state.wheel);
      state.wheel = 0;
    }
    if (state.pressed.size > 0) {
      if (state.pressed.has('KeyC')) controller.toggleCameraMode();
      if (state.pressed.has('F3')) store.getState().toggleDiagnostics();
      // Militancia rápida: E pega un afiche, Q ceba un mate.
      if (state.pressed.has('KeyE')) networkClient.sendAction('pegar_afiche');
      if (state.pressed.has('KeyQ')) networkClient.sendAction('cebar_mate');
      // F: hablarle al vecino de al lado (o esquivar la trompada del Loco).
      if (state.pressed.has('KeyF')) {
        const clima = store.getState().weather.condition;
        // El local gana la tecla si estás en la puerta; si no, contesta el vecino.
        const atendido = sponsors.press(controller.position, minutoLocal.current);
        if (!atendido) {
          npcs.press(controller.position, { badWeather: clima === 'lluvia' || clima === 'nieve' || clima === 'tormenta' });
        }
      }
      // G: encarar al militante rival más cercano. El servidor valida rango,
      // distancia y facción; si no da, contesta con un toast y no pasa nada.
      if (state.pressed.has('KeyG') && !store.getState().debate) {
        const rival = rivalMasCercano(remotes.views(), controller.position, store.getState().player.factionId ?? 0);
        if (rival) {
          networkClient.challengeDebate(rival.characterId);
        } else {
          store.getState().pushChat({
            nick: 'Esquel',
            text: 'No hay ningún rival cerca para discutir. Caminá un poco.',
            channel: 'sistema',
            at: Date.now(),
          });
        }
      }
      state.pressed.clear();
    }

    /* 2. Simulación del jugador contra los obstáculos cercanos. */
    const intent = escribiendo ? { forward: 0, strafe: 0, sprint: false, jump: false } : state.intent;
    const colliders = world.collidersNear(controller.position.x, controller.position.z, 24);
    controller.update(dt, intent, colliders);

    const anim: AvatarAnimation = animationFromLocomotion(
      controller.grounded ? (controller.speed > 5 ? 'run' : controller.speed > 0.4 ? 'walk' : 'idle') : 'fall',
    );
    const bob = avatar.update(dt, controller.speed, anim);
    avatar.group.position.set(controller.position.x, controller.position.y + bob, controller.position.z);
    avatar.group.rotation.y = controller.yaw;
    controller.applyCamera(camera as PerspectiveCamera, dt, colliders);

    /* 3. Red: movimiento al servidor y vecinos interpolados. */
    networkClient.sendMove(controller.position.x, controller.position.y, controller.position.z, controller.yaw, anim);
    remotes.update(dt);

    /* 3.b Vecinos del pueblo: patrullan, saludan y ladran. */
    const buff = buffPiernas.current;
    const ahoraMs = Date.now();
    controller.buffSpeed = ahoraMs < buff.hasta ? buff.mult : 1;
    // Campera térmica: mientras dure, el clima deja de frenar.
    if (ahoraMs < abrigoHasta.current) controller.weatherSpeed = 1;
    const climaActual = store.getState().weather.condition;
    npcs.update(dt, {
      playerPosition: controller.position,
      playerFactionId: store.getState().player.factionId ?? 0,
      colliders,
      rivals: remotes.views().map((v) => ({ position: v.position, factionId: v.factionId })),
      badWeather: climaActual === 'lluvia' || climaActual === 'nieve' || climaActual === 'tormenta',
    });

    /* 4. Voz espacial: el oído es la cámara, cada voz suena desde su avatar. */
    spatialVoice.pollVoiceActivity();
    camera.getWorldDirection(camForward.current);
    spatialVoice.updateSpatial(controller.position, camForward.current, (sessionId) => remotes.positionOf(sessionId));

    /* 5. Ciudad alrededor del jugador. */
    world.update(controller.position.x, controller.position.z);

    /* 6. Sol, cielo y niebla. */
    const sky = cycle.sample();
    minutoLocal.current = sky.clock.localMinute;
    // Los comercios se miden acá, después del reloj: sus horarios dependen de la
    // hora de Esquel, no de la del navegador.
    sponsors.update(controller.position, minutoLocal.current);
    const weather = store.getState().weather;
    const dir = dirLightRef.current;
    if (dir) {
      dir.position.set(
        controller.position.x + sky.sunDirection.x * 220,
        Math.max(12, sky.sunDirection.y * 220),
        controller.position.z + sky.sunDirection.z * 220,
      );
      dir.target.position.set(controller.position.x, 0, controller.position.z);
      dir.target.updateMatrixWorld();
      dir.color.copy(sky.sunColor);
      dir.intensity = sky.sunIntensity;
    }
    const hemi = hemiLightRef.current;
    if (hemi) {
      hemi.color.copy(sky.zenith);
      hemi.groundColor.copy(new Color(PALETTE.dirt));
      hemi.intensity = sky.ambientIntensity;
    }

    skyMesh.position.copy(camera.position);
    updateSkyMaterial(skyMaterial, sky, {
      cloudCover: weather.cloudCover,
      windKph: weather.windKph,
      windDirDeg: weather.windDirDeg,
      elapsed: a.elapsed,
    });

    if (scene.fog instanceof FogExp2) {
      scene.fog.color.copy(sky.fog);
      const visibility = Math.max(400, weather.visibilityM);
      scene.fog.density = clampUnit(2.2 / visibility) * 1.4 + (sky.night ? 0.0006 : 0.0002);
    }

    /* 7. Partículas. */
    particles.update(dt, controller.position);

    /* 8. Entorno del mundo (nieve en techos, vidrios encendidos, cerros). */
    a.stats += dt;
    if (a.stats >= 1) {
      a.stats = 0;
      const month = new Date().getUTCMonth();
      world.setEnvironment({
        snow: weather.snowCoverage,
        autumn: autumnFactor(month),
        night: sky.night,
        sunTint: sky.sunColor.getHex(),
        sunIntensity: clampUnit(sky.sunIntensity / 6.6),
      });
      particles.setWeather(weather, controller.position);
    }

    /* 9. Padrón y mundo replicado: 4 Hz alcanza. */
    a.pump += dt;
    if (a.pump >= 0.25) {
      a.pump = 0;
      networkClient.pump();
    }

    /* 10. Placas y burbujas: proyección a pantalla a 15 Hz. */
    a.overlay += dt;
    if (a.overlay >= 0.066) {
      a.overlay = 0;
      const width = gl.domElement.clientWidth;
      const height = gl.domElement.clientHeight;
      const now = Date.now();
      const overlays: OverlayEntry[] = [];

      for (const view of remotes.views()) {
        proj.current.set(view.position.x, view.position.y + view.headY, view.position.z);
        const distance = proj.current.distanceTo(camera.position);
        proj.current.project(camera);
        // Detrás de la cámara o demasiado lejos: no se dibuja.
        if (proj.current.z > 1 || distance > 90) continue;

        const burbuja = burbujas.current.get(view.sessionId);
        if (burbuja && burbuja.hasta < now) burbujas.current.delete(view.sessionId);

        overlays.push({
          sessionId: view.sessionId,
          nameplate: view.nameplate,
          color: factionCssColor(view.factionId),
          screenX: Math.round(((proj.current.x + 1) / 2) * width),
          screenY: Math.round(((1 - proj.current.y) / 2) * height),
          distanceM: Math.round(distance),
          speaking: view.speaking,
          ...(burbuja && burbuja.hasta >= now ? { chatText: burbuja.text } : {}),
        });
      }
      // Vecinos del pueblo: misma proyección, sin facción ni voz.
      for (const npc of npcs.views()) {
        proj.current.set(npc.position.x, npc.headY, npc.position.z);
        const distance = proj.current.distanceTo(camera.position);
        proj.current.project(camera);
        if (proj.current.z > 1 || distance > 45) continue;
        overlays.push({
          sessionId: npc.id,
          nameplate: npc.name,
          color: '#c7bda8',
          screenX: Math.round(((proj.current.x + 1) / 2) * width),
          screenY: Math.round(((1 - proj.current.y) / 2) * height),
          distanceM: Math.round(distance),
          speaking: false,
          ...(npc.line ? { chatText: npc.line } : {}),
        });
      }

      store.getState().setOverlays(overlays);

      // Cartelito de interacción: gana el comercio si estás en la puerta,
      // porque su radio es más chico y por lo tanto más específico.
      const delComercio = sponsors.activePrompt();
      const delVecino = npcs.activePrompt();
      const prompt = delComercio
        ? { name: delComercio.name, hint: delComercio.hint, urgent: false }
        : delVecino
          ? { name: delVecino.name, hint: delVecino.hint, urgent: delVecino.urgent }
          : null;

      const previo = store.getState().interactPrompt;
      if (!prompt) {
        if (previo) store.getState().setInteractPrompt(null);
      } else if (!previo || previo.hint !== prompt.hint || previo.urgent !== prompt.urgent) {
        store.getState().setInteractPrompt(prompt);
      }
    }

    /* 11. HUD: 4 Hz. */
    a.hud += dt;
    if (a.hud >= 0.25) {
      const fps = a.frames / Math.max(0.001, a.fpsWindow);
      a.hud = 0;
      a.frames = 0;
      a.fpsWindow = 0;
      const s = store.getState();
      s.setClock({
        localTime: sky.localTime,
        phase: sky.phase,
        ...cycle.sunTimes(),
        elevationDeg: Number(sky.elevationDeg.toFixed(1)),
      });
      s.setPlayer({
        position: { x: controller.position.x, y: controller.position.y, z: controller.position.z },
        stamina: Math.round(controller.staminaValue),
      });
      s.setLocation(describePosition(controller.position.x, controller.position.z));

      // Cambio de manzana: es el evento que arma el mapa de calor. Se manda con
      // granularidad de celda, nunca con la coordenada fina.
      const celda = worldToCell({ x: controller.position.x, y: 0, z: controller.position.z });
      const anterior = ultimaCelda.current;
      if (!anterior || anterior.col !== celda.col || anterior.row !== celda.row) {
        ultimaCelda.current = celda;
        const barrio = barrioOfCell(celda);
        track(
          anterior ? { name: 'cell_enter', cell: celda, fromCell: anterior } : { name: 'cell_enter', cell: celda },
          { barrio, cell: celda, localHour: Math.floor(sky.clock.localMinute / 60) },
        );
        telemetry()?.setContext({ barrio, cell: celda, localHour: Math.floor(sky.clock.localMinute / 60) });
      }
      s.setDiagnostics({ fps: Math.round(fps), ...world.stats() });
      s.refreshElection();
    }
  });

  return (
    <>
      <hemisphereLight ref={hemiLightRef} args={[0xbcd8ea, 0x6b5b46, 0.5]} />
      <directionalLight ref={dirLightRef} args={[0xfff0d0, 1]} />
    </>
  );
};

/** Reexporta el helper de placas para que el HUD arme el texto igual que la escena. */
export { nameplateFor, FACTION_BY_ID };
