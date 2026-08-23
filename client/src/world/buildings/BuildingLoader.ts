/**
 * Traductor de prefabs a geometría del motor.
 *
 * Toma un `BuildingPrefabMeta` —el mismo objeto que valida
 * `/shared/schemas/building-prefab.schema.json`— y lo convierte en cajas listas
 * para el instanciador del chunk.
 *
 * Dos optimizaciones hacen que un edificio de 25.000 voxels cueste ~400 cajas:
 *
 *  1. **Culling de interiores**: un voxel rodeado por los seis lados no se dibuja.
 *  2. **Fusión codiciosa en X**: los voxels contiguos del mismo color se juntan en
 *     un único prisma.
 *
 * ORDEN DEL VOLUMEN RLE (contrato con `/tools/prefab-importer`):
 *   índice = (y * sizeZ + z) * sizeX + x     — x es el eje que varía más rápido.
 */

import { WORLD_ANCHOR, type BuildingPrefabMeta } from '@esquel/shared';
import { PALETTE, mixColor } from '../../engine/VoxelPalette.ts';
import type { Collider, VoxelBox, VoxelLayer } from '../../engine/VoxelTypes.ts';

const VOXEL = WORLD_ANCHOR.voxelSizeM;

/** Materiales que se dibujan en la capa de vidrio (translúcida y emisiva). */
const GLASS_MATERIALS = new Set(['vidrio_vidriera', 'vidrio', 'ventana', 'farol', 'cartel_luminoso']);

export interface LoadedPrefab {
  readonly prefabId: string;
  readonly parcelId: string;
  readonly boxes: VoxelBox[];
  readonly colliders: Collider[];
  /** Cantidad de voxels sólidos antes de optimizar (métrica de diagnóstico). */
  readonly solidVoxels: number;
}

export interface LoadOptions {
  /** Nieve acumulada [0,1]: blanquea las caras superiores expuestas. */
  readonly snow?: number;
  /** `true` de noche: enciende los materiales emisivos. */
  readonly night?: boolean;
  /** LOD 1 devuelve sólo la silueta del volumen. */
  readonly lod?: 0 | 1;
}

interface PaletteEntry {
  readonly color: number;
  readonly layer: VoxelLayer;
  readonly emissive: number;
}

const parseHex = (hex: string | undefined, fallback: number): number => {
  if (!hex) return fallback;
  const v = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(v) ? v : fallback;
};

/** Color por defecto de cada material conocido, si el prefab no trae `tint`. */
const MATERIAL_COLORS: Readonly<Record<string, number>> = {
  aire: 0x000000,
  revoque_claro: PALETTE.plasterLight,
  revoque_crema: PALETTE.plasterCream,
  ladrillo_visto: PALETTE.brick,
  piedra: PALETTE.stone,
  hormigon: PALETTE.concrete,
  chapa_acanalada: PALETTE.roofZinc,
  chapa_roja: PALETTE.roofZincRed,
  madera_lenga: PALETTE.wood,
  madera_oscura: PALETTE.woodDark,
  vidrio_vidriera: PALETTE.glass,
  vidrio: PALETTE.glass,
  ventana: PALETTE.glass,
  metal: PALETTE.metal,
  metal_oxidado: PALETTE.metalRust,
  teja: PALETTE.roofTile,
  cartel: PALETTE.sign,
  cartel_luminoso: PALETTE.sign,
  farol: PALETTE.glassLit,
  bandera_celeste: PALETTE.flagBlue,
  bandera_blanca: PALETTE.flagWhite,
  bandera_sol: PALETTE.flagSun,
  asfalto: PALETTE.asphalt,
  vereda: PALETTE.sidewalk,
  pasto: PALETTE.grass,
  riel: PALETTE.metal,
  balasto: PALETTE.stone,
};

const buildPalette = (meta: BuildingPrefabMeta, opts: LoadOptions): PaletteEntry[] => {
  const out: PaletteEntry[] = [];
  for (const entry of meta.geometry.palette.entries) {
    const base = MATERIAL_COLORS[entry.material] ?? PALETTE.concrete;
    const emissive = entry.emissive ?? 0;
    const glass = GLASS_MATERIALS.has(entry.material) || emissive > 0.2;
    let color = parseHex(entry.tint, base);
    if (glass && opts.night && emissive > 0) color = mixColor(color, PALETTE.glassLit, 0.65);
    out[entry.index] = { color, layer: glass ? 'glass' : 'opaque', emissive };
  }
  return out;
};

/** Expande el RLE a un arreglo plano de índices de paleta. */
const expandRle = (rle: readonly (readonly [number, number])[], length: number): Uint8Array => {
  const out = new Uint8Array(length);
  let cursor = 0;
  for (const [index, count] of rle) {
    const end = Math.min(length, cursor + count);
    if (index !== 0) out.fill(index, cursor, end);
    cursor = end;
    if (cursor >= length) break;
  }
  return out;
};

/** Rota un punto local (en voxels) según el yaw del emplazamiento. */
const rotate = (
  x: number,
  z: number,
  sizeX: number,
  sizeZ: number,
  yawDeg: number,
): { x: number; z: number } => {
  switch (yawDeg) {
    case 90:
      return { x: sizeZ - z, z: x };
    case 180:
      return { x: sizeX - x, z: sizeZ - z };
    case 270:
      return { x: z, z: sizeX - x };
    default:
      return { x, z };
  }
};

/**
 * Convierte un prefab en cajas de mundo.
 *
 * Si el prefab no trae volumen RLE (por ejemplo, uno que apunta a un `.glb`),
 * devuelve la silueta del volumen declarado: el edificio ocupa su lugar en la
 * ciudad aunque su malla todavía no esté disponible.
 */
export const loadPrefab = (meta: BuildingPrefabMeta, opts: LoadOptions = {}): LoadedPrefab => {
  const boxes: VoxelBox[] = [];
  const colliders: Collider[] = [];
  const { origin, yawDeg } = meta.placement;
  const [sizeX, sizeY, sizeZ] = meta.volume.size;
  const palette = buildPalette(meta, opts);
  const snow = opts.snow ?? 0;

  // Colisión: la caja declarada por el prefab, ya en coordenadas de mundo.
  const col = meta.volume.collision;
  const swapped = yawDeg === 90 || yawDeg === 270;
  const cw = swapped ? col.max.z - col.min.z : col.max.x - col.min.x;
  const cd = swapped ? col.max.x - col.min.x : col.max.z - col.min.z;
  colliders.push({
    minX: origin.x + col.min.x,
    maxX: origin.x + col.min.x + cw,
    minZ: origin.z + col.min.z,
    maxZ: origin.z + col.min.z + cd,
    height: col.max.y - col.min.y,
  });

  const rle = meta.geometry.rle;
  if (!rle || rle.length === 0 || opts.lod === 1) {
    // Silueta: una caja por el volumen completo.
    const w = (swapped ? sizeZ : sizeX) * VOXEL;
    const d = (swapped ? sizeX : sizeZ) * VOXEL;
    const h = sizeY * VOXEL;
    boxes.push({
      x: origin.x + w / 2,
      y: origin.y + h / 2,
      z: origin.z + d / 2,
      sx: w,
      sy: h,
      sz: d,
      color: mixColor(PALETTE.plasterLight, PALETTE.roofSnow, snow * 0.4),
      layer: 'opaque',
    });
    return { prefabId: meta.prefabId, parcelId: meta.placement.parcelId, boxes, colliders, solidVoxels: 0 };
  }

  const total = sizeX * sizeY * sizeZ;
  const voxels = expandRle(rle, total);
  const at = (x: number, y: number, z: number): number =>
    x < 0 || y < 0 || z < 0 || x >= sizeX || y >= sizeY || z >= sizeZ ? 0 : (voxels[(y * sizeZ + z) * sizeX + x]);

  let solidVoxels = 0;
  for (let i = 0; i < total; i++) if (voxels[i] !== 0) solidVoxels++;

  // Recorrido por filas en X, fusionando corridas visibles del mismo material.
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      let runStart = -1;
      let runIndex = 0;
      const flush = (endExclusive: number): void => {
        if (runStart < 0) return;
        const runLength = endExclusive - runStart;
        const entry = palette[runIndex] ?? { color: PALETTE.concrete, layer: 'opaque', emissive: 0 };
        // Nieve sobre las caras que miran al cielo.
        const exposedTop = at(runStart, y + 1, z) === 0;
        const color =
          snow > 0.05 && exposedTop && entry.layer === 'opaque'
            ? mixColor(entry.color, PALETTE.roofSnow, Math.min(0.8, snow))
            : entry.color;

        const localCenterX = runStart + runLength / 2;
        const localCenterZ = z + 0.5;
        const r = rotate(localCenterX, localCenterZ, sizeX, sizeZ, yawDeg);
        const wide = yawDeg === 90 || yawDeg === 270;
        boxes.push({
          x: origin.x + r.x * VOXEL,
          y: origin.y + (y + 0.5) * VOXEL,
          z: origin.z + r.z * VOXEL,
          sx: (wide ? 1 : runLength) * VOXEL,
          sy: VOXEL,
          sz: (wide ? runLength : 1) * VOXEL,
          color,
          layer: entry.layer,
        });
        runStart = -1;
      };

      for (let x = 0; x < sizeX; x++) {
        const v = at(x, y, z);
        const visible =
          v !== 0 &&
          (at(x - 1, y, z) === 0 ||
            at(x + 1, y, z) === 0 ||
            at(x, y - 1, z) === 0 ||
            at(x, y + 1, z) === 0 ||
            at(x, y, z - 1) === 0 ||
            at(x, y, z + 1) === 0);

        if (!visible) {
          flush(x);
          continue;
        }
        if (runStart < 0) {
          runStart = x;
          runIndex = v;
        } else if (v !== runIndex) {
          flush(x);
          runStart = x;
          runIndex = v;
        }
      }
      flush(sizeX);
    }
  }

  // Marquesinas: plano del cartel en su anclaje.
  for (const sign of meta.anchors.signs) {
    const [w, h] = sign.sizeM;
    const horizontal = sign.yawDeg === 0 || sign.yawDeg === 180;
    boxes.push({
      x: origin.x + sign.position.x,
      y: origin.y + sign.position.y + h / 2,
      z: origin.z + sign.position.z,
      sx: horizontal ? w : 0.3,
      sy: h,
      sz: horizontal ? 0.3 : w,
      color: opts.night ? PALETTE.glassLit : PALETTE.sign,
      layer: 'glass',
    });
  }

  return { prefabId: meta.prefabId, parcelId: meta.placement.parcelId, boxes, colliders, solidVoxels };
};
