/**
 * `VoxelWorld` — fachada del motor.
 *
 * Junta las tres piezas que forman el escenario y las mantiene coherentes entre
 * sí: el gestor de chunks (la ciudad), el telón montañoso (el valle) y el
 * registro de fachadas reales (lo que hace que Esquel sea Esquel y no una ciudad
 * genérica).
 *
 * El resto de la aplicación no habla con `ChunkManager` ni con `PrefabRegistry`
 * directamente: le pide cosas a `VoxelWorld` y listo.
 */

import type { Scene } from 'three';
import type { BuildingPrefabMeta, GridCell, KnownStreet, Vec3 } from '@esquel/shared';
import { ChunkManager, type ChunkManagerOptions } from './ChunkManager.ts';
import { MountainBackdrop } from './MountainBackdrop.ts';
import type { Collider } from './VoxelTypes.ts';
import { PrefabRegistry, prefabRegistry } from '../world/buildings/PrefabRegistry.ts';
import { resolveAddress, type ParcelAddress } from '../world/EsquelStreetGrid.ts';

export interface WorldEnvironment {
  /** Nieve acumulada en el suelo [0,1]. */
  readonly snow: number;
  /** Estación otoñal [0,1]: tiñe los álamos de dorado. */
  readonly autumn: number;
  /** `true` cuando el sol está bajo el horizonte. */
  readonly night: boolean;
  /** Color de la luz solar (para teñir los cerros). */
  readonly sunTint: number;
  /** Intensidad de la luz solar [0,1]. */
  readonly sunIntensity: number;
}

export interface VoxelWorldOptions extends Partial<ChunkManagerOptions> {
  readonly registry?: PrefabRegistry;
}

export class VoxelWorld {
  readonly chunks: ChunkManager;
  readonly mountains: MountainBackdrop;
  readonly registry: PrefabRegistry;
  private lastEnv: WorldEnvironment = {
    snow: 0,
    autumn: 0,
    night: false,
    sunTint: 0xffffff,
    sunIntensity: 1,
  };

  constructor(scene: Scene, options: VoxelWorldOptions = {}) {
    const { registry, ...chunkOptions } = options;
    this.registry = registry ?? prefabRegistry;
    this.chunks = new ChunkManager(scene, this.registry, chunkOptions);
    this.mountains = new MountainBackdrop(scene, 0);
    void this.registry.loadIndex();
  }

  /** Propaga clima y luz a todo lo que depende de ellos. */
  setEnvironment(env: WorldEnvironment): void {
    this.lastEnv = env;
    this.chunks.setEnvironment({ snow: env.snow, autumn: env.autumn, night: env.night });
    this.chunks.setGlassEmissive(env.night ? 0.9 : 0.05);
    this.mountains.setSnowCoverage(env.snow);
    this.mountains.setSunTint(env.sunTint, env.sunIntensity);
  }

  get environment(): WorldEnvironment {
    return this.lastEnv;
  }

  /** Llamar una vez por cuadro con la posición del jugador. */
  update(playerX: number, playerZ: number): void {
    this.chunks.update(playerX, playerZ);
  }

  /** Obstáculos cercanos para la colisión del jugador. */
  collidersNear(x: number, z: number, radius?: number): Collider[] {
    return this.chunks.collidersNear(x, z, radius);
  }

  /** Resuelve una dirección real a su parcela en el mundo. */
  locate(street: KnownStreet, streetNumber: number): ParcelAddress | null {
    return resolveAddress(street, streetNumber);
  }

  /** Punto de aparición frente a una dirección, sobre la vereda. */
  spawnAt(street: KnownStreet, streetNumber: number): Vec3 | null {
    const parcel = this.locate(street, streetNumber);
    if (!parcel) return null;
    const g = parcel.geometry;
    const offset = 6;
    switch (g.facingYawDeg) {
      case 0:
        return { x: g.center.x, y: 0, z: g.center.z + g.sizeZ / 2 + offset };
      case 90:
        return { x: g.center.x + g.sizeX / 2 + offset, y: 0, z: g.center.z };
      case 180:
        return { x: g.center.x, y: 0, z: g.center.z - g.sizeZ / 2 - offset };
      default:
        return { x: g.center.x - g.sizeX / 2 - offset, y: 0, z: g.center.z };
    }
  }

  /**
   * Inyecta una fachada real en caliente. Es el camino que recorre una foto de un
   * vecino desde que se aprueba hasta que aparece en la ciudad, sin recargar.
   */
  injectPrefab(meta: BuildingPrefabMeta): { ok: true } | { ok: false; error: string } {
    return this.registry.inject(meta);
  }

  /** Vuelve a poner el edificio genérico en una parcela. */
  removePrefab(parcelId: string): void {
    this.registry.remove(parcelId);
  }

  /** Fuerza la reconstrucción de una manzana. */
  invalidate(cell: GridCell): void {
    this.chunks.invalidate(cell);
  }

  stats(): { chunks: number; instances: number; pending: number; colliders: number; prefabs: number } {
    return { ...this.chunks.stats(), prefabs: this.registry.size };
  }

  dispose(): void {
    this.chunks.dispose();
    this.mountains.dispose();
  }
}
