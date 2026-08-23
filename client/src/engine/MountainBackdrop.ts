/**
 * Telón montañoso.
 *
 * Esquel está metida en un valle: mires donde mires hay cerro. Tres siluetas
 * poligonales bajas cierran el horizonte, con los hitos reales en su orientación
 * correcta respecto del centro:
 *
 *   · La Hoya   — al norte-noroeste, la más alta y la única con nieve casi todo el año
 *   · Cerro 21  — al oeste, alargado y de perfil suave
 *   · La Zeta   — al este, pegado a la ciudad, bajo y redondeado
 *
 * Cada cerro es una tira de triángulos generada con ruido determinista: mismo
 * perfil en todas las sesiones y en todos los jugadores. El sombreado se
 * actualiza con el sol, así que al atardecer se ponen dorados y de noche quedan
 * como recorte azul contra el cielo.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  type Scene,
} from 'three';
import { bearingToWorldRad, createRng, seedFromString } from '@esquel/shared';
import { PALETTE, mixColor } from './VoxelPalette.ts';

export interface RidgeDefinition {
  readonly id: string;
  readonly name: string;
  /** Rumbo desde el centro de la ciudad, en grados (0 = norte, 90 = este). */
  readonly bearingDeg: number;
  /** Distancia al centro, en metros. */
  readonly distanceM: number;
  /** Ancho del frente montañoso, en metros. */
  readonly widthM: number;
  /** Altura de la cumbre sobre el valle, en metros. */
  readonly peakM: number;
  /** Altura a partir de la cual aparece la nieve, como fracción de la cumbre. */
  readonly snowLine: number;
  /** Cantidad de segmentos del perfil: más segmentos, más dentado. */
  readonly segments: number;
  /** Color base de la roca. */
  readonly rock: number;
}

/** Los tres hitos que rodean Esquel. */
export const RIDGES: readonly RidgeDefinition[] = [
  {
    id: 'la-hoya',
    name: 'Cerro La Hoya',
    bearingDeg: 340,
    distanceM: 3200,
    widthM: 4200,
    peakM: 1150,
    snowLine: 0.55,
    segments: 34,
    rock: 0x4a5560,
  },
  {
    id: 'cerro-21',
    name: 'Cerro 21',
    bearingDeg: 268,
    distanceM: 2600,
    widthM: 3400,
    peakM: 720,
    snowLine: 0.78,
    segments: 26,
    rock: 0x53565a,
  },
  {
    id: 'la-zeta',
    name: 'Cerro La Zeta',
    bearingDeg: 96,
    distanceM: 2100,
    widthM: 2800,
    peakM: 480,
    snowLine: 0.9,
    segments: 22,
    rock: 0x5b5348,
  },
];

/** Perfil de cumbres: suma de dos senos más ruido determinista. */
const ridgeProfile = (def: RidgeDefinition, snowCoverage: number): BufferGeometry => {
  const rng = createRng(seedFromString(def.id));
  const n = def.segments;
  const positions: number[] = [];
  const colors: number[] = [];
  const halfWidth = def.widthM / 2;

  const heights: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Envolvente: los extremos caen al valle.
    const envelope = Math.sin(Math.PI * t) ** 0.7;
    const wave = 0.55 + 0.25 * Math.sin(t * Math.PI * 3.1 + 0.6) + 0.2 * Math.sin(t * Math.PI * 7.3);
    const noise = 0.82 + rng.next() * 0.36;
    heights.push(def.peakM * envelope * wave * noise);
  }

  const rock = new Color(def.rock);
  const rockLit = new Color(mixColor(def.rock, 0xffffff, 0.18));
  const snow = new Color(mixColor(PALETTE.roofSnow, 0xffffff, 0.25));

  const colorAt = (h: number): Color => {
    const ratio = h / def.peakM;
    const line = def.snowLine - snowCoverage * 0.3;
    if (ratio > line) {
      const k = Math.min(1, (ratio - line) / Math.max(0.05, 1 - line));
      return rockLit.clone().lerp(snow, k);
    }
    return rock.clone().lerp(rockLit, ratio / Math.max(0.001, line));
  };

  const push = (x: number, y: number, z: number, c: Color): void => {
    positions.push(x, y, z);
    colors.push(c.r, c.g, c.b);
  };

  // Tira de quads entre el perfil y el suelo, en el plano local XY.
  for (let i = 0; i < n; i++) {
    const x0 = -halfWidth + (i / n) * def.widthM;
    const x1 = -halfWidth + ((i + 1) / n) * def.widthM;
    const h0 = heights[i];
    const h1 = heights[i + 1];
    const c0 = colorAt(h0);
    const c1 = colorAt(h1);
    const cBase = rock.clone().multiplyScalar(0.65);

    push(x0, 0, 0, cBase);
    push(x1, 0, 0, cBase);
    push(x1, h1, 0, c1);

    push(x0, 0, 0, cBase);
    push(x1, h1, 0, c1);
    push(x0, h0, 0, c0);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

export class MountainBackdrop {
  readonly group = new Group();
  private readonly meshes: { def: RidgeDefinition; mesh: Mesh; material: MeshLambertMaterial }[] = [];
  private snowCoverage = 0;

  constructor(scene: Scene, snowCoverage = 0) {
    this.snowCoverage = snowCoverage;
    this.group.name = 'MountainBackdrop';
    // Fondo lejano: no proyecta ni recibe sombras y nunca se descarta por frustum
    // parcial (una montaña de 4 km cruza el plano de recorte todo el tiempo).
    for (const def of RIDGES) {
      const material = new MeshLambertMaterial({ vertexColors: true, fog: true });
      const mesh = new Mesh(ridgeProfile(def, snowCoverage), material);
      // El rumbo geográfico se traduce al marco de la cuadrícula, que está rotada
      // respecto del norte real: los cerros y el sol comparten esa convención.
      const rad = bearingToWorldRad(def.bearingDeg);
      mesh.position.set(Math.sin(rad) * def.distanceM, 0, Math.cos(rad) * def.distanceM);
      mesh.rotation.y = rad;
      mesh.frustumCulled = false;
      mesh.renderOrder = -10;
      mesh.name = `ridge-${def.id}`;
      this.group.add(mesh);
      this.meshes.push({ def, mesh, material });
    }
    scene.add(this.group);
  }

  /** Rehace los perfiles cuando cambia la nieve acumulada de forma apreciable. */
  setSnowCoverage(coverage: number): void {
    if (Math.abs(coverage - this.snowCoverage) < 0.15) return;
    this.snowCoverage = coverage;
    for (const entry of this.meshes) {
      entry.mesh.geometry.dispose();
      entry.mesh.geometry = ridgeProfile(entry.def, coverage);
    }
  }

  /**
   * Tiñe la roca según la luz del momento: dorada al amanecer y al atardecer,
   * azulada de noche, neutra al mediodía.
   */
  setSunTint(tint: number, intensity: number): void {
    for (const { material } of this.meshes) {
      material.color.set(tint);
      material.color.multiplyScalar(0.45 + intensity * 0.55);
      material.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const { mesh, material } of this.meshes) {
      mesh.geometry.dispose();
      material.dispose();
      this.group.remove(mesh);
    }
    this.meshes.length = 0;
    this.group.removeFromParent();
  }
}
