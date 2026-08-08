/** Formateo en español rioplatense. Un solo lugar, para que todo el tablero hable igual. */

const LOCALE = 'es-AR';

const nf0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const SIN_DATO = '—';

export function num(v: number | null | undefined, decimales = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return SIN_DATO;
  if (decimales === 1) return nf1.format(v);
  if (decimales === 2) return nf2.format(v);
  return nf0.format(v);
}

/** Números grandes abreviados para ejes: 12.500 → 12,5 mil */
export function numCorto(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return SIN_DATO;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${nf1.format(v / 1_000_000)} M`;
  if (abs >= 10_000) return `${nf0.format(v / 1000)} mil`;
  if (abs >= 1000) return `${nf1.format(v / 1000)} mil`;
  return nf0.format(v);
}

export function pct(v: number | null | undefined, decimales = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return SIN_DATO;
  const n = v * 100;
  return `${decimales === 1 ? nf1.format(n) : nf0.format(n)} %`;
}

/** Variación relativa con signo, para los deltas de los KPI. */
export function delta(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return SIN_DATO;
  const n = v * 100;
  const signo = n > 0 ? '+' : '';
  return `${signo}${decimales === 1 ? nf1.format(n) : nf0.format(n)} %`;
}

/** Diferencia en puntos porcentuales (para comparar dos tasas). */
export function pp(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return SIN_DATO;
  const n = v * 100;
  const signo = n > 0 ? '+' : '';
  return `${signo}${decimales === 1 ? nf1.format(n) : nf0.format(n)} pp`;
}

export function moneda(v: number | null | undefined, simbolo = '$'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return SIN_DATO;
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${simbolo} ${nf1.format(v / 1_000_000_000)} MM`;
  if (abs >= 1_000_000) return `${simbolo} ${nf1.format(v / 1_000_000)} M`;
  if (abs >= 1000) return `${simbolo} ${nf0.format(v / 1000)} mil`;
  return `${simbolo} ${nf0.format(v)}`;
}

// --------------------------------------------------------------------------
// Fechas
// --------------------------------------------------------------------------
export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const MESES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_ABBR = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Convierte lo que devuelve DuckDB para una columna DATE a `Date`.
 * Según el tipo físico puede llegar como número de días, milisegundos o Date.
 */
export function aFecha(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    // Heurística: por debajo de ~100.000 es un contador de días desde 1970.
    return v < 100_000 ? new Date(v * 86_400_000) : new Date(v);
  }
  return new Date(String(v));
}

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fechaCorta(d: Date): string {
  return `${d.getUTCDate()} ${MESES_ABBR[d.getUTCMonth()].toLowerCase()}`;
}

export function fechaLarga(d: Date): string {
  const dow = DIAS[(d.getUTCDay() + 6) % 7];
  return `${dow} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()].toLowerCase()}`;
}

export function fechaIso(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
