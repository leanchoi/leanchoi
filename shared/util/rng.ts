/**
 * RNG determinista compartido cliente/servidor.
 *
 * Todo evento con azar visible (duelos, generación de misiones, spawn de NPC)
 * usa una semilla explícita y este generador, para que el cliente pueda
 * reproducir la animación exacta que el servidor ya resolvió y para que QA pueda
 * re-ejecutar un duelo desde su `seed`.
 *
 * Algoritmo: mulberry32 (32 bits, período 2^32, suficiente para partidas cortas).
 */

export interface Rng {
  /** Flotante en [0,1). */
  next(): number;
  /** Entero en [min, max] inclusive. */
  int(min: number, max: number): number;
  /** `true` con probabilidad `p`. */
  chance(p: number): boolean;
  /** Elemento aleatorio de un array no vacío. */
  pick<T>(items: readonly T[]): T;
  /** Copia barajada (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Estado actual, para persistir/reanudar. */
  state(): number;
}

export const createRng = (seed: number): Rng => {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new RangeError('pick() sobre array vacío');
      return items[Math.floor(next() * items.length)] as never;
    },
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as never, out[i] as never];
      }
      return out;
    },
    state: () => a,
  };
};

/** Semilla estable a partir de un string (FNV-1a 32 bits). */
export const seedFromString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
