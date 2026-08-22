/**
 * Esquel 2027 — Constantes georreferenciadas del mundo.
 *
 * PRECISIÓN: los valores de `WORLD_ANCHOR` y los rangos de celdas por barrio son
 * una PRIMERA APROXIMACIÓN pensada para que el generador procedimental corra
 * desde el día uno. La calibración fina (rumbo real de la cuadrícula, altura
 * catastral por manzana, cotas del terreno) se hace en la Fase 1 con un extracto
 * de OpenStreetMap + modelo de elevación, mediante `/tools/prefab-importer`.
 * Todo lo que dependa de estos números lee de acá: no se replican constantes.
 */

import type { Barrio, LatLon, MinuteOfDay } from '../types/common.ts';
import type { WorldAnchor } from '../types/world.ts';

/** Huso de Esquel: UTC-3 fijo, sin horario de verano. */
export const ESQUEL_UTC_OFFSET_MINUTES = -180;
export const ESQUEL_TZ = 'America/Argentina/Catamarca' as const; // mismo offset fijo -03:00

/** Coordenada de referencia (aprox.): Plaza San Martín, Esquel, Chubut. */
export const ESQUEL_ORIGIN: LatLon = { lat: -42.9139, lon: -71.3241 };

/** Ancla y métrica del mundo voxel. */
export const WORLD_ANCHOR: WorldAnchor = {
  origin: ESQUEL_ORIGIN,
  /** Rumbo de la cuadrícula respecto del Norte (aprox., a calibrar con OSM). */
  gridBearingDeg: 39,
  /** Cuadra tipo: 100 m entre líneas municipales. */
  blockSizeM: 100,
  /** Calzada 14 m + veredas 3 m por lado. Av. Alvear se ensancha por override. */
  streetWidthM: 20,
  /** Arista del voxel: 0.5 m ⇒ una cuadra = 200 voxels. */
  voxelSizeM: 0.5,
  /** Extensión jugable inicial: 24 × 24 manzanas (≈ 2.9 km × 2.9 km). */
  bounds: [-12, -12, 12, 12],
};

/** Metros por celda, incluyendo la calle contigua. */
export const CELL_PITCH_M = WORLD_ANCHOR.blockSizeM + WORLD_ANCHOR.streetWidthM;

/** Radio de la Tierra usado en la proyección ENU local. */
export const EARTH_RADIUS_M = 6_378_137;

/** Orientación de las calles principales dentro de la grilla local. */
export const STREET_AXES = {
  /** Corren paralelas al eje X local (sentido NE-SO real). */
  longitudinal: ['av_alvear', '25_de_mayo', '9_de_julio', 'sarmiento', 'roca', 'irigoyen'],
  /** Corren paralelas al eje Z local (sentido NO-SE real). */
  transversal: ['san_martin', 'fontana', 'rivadavia', 'mitre', 'belgrano', 'chacabuco', 'ameghino'],
} as const;

/** Puntos de interés del lore local con su celda aproximada. */
export interface PoiDefinition {
  readonly id: string;
  readonly name: string;
  readonly cell: { readonly col: number; readonly row: number };
  readonly barrio: Barrio;
  readonly kind: 'plaza' | 'institucional' | 'transporte' | 'turistico' | 'deportivo' | 'comercial' | 'mirador';
  /** Hito protegido: la comunidad no puede reemplazarlo con un prefab propio. */
  readonly landmark: boolean;
  /** Peso estratégico para el control territorial. */
  readonly weight: number;
}

export const POIS: readonly PoiDefinition[] = [
  { id: 'poi:plaza-san-martin', name: 'Plaza San Martín', cell: { col: 0, row: 0 }, barrio: 'centro', kind: 'plaza', landmark: true, weight: 3.0 },
  { id: 'poi:municipalidad', name: 'Municipalidad de Esquel', cell: { col: 0, row: 1 }, barrio: 'centro', kind: 'institucional', landmark: true, weight: 2.6 },
  { id: 'poi:la-trochita', name: 'Estación La Trochita', cell: { col: -3, row: 2 }, barrio: 'estacion', kind: 'transporte', landmark: true, weight: 2.4 },
  { id: 'poi:terminal', name: 'Terminal de Ómnibus', cell: { col: 2, row: -3 }, barrio: 'centro', kind: 'transporte', landmark: true, weight: 1.8 },
  { id: 'poi:hospital-zonal', name: 'Hospital Zonal', cell: { col: -2, row: -2 }, barrio: 'don_bosco', kind: 'institucional', landmark: true, weight: 1.6 },
  { id: 'poi:la-hoya', name: 'Base Cerro La Hoya', cell: { col: 6, row: 9 }, barrio: 'otro', kind: 'turistico', landmark: true, weight: 2.0 },
  { id: 'poi:cerro-21', name: 'Cerro 21', cell: { col: -8, row: 5 }, barrio: 'otro', kind: 'mirador', landmark: true, weight: 1.2 },
  { id: 'poi:la-zeta', name: 'Cerro La Zeta', cell: { col: 7, row: -6 }, barrio: 'otro', kind: 'mirador', landmark: true, weight: 1.2 },
  { id: 'poi:feria-artesanos', name: 'Feria de Artesanos', cell: { col: 1, row: 0 }, barrio: 'centro', kind: 'comercial', landmark: false, weight: 1.4 },
  { id: 'poi:polideportivo', name: 'Polideportivo Municipal', cell: { col: -4, row: -1 }, barrio: 'ceferino', kind: 'deportivo', landmark: true, weight: 1.5 },
];

/** Metadatos de barrio usados por spawn, misiones y ponderación de inteligencia. */
export interface BarrioDefinition {
  readonly id: Barrio;
  readonly name: string;
  /** Rectángulo de celdas `[minCol, minRow, maxCol, maxRow]` (aprox.). */
  readonly cells: readonly [number, number, number, number];
  /**
   * Peso de padrón estimado [0,1]: cuánto pesa el barrio al ponderar intención de
   * voto agregada. Aproximación inicial; se recalibra con datos censales públicos.
   */
  readonly electoralWeight: number;
  /** Punto de aparición por defecto (celda). */
  readonly spawnCell: { readonly col: number; readonly row: number };
}

export const BARRIO_DEFS: readonly BarrioDefinition[] = [
  { id: 'centro', name: 'Centro', cells: [-3, -3, 3, 3], electoralWeight: 0.19, spawnCell: { col: 0, row: 0 } },
  { id: 'badenes', name: 'Badén', cells: [-9, -3, -4, 3], electoralWeight: 0.1, spawnCell: { col: -6, row: 0 } },
  { id: 'ceferino', name: 'Ceferino', cells: [-9, -9, -4, -4], electoralWeight: 0.11, spawnCell: { col: -6, row: -6 } },
  { id: 'bella_vista', name: 'Bella Vista', cells: [4, 4, 9, 9], electoralWeight: 0.09, spawnCell: { col: 6, row: 6 } },
  { id: 'don_bosco', name: 'Don Bosco', cells: [-3, -9, 3, -4], electoralWeight: 0.08, spawnCell: { col: 0, row: -6 } },
  { id: 'estacion', name: 'Estación', cells: [-9, 4, -4, 9], electoralWeight: 0.06, spawnCell: { col: -6, row: 6 } },
  { id: 'zona_norte', name: 'Zona Norte', cells: [-3, 4, 3, 9], electoralWeight: 0.08, spawnCell: { col: 0, row: 6 } },
  { id: 'alta_esquel', name: 'Alta Esquel', cells: [4, -3, 9, 3], electoralWeight: 0.07, spawnCell: { col: 6, row: 0 } },
  { id: 'plan_1000', name: 'Plan 1000', cells: [4, -9, 9, -4], electoralWeight: 0.06, spawnCell: { col: 6, row: -6 } },
  { id: 'valle_chico', name: 'Valle Chico', cells: [-12, -12, -10, -10], electoralWeight: 0.04, spawnCell: { col: -11, row: -11 } },
  // Sumados en la Fase 4: el mapa de calor del dashboard necesitaba el pueblo
  // entero, no sólo la parte donde se juega.
  { id: 'matadero', name: 'Matadero', cells: [10, -3, 12, 3], electoralWeight: 0.05, spawnCell: { col: 11, row: 0 } },
  { id: 'villa_ayelen', name: 'Villa Ayelén', cells: [4, 10, 9, 12], electoralWeight: 0.04, spawnCell: { col: 6, row: 11 } },
  { id: 'alto_rio_percy', name: 'Alto Río Percy', cells: [-3, -12, 3, -10], electoralWeight: 0.03, spawnCell: { col: 0, row: -11 } },
  { id: 'otro', name: 'Otro / Zona rural', cells: [-12, -12, 12, 12], electoralWeight: 0.0, spawnCell: { col: 0, row: 0 } },
];

/**
 * A qué barrio pertenece una manzana.
 *
 * Los rectángulos se solapan a propósito en `otro`, que cubre todo el mapa: se
 * recorre en orden y gana el primero que contiene la celda, así que `otro` queda
 * como red de contención al final de la lista.
 */
export const barrioOfCell = (cell: { readonly col: number; readonly row: number }): Barrio => {
  for (const def of BARRIO_DEFS) {
    const [minCol, minRow, maxCol, maxRow] = def.cells;
    if (cell.col >= minCol && cell.col <= maxCol && cell.row >= minRow && cell.row <= maxRow) return def.id;
  }
  return 'otro';
};

export const BARRIO_BY_ID: Readonly<Record<Barrio, BarrioDefinition>> = Object.freeze(
  BARRIO_DEFS.reduce(
    (acc, b) => {
      acc[b.id] = b;
      return acc;
    },
    {} as Record<Barrio, BarrioDefinition>,
  ),
);

/**
 * Las cinco zonas de disputa territorial de Esquel.
 *
 * No son manzanas enteras: son los puntos donde la ciudad se junta y donde, por
 * lo tanto, se pelea el territorio. El centro va en metros de mundo porque tres
 * de las cinco son **esquinas**, no manzanas: una calle a (k − 0,5)·120.
 */
export interface TerritoryZoneSeed {
  readonly id: string;
  readonly name: string;
  readonly barrio: Barrio;
  /** Centro de la zona en coordenadas de mundo. */
  readonly centerX: number;
  readonly centerZ: number;
  readonly radiusM: number;
  /** Peso estratégico: cuánto aporta a la intención de voto simulada. */
  readonly weight: number;
  /** Manzanas que quedan dentro del radio, para el minimapa. */
  readonly cells: readonly { readonly col: number; readonly row: number }[];
  /** Por qué importa, en criollo. */
  readonly why: string;
}

export const TERRITORY_ZONE_SEEDS: readonly TerritoryZoneSeed[] = [
  {
    id: 'zone:plaza-san-martin',
    name: 'Plaza San Martín',
    barrio: 'centro',
    centerX: 0,
    centerZ: 0,
    radiusM: 55,
    weight: 3.0,
    cells: [{ col: 0, row: 0 }],
    why: 'El corazón del pueblo: acto que no pasa por acá, no pasó.',
  },
  {
    id: 'zone:explanada-municipalidad',
    name: 'Explanada de la Municipalidad',
    barrio: 'centro',
    // San Martín (transversal 0) corre por x = −60; la Municipalidad está en la
    // vereda de enfrente, en San Martín 650.
    centerX: -62,
    centerZ: 0,
    radiusM: 42,
    weight: 2.6,
    cells: [
      { col: -1, row: 0 },
      { col: 0, row: 0 },
    ],
    why: 'Donde se hacen los reclamos y se cortan las cintas.',
  },
  {
    id: 'zone:estacion-la-trochita',
    name: 'Estación La Trochita',
    barrio: 'estacion',
    // Esquina de Roggero (longitudinal 3, z = 300) y Brun (transversal −3, x = −420).
    centerX: -400,
    centerZ: 292,
    radiusM: 48,
    weight: 2.4,
    cells: [
      { col: -3, row: 2 },
      { col: -4, row: 2 },
    ],
    why: 'La postal del pueblo: quien la controla sale en todas las fotos.',
  },
  {
    id: 'zone:alvear-y-25',
    name: 'Alvear y 25 de Mayo',
    barrio: 'centro',
    // Cruce de Av. Alvear (longitudinal 0, z = −60) con 25 de Mayo (transversal 1, x = 60).
    centerX: 60,
    centerZ: -60,
    radiusM: 38,
    weight: 2.8,
    cells: [
      { col: 0, row: 0 },
      { col: 0, row: -1 },
      { col: 1, row: 0 },
      { col: 1, row: -1 },
    ],
    why: 'La esquina con más gente por metro cuadrado de toda Esquel.',
  },
  {
    id: 'zone:acceso-la-zeta-baden',
    name: 'Acceso La Zeta — Badén',
    barrio: 'badenes',
    centerX: -720,
    centerZ: 60,
    radiusM: 60,
    weight: 2.0,
    cells: [
      { col: -6, row: 0 },
      { col: -6, row: 1 },
    ],
    why: 'La puerta del barrio: por acá entra todo lo que se reparte.',
  },
];

/** Horarios operativos por defecto de comercios (minuto local). */
export const DEFAULT_SHOP_HOURS: { readonly open: MinuteOfDay; readonly close: MinuteOfDay } = {
  open: 540 as MinuteOfDay, // 09:00
  close: 1260 as MinuteOfDay, // 21:00
};

/** Reinicio de contadores diarios: 05:00 hora Esquel. */
export const DAILY_RESET_MINUTE = 300 as MinuteOfDay;
