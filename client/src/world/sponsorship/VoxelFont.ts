/**
 * Tipografía voxel de 3×5 para las marquesinas.
 *
 * Los carteles de los comercios se arman con cubos, no con texturas: así se ven
 * igual que el resto del pueblo y no hay que subir un PNG por cada local. Tres
 * columnas por cinco filas es el mínimo con el que una letra sigue siendo esa
 * letra; a la distancia a la que se leen los carteles, alcanza.
 *
 * El mapa se escribe con `#` y `.` a propósito: se lee de un vistazo y se
 * corrige sin contar bits.
 */

export const GLYPH_W = 3;
export const GLYPH_H = 5;

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '###', '###', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '###', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '.##'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  ' ': ['...', '...', '...', '...', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  "'": ['.#.', '.#.', '...', '...', '...'],
};

/** Píxel encendido de un carácter, o `false` si el glifo no existe. */
export const glyphPixel = (char: string, col: number, row: number): boolean => {
  const glyph = GLYPHS[char.toUpperCase()] ?? GLYPHS[' '];
  return glyph[row]?.[col] === '#';
};

/** ¿Se puede dibujar este carácter? */
export const hasGlyph = (char: string): boolean => char.toUpperCase() in GLYPHS;

/**
 * Posiciones de los píxeles encendidos de un texto, en celdas de glifo.
 * El origen es la esquina superior izquierda; `x` crece a la derecha e `y`
 * hacia abajo, como se lee.
 */
export const textPixels = (text: string, spacing = 1): { x: number; y: number }[] => {
  const pixels: { x: number; y: number }[] = [];
  let offset = 0;
  for (const char of text) {
    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (glyphPixel(char, col, row)) pixels.push({ x: offset + col, y: row });
      }
    }
    offset += GLYPH_W + spacing;
  }
  return pixels;
};

/** Ancho en celdas de un texto ya compuesto. */
export const textWidth = (text: string, spacing = 1): number =>
  text.length === 0 ? 0 : text.length * GLYPH_W + (text.length - 1) * spacing;
