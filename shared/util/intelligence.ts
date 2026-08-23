/**
 * Motor de Inteligencia: las cuentas.
 *
 * Todo lo que convierte eventos en números publicables vive acá, en funciones
 * puras: el reparto de bancas, la ponderación por padrón, el margen de error y
 * la compuerta de k-anonimato. El servidor las usa para agregar y el dashboard
 * para verificar lo que le mandaron; el PHP replica sólo la compuerta.
 *
 * Regla de oro del módulo: **una celda por debajo del umbral no se publica ni
 * redondeada ni suavizada ni "aproximada"**. Se marca no publicable y se dibuja
 * gris. Un dato de tres personas no es un dato, es una indiscreción.
 */

import { BARRIO_BY_ID, BARRIO_DEFS } from '../constants/world.ts';
import type { Barrio, FactionId, Unit } from '../types/common.ts';
import {
  AGE_GROUPS,
  CONCEJO_SEATS,
  CONCEJO_THRESHOLD,
  ageGroupOf,
  type AgeGroup,
  type BarrioHeat,
  type DemographicCell,
  type FactionProjection,
} from '../types/intelligence.ts';
import { K_ANON_MIN } from '../types/telemetry.ts';
import { clamp } from './balance.ts';

/* ------------------------------------------------------------------ */
/* k-anonimato y error muestral                                        */
/* ------------------------------------------------------------------ */

/** ¿La celda tiene gente suficiente para publicarse? */
export const isPublishable = (n: number, kMin: number = K_ANON_MIN): boolean => n >= kMin;

/**
 * Margen de error al 95% de una proporción, con corrección por población finita.
 *
 *   moe = 1,96 · sqrt( p·(1−p)/n ) · sqrt( (N−n)/(N−1) )
 *
 * La corrección importa de verdad acá: el padrón de Esquel ronda los 30.000
 * votantes, así que una muestra de 500 no es "infinitesimal" y sin corregir se
 * reporta un error más grande del real.
 */
export const marginOfError = (share: number, n: number, population = 30_000): number => {
  if (n <= 1) return 1;
  const p = clamp(share, 0, 1);
  const base = 1.96 * Math.sqrt((p * (1 - p)) / n);
  if (population <= n) return Number(base.toFixed(5));
  const fpc = Math.sqrt((population - n) / (population - 1));
  return Number((base * fpc).toFixed(5));
};

/** Aplica la compuerta a una celda ya calculada. */
export const gateCell = (cell: Omit<DemographicCell, 'publishable'>, kMin: number = K_ANON_MIN): DemographicCell => ({
  ...cell,
  publishable: isPublishable(cell.n, kMin),
});

/**
 * Saca de una matriz lo que no se puede publicar.
 * Devuelve las celdas con `value` y `moe` en cero cuando no llegan a `k`: el
 * conteo se conserva (sirve para saber *cuánto falta*), el dato no.
 */
export const redactMatrix = (cells: readonly DemographicCell[], kMin: number = K_ANON_MIN): DemographicCell[] =>
  cells.map((c) => (isPublishable(c.n, kMin) ? c : { ...c, value: 0, moe: 0, publishable: false }));

/* ------------------------------------------------------------------ */
/* Ponderación por padrón                                              */
/* ------------------------------------------------------------------ */

/** Peso de padrón de un barrio, normalizado sobre los barrios presentes. */
export const barrioWeight = (barrio: Barrio): number => BARRIO_BY_ID[barrio]?.electoralWeight ?? 0;

/**
 * Share ponderado por padrón.
 *
 * La muestra del juego no se parece al padrón —el Centro juega más que Alto Río
 * Percy—, así que un promedio simple sobreestima a quien gana donde más se
 * juega. Se pondera por peso de barrio y se renormaliza sobre los barrios que
 * efectivamente aportaron datos publicables.
 */
export const weightedShare = (
  byBarrio: Readonly<Partial<Record<Barrio, { share: number; n: number }>>>,
  kMin: number = K_ANON_MIN,
): { share: Unit; coverage: Unit; subjects: number } => {
  let numerador = 0;
  let pesoTotal = 0;
  let sujetos = 0;

  for (const def of BARRIO_DEFS) {
    const dato = byBarrio[def.id];
    if (!dato || !isPublishable(dato.n, kMin) || def.electoralWeight <= 0) continue;
    numerador += clamp(dato.share, 0, 1) * def.electoralWeight;
    pesoTotal += def.electoralWeight;
    sujetos += dato.n;
  }

  if (pesoTotal <= 0) return { share: 0 as Unit, coverage: 0 as Unit, subjects: 0 };
  return {
    share: clamp(numerador / pesoTotal, 0, 1) as Unit,
    // Cuánto del padrón está representado: si es bajo, el número vale poco.
    coverage: clamp(pesoTotal, 0, 1) as Unit,
    subjects: sujetos,
  };
};

/* ------------------------------------------------------------------ */
/* Reparto de bancas: D'Hondt                                          */
/* ------------------------------------------------------------------ */

/**
 * Reparte bancas por el sistema D'Hondt, que es el que rige en Chubut.
 *
 * El método, sin vueltas: se divide el total de cada lista por 1, 2, 3… y se
 * reparten las bancas a los cocientes más altos. Antes entra el piso: la lista
 * que no llega al umbral no participa del reparto aunque tenga votos.
 *
 * En empate de cocientes gana la lista con más votos totales; si también empatan,
 * el id más bajo. Es arbitrario, pero es determinista, y un reparto que cambia
 * entre dos corridas con los mismos datos no sirve para proyectar nada.
 */
export const dHondt = (
  votes: Readonly<Record<number, number>>,
  seats: number = CONCEJO_SEATS,
  threshold: number = CONCEJO_THRESHOLD,
): Record<number, number> => {
  const total = Object.values(votes).reduce((s, v) => s + Math.max(0, v), 0);
  const asignadas: Record<number, number> = {};
  for (const id of Object.keys(votes)) asignadas[Number(id)] = 0;
  if (total <= 0 || seats <= 0) return asignadas;

  const compiten = Object.entries(votes)
    .map(([id, v]) => ({ id: Number(id), votos: Math.max(0, v) }))
    .filter((l) => l.votos / total >= threshold);

  if (compiten.length === 0) return asignadas;

  for (let banca = 0; banca < seats; banca++) {
    let mejor = compiten[0];
    let mejorCociente = -1;
    for (const lista of compiten) {
      const cociente = lista.votos / (asignadas[lista.id] + 1);
      if (
        cociente > mejorCociente + 1e-9 ||
        (Math.abs(cociente - mejorCociente) <= 1e-9 &&
          (lista.votos > mejor.votos || (lista.votos === mejor.votos && lista.id < mejor.id)))
      ) {
        mejorCociente = cociente;
        mejor = lista;
      }
    }
    asignadas[mejor.id] += 1;
  }

  return asignadas;
};

/** Arma la proyección de bancas a partir de los shares por facción. */
export const projectSeats = (
  shares: readonly { factionId: FactionId; share: number; n: number; deltaPp: number }[],
  seats: number = CONCEJO_SEATS,
): FactionProjection[] => {
  const votos: Record<number, number> = {};
  // D'Hondt trabaja con votos enteros: los shares se escalan a diez mil "votos"
  // simulados, que da resolución de 0,01 punto sin arrastrar decimales.
  for (const s of shares) votos[s.factionId] = Math.round(clamp(s.share, 0, 1) * 10_000);
  const bancas = dHondt(votos, seats);

  return shares
    .map((s) => ({
      factionId: s.factionId,
      share: clamp(s.share, 0, 1) as Unit,
      deltaPp: Number(s.deltaPp.toFixed(2)),
      moe: clamp(marginOfError(s.share, s.n), 0, 1) as Unit,
      seats: bancas[s.factionId] ?? 0,
      n: s.n,
    }))
    .sort((a, b) => b.share - a.share);
};

/* ------------------------------------------------------------------ */
/* Temperatura del barrio                                              */
/* ------------------------------------------------------------------ */

export interface BarrioTally {
  readonly barrio: Barrio;
  /** Intención de voto declarada por facción (conteos, no shares). */
  readonly votes: Readonly<Record<number, number>>;
  /** Eventos de presencia (celdas, actos, permanencia). */
  readonly activity: number;
  /** Suma de sentimientos declarados. */
  readonly moodSum: number;
  readonly moodCount: number;
  readonly subjects: number;
}

/**
 * Convierte los conteos de un barrio en su temperatura publicable.
 * `maxActivity` normaliza la militancia contra el barrio más movido del día:
 * el mapa muestra dónde se milita *relativamente*, que es la pregunta real.
 */
export const barrioHeatOf = (tally: BarrioTally, maxActivity: number, kMin: number = K_ANON_MIN): BarrioHeat => {
  const publishable = isPublishable(tally.subjects, kMin);
  const entradas = Object.entries(tally.votes)
    .map(([id, v]) => ({ id: Number(id) as FactionId, v: Math.max(0, v) }))
    .sort((a, b) => b.v - a.v);
  const total = entradas.reduce((s, e) => s + e.v, 0);

  const primero = entradas[0];
  const segundo = entradas[1];
  const margen = total > 0 && primero ? (primero.v - (segundo?.v ?? 0)) / total : 0;

  return {
    barrio: tally.barrio,
    dominantFaction: publishable && primero && primero.v > 0 ? primero.id : null,
    dominanceMargin: (publishable ? clamp(margen, 0, 1) : 0) as Unit,
    militancy: (publishable && maxActivity > 0 ? clamp(tally.activity / maxActivity, 0, 1) : 0) as Unit,
    mood: publishable && tally.moodCount > 0 ? Number((tally.moodSum / tally.moodCount).toFixed(4)) : 0,
    subjects: tally.subjects,
    publishable,
  };
};

/* ------------------------------------------------------------------ */
/* Exportación                                                         */
/* ------------------------------------------------------------------ */

/**
 * Escapa un campo para CSV (RFC 4180): comillas, comas y saltos de línea.
 *
 * Los objetos van como JSON y no como `String(value)`. No es un detalle: con
 * `String()`, un valor que no fuera primitivo salía `[object Object]` en la
 * celda, y el que abría el CSV se llevaba un dato destruido sin ningún aviso.
 * Un export que corrompe en silencio es peor que uno que falla.
 */
export const csvField = (value: unknown): string => {
  let s: string;
  if (value === null || value === undefined) s = '';
  else if (typeof value === 'string') s = value;
  else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    s = String(value);
  } else {
    // Objetos y arreglos: se serializan. Si ni eso se puede (referencia
    // circular), se dice lo que pasó en vez de escribir basura.
    try {
      s = JSON.stringify(value) ?? '';
    } catch {
      s = '[valor no serializable]';
    }
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Serializa filas a CSV con encabezado, en el orden de `columns`. */
export const toCsv = (rows: readonly Record<string, unknown>[], columns: readonly string[]): string => {
  const cabecera = columns.map(csvField).join(',');
  const cuerpo = rows.map((r) => columns.map((c) => csvField(r[c])).join(',')).join('\n');
  return rows.length > 0 ? `${cabecera}\n${cuerpo}\n` : `${cabecera}\n`;
};

/** Todas las combinaciones de la matriz demográfica, para armar el CSV completo. */
export const demographicAxes = (): { barrios: readonly Barrio[]; ageGroups: readonly AgeGroup[] } => ({
  barrios: BARRIO_DEFS.map((b) => b.id),
  ageGroups: AGE_GROUPS,
});

export { ageGroupOf };
