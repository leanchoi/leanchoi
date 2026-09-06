"""GENERADO POR specs/scripts/gen_catalogo.py — NO EDITAR A MANO.
Fuente: specs/catalogo/indicadores.yaml (v1)
"""
from __future__ import annotations

VERSION_CATALOGO = 1

INDICADORES: dict[str, dict] = {
    "frecuencias_semanales": {
        "nombre": "Frecuencias semanales de llegada",
        "familia": "conectividad",
        "unidad": "vuelos",
        "confianza": "A",
        "cobertura_minima": 1.0,
        "direccion": "alto",
        "grano": [
            "ruta",
            "mes"
        ],
        "fuentes": [
            "ext_anac_mensual",
            "air_fact_leadtime"
        ],
        "doc": "docs/02#4"
    },
    "butacas_mes": {
        "nombre": "Butacas ofrecidas por mes",
        "familia": "conectividad",
        "unidad": "plazas",
        "confianza": "A",
        "cobertura_minima": 1.0,
        "direccion": "alto",
        "grano": [
            "ruta",
            "mes"
        ],
        "fuentes": [
            "ext_anac_mensual"
        ],
        "doc": "docs/02#4.1"
    },
    "lf_real": {
        "nombre": "Factor de ocupación aéreo real",
        "familia": "conectividad",
        "unidad": "pct",
        "confianza": "A",
        "cobertura_minima": 1.0,
        "direccion": "alto",
        "grano": [
            "ruta",
            "mes"
        ],
        "fuentes": [
            "ext_anac_mensual"
        ],
        "doc": "docs/07#2"
    },
    "sigma_aereo_pct": {
        "nombre": "Cuota estructural máxima del canal aéreo",
        "familia": "conectividad",
        "unidad": "pct",
        "confianza": "B",
        "cobertura_minima": 1.0,
        "direccion": "neutro",
        "grano": [
            "destino",
            "mes"
        ],
        "fuentes": [
            "ext_anac_mensual",
            "oit_pernoctes"
        ],
        "doc": "docs/02#4.2"
    },
    "isa_idx": {
        "nombre": "Índice de Suficiencia Aérea",
        "familia": "conectividad",
        "unidad": "idx",
        "confianza": "B",
        "cobertura_minima": 1.0,
        "direccion": "alto",
        "grano": [
            "destino",
            "mes"
        ],
        "fuentes": [
            "ext_anac_mensual",
            "oit_plazas"
        ],
        "doc": "docs/02#4.1"
    },
    "valor_marginal_frecuencia": {
        "nombre": "Valor marginal de una frecuencia semanal",
        "familia": "conectividad",
        "unidad": "pernoctes",
        "confianza": "C",
        "cobertura_minima": 1.0,
        "direccion": "alto",
        "grano": [
            "ruta"
        ],
        "fuentes": [
            "ext_anac_mensual",
            "oit_estadia"
        ],
        "doc": "docs/02#4.3"
    },
    "tarifa_rt_med_ars": {
        "nombre": "Tarifa aérea ida y vuelta (mediana)",
        "familia": "costo",
        "unidad": "ars",
        "confianza": "B",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "ruta",
            "flight_date",
            "lead_bucket"
        ],
        "fuentes": [
            "air_fact_leadtime"
        ],
        "doc": "docs/02#1"
    },
    "precio_min_ars": {
        "nombre": "Tarifa más barata disponible",
        "familia": "costo",
        "unidad": "ars",
        "confianza": "B",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "ruta",
            "flight_date",
            "observed_date"
        ],
        "fuentes": [
            "air_fare_observations",
            "air_fare_ladder"
        ],
        "doc": "docs/01#3.3"
    },
    "efecto_composicion_pp": {
        "nombre": "Alza por agotamiento de clases bajas",
        "familia": "costo",
        "unidad": "pp",
        "confianza": "B",
        "cobertura_minima": 0.8,
        "direccion": "neutro",
        "grano": [
            "ruta",
            "flight_date",
            "observed_date"
        ],
        "fuentes": [
            "air_fare_ladder"
        ],
        "doc": "docs/01#3.3"
    },
    "efecto_precio_pp": {
        "nombre": "Alza por reprecio de la escalera",
        "familia": "costo",
        "unidad": "pp",
        "confianza": "B",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "ruta",
            "flight_date",
            "observed_date"
        ],
        "fuentes": [
            "air_fare_ladder"
        ],
        "doc": "docs/01#3.3"
    },
    "vuelos_dia": {
        "nombre": "Vuelos operados en el día",
        "familia": "conectividad",
        "unidad": "vuelos",
        "confianza": "B",
        "cobertura_minima": 0.8,
        "direccion": "alto",
        "grano": [
            "ruta",
            "flight_date",
            "observed_date"
        ],
        "fuentes": [
            "air_fare_observations"
        ],
        "doc": "docs/01#3.3"
    },
    "fx_blue_venta": {
        "nombre": "Dólar blue, venta",
        "familia": "calidad",
        "unidad": "ars",
        "confianza": "B",
        "cobertura_minima": 1.0,
        "direccion": "neutro",
        "grano": [
            "fecha"
        ],
        "fuentes": [
            "ext_fx_diario"
        ],
        "doc": "docs/01#3.4"
    },
    "tarifa_km_ars": {
        "nombre": "Tarifa por kilómetro",
        "familia": "costo",
        "unidad": "ars",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "ruta",
            "mes"
        ],
        "fuentes": [
            "air_fact_leadtime",
            "air_dim_rutas"
        ],
        "doc": "docs/02#3.1"
    },
    "ipa_residual_pp": {
        "nombre": "Sobreprecio aéreo no explicado",
        "familia": "costo",
        "unidad": "pp",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "ruta",
            "mes"
        ],
        "fuentes": [
            "air_fact_leadtime",
            "air_dim_rutas"
        ],
        "doc": "docs/02#3.2"
    },
    "gap_competencia_pp": {
        "nombre": "Brecha atribuible a falta de competencia",
        "familia": "costo",
        "unidad": "pp",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "ruta",
            "mes"
        ],
        "fuentes": [
            "air_fact_leadtime"
        ],
        "doc": "docs/02#3.2"
    },
    "prima_monopolio_ar_pct": {
        "nombre": "Prima de monopolio intra-aerolínea",
        "familia": "costo",
        "unidad": "pct",
        "confianza": "B",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "flight_date",
            "lead_bucket"
        ],
        "fuentes": [
            "air_fact_leadtime",
            "air_dim_rutas"
        ],
        "doc": "docs/02#3.2"
    },
    "ttci_ars": {
        "nombre": "Índice de Costo Total de Viaje",
        "familia": "costo",
        "unidad": "ars",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "destino",
            "gateway",
            "fecha",
            "lead_bucket"
        ],
        "fuentes": [
            "air_gateway_costs",
            "ota_fact_dia"
        ],
        "doc": "docs/02#2.1"
    },
    "ttci_pppn_ars": {
        "nombre": "Costo total por persona y por noche",
        "familia": "costo",
        "unidad": "ars",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "destino",
            "gateway",
            "fecha"
        ],
        "fuentes": [
            "air_gateway_costs",
            "ota_fact_dia"
        ],
        "doc": "docs/02#2.1"
    },
    "brecha_paquete_pct": {
        "nombre": "Brecha de paquete vs benchmark",
        "familia": "costo",
        "unidad": "pct",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "fecha",
            "lead_bucket"
        ],
        "fuentes": [
            "air_gateway_costs",
            "ota_fact_dia"
        ],
        "doc": "docs/02#8.2"
    },
    "n_estrella_noches": {
        "nombre": "Umbral de estadía compensatoria",
        "familia": "costo",
        "unidad": "noches",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "fecha"
        ],
        "fuentes": [
            "air_gateway_costs",
            "ota_fact_dia"
        ],
        "doc": "docs/02#2.3"
    },
    "ic_compensabilidad": {
        "nombre": "Índice de Compensabilidad",
        "familia": "costo",
        "unidad": "ratio",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "alto",
        "grano": [
            "fecha",
            "noches"
        ],
        "fuentes": [
            "air_gateway_costs",
            "ota_fact_dia"
        ],
        "doc": "docs/02#2.4"
    },
    "ifpe_pct": {
        "nombre": "Índice de Fuga de Puerta de Entrada",
        "familia": "costo",
        "unidad": "pct",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "origen",
            "periodo"
        ],
        "fuentes": [
            "air_gateway_costs",
            "ota_fact_dia"
        ],
        "doc": "docs/02#2.2"
    },
    "adr_med_ars": {
        "nombre": "Tarifa diaria promedio (mediana)",
        "familia": "mercado",
        "unidad": "ars",
        "confianza": "B",
        "cobertura_minima": 0.8,
        "direccion": "neutro",
        "grano": [
            "destino",
            "fecha",
            "tipologia"
        ],
        "fuentes": [
            "ota_fact_dia"
        ],
        "doc": "docs/03#2.3"
    },
    "ocupacion_implicita_pct": {
        "nombre": "Ocupación implícita OTA",
        "familia": "mercado",
        "unidad": "pct",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "alto",
        "grano": [
            "destino",
            "fecha",
            "lead_bucket"
        ],
        "fuentes": [
            "ota_fact_leadtime"
        ],
        "doc": "docs/03#2.3"
    },
    "pace_rel_ratio": {
        "nombre": "Pace de reservas relativo",
        "familia": "mercado",
        "unidad": "ratio",
        "confianza": "B",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "destino",
            "fecha",
            "lead_bucket"
        ],
        "fuentes": [
            "ota_fact_leadtime"
        ],
        "doc": "docs/02#8.2"
    },
    "l90_dias": {
        "nombre": "Punto de congelamiento de reservas",
        "familia": "mercado",
        "unidad": "dias",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "alto",
        "grano": [
            "destino",
            "temporada"
        ],
        "fuentes": [
            "ota_fact_leadtime"
        ],
        "doc": "docs/02#5.2"
    },
    "ocupacion_oit_pct": {
        "nombre": "Ocupación hotelera oficial",
        "familia": "demanda",
        "unidad": "pct",
        "confianza": "A",
        "cobertura_minima": 1.0,
        "direccion": "alto",
        "grano": [
            "destino",
            "mes"
        ],
        "fuentes": [
            "oit_ocupacion"
        ],
        "doc": "docs/02#7"
    },
    "multiplicador_pernoctes_pax": {
        "nombre": "Pernoctes por pasajero aéreo",
        "familia": "demanda",
        "unidad": "ratio",
        "confianza": "B",
        "cobertura_minima": 1.0,
        "direccion": "neutro",
        "grano": [
            "destino",
            "mes"
        ],
        "fuentes": [
            "ext_anac_mensual",
            "oit_pernoctes"
        ],
        "doc": "docs/07#3"
    },
    "lf_proyectado_pct": {
        "nombre": "Factor de ocupación aéreo proyectado",
        "familia": "riesgo",
        "unidad": "pct",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "alto",
        "grano": [
            "ruta",
            "semana_objetivo"
        ],
        "fuentes": [
            "air_fact_leadtime",
            "ext_anac_mensual"
        ],
        "doc": "docs/07#2"
    },
    "exposicion_fiscal_ars": {
        "nombre": "Exposición fiscal del acuerdo de conectividad",
        "familia": "riesgo",
        "unidad": "ars",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "ruta",
            "periodo_acuerdo"
        ],
        "fuentes": [
            "air_fact_leadtime",
            "ext_anac_mensual"
        ],
        "doc": "docs/07#2"
    },
    "iat_idx": {
        "nombre": "Índice de Alerta Temprana",
        "familia": "riesgo",
        "unidad": "idx",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "destino",
            "semana_objetivo"
        ],
        "fuentes": [
            "x_fact_alertas"
        ],
        "doc": "docs/02#8.3"
    },
    "pernoctes_en_riesgo": {
        "nombre": "Pernoctes en riesgo",
        "familia": "riesgo",
        "unidad": "pernoctes",
        "confianza": "C",
        "cobertura_minima": 0.8,
        "direccion": "bajo",
        "grano": [
            "destino",
            "semana_objetivo"
        ],
        "fuentes": [
            "x_fact_alertas",
            "oit_plazas"
        ],
        "doc": "docs/02#8.5"
    },
    "cobertura_captura_pct": {
        "nombre": "Cobertura de captura",
        "familia": "calidad",
        "unidad": "pct",
        "confianza": "A",
        "cobertura_minima": 1.0,
        "direccion": "alto",
        "grano": [
            "ruta",
            "periodo"
        ],
        "fuentes": [
            "air_scrape_runs"
        ],
        "doc": "docs/01#3"
    },
    "frescura_dias": {
        "nombre": "Frescura del dato",
        "familia": "calidad",
        "unidad": "dias",
        "confianza": "A",
        "cobertura_minima": 1.0,
        "direccion": "bajo",
        "grano": [
            "dataset"
        ],
        "fuentes": [
            "meta.json"
        ],
        "doc": "docs/03#7"
    }
}

REGLAS: tuple[str, ...] = ('riesgo_fiscal_umbral', 'oportunidad_frecuencia', 'capacidad_agotada', 'paquete_expulsivo', 'fuga_puerta_entrada', 'compensacion_imposible', 'n_estrella_inalcanzable', 'ventana_pauta_cerrandose', 'desacople_regional', 'gap_no_explicado', 'cobertura_insuficiente')


def validar_columnas(tabla: str, columnas: list[str]) -> list[str]:
    """Devuelve las columnas que no corresponden a ningún indicador del catálogo.

    Se llama desde emit.py antes de escribir cada tabla oro. Una columna que no
    está en el catálogo es un número sin definición, sin dueño y sin decisión
    asociada: exactamente lo que convierte un tablero en un despelote.
    """
    exentas = {"fecha", "flight_date", "observed_date", "lead_dias", "lead_bucket",
               "destino", "origen", "ruta", "origin_iata", "dest_iata", "gateway_iata",
               "tipologia", "mes", "periodo", "semana_objetivo", "aerolinea", "corrida"}
    return [c for c in columnas if c not in INDICADORES and c not in exentas]


def cobertura_suficiente(indicador: str, cobertura: float) -> bool:
    meta = INDICADORES.get(indicador)
    return meta is not None and cobertura >= meta["cobertura_minima"]


def es_publicable(indicador: str) -> bool:
    """Solo los indicadores oficiales u observados salen del organismo."""
    meta = INDICADORES.get(indicador)
    return meta is not None and meta["confianza"] in ("A", "B")
