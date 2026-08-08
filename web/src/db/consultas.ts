/**
 * Fragmentos SQL reutilizables.
 *
 * Todo el tablero se calcula desde `fact_categoria_dia` (grano fecha ×
 * categoría) en lugar de leer los totales ya agregados. Es más trabajo por
 * consulta, pero es lo que hace que el filtro cruzado sea real: al seleccionar
 * una categoría, el total del destino se **recalcula** para esa categoría en
 * vez de quedar congelado.
 *
 * Regla de agregación de porcentajes, una sola vez y en un solo lugar: nunca se
 * promedian porcentajes. Se suman unidades ocupadas y unidades trabajando, y
 * recién ahí se divide — de otro modo un día con 3 UF pesa lo mismo que uno con
 * 3.000, que es exactamente el error que produce ocupaciones de 163 %.
 */

import { aSql, type Filtros } from '../state/filtros';

/**
 * Tasa de ocupación agregada.
 *
 * Solo entran los pares categoría-día que alcanzan el mínimo muestral. Es la
 * misma regla que el tablero le explica al lector, aplicada a sus propios
 * números: sin ella, una categoría con una sola respuesta en todo el mes puede
 * encabezar el ranking con 50 % y quedar por encima de los hoteles.
 */
export const EXPR_PCT_UF =
  'SUM(CASE WHEN cumple_minimo THEN uf_ocupada_ext END) / ' +
  'NULLIF(SUM(CASE WHEN cumple_minimo THEN uf_trabajando END), 0)';
export const EXPR_PCT_PAX =
  'SUM(CASE WHEN cumple_minimo THEN pax_ocupada_ext END) / ' +
  'NULLIF(SUM(CASE WHEN cumple_minimo THEN pax_trabajando END), 0)';

/**
 * Variante amplia: incluye todo par con alguna respuesta, alcance o no el
 * mínimo. Se usa **solo** en la sección de calidad, para mostrar cuánto se
 * despega la lectura optimista de la publicable.
 */
export const EXPR_PCT_UF_AMPLIO =
  'SUM(uf_ocupada_ext) / NULLIF(SUM(CASE WHEN tiene_dato THEN uf_trabajando END), 0)';

/**
 * Base filtrada de (fecha × categoría), con los atributos del calendario ya
 * unidos. `ignorarCategoria` sirve para los gráficos que muestran la propia
 * dimensión categoría: si se filtrara, al elegir una las demás desaparecerían
 * en lugar de atenuarse.
 */
export function baseCategoriaDia(f: Filtros, opciones: { ignorarCategoria?: boolean } = {}): string {
  const p = aSql(f);
  const condCategoria = opciones.ignorarCategoria ? 'TRUE' : p.categoria;
  const soloPublicables = f.publicables === 'publicables' ? 'AND fcd.cumple_minimo' : '';
  return `
    SELECT fcd.*,
           cal.mes, cal.mes_nombre, cal.mes_abbr, cal.quincena, cal.quincena_label,
           cal.dow, cal.dow_nombre, cal.dow_abbr, cal.dia_del_anio, cal.semana_iso,
           cal.es_finde, cal.es_feriado, cal.es_no_laborable, cal.feriado_nombre,
           cal.temporada, cal.evento_nombre, cal.en_vacaciones
    FROM fact_categoria_dia fcd
    JOIN dim_calendario cal USING (fecha)
    WHERE ${p.calendario} AND ${condCategoria} ${soloPublicables}
  `;
}

/** Base al grano de establecimiento × día (para calidad y fichas). */
export function baseEstablecimientoDia(
  f: Filtros,
  opciones: { ignorarCategoria?: boolean } = {},
): string {
  const p = aSql(f);
  const condCategoria = opciones.ignorarCategoria ? 'TRUE' : p.categoria;
  return `
    SELECT fed.*,
           cal.mes, cal.mes_nombre, cal.mes_abbr, cal.quincena, cal.dow, cal.dow_abbr,
           cal.es_finde, cal.es_feriado, cal.es_no_laborable, cal.temporada, cal.evento_nombre
    FROM fact_establecimiento_dia fed
    JOIN dim_calendario cal USING (fecha)
    WHERE ${p.calendario} AND ${condCategoria}
  `;
}

/** Serie diaria del destino, con el recorte aplicado. */
export function sqlSerieDiaria(f: Filtros): string {
  return `
    WITH base AS (${baseCategoriaDia(f)})
    SELECT
      fecha,
      ${EXPR_PCT_UF}  AS pct_uf,
      ${EXPR_PCT_PAX} AS pct_pax,
      SUM(uf_ocupada_ext)  AS uf_ocupadas,
      SUM(pax_ocupada_ext) AS plazas_ocupadas,
      SUM(uf_trabajando)   AS uf_trabajando,
      SUM(pax_trabajando)  AS pax_trabajando,
      COUNT(*) FILTER (WHERE cumple_minimo) AS categorias_publicables,
      COUNT(*) FILTER (WHERE tiene_dato)    AS categorias_con_dato,
      SUM(n_relevados)        AS establecimientos_con_dato,
      SUM(n_establecimientos) AS establecimientos_panel,
      any_value(feriado_nombre) AS feriado,
      any_value(evento_nombre)  AS evento
    FROM base
    GROUP BY fecha
    ORDER BY fecha
  `;
}

/**
 * Totales del recorte, para la fila de KPI.
 *
 * El parque se consolida primero **por día** y después se promedia. Agregarlo
 * de una sola pasada sobre (fecha × categoría) daría el promedio de una
 * categoría cualquiera en un día cualquiera, no el tamaño del destino.
 */
export function sqlResumen(f: Filtros): string {
  return `
    WITH base AS (${baseCategoriaDia(f)}),
    dia AS (
      SELECT
        fecha,
        SUM(uf_habilitada)   AS uf_habilitada,
        SUM(pax_habilitada)  AS pax_habilitada,
        SUM(uf_trabajando)   AS uf_trabajando,
        SUM(pax_trabajando)  AS pax_trabajando,
        SUM(CASE WHEN cumple_minimo THEN uf_ocupada_ext  END) AS uf_ocupada_pub,
        SUM(CASE WHEN cumple_minimo THEN uf_trabajando   END) AS uf_trab_pub,
        SUM(CASE WHEN cumple_minimo THEN pax_ocupada_ext END) AS pax_ocupada_pub,
        SUM(CASE WHEN cumple_minimo THEN pax_trabajando  END) AS pax_trab_pub,
        SUM(n_relevados)        AS respuestas,
        SUM(n_establecimientos) AS panel,
        COUNT(*) FILTER (WHERE cumple_minimo) AS categorias_publicables
      FROM base GROUP BY fecha
    )
    SELECT
      SUM(uf_ocupada_pub)  / NULLIF(SUM(uf_trab_pub), 0)  AS pct_uf,
      SUM(pax_ocupada_pub) / NULLIF(SUM(pax_trab_pub), 0) AS pct_pax,
      SUM(pax_ocupada_pub) AS pernoctes_observados,
      SUM(uf_ocupada_pub)  AS uf_ocupadas,
      COUNT(*)             AS dias,
      COUNT(*) FILTER (WHERE categorias_publicables > 0) AS dias_con_publicable,
      SUM(respuestas)      AS respuestas,
      SUM(panel)           AS panel,
      AVG(uf_trabajando)   AS uf_trabajando_medio,
      AVG(pax_trabajando)  AS pax_trabajando_medio,
      AVG(uf_habilitada)   AS uf_habilitada_media,
      AVG(pax_habilitada)  AS pax_habilitada_media
    FROM dia
  `;
}

/** Ranking por categoría. Nunca filtra por categoría: atenúa, no esconde. */
export function sqlPorCategoria(f: Filtros): string {
  return `
    WITH base AS (${baseCategoriaDia(f, { ignorarCategoria: true })})
    SELECT
      categoria,
      ${EXPR_PCT_UF}  AS pct_uf,
      ${EXPR_PCT_PAX} AS pct_pax,
      SUM(pax_ocupada_ext) AS pernoctes,
      SUM(uf_ocupada_ext)  AS uf_ocupadas,
      AVG(uf_trabajando)   AS uf_trabajando,
      AVG(pax_trabajando)  AS pax_trabajando,
      AVG(uf_habilitada)   AS uf_habilitada,
      AVG(pax_habilitada)  AS pax_habilitada,
      MAX(n_establecimientos) AS establecimientos,
      MAX(minimo_requerido)   AS minimo_requerido,
      COUNT(DISTINCT fecha)   AS dias,
      COUNT(DISTINCT fecha) FILTER (WHERE cumple_minimo) AS dias_publicables,
      COUNT(DISTINCT fecha) FILTER (WHERE tiene_dato)    AS dias_con_dato,
      SUM(n_relevados)::DOUBLE / NULLIF(SUM(n_establecimientos), 0) AS tasa_respuesta
    FROM base
    GROUP BY categoria
  `;
}

/** Serie por período nombrado (mes, día de la semana, quincena, temporada…). */
export function sqlPorDimension(f: Filtros, dimension: string, extra = ''): string {
  return `
    WITH base AS (${baseCategoriaDia(f)})
    SELECT
      ${dimension} AS clave
      ${extra ? `, ${extra}` : ''},
      ${EXPR_PCT_UF}  AS pct_uf,
      ${EXPR_PCT_PAX} AS pct_pax,
      SUM(pax_ocupada_ext) AS pernoctes,
      COUNT(DISTINCT fecha) AS dias,
      COUNT(DISTINCT fecha) FILTER (WHERE cumple_minimo) AS dias_publicables
    FROM base
    GROUP BY ALL
    ORDER BY 1
  `;
}
