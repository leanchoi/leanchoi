/**
 * Calidad del dato.
 *
 * Esta sección no existe en el tablero actual y es, probablemente, la más
 * importante para un área de inteligencia: muestra **de qué está hecho** cada
 * porcentaje que se publica. Un 45 % de ocupación sostenido por cuatro
 * respuestas no es el mismo dato que un 45 % sostenido por cuarenta, y hoy esa
 * diferencia es invisible.
 */

import { useMemo } from 'react';
import { BarraApilada, BarrasHorizontales } from '../charts/categoricas';
import { MatrizCobertura, type CeldaCobertura } from '../charts/matrices';
import { SerieTemporal, type PuntoSerie } from '../charts/temporales';
import { mediaMovil } from '../charts/base';
import { Aviso, EncabezadoSeccion, FilaKpis, Grilla, Tarjeta, type DatosKpi } from '../components/ui';
import { baseCategoriaDia, baseEstablecimientoDia, sqlPorCategoria } from '../db/consultas';
import { useConsulta } from '../hooks/useConsulta';
import { aFecha, fechaLarga, iso, MESES_ABBR, num, pct, pp } from '../lib/formato';
import { useApp } from '../state/app';
import type { Filtros } from '../state/filtros';

/** Estado de cobertura por (categoría, día). */
function sqlCobertura(f: Filtros): string {
  return `
    WITH base AS (${baseCategoriaDia(f, { ignorarCategoria: true })})
    SELECT fecha, categoria, n_relevados, n_establecimientos, minimo_requerido,
           cumple_minimo, tiene_dato, faltan_para_minimo
    FROM base ORDER BY categoria, fecha
  `;
}

/** Evolución diaria de la tasa de respuesta. */
function sqlRespuestaDiaria(f: Filtros): string {
  return `
    WITH base AS (${baseCategoriaDia(f)})
    SELECT fecha,
           SUM(n_relevados)::DOUBLE / NULLIF(SUM(n_establecimientos), 0) AS tasa,
           SUM(n_marcados_relevados)::DOUBLE / NULLIF(SUM(n_establecimientos), 0) AS tasa_marcada,
           COUNT(*) FILTER (WHERE cumple_minimo) AS categorias_publicables
    FROM base GROUP BY fecha ORDER BY fecha
  `;
}

/** Casos donde la planilla marcó «Relevado = No» pero sí cargó ocupación. */
function sqlBanderaIncompleta(f: Filtros): string {
  return `
    WITH base AS (${baseEstablecimientoDia(f)})
    SELECT
      COUNT(*) FILTER (WHERE con_dato AND NOT relevado) AS casos,
      COUNT(*) FILTER (WHERE con_dato)                  AS con_dato,
      COUNT(DISTINCT alojamiento_clave) FILTER (WHERE con_dato AND NOT relevado) AS establecimientos
    FROM base
  `;
}

/** Distribución de los estados normalizados. */
function sqlEstados(f: Filtros): string {
  return `
    WITH base AS (${baseEstablecimientoDia(f)})
    SELECT estado_familia, estado_norm, COUNT(*) AS n
    FROM base GROUP BY estado_familia, estado_norm ORDER BY n DESC
  `;
}

const COLOR_FAMILIA: Record<string, string> = {
  // Colores de estado (no de serie): el significado es bueno/regular/malo.
  'Con respuesta': 'var(--estado-bien)',
  'Sin respuesta': 'var(--estado-aviso)',
  'Fuera de operación': 'var(--ink-3)',
  'Sin gestión': 'var(--linea-fuerte)',
  'Sin clasificar': 'var(--estado-serio)',
};

export function Calidad() {
  const { filtros, dispatch, meta, etiquetaCategoria } = useApp();

  const cobertura = useConsulta<Record<string, number | string | boolean | null>>(sqlCobertura(filtros), [filtros]);
  const respuesta = useConsulta<Record<string, number | null>>(sqlRespuestaDiaria(filtros), [filtros]);
  const estados = useConsulta<Record<string, number | string>>(sqlEstados(filtros), [filtros]);
  const bandera = useConsulta<Record<string, number>>(sqlBanderaIncompleta(filtros), [filtros]);
  const porCategoria = useConsulta<Record<string, number | string | null>>(sqlPorCategoria(filtros), [filtros]);

  // ---- Matriz de cobertura ----------------------------------------------
  const fechas = useMemo(() => {
    const s = new Set<string>();
    for (const r of cobertura.datos) s.add(iso(aFecha(r.fecha)));
    return Array.from(s).sort();
  }, [cobertura.datos]);

  const indicePorFecha = useMemo(() => new Map(fechas.map((f, i) => [f, i])), [fechas]);

  const ordenCategorias = useMemo(() => {
    const orden = new Map((meta?.categorias ?? []).map((c) => [c.nombre, c.orden]));
    const s = new Set(cobertura.datos.map((r) => r.categoria as string));
    return Array.from(s).sort((a, b) => (orden.get(a) ?? 99) - (orden.get(b) ?? 99));
  }, [cobertura.datos, meta]);

  const celdas = useMemo<CeldaCobertura[]>(
    () =>
      cobertura.datos.map((r) => {
        const f = aFecha(r.fecha);
        const cumple = Boolean(r.cumple_minimo);
        const tiene = Boolean(r.tiene_dato);
        return {
          fila: r.categoria as string,
          indice: indicePorFecha.get(iso(f)) ?? 0,
          estado: cumple ? 'publicable' : tiene ? 'con_dato' : 'sin_dato',
          titulo: fechaLarga(f),
          detalle: [
            {
              etiqueta: 'Respuestas',
              valor: `${num(r.n_relevados as number)} de ${num(r.n_establecimientos as number)}`,
            },
            { etiqueta: 'Mínimo requerido', valor: num(r.minimo_requerido as number) },
            ...(cumple
              ? [{ etiqueta: 'Estado', valor: 'Publicable' }]
              : [
                  {
                    etiqueta: 'Faltan',
                    valor: `${num(r.faltan_para_minimo as number)} respuestas para publicar`,
                  },
                ]),
          ],
        };
      }),
    [cobertura.datos, indicePorFecha],
  );

  const marcasMes = useMemo(() => {
    const out: Array<{ indice: number; texto: string }> = [];
    let ultimo = -1;
    fechas.forEach((f, i) => {
      const mes = Number(f.slice(5, 7));
      if (mes !== ultimo) {
        ultimo = mes;
        out.push({ indice: i, texto: MESES_ABBR[mes - 1] });
      }
    });
    return out;
  }, [fechas]);

  // ---- Serie de tasa de respuesta ---------------------------------------
  const puntosRespuesta = useMemo<PuntoSerie[]>(() => {
    const base = respuesta.datos.map((d) => ({
      fecha: aFecha(d.fecha),
      tasa: d.tasa as number | null,
      marcada: d.tasa_marcada as number | null,
    }));
    const suave = mediaMovil(base.map((b) => b.tasa), 7);
    return base.map((b, i) => ({ ...b, tendencia: suave[i] }));
  }, [respuesta.datos]);

  // ---- Ranking de cobertura por categoría -------------------------------
  const filasCobertura = useMemo(
    () =>
      porCategoria.datos
        .map((c) => ({
          clave: c.categoria as string,
          etiqueta: etiquetaCategoria(c.categoria as string),
          valor: c.dias ? (c.dias_publicables as number) / (c.dias as number) : null,
          referencia: c.dias ? (c.dias_con_dato as number) / (c.dias as number) : null,
          etiquetaReferencia: 'Días con alguna respuesta',
          nota: `Mínimo requerido: ${num(c.minimo_requerido as number)} de ${num(
            c.establecimientos as number,
          )} establecimientos`,
        }))
        .sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1)),
    [porCategoria.datos, etiquetaCategoria],
  );

  // ---- Composición de estados -------------------------------------------
  const familias = useMemo(() => {
    const acumulado = new Map<string, number>();
    for (const e of estados.datos) {
      const fam = e.estado_familia as string;
      acumulado.set(fam, (acumulado.get(fam) ?? 0) + (e.n as number));
    }
    const orden = meta?.orden_familia_estado ?? Array.from(acumulado.keys());
    return orden
      .filter((f) => acumulado.has(f))
      .map((f) => ({
        clave: f,
        etiqueta: f,
        valor: acumulado.get(f)!,
        color: COLOR_FAMILIA[f] ?? 'var(--ink-3)',
      }));
  }, [estados.datos, meta]);

  const kpis = useMemo<DatosKpi[]>(() => {
    const totalCeldas = cobertura.datos.length || 1;
    const publicables = cobertura.datos.filter((r) => r.cumple_minimo).length;
    const conDato = cobertura.datos.filter((r) => r.tiene_dato).length;
    const objetivo = meta?.parametros.metas?.cobertura_relevamiento_objetivo ?? null;
    const tasaMedia =
      respuesta.datos.length > 0
        ? respuesta.datos.reduce((a, d) => a + ((d.tasa as number) ?? 0), 0) / respuesta.datos.length
        : null;
    const sinDatoNunca = filasCobertura.filter((f) => (f.valor ?? 0) === 0).length;
    const b = bandera.datos[0];

    return [
      {
        etiqueta: 'Celdas publicables',
        valor: pct(publicables / totalCeldas, 1),
        contexto: `${num(publicables)} de ${num(totalCeldas)} pares categoría-día`,
      },
      {
        etiqueta: 'Con algún dato',
        valor: pct(conDato / totalCeldas, 1),
        contexto: 'Al menos una respuesta ese día',
      },
      {
        etiqueta: 'Tasa de respuesta media',
        valor: pct(tasaMedia, 1),
        contexto: objetivo ? `Meta ${pct(objetivo)}` : undefined,
        delta:
          tasaMedia !== null && objetivo
            ? { texto: `${pp(tasaMedia - objetivo)} vs. meta`, sentido: tasaMedia >= objetivo ? 'bueno' : 'malo' }
            : undefined,
      },
      {
        etiqueta: 'Categorías sin publicar nunca',
        valor: num(sinDatoNunca),
        contexto: 'En el recorte seleccionado',
        alerta:
          sinDatoNunca > 0
            ? `${filasCobertura
                .filter((f) => (f.valor ?? 0) === 0)
                .map((f) => f.etiqueta)
                .join(', ')}: no alcanzan el mínimo ningún día.`
            : undefined,
      },
      {
        etiqueta: 'Bandera «Relevado» incompleta',
        valor: num(b?.casos ?? null),
        contexto: b?.con_dato
          ? `${pct(b.casos / b.con_dato, 1)} de los registros con dato`
          : 'Ocupación cargada con la bandera en «No»',
        alerta:
          b?.establecimientos
            ? `Afecta a ${num(b.establecimientos)} establecimientos: el ETL los cuenta igual, pero la planilla los subestima.`
            : undefined,
      },
      {
        etiqueta: 'Estados sin clasificar',
        valor: num(meta?.calidad.estados_sin_clasificar.length ?? 0),
        contexto: 'Variantes de texto libre a normalizar',
      },
    ];
  }, [cobertura.datos, respuesta.datos, filasCobertura, bandera.datos, meta]);

  const sinClasificar = meta?.calidad.estados_sin_clasificar ?? [];

  return (
    <>
      <EncabezadoSeccion
        titulo="Calidad del dato"
        bajada="De qué está hecho cada porcentaje publicado: cuántos establecimientos respondieron, qué días alcanzan el mínimo muestral y dónde el relevamiento se está quedando corto."
      />

      <FilaKpis items={kpis} cargando={cobertura.cargando} />

      <Aviso tono="aviso" titulo="La regla del mínimo muestral">
        Cada categoría necesita una cantidad mínima de establecimientos con respuesta para que su ocupación se
        considere publicable. Cuando no se alcanza, el indicador <em>no es cero</em>: no existe. El tablero lo
        muestra como hueco, nunca como valor. Los mínimos por categoría se configuran en{' '}
        <code>etl/config/categorias.json</code>.
      </Aviso>

      <Grilla>
        <Tarjeta
          titulo="Cobertura del relevamiento, día por día"
          bajada="Una franja por categoría, un píxel por día. Verde: alcanzó el mínimo. Ámbar: hubo respuestas pero no alcanzaron. Gris: nadie respondió."
          ancho="completo"
          recargando={cobertura.recargando}
          nota="Las franjas mayormente grises marcan categorías que hoy no se pueden publicar: son el objetivo natural de una campaña de relevamiento."
          tabla={{
            columnas: ['Categoría', 'Días publicables', 'Días con dato', 'Días totales', 'Mínimo requerido'],
            filas: porCategoria.datos.map((c) => [
              etiquetaCategoria(c.categoria as string),
              num(c.dias_publicables as number),
              num(c.dias_con_dato as number),
              num(c.dias as number),
              num(c.minimo_requerido as number),
            ]),
          }}
        >
          <MatrizCobertura
            celdas={celdas}
            filas={ordenCategorias}
            totalColumnas={fechas.length}
            etiqueta="Cobertura del relevamiento por categoría y día"
            etiquetaFila={etiquetaCategoria}
            etiquetaColumna={(i) => fechas[i] ?? ''}
            filasSeleccionadas={filtros.categorias}
            onClickFila={(categoria) => dispatch({ tipo: 'alternarCategoria', categoria })}
            marcasColumna={marcasMes}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Días publicables por categoría"
          bajada="Barra: proporción de días que alcanzan el mínimo. Marca vertical: días con alguna respuesta."
          ancho="medio"
          recargando={porCategoria.recargando}
          nota="La distancia entre la barra y la marca es el esfuerzo que falta: son días donde ya hay gestión, pero no alcanza para publicar."
          tabla={{
            columnas: ['Categoría', 'Días publicables', 'Días con dato'],
            filas: filasCobertura.map((f) => [f.etiqueta, pct(f.valor, 1), pct(f.referencia, 1)]),
          }}
        >
          <BarrasHorizontales
            filas={filasCobertura}
            etiqueta="Proporción de días publicables por categoría"
            formatoValor={(v) => pct(v, 1)}
            formatoEje={(v) => pct(v)}
            seleccionadas={filtros.categorias}
            onClickFila={(categoria) => dispatch({ tipo: 'alternarCategoria', categoria })}
            maxDominio={1}
            color="var(--estado-bien)"
          />
        </Tarjeta>

        <Tarjeta
          titulo="Tasa de respuesta en el tiempo"
          bajada="Proporción del panel que respondió cada día, con tendencia de 7 días."
          ancho="medio"
          recargando={respuesta.recargando}
          nota="Las caídas sostenidas explican los huecos de las series de ocupación."
          tabla={{
            columnas: ['Fecha', 'Tasa de respuesta', 'Categorías publicables'],
            filas: respuesta.datos.map((d) => [
              iso(aFecha(d.fecha)),
              pct(d.tasa as number, 1),
              num(d.categorias_publicables as number),
            ]),
          }}
        >
          <SerieTemporal
            datos={puntosRespuesta}
            etiqueta="Tasa de respuesta diaria"
            recargando={respuesta.recargando}
            series={[
              { clave: 'tasa', etiqueta: 'Respuesta diaria', color: 'var(--serie-1)', tipo: 'area' },
              { clave: 'tendencia', etiqueta: 'Tendencia (7 días)', color: 'var(--serie-2)', tipo: 'referencia', etiquetarFin: true },
            ]}
            formatoY={(v) => pct(v)}
            formatoValor={(v) => pct(v, 1)}
            referencia={
              meta?.parametros.metas?.cobertura_relevamiento_objetivo
                ? {
                    valor: meta.parametros.metas.cobertura_relevamiento_objetivo,
                    etiqueta: `Meta ${pct(meta.parametros.metas.cobertura_relevamiento_objetivo)}`,
                  }
                : undefined
            }
            onSeleccionRango={(desde, hasta) => dispatch({ tipo: 'rango', desde, hasta })}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Resultado de la gestión de relevamiento"
          bajada="Qué pasó con cada intento de contacto, según el campo «Estado» de la planilla ya normalizado."
          ancho="completo"
          recargando={estados.recargando}
          nota={
            sinClasificar.length > 0 ? (
              <>
                Hay <strong>{sinClasificar.length}</strong> variantes de texto que ninguna regla captura todavía
                (las más frecuentes: {sinClasificar.slice(0, 4).map((e) => `«${e.valor}»`).join(', ')}). Se
                amplían en <code>etl/oit/normalize.py</code>.
              </>
            ) : (
              'Todas las anotaciones de la planilla quedaron clasificadas.'
            )
          }
          tabla={{
            columnas: ['Familia', 'Estado', 'Registros'],
            filas: estados.datos.map((e) => [
              e.estado_familia as string,
              e.estado_norm as string,
              num(e.n as number),
            ]),
          }}
        >
          <BarraApilada
            segmentos={familias}
            formatoValor={(v) => num(v)}
            alto={40}
          />
        </Tarjeta>
      </Grilla>
    </>
  );
}
