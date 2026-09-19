import { v7 as uuidv7 } from 'uuid';

/**
 * El ticket se genera en el celular, sin pedirle nada al servidor: es lo que
 * permite trabajar sin señal (regla 9). Es un UUID v7, así que además viene
 * ordenado por tiempo.
 *
 * Es también el código que el vecino se lleva para consultar su pedido, así que
 * se le calcula una versión corta y legible en voz alta.
 */

/** Sin vocales ni caracteres que se confunden (0/O, 1/I/L). */
const ALFABETO = '23456789ACDEFGHJKMNPQRTUVWXYZ';

export function nuevoTicket(): string {
  return uuidv7();
}

/**
 * Código corto derivado del ticket, determinístico: el mismo ticket da siempre el
 * mismo código. Formato `ESQ-XXXX-XXXX`.
 */
export function codigoCorto(ticket: string): string {
  const hex = ticket.replace(/-/g, '');
  const grupos: string[] = [];

  for (let bloque = 0; bloque < 2; bloque += 1) {
    let grupo = '';
    for (let i = 0; i < 4; i += 1) {
      const posicion = hex.length - 1 - (bloque * 4 + i);
      const valor = Number.parseInt(hex[posicion] ?? '0', 16);
      const siguiente = Number.parseInt(hex[Math.max(0, posicion - 8)] ?? '0', 16);
      grupo += ALFABETO[(valor * 16 + siguiente) % ALFABETO.length];
    }
    grupos.push(grupo);
  }

  return `ESQ-${grupos[0]}-${grupos[1]}`;
}

export function nuevoDispositivoId(): string {
  return uuidv7();
}
