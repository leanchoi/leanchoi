/**
 * Trazado urbano de Esquel.
 *
 * La ciudad es una cuadrícula regular de manzanas de 100 m separadas por calles de
 * 20 m (`/shared/constants/world.ts`). Sobre esa grilla se nombran las arterias
 * reales y se resuelven direcciones al estilo argentino: cada cuadra vale 100
 * números, los pares de un lado y los impares del otro.
 *
 *   resolveAddress('san_martin', 650)  →  manzana (-1, 0), lote 1 de la cara este
 *   resolveAddress('av_alvear', 1200)  →  manzana (0, -1), frente a la plaza
 *
 * CALIBRACIÓN: la asignación calle ↔ línea de la grilla es la aproximación
 * documentada en el PROMPT 0 (deuda técnica #1). La topología es correcta —qué
 * calle es paralela a cuál, qué esquina forma con cuál— y las distancias son las
 * reales; el ajuste fino contra OpenStreetMap se hace en el importador de
 * `/tools/prefab-importer`. Cambiar acá una línea reubica todo lo que dependa de
 * esa calle, sin tocar ningún otro archivo.
 */

import {
  CELL_PITCH_M,
  WORLD_ANCHOR,
  cellToWorld,
  parcelIdOf,
  type GridCell,
  type KnownStreet,
  type LandUse,
  type Vec3,
} from '@esquel/shared';

/* ------------------------------------------------------------------ */
/* Métrica de la manzana                                               */
/* ------------------------------------------------------------------ */

/** Lado edificable de la manzana. */
export const BLOCK_M = WORLD_ANCHOR.blockSizeM;
/** Ancho de calzada entre manzanas. */
export const STREET_M = WORLD_ANCHOR.streetWidthM;
/** Ancho de vereda, hacia adentro de la manzana. */
export const SIDEWALK_M = 3;
/** Profundidad del lote, desde la línea municipal hacia el centro de la manzana. */
export const LOT_DEPTH_M = 20;
/** Lotes por cara (más los 4 lotes de esquina). */
export const LOTS_PER_SIDE = 4;

/** Semi-lado de la manzana. */
const HALF = BLOCK_M / 2;
/** Línea municipal: borde interior de la vereda. */
const BUILD_LINE = HALF - SIDEWALK_M;
/** Largo del tramo central de cada cara (lo que queda entre las dos esquinas). */
const SIDE_SPAN = 2 * BUILD_LINE - 2 * LOT_DEPTH_M;
/** Frente de cada lote del tramo central. */
export const LOT_FRONT_M = SIDE_SPAN / LOTS_PER_SIDE;

/* ------------------------------------------------------------------ */
/* Calles                                                              */
/* ------------------------------------------------------------------ */

/**
 * `longitudinal`: corre paralela al eje X local (en el terreno real, sentido
 * noreste-suroeste). `transversal`: paralela al eje Z local.
 */
export type StreetAxis = 'longitudinal' | 'transversal';

export type StreetClass = 'avenida' | 'calle' | 'boulevard';

export interface StreetDefinition {
  readonly id: KnownStreet;
  readonly name: string;
  readonly axis: StreetAxis;
  /**
   * Índice de la línea de la grilla por la que corre. La línea `k` separa las
   * manzanas `k-1` y `k` del eje correspondiente.
   */
  readonly line: number;
  readonly klass: StreetClass;
  /** Índice de manzana donde arranca la numeración (altura 0). */
  readonly numberingOrigin: number;
  /** Sentido en que crecen las alturas. */
  readonly numberingDirection: 1 | -1;
  /** Arboleda de vereda característica. */
  readonly trees: 'alamo' | 'pino' | 'ninguno';
}

/**
 * Arterias del casco céntrico. La Plaza San Martín ocupa la manzana (0,0),
 * delimitada por Av. Alvear (sur), Sarmiento (norte), San Martín (oeste) y
 * 25 de Mayo (este).
 */
export const STREETS: readonly StreetDefinition[] = [
  // Longitudinales (corren a lo largo de X)
  { id: 'irigoyen',   name: 'Hipólito Yrigoyen', axis: 'longitudinal', line: -3, klass: 'calle',     numberingOrigin: -12, numberingDirection: 1, trees: 'alamo' },
  { id: 'av_holdich', name: 'Av. Holdich',       axis: 'longitudinal', line: -2, klass: 'avenida',   numberingOrigin: -12, numberingDirection: 1, trees: 'alamo' },
  { id: '9_de_julio', name: '9 de Julio',        axis: 'longitudinal', line: -1, klass: 'calle',     numberingOrigin: -12, numberingDirection: 1, trees: 'alamo' },
  { id: 'av_alvear',  name: 'Av. Alvear',        axis: 'longitudinal', line:  0, klass: 'avenida',   numberingOrigin: -12, numberingDirection: 1, trees: 'alamo' },
  { id: 'sarmiento',  name: 'Sarmiento',         axis: 'longitudinal', line:  1, klass: 'calle',     numberingOrigin: -12, numberingDirection: 1, trees: 'alamo' },
  { id: 'belgrano',   name: 'Belgrano',          axis: 'longitudinal', line:  2, klass: 'calle',     numberingOrigin: -12, numberingDirection: 1, trees: 'pino' },
  { id: 'roggero',    name: 'Roggero',           axis: 'longitudinal', line:  3, klass: 'calle',     numberingOrigin: -12, numberingDirection: 1, trees: 'pino' },
  { id: 'mitre',      name: 'Mitre',             axis: 'longitudinal', line:  4, klass: 'calle',     numberingOrigin: -12, numberingDirection: 1, trees: 'ninguno' },

  // Transversales (corren a lo largo de Z)
  { id: 'brun',       name: 'Brun',              axis: 'transversal',  line: -3, klass: 'calle',     numberingOrigin: -6, numberingDirection: 1, trees: 'pino' },
  { id: 'ameghino',   name: 'Ameghino',          axis: 'transversal',  line: -2, klass: 'calle',     numberingOrigin: -6, numberingDirection: 1, trees: 'alamo' },
  { id: 'rivadavia',  name: 'Rivadavia',         axis: 'transversal',  line: -1, klass: 'calle',     numberingOrigin: -6, numberingDirection: 1, trees: 'alamo' },
  { id: 'san_martin', name: 'San Martín',        axis: 'transversal',  line:  0, klass: 'boulevard', numberingOrigin: -6, numberingDirection: 1, trees: 'alamo' },
  // 25 de Mayo cruza a Alvear: esa esquina es la más disputada del centro.
  { id: '25_de_mayo', name: '25 de Mayo',        axis: 'transversal',  line:  1, klass: 'calle',     numberingOrigin: -6, numberingDirection: 1, trees: 'alamo' },
  { id: 'fontana',    name: 'Fontana',           axis: 'transversal',  line:  2, klass: 'calle',     numberingOrigin: -6, numberingDirection: 1, trees: 'alamo' },
  { id: 'chacabuco',  name: 'Chacabuco',         axis: 'transversal',  line:  3, klass: 'calle',     numberingOrigin: -6, numberingDirection: 1, trees: 'pino' },
  { id: 'roca',       name: 'Roca',              axis: 'transversal',  line:  4, klass: 'calle',     numberingOrigin: -6, numberingDirection: 1, trees: 'ninguno' },
];

export const STREET_BY_ID: ReadonlyMap<KnownStreet, StreetDefinition> = new Map(
  STREETS.map((s) => [s.id, s]),
);

/** Calle longitudinal que corre por la línea `k`, si existe. */
export const longitudinalAt = (line: number): StreetDefinition | undefined =>
  STREETS.find((s) => s.axis === 'longitudinal' && s.line === line);

/** Calle transversal que corre por la línea `k`, si existe. */
export const transversalAt = (line: number): StreetDefinition | undefined =>
  STREETS.find((s) => s.axis === 'transversal' && s.line === line);

/* ------------------------------------------------------------------ */
/* Parcelas                                                            */
/* ------------------------------------------------------------------ */

/** Cara de la manzana. 0 = sur (−Z), 1 = este (+X), 2 = norte (+Z), 3 = oeste (−X). */
export type BlockSide = 0 | 1 | 2 | 3;

/** Índices reservados para los lotes de esquina. */
export const CORNER_SW = 16;
export const CORNER_SE = 17;
export const CORNER_NE = 18;
export const CORNER_NW = 19;
export const PARCELS_PER_BLOCK = 20;

export interface ParcelGeometry {
  /** Esquina mínima del lote en coordenadas de mundo. */
  readonly minX: number;
  readonly minZ: number;
  readonly sizeX: number;
  readonly sizeZ: number;
  /** Centro del lote a nivel de piso. */
  readonly center: Vec3;
  /** Hacia dónde mira el frente, en grados (0 = +Z norte, 90 = +X este). */
  readonly facingYawDeg: 0 | 90 | 180 | 270;
  /** Frente sobre la línea municipal, en metros. */
  readonly frontageM: number;
  readonly depthM: number;
  readonly corner: boolean;
}

export interface ParcelAddress {
  /** Clave estable y legible: `SAN_MARTIN_650`, `AV_ALVEAR_1200`. */
  readonly key: string;
  readonly parcelId: string;
  readonly cell: GridCell;
  readonly parcelIndex: number;
  readonly side: BlockSide;
  readonly street: StreetDefinition;
  /** Altura catastral. `0` en las esquinas sin numeración asignada. */
  readonly number: number;
  readonly geometry: ParcelGeometry;
}

const sideOfIndex = (index: number): BlockSide => {
  if (index >= CORNER_SW) return ((index - CORNER_SW) as BlockSide);
  return Math.floor(index / LOTS_PER_SIDE) as BlockSide;
};

/** Geometría del lote `index` dentro de la manzana `cell`. */
export const parcelGeometry = (cell: GridCell, index: number): ParcelGeometry => {
  const c = cellToWorld(cell);
  const corner = index >= CORNER_SW;

  if (corner) {
    const which = index - CORNER_SW; // 0=SO, 1=SE, 2=NE, 3=NO
    const west = which === 0 || which === 3;
    const south = which === 0 || which === 1;
    const minX = west ? c.x - BUILD_LINE : c.x + BUILD_LINE - LOT_DEPTH_M;
    const minZ = south ? c.z - BUILD_LINE : c.z + BUILD_LINE - LOT_DEPTH_M;
    return {
      minX,
      minZ,
      sizeX: LOT_DEPTH_M,
      sizeZ: LOT_DEPTH_M,
      center: { x: minX + LOT_DEPTH_M / 2, y: 0, z: minZ + LOT_DEPTH_M / 2 },
      facingYawDeg: south ? 180 : 0,
      frontageM: LOT_DEPTH_M,
      depthM: LOT_DEPTH_M,
      corner: true,
    };
  }

  const side = sideOfIndex(index);
  const lot = index % LOTS_PER_SIDE;
  const along = -BUILD_LINE + LOT_DEPTH_M + lot * LOT_FRONT_M;

  switch (side) {
    case 0: // sur: frente hacia −Z
      return {
        minX: c.x + along,
        minZ: c.z - BUILD_LINE,
        sizeX: LOT_FRONT_M,
        sizeZ: LOT_DEPTH_M,
        center: { x: c.x + along + LOT_FRONT_M / 2, y: 0, z: c.z - BUILD_LINE + LOT_DEPTH_M / 2 },
        facingYawDeg: 180,
        frontageM: LOT_FRONT_M,
        depthM: LOT_DEPTH_M,
        corner: false,
      };
    case 1: // este: frente hacia +X
      return {
        minX: c.x + BUILD_LINE - LOT_DEPTH_M,
        minZ: c.z + along,
        sizeX: LOT_DEPTH_M,
        sizeZ: LOT_FRONT_M,
        center: { x: c.x + BUILD_LINE - LOT_DEPTH_M / 2, y: 0, z: c.z + along + LOT_FRONT_M / 2 },
        facingYawDeg: 90,
        frontageM: LOT_FRONT_M,
        depthM: LOT_DEPTH_M,
        corner: false,
      };
    case 2: // norte: frente hacia +Z
      return {
        minX: c.x + along,
        minZ: c.z + BUILD_LINE - LOT_DEPTH_M,
        sizeX: LOT_FRONT_M,
        sizeZ: LOT_DEPTH_M,
        center: { x: c.x + along + LOT_FRONT_M / 2, y: 0, z: c.z + BUILD_LINE - LOT_DEPTH_M / 2 },
        facingYawDeg: 0,
        frontageM: LOT_FRONT_M,
        depthM: LOT_DEPTH_M,
        corner: false,
      };
    default: // oeste: frente hacia −X
      return {
        minX: c.x - BUILD_LINE,
        minZ: c.z + along,
        sizeX: LOT_DEPTH_M,
        sizeZ: LOT_FRONT_M,
        center: { x: c.x - BUILD_LINE + LOT_DEPTH_M / 2, y: 0, z: c.z + along + LOT_FRONT_M / 2 },
        facingYawDeg: 270,
        frontageM: LOT_FRONT_M,
        depthM: LOT_DEPTH_M,
        corner: false,
      };
  }
};

/** Calle a la que da una cara de manzana. */
export const streetOfSide = (cell: GridCell, side: BlockSide): StreetDefinition | undefined => {
  switch (side) {
    case 0:
      return longitudinalAt(cell.row);
    case 2:
      return longitudinalAt(cell.row + 1);
    case 3:
      return transversalAt(cell.col);
    default:
      return transversalAt(cell.col + 1);
  }
};

/**
 * Altura catastral de un lote. Las manzanas valen 100 números; el lado de números
 * pares es el de índice menor (sur para las longitudinales, oeste para las
 * transversales), como en cualquier ciudad de la traza española.
 */
export const numberOfParcel = (cell: GridCell, index: number): { street?: StreetDefinition; number: number } => {
  const side = sideOfIndex(index);
  const street = streetOfSide(cell, index >= CORNER_SW ? (side === 0 || side === 1 ? 0 : 2) : side);
  if (!street) return { number: 0 };

  const blockIndex =
    street.axis === 'longitudinal'
      ? (cell.col - street.numberingOrigin) * street.numberingDirection
      : (cell.row - street.numberingOrigin) * street.numberingDirection;

  if (blockIndex < 0) return { street, number: 0 };

  const lot = index >= CORNER_SW ? 0 : index % LOTS_PER_SIDE;
  const withinBlock = Math.round(lot * (100 / LOTS_PER_SIDE)) + 2;
  // Par en la cara baja (sur/oeste), impar en la alta (norte/este).
  const lowSide = street.axis === 'longitudinal' ? side === 2 : side === 1;
  const parityFixed = lowSide ? withinBlock - (withinBlock % 2) : withinBlock + ((withinBlock + 1) % 2);
  return { street, number: blockIndex * 100 + Math.max(2, parityFixed) };
};

const keyOf = (street: StreetDefinition | undefined, num: number, cell: GridCell, index: number): string =>
  street && num > 0
    ? `${street.id.toUpperCase()}_${num}`
    : `C${cell.col}_R${cell.row}_P${String(index).padStart(2, '0')}`;

/** Dirección completa de un lote. */
export const addressOfParcel = (cell: GridCell, index: number): ParcelAddress => {
  const geometry = parcelGeometry(cell, index);
  const { street, number } = numberOfParcel(cell, index);
  const side = sideOfIndex(index);
  const resolved = street ?? STREETS[0];
  return {
    key: keyOf(street, number, cell, index),
    parcelId: parcelIdOf(cell, index),
    cell,
    parcelIndex: index,
    side,
    street: resolved,
    number,
    geometry,
  };
};

/** Las 20 parcelas de una manzana. */
export const parcelsOfCell = (cell: GridCell): ParcelAddress[] =>
  Array.from({ length: PARCELS_PER_BLOCK }, (_, i) => addressOfParcel(cell, i));

/**
 * Resuelve una dirección real de Esquel a la parcela del mundo.
 * Devuelve `null` si la calle no existe en la traza o si la altura cae fuera del
 * área jugable.
 */
export const resolveAddress = (streetId: KnownStreet, streetNumber: number): ParcelAddress | null => {
  const street = STREET_BY_ID.get(streetId);
  if (!street || streetNumber < 0) return null;

  const blockIndex = Math.floor(streetNumber / 100);
  const along = street.numberingOrigin + street.numberingDirection * blockIndex;
  const even = streetNumber % 2 === 0;
  const lot = Math.min(LOTS_PER_SIDE - 1, Math.floor((streetNumber % 100) / (100 / LOTS_PER_SIDE)));

  let cell: GridCell;
  let side: BlockSide;
  if (street.axis === 'longitudinal') {
    // Los pares miran al norte desde la manzana de abajo; los impares al sur.
    cell = { col: along, row: even ? street.line - 1 : street.line };
    side = even ? 2 : 0;
  } else {
    cell = { col: even ? street.line - 1 : street.line, row: along };
    side = even ? 1 : 3;
  }

  const [minCol, minRow, maxCol, maxRow] = WORLD_ANCHOR.bounds;
  if (cell.col < minCol || cell.col > maxCol || cell.row < minRow || cell.row > maxRow) return null;

  const index = side * LOTS_PER_SIDE + lot;
  const geometry = parcelGeometry(cell, index);
  return {
    key: `${street.id.toUpperCase()}_${streetNumber}`,
    parcelId: parcelIdOf(cell, index),
    cell,
    parcelIndex: index,
    side,
    street,
    number: streetNumber,
    geometry,
  };
};

/** Esquina entre dos calles: devuelve la manzana cuyo vértice la forma. */
export const resolveCorner = (
  longitudinal: KnownStreet,
  transversal: KnownStreet,
): { cell: GridCell; parcelIndex: number } | null => {
  const lon = STREET_BY_ID.get(longitudinal);
  const tra = STREET_BY_ID.get(transversal);
  if (!lon || !tra || lon.axis !== 'longitudinal' || tra.axis !== 'transversal') return null;
  // Manzana al noreste del cruce, con su esquina suroeste sobre el vértice.
  return { cell: { col: tra.line, row: lon.line }, parcelIndex: CORNER_SW };
};

/* ------------------------------------------------------------------ */
/* Zonificación                                                        */
/* ------------------------------------------------------------------ */

/** La manzana central es la Plaza San Martín. */
export const PLAZA_CELL: GridCell = { col: 0, row: 0 };

export const isPlazaCell = (cell: GridCell): boolean =>
  cell.col === PLAZA_CELL.col && cell.row === PLAZA_CELL.row;

/** Distancia de Chebyshev al centro, en manzanas. */
export const ringOf = (cell: GridCell): number => Math.max(Math.abs(cell.col), Math.abs(cell.row));

/**
 * Uso de suelo dominante de la manzana. El centro es comercial y se va volviendo
 * residencial hacia los bordes, con baldíos en la periferia.
 */
export const landUseOfCell = (cell: GridCell): LandUse => {
  if (isPlazaCell(cell)) return 'plaza';
  const ring = ringOf(cell);
  if (ring <= 1) return 'comercial';
  if (ring <= 3) return (cell.col + cell.row) % 3 === 0 ? 'gastronomico' : 'comercial';
  if (ring <= 6) return (cell.col * 7 + cell.row * 3) % 5 === 0 ? 'comercial' : 'residencial';
  if (ring <= 9) return (cell.col * 5 + cell.row * 11) % 7 === 0 ? 'baldio' : 'residencial';
  return (cell.col + cell.row * 3) % 3 === 0 ? 'baldio' : 'residencial';
};

/** Centro de la manzana, a nivel de piso. */
export const cellCenter = (cell: GridCell): Vec3 => cellToWorld(cell);

/** Metros por manzana incluyendo su calle: útil para el gestor de chunks. */
export const CELL_PITCH = CELL_PITCH_M;

/* ------------------------------------------------------------------ */
/* Ubicación legible                                                   */
/* ------------------------------------------------------------------ */

/**
 * Describe una posición del mundo como la diría un vecino: «Av. Alvear al 1200»,
 * «San Martín y Fontana», «Plaza San Martín». Lo usa el HUD y, más adelante, el
 * chat de proximidad para anunciar dónde se está armando una movilización.
 */
export const describePosition = (x: number, z: number): string => {
  const col = Math.floor(x / CELL_PITCH_M + 0.5);
  const row = Math.floor(z / CELL_PITCH_M + 0.5);
  const cell: GridCell = { col, row };
  if (isPlazaCell(cell)) return 'Plaza San Martín';

  const center = cellToWorld(cell);
  const dx = x - center.x;
  const dz = z - center.z;

  // ¿Estamos en una bocacalle? Cerca de las dos líneas a la vez.
  const nearX = Math.abs(dx) > BLOCK_M / 2 - 6;
  const nearZ = Math.abs(dz) > BLOCK_M / 2 - 6;
  const transversal = transversalAt(dx > 0 ? col + 1 : col);
  const longitudinal = longitudinalAt(dz > 0 ? row + 1 : row);

  if (nearX && nearZ && transversal && longitudinal) {
    return `${longitudinal.name} y ${transversal.name}`;
  }

  const street = nearX ? transversal : longitudinal;
  if (!street) return `Esquel (${col}, ${row})`;

  const blockIndex =
    street.axis === 'longitudinal'
      ? (col - street.numberingOrigin) * street.numberingDirection
      : (row - street.numberingOrigin) * street.numberingDirection;
  if (blockIndex < 0) return street.name;
  return `${street.name} al ${blockIndex * 100}`;
};
