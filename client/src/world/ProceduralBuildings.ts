/**
 * Generador procedimental de edificios.
 *
 * Cada parcela produce siempre el mismo edificio: la semilla sale del `parcelId`,
 * así que dos jugadores ven idéntica ciudad sin que el servidor mande un solo byte
 * de geometría. Cuando llega un prefab real para esa parcela, el `BuildingLoader`
 * lo reemplaza y esta generación deja de correr para ese lote.
 *
 * Tipologías: casa patagónica de chapa a dos aguas, comercio con vidriera y
 * marquesina, edificio de esquina de 3-5 plantas y baldío con alambrado.
 */

import { createRng, seedFromString, type LandUse, type Rng } from '@esquel/shared';
import { HOUSE_ROOFS, HOUSE_WALLS, PALETTE, mixColor, shade } from '../engine/VoxelPalette.ts';
import { buildPine, buildShrub, buildTree } from '../engine/Vegetation.ts';
import type { VoxelBuilder } from '../engine/VoxelTypes.ts';
import { LOT_DEPTH_M, type ParcelAddress } from './EsquelStreetGrid.ts';

/** Contexto ambiental que afecta cómo se ve el edificio. */
export interface BuildContext {
  /** Nieve acumulada [0,1]: pinta techos y copas. */
  readonly snow: number;
  /** Otoño [0,1]: tiñe los álamos. */
  readonly autumn: number;
  /** `true` de noche: enciende vidrieras y ventanas. */
  readonly night: boolean;
  /** Detalle: 0 = completo, 1 = silueta lejana. */
  readonly lod: 0 | 1;
}

export type BuildingKind = 'casa' | 'comercio' | 'edificio' | 'baldio' | 'galpon';

/** Elige tipología según uso de suelo, esquina y azar determinista. */
export const pickBuildingKind = (landUse: LandUse, corner: boolean, rng: Rng): BuildingKind => {
  switch (landUse) {
    case 'baldio':
      return rng.chance(0.65) ? 'baldio' : 'casa';
    case 'comercial':
      if (corner) return rng.chance(0.55) ? 'edificio' : 'comercio';
      return rng.chance(0.75) ? 'comercio' : 'edificio';
    case 'gastronomico':
      return rng.chance(0.8) ? 'comercio' : 'casa';
    case 'industrial':
    case 'ferroviario':
      return 'galpon';
    default:
      if (corner) return rng.chance(0.3) ? 'comercio' : 'casa';
      return rng.chance(0.12) ? 'baldio' : 'casa';
  }
};

/** Vector unitario hacia la calle, según el frente de la parcela. */
const facingVector = (yawDeg: number): { fx: number; fz: number } => {
  switch (yawDeg) {
    case 0:
      return { fx: 0, fz: 1 };
    case 90:
      return { fx: 1, fz: 0 };
    case 180:
      return { fx: 0, fz: -1 };
    default:
      return { fx: -1, fz: 0 };
  }
};

const roofColorFor = (base: number, ctx: BuildContext): number =>
  ctx.snow > 0.05 ? mixColor(base, PALETTE.roofSnow, Math.min(0.85, ctx.snow)) : base;

const windowColor = (ctx: BuildContext, rng: Rng): number =>
  ctx.night && rng.chance(0.55) ? PALETTE.glassLit : PALETTE.glass;

/* ------------------------------------------------------------------ */
/* Casa patagónica                                                     */
/* ------------------------------------------------------------------ */

const buildCasa = (b: VoxelBuilder, parcel: ParcelAddress, ctx: BuildContext, rng: Rng): void => {
  const g = parcel.geometry;
  const { fx, fz } = facingVector(g.facingYawDeg);

  const alongX = fx === 0;
  const width = (alongX ? g.sizeX : g.sizeZ) * (0.62 + rng.next() * 0.2);
  const depth = LOT_DEPTH_M * (0.45 + rng.next() * 0.2);
  const floors = rng.chance(0.22) ? 2 : 1;
  const floorH = 3.0;
  const height = floors * floorH;

  // Retiro desde la línea municipal: jardincito al frente.
  const setback = 1.5 + rng.next() * 3;
  const cx = g.center.x - fx * (LOT_DEPTH_M / 2 - depth / 2 - setback);
  const cz = g.center.z - fz * (LOT_DEPTH_M / 2 - depth / 2 - setback);
  const sx = alongX ? width : depth;
  const sz = alongX ? depth : width;
  const minX = cx - sx / 2;
  const minZ = cz - sz / 2;

  const wall = HOUSE_WALLS[rng.int(0, HOUSE_WALLS.length - 1)];
  const roof = roofColorFor(HOUSE_ROOFS[rng.int(0, HOUSE_ROOFS.length - 1)], ctx);

  b.boxAt(minX, 0, minZ, sx, height, sz, wall);
  b.collider(minX, minZ, sx, sz, height);

  if (ctx.lod === 1) {
    b.boxAt(minX - 0.3, height, minZ - 0.3, sx + 0.6, 1.4, sz + 0.6, roof);
    return;
  }

  // Techo a dos aguas, escalonado en tres tramos (estética voxel).
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const shrink = t * 0.42;
    const w = sx * (1.08 - shrink);
    const d = sz * (1.08 - shrink);
    b.boxAt(cx - w / 2, height + i * 0.7, cz - d / 2, w, 0.75, d, i === 0 ? roof : shade(roof, -0.05 * i));
  }

  // Puerta al frente y ventanas a los costados del acceso.
  const doorW = 1.2;
  const doorColor = rng.chance(0.5) ? PALETTE.doorRed : PALETTE.doorBlue;
  const doorX = cx + fx * (sx / 2) - (fx !== 0 ? fx * 0.15 : 0);
  const doorZ = cz + fz * (sz / 2) - (fz !== 0 ? fz * 0.15 : 0);
  b.box(doorX, 1.05, doorZ, alongX ? doorW : 0.4, 2.1, alongX ? 0.4 : doorW, doorColor);

  const win = windowColor(ctx, rng);
  for (let f = 0; f < floors; f++) {
    for (const s of [-1, 1]) {
      const offset = (alongX ? sx : sz) * 0.28 * s;
      b.box(
        doorX + (alongX ? offset : 0),
        1.4 + f * floorH,
        doorZ + (alongX ? 0 : offset),
        alongX ? 1.5 : 0.3,
        1.2,
        alongX ? 0.3 : 1.5,
        win,
        'glass',
      );
    }
  }

  // Chimenea de leña: en Esquel humea medio año.
  if (rng.chance(0.55)) {
    const chX = cx + (rng.next() - 0.5) * sx * 0.5;
    const chZ = cz + (rng.next() - 0.5) * sz * 0.5;
    b.boxAt(chX, height + 1.5, chZ, 0.8, 1.6, 0.8, PALETTE.brickDark);
  }

  // Patio: pasto, un árbol y a veces un tanque de agua.
  b.boxAt(g.minX, -0.05, g.minZ, g.sizeX, 0.12, g.sizeZ, PALETTE.grass);
  const yardX = cx - fx * (depth * 0.9);
  const yardZ = cz - fz * (depth * 0.9);
  if (rng.chance(0.6)) {
    buildTree(b, rng.chance(0.5) ? 'alamo' : 'pino', yardX, yardZ, rng, {
      autumn: ctx.autumn,
      snow: ctx.snow,
      scale: 0.8,
    });
  } else {
    buildShrub(b, yardX, yardZ, rng, { snow: ctx.snow });
  }
};

/* ------------------------------------------------------------------ */
/* Comercio                                                            */
/* ------------------------------------------------------------------ */

const buildComercio = (b: VoxelBuilder, parcel: ParcelAddress, ctx: BuildContext, rng: Rng): void => {
  const g = parcel.geometry;
  const { fx, fz } = facingVector(g.facingYawDeg);
  const alongX = fx === 0;

  const width = (alongX ? g.sizeX : g.sizeZ) * 0.94;
  const depth = LOT_DEPTH_M * (0.6 + rng.next() * 0.25);
  const floors = rng.chance(0.35) ? 2 : 1;
  const floorH = 3.6;
  const height = floors * floorH;

  const cx = g.center.x - fx * (LOT_DEPTH_M / 2 - depth / 2);
  const cz = g.center.z - fz * (LOT_DEPTH_M / 2 - depth / 2);
  const sx = alongX ? width : depth;
  const sz = alongX ? depth : width;
  const minX = cx - sx / 2;
  const minZ = cz - sz / 2;

  const wall = mixColor(HOUSE_WALLS[rng.int(0, HOUSE_WALLS.length - 1)], PALETTE.concrete, 0.25);
  b.boxAt(minX, 0, minZ, sx, height, sz, wall);
  b.collider(minX, minZ, sx, sz, height);
  b.boxAt(minX - 0.25, height, minZ - 0.25, sx + 0.5, 0.6, sz + 0.5, roofColorFor(PALETTE.roofZinc, ctx));

  if (ctx.lod === 1) return;

  // Vidriera corrida a la altura de la vereda.
  const frontX = cx + fx * (sx / 2 - 0.15);
  const frontZ = cz + fz * (sz / 2 - 0.15);
  b.box(
    frontX,
    1.7,
    frontZ,
    alongX ? width * 0.8 : 0.35,
    2.2,
    alongX ? 0.35 : width * 0.8,
    ctx.night ? PALETTE.glassLit : PALETTE.glass,
    'glass',
  );

  // Marquesina: el anclaje donde después entra el cartel del sponsor.
  b.box(
    frontX + fx * 0.7,
    3.3,
    frontZ + fz * 0.7,
    alongX ? width * 0.86 : 1.6,
    0.5,
    alongX ? 1.6 : width * 0.86,
    PALETTE.sign,
  );

  // Planta alta con ventanas.
  if (floors > 1) {
    const win = windowColor(ctx, rng);
    for (let i = -1; i <= 1; i++) {
      b.box(
        frontX + (alongX ? i * width * 0.28 : 0),
        floorH + 1.6,
        frontZ + (alongX ? 0 : i * width * 0.28),
        alongX ? 1.6 : 0.3,
        1.3,
        alongX ? 0.3 : 1.6,
        win,
        'glass',
      );
    }
  }
};

/* ------------------------------------------------------------------ */
/* Edificio de esquina                                                 */
/* ------------------------------------------------------------------ */

const buildEdificio = (b: VoxelBuilder, parcel: ParcelAddress, ctx: BuildContext, rng: Rng): void => {
  const g = parcel.geometry;
  const floors = rng.int(3, 5);
  const floorH = 3.2;
  const height = floors * floorH;
  const inset = 0.6;
  const minX = g.minX + inset;
  const minZ = g.minZ + inset;
  const sx = g.sizeX - inset * 2;
  const sz = g.sizeZ - inset * 2;

  const wall = mixColor(PALETTE.concrete, HOUSE_WALLS[rng.int(0, HOUSE_WALLS.length - 1)], 0.35);
  b.boxAt(minX, 0, minZ, sx, height, sz, wall);
  b.collider(minX, minZ, sx, sz, height);
  b.boxAt(minX - 0.3, height, minZ - 0.3, sx + 0.6, 0.7, sz + 0.6, roofColorFor(PALETTE.roofZinc, ctx));
  // Tanque de agua: no hay edificio en la Patagonia sin su tanque arriba.
  b.boxAt(minX + sx * 0.55, height + 0.7, minZ + sz * 0.5, 2.2, 1.8, 2.2, PALETTE.metal);

  if (ctx.lod === 1) return;

  // Bandas de ventanas por planta, en las cuatro caras.
  const win = windowColor(ctx, rng);
  for (let f = 1; f < floors; f++) {
    const y = f * floorH + 1.2;
    b.box(minX + sx / 2, y, minZ - 0.02, sx * 0.78, 1.3, 0.25, win, 'glass');
    b.box(minX + sx / 2, y, minZ + sz + 0.02, sx * 0.78, 1.3, 0.25, win, 'glass');
    b.box(minX - 0.02, y, minZ + sz / 2, 0.25, 1.3, sz * 0.78, win, 'glass');
    b.box(minX + sx + 0.02, y, minZ + sz / 2, 0.25, 1.3, sz * 0.78, win, 'glass');
  }
  // Local comercial en planta baja.
  b.box(minX + sx / 2, 1.8, minZ - 0.05, sx * 0.7, 2.4, 0.3, ctx.night ? PALETTE.glassLit : PALETTE.glass, 'glass');
};

/* ------------------------------------------------------------------ */
/* Galpón y baldío                                                     */
/* ------------------------------------------------------------------ */

const buildGalpon = (b: VoxelBuilder, parcel: ParcelAddress, ctx: BuildContext, rng: Rng): void => {
  const g = parcel.geometry;
  const sx = g.sizeX * 0.9;
  const sz = g.sizeZ * 0.9;
  const minX = g.center.x - sx / 2;
  const minZ = g.center.z - sz / 2;
  const height = 5 + rng.next() * 2;
  b.boxAt(minX, 0, minZ, sx, height, sz, PALETTE.metalRust);
  b.collider(minX, minZ, sx, sz, height);
  b.boxAt(minX - 0.4, height, minZ - 0.4, sx + 0.8, 1.0, sz + 0.8, roofColorFor(PALETTE.roofZinc, ctx));
};

const buildBaldio = (b: VoxelBuilder, parcel: ParcelAddress, ctx: BuildContext, rng: Rng): void => {
  const g = parcel.geometry;
  b.boxAt(g.minX, -0.05, g.minZ, g.sizeX, 0.14, g.sizeZ, PALETTE.grassDry);
  if (ctx.lod === 1) return;

  // Alambrado perimetral: postes cada 4 m.
  const posts = Math.max(2, Math.floor(g.sizeX / 4));
  for (let i = 0; i <= posts; i++) {
    const x = g.minX + (i / posts) * g.sizeX;
    b.boxAt(x - 0.08, 0, g.minZ - 0.08, 0.16, 1.3, 0.16, PALETTE.woodDark);
    b.boxAt(x - 0.08, 0, g.minZ + g.sizeZ - 0.08, 0.16, 1.3, 0.16, PALETTE.woodDark);
  }
  // Yuyos y algún resto de obra.
  const weeds = rng.int(3, 7);
  for (let i = 0; i < weeds; i++) {
    buildShrub(b, g.minX + rng.next() * g.sizeX, g.minZ + rng.next() * g.sizeZ, rng, { snow: ctx.snow, scale: 0.7 });
  }
  if (rng.chance(0.4)) {
    b.boxAt(g.minX + g.sizeX * 0.4, 0, g.minZ + g.sizeZ * 0.5, 2.5, 0.9, 1.6, PALETTE.stone);
  }
};

/* ------------------------------------------------------------------ */
/* Entrada pública                                                     */
/* ------------------------------------------------------------------ */

/**
 * Construye el edificio procedimental de una parcela dentro del builder del chunk.
 * Devuelve la tipología elegida, que el `ChunkManager` usa para decidir si hay que
 * poner un NPC o una marquesina de sponsor encima.
 */
export const buildProceduralParcel = (
  b: VoxelBuilder,
  parcel: ParcelAddress,
  landUse: LandUse,
  ctx: BuildContext,
): BuildingKind => {
  const rng = createRng(seedFromString(parcel.parcelId));
  const kind = pickBuildingKind(landUse, parcel.geometry.corner, rng);
  switch (kind) {
    case 'casa':
      buildCasa(b, parcel, ctx, rng);
      break;
    case 'comercio':
      buildComercio(b, parcel, ctx, rng);
      break;
    case 'edificio':
      buildEdificio(b, parcel, ctx, rng);
      break;
    case 'galpon':
      buildGalpon(b, parcel, ctx, rng);
      break;
    default:
      buildBaldio(b, parcel, ctx, rng);
      break;
  }
  return kind;
};

/**
 * Plaza San Martín: cruz de senderos, cantero central con el monumento, glorieta,
 * bancos y arboleda. Es el corazón político del juego: acá se juntan las
 * movilizaciones y se arman los duelos con más público.
 */
export const buildPlazaBlock = (b: VoxelBuilder, centerX: number, centerZ: number, ctx: BuildContext): void => {
  const rng = createRng(seedFromString('plaza-san-martin'));
  const half = 47;

  // Césped y senderos en cruz.
  b.boxAt(centerX - half, -0.05, centerZ - half, half * 2, 0.14, half * 2, ctx.snow > 0.3 ? PALETTE.roofSnow : PALETTE.grass);
  b.boxAt(centerX - half, 0.02, centerZ - 3, half * 2, 0.12, 6, PALETTE.plazaTile);
  b.boxAt(centerX - 3, 0.02, centerZ - half, 6, 0.12, half * 2, PALETTE.plazaTile);
  // Sendero diagonal perimetral.
  b.boxAt(centerX - half + 6, 0.02, centerZ - half + 6, half * 2 - 12, 0.1, 3, PALETTE.plazaTile);
  b.boxAt(centerX - half + 6, 0.02, centerZ + half - 9, half * 2 - 12, 0.1, 3, PALETTE.plazaTile);

  // Cantero y monumento central.
  b.boxAt(centerX - 7, 0.1, centerZ - 7, 14, 0.35, 14, PALETTE.plazaTile);
  b.boxAt(centerX - 2.5, 0.4, centerZ - 2.5, 5, 1.2, 5, PALETTE.stone);
  b.boxAt(centerX - 1.6, 1.6, centerZ - 1.6, 3.2, 3.4, 3.2, shade(PALETTE.stone, 0.1));
  b.boxAt(centerX - 0.9, 5.0, centerZ - 0.9, 1.8, 2.6, 1.8, PALETTE.metal);
  b.collider(centerX - 2.5, centerZ - 2.5, 5, 5, 7);

  // Mástil con la bandera.
  b.boxAt(centerX + 11, 0, centerZ + 11, 0.5, 12, 0.5, PALETTE.metal);
  b.boxAt(centerX + 11.5, 9.4, centerZ + 11, 3.4, 0.8, 0.2, PALETTE.flagBlue);
  b.boxAt(centerX + 11.5, 10.2, centerZ + 11, 3.4, 0.8, 0.2, PALETTE.flagWhite);
  b.boxAt(centerX + 11.5, 11.0, centerZ + 11, 3.4, 0.8, 0.2, PALETTE.flagBlue);
  b.boxAt(centerX + 12.9, 10.2, centerZ + 11, 0.6, 0.6, 0.22, PALETTE.flagSun);

  if (ctx.lod === 1) return;

  // Glorieta.
  b.boxAt(centerX - 20, 0.1, centerZ + 14, 9, 0.5, 9, PALETTE.plazaTile);
  for (const [dx, dz] of [
    [-19, 15],
    [-19, 21.5],
    [-12.5, 15],
    [-12.5, 21.5],
  ] as const) {
    b.boxAt(centerX + dx, 0.5, centerZ + dz, 0.5, 3.2, 0.5, PALETTE.wood);
  }
  b.boxAt(centerX - 20.5, 3.7, centerZ + 13.5, 10, 0.8, 10, roofColorFor(PALETTE.roofZincRed, ctx));

  // Bancos mirando al monumento.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bx = centerX + Math.cos(a) * 16;
    const bz = centerZ + Math.sin(a) * 16;
    b.boxAt(bx - 1.2, 0.15, bz - 0.35, 2.4, 0.45, 0.7, PALETTE.wood);
    b.boxAt(bx - 1.2, 0.6, bz - 0.35, 2.4, 0.7, 0.2, PALETTE.woodDark);
  }

  // Arboleda perimetral: pinos altos, como en la plaza real.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    buildPine(b, centerX + Math.cos(a) * 33, centerZ + Math.sin(a) * 33, rng, {
      snow: ctx.snow,
      scale: 1.15,
    });
  }
};
