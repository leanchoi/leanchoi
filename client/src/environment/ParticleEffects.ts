/**
 * Partículas de clima patagónico.
 *
 * Tres sistemas que se encienden según el clima real:
 *
 *  · **Nieve**: copos que caen lento y se van de costado con el viento.
 *  · **Lluvia / aguanieve**: trazos rápidos, inclinados por la ráfaga.
 *  · **Ráfagas**: líneas horizontales de polvo y hojas cuando sopla fuerte.
 *    En Esquel el viento no es un detalle: es un personaje.
 *
 * Todo vive en una caja que sigue a la cámara y hace *wrap*: cuando una partícula
 * se va por un lado, reaparece por el otro. Cuenta fija de partículas, buffers
 * preasignados, cero basura por cuadro.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  Points,
  type ShaderMaterial,
  type Scene,
  type Vector3,
} from 'three';
import type { WorldWeather } from '@esquel/shared';
import { createSnowMaterial, createStreakMaterial } from './WeatherShaders.ts';

/** Semicaja alrededor de la cámara donde viven las partículas. */
const FIELD_XZ = 70;
const FIELD_Y = 46;

export interface ParticleBudget {
  readonly snow: number;
  readonly rain: number;
  readonly gust: number;
}

/** Presupuesto por defecto. En móviles conviene bajarlo a la mitad. */
export const DEFAULT_BUDGET: ParticleBudget = { snow: 2600, rain: 2200, gust: 260 };

interface FieldState {
  positions: Float32Array;
  velocities: Float32Array;
  count: number;
  active: number;
}

const randomInField = (out: Float32Array, i: number, center: Vector3): void => {
  out[i * 3] = center.x + (Math.random() - 0.5) * FIELD_XZ * 2;
  out[i * 3 + 1] = center.y + Math.random() * FIELD_Y;
  out[i * 3 + 2] = center.z + (Math.random() - 0.5) * FIELD_XZ * 2;
};

export class WeatherParticles {
  readonly group = new Group();
  private readonly budget: ParticleBudget;

  private readonly snowPoints: Points;
  private readonly snowMaterial: ShaderMaterial;
  private readonly snowState: FieldState;

  private readonly rainLines: LineSegments;
  private readonly rainMaterial: ShaderMaterial;
  private readonly rainState: FieldState;

  private readonly gustLines: LineSegments;
  private readonly gustMaterial: ShaderMaterial;
  private readonly gustState: FieldState;

  /** Viento actual en unidades de mundo (m/s aproximados). */
  private windX = 0;
  private windZ = 0;
  private intensity = 0;
  private mode: 'ninguno' | 'nieve' | 'lluvia' | 'aguanieve' = 'ninguno';

  constructor(scene: Scene, budget: ParticleBudget = DEFAULT_BUDGET) {
    this.budget = budget;
    this.group.name = 'WeatherParticles';

    // --- nieve: puntos ---
    const snowGeometry = new BufferGeometry();
    const snowPositions = new Float32Array(budget.snow * 3);
    const snowScales = new Float32Array(budget.snow);
    for (let i = 0; i < budget.snow; i++) snowScales[i] = 0.5 + Math.random() * 0.9;
    snowGeometry.setAttribute('position', new BufferAttribute(snowPositions, 3));
    snowGeometry.setAttribute('aScale', new BufferAttribute(snowScales, 1));
    snowGeometry.setDrawRange(0, 0);
    this.snowMaterial = createSnowMaterial();
    this.snowPoints = new Points(snowGeometry, this.snowMaterial);
    this.snowPoints.frustumCulled = false;
    this.snowState = {
      positions: snowPositions,
      velocities: new Float32Array(budget.snow * 3),
      count: budget.snow,
      active: 0,
    };
    this.group.add(this.snowPoints);

    // --- lluvia: segmentos (2 vértices por gota) ---
    const rainGeometry = new BufferGeometry();
    const rainPositions = new Float32Array(budget.rain * 6);
    const rainTips = new Float32Array(budget.rain * 2);
    for (let i = 0; i < budget.rain; i++) {
      rainTips[i * 2] = 0;
      rainTips[i * 2 + 1] = 1;
    }
    rainGeometry.setAttribute('position', new BufferAttribute(rainPositions, 3));
    rainGeometry.setAttribute('aTip', new BufferAttribute(rainTips, 1));
    rainGeometry.setDrawRange(0, 0);
    this.rainMaterial = createStreakMaterial(0xa9c4d8, 0.55);
    this.rainLines = new LineSegments(rainGeometry, this.rainMaterial);
    this.rainLines.frustumCulled = false;
    this.rainState = {
      positions: rainPositions,
      velocities: new Float32Array(budget.rain * 3),
      count: budget.rain,
      active: 0,
    };
    this.group.add(this.rainLines);

    // --- ráfagas: segmentos horizontales ---
    const gustGeometry = new BufferGeometry();
    const gustPositions = new Float32Array(budget.gust * 6);
    const gustTips = new Float32Array(budget.gust * 2);
    for (let i = 0; i < budget.gust; i++) {
      gustTips[i * 2] = 0;
      gustTips[i * 2 + 1] = 1;
    }
    gustGeometry.setAttribute('position', new BufferAttribute(gustPositions, 3));
    gustGeometry.setAttribute('aTip', new BufferAttribute(gustTips, 1));
    gustGeometry.setDrawRange(0, 0);
    this.gustMaterial = createStreakMaterial(0xd8cfba, 0.28);
    this.gustLines = new LineSegments(gustGeometry, this.gustMaterial);
    this.gustLines.frustumCulled = false;
    this.gustState = {
      positions: gustPositions,
      velocities: new Float32Array(budget.gust * 3),
      count: budget.gust,
      active: 0,
    };
    this.group.add(this.gustLines);

    scene.add(this.group);
  }

  /**
   * Configura los sistemas a partir del clima real. La cantidad de partículas
   * activas sale de la intensidad de la precipitación, no de un valor fijo: una
   * llovizna se ve como llovizna y un temporal, como temporal.
   */
  setWeather(weather: WorldWeather, center: Vector3): void {
    const windMs = weather.windKph / 3.6;
    const windRad = (weather.windDirDeg * Math.PI) / 180;
    // La dirección meteorológica indica de dónde viene: se invierte.
    this.windX = -Math.sin(windRad) * windMs;
    this.windZ = -Math.cos(windRad) * windMs;

    switch (weather.condition) {
      case 'nieve':
        this.mode = 'nieve';
        this.intensity = Math.min(1, 0.35 + weather.snowCmH * 0.5);
        break;
      case 'aguanieve':
        this.mode = 'aguanieve';
        this.intensity = Math.min(1, 0.3 + (weather.precipMmH + weather.snowCmH) * 0.4);
        break;
      case 'lluvia':
        this.mode = 'lluvia';
        this.intensity = Math.min(1, 0.35 + weather.precipMmH * 0.25);
        break;
      case 'llovizna':
        this.mode = 'lluvia';
        this.intensity = Math.min(0.45, 0.18 + weather.precipMmH * 0.3);
        break;
      case 'tormenta':
        this.mode = 'lluvia';
        this.intensity = 1;
        break;
      default:
        this.mode = 'ninguno';
        this.intensity = 0;
        break;
    }

    const snowShare = this.mode === 'nieve' ? 1 : this.mode === 'aguanieve' ? 0.5 : 0;
    const rainShare = this.mode === 'lluvia' ? 1 : this.mode === 'aguanieve' ? 0.5 : 0;

    this.resize(this.snowState, Math.round(this.budget.snow * snowShare * this.intensity), center, 1);
    this.resize(this.rainState, Math.round(this.budget.rain * rainShare * this.intensity), center, 2);
    // Las ráfagas dependen sólo del viento: aparecen desde los 45 km/h.
    const gustFactor = Math.max(0, Math.min(1, (weather.windGustKph - 45) / 55));
    this.resize(this.gustState, Math.round(this.budget.gust * gustFactor), center, 2);

    this.snowMaterial.uniforms.uOpacity.value = 0.55 + this.intensity * 0.4;
    this.rainMaterial.uniforms.uOpacity.value = 0.35 + this.intensity * 0.35;
    this.gustMaterial.uniforms.uOpacity.value = 0.12 + gustFactor * 0.25;
    this.snowPoints.visible = this.snowState.active > 0;
    this.rainLines.visible = this.rainState.active > 0;
    this.gustLines.visible = this.gustState.active > 0;
  }

  /** Ajusta cuántas partículas están vivas y siembra las nuevas. */
  private resize(state: FieldState, active: number, center: Vector3, verticesPerParticle: 1 | 2): void {
    const next = Math.max(0, Math.min(state.count, active));
    for (let i = state.active; i < next; i++) {
      if (verticesPerParticle === 1) {
        randomInField(state.positions, i, center);
      } else {
        const head = i * 6;
        state.positions[head] = center.x + (Math.random() - 0.5) * FIELD_XZ * 2;
        state.positions[head + 1] = center.y + Math.random() * FIELD_Y;
        state.positions[head + 2] = center.z + (Math.random() - 0.5) * FIELD_XZ * 2;
        state.positions[head + 3] = state.positions[head]!;
        state.positions[head + 4] = state.positions[head + 1] - 1;
        state.positions[head + 5] = state.positions[head + 2]!;
      }
    }
    state.active = next;
    const geometry = verticesPerParticle === 1 ? this.snowPoints.geometry : null;
    if (geometry) geometry.setDrawRange(0, next);
  }

  /** Avanza la simulación. Llamar una vez por cuadro. */
  update(dt: number, center: Vector3): void {
    const step = Math.min(dt, 0.05);
    if (this.snowState.active > 0) this.updateSnow(step, center);
    if (this.rainState.active > 0) this.updateStreaks(this.rainState, this.rainLines, step, center, 'lluvia');
    if (this.gustState.active > 0) this.updateStreaks(this.gustState, this.gustLines, step, center, 'rafaga');
  }

  private wrap(value: number, centerValue: number, half: number): number {
    if (value > centerValue + half) return value - half * 2;
    if (value < centerValue - half) return value + half * 2;
    return value;
  }

  private updateSnow(dt: number, center: Vector3): void {
    const p = this.snowState.positions;
    const drift = 0.7;
    for (let i = 0; i < this.snowState.active; i++) {
      const o = i * 3;
      const sway = Math.sin((p[o] + p[o + 2]) * 0.35 + performance.now() * 0.0006) * drift;
      p[o] = this.wrap(p[o] + (this.windX * 0.35 + sway) * dt, center.x, FIELD_XZ);
      p[o + 1] -= (1.1 + (i % 7) * 0.12) * dt;
      p[o + 2] = this.wrap(p[o + 2] + this.windZ * 0.35 * dt, center.z, FIELD_XZ);
      if (p[o + 1] < center.y - 3) {
        p[o + 1] = center.y + FIELD_Y;
        p[o] = center.x + (Math.random() - 0.5) * FIELD_XZ * 2;
        p[o + 2] = center.z + (Math.random() - 0.5) * FIELD_XZ * 2;
      }
    }
    const attr = this.snowPoints.geometry.getAttribute('position') as BufferAttribute;
    attr.needsUpdate = true;
    this.snowPoints.geometry.setDrawRange(0, this.snowState.active);
  }

  private updateStreaks(
    state: FieldState,
    mesh: LineSegments,
    dt: number,
    center: Vector3,
    kind: 'lluvia' | 'rafaga',
  ): void {
    const p = state.positions;
    const fall = kind === 'lluvia' ? 22 + this.intensity * 14 : 0;
    const speed = kind === 'lluvia' ? 1 : 2.4;
    const length = kind === 'lluvia' ? 1.4 + this.intensity * 1.6 : 3.5;

    for (let i = 0; i < state.active; i++) {
      const o = i * 6;
      const dx = this.windX * speed * dt;
      const dz = this.windZ * speed * dt;
      const dy = -fall * dt - (kind === 'rafaga' ? Math.sin(i + performance.now() * 0.001) * 0.4 * dt : 0);

      let x = p[o] + dx;
      let y = p[o + 1] + dy;
      let z = p[o + 2] + dz;

      if (y < center.y - 2 || Math.abs(x - center.x) > FIELD_XZ || Math.abs(z - center.z) > FIELD_XZ) {
        x = center.x + (Math.random() - 0.5) * FIELD_XZ * 2;
        z = center.z + (Math.random() - 0.5) * FIELD_XZ * 2;
        y = kind === 'lluvia' ? center.y + FIELD_Y * (0.5 + Math.random() * 0.5) : center.y + 1 + Math.random() * 8;
      }

      p[o] = x;
      p[o + 1] = y;
      p[o + 2] = z;
      // Cola del trazo: opuesta al vector de movimiento.
      const vx = this.windX * speed;
      const vy = -fall - 0.001;
      const vz = this.windZ * speed;
      const inv = length / Math.max(1e-3, Math.hypot(vx, vy, vz));
      p[o + 3] = x - vx * inv;
      p[o + 4] = y - vy * inv;
      p[o + 5] = z - vz * inv;
    }

    const attr = mesh.geometry.getAttribute('position') as BufferAttribute;
    attr.needsUpdate = true;
    mesh.geometry.setDrawRange(0, state.active * 2);
  }

  dispose(): void {
    this.snowPoints.geometry.dispose();
    this.rainLines.geometry.dispose();
    this.gustLines.geometry.dispose();
    this.snowMaterial.dispose();
    this.rainMaterial.dispose();
    this.gustMaterial.dispose();
    this.group.removeFromParent();
  }
}
