/** Estacionalidad: cuándo se llena el destino y cuánto pesa el calendario. */

import { useMemo, useState } from 'react';
import { BarrasHorizontales, Pendiente } from '../charts/categoricas';
import { CajasYBigotes, calcularCaja, type Caja } from '../charts/distribucion';
import { EncabezadoSeccion, Grilla, Segmentado, Tarjeta } from '../components/ui';
import { baseCategoriaDia, EXPR_PCT_PAX, EXPR_PCT_UF, sqlPorDimension, sqlSerieDiaria } from '../db/consultas';
import { useConsulta } from '../hooks/useConsulta';
import { aFecha, DIAS, MESES, num, numCorto, pct, pp } from '../lib/formato';
import { useApp } from '../state/app';
import type { Filtros } from '../state/filtros';

type Medida = 'uf' | 'pax';

/** Ocupación por (mes × quincena), para el gráfico de pendiente. */
function sqlQuincenas(f: Filtros): string {
  return `
    WITH base AS (${baseCategoriaDia(f)})
    SELECT mes, any_value(mes_nombre) AS mes_nombre, quincena,
           ${EXPR_PCT_UF} AS pct_uf, ${EXPR_PCT_PAX} AS pct_pax
    FROM base GROUP BY mes, quincena ORDER BY mes, quincena
  `;
}

/** Comparación de cada evento contra su propio mes: aísla el efecto calendario. */
function sqlEventos(f: Filtros): string {
  return `
    WITH base AS (${baseCategoriaDia(f)}),
    evento AS (
      SELECT evento_nombre, any_value(mes) AS mes,
             ${EXPR_PCT_UF} AS pct_uf, ${EXPR_PCT_PAX} AS pct_pax,
             COUNT(DISTINCT fecha) AS dias
      FROM base WHERE evento_nombre IS NOT NULL GROUP BY evento_nombre
    ),
    mes_base AS (
      SELECT mes, ${EXPR_PCT_UF} AS pct_uf_mes, ${EXPR_PCT_PAX} AS pct_pax_mes
      FROM base GROUP BY mes
    )
    SELECT e.evento_nombre, e.mes, e.dias, e.pct_uf, e.pct_pax, m.pct_uf_mes, m.pct_pax_mes
    FROM evento e LEFT JOIN mes_base m USING (mes)
    ORDER BY e.mes
  `;
}

export function Estacionalidad() {
  const { filtros, dispatch } = useApp();
  const [medida, setMedida] = useState<Medida>('uf');
  const campo = medida === 'uf' ? 'pct_uf' : 'pct_pax';

  const porMes = useConsulta<Record<string, number | string | null>>(
    sqlPorDimension(filtros, 'mes', 'any_value(mes_nombre) AS mes_nombre'),
    [filtros],
  );
  const porDow = useConsulta<Record<string, number | string | null>>(
    sqlPorDimension(filtros, 'dow', 'any_value(dow_nombre) AS dow_nombre'),
    [filtros],
  );
  const porTemporada = useConsulta<Record<string, number | string | null>>(
    sqlPorDimension(filtros, 'temporada'),
    [filtros],
  );
  const quincenas = useConsulta<Record<string, number | string | null>>(sqlQuincenas(filtros), [filtros]);
  const eventos = useConsulta<Record<string, number | string | null>>(sqlEventos(filtros), [filtros]);
  const serie = useConsulta<Record<string, number | string | null>>(sqlSerieDiaria(filtros), [filtros]);

  // ---- Distribución diaria por mes (caja y bigotes) ----------------------
  const cajas = useMemo<Caja[]>(() => {
    const porGrupo = new Map<number, number[]>();
    for (const d of serie.datos) {
      const v = d[campo];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const mes = aFecha(d.fecha).getUTCMonth() + 1;
      if (!porGrupo.has(mes)) porGrupo.set(mes, []);
      porGrupo.get(mes)!.push(v);
    }
    return Array.from(porGrupo.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([mes, vals]) => calcularCaja(String(mes), MESES[mes - 1].slice(0, 3), vals))
      .filter((c): c is Caja => c !== null);
  }, [serie.datos, campo]);

  const filasDow = useMemo(
    () =>
      porDow.datos
        .map((d) => ({
          clave: String(d.clave),
          etiqueta: DIAS[Number(d.clave)],
          valor: typeof d[campo] === 'number' ? (d[campo] as number) : null,
          nota: `${num(d.dias as number)} días en el recorte`,
        }))
        .sort((a, b) => Number(a.clave) - Number(b.clave)),
    [porDow.datos, campo],
  );

  const filasMes = useMemo(
    () =>
      porMes.datos.map((d) => ({
        clave: String(d.clave),
        etiqueta: MESES[Number(d.clave) - 1],
        valor: typeof d[campo] === 'number' ? (d[campo] as number) : null,
        nota: `${num(d.dias_publicables as number)} de ${num(d.dias as number)} días publicables`,
      })),
    [porMes.datos, campo],
  );

  const filasQuincena = useMemo(() => {
    const porMesMap = new Map<number, { a: number | null; b: number | null; nombre: string }>();
    for (const q of quincenas.datos) {
      const mes = Number(q.mes);
      const v = typeof q[campo] === 'number' ? (q[campo] as number) : null;
      const actual = porMesMap.get(mes) ?? { a: null, b: null, nombre: String(q.mes_nombre) };
      if (Number(q.quincena) === 1) actual.a = v;
      else actual.b = v;
      porMesMap.set(mes, actual);
    }
    return Array.from(porMesMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([mes, v]) => ({ clave: String(mes), etiqueta: v.nombre, a: v.a, b: v.b }));
  }, [quincenas.datos, campo]);

  const filasEventos = useMemo(
    () =>
      eventos.datos
        .map((e) => {
          const valor = typeof e[campo] === 'number' ? (e[campo] as number) : null;
          const base = typeof e[`${campo}_mes`] === 'number' ? (e[`${campo}_mes`] as number) : null;
          return {
            clave: String(e.evento_nombre),
            etiqueta: String(e.evento_nombre),
            valor,
            referencia: base,
            etiquetaReferencia: 'Promedio del mes',
            nota:
              valor !== null && base !== null
                ? `${pp(valor - base)} respecto del promedio de ${MESES[Number(e.mes) - 1]}`
                : 'Sin dato publicable en la ventana del evento',
          };
        })
        .sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1)),
    [eventos.datos, campo],
  );

  const filasTemporada = useMemo(
    () =>
      porTemporada.datos.map((t) => ({
        clave: String(t.clave),
        etiqueta: `Temporada ${String(t.clave).toLowerCase()}`,
        valor: typeof t[campo] === 'number' ? (t[campo] as number) : null,
        nota: `${num(t.dias as number)} días · ${numCorto(t.pernoctes as number)} pernoctes`,
      })),
    [porTemporada.datos, campo],
  );

  return (
    <>
      <EncabezadoSeccion
        titulo="Estacionalidad y calendario"
        bajada="Cómo se distribuye la demanda a lo largo del año, de la semana y de cada quincena, y cuánto mueve realmente un fin de semana largo."
        acciones={
          <Segmentado<Medida>
            etiqueta="Medida"
            valor={medida}
            onChange={setMedida}
            opciones={[
              { valor: 'uf', etiqueta: 'Unidades' },
              { valor: 'pax', etiqueta: 'Plazas' },
            ]}
          />
        }
      />

      <Grilla>
        <Tarjeta
          titulo="Dispersión diaria dentro de cada mes"
          bajada="La caja cubre la mitad central de los días; la línea gruesa es la mediana. Un mes con caja alta no es lo mismo que un mes con un pico aislado."
          ancho="dos-tercios"
          recargando={serie.recargando}
          nota="Se calcula solo con días que tienen ocupación publicable, por eso algunos meses tienen menos casos que días."
          tabla={{
            columnas: ['Mes', 'Mínimo', 'Cuartil 1', 'Mediana', 'Cuartil 3', 'Máximo', 'Días'],
            filas: cajas.map((c) => [
              c.etiqueta,
              pct(c.min, 1),
              pct(c.q1, 1),
              pct(c.mediana, 1),
              pct(c.q3, 1),
              pct(c.max, 1),
              c.n,
            ]),
          }}
        >
          <CajasYBigotes
            cajas={cajas}
            etiqueta="Dispersión diaria por mes"
            formatoValor={(v) => pct(v, 1)}
            formatoEje={(v) => pct(v)}
            seleccionadas={filtros.meses.map(String)}
            onClickCaja={(clave) => dispatch({ tipo: 'alternarMes', mes: Number(clave) })}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Perfil semanal"
          bajada="Ocupación media por día de la semana. Clic para aislar un día."
          ancho="tercio"
          recargando={porDow.recargando}
          tabla={{
            columnas: ['Día', 'Ocupación', 'Días'],
            filas: porDow.datos.map((d) => [
              DIAS[Number(d.clave)],
              pct(d[campo] as number, 1),
              num(d.dias as number),
            ]),
          }}
        >
          <BarrasHorizontales
            filas={filasDow}
            etiqueta="Ocupación por día de la semana"
            formatoValor={(v) => pct(v, 1)}
            seleccionadas={filtros.dow.map(String)}
            onClickFila={(c) => dispatch({ tipo: 'alternarDow', dow: Number(c) })}
            altoFila={28}
          />
        </Tarjeta>

        <Tarjeta
          titulo="De la primera a la segunda quincena"
          bajada="Cada línea es un mes. Azul: la segunda quincena mejora. Naranja: cae."
          ancho="medio"
          recargando={quincenas.recargando}
          nota="Sirve para decidir dónde poner promociones: los meses que caen en la segunda quincena son los candidatos naturales."
          tabla={{
            columnas: ['Mes', '1ª quincena', '2ª quincena', 'Variación'],
            filas: filasQuincena.map((f) => [
              f.etiqueta,
              pct(f.a, 1),
              pct(f.b, 1),
              f.a !== null && f.b !== null ? pp(f.b - f.a) : '—',
            ]),
          }}
        >
          <Pendiente
            filas={filasQuincena}
            etiquetaA="1ª quincena"
            etiquetaB="2ª quincena"
            etiqueta="Ocupación por quincena"
            formatoValor={(v) => pct(v, 1)}
            seleccionadas={filtros.meses.map(String)}
            onClickFila={(c) => dispatch({ tipo: 'alternarMes', mes: Number(c) })}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Fines de semana largos y feriados"
          bajada="Barra: ocupación del evento. Marca vertical: promedio del mes en que cae."
          ancho="medio"
          recargando={eventos.recargando}
          nota="La distancia entre la barra y la marca es el efecto real del feriado, descontando la estacionalidad del mes."
          tabla={{
            columnas: ['Evento', 'Ocupación', 'Promedio del mes', 'Diferencia', 'Días'],
            filas: eventos.datos.map((e) => [
              String(e.evento_nombre),
              pct(e[campo] as number, 1),
              pct(e[`${campo}_mes`] as number, 1),
              typeof e[campo] === 'number' && typeof e[`${campo}_mes`] === 'number'
                ? pp((e[campo] as number) - (e[`${campo}_mes`] as number))
                : '—',
              num(e.dias as number),
            ]),
          }}
        >
          <BarrasHorizontales
            filas={filasEventos}
            etiqueta="Ocupación en fines de semana largos"
            formatoValor={(v) => pct(v, 1)}
            seleccionadas={filtros.eventos}
            onClickFila={(evento) => dispatch({ tipo: 'alternarEvento', evento })}
            altoFila={30}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Ocupación mensual"
          bajada="Clic en un mes para filtrar el tablero."
          ancho="medio"
          recargando={porMes.recargando}
          tabla={{
            columnas: ['Mes', 'Ocupación', 'Pernoctes', 'Días publicables'],
            filas: porMes.datos.map((d) => [
              MESES[Number(d.clave) - 1],
              pct(d[campo] as number, 1),
              numCorto(d.pernoctes as number),
              num(d.dias_publicables as number),
            ]),
          }}
        >
          <BarrasHorizontales
            filas={filasMes}
            etiqueta="Ocupación mensual"
            formatoValor={(v) => pct(v, 1)}
            seleccionadas={filtros.meses.map(String)}
            onClickFila={(c) => dispatch({ tipo: 'alternarMes', mes: Number(c) })}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Por temporada"
          bajada="Agrupación configurable en el ETL (etl/config/calendario.json)."
          ancho="medio"
          recargando={porTemporada.recargando}
          tabla={{
            columnas: ['Temporada', 'Ocupación', 'Días', 'Pernoctes'],
            filas: porTemporada.datos.map((t) => [
              String(t.clave),
              pct(t[campo] as number, 1),
              num(t.dias as number),
              numCorto(t.pernoctes as number),
            ]),
          }}
        >
          <BarrasHorizontales
            filas={filasTemporada}
            etiqueta="Ocupación por temporada"
            formatoValor={(v) => pct(v, 1)}
            seleccionadas={filtros.temporadas}
            onClickFila={(temporada) => dispatch({ tipo: 'alternarTemporada', temporada })}
            altoFila={30}
          />
        </Tarjeta>
      </Grilla>
    </>
  );
}
