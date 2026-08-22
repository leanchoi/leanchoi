/**
 * Movimiento del jugador y cámara.
 *
 * Cinemática simple pero honesta: aceleración, fricción, gravedad, salto y
 * colisión contra las cajas del mundo resolviendo un eje por vez (lo que evita
 * que el personaje se trabe en las esquinas de las veredas).
 *
 * El movimiento es relativo a la cámara: adelante es hacia donde mirás. La cámara
 * orbita en tercera persona y se puede pasar a vista isométrica fija, que es la
 * que mejor le queda a una ciudad en bloques.
 *
 * En la Fase 1 el jugador es autoridad local. En la Fase 2, cuando entre
 * Colyseus, esto pasa a ser predicción del cliente y el servidor reconcilia con
 * `S2CReconcile`; por eso el estado ya está separado en `intent` → `simulate`.
 */

import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { MOVEMENT } from '@esquel/shared';
import type { Collider } from '../engine/VoxelTypes.ts';

export type CameraMode = 'tercera' | 'isometrica';

export interface MoveIntent {
  forward: number;
  strafe: number;
  sprint: boolean;
  jump: boolean;
}

export interface PlayerControllerOptions {
  readonly spawn?: { x: number; y: number; z: number };
  /** Radio del cilindro de colisión, en metros. */
  readonly radius?: number;
}

const EYE_HEIGHT = 1.7;

export class PlayerController {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  /** Rumbo del cuerpo, en radianes. */
  yaw = 0;
  /** Orientación de la cámara alrededor del jugador. */
  cameraYaw = Math.PI;
  cameraPitch = 0.42;
  cameraDistance = 12;
  mode: CameraMode = 'tercera';
  grounded = true;
  /** Multiplicador de velocidad por clima (nieve, hielo). */
  weatherSpeed = 1;

  private readonly radius: number;
  private readonly desired = new Vector3();
  private stamina = 100;

  constructor(options: PlayerControllerOptions = {}) {
    const spawn = options.spawn ?? { x: 0, y: 0, z: -20 };
    this.position.set(spawn.x, spawn.y, spawn.z);
    this.radius = options.radius ?? 0.45;
  }

  get staminaValue(): number {
    return this.stamina;
  }

  /** Velocidad horizontal actual, en m/s (para la animación del avatar). */
  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /**
   * Avanza la simulación un paso.
   * @param dt segundos
   * @param intent lo que el jugador está pidiendo
   * @param colliders obstáculos cercanos, del `ChunkManager`
   */
  update(dt: number, intent: MoveIntent, colliders: readonly Collider[]): void {
    const step = Math.min(dt, 0.05);

    // Dirección deseada, relativa a la cámara.
    const cos = Math.cos(this.cameraYaw);
    const sin = Math.sin(this.cameraYaw);
    this.desired.set(
      intent.strafe * cos - intent.forward * sin,
      0,
      -intent.strafe * sin - intent.forward * cos,
    );
    const magnitude = this.desired.length();
    if (magnitude > 1) this.desired.divideScalar(magnitude);

    const wantsSprint = intent.sprint && this.stamina > 1 && magnitude > 0.1;
    const base = wantsSprint ? MOVEMENT.SPRINT : magnitude > 0.55 ? MOVEMENT.RUN : MOVEMENT.WALK;
    const target = base * this.weatherSpeed * Math.min(1, magnitude * 1.4);

    // Energía: correr cansa, caminar repone.
    this.stamina = MathUtils.clamp(
      this.stamina + (wantsSprint ? -MOVEMENT_STAMINA_COST : MOVEMENT_STAMINA_REGEN) * step,
      0,
      100,
    );

    // Aceleración suave hacia la velocidad objetivo.
    const accel = this.grounded ? 26 : 8;
    const targetX = this.desired.x * target;
    const targetZ = this.desired.z * target;
    this.velocity.x = MathUtils.damp(this.velocity.x, targetX, accel * 0.35, step);
    this.velocity.z = MathUtils.damp(this.velocity.z, targetZ, accel * 0.35, step);

    // Salto y gravedad.
    if (intent.jump && this.grounded) {
      this.velocity.y = MOVEMENT.JUMP_IMPULSE;
      this.grounded = false;
    }
    this.velocity.y += MOVEMENT.GRAVITY * step;

    // Integración con resolución de colisión eje por eje.
    const nextX = this.position.x + this.velocity.x * step;
    if (!this.blocked(nextX, this.position.z, colliders)) this.position.x = nextX;
    else this.velocity.x = 0;

    const nextZ = this.position.z + this.velocity.z * step;
    if (!this.blocked(this.position.x, nextZ, colliders)) this.position.z = nextZ;
    else this.velocity.z = 0;

    this.position.y += this.velocity.y * step;
    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.grounded = true;
    }

    // El cuerpo mira hacia donde se mueve.
    if (this.speed > 0.35) {
      const desiredYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.yaw = dampAngle(this.yaw, desiredYaw, 12, step);
    }
  }

  /** `true` si el cilindro del jugador se solapa con algún obstáculo. */
  private blocked(x: number, z: number, colliders: readonly Collider[]): boolean {
    const r = this.radius;
    const feet = this.position.y;
    for (const c of colliders) {
      // Se puede pasar por encima de lo que sea más bajo que la rodilla.
      if (c.height < 0.45) continue;
      if (feet > c.height - 0.05) continue;
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  /** Orbita la cámara (arrastre del mouse o del dedo). */
  orbit(deltaX: number, deltaY: number): void {
    if (this.mode === 'isometrica') return;
    this.cameraYaw -= deltaX * 0.005;
    this.cameraPitch = MathUtils.clamp(this.cameraPitch + deltaY * 0.004, 0.08, 1.25);
  }

  /** Acerca o aleja la cámara. */
  zoom(delta: number): void {
    this.cameraDistance = MathUtils.clamp(this.cameraDistance + delta * 0.02, 5, 42);
  }

  toggleCameraMode(): CameraMode {
    this.mode = this.mode === 'tercera' ? 'isometrica' : 'tercera';
    if (this.mode === 'isometrica') {
      this.cameraPitch = 0.72;
      this.cameraYaw = Math.PI * 0.75;
      this.cameraDistance = 26;
    }
    return this.mode;
  }

  /**
   * Coloca la cámara detrás del jugador, con suavizado y colisión.
   *
   * Si hay algo entre el jugador y la cámara —un álamo de vereda, la pared de la
   * Municipalidad— la cámara se acerca hasta despejar la vista. Sin esto, cada vez
   * que girás contra un árbol te comés la copa en pantalla.
   */
  applyCamera(camera: PerspectiveCamera, dt: number, colliders: readonly Collider[] = []): void {
    const d = this.clearDistance(this.cameraDistance, colliders);
    const pitch = this.cameraPitch;
    const height = Math.sin(pitch) * d;
    const flat = Math.cos(pitch) * d;
    const targetX = this.position.x + Math.sin(this.cameraYaw) * flat;
    const targetZ = this.position.z + Math.cos(this.cameraYaw) * flat;
    const targetY = this.position.y + EYE_HEIGHT + height;

    const smooth = this.mode === 'isometrica' ? 6 : 10;
    camera.position.x = MathUtils.damp(camera.position.x, targetX, smooth, dt);
    camera.position.y = MathUtils.damp(camera.position.y, targetY, smooth, dt);
    camera.position.z = MathUtils.damp(camera.position.z, targetZ, smooth, dt);
    camera.lookAt(this.position.x, this.position.y + EYE_HEIGHT * 0.75, this.position.z);
  }

  /**
   * Distancia libre de obstáculos entre el jugador y la cámara: recorre el rayo
   * de a medio metro y se detiene en el primer bloqueo.
   */
  private clearDistance(desired: number, colliders: readonly Collider[]): number {
    if (colliders.length === 0) return desired;
    const pitch = this.cameraPitch;
    const dirX = Math.sin(this.cameraYaw) * Math.cos(pitch);
    const dirZ = Math.cos(this.cameraYaw) * Math.cos(pitch);
    const dirY = Math.sin(pitch);
    const originY = this.position.y + EYE_HEIGHT;
    const margin = 0.6;

    for (let t = 1.5; t <= desired; t += 0.5) {
      const x = this.position.x + dirX * t;
      const y = originY + dirY * t;
      const z = this.position.z + dirZ * t;
      for (const c of colliders) {
        if (y > c.height || c.height < 0.5) continue;
        if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) {
          return Math.max(2.2, t - 0.8);
        }
      }
    }
    return desired;
  }

  /** Teletransporte (spawn, respawn, comando de depuración). */
  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
  }
}

const MOVEMENT_STAMINA_COST = 14;
const MOVEMENT_STAMINA_REGEN = 9;

/** Interpolación angular por el camino corto. */
const dampAngle = (current: number, target: number, lambda: number, dt: number): number => {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
};
