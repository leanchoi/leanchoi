/**
 * Registro de fachadas reales.
 *
 * La ciudad arranca 100% procedimental. Este registro es el que la va volviendo
 * real: mantiene el índice de prefabs aprobados, los descarga cuando hacen falta y
 * avisa qué manzanas hay que reconstruir cuando aparece uno nuevo.
 *
 * Flujo completo de una fachada:
 *
 *   foto del vecino → POST /prefabs/contributions → revisión → prefab aprobado
 *   → entra al índice → `PrefabRegistry.load()` → `ChunkManager` reconstruye
 *   esa manzana → el genérico desaparece y queda el edificio real
 *
 * La inyección también funciona en caliente (`inject()`), que es lo que usa el
 * editor de fachadas para previsualizar sin recargar la página.
 */

import type { BuildingPrefabMeta, GridCell, KnownStreet } from '@esquel/shared';
import { resolveAddress } from '../EsquelStreetGrid.ts';

/** Entrada del índice liviano que se descarga al entrar al shard. */
export interface PrefabIndexRow {
  readonly prefabId: string;
  readonly version: number;
  readonly parcelId: string;
  readonly cell: GridCell;
  readonly file: string;
  readonly displayName: string;
  /**
   * Parcelas vecinas que el edificio ocupa además de la suya. Un hito como la
   * Municipalidad toma media cuadra: los lotes anexados dejan de generar su
   * edificio genérico para que no se le monte encima.
   */
  readonly occupies?: readonly string[];
}

export interface PrefabIndexFile {
  readonly generatedAt: string;
  readonly prefabs: readonly PrefabIndexRow[];
}

/** Callback que dispara la reconstrucción de una manzana. */
export type CellInvalidator = (cell: GridCell) => void;

const cellKeyOf = (cell: GridCell): string => `${cell.col}:${cell.row}`;

export class PrefabRegistry {
  /** Índice por parcela: qué prefab reemplaza a qué lote. */
  private readonly byParcel = new Map<string, PrefabIndexRow>();
  /** Prefabs ya descargados y parseados. */
  private readonly loaded = new Map<string, BuildingPrefabMeta>();
  /** Parcelas por manzana, para invalidar de a bloques. */
  private readonly byCell = new Map<string, Set<string>>();
  /** Parcelas anexadas por un prefab: no generan edificio genérico. */
  private readonly claimed = new Map<string, string>();
  private readonly listeners = new Set<CellInvalidator>();
  private readonly baseUrl: string;
  private indexPromise: Promise<void> | null = null;

  constructor(baseUrl = '/prefabs') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /** Suscribe una función que se llama cada vez que una manzana queda obsoleta. */
  onInvalidate(fn: CellInvalidator): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private invalidate(cell: GridCell): void {
    for (const fn of this.listeners) fn(cell);
  }

  /**
   * Descarga el índice de prefabs aprobados. Es idempotente: si dos chunks lo
   * piden a la vez, comparten la misma promesa.
   */
  async loadIndex(): Promise<void> {
    if (this.indexPromise) return this.indexPromise;
    this.indexPromise = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/index.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`índice de prefabs: HTTP ${res.status}`);
        const file = (await res.json()) as PrefabIndexFile;
        for (const row of file.prefabs) this.register(row);
      } catch (err) {
        // Sin índice el juego funciona igual: queda todo procedimental.
        console.warn('[prefabs] no se pudo cargar el índice, sigo con edificios genéricos:', err);
      }
    })();
    return this.indexPromise;
  }

  private register(row: PrefabIndexRow): void {
    this.byParcel.set(row.parcelId, row);
    const key = cellKeyOf(row.cell);
    const set = this.byCell.get(key) ?? new Set<string>();
    set.add(row.parcelId);
    this.byCell.set(key, set);
    for (const parcelId of row.occupies ?? []) this.claimed.set(parcelId, row.prefabId);
  }

  /** `true` si la parcela está anexada por un edificio vecino. */
  isClaimed(parcelId: string): boolean {
    return this.claimed.has(parcelId);
  }

  /** `true` si esa parcela tiene una fachada real asignada. */
  hasPrefab(parcelId: string): boolean {
    return this.byParcel.has(parcelId);
  }

  /** Prefabs que afectan a una manzana. */
  parcelsInCell(cell: GridCell): readonly string[] {
    return [...(this.byCell.get(cellKeyOf(cell)) ?? [])];
  }

  /** Meta ya descargada, si está en memoria. */
  get(parcelId: string): BuildingPrefabMeta | undefined {
    const row = this.byParcel.get(parcelId);
    return row ? this.loaded.get(row.prefabId) : undefined;
  }

  /** Descarga (si hace falta) el prefab de una parcela. */
  async fetchParcel(parcelId: string): Promise<BuildingPrefabMeta | undefined> {
    const row = this.byParcel.get(parcelId);
    if (!row) return undefined;
    const cached = this.loaded.get(row.prefabId);
    if (cached) return cached;
    try {
      const res = await fetch(`${this.baseUrl}/${row.file}`, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = (await res.json()) as BuildingPrefabMeta;
      this.loaded.set(row.prefabId, meta);
      return meta;
    } catch (err) {
      console.warn(`[prefabs] falló la descarga de ${row.prefabId}:`, err);
      return undefined;
    }
  }

  /** Descarga todos los prefabs de una manzana y avisa para que se reconstruya. */
  async ensureCell(cell: GridCell): Promise<void> {
    const parcels = this.parcelsInCell(cell);
    if (parcels.length === 0) return;
    const pending = parcels.filter((p) => !this.get(p));
    if (pending.length === 0) return;
    await Promise.all(pending.map((p) => this.fetchParcel(p)));
    this.invalidate(cell);
  }

  /**
   * Inyecta un prefab en caliente. Es la vía que usan el editor de fachadas y las
   * pruebas: valida lo mínimo indispensable (que la parcela exista y que el
   * volumen sea coherente) y reconstruye la manzana afectada.
   */
  inject(meta: BuildingPrefabMeta, file = '', occupies: readonly string[] = []): { ok: true } | { ok: false; error: string } {
    const [sx, sy, sz] = meta.volume.size;
    if (sx <= 0 || sy <= 0 || sz <= 0) return { ok: false, error: 'El volumen del prefab es inválido.' };
    if (!meta.placement.parcelId.startsWith('parcel:')) {
      return { ok: false, error: `parcelId con formato inesperado: ${meta.placement.parcelId}` };
    }
    if (meta.review.state !== 'aprobado' && meta.active) {
      return { ok: false, error: 'Un prefab activo tiene que estar aprobado.' };
    }

    const row: PrefabIndexRow = {
      prefabId: meta.prefabId,
      version: meta.version,
      parcelId: meta.placement.parcelId,
      cell: meta.placement.cell,
      file,
      displayName: meta.displayName,
      ...(occupies.length > 0 ? { occupies } : {}),
    };
    this.register(row);
    this.loaded.set(meta.prefabId, meta);
    this.invalidate(meta.placement.cell);
    return { ok: true };
  }

  /**
   * Resuelve una dirección real de Esquel a la parcela que le corresponde.
   * Es el puente entre "Av. Alvear 1200" y `parcel:C0-R-1-P08`.
   */
  parcelForAddress(street: KnownStreet, streetNumber: number): string | null {
    const parcel = resolveAddress(street, streetNumber);
    return parcel ? parcel.parcelId : null;
  }

  /** Saca un prefab del mundo y devuelve el edificio genérico a su lugar. */
  remove(parcelId: string): void {
    const row = this.byParcel.get(parcelId);
    if (!row) return;
    this.byParcel.delete(parcelId);
    this.loaded.delete(row.prefabId);
    for (const [claimedParcel, owner] of this.claimed) {
      if (owner === row.prefabId) this.claimed.delete(claimedParcel);
    }
    this.byCell.get(cellKeyOf(row.cell))?.delete(parcelId);
    this.invalidate(row.cell);
  }

  /** Cantidad de fachadas reales cargadas (para el panel de diagnóstico). */
  get size(): number {
    return this.byParcel.size;
  }
}

/** Instancia compartida por toda la aplicación. */
export const prefabRegistry = new PrefabRegistry();
