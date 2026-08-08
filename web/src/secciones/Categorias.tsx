/** Categorías y oferta: quién compone el parque y cómo se comporta cada tipo. */

import { useMemo, useState } from 'react';
import { Mancuerna } from '../charts/categoricas';
import { Dispersion, PequenosMultiples } from '../charts/distribucion';
import { MatrizCalor, type CeldaMatriz } from '../charts/matrices';
import { EncabezadoSeccion, Grilla, Segmentado, Tarjeta } from '../components/ui';
import { baseCategoriaDia, EXPR_PCT_PAX, EXPR_PCT_UF, sqlPorCategoria } from '../db/consultas';
import { useConsulta } from '../hooks/useConsulta';
import { MESES, MESES_ABBR, num, numCorto, pct } from '../lib/formato';
import { useApp } from '../state/app';
import type { Filtros } from '../state/filtros';

type Medida = 'uf' | 'pax';

/** Matriz categoría × mes: nunca filtra por categoría, para no vaciar la matriz. */
function sqlCategoriaMes(f: Filtros): string {
  return `
    WITH base AS (${baseCategoriaDia(f, { ignorarCategoria: true })})
    SELECT categoria, mes,
           ${EXPR_PCT_UF} AS pct_uf,
           ${EXPR_PCT_PAX} AS pct_pax,
           COUNT(DISTINCT fecha) FILTER (WHERE cumple_minimo) AS dias_publicables,
           COUNT(DISTINCT fecha) AS dias,
           SUM(n_relevados) AS respuestas
    FROM base
    GROUP BY categoria, mes
    ORDER BY categoria, mes
  `;
}

export function Categorias() {
  const { filtros, dispatch, etiquetaCategoria, cortaCategoria, meta } = useApp();
  const [medida, setMedida] = useState<Medida>('uf');
  const campo = medida === 'uf' ? 'pct_uf' : 'pct_pax';

  const porCategoria = useConsulta<Record<string, number | string | null>>(sqlPorCategoria(filtros), [filtros]);
  const matriz = useConsulta<Record<string, number | string | null>>(sqlCategoriaMes(filtros), [filtros]);

  const ordenCategorias = useMemo(() => {
    const orden = new Map((meta?.categorias ?? []).map((c) => [c.nombre, c.orden]));
    return [...porCategoria.datos]
      .map((c) => c.categoria as string)
      .sort((a, b) => (orden.get(a) ?? 99) - (orden.get(b) ?? 99));
  }, [porCategoria.datos, meta]);

  const mesesPresentes = useMemo(() => {
    const s = new Set<number>();
    for (const r of matriz.datos) s.add(Number(r.mes));
    return Array.from(s).sort((a, b) => a - b);
  }, [matriz.datos]);

  const celdas = useMemo<CeldaMatriz[]>(
    () =>
      matriz.datos.map((r) => ({
        fila: r.categoria as string,
        columna: Number(r.mes),
        valor: typeof r[campo] === 'number' ? (r[campo] as number) : null,
        detalle: [
          { etiqueta: 'Días publicables', valor: `${num(r.dias_publicables as number)} de ${num(r.dias as number)}` },
          { etiqueta: 'Respuestas', valor: num(r.respuestas as number) },
        ],
      })),
    [matriz.datos, campo],
  );

  // ---- Pequeños múltiplos: una miniatura por categoría --------------------
  const paneles = useMemo(() => {
    const porCat = new Map<string, Array<number | null>>();
    for (const cat of ordenCategorias) {
      porCat.set(
        cat,
        mesesPresentes.map((m) => {
          const fila = matriz.datos.find((r) => r.categoria === cat && Number(r.mes) === m);
          const v = fila?.[campo];
          return typeof v === 'number' && Number.isFinite(v) ? v : null;
        }),
      );
    }
    return ordenCategorias.map((cat) => {
      const valores = porCat.get(cat) ?? [];
      const validos = valores.filter((v): v is number => v !== null);
      const global = porCategoria.datos.find((c) => c.categoria === cat);
      return {
        clave: cat,
        etiqueta: cortaCategoria(cat),
        valores,
        resumen: validos.length ? pct(global?.[campo] as number, 0) : 'sin dato',
      };
    });
  }, [ordenCategorias, mesesPresentes, matriz.datos, campo, porCategoria.datos, cortaCategoria]);

  // ---- Mancuerna: capacidad habilitada vs. en operación -------------------
  const filasCapacidad = useMemo(() => {
    const campoHab = medida === 'uf' ? 'uf_habilitada' : 'pax_habilitada';
    const campoTrab = medida === 'uf' ? 'uf_trabajando' : 'pax_trabajando';
    return [...porCategoria.datos]
      .map((c) => ({
        clave: c.categoria as string,
        etiqueta: etiquetaCategoria(c.categoria as string),
        a: typeof c[campoHab] === 'number' ? (c[campoHab] as number) : null,
        b: typeof c[campoTrab] === 'number' ? (c[campoTrab] as number) : null,
      }))
      .sort((x, y) => (y.a ?? 0) - (x.a ?? 0));
  }, [porCategoria.datos, medida, etiquetaCategoria]);

  // ---- Dispersión: tamaño vs. desempeño ----------------------------------
  const puntos = useMemo(
    () =>
      porCategoria.datos
        .filter((c) => typeof c[campo] === 'number' && Number.isFinite(c[campo] as number))
        .map((c) => ({
          clave: c.categoria as string,
          etiqueta: etiquetaCategoria(c.categoria as string),
          x: (medida === 'uf' ? c.uf_trabajando : c.pax_trabajando) as number,
          y: c[campo] as number,
          tamano: (c.pernoctes as number) || 1,
          detalle: [
            { etiqueta: 'Establecimientos', valor: num(c.establecimientos as number) },
            { etiqueta: 'Pernoctes', valor: numCorto(c.pernoctes as number) },
            { etiqueta: 'Tasa de respuesta', valor: pct(c.tasa_respuesta as number, 1) },
          ],
        })),
    [porCategoria.datos, campo, medida, etiquetaCategoria],
  );

  const unidad = medida === 'uf' ? 'unidades funcionales' : 'plazas';

  return (
    <>
      <EncabezadoSeccion
        titulo="Categorías y oferta"
        bajada="Composición del parque alojativo y desempeño comparado de cada tipo de establecimiento. Hacé clic en cualquier categoría para filtrar todo el tablero."
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
          titulo="Ocupación por categoría y mes"
          bajada="Cada celda es la ocupación de una categoría en un mes. Las celdas vacías no tuvieron dato publicable."
          ancho="completo"
          recargando={matriz.recargando}
          nota="Leer por filas compara meses dentro de una categoría; leer por columnas compara categorías dentro de un mes."
          tabla={{
            columnas: ['Categoría', ...mesesPresentes.map((m) => MESES_ABBR[m - 1])],
            filas: ordenCategorias.map((cat) => [
              etiquetaCategoria(cat),
              ...mesesPresentes.map((m) => {
                const f = matriz.datos.find((r) => r.categoria === cat && Number(r.mes) === m);
                return pct(f?.[campo] as number, 1);
              }),
            ]),
          }}
        >
          <MatrizCalor
            celdas={celdas}
            filas={ordenCategorias}
            columnas={mesesPresentes}
            etiqueta="Ocupación por categoría y mes"
            etiquetaFila={etiquetaCategoria}
            etiquetaColumna={(c) => MESES_ABBR[Number(c) - 1]}
            formatoValor={(v) => pct(v, 1)}
            filasSeleccionadas={filtros.categorias}
            columnasSeleccionadas={filtros.meses}
            onClickFila={(categoria) => dispatch({ tipo: 'alternarCategoria', categoria })}
            onClickColumna={(c) => dispatch({ tipo: 'alternarMes', mes: Number(c) })}
            tituloRampa="Ocupación"
          />
        </Tarjeta>

        <Tarjeta
          titulo="Curva anual de cada categoría"
          bajada="Misma escala en todos los paneles: los tamaños son comparables entre sí."
          ancho="completo"
          recargando={matriz.recargando}
          nota="Las categorías planas en cero no son categorías vacías: son categorías sin relevamiento suficiente."
        >
          <PequenosMultiples
            paneles={paneles}
            etiquetasX={mesesPresentes.map((m) => MESES[m - 1])}
            etiqueta="Curva anual por categoría"
            formatoValor={(v) => pct(v, 1)}
            seleccionados={filtros.categorias}
            onClickPanel={(categoria) => dispatch({ tipo: 'alternarCategoria', categoria })}
            columnas={5}
          />
        </Tarjeta>

        <Tarjeta
          titulo={`Capacidad habilitada frente a capacidad en operación`}
          bajada={`${unidad[0].toUpperCase()}${unidad.slice(1)} declaradas en el registro vs. efectivamente abiertas. La cifra a la derecha es la brecha.`}
          ancho="medio"
          recargando={porCategoria.recargando}
          nota="Una brecha grande y persistente indica parque habilitado que no opera: o cerró, o el registro está desactualizado."
          tabla={{
            columnas: ['Categoría', 'Habilitada', 'En operación', 'Brecha'],
            filas: filasCapacidad.map((f) => [
              f.etiqueta,
              num(f.a),
              num(f.b),
              f.a !== null && f.b !== null ? num(f.a - f.b) : '—',
            ]),
          }}
        >
          <Mancuerna
            filas={filasCapacidad}
            etiquetaA="Habilitada"
            etiquetaB="En operación"
            etiqueta="Capacidad habilitada vs. en operación"
            formatoValor={(v) => num(v)}
            formatoEje={(v) => numCorto(v)}
            seleccionadas={filtros.categorias}
            onClickFila={(categoria) => dispatch({ tipo: 'alternarCategoria', categoria })}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Tamaño frente a desempeño"
          bajada="Eje horizontal: capacidad en operación. Vertical: ocupación. El área del círculo es el volumen de pernoctes."
          ancho="medio"
          recargando={porCategoria.recargando}
          nota="El cuadrante superior derecho concentra el volumen real del destino; el inferior derecho es capacidad grande con baja rotación."
          tabla={{
            columnas: ['Categoría', 'Capacidad en operación', 'Ocupación', 'Pernoctes'],
            filas: puntos.map((p) => [p.etiqueta, num(p.x), pct(p.y, 1), numCorto(p.tamano)]),
          }}
        >
          <Dispersion
            puntos={puntos}
            etiqueta="Capacidad frente a ocupación"
            tituloX={`Capacidad en operación (${unidad})`}
            tituloY="Ocupación"
            formatoX={(v) => numCorto(v)}
            formatoY={(v) => pct(v)}
            seleccionados={filtros.categorias}
            onClickPunto={(categoria) => dispatch({ tipo: 'alternarCategoria', categoria })}
          />
        </Tarjeta>
      </Grilla>
    </>
  );
}
