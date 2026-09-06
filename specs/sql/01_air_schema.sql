-- =============================================================================
-- MÉTRICA AÉREOS — Contrato lógico de la capa PLATA
-- =============================================================================
-- Reemplaza el DDL de la §3.4 del informe original. Corrige los 9 defectos
-- enumerados en docs/00-revision-critica.md (H3).
--
-- IMPORTANTE: en la arquitectura recomendada (docs/03 §3) estas tablas se
-- MATERIALIZAN COMO PARQUET particionado, no como PostgreSQL. Este archivo
-- define tipos, claves y restricciones -- el contrato lógico que el escritor
-- Parquet debe respetar. Se deja en SQL ejecutable para poder instanciarlo el
-- día que aparezca un consumidor server-side que lo justifique.
--
-- Si se instancia en PostgreSQL: usar una base PROPIA, nunca la de Métrica (I1).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- DIMENSIÓN: aeropuertos
-- Semilla en specs/config/aeropuertos.csv
-- ICAO es necesario porque los datasets de ANAC pueden usar OACI en vez de IATA
-- (verificar en F0-4).
-- -----------------------------------------------------------------------------
CREATE TABLE air_airports (
    iata_code       CHAR(3)      PRIMARY KEY,
    icao_code       CHAR(4)      UNIQUE,
    name            VARCHAR(120) NOT NULL,
    city            VARCHAR(80)  NOT NULL,
    province        VARCHAR(80)  NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    is_city_code    BOOLEAN      NOT NULL DEFAULT FALSE,  -- BUE agrupa AEP+EZE
    coord_verified  BOOLEAN      NOT NULL DEFAULT FALSE,  -- validar vs OurAirports
                                                          -- antes de publicar
                                                          -- cualquier tarifa/km
    CONSTRAINT ck_lat CHECK (latitude  BETWEEN -90  AND 90),
    CONSTRAINT ck_lon CHECK (longitude BETWEEN -180 AND 180)
);

-- -----------------------------------------------------------------------------
-- DIMENSIÓN: rutas monitoreadas
-- distance_km se calcula por haversine sobre air_airports; no se carga a mano.
-- -----------------------------------------------------------------------------
CREATE TABLE air_routes (
    route_id        SERIAL PRIMARY KEY,
    origin_iata     CHAR(3) NOT NULL REFERENCES air_airports(iata_code),
    dest_iata       CHAR(3) NOT NULL REFERENCES air_airports(iata_code),
    tier            SMALLINT NOT NULL,        -- 1 núcleo .. 4 combustible de regresión
    distance_km     DOUBLE PRECISION,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_route  UNIQUE (origin_iata, dest_iata),
    CONSTRAINT ck_tier   CHECK (tier BETWEEN 1 AND 4),
    CONSTRAINT ck_no_self CHECK (origin_iata <> dest_iata)
);

-- -----------------------------------------------------------------------------
-- BITÁCORA DE CORRIDAS  ← corrige H3-#4
-- Sin esta tabla es IMPOSIBLE distinguir "no había vuelo" de "no se pudo medir".
-- Se escribe UNA FILA POR CONSULTA PLANIFICADA, haya salido bien o mal.
-- -----------------------------------------------------------------------------
CREATE TYPE air_run_status AS ENUM (
    'ok',
    'sin_resultados',           -- respuesta válida, cero itinerarios, causa DESCONOCIDA
    'sin_servicio',             -- cero itinerarios Y la respuesta es estructuralmente
                                -- válida Y el calendario de servicio versionado explica
                                -- la ausencia. ES UN DATO, no un hueco: no descuenta
                                -- cobertura. Requiere LAS TRES condiciones: sin la de
                                -- validez estructural, un bloqueo blando que devuelva
                                -- HTTP 200 vacío en un día sin servicio se registraría
                                -- como dato legítimo, que es el peor error posible.
    'bloqueado',                -- 429 / interstitial / captcha
    'timeout',
    'parse_error',
    'omitido_por_presupuesto',  -- tope diario alcanzado
    'omitido_por_preflight'     -- memoria o Chromium activo
);

CREATE TABLE air_scrape_runs (
    run_id          BIGSERIAL PRIMARY KEY,
    batch_id        UUID        NOT NULL,      -- agrupa una corrida nocturna
    observed_at     TIMESTAMPTZ NOT NULL,
    observed_date   DATE        NOT NULL,
    origin_iata     CHAR(3)     NOT NULL,
    dest_iata       CHAR(3)     NOT NULL,
    flight_date     DATE        NOT NULL,
    return_date     DATE,                      -- NULL = one-way
    pax_count       SMALLINT    NOT NULL DEFAULT 1,
    currency        CHAR(3)     NOT NULL DEFAULT 'ARS',
    source          VARCHAR(24) NOT NULL,      -- gflights_tfs | serpapi | playwright_ar
    status          air_run_status NOT NULL,
    itineraries_found SMALLINT  NOT NULL DEFAULT 0,
    itineraries_por_aerolinea JSONB,           -- {"AR":3,"FO":0,"WJ":2} — el canario lo
                                               -- necesita por operador, no en total
    respuesta_valida BOOLEAN,                  -- ¿la respuesta contiene evidencia de que
                                               -- el buscador entendió la consulta (metadatos
                                               -- de ruta/aeropuertos)? Es el discriminador
                                               -- entre "no hay vuelos" y "me bloquearon"
    calendario_explica BOOLEAN,                -- ¿el calendario de servicio versionado
                                               -- explica el cero? Se guarda el HECHO para
                                               -- poder RE-DERIVAR la clasificación si el
                                               -- calendario cambia, sin volver a scrapear
    calendario_version SMALLINT,
    latency_ms      INTEGER,
    http_status     SMALLINT,
    collector_version VARCHAR(20) NOT NULL,
    parser_version    VARCHAR(20) NOT NULL,
    raw_ref         TEXT,                      -- ruta al HTML en bronce, si se guardó
    error_detail    TEXT
);

CREATE INDEX idx_runs_cobertura ON air_scrape_runs
    (observed_date, origin_iata, dest_iata, flight_date);
CREATE INDEX idx_runs_status ON air_scrape_runs (observed_date, status)
    WHERE status <> 'ok';

-- -----------------------------------------------------------------------------
-- HECHOS: observaciones de tarifa
-- Corrige H3: agrega return_date, trip_type, pax_count, moneda con procedencia,
-- itinerary_hash generado (dedupe correcto con conexiones), NUMERIC para dinero,
-- timestamps completos en vez de TIME suelto, y escalas como arreglo.
-- -----------------------------------------------------------------------------
CREATE TYPE air_trip_type AS ENUM ('one_way', 'round_trip');

CREATE TABLE air_fare_observations (
    obs_id          BIGSERIAL PRIMARY KEY,
    run_id          BIGINT      NOT NULL REFERENCES air_scrape_runs(run_id),

    -- Grano de dos fechas (heredado de Métrica) + retorno
    observed_date   DATE        NOT NULL,
    flight_date     DATE        NOT NULL,
    return_date     DATE,
    lead_days       INTEGER     NOT NULL,      -- flight_date - observed_date
    trip_type       air_trip_type NOT NULL,
    pax_count       SMALLINT    NOT NULL DEFAULT 1,

    origin_iata     CHAR(3)     NOT NULL REFERENCES air_airports(iata_code),
    dest_iata       CHAR(3)     NOT NULL REFERENCES air_airports(iata_code),

    -- Itinerario
    airline_code    VARCHAR(3)  NOT NULL,      -- AR, FO, WJ
    airline_name    VARCHAR(60),
    flight_numbers  TEXT,                      -- "AR1892" o "AR1892,AR1734"
    depart_local    TIMESTAMP,                 -- fecha+hora local de salida
    arrive_local    TIMESTAMP,                 -- puede caer al día siguiente
    duration_minutes INTEGER,
    stops_count     SMALLINT    NOT NULL DEFAULT 0,
    stopover_iatas  TEXT[],                    -- corrige VARCHAR(50) con lista adentro

    -- Precio, con procedencia completa
    price_amount    NUMERIC(12,2) NOT NULL,    -- por pasajero, en `currency`
    currency        CHAR(3)     NOT NULL,
    price_ars       NUMERIC(12,2),             -- convertido
    price_usd       NUMERIC(12,2),             -- convertido
    fx_rate         NUMERIC(14,6),
    fx_source       VARCHAR(24),               -- metrica_fx_daily | bcra | gflights
    is_cheapest_of_query BOOLEAN NOT NULL DEFAULT FALSE,

    -- Filtro de pertinencia. Google devuelve itinerarios que técnicamente conectan el
    -- par origen-destino pero que NO son mercado doméstico: BUE->BRC vía São Paulo en
    -- GOL, o vía Santiago en LATAM. Ni GOL ni LATAM operan cabotaje argentino, así que
    -- cualquier vuelo suyo en una ruta doméstica es un desvío internacional.
    -- Se REGISTRAN (la capa bronce guarda hechos) pero se EXCLUYEN de los agregados:
    -- contaminan la mediana, pueden ganar el is_cheapest_of_query, y rompen del todo la
    -- normalización por kilómetro, que se calcula contra la distancia geodésica directa.
    itinerario_relevante BOOLEAN NOT NULL DEFAULT TRUE,
    motivo_irrelevancia VARCHAR(40),   -- escala_internacional | duracion_excesiva |
                                       -- escalas_excesivas | operador_sin_cabotaje

    -- Enriquecimiento opcional (solo sonda Playwright — nunca camino crítico, I9)
    fare_brand      VARCHAR(50),
    seats_remaining SMALLINT,

    source          VARCHAR(24) NOT NULL,
    collector_version VARCHAR(20) NOT NULL,
    parser_version    VARCHAR(20) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Dedupe correcto: md5 sobre texto normalizado. NUNCA usar una UNIQUE que
    -- incluya columnas nullables (H3-#3: en PostgreSQL NULL <> NULL, así que
    -- una UNIQUE con flight_number nullable NO deduplica).
    -- to_char() se usa en lugar de ::text porque ::text sobre date/timestamp es
    -- STABLE (depende de DateStyle) y las columnas generadas exigen IMMUTABLE.
    itinerary_hash  TEXT GENERATED ALWAYS AS (
        md5(
            origin_iata || '>' || dest_iata
            || '|' || to_char(flight_date, 'YYYY-MM-DD')
            || '|' || coalesce(to_char(return_date, 'YYYY-MM-DD'), '-')
            || '|' || airline_code
            || '|' || coalesce(flight_numbers, '-')
            || '|' || coalesce(to_char(depart_local, 'YYYY-MM-DD HH24:MI'), '-')
            || '|' || coalesce(fare_brand, '-')
            || '|' || pax_count::text
            || '|' || currency
        )
    ) STORED,

    CONSTRAINT ck_lead     CHECK (lead_days = flight_date - observed_date),
    CONSTRAINT ck_price    CHECK (price_amount > 0),
    CONSTRAINT ck_pax      CHECK (pax_count BETWEEN 1 AND 9),
    CONSTRAINT ck_stops    CHECK (stops_count >= 0),
    CONSTRAINT ck_return   CHECK (return_date IS NULL OR return_date >= flight_date),
    CONSTRAINT ck_triptype CHECK (
        (trip_type = 'one_way'    AND return_date IS NULL) OR
        (trip_type = 'round_trip' AND return_date IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_fare_obs ON air_fare_observations (observed_date, itinerary_hash);
CREATE INDEX idx_fare_lookup  ON air_fare_observations (dest_iata, flight_date, lead_days);
CREATE INDEX idx_fare_route   ON air_fare_observations (origin_iata, dest_iata, flight_date);
CREATE INDEX idx_fare_leadcell ON air_fare_observations (origin_iata, dest_iata, lead_days, flight_date);

-- Si se instancia en PostgreSQL con volumen alto, particionar por rango de
-- observed_date (mensual) y crear los índices por partición.

-- -----------------------------------------------------------------------------
-- HECHOS: capacidad y demanda REAL (ANAC/SIAC) — docs/05
-- Esta es la fuente del factor de ocupación aéreo. NO se infiere por scraping.
-- -----------------------------------------------------------------------------
CREATE TABLE air_capacity_monthly (
    period_month    DATE     NOT NULL,          -- primer día del mes
    origin_iata     CHAR(3)  NOT NULL REFERENCES air_airports(iata_code),
    dest_iata       CHAR(3)  NOT NULL REFERENCES air_airports(iata_code),
    airline_code    VARCHAR(3),                 -- NULL = todas
    flights         INTEGER  NOT NULL,
    seats_offered   INTEGER  NOT NULL,          -- butacas
    passengers      INTEGER  NOT NULL,
    load_factor     DOUBLE PRECISION
        GENERATED ALWAYS AS (
            CASE WHEN seats_offered > 0
                 THEN passengers::DOUBLE PRECISION / seats_offered END
        ) STORED,
    source          VARCHAR(24) NOT NULL DEFAULT 'anac_siac',
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (period_month, origin_iata, dest_iata, airline_code),
    CONSTRAINT ck_seats CHECK (seats_offered >= 0),
    CONSTRAINT ck_pax   CHECK (passengers   >= 0)
);

-- -----------------------------------------------------------------------------
-- Función auxiliar: distancia geodésica (haversine) para air_routes.distance_km
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION air_haversine_km(
    lat1 DOUBLE PRECISION, lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION, lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
    SELECT 6371.0088 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2), 2)
    ));
$$ LANGUAGE SQL IMMUTABLE STRICT;

-- UPDATE air_routes r SET distance_km = air_haversine_km(a.latitude, a.longitude,
--                                                        b.latitude, b.longitude)
--   FROM air_airports a, air_airports b
--  WHERE a.iata_code = r.origin_iata AND b.iata_code = r.dest_iata;
