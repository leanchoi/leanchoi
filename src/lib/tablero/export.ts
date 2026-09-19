import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditLog, barrios, noRespuestas, respuestas } from '@/db/schema';
import type { UsuarioSesion } from '@/lib/auth/usuarios';
import { ETIQUETA_MOTIVO } from '@/lib/campo/tipos';
import type { MotivoNoRespuesta } from '@/lib/campo/tipos';
import { obtenerVigente } from '@/lib/cuestionario/repositorio';
import { preguntasDe } from '@/lib/cuestionario';
import { coberturaPorBarrio } from './consultas';

/**
 * Exports en CSV, **anonimizados**.
 *
 * Qué NO sale nunca, aunque el archivo lo pida quien lo pida:
 *   - el ticket ni el código del comprobante: son el puente con la identidad;
 *   - el identificador de la vivienda, el dispositivo o el encuestador;
 *   - las coordenadas: el punto GPS de una casa ES esa casa;
 *   - la hora exacta: cruzada con el barrio y el recorrido, alcanza para saber quién.
 *
 * Queda la fecha, el barrio, la duración y las respuestas. Cada export se registra
 * en `audit_log` con quién lo pidió y cuántas filas se llevó.
 */

/** Excel abre bien el UTF-8 solo si el archivo arranca con BOM. */
const BOM = '﻿';

export function escaparCampo(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = Array.isArray(valor) ? valor.join(' | ') : String(valor);
  if (/[",\n\r;]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function aCsv(columnas: string[], filas: Record<string, unknown>[]): string {
  const encabezado = columnas.map(escaparCampo).join(',');
  const cuerpo = filas.map((fila) =>
    columnas.map((columna) => escaparCampo(fila[columna])).join(','),
  );
  return BOM + [encabezado, ...cuerpo].join('\r\n') + '\r\n';
}

async function registrarExport(
  usuario: UsuarioSesion,
  tipo: string,
  filas: number,
  barrioId?: string | null,
): Promise<void> {
  await getDb()
    .insert(auditLog)
    .values({
      usuarioId: usuario.id,
      accion: 'export_csv',
      metadata: { tipo, filas, barrioId: barrioId ?? null },
    });
}

function soloFecha(fecha: Date | null): string {
  return fecha ? fecha.toISOString().slice(0, 10) : '';
}

export async function exportarRespuestas(
  usuario: UsuarioSesion,
  barrioId?: string | null,
): Promise<string> {
  const cuestionario = await obtenerVigente();
  const preguntas = cuestionario ? preguntasDe(cuestionario.definicion) : [];

  const filas = await getDb()
    .select({
      barrio: barrios.nombre,
      cerradaEn: respuestas.cerradaEn,
      sincronizadaEn: respuestas.sincronizadaEn,
      duracionSegundos: respuestas.duracionSegundos,
      cuestionarioVersion: respuestas.cuestionarioVersion,
      consentimientoVersion: respuestas.consentimientoVersion,
      payload: respuestas.payload,
    })
    .from(respuestas)
    .innerJoin(barrios, eq(barrios.id, respuestas.barrioId))
    .where(barrioId ? eq(respuestas.barrioId, barrioId) : undefined)
    .orderBy(respuestas.sincronizadaEn);

  const columnas = [
    'n',
    'barrio',
    'fecha',
    'duracion_segundos',
    'cuestionario_version',
    'consentimiento_version',
    ...preguntas.map((pregunta) => pregunta.id),
  ];

  const datos = filas.map((fila, indice) => {
    const payload = (fila.payload ?? {}) as Record<string, unknown>;
    return {
      n: indice + 1,
      barrio: fila.barrio,
      fecha: soloFecha(fila.cerradaEn ?? fila.sincronizadaEn),
      duracion_segundos: fila.duracionSegundos ?? '',
      cuestionario_version: fila.cuestionarioVersion,
      consentimiento_version: fila.consentimientoVersion,
      ...Object.fromEntries(preguntas.map((pregunta) => [pregunta.id, payload[pregunta.id] ?? ''])),
    };
  });

  await registrarExport(usuario, 'respuestas', datos.length, barrioId);
  return aCsv(columnas, datos);
}

export async function exportarCobertura(
  usuario: UsuarioSesion,
  barrioId?: string | null,
): Promise<string> {
  const cobertura = await coberturaPorBarrio(barrioId);
  const columnas = [
    'barrio',
    'viviendas',
    'relevadas',
    'sin_respuesta',
    'pendientes',
    'porcentaje_relevado',
    'porcentaje_no_respuesta',
  ];

  const datos = cobertura.map((fila) => ({
    barrio: fila.barrio,
    viviendas: fila.viviendas,
    relevadas: fila.relevadas,
    sin_respuesta: fila.sinRespuesta,
    pendientes: fila.pendientes,
    porcentaje_relevado: fila.porcentajeRelevado,
    porcentaje_no_respuesta: fila.porcentajeNoRespuesta,
  }));

  await registrarExport(usuario, 'cobertura', datos.length, barrioId);
  return aCsv(columnas, datos);
}

export async function exportarNoRespuestas(
  usuario: UsuarioSesion,
  barrioId?: string | null,
): Promise<string> {
  const filas = await getDb()
    .select({
      barrio: barrios.nombre,
      motivo: noRespuestas.motivo,
      intento: noRespuestas.intento,
      registradaEn: noRespuestas.registradaEn,
    })
    .from(noRespuestas)
    .innerJoin(barrios, eq(barrios.id, noRespuestas.barrioId))
    .where(barrioId ? eq(noRespuestas.barrioId, barrioId) : undefined)
    .orderBy(noRespuestas.registradaEn);

  const columnas = ['n', 'barrio', 'motivo', 'motivo_descripcion', 'intento', 'fecha'];
  const datos = filas.map((fila, indice) => ({
    n: indice + 1,
    barrio: fila.barrio,
    motivo: fila.motivo,
    motivo_descripcion: ETIQUETA_MOTIVO[fila.motivo as MotivoNoRespuesta] ?? fila.motivo,
    intento: fila.intento,
    fecha: soloFecha(fila.registradaEn),
  }));

  await registrarExport(usuario, 'no_respuestas', datos.length, barrioId);
  return aCsv(columnas, datos);
}

export const TIPOS_EXPORT = ['respuestas', 'cobertura', 'no-respuestas'] as const;
export type TipoExport = (typeof TIPOS_EXPORT)[number];

export async function exportar(
  usuario: UsuarioSesion,
  tipo: TipoExport,
  barrioId?: string | null,
): Promise<string> {
  switch (tipo) {
    case 'respuestas':
      return exportarRespuestas(usuario, barrioId);
    case 'cobertura':
      return exportarCobertura(usuario, barrioId);
    case 'no-respuestas':
      return exportarNoRespuestas(usuario, barrioId);
    default: {
      const nunca: never = tipo;
      throw new Error(`Export desconocido: ${String(nunca)}`);
    }
  }
}
