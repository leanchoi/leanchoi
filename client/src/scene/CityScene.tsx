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

import { useEffect, useMemo, useRef } from 'react';
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
import { FACTION_BY_ID, animationFromLocomotion, clampUnit, type AvatarAnimation } from '@esquel/shared';
import { CONFIG } from '../config.ts';
import { VoxelWorld } from '../engine/VoxelWorld.ts';
import { PALETTE } from '../engine/VoxelPalette.ts';
import { DayNightCycle } from '../environment/DayNightCycle.ts';
import { WeatherParticles } from '../environment/ParticleEffects.ts';
import { createSkyMaterial, updateSkyMaterial } from '../environment/WeatherShaders.ts';
import { weatherService } from '../environment/WeatherService.ts';
import { buildAvatar, factionCssColor, nameplateFor } from '../entities/AvatarBuilder.ts';
import { RemotePlayerManager } from '../entities/RemotePlayerManager.ts';
import { PlayerController } from '../player/PlayerController.ts';
import type { InputState } from '../player/useKeyboard.ts';
import { networkClient } from '../net/NetworkClient.ts';
import { spatialVoice } from '../audio/voice.ts';
import type { Sesion } from '../net/session.ts';
import { describePosition } from '../world/EsquelStreetGrid.ts';
import { useGameStore, type OverlayEntry } from '../state/gameStore.ts';

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
      avatar.dispose();
      world.dispose();
    };
  }, [scene, skyMesh, skyMaterial, avatar, particles, remotes, world]);

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

    networkClient.setHandlers({
      onStatus: (status, detail) => store.getState().setNet({ status, detail: detail ?? '' }),

      onWelcome: (data) => {
        remotes.setSelf(data.sessionId);
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
      onRoster: (roster) => remotes.updateRoster(roster),

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

      onToast: (data) =>
        store.getState().pushChat({ nick: 'Esquel', text: data.text, channel: 'sistema', at: Date.now() }),

      onKick: (data) =>
        store.getState().pushChat({ nick: 'Esquel', text: data.message, channel: 'sistema', at: Date.now() }),
    });

    void networkClient.connect({
      endpoint: session.realtimeEndpoint || CONFIG.api.realtimeUrl,
      accessToken: session.accessToken,
      ...(spawnOverride ? { spawn: spawnOverride } : {}),
    });

    return () => {
      void networkClient.disconnect();
      spatialVoice.disable();
    };
  }, [session, controller, remotes, store, spawnOverride]);

  /* --- acumuladores del bucle ------------------------------------------ */
  const acc = useRef({ hud: 0, stats: 0, overlay: 0, pump: 0, elapsed: 0, frames: 0, fpsWindow: 0 });
  const camForward = useRef(new Vector3());
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

    /* 4. Voz espacial: el oído es la cámara, cada voz suena desde su avatar. */
    spatialVoice.pollVoiceActivity();
    camera.getWorldDirection(camForward.current);
    spatialVoice.updateSpatial(controller.position, camForward.current, (sessionId) => remotes.positionOf(sessionId));

    /* 5. Ciudad alrededor del jugador. */
    world.update(controller.position.x, controller.position.z);

    /* 6. Sol, cielo y niebla. */
    const sky = cycle.sample();
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
      store.getState().setOverlays(overlays);
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
