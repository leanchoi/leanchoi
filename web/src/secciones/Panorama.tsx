/** Panorama: la lectura de una sola pantalla del estado del destino. */

import { useMemo, useState } from 'react';
import { mediaMovil } from '../charts/base';
import { BarrasHorizontales, Embudo } from '../charts/categoricas';
import { CalendarioAnual, SerieTemporal, type PuntoSerie } from '../charts/temporales';
import { Aviso, EncabezadoSeccion, FilaKpis, Grilla, Segmentado, Tarjeta, type DatosKpi } from '../components/ui';
import { sqlPorCategoria, sqlResumen, sqlSerieDiaria } from '../db/consultas';
import { useConsulta } from '../hooks/useConsulta';
import { aFecha, iso, num, numCorto, pct, pp } from '../lib/formato';
import { useApp } from '../state/app';

type Medida = 'uf' | 'pax';

export function Panorama() {
  const { filtros, dispatch, meta, etiquetaCategoria, cortaCategoria } = useApp();
  const [medida, setMedida] = useState<Medida>('uf');

  const serie = useConsulta<Record<string, number | string | null>>(sqlSerieDiaria(filtros), [filtros]);
  const resumen = useConsulta<Record<string, number | null>>(sqlResumen(filtros), [filtros]);
  const categorias = useConsulta<Record<string, number | string | null>>(sqlPorCategoria(filtros), [filtros]);

  const campoPct = medida === 'uf' ? 'pct_uf' : 'pct_pax';
  const etiquetaMedida = medida === 'uf' ? 'unidades funcionales' : 'plazas';

  // ---- Serie diaria + media móvil ---------------------------------------
  const puntos = useMemo<PuntoSerie[]>(() => {
    const crudos = serie.datos.map((d) => ({
      fecha: aFecha(d.fecha),
      valor: typeof d[campoPct] === 'number' ? (d[campoPct] as number) : null,
      nota: (d.feriado as string) || (d.evento as string) || undefined,
    }));
    const suavizado = mediaMovil(crudos.map((p) => p.valor), 7);
    return crudos.map((p, i) => ({ ...p, tendencia: suavizado[i] }));
  }, [serie.datos, campoPct]);

  // ---- KPIs --------------------------------------------------------------
  const kpis = useMemo<DatosKpi[]>(() => {
    const r = resumen.datos[0];
    if (!r) return [];

    const chispa = puntos.map((p) => p.tendencia as number | null);
    const cobertura = r.panel ? (r.respuestas ?? 0) / r.panel : null;
    const diasPublicables = r.dias ? (r.dias_con_publicable ?? 0) / r.dias : null;
    const objetivo = meta?.parametros.metas?.cobertura_relevamiento_objetivo ?? null;
    const estadia = meta?.parametros.reglas?.estadia_promedio_defecto ?? 3;
    const pernoctes = r.pernoctes_observados ?? null;

    return [
      {
        etiqueta: 'Ocupación UF',
        valor: pct(r.pct_uf, 1),
        contexto: 'Unidades funcionales',
        chispa: medida === 'uf' ? chispa : undefined,
        color: 'var(--serie-1)',
      },
      {
        etiqueta: 'Ocupación plazas',
        valor: pct(r.pct_pax, 1),
        contexto: 'Camas ocupadas',
        chispa: medida === 'pax' ? chispa : undefined,
        color: 'var(--serie-2)',
      },
      {
        etiqueta: 'Pernoctes medidos',
        valor: numCorto(pernoctes),
        contexto: `${num(r.dias_con_publicable)} de ${num(r.dias)} días publicables`,
      },
      {
        etiqueta: 'Turistas estimados',
        valor: numCorto(pernoctes !== null ? pernoctes / estadia : null),
        contexto: `Estadía media ${num(estadia, 1)} noches`,
      },
      {
        etiqueta: 'Parque operativo',
        valor: num(r.uf_trabajando_medio),
        unidad: 'UF',
        contexto: `${num(r.pax_trabajando_medio)} plazas en operación`,
      },
      {
        etiqueta: 'Cobertura del relevamiento',
        valor: pct(cobertura, 1),
        contexto: objetivo ? `Meta ${pct(objetivo)}` : undefined,
        delta:
          cobertura !== null && objetivo
            ? {
                texto: `${pp(cobertura - objetivo)} vs. meta`,
                sentido: cobertura >= objetivo ? 'bueno' : 'malo',
              }
            : undefined,
        alerta:
          diasPublicables !== null && diasPublicables < 0.7
            ? `Solo ${pct(diasPublicables)} de los días tiene al menos una categoría publicable.`
            : undefined,
      },
    ];
  }, [resumen.datos, puntos, medida, meta]);

  // ---- Ranking por categoría --------------------------------------------
  const filasCategoria = useMemo(() => {
    return categorias.datos
      .map((c) => {
        const publicables = c.dias_publicables as number;
        const dias = c.dias as number;
        // Una categoría con el mínimo en 1 puede publicar con una sola respuesta.
        // El valor es válido, pero no aguanta el mismo peso que uno sostenido por
        // decenas de días: se atenúa y se rotula el n para que se lea la diferencia.
        const confianzaBaja = publicables > 0 && publicables < Math.max(5, dias * 0.1);
        return {
          clave: c.categoria as string,
          etiqueta: etiquetaCategoria(c.categoria as string),
          valor: typeof c[campoPct] === 'number' ? (c[campoPct] as number) : null,
          confianzaBaja,
          sufijo: confianzaBaja ? `· ${num(publicables)} d` : undefined,
          nota:
            publicables === 0
              ? 'Sin días publicables en este recorte: nunca se alcanzó el mínimo muestral.'
              : `${num(publicables)} de ${num(dias)} días publicables`,
        };
      })
      .sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1));
  }, [categorias.datos, campoPct, etiquetaCategoria]);

  // ---- Calendario --------------------------------------------------------
  const diasCalendario = useMemo(
    () =>
      serie.datos.map((d) => ({
        fecha: aFecha(d.fecha),
        valor: typeof d[campoPct] === 'number' ? (d[campoPct] as number) : null,
        publicable: (d.categorias_publicables as number) > 0,
        nota: (d.feriado as string) || (d.evento as string) || undefined,
      })),
    [serie.datos, campoPct],
  );

  // ---- Embudo de capacidad ----------------------------------------------
  const etapas = useMemo(() => {
    const r = resumen.datos[0];
    if (!r) return [];
    const hab = medida === 'uf' ? r.uf_habilitada_media : r.pax_habilitada_media;
    const trab = medida === 'uf' ? r.uf_trabajando_medio : r.pax_trabajando_medio;
    const ocup = medida === 'uf' ? r.pct_uf : r.pct_pax;
    if (!hab || !trab) return [];
    return [
      {
        clave: 'habilitada',
        etiqueta: 'Habilitada',
        valor: hab,
        descripcion: 'Capacidad declarada en el registro de prestadores',
      },
      {
        clave: 'trabajando',
        etiqueta: 'En operación',
        valor: trab,
        descripcion: 'Capacidad efectivamente abierta en el período',
      },
      {
        clave: 'ocupada',
        etiqueta: 'Ocupada',
        valor: ocup ? trab * ocup : 0,
        descripcion: 'Estimación extrapolada a partir de la muestra relevada',
      },
    ];
  }, [resumen.datos, medida]);

  const alertaCobertura = meta && meta.calidad.tasa_dias_publicables < 0.5;

  return (
    <>
      <EncabezadoSeccion
        titulo="Panorama del destino"
        bajada={`Ocupación diaria, estacionalidad y composición de la oferta. Todo lo que ves responde al mismo recorte: hacé clic en una categoría, un día del calendario o arrastrá sobre la serie para filtrar el tablero completo.`}
        acciones={
          <Segmentado<Medida>
            etiqueta="Medida"
            valor={medida}
            onChange={setMedida}
            opciones={[
              { valor: 'uf', etiqueta: 'Unidades', titulo: 'Unidades funcionales (habitaciones, cabañas, departamentos)' },
              { valor: 'pax', etiqueta: 'Plazas', titulo: 'Plazas / camas' },
            ]}
          />
        }
      />

      <FilaKpis items={kpis} cargando={resumen.cargando} />

      {alertaCobertura && (
        <Aviso tono="aviso" titulo="Leer con cuidado">
          En el período cargado, solo <strong>{pct(meta!.calidad.tasa_dias_publicables)}</strong> de los días
          reúne el mínimo de categorías relevadas para publicar una ocupación del destino. Las series se
          dibujan con huecos donde no hay dato: <em>un hueco no es un cero</em>. El detalle está en{' '}
          <a href="#calidad">Calidad del dato</a>.
        </Aviso>
      )}

      <Grilla>
        <Tarjeta
          titulo={`Ocupación diaria de ${etiquetaMedida}`}
          bajada="Serie diaria y tendencia de 7 días. Arrastrá horizontalmente para acotar el período; un clic simple lo restablece."
          ancho="completo"
          recargando={serie.recargando}
          nota="Las bandas grises marcan feriados y fines de semana largos. Los tramos sin línea son días sin dato publicable."
          tabla={{
            columnas: ['Fecha', 'Ocupación UF', 'Ocupación plazas', 'Categorías con dato'],
            filas: serie.datos.map((d) => [
              iso(aFecha(d.fecha)),
              pct(d.pct_uf as number, 1),
              pct(d.pct_pax as number, 1),
              num(d.categorias_con_dato as number),
            ]),
          }}
        >
          <SerieTemporal
            datos={puntos}
            etiqueta={`Ocupación diaria de ${etiquetaMedida}`}
            recargando={serie.recargando}
            series={[
              { clave: 'valor', etiqueta: 'Ocupación diaria', color: 'var(--serie-1)', tipo: 'area' },
              {
                clave: 'tendencia',
                etiqueta: 'Tendencia (7 días)',
                color: 'var(--serie-2)',
                tipo: 'referencia',
                etiquetarFin: true,
              },
            ]}
            formatoY={(v) => pct(v)}
            formatoValor={(v) => pct(v, 1)}
            onSeleccionRango={(desde, hasta) => dispatch({ tipo: 'rango', desde, hasta })}
            marcasEspeciales={serie.datos
              .filter((d) => d.feriado || d.evento)
              .map((d) => ({
                desde: aFecha(d.fecha),
                hasta: aFecha(d.fecha),
                nombre: (d.feriado as string) || (d.evento as string),
              }))}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Calendario de ocupación"
          bajada="Un cuadro por día. Los días apagados no tuvieron relevamiento suficiente. Hacé clic para aislar una fecha."
          ancho="dos-tercios"
          tabla={{
            columnas: ['Fecha', 'Ocupación'],
            filas: diasCalendario.map((d) => [iso(d.fecha), pct(d.valor, 1)]),
          }}
        >
          <CalendarioAnual
            dias={diasCalendario}
            etiqueta="Calendario de ocupación"
            recargando={serie.recargando}
            formatoValor={(v) => pct(v, 1)}
            seleccionado={filtros.desde === filtros.hasta ? filtros.desde : null}
            onClickDia={(f) => {
              const s = iso(f);
              const yaEsta = filtros.desde === s && filtros.hasta === s;
              dispatch({ tipo: 'rango', desde: yaEsta ? null : s, hasta: yaEsta ? null : s });
            }}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Del parque habilitado a la plaza vendida"
          bajada="Cuánta capacidad se pierde antes de llegar al mercado."
          ancho="tercio"
          nota="La caída de «habilitada» a «en operación» es capacidad que existe pero no abre: es el margen de gestión más directo."
        >
          <Embudo etapas={etapas} formatoValor={(v) => num(v)} recargando={resumen.recargando} />
        </Tarjeta>

        <Tarjeta
          titulo="Ocupación por categoría"
          bajada="Ordenado de mayor a menor. Hacé clic en una fila para filtrar todo el tablero por esa categoría."
          ancho="completo"
          nota="Las categorías sin barra no alcanzaron el mínimo muestral en este recorte; no significa ocupación cero. Las barras atenuadas se apoyan en muy pocos días: el número de días figura junto al valor."
          tabla={{
            columnas: ['Categoría', 'Ocupación UF', 'Ocupación plazas', 'Días publicables', 'Días con dato', 'Tasa de respuesta'],
            filas: categorias.datos.map((c) => [
              etiquetaCategoria(c.categoria as string),
              pct(c.pct_uf as number, 1),
              pct(c.pct_pax as number, 1),
              num(c.dias_publicables as number),
              num(c.dias_con_dato as number),
              pct(c.tasa_respuesta as number, 1),
            ]),
          }}
        >
          <BarrasHorizontales
            filas={filasCategoria}
            etiqueta="Ocupación por categoría"
            recargando={categorias.recargando}
            formatoValor={(v) => pct(v, 1)}
            formatoEje={(v) => pct(v)}
            seleccionadas={filtros.categorias}
            onClickFila={(categoria) => dispatch({ tipo: 'alternarCategoria', categoria })}
            maxDominio={Math.max(0.1, ...filasCategoria.map((f) => f.valor ?? 0)) * 1.15}
          />
        </Tarjeta>
      </Grilla>

      <p className="nota-grafico">
        Abreviaturas: UF = unidad funcional (habitación, cabaña o departamento);{' '}
        {filasCategoria.slice(0, 3).map((f) => cortaCategoria(f.clave)).join(', ')} y demás categorías siguen la
        nomenclatura del registro provincial de prestadores.
      </p>
    </>
  );
}
