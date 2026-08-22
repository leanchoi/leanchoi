/**
 * Modelo de datos del motor voxel.
 *
 * Todo lo que se dibuja —suelo, veredas, árboles, casas, prefabs reales— termina
 * expresado como una lista de `VoxelBox`. El `ChunkManager` las empaqueta en dos
 * `InstancedMesh` por chunk (opaco y vidrio), así que una manzana entera cuesta
 * dos draw calls sin importar cuántos bloques tenga.
 */

import type { GridCell } from '@esquel/shared';

/** Capas de render: cada una es un `InstancedMesh` con su propio material. */
export const VOXEL_LAYERS = ['opaque', 'glass'] as const;
export type VoxelLayer = (typeof VOXEL_LAYERS)[number];

/**
 * Caja alineada a ejes. Posición = centro, en metros de mundo.
 * No es un voxel de 0.5 m suelto: es un prisma ya fusionado, que puede representar
 * desde un ladrillo hasta la losa entera de una calle.
 */
export interface VoxelBox {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** Color 0xRRGGBB aplicado por instancia. */
  readonly color: number;
  readonly layer: VoxelLayer;
}

/** Caja de colisión del jugador contra el mundo (sólo XZ + altura). */
export interface Collider {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly height: number;
}

/** Resultado de construir una manzana. */
export interface ChunkGeometry {
  readonly cell: GridCell;
  readonly boxes: VoxelBox[];
  readonly colliders: Collider[];
  /** Nivel de detalle con el que se construyó (0 = completo). */
  readonly lod: 0 | 1;
}

/** Acumulador de cajas: evita repetir el objeto literal en cada generador. */
export class VoxelBuilder {
  readonly boxes: VoxelBox[] = [];
  readonly colliders: Collider[] = [];

  /** Agrega una caja por centro y tamaño. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, layer: VoxelLayer = 'opaque'): void {
    this.boxes.push({ x, y, z, sx, sy, sz, color, layer });
  }

  /** Agrega una caja por esquina mínima y tamaño (más cómodo para edificios). */
  boxAt(minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, color: number, layer: VoxelLayer = 'opaque'): void {
    this.box(minX + sx / 2, minY + sy / 2, minZ + sz / 2, sx, sy, sz, color, layer);
  }

  /** Registra un obstáculo para el jugador. */
  collider(minX: number, minZ: number, sx: number, sz: number, height: number): void {
    this.colliders.push({ minX, maxX: minX + sx, minZ, maxZ: minZ + sz, height });
  }

  get count(): number {
    return this.boxes.length;
  }
}
