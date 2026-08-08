/** Demanda y derrame: de las plazas ocupadas a los turistas y al gasto. */

import { useMemo, useState } from 'react';
import { BarrasHorizontales } from '../charts/categoricas';
import { PequenosMultiples } from '../charts/distribucion';
import { SerieTemporal, type PuntoSerie } from '../charts/temporales';
import { Aviso, EncabezadoSeccion, FilaKpis, Grilla, Segmentado, Tarjeta, type DatosKpi } from '../components/ui';
import { baseCategoriaDia } from '../db/consultas';
import { useConsulta } from '../hooks/useConsulta';
import { MESES, MESES_ABBR, moneda, num, numCorto, pct } from '../lib/formato';
import { useApp } from '../state/app';
import type { Filtros } from '../state/filtros';

type Vista = 'mes' | 'quincena';

/**
 * Demanda por período.
 *
 * Se calculan dos lecturas del mismo indicador:
 *  · observada  = suma de las plazas ocupadas de los días efectivamente medidos;
 *  · proyectada = esa tasa aplicada a **todas** las plazas-noche del período.
 * La brecha entre ambas es la incertidumbre que introduce la falta de cobertura.
 */
function sqlDemanda(f: Filtros, porQuincena: boolean): string {
  const grupo = porQuincena ? 'mes, quincena' : 'mes';
  return `
    WITH base AS (${baseCategoriaDia(f)}),
    dia AS (
      SELECT fecha, ${grupo},
             SUM(pax_ocupada_ext) AS pax_ocupada,
             SUM(CASE WHEN tiene_dato THEN pax_trabajando END) AS pax_trab_medido,
             SUM(pax_trabajando) AS pax_trab_total,
             SUM(CASE WHEN tiene_dato THEN uf_trabajando END) AS uf_trab_medido,
             SUM(uf_ocupada_ext) AS uf_ocupada,
             MAX(CASE WHEN cumple_minimo THEN 1 ELSE 0 END) AS publicable
      FROM base GROUP BY fecha, ${grupo}
    )
    SELECT ${grupo},
           COUNT(*) AS dias,
           SUM(publicable) AS dias_publicables,
           SUM(pax_ocupada) AS pernoctes_observados,
           SUM(pax_ocupada) / NULLIF(SUM(pax_trab_medido), 0) AS pct_pax,
           SUM(uf_ocupada)  / NULLIF(SUM(uf_trab_medido), 0)  AS pct_uf,
           SUM(pax_trab_total) AS plazas_noche
    FROM dia
    GROUP BY ${grupo}
    ORDER BY ${grupo}
  `;
}

/** Valores que ya publica la planilla, para contrastar. */
const SQL_DECLARADO = `
  SELECT mes, mes_nombre, estadia_promedio, estadia_declarada,
         turistas_declarados_total, pernoctes_declarados_total, informes_declarados_total,
         pernoctes_proyectados, turistas_proyectados, derrame_estimado, cobertura_dias
  FROM fact_mes ORDER BY mes
`;

export function Demanda() {
  const { filtros, dispatch, meta } = useApp();
  const [vista, setVista] = useState<Vista>('mes');

  const demanda = useConsulta<Record<string, number | null>>(sqlDemanda(filtros, vista === 'quincena'), [
    filtros,
    vista,
  ]);
  const declarado = useConsulta<Record<string, number | string | null>>(SQL_DECLARADO, []);

  const derrame = meta?.parametros.derrame;
  const estadiaDefecto = meta?.parametros.reglas?.estadia_promedio_defecto ?? 3;

  const estadiaPorMes = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of declarado.datos) {
      const v = (d.estadia_declarada ?? d.estadia_promedio) as number | null;
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) m.set(Number(d.mes), v);
    }
    return m;
  }, [declarado.datos]);

  // ---- Series derivadas --------------------------------------------------
  const filas = useMemo(() => {
    return demanda.datos.map((d) => {
      const mes = Number(d.mes);
      const estadia = estadiaPorMes.get(mes) ?? estadiaDefecto;
      const observados = (d.pernoctes_observados as number) ?? null;
      const tasa = (d.pct_pax as number) ?? null;
      const plazasNoche = (d.plazas_noche as number) ?? null;
      const proyectados = tasa !== null && plazasNoche !== null ? tasa * plazasNoche : null;
      return {
        mes,
        quincena: d.quincena !== undefined ? Number(d.quincena) : null,
        etiqueta:
          vista === 'quincena'
            ? `${MESES_ABBR[mes - 1]} ${Number(d.quincena)}ª`
            : MESES[mes - 1],
        dias: d.dias as number,
        diasPublicables: d.dias_publicables as number,
        cobertura: d.dias ? (d.dias_publicables as number) / (d.dias as number) : null,
        pctPax: tasa,
        pernoctesObservados: observados,
        pernoctesProyectados: proyectados,
        turistasProyectados: proyectados !== null ? proyectados / estadia : null,
        turistasObservados: observados !== null ? observados / estadia : null,
        estadia,
        derrame: proyectados !== null && derrame?.habilitado ? proyectados * derrame.gasto_diario_por_turista : null,
      };
    });
  }, [demanda.datos, estadiaPorMes, estadiaDefecto, vista, derrame]);

  const totales = useMemo(() => {
    const suma = (sel: (f: (typeof filas)[number]) => number | null) =>
      filas.reduce((a, f) => a + (sel(f) ?? 0), 0);
    return {
      observados: suma((f) => f.pernoctesObservados),
      proyectados: suma((f) => f.pernoctesProyectados),
      turistas: suma((f) => f.turistasProyectados),
      derrame: suma((f) => f.derrame),
      diasPublicables: suma((f) => f.diasPublicables),
      dias: suma((f) => f.dias),
    };
  }, [filas]);

  const declaradoTotal = useMemo(() => {
    const mesesEnRecorte = new Set(filas.map((f) => f.mes));
    return declarado.datos
      .filter((d) => mesesEnRecorte.has(Number(d.mes)))
      .reduce<{ pernoctes: number; turistas: number; informes: number }>(
        (acc, d) => ({
          pernoctes: acc.pernoctes + (Number(d.pernoctes_declarados_total) || 0),
          turistas: acc.turistas + (Number(d.turistas_declarados_total) || 0),
          informes: acc.informes + (Number(d.informes_declarados_total) || 0),
        }),
        { pernoctes: 0, turistas: 0, informes: 0 },
      );
  }, [declarado.datos, filas]);

  const kpis = useMemo<DatosKpi[]>(() => {
    const brecha =
      totales.proyectados > 0 ? (totales.proyectados - totales.observados) / totales.proyectados : null;
    return [
      {
        etiqueta: 'Pernoctes medidos',
        valor: numCorto(totales.observados),
        contexto: `Días con dato: ${num(totales.diasPublicables)} de ${num(totales.dias)}`,
      },
      {
        etiqueta: 'Pernoctes proyectados',
        valor: numCorto(totales.proyectados),
        contexto: 'Tasa observada aplicada al período completo',
        alerta:
          brecha !== null && brecha > 0.3
            ? `${pct(brecha)} del total proyectado corresponde a días sin medición.`
            : undefined,
      },
      {
        etiqueta: 'Turistas estimados',
        valor: numCorto(totales.turistas),
        contexto: 'Pernoctes ÷ estadía promedio',
      },
      {
        etiqueta: 'Publicado en planilla',
        valor: numCorto(declaradoTotal.pernoctes || null),
        contexto: 'Pernoctes según la serie oficial vigente',
      },
      ...(derrame?.habilitado
        ? [
            {
              etiqueta: 'Derrame estimado',
              valor: moneda(totales.derrame),
              contexto: `${moneda(derrame.gasto_diario_por_turista)} por turista y noche`,
              alerta: 'Estimación paramétrica: el gasto medio se configura en el ETL.',
            } as DatosKpi,
          ]
        : []),
      {
        etiqueta: 'Pasajeros en oficina',
        valor: numCorto(declaradoTotal.informes || null),
        contexto: 'Atendidos en la oficina de informes',
      },
    ];
  }, [totales, declaradoTotal, derrame]);

  // ---- Serie de pernoctes: observado vs proyectado -----------------------
  const puntosSerie = useMemo<PuntoSerie[]>(
    () =>
      filas.map((f) => ({
        fecha: new Date(Date.UTC(meta?.periodo.anio ?? 2026, f.mes - 1, f.quincena === 2 ? 20 : 5)),
        observados: f.pernoctesObservados,
        proyectados: f.pernoctesProyectados,
      })),
    [filas, meta],
  );

  const filasEstadia = useMemo(
    () =>
      declarado.datos
        .filter((d) => filas.some((f) => f.mes === Number(d.mes)))
        .map((d) => ({
          clave: String(d.mes),
          etiqueta: MESES[Number(d.mes) - 1],
          valor: (d.estadia_declarada ?? d.estadia_promedio) as number | null,
          nota: 'Noches promedio por turista',
        })),
    [declarado.datos, filas],
  );

  const panelesCobertura = useMemo(
    () => [
      {
        clave: 'cobertura',
        etiqueta: 'Cobertura mensual',
        valores: filas.map((f) => f.cobertura),
        resumen: pct(totales.dias ? totales.diasPublicables / totales.dias : null),
      },
      {
        clave: 'ocupacion',
        etiqueta: 'Ocupación de plazas',
        valores: filas.map((f) => f.pctPax),
        // Media ponderada por plazas-noche medidas, nunca un promedio de porcentajes.
        resumen: (() => {
          const medidas = filas.reduce(
            (a, f) => a + (f.pctPax ? (f.pernoctesObservados ?? 0) / f.pctPax : 0),
            0,
          );
          return pct(medidas > 0 ? totales.observados / medidas : null);
        })(),
      },
      {
        clave: 'estadia',
        etiqueta: 'Estadía promedio',
        valores: filas.map((f) => f.estadia),
        resumen: `${num(filas.length ? filas.reduce((a, f) => a + f.estadia, 0) / filas.length : null, 1)} n`,
      },
    ],
    [filas, totales],
  );

  return (
    <>
      <EncabezadoSeccion
        titulo="Demanda y derrame"
        bajada="Pernoctes, turistas y gasto estimado. Cada indicador se muestra en su versión medida y en su versión proyectada al período completo, porque la diferencia entre las dos es información de gestión."
        acciones={
          <Segmentado<Vista>
            etiqueta="Agregación"
            valor={vista}
            onChange={setVista}
            opciones={[
              { valor: 'mes', etiqueta: 'Por mes' },
              { valor: 'quincena', etiqueta: 'Por quincena' },
            ]}
          />
        }
      />

      <FilaKpis items={kpis} cargando={demanda.cargando} />

      <Aviso tono="info" titulo="Cómo leer estos números">
        Los <strong>pernoctes medidos</strong> suman únicamente los días con relevamiento. Los{' '}
        <strong>proyectados</strong> aplican la tasa observada al total de plazas-noche del período, incluidos
        los días sin medición. Ninguno de los dos es «el» número: el primero subestima, el segundo asume que
        los días no medidos se comportaron como los medidos. La franja entre ambos es el margen real de
        incertidumbre.
      </Aviso>

      <Grilla>
        <Tarjeta
          titulo="Pernoctes por período"
          bajada="Medidos y proyectados, en la misma escala."
          ancho="dos-tercios"
          recargando={demanda.recargando}
          nota="La separación entre las dos líneas crece cuando cae la cobertura del relevamiento."
          tabla={{
            columnas: ['Período', 'Pernoctes medidos', 'Pernoctes proyectados', 'Turistas estimados', 'Cobertura'],
            filas: filas.map((f) => [
              f.etiqueta,
              num(f.pernoctesObservados),
              num(f.pernoctesProyectados),
              num(f.turistasProyectados),
              pct(f.cobertura, 1),
            ]),
          }}
        >
          <SerieTemporal
            datos={puntosSerie}
            etiqueta="Pernoctes por período"
            recargando={demanda.recargando}
            series={[
              { clave: 'proyectados', etiqueta: 'Proyectados al período', color: 'var(--serie-2)', tipo: 'area', etiquetarFin: true },
              { clave: 'observados', etiqueta: 'Medidos', color: 'var(--serie-1)', tipo: 'linea', etiquetarFin: true },
            ]}
            formatoY={(v) => numCorto(v)}
            formatoValor={(v) => num(v)}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Estadía promedio"
          bajada="Noches por turista, según el relevamiento de la oficina de informes."
          ancho="tercio"
          recargando={declarado.recargando}
          nota="Es el divisor que convierte pernoctes en turistas: si mejora su medición, mejoran todas las estimaciones de demanda."
          tabla={{
            columnas: ['Mes', 'Estadía (noches)'],
            filas: filasEstadia.map((f) => [f.etiqueta, num(f.valor, 1)]),
          }}
        >
          <BarrasHorizontales
            filas={filasEstadia}
            etiqueta="Estadía promedio por mes"
            formatoValor={(v) => `${num(v, 1)} n`}
            seleccionadas={filtros.meses.map(String)}
            onClickFila={(c) => dispatch({ tipo: 'alternarMes', mes: Number(c) })}
            altoFila={24}
            color="var(--serie-3)"
          />
        </Tarjeta>

        <Tarjeta
          titulo="Indicadores en el tiempo"
          bajada="Tres lecturas complementarias en escala propia: cobertura, ocupación y estadía."
          ancho="completo"
          recargando={demanda.recargando}
          nota="Cada panel usa su propia escala porque miden cosas distintas; el eje horizontal es común."
        >
          <PequenosMultiples
            paneles={panelesCobertura}
            etiquetasX={filas.map((f) => f.etiqueta)}
            etiqueta="Indicadores de demanda en el tiempo"
            formatoValor={(v) => num(v, 2)}
            columnas={3}
            dominioComun={false}
          />
        </Tarjeta>

        {derrame?.habilitado && (
          <Tarjeta
            titulo="Derrame económico estimado"
            bajada={`Pernoctes proyectados × ${moneda(derrame.gasto_diario_por_turista)} de gasto diario por turista.`}
            ancho="completo"
            recargando={demanda.recargando}
            nota={derrame.nota}
            tabla={{
              columnas: ['Período', 'Pernoctes proyectados', 'Derrame estimado'],
              filas: filas.map((f) => [f.etiqueta, num(f.pernoctesProyectados), moneda(f.derrame)]),
            }}
          >
            <BarrasHorizontales
              filas={filas.map((f) => ({
                clave: String(f.mes),
                etiqueta: f.etiqueta,
                valor: f.derrame,
                nota: `${num(f.pernoctesProyectados)} pernoctes proyectados`,
              }))}
              etiqueta="Derrame económico estimado"
              formatoValor={(v) => moneda(v)}
              formatoEje={(v) => moneda(v)}
              seleccionadas={filtros.meses.map(String)}
              onClickFila={(c) => dispatch({ tipo: 'alternarMes', mes: Number(c) })}
              color="var(--serie-2)"
            />
          </Tarjeta>
        )}
      </Grilla>
    </>
  );
}
