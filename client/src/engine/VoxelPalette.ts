/**
 * Paleta cordillerana. Colores planos, saturación media y contraste alto: la
 * estética es de bloque pintado, no de fotorrealismo.
 *
 * Los tonos salen de la paleta real de Esquel: chapa acanalada, ladrillo visto,
 * madera de lenga, revoque claro, techos de zinc y el verde oscuro del ciprés.
 */

export const PALETTE = {
  // suelo y calle
  asphalt: 0x36393f,
  asphaltWorn: 0x3f434a,
  sidewalk: 0x9a958a,
  sidewalkCurb: 0x807b71,
  crosswalk: 0xd8d3c4,
  laneMark: 0xd9c46a,
  dirt: 0x6b5b46,
  grass: 0x4d6b3c,
  grassDry: 0x7d8450,
  plazaTile: 0xa89c86,
  water: 0x3d6f86,

  // vegetación
  pine: 0x25482c,
  pineDark: 0x1b3521,
  poplar: 0x5c7a35,
  poplarAutumn: 0xc08a2e,
  shrub: 0x415c33,
  trunk: 0x4a3728,

  // construcción
  plasterLight: 0xd6cbb8,
  plasterCream: 0xdcc9a3,
  plasterBlue: 0xa8bcc6,
  plasterGreen: 0xa9b79b,
  plasterPink: 0xc9a79c,
  brick: 0x8c4a32,
  brickDark: 0x6f3826,
  wood: 0x7a5230,
  woodDark: 0x53381f,
  stone: 0x8d8b85,
  concrete: 0xb4b0a6,

  // techos
  roofZinc: 0x5e6b70,
  roofZincRed: 0x8f4436,
  roofZincGreen: 0x3f5c4a,
  roofTile: 0x9c5a3c,
  roofSnow: 0xe9eef2,

  // aberturas y detalles
  glass: 0x9fcbd6,
  glassLit: 0xf5d98a,
  doorRed: 0x7d2f2a,
  doorBlue: 0x2f4a7d,
  metal: 0x6d7378,
  metalRust: 0x8a5a3c,
  sign: 0xf2b441,
  flagBlue: 0x74acdf,
  flagWhite: 0xf2f2f2,
  flagSun: 0xf6b40e,

  // facciones (espejo de FACTIONS en /shared)
  factionGreen: 0x1f6f4a,
  factionBlue: 0x1b4f9c,
  factionRed: 0x8c2f1d,
  factionPurple: 0x5b2e90,
  factionTeal: 0x0e7c86,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Tonos de revoque para las casas procedimentales. */
export const HOUSE_WALLS: readonly number[] = [
  PALETTE.plasterLight,
  PALETTE.plasterCream,
  PALETTE.plasterBlue,
  PALETTE.plasterGreen,
  PALETTE.plasterPink,
  PALETTE.brick,
  PALETTE.wood,
];

/** Techos de chapa: en la cordillera casi todo es zinc a dos aguas. */
export const HOUSE_ROOFS: readonly number[] = [
  PALETTE.roofZinc,
  PALETTE.roofZincRed,
  PALETTE.roofZincGreen,
  PALETTE.roofTile,
];

/** Mezcla lineal de dos colores 0xRRGGBB. `t=0` devuelve `a`. */
export const mixColor = (a: number, b: number, t: number): number => {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
};

/** Aclara u oscurece un color: `amount > 0` aclara. */
export const shade = (color: number, amount: number): number =>
  mixColor(color, amount > 0 ? 0xffffff : 0x000000, Math.abs(amount));
