/**
 * Interest management por manzanas.
 *
 * Esquel está cuadriculada, así que el índice espacial se cae de maduro: una tabla
 * hash por manzana (`col:row`). Meter, sacar y consultar es O(1) amortizado, y
 * preguntar "quiénes están a menos de 4 manzanas" cuesta 81 lookups en el peor
 * caso, sin recorrer la lista entera de jugadores.
 *
 * Sin esto, con 120 jugadores en la sala habría 14.400 pares por tick. Con esto,
 * en el centro lleno son unas decenas.
 */

import { CELL_PITCH_M } from '@esquel/shared';

export interface AoiEntry {
  readonly sessionId: string;
  col: number;
  row: number;
}

const key = (col: number, row: number): string => `${col}:${row}`;

export class AoiIndex {
  private readonly cells = new Map<string, Set<string>>();
  private readonly entries = new Map<string, AoiEntry>();

  /** Manzana que contiene una posición de mundo. */
  static cellOf(x: number, z: number): { col: number; row: number } {
    return {
      col: Math.floor(x / CELL_PITCH_M + 0.5),
      row: Math.floor(z / CELL_PITCH_M + 0.5),
    };
  }

  /** Alta o movimiento de un jugador. Devuelve `true` si cambió de manzana. */
  update(sessionId: string, x: number, z: number): boolean {
    const { col, row } = AoiIndex.cellOf(x, z);
    const current = this.entries.get(sessionId);

    if (current && current.col === col && current.row === row) return false;

    if (current) this.cells.get(key(current.col, current.row))?.delete(sessionId);

    const bucket = this.cells.get(key(col, row)) ?? new Set<string>();
    bucket.add(sessionId);
    this.cells.set(key(col, row), bucket);

    if (current) {
      current.col = col;
      current.row = row;
    } else {
      this.entries.set(sessionId, { sessionId, col, row });
    }
    return true;
  }

  remove(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    const bucket = this.cells.get(key(entry.col, entry.row));
    bucket?.delete(sessionId);
    if (bucket && bucket.size === 0) this.cells.delete(key(entry.col, entry.row));
    this.entries.delete(sessionId);
  }

  /** Manzana donde está un jugador. */
  cellOf(sessionId: string): { col: number; row: number } | undefined {
    const entry = this.entries.get(sessionId);
    return entry ? { col: entry.col, row: entry.row } : undefined;
  }

  /**
   * Vecinos dentro de `radiusCells` manzanas (vecindad de Chebyshev: el cuadrado
   * de 9×9 manzanas alrededor, para radio 4).
   *
   * @param exclude sesión que no se incluye en el resultado (el propio jugador).
   */
  neighbors(col: number, row: number, radiusCells: number, exclude?: string): string[] {
    const out: string[] = [];
    for (let dc = -radiusCells; dc <= radiusCells; dc++) {
      for (let dr = -radiusCells; dr <= radiusCells; dr++) {
        const bucket = this.cells.get(key(col + dc, row + dr));
        if (!bucket) continue;
        for (const id of bucket) {
          if (id !== exclude) out.push(id);
        }
      }
    }
    return out;
  }

  /** Cantidad de jugadores indexados. */
  get size(): number {
    return this.entries.size;
  }

  /** Manzanas ocupadas: sirve para saber dónde se está juntando la gente. */
  occupiedCells(): { col: number; row: number; count: number }[] {
    const out: { col: number; row: number; count: number }[] = [];
    for (const [k, bucket] of this.cells) {
      if (bucket.size === 0) continue;
      const [col, row] = k.split(':').map(Number) as [number, number];
      out.push({ col, row, count: bucket.size });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  clear(): void {
    this.cells.clear();
    this.entries.clear();
  }
}
