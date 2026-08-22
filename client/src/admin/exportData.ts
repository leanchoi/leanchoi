/**
 * Exportación del reporte consolidado.
 *
 * Dos formatos, dos usos: el JSON es la foto completa tal cual la devolvió el
 * backend —sirve para reprocesar—, y el CSV es lo que se abre en una planilla y
 * se manda por mail.
 *
 * El CSV va en **formato largo** (una fila por celda: métrica, dimensión, valor)
 * en vez de una tabla ancha. Es menos lindo de mirar y muchísimo más fácil de
 * pivotear, que es lo que uno termina haciendo. Y la columna `publicable` viaja
 * con cada fila: quien reciba el archivo tiene que poder distinguir un cero que
 * es cero de un cero que es "no alcanza la muestra".
 */

import { toCsv, type DashboardSnapshot } from '@esquel/shared';
import { factionName } from './palette.ts';

const COLUMNAS = ['metrica', 'dimension', 'segmento', 'valor', 'n', 'publicable'] as const;

/** Aplana el snapshot a filas largas. */
export const snapshotARows = (snap: DashboardSnapshot): Record<string, unknown>[] => {
  const filas: Record<string, unknown>[] = [];

  for (const barrio of snap.heat.barrios) {
    filas.push(
      { metrica: 'dominancia', dimension: barrio.barrio, segmento: factionName(barrio.dominantFaction), valor: barrio.dominanceMargin, n: barrio.subjects, publicable: barrio.publishable ? 1 : 0 },
      { metrica: 'militancia', dimension: barrio.barrio, segmento: '', valor: barrio.militancy, n: barrio.subjects, publicable: barrio.publishable ? 1 : 0 },
      { metrica: 'humor', dimension: barrio.barrio, segmento: '', valor: barrio.mood, n: barrio.subjects, publicable: barrio.publishable ? 1 : 0 },
    );
  }

  for (const lista of snap.projection.mayor) {
    filas.push(
      { metrica: 'intencion_voto', dimension: factionName(lista.factionId), segmento: 'intendencia', valor: lista.share, n: lista.n, publicable: snap.projection.publishable ? 1 : 0 },
      { metrica: 'margen_error', dimension: factionName(lista.factionId), segmento: 'intendencia', valor: lista.moe, n: lista.n, publicable: snap.projection.publishable ? 1 : 0 },
      { metrica: 'variacion_pp', dimension: factionName(lista.factionId), segmento: 'intendencia', valor: lista.deltaPp, n: lista.n, publicable: snap.projection.publishable ? 1 : 0 },
      { metrica: 'bancas', dimension: factionName(lista.factionId), segmento: 'concejo', valor: lista.seats, n: lista.n, publicable: snap.projection.publishable ? 1 : 0 },
    );
  }

  filas.push({
    metrica: 'indecisos',
    dimension: '',
    segmento: '',
    valor: snap.projection.undecidedShare,
    n: snap.projection.sampleSize,
    publicable: snap.projection.publishable ? 1 : 0,
  });

  for (const punto of snap.trend) {
    for (const [faccion, share] of Object.entries(punto.byFaction)) {
      filas.push({ metrica: 'tendencia', dimension: factionName(Number(faccion)), segmento: punto.day, valor: share, n: '', publicable: 1 });
    }
    filas.push({ metrica: 'tendencia_indecisos', dimension: '', segmento: punto.day, valor: punto.undecided, n: '', publicable: 1 });
  }

  for (const mision of snap.participation) {
    filas.push(
      { metrica: 'misiones_arrancadas', dimension: mision.questType, segmento: '', valor: mision.starts, n: '', publicable: 1 },
      { metrica: 'misiones_terminadas', dimension: mision.questType, segmento: '', valor: mision.finishes, n: '', publicable: 1 },
      { metrica: 'completitud_media', dimension: mision.questType, segmento: '', valor: mision.completionAvg, n: '', publicable: 1 },
    );
  }

  for (const comercio of snap.sponsors) {
    filas.push(
      { metrica: 'impresiones', dimension: comercio.name, segmento: '', valor: comercio.impressions, n: comercio.uniqueSubjects, publicable: 1 },
      { metrica: 'entradas', dimension: comercio.name, segmento: '', valor: comercio.entries, n: comercio.uniqueSubjects, publicable: 1 },
      { metrica: 'buffs_retirados', dimension: comercio.name, segmento: '', valor: comercio.buffClaims, n: comercio.uniqueSubjects, publicable: 1 },
    );
  }

  return filas;
};

/** Dispara la descarga de un archivo generado en el navegador. */
const descargar = (contenido: string, nombre: string, mime: string): void => {
  const blob = new Blob([contenido], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sin esto, el blob queda vivo hasta que se cierre la pestaña.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportarCsv = (snap: DashboardSnapshot): void => {
  // El BOM hace que Excel en Windows abra el archivo en UTF-8 sin preguntar.
  const csv = '﻿' + toCsv(snapshotARows(snap), [...COLUMNAS]);
  descargar(csv, `esquel2027-inteligencia-${snap.day}.csv`, 'text/csv');
};

export const exportarJson = (snap: DashboardSnapshot): void => {
  descargar(JSON.stringify(snap, null, 2), `esquel2027-inteligencia-${snap.day}.json`, 'application/json');
};
