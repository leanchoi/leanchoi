/**
 * Paleta del Dashboard de Campaña.
 *
 * Los colores de facción del juego están calibrados para verse sobre un avatar
 * iluminado en 3D: sobre el fondo oscuro del panel quedan apagados y sin
 * contraste. Acá viven los **mismos tonos** llevados a la banda de luminosidad
 * que corresponde a una superficie oscura — el verde del Frente Vecinal sigue
 * siendo el verde del Frente Vecinal, sólo que legible en un gráfico.
 *
 * No se eligieron a ojo. Se derivaron en OKLCH conservando el tono, subiendo la
 * luminosidad a L=0,60 y tomando el máximo croma que soporta cada tono dentro
 * del gamut sRGB. El resultado pasa las cinco verificaciones sobre la superficie
 * `#0c1016`: banda de luminosidad, piso de croma, separación con daltonismo
 * (peor par adyacente ΔE 8,1 deuteranopía), piso de visión normal (ΔE 19,5) y
 * contraste ≥ 3:1.
 *
 * Como el peor par adyacente queda justo en el piso de daltonismo, **todos** los
 * gráficos llevan además etiqueta directa y separación entre marcas: el color
 * nunca es el único que dice de quién es la barra.
 */

import { FACTIONS } from '@esquel/shared';

/** Tono de facción llevado a la banda del panel oscuro. Orden fijo por id. */
export const FACTION_CHART_COLORS: Readonly<Record<number, string>> = {
  1: '#1d9763', // Frente Vecinal Cordillerano — verde
  2: '#4a7fd1', // Unidad del Valle — azul
  3: '#c15f4b', // Movimiento La Trochita — terracota
  4: '#9166cd', // Participación de Vecinos — violeta
  5: '#00919d', // Alternativa del Agua — turquesa
};

/** Para indecisos y para lo que no tiene facción. Gris, nunca un tono libre. */
export const NEUTRAL = '#7b7566';

export const factionColor = (id: number | null | undefined): string =>
  id ? (FACTION_CHART_COLORS[id] ?? NEUTRAL) : NEUTRAL;

export const factionShortName = (id: number | null | undefined): string => {
  if (!id) return 'Indecisos';
  return FACTIONS.find((f) => (f.id as unknown as number) === id)?.shortName ?? `F${id}`;
};

export const factionName = (id: number | null | undefined): string => {
  if (!id) return 'Indecisos / no vota';
  return FACTIONS.find((f) => (f.id as unknown as number) === id)?.name ?? `Facción ${id}`;
};

/**
 * Rampa secuencial para la militancia: un solo tono, de apagado a encendido.
 * Es el ámbar del HUD, que ya es el color de "acá pasa algo".
 */
export const MILITANCY_RAMP = ['#2a2415', '#4d3f1d', '#7a6224', '#ad8a2c', '#dcb03a', '#f2c85f'] as const;

export const militancyColor = (unit: number): string => {
  const i = Math.max(0, Math.min(MILITANCY_RAMP.length - 1, Math.round(unit * (MILITANCY_RAMP.length - 1))));
  return MILITANCY_RAMP[i];
};

/**
 * Rampa divergente para el humor: dos tonos y un gris en el medio.
 * Nunca un tono en el punto neutro — el cero tiene que verse como cero.
 */
export const MOOD_RAMP = ['#c1504b', '#a86a5c', '#6e6a60', '#6f9a68', '#5fb374'] as const;

export const moodColor = (value: number): string => {
  const t = Math.max(-1, Math.min(1, value));
  const i = Math.round(((t + 1) / 2) * (MOOD_RAMP.length - 1));
  return MOOD_RAMP[i];
};

/** Superficie del panel. La usan los anillos de 2 px entre marcas. */
export const SURFACE = '#0c1016';
