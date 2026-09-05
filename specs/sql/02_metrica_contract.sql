-- =============================================================================
-- CONTRATO DE LECTURA: Métrica (PostgreSQL :3013) -> ETL de Esquel Data
-- =============================================================================
-- Se ejecuta con el rol esquel_ro. NO crea objetos, NO usa vistas
-- materializadas, NO modifica nada dentro de Métrica (invariante I1).
--
-- ⚠ NOMBRES DE TABLA A VERIFICAR EN F0-6. Los que siguen son los que sugiere el
--   informe de relevamiento; lo que importa y no cambia es la FORMA de la
--   agregación. Mapear contra el esquema real antes de ejecutar:
--
--     listings            -> catálogo de alojamientos (id, destino, tipología)
--     price_observations  -> hechos (stay_checkin, observed_date, precio, moneda,
--                            disponibilidad)
--     destinations        -> catálogo de destinos (id, nombre)
--     fx_daily            -> tipo de cambio implícito diario
--
-- Convención de buckets de anticipación: idéntica a la del subsistema aéreo
-- (docs/02 §5.1). Deben coincidir o las curvas cruzadas no son comparables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuración de sesión (defensa en profundidad; el rol ya las tiene fijadas)
-- -----------------------------------------------------------------------------
SET application_name = 'esquel_data_etl';
SET statement_timeout = '120s';
SET default_transaction_read_only = on;


-- =============================================================================
-- CONSULTA 1 — ota_daily : destino x noche x tipología
-- Salida: ~29.000 filas/año. Alimenta ota_fact_dia.arrow
-- =============================================================================
WITH base AS (
    SELECT
        d.name                                   AS destino,
        l.property_type                          AS tipologia,
        po.stay_checkin                          AS noche,
        po.observed_date,
        po.stay_checkin - po.observed_date       AS lead_days,
        po.price_ars,
        po.price_usd,
        po.is_available,
        l.listing_id
    FROM price_observations po
    JOIN listings     l ON l.listing_id     = po.listing_id
    JOIN destinations d ON d.destination_id = l.destination_id
    WHERE po.stay_checkin >= :fecha_desde
      AND po.stay_checkin <  :fecha_hasta
      AND po.price_ars IS NOT NULL
      AND po.price_ars > 0
),
-- Una sola observación por (listing, noche): la MÁS RECIENTE.
-- Sin esto, los listings muestreados más veces pesan más en la mediana y el ADR
-- queda sesgado hacia las propiedades que el scraper visitó con más frecuencia.
ultima_obs AS (
    SELECT DISTINCT ON (listing_id, noche)
           destino, tipologia, noche, lead_days, price_ars, price_usd,
           is_available, listing_id
    FROM base
    ORDER BY listing_id, noche, observed_date DESC
)
SELECT
    destino,
    tipologia,
    noche                                                        AS fecha,
    COUNT(*)                                                     AS listings_observados,
    COUNT(*) FILTER (WHERE is_available)                         AS listings_disponibles,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY price_ars)      AS adr_ars_mediana,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY price_ars)      AS adr_ars_p25,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY price_ars)      AS adr_ars_p75,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY price_usd)      AS adr_usd_mediana,
    -- Ocupación IMPLÍCITA: no es ocupación real. Nombrarla así en el tablero
    -- para no confundirla con la ocupación oficial del OIT ni con la EOH.
    1.0 - (COUNT(*) FILTER (WHERE is_available))::NUMERIC
        / NULLIF(COUNT(*), 0)                                    AS ocupacion_implicita
FROM ultima_obs
GROUP BY destino, tipologia, noche
-- Mínimo muestral, coherente con las reglas de indicadores.py (I8).
HAVING COUNT(*) >= :min_listings
ORDER BY destino, noche, tipologia;


-- =============================================================================
-- CONSULTA 2 — ota_leadtime : destino x noche x bucket de anticipación
-- Salida: ~36.500 filas/año. Alimenta ota_fact_leadtime.arrow
-- Es el insumo de: curva de anticipación, punto de congelamiento l_90,
-- señal S4 del monitor y correlación cruzada rezagada.
-- =============================================================================
WITH base AS (
    SELECT
        d.name                                   AS destino,
        po.stay_checkin                          AS noche,
        po.stay_checkin - po.observed_date       AS lead_days,
        po.price_ars,
        po.is_available,
        po.listing_id
    FROM price_observations po
    JOIN listings     l ON l.listing_id     = po.listing_id
    JOIN destinations d ON d.destination_id = l.destination_id
    WHERE po.stay_checkin >= :fecha_desde
      AND po.stay_checkin <  :fecha_hasta
      AND po.stay_checkin > po.observed_date          -- descarta same-day
      AND po.price_ars > 0
),
bucketizado AS (
    SELECT *,
        CASE
            WHEN lead_days <=   2 THEN 0
            WHEN lead_days <=   6 THEN 1
            WHEN lead_days <=  13 THEN 2
            WHEN lead_days <=  20 THEN 3
            WHEN lead_days <=  29 THEN 4
            WHEN lead_days <=  44 THEN 5
            WHEN lead_days <=  59 THEN 6
            WHEN lead_days <=  89 THEN 7
            WHEN lead_days <= 119 THEN 8
            ELSE 9
        END AS lead_bucket
    FROM base
)
SELECT
    destino,
    noche                                                        AS fecha,
    lead_bucket,
    COUNT(DISTINCT listing_id)                                   AS listings_observados,
    COUNT(DISTINCT listing_id) FILTER (WHERE is_available)       AS listings_disponibles,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY price_ars)      AS adr_ars_mediana,
    COUNT(DISTINCT listing_id) FILTER (WHERE is_available)::NUMERIC
        / NULLIF(COUNT(DISTINCT listing_id), 0)                  AS tasa_disponibilidad
FROM bucketizado
GROUP BY destino, noche, lead_bucket
HAVING COUNT(DISTINCT listing_id) >= :min_listings
ORDER BY destino, noche, lead_bucket;


-- =============================================================================
-- CONSULTA 3 — fx : tipo de cambio implícito diario
-- Alimenta la conversión ARS/USD del subsistema aéreo, para que ambas series
-- usen exactamente el mismo FX. Registrar fx_source='metrica_fx_daily'.
-- =============================================================================
SELECT fx_date AS fecha, rate_ars_per_usd AS fx
FROM fx_daily
WHERE fx_date >= :fecha_desde
ORDER BY fx_date;


-- =============================================================================
-- VERIFICACIÓN — el rol NO debe poder escribir. Este INSERT DEBE FALLAR.
-- Criterio de aceptación 1 de F2.
-- =============================================================================
-- INSERT INTO price_observations (listing_id) VALUES (-1);
-- Esperado: ERROR: permission denied for table price_observations
