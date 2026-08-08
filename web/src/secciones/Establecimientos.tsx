/** Establecimientos: el padrón, su respuesta al relevamiento y su ocupación. */

import { useMemo, useState } from 'react';
import { TiraPuntos } from '../charts/distribucion';
import { EncabezadoSeccion, FilaKpis, Grilla, Segmentado, TablaDatos, Tarjeta, type DatosKpi } from '../components/ui';
import { baseEstablecimientoDia } from '../db/consultas';
import { useConsulta } from '../hooks/useConsulta';
import { num, pct } from '../lib/formato';
import { useApp } from '../state/app';
import type { Filtros } from '../state/filtros';

type Orden = 'respuesta' | 'ocupacion' | 'capacidad';

/**
 * Ficha por establecimiento dentro del recorte activo.
 *
 * Se recalcula sobre el filtro en vez de leer `dim_alojamiento` para que, al
 * elegir un mes o un tipo de día, la tabla responda esa pregunta y no la del
 * año entero.
 */
function sqlEstablecimientos(f: Filtros): string {
  return `
    WITH base AS (${baseEstablecimientoDia(f)})
    SELECT
      alojamiento_clave,
      any_value(alojamiento) AS alojamiento,
      any_value(categoria)   AS categoria,
      COUNT(DISTINCT fecha)  AS dias,
      COUNT(DISTINCT fecha) FILTER (WHERE con_dato)  AS dias_con_dato,
      COUNT(DISTINCT fecha) FILTER (WHERE relevado)  AS dias_marcados,
      COUNT(DISTINCT fecha) FILTER (WHERE opera)     AS dias_operando,
      MEDIAN(capacidad_uf)   AS capacidad_uf,
      MEDIAN(capacidad_pax)  AS capacidad_pax,
      SUM(uf_ocupada)  / NULLIF(SUM(CASE WHEN con_dato THEN uf_disponible  END), 0) AS ocupacion_uf,
      SUM(pax_ocupada) / NULLIF(SUM(CASE WHEN con_dato THEN pax_disponible END), 0) AS ocupacion_pax,
      COUNT(*) FILTER (WHERE estado_norm = 'Completo') AS dias_completo,
      mode(estado_familia) AS estado_dominante
    FROM base
    GROUP BY alojamiento_clave
  `;
}

export function Establecimientos() {
  const { filtros, dispatch, etiquetaCategoria, cortaCategoria, meta } = useApp();
  const [orden, setOrden] = useState<Orden>('respuesta');

  const datos = useConsulta<Record<string, number | string | null>>(sqlEstablecimientos(filtros), [filtros]);

  const fichas = useMemo(
    () =>
      datos.datos.map((d) => ({
        clave: d.alojamiento_clave as string,
        nombre: d.alojamiento as string,
        categoria: d.categoria as string,
        dias: d.dias as number,
        tasaRespuesta: d.dias ? (d.dias_con_dato as number) / (d.dias as number) : 0,
        diasConDato: d.dias_con_dato as number,
        diasMarcados: d.dias_marcados as number,
        capacidadUf: d.capacidad_uf as number,
        capacidadPax: d.capacidad_pax as number,
        ocupacionUf: d.ocupacion_uf as number | null,
        ocupacionPax: d.ocupacion_pax as number | null,
        diasCompleto: d.dias_completo as number,
        estado: (d.estado_dominante as string) ?? '—',
        opera: (d.dias_operando as number) > 0,
      })),
    [datos.datos],
  );

  const ordenadas = useMemo(() => {
    const copia = [...fichas];
    if (orden === 'respuesta') copia.sort((a, b) => b.tasaRespuesta - a.tasaRespuesta);
    if (orden === 'ocupacion') copia.sort((a, b) => (b.ocupacionUf ?? -1) - (a.ocupacionUf ?? -1));
    if (orden === 'capacidad') copia.sort((a, b) => b.capacidadPax - a.capacidadPax);
    return copia;
  }, [fichas, orden]);

  const ordenCategorias = useMemo(() => {
    const ord = new Map((meta?.categorias ?? []).map((c) => [c.nombre, c.orden]));
    const s = new Set(fichas.map((f) => f.categoria));
    return Array.from(s).sort((a, b) => (ord.get(a) ?? 99) - (ord.get(b) ?? 99));
  }, [fichas, meta]);

  const kpis = useMemo<DatosKpi[]>(() => {
    const total = fichas.length;
    const nunca = fichas.filter((f) => f.diasConDato === 0).length;
    const siempre = fichas.filter((f) => f.tasaRespuesta >= 0.8).length;
    const capacidadTotal = fichas.reduce((a, f) => a + (f.capacidadPax || 0), 0);
    const capacidadMuda = fichas
      .filter((f) => f.diasConDato === 0)
      .reduce((a, f) => a + (f.capacidadPax || 0), 0);

    return [
      { etiqueta: 'Establecimientos en el panel', valor: num(total), contexto: 'En el recorte seleccionado' },
      {
        etiqueta: 'Responden habitualmente',
        valor: num(siempre),
        contexto: '80 % de los días o más',
        delta: total ? { texto: pct(siempre / total), sentido: 'neutro' } : undefined,
      },
      {
        etiqueta: 'Nunca respondieron',
        valor: num(nunca),
        contexto: 'Ninguna respuesta en el período',
        alerta:
          capacidadTotal > 0 && capacidadMuda > 0
            ? `Representan ${pct(capacidadMuda / capacidadTotal)} de las plazas del padrón.`
            : undefined,
      },
      {
        etiqueta: 'Plazas sin voz',
        valor: num(capacidadMuda),
        contexto: `De ${num(capacidadTotal)} plazas relevables`,
      },
    ];
  }, [fichas]);

  const puntos = useMemo(
    () =>
      fichas.map((f) => ({
        clave: f.clave,
        etiqueta: f.nombre,
        grupo: f.categoria,
        valor: f.tasaRespuesta,
        tamano: f.capacidadPax || 1,
        detalle: [
          { etiqueta: 'Capacidad', valor: `${num(f.capacidadUf)} UF · ${num(f.capacidadPax)} plazas` },
          { etiqueta: 'Días con dato', valor: `${num(f.diasConDato)} de ${num(f.dias)}` },
          { etiqueta: 'Ocupación media', valor: pct(f.ocupacionUf, 1) },
          { etiqueta: 'Estado dominante', valor: f.estado },
        ],
      })),
    [fichas],
  );

  return (
    <>
      <EncabezadoSeccion
        titulo="Establecimientos"
        bajada="El padrón alojativo visto uno por uno: quién sostiene el relevamiento, quién nunca contesta y cuánta capacidad representa cada grupo."
        acciones={
          <Segmentado<Orden>
            etiqueta="Ordenar por"
            valor={orden}
            onChange={setOrden}
            opciones={[
              { valor: 'respuesta', etiqueta: 'Respuesta' },
              { valor: 'ocupacion', etiqueta: 'Ocupación' },
              { valor: 'capacidad', etiqueta: 'Capacidad' },
            ]}
          />
        }
      />

      <FilaKpis items={kpis} cargando={datos.cargando} />

      <Grilla>
        <Tarjeta
          titulo="Respuesta al relevamiento, establecimiento por establecimiento"
          bajada="Cada punto es un alojamiento; el tamaño es su cantidad de plazas. Hacia la derecha, los que más responden."
          ancho="completo"
          recargando={datos.recargando}
          nota="Los puntos grandes pegados a la izquierda son la prioridad: mucha capacidad y ninguna respuesta. Clic en el nombre de la categoría para filtrar."
        >
          <TiraPuntos
            puntos={puntos}
            grupos={ordenCategorias}
            etiqueta="Tasa de respuesta por establecimiento"
            etiquetaGrupo={cortaCategoria}
            formatoValor={(v) => pct(v, 1)}
            formatoEje={(v) => pct(v)}
            gruposSeleccionados={filtros.categorias}
            onClickGrupo={(categoria) => dispatch({ tipo: 'alternarCategoria', categoria })}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Padrón detallado"
          bajada="Ordenable por cualquier columna. Es la vista operativa para armar la próxima ronda de llamados."
          ancho="completo"
          recargando={datos.recargando}
        >
          <TablaDatos
            maxAlto={560}
            columnas={[
              'Establecimiento',
              'Categoría',
              'UF',
              'Plazas',
              'Días con dato',
              'Tasa de respuesta',
              'Ocupación UF',
              'Días completo',
              'Estado dominante',
            ]}
            filas={ordenadas.map((f) => [
              f.nombre,
              etiquetaCategoria(f.categoria),
              num(f.capacidadUf),
              num(f.capacidadPax),
              num(f.diasConDato),
              pct(f.tasaRespuesta, 1),
              pct(f.ocupacionUf, 1),
              num(f.diasCompleto),
              f.estado,
            ])}
          />
        </Tarjeta>
      </Grilla>
    </>
  );
}
