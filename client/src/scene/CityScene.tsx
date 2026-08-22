/**
 * Escena de la ciudad: el punto donde se juntan el motor voxel, el clima real,
 * el ciclo solar y el jugador.
 *
 * Todo el trabajo pesado vive en clases fuera de React (`VoxelWorld`,
 * `DayNightCycle`, `WeatherParticles`, `PlayerController`). Este componente sólo
 * las crea, las conecta al bucle de render y empuja al store lo que el HUD
 * necesita, a baja frecuencia.
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
  type DirectionalLight,
  type HemisphereLight,
  type PerspectiveCamera,
} from 'three';
import { FACTION_BY_ID, clampUnit } from '@esquel/shared';
import { CONFIG } from '../config.ts';
import { VoxelWorld } from '../engine/VoxelWorld.ts';
import { PALETTE } from '../engine/VoxelPalette.ts';
import { DayNightCycle } from '../environment/DayNightCycle.ts';
import { WeatherParticles } from '../environment/ParticleEffects.ts';
import { createSkyMaterial, updateSkyMaterial } from '../environment/WeatherShaders.ts';
import { weatherService } from '../environment/WeatherService.ts';
import { Avatar } from '../player/Avatar.ts';
import { PlayerController } from '../player/PlayerController.ts';
import type { InputState } from '../player/useKeyboard.ts';
import { describePosition } from '../world/EsquelStreetGrid.ts';
import { useGameStore } from '../state/gameStore.ts';

export interface CitySceneProps {
  readonly input: React.MutableRefObject<InputState>;
  /** Hora local forzada (0..24) para capturas y pruebas; `null` = hora real. */
  readonly forcedHour?: number | null;
  /** Punto de aparición alternativo (x,z de mundo); `null` = el del store. */
  readonly spawn?: { x: number; z: number } | null;
}

/** Fracción del año en que los álamos están dorados (marzo-mayo en el sur). */
const autumnFactor = (month: number): number => {
  if (month === 2) return 0.4;
  if (month === 3) return 0.9;
  if (month === 4) return 0.7;
  if (month === 5) return 0.2;
  return 0;
};

export const CityScene = ({ input, forcedHour = null, spawn: spawnOverride = null }: CitySceneProps): JSX.Element => {
  const { scene, camera } = useThree();
  const dirLightRef = useRef<DirectionalLight>(null);
  const hemiLightRef = useRef<HemisphereLight>(null);

  const store = useGameStore;
  const spawn = useGameStore((s) => s.player.position);
  const factionId = useGameStore((s) => s.player.factionId);

  // --- piezas del motor, creadas una sola vez ---
  const world = useMemo(() => new VoxelWorld(scene, {
    renderDistanceCells: CONFIG.render.distanceCells,
    detailCells: CONFIG.render.detailCells,
    buildBudget: 2,
  }), [scene]);

  const cycle = useMemo(
    () => new DayNightCycle(forcedHour === null ? {} : { forcedHour }),
    [forcedHour],
  );
  const particles = useMemo(() => new WeatherParticles(scene), [scene]);
  const avatar = useMemo(() => new Avatar(PALETTE.factionRed), []);
  const controller = useMemo(
    () =>
      new PlayerController({
        spawn: spawnOverride ? { x: spawnOverride.x, y: 0, z: spawnOverride.z } : { x: spawn.x, y: spawn.y, z: spawn.z },
      }),
    // El spawn sólo se lee al montar: después manda el controlador.
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

  // --- montaje ---
  useEffect(() => {
    scene.add(skyMesh);
    scene.add(avatar.group);
    scene.fog = new FogExp2(0xc9e2f2, 0.0016);
    // Piso del valle: un disco enorme apenas por debajo de la ciudad, para que
    // el terreno llegue hasta los cerros y no se vea el vacío en el horizonte.
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
    return () => {
      scene.remove(skyMesh, avatar.group, ground);
      ground.geometry.dispose();
      (ground.material as MeshLambertMaterial).dispose();
      skyMesh.geometry.dispose();
      skyMaterial.dispose();
      particles.dispose();
      avatar.dispose();
      world.dispose();
    };
  }, [scene, skyMesh, skyMaterial, avatar, particles, world]);

  // --- color de facción en la pechera ---
  useEffect(() => {
    const faction = factionId === null ? null : FACTION_BY_ID[factionId];
    const hex = faction ? Number.parseInt(faction.colorPrimary.replace('#', ''), 16) : PALETTE.factionRed;
    avatar.setFactionColor(hex);
  }, [avatar, factionId]);

  // --- clima real → mundo, partículas y store ---
  useEffect(() => {
    const unsubscribe = weatherService.subscribe((weather) => {
      store.getState().setWeather(weather);
      cycle.setCloudCover(weather.cloudCover);
      controller.weatherSpeed = weather.gameplayModifiers.moveSpeed;
      particles.setWeather(weather, controller.position);
    });
    return unsubscribe;
  }, [cycle, controller, particles, store]);

  // --- acumuladores del bucle ---
  const acc = useRef({ hud: 0, stats: 0, elapsed: 0, frames: 0, fpsWindow: 0 });

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.1);
    const a = acc.current;
    a.elapsed += dt;
    a.frames += 1;
    a.fpsWindow += dt;

    // 1. Entrada del jugador.
    const state = input.current;
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
      state.pressed.clear();
    }

    // 2. Simulación del jugador contra los obstáculos cercanos.
    const colliders = world.collidersNear(controller.position.x, controller.position.z, 24);
    controller.update(dt, state.intent, colliders);
    avatar.update(dt, controller.speed);
    avatar.group.position.set(
      controller.position.x,
      controller.position.y + (controller.grounded ? avatar.bobOffset : 0),
      controller.position.z,
    );
    avatar.group.rotation.y = controller.yaw;
    controller.applyCamera(camera as PerspectiveCamera, dt, colliders);

    // 3. Ciudad alrededor del jugador.
    world.update(controller.position.x, controller.position.z);

    // 4. Sol, cielo y niebla.
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
      // La niebla se cierra con la visibilidad real y se abre en día claro.
      const visibility = Math.max(400, weather.visibilityM);
      scene.fog.density = clampUnit(2.2 / visibility) * 1.4 + (sky.night ? 0.0006 : 0.0002);
    }

    // 5. Partículas.
    particles.update(dt, controller.position);

    // 6. Entorno del mundo (nieve en techos, vidrios encendidos, cerros).
    a.stats += dt;
    if (a.stats >= 1) {
      a.stats = 0;
      const month = new Date().getUTCMonth();
      world.setEnvironment({
        snow: weather.snowCoverage,
        autumn: autumnFactor(month),
        night: sky.night,
        sunTint: sky.sunColor.getHex(),
        sunIntensity: clampUnit(sky.sunIntensity / 3),
      });
      particles.setWeather(weather, controller.position);
    }

    // 7. HUD: 4 Hz alcanza y evita re-renders inútiles.
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
