/**
 * Conversión entre coordenadas geográficas reales, celdas de la cuadrícula de
 * Esquel y el espacio de mundo del motor.
 *
 * Modelo: plano tangente ENU anclado en `WORLD_ANCHOR.origin`, rotado
 * `gridBearingDeg` para alinear el eje X local con las calles longitudinales.
 * Válido con error < 0.5 m dentro de un radio de ~5 km, más que suficiente para
 * la extensión jugable (2.9 km × 2.9 km).
 */

import { CELL_PITCH_M, EARTH_RADIUS_M, WORLD_ANCHOR } from '../constants/world.ts';
import type { GridCell, LatLon, Vec2, Vec3 } from '../types/common.ts';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Metros Este/Norte respecto del ancla (antes de rotar la cuadrícula). */
export const latLonToEastNorth = (p: LatLon): Vec2 => {
  const o = WORLD_ANCHOR.origin;
  const dLat = (p.lat - o.lat) * DEG2RAD;
  const dLon = (p.lon - o.lon) * DEG2RAD;
  const north = dLat * EARTH_RADIUS_M;
  const east = dLon * EARTH_RADIUS_M * Math.cos(o.lat * DEG2RAD);
  return { x: east, z: north };
};

export const eastNorthToLatLon = (v: Vec2): LatLon => {
  const o = WORLD_ANCHOR.origin;
  const lat = o.lat + (v.z / EARTH_RADIUS_M) * RAD2DEG;
  const lon = o.lon + (v.x / (EARTH_RADIUS_M * Math.cos(o.lat * DEG2RAD))) * RAD2DEG;
  return { lat, lon };
};

/** Rota del marco ENU al marco de la cuadrícula local. */
const rotate = (x: number, z: number, deg: number): Vec2 => {
  const a = deg * DEG2RAD;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c + z * s, z: -x * s + z * c };
};

/** Coordenada geográfica → posición de mundo (Y = 0, el terreno se muestrea aparte). */
export const latLonToWorld = (p: LatLon): Vec3 => {
  const en = latLonToEastNorth(p);
  const r = rotate(en.x, en.z, WORLD_ANCHOR.gridBearingDeg);
  return { x: r.x, y: 0, z: r.z };
};

/** Posición de mundo → coordenada geográfica (para exportar a mapas reales). */
export const worldToLatLon = (v: Vec3): LatLon => {
  const r = rotate(v.x, v.z, -WORLD_ANCHOR.gridBearingDeg);
  return eastNorthToLatLon(r);
};

/** Celda que contiene una posición de mundo. */
export const worldToCell = (v: Vec3): GridCell => ({
  col: Math.floor(v.x / CELL_PITCH_M + 0.5),
  row: Math.floor(v.z / CELL_PITCH_M + 0.5),
});

/** Centro de una celda, en coordenadas de mundo. */
export const cellToWorld = (c: GridCell): Vec3 => ({
  x: c.col * CELL_PITCH_M,
  y: 0,
  z: c.row * CELL_PITCH_M,
});

/** Esquina suroeste (mínima) de la manzana edificable de una celda. */
export const cellOrigin = (c: GridCell): Vec3 => ({
  x: c.col * CELL_PITCH_M - WORLD_ANCHOR.blockSizeM / 2,
  y: 0,
  z: c.row * CELL_PITCH_M - WORLD_ANCHOR.blockSizeM / 2,
});

/**
 * Rumbo geográfico (0 = norte, 90 = este) → ángulo en el plano XZ del mundo.
 * La cuadrícula está rotada `gridBearingDeg` respecto del norte real, así que todo
 * lo que se orienta por brújula —el sol, los cerros, el viento— pasa por acá.
 */
export const bearingToWorldRad = (bearingDeg: number): number =>
  ((bearingDeg - WORLD_ANCHOR.gridBearingDeg) * Math.PI) / 180;

/** Dirección unitaria en el plano XZ para un rumbo geográfico. */
export const bearingToDirection = (bearingDeg: number): Vec2 => {
  const a = bearingToWorldRad(bearingDeg);
  return { x: Math.sin(a), z: Math.cos(a) };
};

export const cellKey = (c: GridCell): string => `${c.col}:${c.row}`;

export const cellEquals = (a: GridCell, b: GridCell): boolean => a.col === b.col && a.row === b.row;

/** `true` si la celda cae dentro de los límites jugables. */
export const cellInBounds = (c: GridCell): boolean => {
  const [minCol, minRow, maxCol, maxRow] = WORLD_ANCHOR.bounds;
  return c.col >= minCol && c.col <= maxCol && c.row >= minRow && c.row <= maxRow;
};

export const distanceM = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Distancia horizontal (ignora la altura): la que usan AOI, voz y territorio. */
export const distanceFlatM = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Distancia Manhattan en manzanas (para estimar caminata). */
export const cellDistance = (a: GridCell, b: GridCell): number =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

/** Id de parcela sintético y estable: `parcel:C<col>-R<row>-P<idx>`. */
export const parcelIdOf = (cell: GridCell, parcelIndex: number): string =>
  `parcel:C${cell.col}-R${cell.row}-P${String(parcelIndex).padStart(2, '0')}`;
