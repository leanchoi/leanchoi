/**
 * Vegetación cordillerana en bloques.
 *
 * Tres especies que definen el paisaje de Esquel: el álamo de vereda (alto y
 * flaco, amarillo en otoño), el pino/ciprés de la cordillera (cónico y oscuro) y
 * el arbusto bajo de estepa. Todo se arma con cajas: nada de mallas externas.
 */

import { PALETTE, mixColor, shade } from './VoxelPalette.ts';
import type { VoxelBuilder } from './VoxelTypes.ts';
import type { Rng } from '@esquel/shared';

export type TreeSpecies = 'alamo' | 'pino' | 'arbusto';

export interface TreeOptions {
  /** Fracción de otoño [0,1]: tiñe el follaje del álamo hacia el dorado. */
  readonly autumn?: number;
  /** Nieve acumulada [0,1]: pinta las copas de blanco. */
  readonly snow?: number;
  /** Escala general, 1 = tamaño estándar. */
  readonly scale?: number;
}

const foliageColor = (base: number, opts: TreeOptions): number => {
  let color = base;
  if (opts.autumn && opts.autumn > 0) color = mixColor(color, PALETTE.poplarAutumn, opts.autumn);
  if (opts.snow && opts.snow > 0) color = mixColor(color, PALETTE.roofSnow, opts.snow * 0.55);
  return color;
};

/** Álamo de vereda: tronco alto y copa angosta en tres tramos. */
export const buildPoplar = (b: VoxelBuilder, x: number, z: number, rng: Rng, opts: TreeOptions = {}): void => {
  const s = opts.scale ?? 1;
  const height = (7 + rng.next() * 3) * s;
  const trunk = 0.6 * s;
  b.boxAt(x - trunk / 2, 0, z - trunk / 2, trunk, height * 0.45, trunk, PALETTE.trunk);
  const leaf = foliageColor(PALETTE.poplar, opts);
  const w0 = 2.4 * s;
  b.boxAt(x - w0 / 2, height * 0.35, z - w0 / 2, w0, height * 0.3, w0, leaf);
  const w1 = 1.8 * s;
  b.boxAt(x - w1 / 2, height * 0.62, z - w1 / 2, w1, height * 0.26, w1, shade(leaf, 0.06));
  const w2 = 1.1 * s;
  b.boxAt(x - w2 / 2, height * 0.85, z - w2 / 2, w2, height * 0.2, w2, shade(leaf, 0.12));
  // El colisionador va hasta la copa: además de frenar al jugador, hace que la
  // cámara en tercera persona se acerque en vez de meterse adentro del follaje.
  b.collider(x - trunk, z - trunk, trunk * 2, trunk * 2, height);
};

/** Pino/ciprés: cono escalonado de cuatro pisos. */
export const buildPine = (b: VoxelBuilder, x: number, z: number, rng: Rng, opts: TreeOptions = {}): void => {
  const s = opts.scale ?? 1;
  const height = (6 + rng.next() * 3.5) * s;
  const trunk = 0.7 * s;
  b.boxAt(x - trunk / 2, 0, z - trunk / 2, trunk, height * 0.3, trunk, PALETTE.trunk);
  const leaf = foliageColor(PALETTE.pine, opts);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const w = (4.2 - 3.0 * t) * s;
    const y = height * (0.22 + t * 0.62);
    const h = height * 0.22;
    b.boxAt(x - w / 2, y, z - w / 2, w, h, w, i % 2 === 0 ? leaf : shade(leaf, -0.08));
  }
  b.collider(x - trunk, z - trunk, trunk * 2, trunk * 2, height);
};

/** Arbusto de estepa: dos cajas bajas, sin colisión. */
export const buildShrub = (b: VoxelBuilder, x: number, z: number, rng: Rng, opts: TreeOptions = {}): void => {
  const s = opts.scale ?? 1;
  const w = (1.2 + rng.next() * 0.8) * s;
  const h = (0.8 + rng.next() * 0.6) * s;
  const leaf = foliageColor(PALETTE.shrub, opts);
  b.boxAt(x - w / 2, 0, z - w / 2, w, h, w, leaf);
  b.boxAt(x - w / 3, h * 0.8, z - w / 3, w * 0.66, h * 0.5, w * 0.66, shade(leaf, 0.08));
};

/** Dibuja la especie pedida. */
export const buildTree = (
  b: VoxelBuilder,
  species: TreeSpecies,
  x: number,
  z: number,
  rng: Rng,
  opts: TreeOptions = {},
): void => {
  if (species === 'alamo') buildPoplar(b, x, z, rng, opts);
  else if (species === 'pino') buildPine(b, x, z, rng, opts);
  else buildShrub(b, x, z, rng, opts);
};
