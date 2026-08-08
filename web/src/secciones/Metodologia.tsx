/** Metodología: cómo se calcula cada número y con qué se lo puede auditar. */

import { useMemo } from 'react';
import { Aviso, EncabezadoSeccion, Grilla, TablaDatos, Tarjeta } from '../components/ui';
import { useConsulta } from '../hooks/useConsulta';
import { fechaIso, num, pct } from '../lib/formato';
import { useApp } from '../state/app';

const SQL_COMPARACION = `
  SELECT
    COUNT(*) AS dias,
    COUNT(*) FILTER (WHERE publicable_oficial) AS dias_oficial,
    COUNT(*) FILTER (WHERE publicable_general) AS dias_general,
    AVG(pct_uf_oficial)  AS pct_uf_oficial,
    AVG(pct_uf_general)  AS pct_uf_general,
    AVG(pct_pax_oficial) AS pct_pax_oficial,
    AVG(pct_pax_general) AS pct_pax_general
  FROM fact_dia
`;

export function Metodologia() {
  const { meta } = useApp();
  const comparacion = useConsulta<Record<string, number | null>>(SQL_COMPARACION, []);

  const validacion = meta?.validacion as
    | {
        ejecutada?: boolean;
        filas_comparadas?: number;
        coincide?: boolean;
        dentro_de_umbral?: boolean;
        peor_share?: number;
        umbral?: number;
        comparaciones?: Record<
          string,
          { filas_fuera_tolerancia: number; share_fuera: number; max_dif: number }
        >;
      }
    | undefined;

  const filasValidacion = useMemo(() => {
    const c = validacion?.comparaciones;
    if (!c) return [];
    return Object.entries(c).map(([nombre, v]) => [
      nombre.replace(/_/g, ' '),
      num(v.filas_fuera_tolerancia),
      pct(v.share_fuera, 2),
      num(v.max_dif, 2),
    ]);
  }, [validacion]);

  const cmp = comparacion.datos[0];

  return (
    <>
      <EncabezadoSeccion
        titulo="Metodología y trazabilidad"
        bajada="Cómo se construye cada indicador, qué reglas de publicación se aplican y cómo se verifica que el tablero reproduzca la serie oficial."
      />

      <Grilla>
        <Tarjeta titulo="Cómo se calcula la ocupación" ancho="dos-tercios">
          <div className="prosa">
            <p>
              Para cada <strong>día</strong> y cada <strong>categoría</strong>, la ocupación publicada es la
              tasa observada entre los establecimientos que respondieron, ponderada por su tamaño y proyectada
              al parque que efectivamente opera:
            </p>
            <pre className="formula">
{`tasa      =  Σ unidades ocupadas (solo los que respondieron)
             ──────────────────────────────────────────────
             Σ unidades disponibles (solo los que respondieron)

ocupadas  =  tasa × unidades en operación de la categoría
% publicado = tasa,  si respondieron ≥ mínimo requerido`}
            </pre>
            <p>
              La extrapolación se hace <strong>por estrato de relevamiento</strong>, no por categoría
              publicada: cuando una categoría se releva en dos sublistas (por ejemplo «Cabañas» y «Cabañas 2»),
              cada una aporta su propia tasa y su propio parque, y recién después se suman las unidades
              ocupadas estimadas. Así una sublista chica y muy respondida no arrastra a una grande y poco
              respondida.
            </p>
            <p>
              Para el <strong>total del destino</strong> se aplica la misma lógica un nivel más arriba: se
              suman unidades ocupadas y unidades en operación de todas las categorías con dato, y el día se
              publica si al menos {num(meta?.calidad.min_categorias_general)} categorías tienen dato.
            </p>
            <p className="destacado">
              Nunca se promedian porcentajes. Sumar los porcentajes mensuales de una categoría y presentarlos
              como total anual produce cifras superiores al 100 %, que no significan nada: un día con 3
              unidades pesaría lo mismo que uno con 3.000.
            </p>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Reglas de publicación" ancho="tercio">
          <div className="prosa">
            <p>Un indicador se publica solo si supera estos filtros:</p>
            <ol>
              <li>
                <strong>Mínimo por categoría.</strong> Cantidad de establecimientos con respuesta ese día,
                configurable por categoría.
              </li>
              <li>
                <strong>Mínimo de categorías.</strong> Al menos {num(meta?.calidad.min_categorias_general)}{' '}
                categorías con dato para publicar el total del destino.
              </li>
              <li>
                <strong>Sin dato ≠ cero.</strong> Lo que no se midió se dibuja como hueco.
              </li>
            </ol>
          </div>
          <TablaDatos
            ordenable={false}
            columnas={['Categoría', 'Mínimo']}
            filas={(meta?.categorias ?? []).map((c) => [c.etiqueta, c.minimo_requerido])}
            maxAlto={260}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Serie oficial frente a serie general"
          bajada="La diferencia entre publicar solo lo que alcanza el mínimo y publicar todo lo que tenga algún dato."
          ancho="completo"
          nota="La serie «general» es la que reproduce el tablero anterior. Se conserva para no perder continuidad, pero la lectura defendible es la oficial."
        >
          {cmp && (
            <TablaDatos
              ordenable={false}
              columnas={['Criterio', 'Días publicables', 'Ocupación UF media', 'Ocupación plazas media']}
              filas={[
                [
                  'Oficial (respeta el mínimo muestral)',
                  `${num(cmp.dias_oficial)} de ${num(cmp.dias)}`,
                  pct(cmp.pct_uf_oficial, 1),
                  pct(cmp.pct_pax_oficial, 1),
                ],
                [
                  'General (cualquier dato disponible)',
                  `${num(cmp.dias_general)} de ${num(cmp.dias)}`,
                  pct(cmp.pct_uf_general, 1),
                  pct(cmp.pct_pax_general, 1),
                ],
              ]}
            />
          )}
        </Tarjeta>

        <Tarjeta
          titulo="Reconciliación con la planilla"
          bajada="El ETL se compara fila a fila contra la hoja «Histórico - Ocupación Oficial» en cada corrida."
          ancho="dos-tercios"
          nota={
            validacion?.ejecutada
              ? `Se compararon ${num(validacion.filas_comparadas)} pares categoría-día. El proceso aborta si la divergencia supera ${pct(validacion.umbral ?? 0)}.`
              : 'No se ejecutó la reconciliación en la última corrida.'
          }
        >
          {validacion?.ejecutada ? (
            <>
              <Aviso tono={validacion.dentro_de_umbral ? 'bien' : 'critico'}>
                {validacion.coincide
                  ? 'El ETL reproduce exactamente la serie oficial.'
                  : `Divergencia máxima ${pct(validacion.peor_share ?? 0, 2)} de las filas, dentro del umbral de ${pct(validacion.umbral ?? 0)}. Las diferencias se concentran en categorías donde el padrón cambió después de que la planilla calculara su hoja oficial.`}
              </Aviso>
              <TablaDatos
                ordenable={false}
                columnas={['Indicador', 'Filas distintas', 'Proporción', 'Diferencia máxima']}
                filas={filasValidacion}
              />
            </>
          ) : (
            <p className="prosa">Sin datos de reconciliación en esta compilación.</p>
          )}
        </Tarjeta>

        <Tarjeta titulo="Procedencia" ancho="tercio">
          <TablaDatos
            ordenable={false}
            columnas={['Campo', 'Valor']}
            filas={[
              ['Generado', meta ? new Date(meta.generado).toLocaleString('es-AR') : '—'],
              ['Versión del ETL', meta?.version_etl ?? '—'],
              ['Origen', meta?.origen.descripcion.split('/').pop() ?? '—'],
              ['Huella del origen', meta?.origen.hash ?? '—'],
              ['Período', meta ? `${fechaIso(meta.periodo.desde)} – ${fechaIso(meta.periodo.hasta)}` : '—'],
              ['Registros', num(meta?.calidad.registros)],
              ['Establecimientos', num(meta?.parque.establecimientos)],
              ['Categorías', num(meta?.parque.categorias)],
            ]}
          />
        </Tarjeta>

        <Tarjeta
          titulo="Definiciones"
          ancho="completo"
          nota="La nomenclatura de categorías sigue el registro provincial de prestadores."
        >
          <TablaDatos
            ordenable={false}
            columnas={['Término', 'Definición']}
            filas={[
              ['UF (unidad funcional)', 'Unidad comercializable: habitación, cabaña, departamento o carpa.'],
              ['Plaza', 'Cama disponible. Un mismo establecimiento tiene más plazas que unidades funcionales.'],
              ['Habilitada', 'Capacidad declarada en el registro de prestadores, opere o no.'],
              ['En operación', 'Capacidad efectivamente abierta y comercializando en la fecha.'],
              ['Pernocte', 'Una plaza ocupada durante una noche.'],
              ['Estadía promedio', 'Noches por turista, relevada en la oficina de informes.'],
              ['Turistas', 'Pernoctes divididos por la estadía promedio del período.'],
              ['Extrapolación', 'Proyección de la tasa observada en la muestra al parque completo de la categoría.'],
              ['Mínimo requerido', 'Cantidad de establecimientos con respuesta necesaria para publicar la categoría.'],
              ['Derrame', 'Estimación paramétrica de gasto: pernoctes × gasto diario medio configurado.'],
            ]}
          />
        </Tarjeta>
      </Grilla>
    </>
  );
}
