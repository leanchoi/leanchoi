/**
 * Autoría de los tres edificios emblemáticos de Esquel 2027.
 *
 *   1. Municipalidad de Esquel      — San Martín 650
 *   2. Estación de La Trochita      — Roggero y Brun
 *   3. Comité / Unidad Básica Central — frente a la Plaza San Martín
 *
 * Cada uno se modela como volumen voxel, se serializa a RLE y se emite como un
 * `BuildingPrefabMeta` que valida contra `/shared/schemas/building-prefab.schema.json`.
 * Los archivos salen a `client/public/prefabs/`, que es lo que sirve Vite y lo
 * que después va al CDN de Hostinger.
 *
 * Ejecutar:  node --experimental-strip-types tools/prefab-importer/author-landmarks.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORLD_ANCHOR,
  type BuildingPrefabMeta,
  type IsoDateTime,
  type ParcelId,
  type PrefabId,
} from '../../shared/index.ts';
import {
  CORNER_NW,
  addressOfParcel,
  parcelGeometry,
  resolveAddress,
  type ParcelAddress,
} from '../../client/src/world/EsquelStreetGrid.ts';
import { VoxelVolume } from './VoxelVolume.ts';

const VOXEL = WORLD_ANCHOR.voxelSizeM;
const NOW = '2027-01-15T12:00:00.000Z' as IsoDateTime;

/* ------------------------------------------------------------------ */
/* Paleta común                                                        */
/* ------------------------------------------------------------------ */

const M = {
  AIRE: 0,
  REVOQUE: 1,
  CREMA: 2,
  LADRILLO: 3,
  PIEDRA: 4,
  HORMIGON: 5,
  CHAPA: 6,
  CHAPA_ROJA: 7,
  MADERA: 8,
  MADERA_OSCURA: 9,
  VIDRIO: 10,
  METAL: 11,
  METAL_OXIDADO: 12,
  TEJA: 13,
  CARTEL: 14,
  BANDERA_CELESTE: 15,
  BANDERA_BLANCA: 16,
  BANDERA_SOL: 17,
  RIEL: 18,
  BALASTO: 19,
  FAROL: 20,
  PANIO_VERDE: 21,
  PANIO_BORDO: 22,
} as const;

const PALETTE_ENTRIES: BuildingPrefabMeta['geometry']['palette']['entries'] = [
  { index: M.AIRE, material: 'aire' },
  { index: M.REVOQUE, material: 'revoque_claro', tint: '#DCD3C2', roughness: 0.85 },
  { index: M.CREMA, material: 'revoque_crema', tint: '#E0CBA0', roughness: 0.85 },
  { index: M.LADRILLO, material: 'ladrillo_visto', tint: '#8C4A32', roughness: 0.9 },
  { index: M.PIEDRA, material: 'piedra', tint: '#8D8B85', roughness: 0.95 },
  { index: M.HORMIGON, material: 'hormigon', tint: '#B4B0A6', roughness: 0.9 },
  { index: M.CHAPA, material: 'chapa_acanalada', tint: '#5E6B70', roughness: 0.6 },
  { index: M.CHAPA_ROJA, material: 'chapa_roja', tint: '#8F4436', roughness: 0.6 },
  { index: M.MADERA, material: 'madera_lenga', tint: '#7A5230', roughness: 0.8 },
  { index: M.MADERA_OSCURA, material: 'madera_oscura', tint: '#53381F', roughness: 0.8 },
  { index: M.VIDRIO, material: 'vidrio_vidriera', tint: '#9FCBD6', roughness: 0.15, emissive: 0.4 },
  { index: M.METAL, material: 'metal', tint: '#6D7378', roughness: 0.45 },
  { index: M.METAL_OXIDADO, material: 'metal_oxidado', tint: '#8A5A3C', roughness: 0.85 },
  { index: M.TEJA, material: 'teja', tint: '#9C5A3C', roughness: 0.85 },
  { index: M.CARTEL, material: 'cartel', tint: '#F2B441', emissive: 0.25 },
  { index: M.BANDERA_CELESTE, material: 'bandera_celeste', tint: '#74ACDF' },
  { index: M.BANDERA_BLANCA, material: 'bandera_blanca', tint: '#F2F2F2' },
  { index: M.BANDERA_SOL, material: 'bandera_sol', tint: '#F6B40E' },
  { index: M.RIEL, material: 'riel', tint: '#6D7378', roughness: 0.4 },
  { index: M.BALASTO, material: 'balasto', tint: '#7C7468', roughness: 1 },
  { index: M.FAROL, material: 'farol', tint: '#F5D98A', emissive: 0.9 },
  { index: M.PANIO_VERDE, material: 'cartel', tint: '#1F6F4A' },
  { index: M.PANIO_BORDO, material: 'cartel', tint: '#8C2F1D' },
];

/* ------------------------------------------------------------------ */
/* Emplazamiento                                                       */
/* ------------------------------------------------------------------ */

interface Footprint {
  /** Esquina mínima de la huella, en metros de mundo. */
  readonly minX: number;
  readonly minZ: number;
  /** Extensión en X y Z, en metros de mundo. */
  readonly worldX: number;
  readonly worldZ: number;
  /** Hacia dónde mira el frente. */
  readonly yaw: 0 | 90 | 180 | 270;
}

/** Une varias parcelas en una huella rectangular. */
const mergeParcels = (parcels: readonly ParcelAddress[]): Footprint => {
  const first = parcels[0] as ParcelAddress;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of parcels) {
    minX = Math.min(minX, p.geometry.minX);
    minZ = Math.min(minZ, p.geometry.minZ);
    maxX = Math.max(maxX, p.geometry.minX + p.geometry.sizeX);
    maxZ = Math.max(maxZ, p.geometry.minZ + p.geometry.sizeZ);
  }
  return { minX, minZ, worldX: maxX - minX, worldZ: maxZ - minZ, yaw: first.geometry.facingYawDeg };
};

/** Tamaño del volumen en voxels, según la orientación del frente. */
const volumeSize = (fp: Footprint): [number, number] => {
  const swapped = fp.yaw === 90 || fp.yaw === 270;
  const sizeX = Math.round((swapped ? fp.worldZ : fp.worldX) / VOXEL);
  const sizeZ = Math.round((swapped ? fp.worldX : fp.worldZ) / VOXEL);
  return [sizeX, sizeZ];
};

/**
 * Traduce una coordenada local del volumen (en voxels) al desplazamiento en
 * metros respecto del origen del prefab, aplicando la misma rotación que el
 * `BuildingLoader`. Los anclajes se guardan ya rotados.
 */
const anchorAt = (x: number, y: number, z: number, sizeX: number, sizeZ: number, yaw: number): { x: number; y: number; z: number } => {
  switch (yaw) {
    case 90:
      return { x: (sizeZ - z) * VOXEL, y: y * VOXEL, z: x * VOXEL };
    case 180:
      return { x: (sizeX - x) * VOXEL, y: y * VOXEL, z: (sizeZ - z) * VOXEL };
    case 270:
      return { x: z * VOXEL, y: y * VOXEL, z: (sizeX - x) * VOXEL };
    default:
      return { x: x * VOXEL, y: y * VOXEL, z: z * VOXEL };
  }
};

/* ------------------------------------------------------------------ */
/* 1. Municipalidad de Esquel — San Martín 650                         */
/* ------------------------------------------------------------------ */

const authorMunicipalidad = (): { meta: BuildingPrefabMeta; occupies: string[]; slug: string } => {
  const home = resolveAddress('san_martin', 650);
  if (!home) throw new Error('No se pudo resolver San Martín 650');

  // Toma las cuatro parcelas de la cara este: un municipio ocupa media cuadra.
  const parcels = [4, 5, 6, 7].map((i) => addressOfParcel(home.cell, i));
  const fp = mergeParcels(parcels);
  const [sizeX, sizeZ] = volumeSize(fp);
  const sizeY = 34; // 17 m hasta la punta del mástil

  const v = new VoxelVolume(sizeX, sizeY, sizeZ);
  const front = 0;
  const backWall = sizeZ - 2;

  // Basamento de piedra.
  v.box(0, 0, 0, sizeX, 4, sizeZ, M.PIEDRA);
  // Cuerpo principal, hueco.
  v.hollowBox(0, 4, 0, sizeX, 26, sizeZ, M.REVOQUE, 2);
  // Entrepisos.
  v.slab(2, 2, sizeX - 2, sizeZ - 2, 12, M.HORMIGON);
  v.slab(2, 2, sizeX - 2, sizeZ - 2, 20, M.HORMIGON);

  // Cuerpo central más alto, con frontón.
  const cx0 = Math.round(sizeX * 0.36);
  const cx1 = Math.round(sizeX * 0.64);
  v.hollowBox(cx0, 4, 0, cx1, 30, Math.round(sizeZ * 0.7), M.CREMA, 2);
  v.gableRoof(cx0 - 2, front, cx1 + 2, 8, 30, 4, M.CHAPA, 'x');

  // Pórtico: columnas al frente.
  v.columns({ axis: 'x', from: 4, to: sizeX - 4, fixed: front, y0: 4, y1: 24, material: M.PIEDRA, thickness: 3, step: 12 });
  v.slab(0, front, sizeX, 4, 24, M.HORMIGON, 2);

  // Aberturas: dos bandas de ventanas al frente y una atrás.
  v.windowBand({ axis: 'x', from: 6, to: sizeX - 6, fixed: front, y: 8, height: 5, material: M.VIDRIO, width: 4, gap: 6, depth: 2 });
  v.windowBand({ axis: 'x', from: 6, to: sizeX - 6, fixed: front, y: 16, height: 5, material: M.VIDRIO, width: 4, gap: 6, depth: 2 });
  v.windowBand({ axis: 'x', from: 8, to: sizeX - 8, fixed: backWall, y: 10, height: 4, material: M.VIDRIO, width: 4, gap: 8, depth: 2 });

  // Portón de entrada.
  const doorX0 = Math.round(sizeX / 2) - 5;
  v.box(doorX0, 4, front, doorX0 + 10, 16, front + 2, M.MADERA_OSCURA);
  v.box(doorX0 + 1, 5, front, doorX0 + 9, 14, front + 1, M.MADERA);

  // Reloj sobre el frontón.
  const clockX = Math.round(sizeX / 2);
  v.box(clockX - 3, 25, front, clockX + 3, 31, front + 1, M.CARTEL);
  v.box(clockX - 1, 27, front, clockX, 30, front + 2, M.METAL);
  v.box(clockX - 1, 27, front, clockX + 2, 28, front + 2, M.METAL);

  // Mástil con la bandera, a un costado del acceso.
  const flagX = Math.round(sizeX * 0.2);
  v.box(flagX, 4, 2, flagX + 1, 34, 3, M.METAL);
  v.box(flagX + 1, 28, 2, flagX + 9, 30, 3, M.BANDERA_CELESTE);
  v.box(flagX + 1, 30, 2, flagX + 9, 32, 3, M.BANDERA_BLANCA);
  v.box(flagX + 4, 30, 2, flagX + 6, 32, 3, M.BANDERA_SOL);

  // Parapeto y tanque de agua.
  v.parapetRoof(0, 0, sizeX, sizeZ, 26, M.REVOQUE, 2);
  v.box(sizeX - 20, 28, sizeZ - 14, sizeX - 12, 34, sizeZ - 6, M.METAL);

  const rle = v.toRle();
  const anchorDoor = anchorAt(doorX0 + 5, 0, front, sizeX, sizeZ, fp.yaw);
  const anchorSign = anchorAt(Math.round(sizeX / 2), 17, front, sizeX, sizeZ, fp.yaw);
  const poster = (x: number, y: number) => anchorAt(x, y, front, sizeX, sizeZ, fp.yaw);

  const meta: BuildingPrefabMeta = {
    prefabId: 'prefab:municipalidad-esquel' as PrefabId,
    version: 1,
    schemaVersion: 1,
    displayName: 'Municipalidad de Esquel',
    address: {
      street: 'san_martin',
      number: 650,
      barrio: 'centro',
      city: 'Esquel',
      province: 'Chubut',
      country: 'AR',
      postalCode: '9200',
    },
    landUse: 'institucional',
    placement: {
      parcelId: home.parcelId as ParcelId,
      cell: home.cell,
      parcelIndex: home.parcelIndex,
      origin: { x: fp.minX, y: 0, z: fp.minZ },
      yawDeg: fp.yaw,
      frontageM: Math.max(fp.worldX, fp.worldZ),
      depthM: Math.min(fp.worldX, fp.worldZ),
      setbackM: 0,
    },
    volume: {
      size: [sizeX, sizeY, sizeZ],
      floors: 3,
      floorHeightM: 4,
      collision: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: fp.worldX, y: sizeY * VOXEL, z: fp.worldZ },
      },
      hasInterior: false,
    },
    geometry: {
      source: 'voxel_json',
      lods: [
        { level: 0, asset: '/prefabs/municipalidad-esquel/lod0.vox.json', minDistanceM: 0, triangles: 0 },
      ],
      rle,
      palette: { entries: PALETTE_ENTRIES },
    },
    anchors: {
      door: { position: anchorDoor, yawDeg: fp.yaw },
      signs: [
        {
          id: 'frontis',
          position: anchorSign,
          yawDeg: fp.yaw,
          sizeM: [10, 1.2],
          defaultTexture: '/prefabs/municipalidad-esquel/frontis.png',
        },
      ],
      npcSpawn: anchorAt(doorX0 + 5, 0, front + 6, sizeX, sizeZ, fp.yaw),
      posterSlots: [
        { id: 'columna-1', position: poster(10, 6), yawDeg: fp.yaw },
        { id: 'columna-2', position: poster(sizeX - 10, 6), yawDeg: fp.yaw },
      ],
    },
    poiId: 'poi:municipalidad',
    tags: ['municipalidad', 'institucional', 'hito', 'centro'],
    landmark: true,
    review: { state: 'aprobado', reviewedAt: NOW, reviewerUserId: '1', notes: 'Hito autorado por el proyecto.' },
    createdAt: NOW,
    updatedAt: NOW,
    active: true,
  };

  return {
    meta,
    slug: 'municipalidad-esquel',
    occupies: parcels.filter((p) => p.parcelId !== home.parcelId).map((p) => p.parcelId),
  };
};

/* ------------------------------------------------------------------ */
/* 2. Estación de La Trochita — Roggero y Brun                          */
/* ------------------------------------------------------------------ */

const authorTrochita = (): { meta: BuildingPrefabMeta; occupies: string[]; slug: string } => {
  // Esquina noroeste de la manzana que forman Roggero (longitudinal 3) y Brun
  // (transversal -3): el predio ferroviario ocupa la esquina y media cara norte.
  const cell = { col: -3, row: 2 };
  const corner = addressOfParcel(cell, CORNER_NW);
  const northLots = [8, 9, 10, 11].map((i) => addressOfParcel(cell, i));
  const parcels = [corner, ...northLots];
  const fp = mergeParcels([{ ...corner, geometry: parcelGeometry(cell, CORNER_NW) }, ...northLots]);
  const [sizeX, sizeZ] = volumeSize(fp);
  const sizeY = 26;

  const v = new VoxelVolume(sizeX, sizeY, sizeZ);

  // Andén de hormigón sobre el frente.
  v.box(0, 0, 0, sizeX, 2, 16, M.HORMIGON);
  // Balasto y vía detrás del edificio: La Trochita es trocha angosta (75 cm).
  v.box(0, 0, sizeZ - 16, sizeX, 2, sizeZ, M.BALASTO);
  v.box(0, 2, sizeZ - 12, sizeX, 3, sizeZ - 11, M.RIEL);
  v.box(0, 2, sizeZ - 9, sizeX, 3, sizeZ - 8, M.RIEL);
  for (let x = 0; x < sizeX; x += 4) v.box(x, 1, sizeZ - 13, x + 2, 2, sizeZ - 7, M.MADERA_OSCURA);

  // Edificio de la estación: madera y ladrillo, techo a dos aguas.
  const bx0 = Math.round(sizeX * 0.12);
  const bx1 = Math.round(sizeX * 0.72);
  v.box(bx0, 0, 14, bx1, 3, 30, M.PIEDRA);
  v.hollowBox(bx0, 3, 14, bx1, 17, 30, M.LADRILLO, 2);
  v.box(bx0 + 2, 3, 14, bx1 - 2, 17, 16, M.MADERA);
  v.gableRoof(bx0 - 3, 12, bx1 + 3, 32, 17, 7, M.CHAPA_ROJA, 'x');

  // Galería sobre el andén.
  v.columns({ axis: 'x', from: bx0 + 2, to: bx1 - 2, fixed: 10, y0: 2, y1: 14, material: M.MADERA, thickness: 2, step: 10 });
  v.slab(bx0 - 2, 8, bx1 + 2, 16, 14, M.CHAPA, 2);

  // Aberturas.
  v.windowBand({ axis: 'x', from: bx0 + 5, to: bx1 - 5, fixed: 14, y: 6, height: 5, material: M.VIDRIO, width: 4, gap: 7, depth: 2 });
  const doorX0 = Math.round((bx0 + bx1) / 2) - 3;
  v.box(doorX0, 3, 14, doorX0 + 6, 12, 16, M.MADERA_OSCURA);

  // Chimenea.
  v.box(bx1 - 10, 17, 20, bx1 - 7, 26, 23, M.LADRILLO);

  // Tanque de agua de la estación.
  const tankX = Math.round(sizeX * 0.85);
  v.box(tankX - 6, 0, 20, tankX + 6, 14, 32, M.MADERA_OSCURA);
  v.box(tankX - 8, 14, 18, tankX + 8, 22, 34, M.METAL_OXIDADO);
  v.box(tankX - 8, 22, 18, tankX + 8, 24, 34, M.CHAPA);

  // Silueta de la locomotora sobre la vía.
  const lx = Math.round(sizeX * 0.3);
  v.box(lx, 3, sizeZ - 13, lx + 26, 11, sizeZ - 7, M.METAL_OXIDADO);
  v.box(lx + 2, 11, sizeZ - 12, lx + 10, 14, sizeZ - 8, M.METAL);
  v.box(lx + 20, 11, sizeZ - 12, lx + 24, 18, sizeZ - 8, M.METAL); // chimenea
  v.box(lx + 26, 3, sizeZ - 13, lx + 44, 12, sizeZ - 7, M.MADERA); // vagón
  v.box(lx + 3, 2, sizeZ - 13, lx + 7, 4, sizeZ - 7, M.METAL); // ruedas

  const rle = v.toRle();
  const anchorDoor = anchorAt(doorX0 + 3, 0, 14, sizeX, sizeZ, fp.yaw);

  const meta: BuildingPrefabMeta = {
    prefabId: 'prefab:estacion-la-trochita' as PrefabId,
    version: 1,
    schemaVersion: 1,
    displayName: 'Estación La Trochita',
    address: {
      street: 'roggero',
      number: 0,
      barrio: 'estacion',
      city: 'Esquel',
      province: 'Chubut',
      country: 'AR',
      postalCode: '9200',
    },
    landUse: 'ferroviario',
    placement: {
      parcelId: corner.parcelId as ParcelId,
      cell,
      parcelIndex: CORNER_NW,
      origin: { x: fp.minX, y: 0, z: fp.minZ },
      yawDeg: fp.yaw,
      frontageM: Math.max(fp.worldX, fp.worldZ),
      depthM: Math.min(fp.worldX, fp.worldZ),
      setbackM: 0,
    },
    volume: {
      size: [sizeX, sizeY, sizeZ],
      floors: 1,
      floorHeightM: 5,
      collision: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: fp.worldX, y: sizeY * VOXEL, z: fp.worldZ },
      },
      hasInterior: false,
    },
    geometry: {
      source: 'voxel_json',
      lods: [{ level: 0, asset: '/prefabs/estacion-la-trochita/lod0.vox.json', minDistanceM: 0, triangles: 0 }],
      rle,
      palette: { entries: PALETTE_ENTRIES },
    },
    anchors: {
      door: { position: anchorDoor, yawDeg: fp.yaw },
      signs: [
        {
          id: 'cartel-estacion',
          position: anchorAt(Math.round((bx0 + bx1) / 2), 15, 13, sizeX, sizeZ, fp.yaw),
          yawDeg: fp.yaw,
          sizeM: [8, 1],
          defaultTexture: '/prefabs/estacion-la-trochita/cartel.png',
        },
      ],
      npcSpawn: anchorAt(Math.round(sizeX / 2), 0, 8, sizeX, sizeZ, fp.yaw),
      posterSlots: [
        { id: 'anden-1', position: anchorAt(bx0 + 4, 4, 13, sizeX, sizeZ, fp.yaw), yawDeg: fp.yaw },
        { id: 'anden-2', position: anchorAt(bx1 - 6, 4, 13, sizeX, sizeZ, fp.yaw), yawDeg: fp.yaw },
      ],
    },
    poiId: 'poi:la-trochita',
    tags: ['trochita', 'ferroviario', 'hito', 'turismo'],
    landmark: true,
    review: { state: 'aprobado', reviewedAt: NOW, reviewerUserId: '1' },
    createdAt: NOW,
    updatedAt: NOW,
    active: true,
  };

  return {
    meta,
    slug: 'estacion-la-trochita',
    occupies: parcels.filter((p) => p.parcelId !== corner.parcelId).map((p) => p.parcelId),
  };
};

/* ------------------------------------------------------------------ */
/* 3. Comité / Unidad Básica Central — frente a la Plaza San Martín      */
/* ------------------------------------------------------------------ */

const authorComite = (): { meta: BuildingPrefabMeta; occupies: string[]; slug: string } => {
  // Av. Alvear al 1200: la vereda de enfrente de la plaza. La esquina donde se
  // arman todas las movilizaciones del juego.
  const home = resolveAddress('av_alvear', 1200);
  if (!home) throw new Error('No se pudo resolver Av. Alvear 1200');
  const parcels = [home, addressOfParcel(home.cell, home.parcelIndex + 1)];
  const fp = mergeParcels(parcels);
  const [sizeX, sizeZ] = volumeSize(fp);
  const sizeY = 24;

  const v = new VoxelVolume(sizeX, sizeY, sizeZ);
  const front = 0;

  // Dos plantas de revoque crema con zócalo de ladrillo.
  v.box(0, 0, 0, sizeX, 2, sizeZ, M.HORMIGON);
  v.hollowBox(0, 2, 0, sizeX, 18, sizeZ, M.CREMA, 2);
  v.box(0, 2, front, sizeX, 5, front + 2, M.LADRILLO);
  v.slab(2, 2, sizeX - 2, sizeZ - 2, 10, M.MADERA);
  v.gableRoof(-2, -2, sizeX + 2, sizeZ + 2, 18, 5, M.CHAPA, 'x');

  // Planta baja: vidriera de la unidad básica y puerta de doble hoja.
  const doorX0 = Math.round(sizeX / 2) - 4;
  v.box(doorX0, 2, front, doorX0 + 8, 12, front + 2, M.MADERA_OSCURA);
  v.box(doorX0 + 1, 3, front, doorX0 + 7, 11, front + 1, M.MADERA);
  v.windowBand({ axis: 'x', from: 4, to: doorX0 - 2, fixed: front, y: 4, height: 6, material: M.VIDRIO, width: 6, gap: 4, depth: 2 });
  v.windowBand({ axis: 'x', from: doorX0 + 10, to: sizeX - 4, fixed: front, y: 4, height: 6, material: M.VIDRIO, width: 6, gap: 4, depth: 2 });

  // Balcón corrido del primer piso: desde acá se habla a la esquina.
  v.slab(2, -4, sizeX - 2, 2, 12, M.HORMIGON, 1);
  v.box(2, 13, -4, sizeX - 2, 15, -3, M.METAL);
  v.box(2, 13, 1, sizeX - 2, 15, 2, M.METAL);
  v.windowBand({ axis: 'x', from: 5, to: sizeX - 5, fixed: front, y: 13, height: 4, material: M.VIDRIO, width: 4, gap: 5, depth: 2 });

  // Trapos colgados del balcón, en los colores de dos facciones.
  v.box(6, 6, -5, 16, 12, -4, M.PANIO_VERDE);
  v.box(sizeX - 18, 6, -5, sizeX - 8, 12, -4, M.PANIO_BORDO);

  // Cartel del comité y bombo apoyado en el balcón.
  v.box(doorX0 - 2, 12, front - 1, doorX0 + 10, 14, front, M.CARTEL);
  v.box(sizeX - 12, 13, -3, sizeX - 8, 16, 0, M.MADERA_OSCURA);
  // Farol de la entrada: de noche este es el punto de encuentro.
  v.box(doorX0 - 3, 11, front - 1, doorX0 - 2, 12, front, M.FAROL);

  const rle = v.toRle();
  const anchorDoor = anchorAt(doorX0 + 4, 0, front, sizeX, sizeZ, fp.yaw);

  const meta: BuildingPrefabMeta = {
    prefabId: 'prefab:comite-central' as PrefabId,
    version: 1,
    schemaVersion: 1,
    displayName: 'Comité Central — Unidad Básica',
    address: {
      street: 'av_alvear',
      number: 1200,
      barrio: 'centro',
      city: 'Esquel',
      province: 'Chubut',
      country: 'AR',
      postalCode: '9200',
    },
    landUse: 'institucional',
    placement: {
      parcelId: home.parcelId as ParcelId,
      cell: home.cell,
      parcelIndex: home.parcelIndex,
      origin: { x: fp.minX, y: 0, z: fp.minZ },
      yawDeg: fp.yaw,
      frontageM: Math.max(fp.worldX, fp.worldZ),
      depthM: Math.min(fp.worldX, fp.worldZ),
      setbackM: 0,
    },
    volume: {
      size: [sizeX, sizeY, sizeZ],
      floors: 2,
      floorHeightM: 4,
      collision: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: fp.worldX, y: sizeY * VOXEL, z: fp.worldZ },
      },
      hasInterior: false,
    },
    geometry: {
      source: 'voxel_json',
      lods: [{ level: 0, asset: '/prefabs/comite-central/lod0.vox.json', minDistanceM: 0, triangles: 0 }],
      rle,
      palette: { entries: PALETTE_ENTRIES },
    },
    anchors: {
      door: { position: anchorDoor, yawDeg: fp.yaw },
      signs: [
        {
          id: 'cartel-comite',
          position: anchorAt(Math.round(sizeX / 2), 12, front, sizeX, sizeZ, fp.yaw),
          yawDeg: fp.yaw,
          sizeM: [6, 1],
          defaultTexture: '/prefabs/comite-central/cartel.png',
        },
      ],
      npcSpawn: anchorAt(Math.round(sizeX / 2), 0, front + 6, sizeX, sizeZ, fp.yaw),
      posterSlots: [
        { id: 'frente-izq', position: anchorAt(3, 4, front, sizeX, sizeZ, fp.yaw), yawDeg: fp.yaw },
        { id: 'frente-der', position: anchorAt(sizeX - 4, 4, front, sizeX, sizeZ, fp.yaw), yawDeg: fp.yaw },
        { id: 'balcon', position: anchorAt(Math.round(sizeX / 2), 13, front, sizeX, sizeZ, fp.yaw), yawDeg: fp.yaw },
      ],
    },
    tags: ['comite', 'faccion', 'hito', 'plaza'],
    landmark: true,
    review: { state: 'aprobado', reviewedAt: NOW, reviewerUserId: '1' },
    createdAt: NOW,
    updatedAt: NOW,
    active: true,
  };

  return {
    meta,
    slug: 'comite-central',
    occupies: parcels.filter((p) => p.parcelId !== home.parcelId).map((p) => p.parcelId),
  };
};

/* ------------------------------------------------------------------ */
/* Emisión                                                             */
/* ------------------------------------------------------------------ */

const outDir = new URL('../../client/public/prefabs/', import.meta.url);

const landmarks = [authorMunicipalidad(), authorTrochita(), authorComite()];
const index = {
  generatedAt: NOW,
  prefabs: landmarks.map(({ meta, slug, occupies }) => ({
    prefabId: meta.prefabId,
    version: meta.version,
    parcelId: meta.placement.parcelId,
    cell: meta.placement.cell,
    file: `${slug}/lod0.vox.json`,
    displayName: meta.displayName,
    ...(occupies.length > 0 ? { occupies } : {}),
  })),
};

for (const { meta, slug } of landmarks) {
  const path = fileURLToPath(new URL(`${slug}/lod0.vox.json`, outDir));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(meta), 'utf8');
  const [sx, sy, sz] = meta.volume.size;
  const bytes = JSON.stringify(meta).length;
  console.log(
    `  ✓ ${meta.displayName.padEnd(34)} ${String(sx).padStart(3)}×${String(sy).padStart(2)}×${String(sz).padStart(3)} vox · ` +
      `${(meta.geometry.rle?.length ?? 0).toString().padStart(5)} corridas · ${(bytes / 1024).toFixed(0)} KB`,
  );
}

writeFileSync(fileURLToPath(new URL('index.json', outDir)), JSON.stringify(index, null, 2), 'utf8');
console.log(`\n  Índice: ${index.prefabs.length} fachadas reales en client/public/prefabs/index.json`);
