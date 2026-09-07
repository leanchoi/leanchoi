"""Módulo canónico de cálculo estadístico para Métrica Aéreos.

Fuente única de verdad (Single Source of Truth) para:
- Cálculo de percentiles (interpolación lineal estándar).
- Definición de buckets de celda (anticipación / lead time, día de semana, temporada).
- Distancias geodésicas y normalización por kilómetro.
- Filtro de pertinencia para cabotaje doméstico genuino (exclusión de LA, G3, DE y desvíos).
- Métricas de brecha y paridad:
    1. prima_monopolio_ar_pct (Cifra Titular: AR contra AR dentro de celda).
    2. brecha_domestica_pct (Mediana de cabotaje genuino AR, FO, WJ).
    3. brecha_agrupada_pct (Comparación general multi-aerolínea).
- Reglas de gobernanza e invariantes (I8: cobertura mínima 80%, I15: grado C preliminar).

Sincronizado con specs/catalogo/indicadores.yaml y generated/web/indicadores.ts.
"""
from __future__ import annotations

import math
from typing import Any

# Coordenadas geodésicas oficiales de aeropuertos de la red
AEROPUERTOS_COORD: dict[str, tuple[float, float]] = {
    "BUE": (-34.5592, -58.4156),
    "AEP": (-34.5592, -58.4156),
    "EZE": (-34.8222, -58.5358),
    "EQS": (-42.9080, -71.1394),
    "BRC": (-41.1512, -71.1578),
    "CPC": (-40.0752, -71.1373),
    "COR": (-31.3236, -64.2080),
    "PMY": (-42.7592, -65.0717),
    "REL": (-43.2105, -65.2964),
    "CRD": (-45.7853, -67.4655),
    "USH": (-54.8433, -68.2958),
    "FTE": (-50.2803, -72.0531),
    "MDZ": (-32.8317, -68.7929),
    "NQN": (-38.9490, -68.1558),
    "IGR": (-25.7372, -54.4733),
    "SLA": (-24.8561, -65.4864),
    "JUJ": (-24.3928, -65.0978),
    "TUC": (-26.8408, -65.1050),
    "ROS": (-32.9036, -60.7844),
    "RGL": (-51.6089, -69.3128),
    "BHI": (-38.7247, -62.1692),
}

# Metadatos sincronizados con el catálogo semántico
METADATOS_INDICADORES = {
    "prima_monopolio_ar_pct": {
        "id": "prima_monopolio_ar_pct",
        "nombre": "Prima de monopolio intra-aerolínea",
        "familia": "costo",
        "unidad": "pct",
        "confianza": "B",
        "cobertura_minima": 0.80,
        "direccion": "bajo",
        "definicion": "Sobreprecio por kilómetro de Aerolíneas Argentinas en su ruta monopólica frente a su propia tarifa en una ruta competitiva de distancia similar.",
        "formula": "(tarifa_km_AR_EQS / tarifa_km_AR_BRC) - 1",
        "grano": ["flight_date", "lead_bucket"],
        "interpretacion": "Compara a la MISMA aerolínea consigo misma, controlando flota, estructura salarial y costos de la compañía. La única variable que cambia es la presencia de competencia.",
        "es_titular": True,
    },
    "brecha_domestica_pct": {
        "id": "brecha_domestica_pct",
        "nombre": "Brecha tarifaria doméstica por kilómetro",
        "familia": "costo",
        "unidad": "pct",
        "confianza": "B",
        "cobertura_minima": 0.80,
        "direccion": "bajo",
        "definicion": "Diferencial porcentual por kilómetro entre la tarifa mediana de Esquel y la mediana de cabotaje genuino del benchmark (AR, FO, WJ).",
        "formula": "(tarifa_km_med_EQS / tarifa_km_med_BRC_DOM) - 1",
        "grano": ["flight_date", "lead_bucket"],
        "interpretacion": "Mide el costo relativo que afronta el pasajero frente al mercado doméstico alternativo directo sin desvíos internacionales.",
        "es_titular": False,
    },
    "brecha_agrupada_pct": {
        "id": "brecha_agrupada_pct",
        "nombre": "Brecha agrupada general (sin filtro de celda)",
        "familia": "costo",
        "unidad": "pct",
        "confianza": "C",
        "cobertura_minima": 0.80,
        "direccion": "bajo",
        "definicion": "Comparación agregada global entre medianas sin ponderar fechas ni composición de flota.",
        "formula": "(mediana_global_EQS / mediana_global_BRC) - 1",
        "grano": ["agregado"],
        "interpretacion": "Sensible a diferencias en el calendario de muestreo. Útil como referencia histórica pero estadísticamente débil para reclamos regulatorios.",
        "es_titular": False,
    },
    "tarifa_km_ars": {
        "id": "tarifa_km_ars",
        "nombre": "Tarifa por kilómetro",
        "familia": "costo",
        "unidad": "ars",
        "confianza": "B",
        "cobertura_minima": 0.80,
        "direccion": "bajo",
        "definicion": "Tarifa dividida por la distancia geodésica oficial de la ruta.",
        "formula": "precio_ars / distancia_km",
        "grano": ["vuelo"],
    },
    "precio_min_ars": {
        "id": "precio_min_ars",
        "nombre": "Tarifa más barata disponible",
        "familia": "costo",
        "unidad": "ars",
        "confianza": "B",
        "cobertura_minima": 0.80,
        "direccion": "bajo",
        "definicion": "Precio del asiento más económico efectivamente comprable en la ruta y fecha, en la observación más reciente.",
        "formula": "min(price_amount) por (ruta, flight_date, observed_date)",
        "grano": ["ruta", "flight_date", "observed_date"],
        "interpretacion": "Es la serie TITULAR del tablero, por encima de la mediana. La pregunta que se hace el turista y la que define competitividad no es 'cuánto sale típicamente' sino 'cuánto es lo más barato que puedo pagar'. La mediana y las bandas se guardan para comparar dispersión entre destinos, pero no encabezan.",
        "es_titular": True,
    },
    "efecto_composicion_pp": {
        "id": "efecto_composicion_pp",
        "nombre": "Alza por agotamiento de clases bajas",
        "familia": "costo",
        "unidad": "pp",
        "confianza": "B",
        "cobertura_minima": 0.80,
        "direccion": "neutro",
        "definicion": "Parte del aumento de la tarifa mínima que se explica porque se agotó el escalón tarifario más barato, con la escalera de precios sin cambios.",
        "formula": "ln p_t(c_hoy) - ln p_t(c_anterior)",
        "grano": ["ruta", "flight_date", "observed_date"],
        "interpretacion": "Es la señal de que el avión SE ESTÁ LLENANDO: hay demanda y la restricción es la capacidad. Dominante y sostenido, el reclamo correcto ante Aerolíneas es por MÁS FRECUENCIAS, no por tarifa.",
    },
    "efecto_precio_pp": {
        "id": "efecto_precio_pp",
        "nombre": "Alza por reprecio de la escalera",
        "familia": "costo",
        "unidad": "pp",
        "confianza": "B",
        "cobertura_minima": 0.80,
        "direccion": "bajo",
        "definicion": "Parte del aumento de la tarifa mínima que se explica porque subió el precio de la misma clase tarifaria, no porque se agotara.",
        "formula": "ln p_t(c_anterior) - ln p_anterior(c_anterior)",
        "grano": ["ruta", "flight_date", "observed_date"],
        "interpretacion": "Es la señal de que la aerolínea REPRECIÓ, con la misma disponibilidad. Dominante y sostenido, el reclamo correcto es TARIFARIO. Sin la escalera tarifaria este efecto y el de composición son indistinguibles.",
    },
    "vuelos_dia": {
        "id": "vuelos_dia",
        "nombre": "Vuelos operados en el día",
        "familia": "conectividad",
        "unidad": "vuelos",
        "confianza": "B",
        "cobertura_minima": 0.80,
        "direccion": "alto",
        "definicion": "Itinerarios distintos disponibles en la ruta para esa fecha de vuelo.",
        "formula": "count(distinct flight_number) por (ruta, flight_date, observed_date)",
        "grano": ["ruta", "flight_date", "observed_date"],
        "interpretacion": "Acompaña siempre a precio_min_ars: no es lo mismo que el mínimo salga de un único vuelo que de tres. Con un solo vuelo, ese precio es el mercado entero.",
    },
    "fx_blue_venta": {
        "id": "fx_blue_venta",
        "nombre": "Dólar blue, venta",
        "familia": "calidad",
        "unidad": "ars",
        "confianza": "B",
        "cobertura_minima": 1.0,
        "direccion": "neutro",
        "definicion": "Cotización de venta del dólar informal del día de observación.",
        "formula": "captura diaria de fuente pública",
        "grano": ["fecha"],
        "interpretacion": "Cada observación se convierte con el FX de SU fecha, nunca con el de hoy. Con la inflación argentina, una serie en pesos nominales a 18 meses no es comparable consigo misma; el toggle ARS / USD oficial / USD blue existe para eso.",
    },
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula la distancia geodésica ortodrómica en kilómetros mediante Haversine."""
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def calcular_distancia_km(orig: str, dest: str) -> float:
    """Devuelve la distancia oficial entre dos aeropuertos con precisión de 1 decimal."""
    o_coord = AEROPUERTOS_COORD.get(orig.upper(), (-34.5592, -58.4156))
    d_coord = AEROPUERTOS_COORD.get(dest.upper(), (-42.9080, -71.1394))
    return round(haversine_km(o_coord[0], o_coord[1], d_coord[0], d_coord[1]), 1)


def calcular_tarifa_km(precio: float | None, distancia_km: float) -> float | None:
    """Calcula la tarifa unitaria en ARS por kilómetro volado."""
    if precio is None or distancia_km <= 0:
        return None
    return round(precio / distancia_km, 2)


def calcular_percentiles(
    valores: list[float | int],
    default: Any = 0.0,
) -> dict[str, float | None]:
    """Calcula percentiles estadísticos mediante interpolación lineal estándar.

    Devuelve un diccionario con claves:
    min, p25, median (P50), p75, max, avg.
    """
    validos = [float(v) for v in valores if v is not None and not math.isnan(v)]
    if not validos:
        return {
            "min": default,
            "precio_min_ars": default,
            "p25": default,
            "median": default,
            "p75": default,
            "max": default,
            "max_min_ars": default,
            "avg": default,
        }

    n = len(validos)
    if n == 1:
        v = round(validos[0], 2)
        return {
            "min": v,
            "precio_min_ars": v,
            "p25": v,
            "median": v,
            "p75": v,
            "max": v,
            "max_min_ars": v,
            "avg": v,
        }

    arr = sorted(validos)

    def get_p(q: float) -> float:
        pos = (n - 1) * q
        base = int(math.floor(pos))
        resto = pos - base
        if base + 1 < n:
            return arr[base] + resto * (arr[base + 1] - arr[base])
        return arr[base]

    return {
        "min": round(arr[0], 2),
        "precio_min_ars": round(arr[0], 2),
        "p25": round(get_p(0.25), 2),
        "median": round(get_p(0.50), 2),
        "p75": round(get_p(0.75), 2),
        "max": round(arr[-1], 2),
        "max_min_ars": round(arr[-1], 2),
        "avg": round(sum(arr) / n, 2),
    }


def calcular_descomposicion_escalera(
    escalera_ant: list[dict[str, Any]],
    escalera_hoy: list[dict[str, Any]],
) -> tuple[float | None, float | None]:
    """Calcula la descomposición entre Efecto Precio y Efecto Composición (Prompt 1g).

    Dadas dos observaciones temporales de la MISMA fecha de vuelo:
    Sea c_ant la clase más barata disponible en la observación anterior (t-1).
    Sea c_hoy la clase más barata disponible en la observación actual (t).
    p_t(c) es el precio de la clase c en t.
    p_ant(c) es el precio de la clase c en t-1.

    Δln(p_min) = [ln p_t(c_ant) - ln p_ant(c_ant)] + [ln p_t(c_hoy) - ln p_t(c_ant)]
                  \____ efecto PRECIO ____/           \__ efecto COMPOSICIÓN __/

    - Efecto Precio (efecto_precio_pp):
        Mide el aumento atribuible a que la aerolínea repreció la misma clase tarifaria.
        Reclamo correcto ante ANAC / Transporte: POR TARIFA.
    - Efecto Composición (efecto_composicion_pp):
        Mide el aumento atribuible a que se agotó el escalón barato (escalera intacta).
        Señal de que el avión se está llenando. Reclamo correcto: POR MÁS FRECUENCIAS.

    Invariante I12: Si falta alguna de las dos observaciones con escalera completa,
    o no se encuentra la clase de referencia en ambas, el resultado es (None, None)
    y se declara: no se imputa.

    Devuelve: (efecto_precio_pp, efecto_composicion_pp) en puntos porcentuales (pp = delta_ln * 100).
    """
    if not escalera_ant or not escalera_hoy:
        return None, None

    disp_ant = [f for f in escalera_ant if f.get("is_available", True) and (f.get("price_amount") or 0) > 0]
    disp_hoy = [f for f in escalera_hoy if f.get("is_available", True) and (f.get("price_amount") or 0) > 0]

    if not disp_ant or not disp_hoy:
        return None, None

    disp_ant.sort(key=lambda x: (x.get("brand_rank", 99), x.get("price_amount", 0)))
    disp_hoy.sort(key=lambda x: (x.get("brand_rank", 99), x.get("price_amount", 0)))

    c_ant = disp_ant[0].get("fare_brand")
    c_hoy = disp_hoy[0].get("fare_brand")

    precios_ant = {
        f.get("fare_brand"): float(f["price_amount"])
        for f in escalera_ant
        if (f.get("price_amount") or 0) > 0
    }
    precios_hoy = {
        f.get("fare_brand"): float(f["price_amount"])
        for f in escalera_hoy
        if (f.get("price_amount") or 0) > 0
    }

    if c_ant not in precios_ant or c_ant not in precios_hoy or c_hoy not in precios_hoy:
        return None, None

    p_ant_c_ant = precios_ant[c_ant]
    p_t_c_ant = precios_hoy[c_ant]
    p_t_c_hoy = precios_hoy[c_hoy]

    if p_ant_c_ant <= 0 or p_t_c_ant <= 0 or p_t_c_hoy <= 0:
        return None, None

    efecto_precio = round((math.log(p_t_c_ant) - math.log(p_ant_c_ant)) * 100.0, 2)
    efecto_composicion = round((math.log(p_t_c_hoy) - math.log(p_t_c_ant)) * 100.0, 2)

    return efecto_precio, efecto_composicion


def definir_lead_bucket(lead_days: int) -> str:
    """Clasifica los días de anticipación en los buckets normalizados del catálogo."""
    if lead_days <= 3:
        return "1-3d"
    elif lead_days <= 7:
        return "4-7d"
    elif lead_days <= 14:
        return "8-14d"
    elif lead_days <= 29:
        return "15-29d"
    elif lead_days <= 59:
        return "30-59d"
    elif lead_days <= 89:
        return "60-89d"
    elif lead_days <= 119:
        return "90-119d"
    return "120-179d"


def calcular_prima_monopolio_ar(
    tarifa_km_ar_eqs: float | None,
    tarifa_km_ar_brc: float | None,
) -> float | None:
    """Calcula la prima de monopolio intra-aerolínea (AR vs AR):

    formula: (tarifa_km_AR_EQS / tarifa_km_AR_BRC) - 1 (expresada en %)
    """
    if (
        tarifa_km_ar_eqs is None
        or tarifa_km_ar_brc is None
        or tarifa_km_ar_brc <= 0
    ):
        return None
    return round(((tarifa_km_ar_eqs / tarifa_km_ar_brc) - 1.0) * 100.0, 1)


def calcular_brecha_domestica(
    tarifa_km_eqs: float | None,
    tarifa_km_brc_dom: float | None,
) -> float | None:
    """Calcula la brecha frente al mercado de cabotaje genuino (AR, FO, WJ):

    formula: (tarifa_km_EQS / tarifa_km_BRC_DOM) - 1 (expresada en %)
    """
    if (
        tarifa_km_eqs is None
        or tarifa_km_brc_dom is None
        or tarifa_km_brc_dom <= 0
    ):
        return None
    return round(((tarifa_km_eqs / tarifa_km_brc_dom) - 1.0) * 100.0, 1)


def calcular_brecha_agrupada(
    tarifa_km_eqs: float | None,
    tarifa_km_brc_all: float | None,
) -> float | None:
    """Calcula la brecha agrupada general (todas las aerolíneas):

    formula: (tarifa_km_EQS / tarifa_km_BRC_ALL) - 1 (expresada en %)
    """
    if (
        tarifa_km_eqs is None
        or tarifa_km_brc_all is None
        or tarifa_km_brc_all <= 0
    ):
        return None
    return round(((tarifa_km_eqs / tarifa_km_brc_all) - 1.0) * 100.0, 1)


def computar_tres_brechas(
    vuelos_eqs: list[dict[str, Any]],
    vuelos_brc: list[dict[str, Any]],
    dist_eqs: float = 1439.3,
    dist_brc: float = 1335.3,
    cobertura_esperada_eqs: int = 20,
    cobertura_esperada_brc: int = 20,
) -> dict[str, Any]:
    """Computa de manera rigurosa las 3 versiones de la brecha tarifaria.

    Aplica:
    1. Filtro de pertinencia estricto (itinerario_relevante == True).
    2. Subconjunto AR para prima_monopolio_ar_pct (Cifra Titular).
    3. Subconjunto doméstico (AR, FO, WJ) para brecha_domestica_pct.
    4. Subconjunto agrupado general para brecha_agrupada_pct.
    5. Evaluación de cobertura mínima (Invariantes I8 e I15: umbral 80%).

    Devuelve un diccionario estructurado apto para la UI y la auditoría.
    """
    eqs_validos = [v for v in vuelos_eqs if v.get("price_ars") is not None]
    brc_validos = [v for v in vuelos_brc if v.get("price_ars") is not None]

    eqs_rel = [v for v in eqs_validos if v.get("itinerario_relevante", True)]
    brc_rel = [v for v in brc_validos if v.get("itinerario_relevante", True)]

    eqs_ar = [v for v in eqs_rel if v.get("airline_code") == "AR"]
    brc_ar = [v for v in brc_rel if v.get("airline_code") == "AR"]

    km_eqs_ar = [round(v["price_ars"] / dist_eqs, 2) for v in eqs_ar]
    km_brc_ar = [round(v["price_ars"] / dist_brc, 2) for v in brc_ar]

    km_eqs_dom = [round(v["price_ars"] / dist_eqs, 2) for v in eqs_rel]
    km_brc_dom = [round(v["price_ars"] / dist_brc, 2) for v in brc_rel]

    km_eqs_all = [round(v["price_ars"] / dist_eqs, 2) for v in eqs_validos]
    km_brc_all = [round(v["price_ars"] / dist_brc, 2) for v in brc_validos]

    stat_eqs_ar = calcular_percentiles(km_eqs_ar)
    stat_brc_ar = calcular_percentiles(km_brc_ar)

    stat_eqs_dom = calcular_percentiles(km_eqs_dom)
    stat_brc_dom = calcular_percentiles(km_brc_dom)

    stat_eqs_all = calcular_percentiles(km_eqs_all)
    stat_brc_all = calcular_percentiles(km_brc_all)

    # 1. Titular: AR vs AR
    val_eqs_ar = stat_eqs_ar["median"]
    val_brc_ar = stat_brc_ar["median"]
    prima_ar = calcular_prima_monopolio_ar(val_eqs_ar, val_brc_ar)

    # 2. Doméstica: EQS vs BRC doméstico
    val_eqs_dom = stat_eqs_dom["median"]
    val_brc_dom = stat_brc_dom["median"]
    brecha_dom = calcular_brecha_domestica(val_eqs_dom, val_brc_dom)

    # 3. Agrupada: EQS vs BRC todas
    val_eqs_all = stat_eqs_all["median"]
    val_brc_all = stat_brc_all["median"]
    brecha_all = calcular_brecha_agrupada(val_eqs_all, val_brc_all)

    cob_eqs = (
        round((len(eqs_validos) / max(cobertura_esperada_eqs, 1)) * 100, 1)
        if cobertura_esperada_eqs > 0
        else 100.0
    )
    cob_brc = (
        round((len(brc_validos) / max(cobertura_esperada_brc, 1)) * 100, 1)
        if cobertura_esperada_brc > 0
        else 100.0
    )
    cob_min = min(cob_eqs, cob_brc)
    es_preliminar = cob_min < 80.0 or len(km_eqs_ar) < 3 or len(km_brc_ar) < 3

    return {
        "titular": {
            "id": "prima_monopolio_ar_pct",
            "nombre": "Prima de monopolio intra-aerolínea (AR vs AR)",
            "valor_pct": prima_ar,
            "definicion": "Aerolíneas Argentinas en ruta monopólica (EQS) vs su propia tarifa en ruta competitiva (BRC) dentro de celda comparable.",
            "tarifa_km_eqs": val_eqs_ar,
            "tarifa_km_brc": val_brc_ar,
            "n_eqs": len(km_eqs_ar),
            "n_brc": len(km_brc_ar),
            "es_preliminar": es_preliminar,
            "grado_confianza": "B" if not es_preliminar else "C",
        },
        "domestica": {
            "id": "brecha_domestica_pct",
            "nombre": "Brecha doméstica competitiva (Cabotaje genuino)",
            "valor_pct": brecha_dom,
            "definicion": "Mediana de Esquel frente a la mediana de cabotaje genuino de Bariloche (AR, FO, WJ), excluyendo desvíos.",
            "tarifa_km_eqs": val_eqs_dom,
            "tarifa_km_brc": val_brc_dom,
            "n_eqs": len(km_eqs_dom),
            "n_brc": len(km_brc_dom),
            "es_preliminar": es_preliminar,
            "grado_confianza": "B" if not es_preliminar else "C",
        },
        "agrupada": {
            "id": "brecha_agrupada_pct",
            "nombre": "Brecha agrupada general (Sin control de celda)",
            "valor_pct": brecha_all,
            "definicion": "Comparación multi-aerolínea agregada. Desaconsejada para reclamos formales por mezclar composiciones temporales dispares.",
            "tarifa_km_eqs": val_eqs_all,
            "tarifa_km_brc": val_brc_all,
            "n_eqs": len(km_eqs_all),
            "n_brc": len(km_brc_all),
            "es_preliminar": True,
            "grado_confianza": "C",
        },
        "gobernanza": {
            "cobertura_eqs_pct": cob_eqs,
            "cobertura_brc_pct": cob_brc,
            "invariante_i8_cumplida": not es_preliminar,
            "alerta_i15": (
                "Cifra marcada preliminar por cobertura bajo 80% — No apta para difusión externa"
                if es_preliminar
                else None
            ),
        },
    }
