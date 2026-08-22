/**
 * Gestor de chunks: una manzana = un chunk = dos draw calls.
 *
 * Cada manzana se arma como una lista de cajas (`VoxelBox`) y se empaqueta en dos
 * `InstancedMesh`: uno opaco y uno de vidrio. No importa si la manzana tiene 300
 * cajas o 3.000: el costo de dibujado es el mismo par de llamadas, que es lo que
 * permite sostener 60 FPS en un celular de gama media.
 *
 * El chunk también genera lo que no es edificio: losa de terreno, veredas,
 * asfalto, sendas peatonales, arbolado de vereda y columnas de alumbrado.
 *
 * Construcción incremental: por cuadro se arman a lo sumo `buildBudget` manzanas,
 * priorizando las más cercanas al jugador. Así entrar a la ciudad no congela la
 * pestaña.
 */

import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Vector3,
  type Scene,
} from 'three';
import {
  cellToWorld,
  createRng,
  seedFromString,
  WORLD_ANCHOR,
  type GridCell,
} from '@esquel/shared';
import { PALETTE, mixColor, shade } from './VoxelPalette.ts';
import { buildTree } from './Vegetation.ts';
import { VoxelBuilder, type ChunkGeometry, type Collider, type VoxelBox } from './VoxelTypes.ts';
import {
  BLOCK_M,
  SIDEWALK_M,
  STREET_M,
  isPlazaCell,
  landUseOfCell,
  longitudinalAt,
  parcelsOfCell,
  transversalAt,
  type StreetDefinition,
} from '../world/EsquelStreetGrid.ts';
import { buildPlazaBlock, buildProceduralParcel, type BuildContext } from '../world/ProceduralBuildings.ts';
import { loadPrefab } from '../world/buildings/BuildingLoader.ts';
import type { PrefabRegistry } from '../world/buildings/PrefabRegistry.ts';

const HALF = BLOCK_M / 2;

export interface ChunkManagerOptions {
  /** Radio de construcción, en manzanas. */
  readonly renderDistanceCells: number;
  /** Manzanas con detalle completo; más allá, silueta. */
  readonly detailCells: number;
  /** Manzanas que se pueden construir por cuadro. */
  readonly buildBudget: number;
}

const DEFAULT_OPTIONS: ChunkManagerOptions = {
  renderDistanceCells: 6,
  detailCells: 2,
  buildBudget: 2,
};

interface Chunk {
  readonly cell: GridCell;
  readonly group: Group;
  readonly colliders: readonly Collider[];
  readonly lod: 0 | 1;
  readonly instances: number;
}

const cellKey = (cell: GridCell): string => `${cell.col}:${cell.row}`;

/* ------------------------------------------------------------------ */
/* Generación de la manzana                                            */
/* ------------------------------------------------------------------ */

/** Losa de terreno y vereda perimetral. */
const paintGround = (b: VoxelBuilder, cx: number, cz: number, ctx: BuildContext): void => {
  const ground = ctx.snow > 0.45 ? mixColor(PALETTE.dirt, PALETTE.roofSnow, ctx.snow) : PALETTE.dirt;
  b.boxAt(cx - HALF, -0.6, cz - HALF, BLOCK_M, 0.5, BLOCK_M, ground);

  const walk = ctx.snow > 0.25 ? mixColor(PALETTE.sidewalk, PALETTE.roofSnow, ctx.snow * 0.7) : PALETTE.sidewalk;
  // Anillo de vereda: cuatro tiras, sin superponerse en las esquinas.
  b.boxAt(cx - HALF, -0.12, cz - HALF, BLOCK_M, 0.25, SIDEWALK_M, walk);
  b.boxAt(cx - HALF, -0.12, cz + HALF - SIDEWALK_M, BLOCK_M, 0.25, SIDEWALK_M, walk);
  b.boxAt(cx - HALF, -0.12, cz - HALF + SIDEWALK_M, SIDEWALK_M, 0.25, BLOCK_M - SIDEWALK_M * 2, walk);
  b.boxAt(cx + HALF - SIDEWALK_M, -0.12, cz - HALF + SIDEWALK_M, SIDEWALK_M, 0.25, BLOCK_M - SIDEWALK_M * 2, walk);
  // Cordón.
  b.boxAt(cx - HALF, -0.2, cz - HALF, BLOCK_M, 0.16, 0.4, PALETTE.sidewalkCurb);
  b.boxAt(cx - HALF, -0.2, cz + HALF - 0.4, BLOCK_M, 0.16, 0.4, PALETTE.sidewalkCurb);
  b.boxAt(cx - HALF, -0.2, cz - HALF, 0.4, 0.16, BLOCK_M, PALETTE.sidewalkCurb);
  b.boxAt(cx + HALF - 0.4, -0.2, cz - HALF, 0.4, 0.16, BLOCK_M, PALETTE.sidewalkCurb);
};

/**
 * Calzada. Cada manzana pinta sólo sus bandas este y norte (más la bocacalle del
 * vértice noreste), así ninguna calle se dibuja dos veces.
 */
const paintStreets = (
  b: VoxelBuilder,
  cell: GridCell,
  cx: number,
  cz: number,
  ctx: BuildContext,
): void => {
  const asphalt = ctx.snow > 0.6 ? mixColor(PALETTE.asphalt, PALETTE.roofSnow, (ctx.snow - 0.6) * 1.2) : PALETTE.asphalt;
  const eastStreet = transversalAt(cell.col + 1);
  const northStreet = longitudinalAt(cell.row + 1);

  // Banda este: incluye la bocacalle del norte.
  b.boxAt(cx + HALF, -0.35, cz - HALF, STREET_M, 0.28, BLOCK_M + STREET_M, asphalt);
  // Banda norte: sólo hasta el borde este, la esquina ya la puso la banda anterior.
  b.boxAt(cx - HALF, -0.35, cz + HALF, BLOCK_M, 0.28, STREET_M, asphalt);

  if (ctx.lod === 1) return;

  // Línea central discontinua en las avenidas.
  const dash = (x0: number, z0: number, horizontal: boolean): void => {
    const len = horizontal ? BLOCK_M : BLOCK_M;
    const step = 6;
    for (let d = 4; d < len - 4; d += step) {
      if (horizontal) b.boxAt(x0 + d, -0.2, z0 - 0.15, 3, 0.06, 0.3, PALETTE.laneMark);
      else b.boxAt(x0 - 0.15, -0.2, z0 + d, 0.3, 0.06, 3, PALETTE.laneMark);
    }
  };
  if (northStreet?.klass === 'avenida' || northStreet?.klass === 'boulevard') {
    dash(cx - HALF, cz + HALF + STREET_M / 2, true);
  }
  if (eastStreet?.klass === 'avenida' || eastStreet?.klass === 'boulevard') {
    dash(cx + HALF + STREET_M / 2, cz - HALF, false);
  }

  // Sendas peatonales en las dos esquinas de la manzana.
  const zebra = (x0: number, z0: number, horizontal: boolean): void => {
    for (let i = 0; i < 7; i++) {
      if (horizontal) b.boxAt(x0 + i * 1.4, -0.19, z0, 0.8, 0.06, STREET_M - 2, PALETTE.crosswalk);
      else b.boxAt(x0, -0.19, z0 + i * 1.4, STREET_M - 2, 0.06, 0.8, PALETTE.crosswalk);
    }
  };
  zebra(cx + HALF + 4, cz + HALF + 1, true);
  zebra(cx + HALF + 1, cz + HALF + 4, false);
};

/** Arbolado de vereda y columnas de alumbrado. */
const paintStreetFurniture = (
  b: VoxelBuilder,
  cell: GridCell,
  cx: number,
  cz: number,
  ctx: BuildContext,
): void => {
  if (ctx.lod === 1) return;
  const rng = createRng(seedFromString(`furniture:${cellKey(cell)}`));

  const speciesOf = (street: StreetDefinition | undefined): 'alamo' | 'pino' | null => {
    if (!street || street.trees === 'ninguno') return null;
    return street.trees;
  };

  const south = speciesOf(longitudinalAt(cell.row));
  const north = speciesOf(longitudinalAt(cell.row + 1));
  const west = speciesOf(transversalAt(cell.col));
  const east = speciesOf(transversalAt(cell.col + 1));
  const opts = { autumn: ctx.autumn, snow: ctx.snow, scale: 0.95 };
  const inset = SIDEWALK_M / 2;

  for (let i = 0; i < 5; i++) {
    const t = -HALF + 14 + i * 18;
    if (south) buildTree(b, south, cx + t, cz - HALF + inset, rng, opts);
    if (north) buildTree(b, north, cx + t, cz + HALF - inset, rng, opts);
    if (west) buildTree(b, west, cx - HALF + inset, cz + t, rng, opts);
    if (east) buildTree(b, east, cx + HALF - inset, cz + t, rng, opts);
  }

  // Alumbrado: una columna por esquina, con la lámpara encendida de noche.
  const lampColor = ctx.night ? PALETTE.glassLit : PALETTE.glass;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const x = cx + sx * (HALF - 1.2);
    const z = cz + sz * (HALF - 1.2);
    b.boxAt(x - 0.15, 0, z - 0.15, 0.3, 6.5, 0.3, PALETTE.metal);
    b.boxAt(x - 0.15, 6.5, z - 0.15 - sz * 0.6, 0.3, 0.3, 1.4, PALETTE.metal);
    b.box(x, 6.4, z - sz * 1.2, 0.7, 0.35, 0.7, lampColor, 'glass');
  }
};

/** Arma la geometría completa de una manzana. */
export const buildChunkGeometry = (
  cell: GridCell,
  lod: 0 | 1,
  env: { snow: number; autumn: number; night: boolean },
  registry: PrefabRegistry,
): ChunkGeometry => {
  const b = new VoxelBuilder();
  const center = cellToWorld(cell);
  const ctx: BuildContext = { ...env, lod };

  paintGround(b, center.x, center.z, ctx);
  paintStreets(b, cell, center.x, center.z, ctx);
  paintStreetFurniture(b, cell, center.x, center.z, ctx);

  if (isPlazaCell(cell)) {
    buildPlazaBlock(b, center.x, center.z, ctx);
    return { cell, boxes: b.boxes, colliders: b.colliders, lod };
  }

  const landUse = landUseOfCell(cell);
  for (const parcel of parcelsOfCell(cell)) {
    if (registry.isClaimed(parcel.parcelId)) continue; // la ocupa un hito vecino
    const meta = registry.get(parcel.parcelId);
    if (meta) {
      // Fachada real cargada: reemplaza al genérico de esta parcela.
      const loaded = loadPrefab(meta, { snow: env.snow, night: env.night, lod });
      b.boxes.push(...loaded.boxes);
      b.colliders.push(...loaded.colliders);
      continue;
    }
    buildProceduralParcel(b, parcel, landUse, ctx);
  }

  return { cell, boxes: b.boxes, colliders: b.colliders, lod };
};

/* ------------------------------------------------------------------ */
/* Gestor                                                              */
/* ------------------------------------------------------------------ */

export class ChunkManager {
  private readonly scene: Scene;
  private readonly registry: PrefabRegistry;
  private readonly options: ChunkManagerOptions;
  private readonly chunks = new Map<string, Chunk>();
  private readonly pending: GridCell[] = [];
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly opaqueMaterial: MeshLambertMaterial;
  private readonly glassMaterial: MeshLambertMaterial;
  private readonly root = new Group();
  private env = { snow: 0, autumn: 0, night: false };
  /** Firma del entorno con la que se construyeron los chunks vigentes. */
  private envSignature = '';
  private disposed = false;

  constructor(scene: Scene, registry: PrefabRegistry, options: Partial<ChunkManagerOptions> = {}) {
    this.scene = scene;
    this.registry = registry;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.root.name = 'ChunkRoot';
    this.scene.add(this.root);

    this.opaqueMaterial = new MeshLambertMaterial({ vertexColors: false });
    this.glassMaterial = new MeshLambertMaterial({
      transparent: true,
      opacity: 0.82,
      emissive: new Color(0x000000),
    });

    this.registry.onInvalidate((cell) => this.invalidate(cell));
    this.envSignature = this.signature();
  }

  /** Firma cuantizada: sólo un cambio apreciable justifica reconstruir la ciudad. */
  private signature(): string {
    return `${Math.round(this.env.snow * 4)}|${Math.round(this.env.autumn * 3)}|${this.env.night ? 1 : 0}`;
  }

  /** Actualiza nieve, otoño y noche. Reconstruye sólo si el cambio es visible. */
  setEnvironment(env: { snow: number; autumn: number; night: boolean }): void {
    this.env = env;
    const next = this.signature();
    if (next === this.envSignature) return;
    this.envSignature = next;
    const cells = [...this.chunks.values()].map((c) => c.cell);
    for (const cell of cells) this.invalidate(cell);
  }

  /** Marca una manzana para reconstrucción (prefab nuevo, cambio de clima). */
  invalidate(cell: GridCell): void {
    const key = cellKey(cell);
    const chunk = this.chunks.get(key);
    if (chunk) {
      this.disposeChunk(chunk);
      this.chunks.delete(key);
    }
    if (!this.pending.some((c) => cellKey(c) === key)) this.pending.push(cell);
  }

  /**
   * Sincroniza el mundo con la posición del jugador: encola lo que falta, tira lo
   * que quedó lejos y construye hasta agotar el presupuesto del cuadro.
   */
  update(playerX: number, playerZ: number): void {
    if (this.disposed) return;
    const pitch = WORLD_ANCHOR.blockSizeM + WORLD_ANCHOR.streetWidthM;
    const centerCol = Math.floor(playerX / pitch + 0.5);
    const centerRow = Math.floor(playerZ / pitch + 0.5);
    const r = this.options.renderDistanceCells;
    const [minCol, minRow, maxCol, maxRow] = WORLD_ANCHOR.bounds;

    const wanted = new Set<string>();
    for (let dc = -r; dc <= r; dc++) {
      for (let dr = -r; dr <= r; dr++) {
        const cell = { col: centerCol + dc, row: centerRow + dr };
        if (cell.col < minCol || cell.col > maxCol || cell.row < minRow || cell.row > maxRow) continue;
        if (Math.hypot(dc, dr) > r + 0.5) continue;
        const key = cellKey(cell);
        wanted.add(key);
        if (!this.chunks.has(key) && !this.pending.some((c) => cellKey(c) === key)) {
          this.pending.push(cell);
        }
      }
    }

    // Descarga de lo lejano.
    for (const [key, chunk] of this.chunks) {
      if (!wanted.has(key)) {
        this.disposeChunk(chunk);
        this.chunks.delete(key);
      }
    }

    // Prioridad por cercanía y construcción con presupuesto.
    this.pending.sort(
      (a, z) =>
        Math.hypot(a.col - centerCol, a.row - centerRow) - Math.hypot(z.col - centerCol, z.row - centerRow),
    );

    let budget = this.options.buildBudget;
    while (budget > 0 && this.pending.length > 0) {
      const cell = this.pending.shift() as GridCell;
      if (!wanted.has(cellKey(cell))) continue;
      this.buildChunk(cell, centerCol, centerRow);
      budget--;
    }
  }

  private buildChunk(cell: GridCell, centerCol: number, centerRow: number): void {
    const distance = Math.max(Math.abs(cell.col - centerCol), Math.abs(cell.row - centerRow));
    const lod: 0 | 1 = distance <= this.options.detailCells ? 0 : 1;

    // Si la manzana tiene fachadas reales sin descargar, se piden y cuando
    // llegan el registro invalida el chunk y se vuelve a armar con ellas.
    void this.registry.ensureCell(cell);

    const geometry = buildChunkGeometry(cell, lod, this.env, this.registry);
    const group = new Group();
    group.name = `chunk-${cellKey(cell)}`;

    const opaque = geometry.boxes.filter((b) => b.layer === 'opaque');
    const glass = geometry.boxes.filter((b) => b.layer === 'glass');
    const meshOpaque = this.makeInstanced(opaque, this.opaqueMaterial, `${group.name}-opaque`);
    const meshGlass = this.makeInstanced(glass, this.glassMaterial, `${group.name}-glass`);
    if (meshOpaque) group.add(meshOpaque);
    if (meshGlass) group.add(meshGlass);

    this.root.add(group);
    this.chunks.set(cellKey(cell), {
      cell,
      group,
      colliders: geometry.colliders,
      lod,
      instances: geometry.boxes.length,
    });
  }

  private makeInstanced(boxes: VoxelBox[], material: MeshLambertMaterial, name: string): InstancedMesh | null {
    if (boxes.length === 0) return null;
    const mesh = new InstancedMesh(this.geometry, material, boxes.length);
    const matrix = new Matrix4();
    const scale = new Vector3();
    const position = new Vector3();
    const color = new Color();
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i] as VoxelBox;
      position.set(b.x, b.y, b.z);
      scale.set(b.sx, b.sy, b.sz);
      matrix.makeScale(scale.x, scale.y, scale.z);
      matrix.setPosition(position);
      mesh.setMatrixAt(i, matrix);
      color.setHex(b.color);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.computeBoundingSphere();
    return mesh;
  }

  private disposeChunk(chunk: Chunk): void {
    chunk.group.traverse((obj) => {
      if (obj instanceof InstancedMesh) obj.dispose();
    });
    this.root.remove(chunk.group);
  }

  /** Obstáculos cerca de un punto, para la colisión del jugador. */
  collidersNear(x: number, z: number, radius = 40): Collider[] {
    const out: Collider[] = [];
    for (const chunk of this.chunks.values()) {
      const c = cellToWorld(chunk.cell);
      if (Math.abs(c.x - x) > BLOCK_M + radius || Math.abs(c.z - z) > BLOCK_M + radius) continue;
      for (const col of chunk.colliders) {
        if (col.maxX < x - radius || col.minX > x + radius) continue;
        if (col.maxZ < z - radius || col.minZ > z + radius) continue;
        out.push(col);
      }
    }
    return out;
  }

  /** Métricas para el panel de diagnóstico. */
  stats(): { chunks: number; instances: number; pending: number; colliders: number } {
    let instances = 0;
    let colliders = 0;
    for (const chunk of this.chunks.values()) {
      instances += chunk.instances;
      colliders += chunk.colliders.length;
    }
    return { chunks: this.chunks.size, instances, pending: this.pending.length, colliders };
  }

  /** Tinte del vidrio: de noche los vidrios emiten un poco de luz cálida. */
  setGlassEmissive(intensity: number): void {
    this.glassMaterial.emissive.setHex(PALETTE.glassLit);
    this.glassMaterial.emissiveIntensity = intensity;
    this.glassMaterial.opacity = 0.72 + intensity * 0.2;
    this.glassMaterial.color.setHex(shade(PALETTE.glass, intensity * 0.2));
    this.glassMaterial.needsUpdate = true;
  }

  dispose(): void {
    this.disposed = true;
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
    this.pending.length = 0;
    this.geometry.dispose();
    this.opaqueMaterial.dispose();
    this.glassMaterial.dispose();
    this.root.removeFromParent();
  }
}
