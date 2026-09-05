-- =============================================================================
-- PATRONES DE CONSULTA PARA DuckDB-WASM (navegador del cliente)
-- =============================================================================
-- Reglas que hacen que estas consultas corran en milisegundos (docs/03 §6):
--   1. Tablas emitidas ORDENADAS FÍSICAMENTE por (destino, fecha) -> poda por
--      zone map: un filtro de rango saltea row groups enteros.
--   2. Fechas como DATE y códigos como ENUM/diccionario, jamás VARCHAR.
--   3. Se devuelven AGREGADOS (decenas o cientos de filas), nunca filas crudas:
--      el costo dominante es materializar objetos JS, no escanear.
--   4. Sentencias PREPARADAS con parámetros posicionales. Nunca concatenar
--      strings con el estado de la UI.
--   5. Sin joins en caliente entre tablas grandes; solo contra dimensiones.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- P1 — Curvas cruzadas de anticipación para una fecha objetivo  (docs/02 §5)
-- Devuelve <= 10 filas. Es el "gráfico maestro tripartito".
-- $1 fecha objetivo, $2 origen
-- -----------------------------------------------------------------------------
PREPARE p_curvas AS
WITH aereo AS (
    SELECT lead_bucket,
           median(fare_rt_ars) FILTER (WHERE dest_iata = 'EQS') AS tarifa_eqs,
           median(fare_rt_ars) FILTER (WHERE dest_iata = 'BRC') AS tarifa_brc,
           median(fare_rt_ars) FILTER (WHERE dest_iata = 'CPC') AS tarifa_cpc
    FROM air_fact_leadtime
    WHERE flight_date = $1 AND origin_iata = $2
    GROUP BY lead_bucket
),
aloj AS (
    SELECT lead_bucket,
           median(adr_ars_mediana) FILTER (WHERE destino = 'Esquel')    AS adr_esquel,
           median(adr_ars_mediana) FILTER (WHERE destino = 'Bariloche') AS adr_bariloche,
           median(tasa_disponibilidad) FILTER (WHERE destino = 'Esquel') AS disp_esquel
    FROM ota_fact_leadtime
    WHERE fecha = $1
    GROUP BY lead_bucket
)
SELECT b.lead_bucket, b.lead_dias_centro,
       a.tarifa_eqs, a.tarifa_brc, a.tarifa_cpc,
       o.adr_esquel, o.adr_bariloche,
       1 - o.disp_esquel AS proporcion_reservada
FROM dim_lead_bucket b            -- 10 filas
LEFT JOIN aereo a USING (lead_bucket)
LEFT JOIN aloj  o USING (lead_bucket)
ORDER BY b.lead_bucket DESC;      -- de mayor a menor anticipación


-- -----------------------------------------------------------------------------
-- P2 — Calculadora TTCI  (docs/02 §2.1)
-- El TTCI se calcula ACÁ, no en el ETL: depende de N, P, c y moneda, que elige
-- el usuario. Precalcularlo obligaría a una tabla por combinación.
-- $1 noches  $2 pasajeros  $3 ocupación/unidad  $4 fecha  $5 origen
-- -----------------------------------------------------------------------------
PREPARE p_ttci AS
WITH p AS (
    SELECT $1::INT AS n, $2::INT AS pax, CEIL($2::DOUBLE / $3::DOUBLE) AS unidades
)
SELECT
    g.destino_final,
    g.gateway_iata,
    p.pax * g.fare_rt_ars                                  AS comp_aereo,
    g.transfer_cost_ars_group                              AS comp_traslado,
    p.n * p.unidades * o.adr_ars_mediana                   AS comp_alojamiento,
    p.pax * g.fare_rt_ars + g.transfer_cost_ars_group
          + p.n * p.unidades * o.adr_ars_mediana           AS ttci,
    (p.pax * g.fare_rt_ars + g.transfer_cost_ars_group
          + p.n * p.unidades * o.adr_ars_mediana)
          / (p.pax * p.n)                                  AS ttci_pppn,
    (p.pax * g.fare_rt_ars + g.transfer_cost_ars_group)
          / NULLIF(p.pax * g.fare_rt_ars + g.transfer_cost_ars_group
                 + p.n * p.unidades * o.adr_ars_mediana, 0) AS peso_aereo   -- w_A
FROM air_gateway_costs g
JOIN ota_fact_dia o
  ON o.destino = g.destino_final AND o.fecha = g.flight_date AND o.tipologia = 'TODAS'
CROSS JOIN p
WHERE g.flight_date = $4 AND g.origin_iata = $5
ORDER BY ttci;


-- -----------------------------------------------------------------------------
-- P3 — Umbral de estadía compensatoria N*  e Índice de Fuga  (docs/02 §2.2-2.3)
-- $1 pasajeros  $2 ocupación/unidad  $3 origen
-- -----------------------------------------------------------------------------
PREPARE p_nstar AS
WITH par AS (
    SELECT e.flight_date,
           e.fare_rt_ars + e.transfer_cost_ars_group / NULLIF($1::DOUBLE,0) AS costo_pax_eqs,
           b.fare_rt_ars + b.transfer_cost_ars_group / NULLIF($1::DOUBLE,0) AS costo_pax_brc,
           oe.adr_ars_mediana AS adr_eqs,
           ob.adr_ars_mediana AS adr_brc
    FROM air_gateway_costs e
    JOIN air_gateway_costs b
      ON b.flight_date = e.flight_date AND b.origin_iata = e.origin_iata
     AND b.destino_final = 'Bariloche' AND b.gateway_iata = 'BRC'
    JOIN ota_fact_dia oe ON oe.fecha = e.flight_date
                        AND oe.destino = 'Esquel'    AND oe.tipologia = 'TODAS'
    JOIN ota_fact_dia ob ON ob.fecha = e.flight_date
                        AND ob.destino = 'Bariloche' AND ob.tipologia = 'TODAS'
    WHERE e.origin_iata = $3
      AND e.destino_final = 'Esquel' AND e.gateway_iata = 'EQS'
)
SELECT flight_date,
       CASE WHEN adr_brc > adr_eqs
            THEN ($1::DOUBLE * (costo_pax_eqs - costo_pax_brc))
                 / (CEIL($1::DOUBLE / $2::DOUBLE) * (adr_brc - adr_eqs))
       END                                              AS n_estrella,
       adr_brc <= adr_eqs                               AS dominancia_bariloche,
       costo_pax_eqs - costo_pax_brc                    AS sobreprecio_aereo_pax
FROM par
ORDER BY flight_date;

-- Índice de Fuga de Puerta de Entrada: proporción de fechas en que la puerta
-- más barata para llegar a Esquel NO es el aeropuerto de Esquel.
PREPARE p_ifpe AS
WITH mejor AS (
    SELECT flight_date,
           arg_min(gateway_iata, fare_rt_ars + transfer_cost_ars_group) AS gateway_optimo
    FROM air_gateway_costs
    WHERE destino_final = 'Esquel' AND origin_iata = $1
      AND flight_date BETWEEN $2 AND $3
    GROUP BY flight_date
)
SELECT count(*)                                        AS fechas,
       count(*) FILTER (WHERE gateway_optimo <> 'EQS') AS fechas_con_fuga,
       count(*) FILTER (WHERE gateway_optimo <> 'EQS')::DOUBLE
           / NULLIF(count(*),0)                        AS ifpe
FROM mejor;


-- -----------------------------------------------------------------------------
-- P4 — Tarifario comparativo patagónico (tabla compacta de la sección Aéreos)
-- $1 origen. Horizontes 7/15/30/60 días. Devuelve una fila por destino.
-- -----------------------------------------------------------------------------
PREPARE p_tarifario AS
SELECT dest_iata,
       median(fare_rt_ars) FILTER (WHERE dias_hasta <=  7)              AS h7,
       median(fare_rt_ars) FILTER (WHERE dias_hasta BETWEEN  8 AND 15)  AS h15,
       median(fare_rt_ars) FILTER (WHERE dias_hasta BETWEEN 16 AND 30)  AS h30,
       median(fare_rt_ars) FILTER (WHERE dias_hasta BETWEEN 31 AND 60)  AS h60,
       median(fare_rt_ars / NULLIF(distance_km,0))                      AS tarifa_km,
       max(cobertura)                                                   AS cobertura
FROM v_air_horizonte                 -- vista sobre air_fact_leadtime con
WHERE origin_iata = $1               -- dias_hasta = flight_date - hoy
GROUP BY dest_iata
ORDER BY tarifa_km DESC;


-- -----------------------------------------------------------------------------
-- P5 — Panel de alerta temprana (docs/02 §8)
-- Devuelve una fila por semana objetivo dentro de la ventana accionable.
-- -----------------------------------------------------------------------------
PREPARE p_alertas AS
SELECT semana_objetivo, lead_dias,
       s1_brecha, s2_aceleracion, s3_capacidad, s4_pace,
       iat, banda, senal_dominante,
       pernoctes_en_riesgo, presupuesto_reasignable, recomendacion,
       cobertura,
       CASE WHEN cobertura < 0.80 THEN 'sin_senal' ELSE banda END AS banda_efectiva
FROM x_fact_alertas
WHERE destino = $1
  AND lead_dias BETWEEN 21 AND 75          -- ventana de accionabilidad
  AND corrida = (SELECT max(corrida) FROM x_fact_alertas)
ORDER BY semana_objetivo;


-- -----------------------------------------------------------------------------
-- P6 — Descomposición del desvío de ocupación (docs/02 §7)
-- Barra apilada en puntos porcentuales, con residuo explícito.
-- -----------------------------------------------------------------------------
PREPARE p_descomposicion AS
SELECT periodo,
       delta_total_pp,
       factor_regional_pp,
       capacidad_aerea_pp,
       tarifa_aerea_pp,
       precio_hotelero_pp,
       residuo_pp,
       elasticidad_min, elasticidad_max,   -- banda: docs/02 §6
       evidencia_suficiente                -- FALSE -> mostrar "evidencia insuficiente"
FROM x_fact_descomposicion_mes
WHERE destino = $1 AND periodo BETWEEN $2 AND $3
ORDER BY periodo;


-- =============================================================================
-- ANTIPATRONES — no hacer
-- =============================================================================
-- ✗ SELECT * FROM air_fact_leadtime WHERE ...     -> materializa 100k objetos JS
-- ✗ WHERE CAST(fecha AS VARCHAR) LIKE '2026-09%'  -> anula la poda por zone map
-- ✗ JOIN entre air_fact_leadtime y ota_fact_leadtime sin agregar antes
-- ✗ Reconstruir la consulta con template strings a partir del estado de la UI
-- ✗ Consultar en cada evento del slider sin debounce ni contador de generación
-- ✗ Pivotear en JavaScript lo que FILTER (WHERE ...) resuelve en SQL
