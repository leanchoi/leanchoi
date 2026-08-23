/**
 * Índice de cartas para dibujar la mesa del duelo.
 *
 * El servidor manda los duelos por slug; acá se traduce ese slug a lo que la UI
 * necesita mostrar. **Los datos no se copian**: salen del mismo catálogo que usa
 * el motor autoritativo, en `/shared/constants/cards.ts`.
 *
 * Hasta la auditoría esto era una segunda lista escrita a mano, y una segunda
 * lista es una lista que en algún momento discrepa: la carta podía anunciar que
 * cuesta 3 de labia y el servidor cobrar 4. Ahora hay una sola.
 */

import { CARD_LIST, type DebateFamily } from '@esquel/shared';

export interface CardInfo {
  readonly slug: string;
  readonly name: string;
  readonly family: DebateFamily;
  readonly cost: number;
  readonly power: number;
  readonly flavor: string;
  readonly rarity: string;
}

/**
 * Sólo los campos que la carta muestra. El resto del catálogo —precisión,
 * backfire, efectos, cooldown— es del servidor y no tiene por qué viajar al
 * navegador: lo que no se manda no se puede usar para adivinar la jugada.
 */
export const CARD_INDEX: ReadonlyMap<string, CardInfo> = new Map(
  CARD_LIST.map((c) => [
    c.slug as string,
    {
      slug: c.slug,
      name: c.name,
      family: c.family,
      cost: c.cost,
      power: c.power,
      flavor: c.flavor,
      rarity: c.rarity,
    },
  ]),
);
