"""Servidor HTTP de consulta y API REST para Métrica Aéreos.

Permite consultar y auditar en tiempo real:
- Resumen ejecutivo y KPIs de última corrida (cobertura, consultas, itinerarios).
- Tarifas e itinerarios capturados en la capa bronce (vuelos_YYYY-MM-DD.jsonl.gz).
- Estadísticas y comparativas por ruta patagónica (EQS, BRC, COR, CPC, MDY, etc.).
- Bitácora de consultas con hechos técnicos (runs_YYYY-MM-DD.jsonl).
- Monitor de salud (canario por aerolínea) y estado de disco vs presupuesto 8 GB.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import json
import logging
import math
import os
import sys
from datetime import date, datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from aereos.parse import evaluar_pertinencia_itinerario, evaluar_calendario_servicio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("aereos.server")

AUTH_USER = os.environ.get("METRICA_WEB_USER", "oit_admin")
AUTH_PASS = os.environ.get("METRICA_WEB_PASS", "esquel2026")

DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES_ES = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril", 5: "mayo", 6: "junio",
    7: "julio", 8: "agosto", 9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
}

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


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def calcular_distancia_km(orig: str, dest: str) -> float:
    o_coord = AEROPUERTOS_COORD.get(orig.upper(), (-34.5592, -58.4156))
    d_coord = AEROPUERTOS_COORD.get(dest.upper(), (-42.9080, -71.1394))
    return round(haversine_km(o_coord[0], o_coord[1], d_coord[0], d_coord[1]), 1)


def format_duration(minutes: int | None) -> str:
    if not minutes or minutes <= 0:
        return "—"
    h = minutes // 60
    m = minutes % 60
    if h > 0 and m > 0:
        return f"{h}h {m}m"
    elif h > 0:
        return f"{h}h"
    return f"{m}m"

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BRONCE_DIR = os.path.join(BASE_DIR, "data", "bronce")
BITACORA_DIR = os.path.join(BASE_DIR, "data", "bitacora")
CONFIG_DIR = os.path.join(BASE_DIR, "config")
META_PATH = os.path.join(BASE_DIR, "data", "meta.json")
WEB_DIR = os.path.join(BASE_DIR, "web")


def get_latest_vuelos_file() -> str | None:
    if not os.path.exists(BRONCE_DIR):
        return None
    files = [f for f in os.listdir(BRONCE_DIR) if f.startswith("vuelos_") and f.endswith(".jsonl.gz")]
    if not files:
        return None
    files.sort(reverse=True)
    return os.path.join(BRONCE_DIR, files[0])


def get_latest_bitacora_file() -> str | None:
    if not os.path.exists(BITACORA_DIR):
        return None
    files = [f for f in os.listdir(BITACORA_DIR) if f.startswith("runs_") and f.endswith(".jsonl")]
    if not files:
        return None
    files.sort(reverse=True)
    return os.path.join(BITACORA_DIR, files[0])


def get_disk_usage() -> dict[str, Any]:
    total_bytes = 0
    raw_bytes = 0
    gz_bytes = 0
    if os.path.exists(BRONCE_DIR):
        for root, _, files in os.walk(BRONCE_DIR):
            for f in files:
                fp = os.path.join(root, f)
                try:
                    sz = os.path.getsize(fp)
                    total_bytes += sz
                    if "/raw/" in fp or "\\raw\\" in fp:
                        raw_bytes += sz
                    elif f.endswith(".jsonl.gz"):
                        gz_bytes += sz
                except OSError:
                    pass

    presupuesto_bytes = 8 * 1024 * 1024 * 1024
    alerta_activa = False
    meta_data: dict[str, Any] = {}
    if os.path.exists(META_PATH):
        try:
            with open(META_PATH, "r", encoding="utf-8") as fh:
                meta_data = json.load(fh)
                if "alerta_disco" in meta_data:
                    alerta_activa = True
        except Exception:
            pass

    return {
        "presupuesto_mb": round(presupuesto_bytes / (1024 * 1024), 1),
        "total_usado_mb": round(total_bytes / (1024 * 1024), 2),
        "raw_usado_mb": round(raw_bytes / (1024 * 1024), 2),
        "bronce_gz_mb": round(gz_bytes / (1024 * 1024), 2),
        "porcentaje_usado": round((total_bytes / presupuesto_bytes) * 100, 2),
        "alerta_activa": alerta_activa,
        "meta": meta_data,
    }


def get_summary_status() -> dict[str, Any]:
    bitacora_file = get_latest_bitacora_file()
    disk_info = get_disk_usage()

    obs_date = "N/A"
    total_consultas = 0
    ok = 0
    sin_servicio = 0
    fuera_ventana = 0
    capacidad_agotada = 0
    sin_resultados = 0
    fallos = 0
    itinerarios_por_aerolinea: dict[str, int] = {}
    desvios_por_aerolinea: dict[str, int] = {}

    if bitacora_file and os.path.exists(bitacora_file):
        try:
            filename = os.path.basename(bitacora_file)
            obs_date = filename.replace("runs_", "").replace(".jsonl", "")
            with open(bitacora_file, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                        total_consultas += 1
                        st = entry.get("status", "desconocido")
                        if st == "ok":
                            ok += 1
                        elif st == "sin_servicio":
                            sin_servicio += 1
                        elif st == "fuera_de_ventana_de_venta":
                            fuera_ventana += 1
                        elif st == "capacidad_agotada":
                            capacidad_agotada += 1
                        elif st == "sin_resultados":
                            sin_resultados += 1
                        elif st in ("omitido_por_presupuesto", "omitido_por_preflight"):
                            pass
                        else:
                            fallos += 1
                    except Exception:
                        pass
        except Exception as exc:
            logger.error("Error leyendo bitacora: %s", exc)

    # Contar itinerarios desde bronce filtrando pertinencia
    vuelos_file = get_latest_vuelos_file()
    desvios_count = 0
    itinerarios_relevantes_count = 0

    if vuelos_file and os.path.exists(vuelos_file):
        try:
            with gzip.open(vuelos_file, "rt", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                    except Exception:
                        continue
                    airline = item.get("airline_code", "OTRA")
                    is_rel = item.get("itinerario_relevante")
                    if is_rel is None:
                        is_rel, _ = evaluar_pertinencia_itinerario(item)

                    if is_rel:
                        itinerarios_relevantes_count += 1
                        itinerarios_por_aerolinea[airline] = itinerarios_por_aerolinea.get(airline, 0) + 1
                    else:
                        desvios_count += 1
                        desvios_por_aerolinea[airline] = desvios_por_aerolinea.get(airline, 0) + 1
        except Exception as exc:
            logger.error("Error leyendo vuelos para status: %s", exc)

    cobertura_valida = (
        ((ok + sin_servicio + fuera_ventana) / total_consultas * 100)
        if total_consultas > 0
        else 0.0
    )

    return {
        "fecha_observacion": obs_date,
        "total_consultas": total_consultas,
        "ok": ok,
        "sin_servicio": sin_servicio,
        "fuera_de_ventana_de_venta": fuera_ventana,
        "capacidad_agotada": capacidad_agotada,
        "sin_resultados": sin_resultados,
        "fallos": fallos,
        "cobertura_valida_pct": round(cobertura_valida, 1),
        "total_itinerarios": itinerarios_relevantes_count,
        "itinerarios_por_aerolinea": itinerarios_por_aerolinea,
        "desvios_internacionales_filtrados": desvios_count,
        "desvios_por_aerolinea": desvios_por_aerolinea,
        "disco": disk_info,
        "estado_sistema": "saludable" if fallos == 0 and cobertura_valida >= 75.0 else "alerta",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def get_all_vuelos_files() -> list[str]:
    if not os.path.exists(BRONCE_DIR):
        return []
    files = [os.path.join(BRONCE_DIR, f) for f in os.listdir(BRONCE_DIR) if f.startswith("vuelos_") and f.endswith(".jsonl.gz")]
    files.sort(reverse=True)
    return files


def load_itineraries(
    origen: str | None = None,
    destino: str | None = None,
    aerolinea: str | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    solo_baratos: bool = False,
    incluir_irrelevantes: bool = False,
    incluir_gaps: bool = True,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    """Carga la ÚLTIMA observación de cada (ruta, fecha de vuelo, vuelo) en la capa bronce (Prompt 1e).

    Genera las 12 columnas ordenables requeridas y sintetiza los huecos de muestreo
    para distinguir con precisión los 4 estados:
    - 'con_datos': itinerario capturado con tarifa
    - 'sin_muestrear': fecha con servicio programado pero no consultada
    - 'sin_servicio': fecha sin servicio programado según calendario
    - 'sin_resultados': fecha consultada con cero itinerarios
    """
    vuelos_files = get_all_vuelos_files()
    if not vuelos_files:
        return []

    # 1. Leer todas las observaciones quedándonos con la ÚLTIMA observación de cada vuelo
    seen_flight_keys: set[tuple[str, str, str, str]] = set()
    latest_observations: list[dict[str, Any]] = []

    origen_u = origen.upper() if origen else None
    destino_u = destino.upper() if destino else None
    aero_u = aerolinea.upper() if aerolinea else None

    cal_svc = get_calendar_config()

    try:
        for vf in vuelos_files:
            with gzip.open(vf, "rt", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                    except Exception:
                        continue

                    orig = item.get("origin_iata", "").upper()
                    dst = item.get("dest_iata", "").upper()
                    f_date = item.get("flight_date", "")
                    f_num = item.get("flight_numbers") or item.get("airline_code") or "vuelo"

                    f_key = (orig, dst, f_date, f_num)
                    if f_key in seen_flight_keys:
                        # Ya tenemos la observación más reciente de este vuelo
                        continue
                    seen_flight_keys.add(f_key)

                    is_rel = item.get("itinerario_relevante")
                    if is_rel is None:
                        is_rel, motivo = evaluar_pertinencia_itinerario(item)
                        item["itinerario_relevante"] = is_rel
                        item["motivo_irrelevancia"] = motivo

                    # Enriquecer con atributos requeridos para las 12 columnas
                    obs_date_str = item.get("observed_date") or f_date
                    try:
                        d_fl = date.fromisoformat(f_date)
                        d_ob = date.fromisoformat(obs_date_str)
                        lead_days = (d_fl - d_ob).days
                        dia_semana = DIAS_SEMANA[d_fl.weekday()]
                    except Exception:
                        lead_days = item.get("lead_days", 0)
                        dia_semana = "—"

                    dist_km = calcular_distancia_km(orig, dst)
                    price_ars = item.get("price_ars")
                    tarifa_km = round(price_ars / dist_km, 2) if dist_km > 0 and price_ars is not None else None

                    dep_local = item.get("depart_local") or ""
                    arr_local = item.get("arrive_local") or ""
                    hora_salida = dep_local.split(" ")[1][:5] if " " in dep_local else dep_local or "—"
                    hora_llegada = arr_local.split(" ")[1][:5] if " " in arr_local else arr_local or "—"

                    dur_min = item.get("duration_minutes")
                    if dur_min is None and dep_local and arr_local:
                        try:
                            from datetime import datetime
                            dt_dep = datetime.fromisoformat(dep_local)
                            dt_arr = datetime.fromisoformat(arr_local)
                            diff_m = int((dt_arr - dt_dep).total_seconds() // 60)
                            if diff_m > 0:
                                dur_min = diff_m
                        except Exception:
                            pass
                    dur_fmt = format_duration(dur_min)

                    stops = item.get("stops_count", 0)
                    stopovers = item.get("stopover_iatas") or []
                    if stops == 0:
                        escalas_fmt = "Directo"
                    else:
                        escalas_fmt = f"{stops} escala ({', '.join(stopovers)})" if stopovers else f"{stops} escala"

                    item["dia_semana"] = dia_semana
                    item["dias_anticipacion"] = lead_days
                    item["numero_vuelo"] = item.get("flight_numbers") or "—"
                    item["hora_salida"] = hora_salida
                    item["hora_llegada"] = hora_llegada
                    item["duracion"] = dur_fmt
                    item["escalas"] = escalas_fmt
                    item["distancia_km"] = dist_km
                    item["tarifa_km_ars"] = tarifa_km
                    item["observado_el"] = obs_date_str
                    item["estado"] = "con_datos"

                    latest_observations.append(item)
    except Exception as exc:
        logger.error("Error cargando itinerarios: %s", exc)

    # 2. Si se consulta una ruta específica (ej. BUE>EQS), sintetizar brechas de muestreo (Prompt 1e)
    fechas_con_datos_por_ruta: dict[tuple[str, str], set[str]] = {}
    for o in latest_observations:
        r_key = (o.get("origin_iata", "").upper(), o.get("dest_iata", "").upper())
        fechas_con_datos_por_ruta.setdefault(r_key, set()).add(o.get("flight_date", ""))

    gaps: list[dict[str, Any]] = []
    if incluir_gaps and origen_u and destino_u:
        r_pair = (origen_u, destino_u)
        fechas_datos = fechas_con_datos_por_ruta.get(r_pair, set())
        today = date.today()
        dist_km = calcular_distancia_km(origen_u, destino_u)

        # Generar las 180 fechas móviles
        for d in range(1, 181):
            f_dt = today + timedelta(days=d)
            f_str = f_dt.isoformat()
            if f_str not in fechas_datos:
                explica, _, motivo = evaluar_calendario_servicio(origen_u, destino_u, f_str, cal_svc, return_detalle=True)
                if explica:
                    st = "sin_servicio"
                else:
                    st = "sin_muestrear"

                gap_item = {
                    "origin_iata": origen_u,
                    "dest_iata": destino_u,
                    "flight_date": f_str,
                    "dia_semana": DIAS_SEMANA[f_dt.weekday()],
                    "dias_anticipacion": d,
                    "airline_code": "—",
                    "airline_name": "—",
                    "flight_numbers": "—",
                    "numero_vuelo": "—",
                    "depart_local": None,
                    "arrive_local": None,
                    "hora_salida": "—",
                    "hora_llegada": "—",
                    "duracion": "—",
                    "duration_minutes": None,
                    "stops_count": 0,
                    "escalas": "—",
                    "price_amount": None,
                    "price_ars": None,
                    "tarifa_km_ars": None,
                    "distancia_km": dist_km,
                    "observed_date": None,
                    "observado_el": None,
                    "estado": st,
                    "itinerario_relevante": True,
                    "is_cheapest_of_query": False,
                    "source": "calendario_referencia",
                }
                gaps.append(gap_item)

    all_items = latest_observations + gaps

    # 3. Aplicar filtros
    filtered: list[dict[str, Any]] = []
    for item in all_items:
        if not incluir_irrelevantes and not item.get("itinerario_relevante", True):
            continue
        if origen_u and item.get("origin_iata", "").upper() != origen_u:
            continue
        if destino_u and item.get("dest_iata", "").upper() != destino_u:
            continue
        if aero_u and item.get("airline_code", "").upper() != aero_u:
            continue
        f_date = item.get("flight_date", "")
        if fecha_desde and f_date < fecha_desde:
            continue
        if fecha_hasta and f_date > fecha_hasta:
            continue
        if solo_baratos and not item.get("is_cheapest_of_query", False):
            continue

        filtered.append(item)

    # Orden por defecto: fecha de vuelo ascendente
    filtered.sort(key=lambda x: (x.get("flight_date", ""), x.get("hora_salida", "")))
    return filtered[:limit]


def get_cobertura_mensual(
    origen: str = "BUE",
    destino: str = "EQS",
    observed_date: date | None = None,
    horizonte_dias: int = 180,
) -> list[dict[str, Any]]:
    """Calcula el desglose y porcentaje de cobertura mensual para la ruta especificada (Prompt 1e)."""
    today = observed_date or date.today()
    cal_svc = get_calendar_config()

    # Fechas con datos observados en bronce
    vuelos = load_itineraries(origen=origen, destino=destino, incluir_gaps=False, limit=5000)
    fechas_con_datos = {v.get("flight_date") for v in vuelos if v.get("flight_date")}

    # Agrupar las 180 fechas por mes
    meses_map: dict[str, dict[str, Any]] = {}

    for d in range(1, horizonte_dias + 1):
        cur = today + timedelta(days=d)
        m_key = f"{cur.year}-{cur.month:02d}"
        f_str = cur.isoformat()

        if m_key not in meses_map:
            meses_map[m_key] = {
                "mes_clave": m_key,
                "anio": cur.year,
                "mes": cur.month,
                "mes_nombre": f"{MESES_ES.get(cur.month, 'mes')} {cur.year}",
                "total_dias_periodo": 0,
                "dias_con_servicio": 0,
                "dias_con_datos": 0,
                "dias_sin_muestrear": 0,
                "dias_sin_servicio": 0,
                "dias_sin_resultados": 0,
            }

        m_info = meses_map[m_key]
        m_info["total_dias_periodo"] += 1

        explica, _, _ = evaluar_calendario_servicio(origen, destino, f_str, cal_svc, return_detalle=True)
        tiene_datos = f_str in fechas_con_datos

        if explica:
            # Sin servicio programado según calendario (ej. martes)
            m_info["dias_sin_servicio"] += 1
        else:
            # Día con servicio programado
            m_info["dias_con_servicio"] += 1
            if tiene_datos:
                m_info["dias_con_datos"] += 1
            else:
                m_info["dias_sin_muestrear"] += 1

    resultado: list[dict[str, Any]] = []
    for k in sorted(meses_map.keys()):
        m_info = meses_map[k]
        svc = m_info["dias_con_servicio"]
        dat = m_info["dias_con_datos"]
        pct = round((dat / svc * 100), 1) if svc > 0 else 100.0
        m_info["cobertura_pct"] = pct
        m_info["texto_cobertura"] = f"{MESES_ES.get(m_info['mes'], 'mes')}: {dat} de {svc} días con servicio"
        resultado.append(m_info)

    return resultado


HITOS_TURISMO = [
    {"fecha": "2026-10-12", "nombre": "Diversidad Cultural", "tipo": "finde_largo"},
    {"fecha": "2026-11-23", "nombre": "Soberanía Nacional", "tipo": "finde_largo"},
    {"fecha": "2026-12-08", "nombre": "Inmaculada Concepción", "tipo": "puente"},
    {"fecha": "2026-12-25", "nombre": "Navidad", "tipo": "fiestas"},
    {"fecha": "2027-01-01", "nombre": "Año Nuevo", "tipo": "fiestas"},
    {"fecha": "2027-01-15", "nombre": "Pico Quincena Enero", "tipo": "temporada_alta"},
    {"fecha": "2027-02-08", "nombre": "Carnaval", "tipo": "finde_largo"},
    {"fecha": "2027-02-09", "nombre": "Carnaval", "tipo": "finde_largo"},
]


def calcular_percentiles(valores: list[float]) -> dict[str, float]:
    """Calcula percentiles P25, P50 (mediana), P75, min, max y promedio con interpolación lineal."""
    if not valores:
        return {"min": 0.0, "p25": 0.0, "median": 0.0, "p75": 0.0, "max": 0.0, "avg": 0.0}
    vals = sorted(valores)
    n = len(vals)
    if n == 1:
        v = round(float(vals[0]), 2)
        return {"min": v, "p25": v, "median": v, "p75": v, "max": v, "avg": v}

    def percentile(p: float) -> float:
        k = (n - 1) * (p / 100.0)
        f = int(k)
        c = min(f + 1, n - 1)
        d = k - f
        return vals[f] + d * (vals[c] - vals[f])

    return {
        "min": round(float(vals[0]), 2),
        "p25": round(float(percentile(25)), 2),
        "median": round(float(percentile(50)), 2),
        "p75": round(float(percentile(75)), 2),
        "max": round(float(vals[-1]), 2),
        "avg": round(float(sum(vals) / n), 2),
    }


def calcular_series_temporales(
    rutas: list[str],
    agrupacion: str = "semanal",
    metrica: str = "precio_ars",
    incluir_irrelevantes: bool = False,
) -> dict[str, Any]:
    """Calcula series temporales agregadas con bandas estadísticas (Min-Max, IQR P25-P75, Mediana).
    
    Inspirado en el modelo de visualización de Esquel DATA (#historia).
    Soporta tramos individuales (BUE>EQS, EQS>BUE) y benchmarks comparativos (BUE>EQS vs BUE>BRC).
    """
    today = date.today()
    all_itineraries = load_itineraries(
        incluir_irrelevantes=incluir_irrelevantes,
        incluir_gaps=False,
        limit=10000,
    )

    # Normalizar rutas solicitadas
    parsed_rutas: list[tuple[str, str]] = []
    for r in rutas:
        r_clean = r.replace("-", ">").replace(" ", "").upper()
        if ">" in r_clean:
            parts = r_clean.split(">")
            parsed_rutas.append((parts[0], parts[1]))
        elif len(r_clean) == 6:
            parsed_rutas.append((r_clean[:3], r_clean[3:]))

    if not parsed_rutas:
        parsed_rutas = [("BUE", "EQS")]

    # Crear timeline común para sincronización perfecta entre múltiples series (180 días continuos)
    dias_horizonte: list[date] = [today + timedelta(days=d) for d in range(1, 181)]

    # Definir buckets temporales
    buckets_info: list[dict[str, Any]] = []
    if agrupacion == "diaria":
        for d in dias_horizonte:
            buckets_info.append({
                "bucket_id": d.isoformat(),
                "etiqueta": f"{d.strftime('%d/%m')}",
                "etiqueta_larga": f"{d.strftime('%d/%m/%Y')}",
                "fecha_inicio": d.isoformat(),
                "fecha_fin": d.isoformat(),
                "dias": [d.isoformat()],
            })
    elif agrupacion == "mensual":
        meses_vistos: set[str] = set()
        for d in dias_horizonte:
            m_key = d.strftime("%Y-%m")
            if m_key not in meses_vistos:
                meses_vistos.add(m_key)
                m_num = d.month
                y_num = d.year
                m_nom = MESES_ES.get(m_num, m_key)
                buckets_info.append({
                    "bucket_id": m_key,
                    "etiqueta": f"{m_nom.capitalize()[:3]} '{str(y_num)[2:]}",
                    "etiqueta_larga": f"{m_nom.capitalize()} {y_num}",
                    "mes": m_num,
                    "anio": y_num,
                    "dias": [],
                })
        for d in dias_horizonte:
            m_key = d.strftime("%Y-%m")
            for b in buckets_info:
                if b["bucket_id"] == m_key:
                    b["dias"].append(d.isoformat())
                    break
        for b in buckets_info:
            b["fecha_inicio"] = b["dias"][0] if b["dias"] else ""
            b["fecha_fin"] = b["dias"][-1] if b["dias"] else ""
    else:
        # Por defecto "semanal" (Semanas de lunes a domingo)
        agrupacion = "semanal"
        semanas_map: dict[str, dict[str, Any]] = {}
        for d in dias_horizonte:
            lunes = d - timedelta(days=d.weekday())
            domingo = lunes + timedelta(days=6)
            s_key = lunes.isoformat()
            if s_key not in semanas_map:
                semanas_map[s_key] = {
                    "bucket_id": s_key,
                    "etiqueta": f"Sem {lunes.strftime('%d/%m')}",
                    "etiqueta_larga": f"{lunes.strftime('%d/%m')} al {domingo.strftime('%d/%m')}",
                    "fecha_inicio": lunes.isoformat(),
                    "fecha_fin": domingo.isoformat(),
                    "dias": [],
                }
            semanas_map[s_key]["dias"].append(d.isoformat())
        buckets_info = sorted(semanas_map.values(), key=lambda x: x["bucket_id"])

    # Mapa de hitos para enriquecer cada bucket
    hitos_por_fecha = {h["fecha"]: h for h in HITOS_TURISMO}

    # Indexar itinerarios por ruta y fecha
    itin_por_ruta: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for it in all_itineraries:
        if not it.get("itinerario_relevante", True) and not incluir_irrelevantes:
            continue
        orig = it.get("origin_iata", "").upper()
        dest = it.get("dest_iata", "").upper()
        itin_por_ruta.setdefault((orig, dest), []).append(it)

    series_rutas: list[dict[str, Any]] = []

    for orig, dest in parsed_rutas:
        r_pair = (orig, dest)
        r_itins = itin_por_ruta.get(r_pair, [])
        dist_km = calcular_distancia_km(orig, dest)

        itins_por_fecha: dict[str, list[dict[str, Any]]] = {}
        todos_precios: list[float] = []
        todos_tarifas_km: list[float] = []

        for it in r_itins:
            f_d = it.get("flight_date", "")
            if f_d:
                itins_por_fecha.setdefault(f_d, []).append(it)
                p = it.get("price_ars")
                if p is not None:
                    todos_precios.append(p)
                t_km = it.get("tarifa_km_ars")
                if t_km is not None:
                    todos_tarifas_km.append(t_km)

        puntos: list[dict[str, Any]] = []

        for b in buckets_info:
            dias_bucket = set(b["dias"])
            vuelos_bucket: list[dict[str, Any]] = []
            for d_str in dias_bucket:
                vuelos_bucket.extend(itins_por_fecha.get(d_str, []))

            hito_detectado = None
            for d_str in dias_bucket:
                if d_str in hitos_por_fecha:
                    hito_detectado = hitos_por_fecha[d_str]
                    break

            if vuelos_bucket:
                precios_b = [v["price_ars"] for v in vuelos_bucket if v.get("price_ars") is not None]
                tarifas_km_b = [v["tarifa_km_ars"] for v in vuelos_bucket if v.get("tarifa_km_ars") is not None]

                stats_ars = calcular_percentiles(precios_b)
                stats_km = calcular_percentiles(tarifas_km_b)

                cheapest_item = min(vuelos_bucket, key=lambda x: x.get("price_ars") or 999999999)
                aeros = sorted(list(set(v.get("airline_code", "OTRA") for v in vuelos_bucket)))

                punto = {
                    "bucket_id": b["bucket_id"],
                    "etiqueta": b["etiqueta"],
                    "etiqueta_larga": b["etiqueta_larga"],
                    "fecha_inicio": b["fecha_inicio"],
                    "fecha_fin": b["fecha_fin"],
                    "vuelos_disponibles": len(vuelos_bucket),
                    "tiene_datos": True,
                    "precio_min": stats_ars["min"],
                    "precio_p25": stats_ars["p25"],
                    "precio_mediana": stats_ars["median"],
                    "precio_p75": stats_ars["p75"],
                    "precio_max": stats_ars["max"],
                    "precio_promedio": stats_ars["avg"],
                    "tarifa_km_min": stats_km["min"],
                    "tarifa_km_p25": stats_km["p25"],
                    "tarifa_km_mediana": stats_km["median"],
                    "tarifa_km_p75": stats_km["p75"],
                    "tarifa_km_max": stats_km["max"],
                    "tarifa_km_promedio": stats_km["avg"],
                    "aerolineas": aeros,
                    "aerolinea_minima": cheapest_item.get("airline_code", "—"),
                    "vuelo_minimo": cheapest_item.get("numero_vuelo", "—"),
                    "hora_minima": cheapest_item.get("hora_salida", "—"),
                    "hito": hito_detectado["nombre"] if hito_detectado else None,
                    "tipo_hito": hito_detectado["tipo"] if hito_detectado else None,
                }
            else:
                punto = {
                    "bucket_id": b["bucket_id"],
                    "etiqueta": b["etiqueta"],
                    "etiqueta_larga": b["etiqueta_larga"],
                    "fecha_inicio": b["fecha_inicio"],
                    "fecha_fin": b["fecha_fin"],
                    "vuelos_disponibles": 0,
                    "tiene_datos": False,
                    "precio_min": None,
                    "precio_p25": None,
                    "precio_mediana": None,
                    "precio_p75": None,
                    "precio_max": None,
                    "precio_promedio": None,
                    "tarifa_km_min": None,
                    "tarifa_km_p25": None,
                    "tarifa_km_mediana": None,
                    "tarifa_km_p75": None,
                    "tarifa_km_max": None,
                    "tarifa_km_promedio": None,
                    "aerolineas": [],
                    "aerolinea_minima": "—",
                    "vuelo_minimo": "—",
                    "hora_minima": "—",
                    "hito": hito_detectado["nombre"] if hito_detectado else None,
                    "tipo_hito": hito_detectado["tipo"] if hito_detectado else None,
                }
            puntos.append(punto)

        stats_global_ars = calcular_percentiles(todos_precios)
        stats_global_km = calcular_percentiles(todos_tarifas_km)

        series_rutas.append({
            "ruta": f"{orig} > {dest}",
            "origen": orig,
            "destino": dest,
            "distancia_km": dist_km,
            "total_vuelos_relevantes": len(r_itins),
            "stats_global_ars": stats_global_ars,
            "stats_global_km": stats_global_km,
            "puntos": puntos,
        })

    return {
        "agrupacion": agrupacion,
        "metrica_solicitada": metrica,
        "fecha_observacion": today.isoformat(),
        "total_itinerarios_base": len(all_itineraries),
        "hitos": HITOS_TURISMO,
        "rutas": series_rutas,
    }


def get_routes_summary() -> list[dict[str, Any]]:
    vuelos_file = get_latest_vuelos_file()
    if not vuelos_file or not os.path.exists(vuelos_file):
        return []

    routes_map: dict[str, dict[str, Any]] = {}

    try:
        with gzip.open(vuelos_file, "rt", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except Exception:
                    continue

                is_rel = item.get("itinerario_relevante")
                if is_rel is None:
                    is_rel, _ = evaluar_pertinencia_itinerario(item)

                orig = item.get("origin_iata", "???")
                dest = item.get("dest_iata", "???")
                route_key = f"{orig} > {dest}"
                price = item.get("price_ars")
                airline = item.get("airline_code", "OTRA")

                if route_key not in routes_map:
                    routes_map[route_key] = {
                        "ruta": route_key,
                        "origen": orig,
                        "destino": dest,
                        "vuelos_totales": 0,
                        "desvios_filtrados": 0,
                        "precios": [],
                        "aerolineas": {},
                        "fechas": set(),
                    }

                r = routes_map[route_key]
                if not is_rel:
                    r["desvios_filtrados"] += 1
                    continue

                r["vuelos_totales"] += 1
                if price is not None and price > 0:
                    r["precios"].append(price)
                r["aerolineas"][airline] = r["aerolineas"].get(airline, 0) + 1
                if item.get("flight_date"):
                    r["fechas"].add(item.get("flight_date"))
    except Exception as exc:
        logger.error("Error procesando rutas: %s", exc)

    res: list[dict[str, Any]] = []
    for k, v in routes_map.items():
        precios = v.pop("precios")
        fechas = sorted(list(v.pop("fechas")))
        min_p = min(precios) if precios else None
        max_p = max(precios) if precios else None
        avg_p = round(sum(precios) / len(precios)) if precios else None
        v["precio_minimo"] = min_p
        v["precio_promedio"] = avg_p
        v["precio_maximo"] = max_p
        v["fechas_disponibles"] = len(fechas)
        v["fecha_min"] = fechas[0] if fechas else None
        v["fecha_max"] = fechas[-1] if fechas else None
        res.append(v)

    def sort_key(item):
        r = item["ruta"]
        if "EQS" in r:
            return (0, r)
        if "BRC" in r:
            return (1, r)
        return (2, r)

    res.sort(key=sort_key)
    return res


def get_bitacora_entries(
    status: str | None = None,
    ruta: str | None = None,
    limit: int = 150,
) -> list[dict[str, Any]]:
    bitacora_file = get_latest_bitacora_file()
    if not bitacora_file or not os.path.exists(bitacora_file):
        return []

    entries: list[dict[str, Any]] = []
    status_filter = status.lower() if status else None
    ruta_filter = ruta.upper() if ruta else None

    try:
        with open(bitacora_file, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except Exception:
                    continue

                if status_filter and entry.get("status", "").lower() != status_filter:
                    continue
                r_str = f"{entry.get('origin_iata', '')}>{entry.get('dest_iata', '')}".upper()
                if ruta_filter and ruta_filter not in r_str:
                    continue

                entries.append(entry)
                if len(entries) >= limit:
                    break
    except Exception as exc:
        logger.error("Error leyendo bitacora entries: %s", exc)

    return entries


def get_canary_data() -> dict[str, Any]:
    summary = get_summary_status()
    operators = ["AR", "FO", "WJ"]
    status_ops: list[dict[str, Any]] = []
    for op in operators:
        cnt = summary["itinerarios_por_aerolinea"].get(op, 0)
        status_ops.append({
            "operador": op,
            "itinerarios_hoy": cnt,
            "estado": "saludable" if cnt > 0 else "en_seguimiento",
            "alerta": False,
        })

    desvios_ops: list[dict[str, Any]] = []
    for op, cnt in summary.get("desvios_por_aerolinea", {}).items():
        desvios_ops.append({
            "operador": op,
            "desvios_detectados": cnt,
            "motivo": "Itinerario internacional o con escalas excesivas (aislado de agregaciones de cabotaje)",
            "estado": "filtrado",
        })

    return {
        "fecha": summary["fecha_observacion"],
        "estado_general": "saludable",
        "alertas_activas": 0,
        "operadores": status_ops,
        "desvios_internacionales": desvios_ops,
        "desvios_totales": summary.get("desvios_internacionales_filtrados", 0),
        "criterio_fina": "3 corridas consecutivas con 0 vuelos (evita falsos positivos en medianas bajas)",
        "criterio_densa": "Caída > 30% respecto a la mediana de 7 días",
    }


def get_calendar_config() -> dict[str, Any]:
    cal_file = os.path.join(CONFIG_DIR, "calendario_servicio.json")
    if os.path.exists(cal_file):
        try:
            with open(cal_file, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            pass
    return {}


class MetricaAereosHandler(SimpleHTTPRequestHandler):
    def check_auth(self) -> bool:
        auth_header = self.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Basic "):
            return False
        try:
            encoded = auth_header.split(" ", 1)[1]
            decoded = base64.b64decode(encoded.strip()).decode("utf-8")
            user, pwd = decoded.split(":", 1)
            return user == AUTH_USER and pwd == AUTH_PASS
        except Exception:
            return False

    def require_auth(self) -> bool:
        if not self.check_auth():
            self.send_response(HTTPStatus.UNAUTHORIZED)
            self.send_header("WWW-Authenticate", 'Basic realm="Metrica Aereos OIT"')
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "Unauthorized",
                "message": "Acceso restringido a OIT Esquel (puerto 38530)"
            }).encode("utf-8"))
            return False
        return True

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_HEAD(self):
        if not self.require_auth():
            return
        self.do_GET(is_head=True)

    def do_GET(self, is_head: bool = False):
        if not self.require_auth():
            return

        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/api/status":
            self.send_json(get_summary_status(), is_head=is_head)
            return
        elif path == "/api/vuelos":
            origen = qs.get("origen", [None])[0]
            destino = qs.get("destino", [None])[0]
            aerolinea = qs.get("aerolinea", [None])[0]
            fecha_desde = qs.get("fecha_desde", [None])[0]
            fecha_hasta = qs.get("fecha_hasta", [None])[0]
            solo_baratos = qs.get("solo_baratos", ["false"])[0].lower() in ("true", "1")
            incluir_irrelevantes = qs.get("incluir_irrelevantes", ["false"])[0].lower() in ("true", "1")
            con_cobertura = qs.get("con_cobertura", ["false"])[0].lower() in ("true", "1")
            limit = int(qs.get("limit", [1000])[0])
            vuelos_list = load_itineraries(
                origen=origen,
                destino=destino,
                aerolinea=aerolinea,
                fecha_desde=fecha_desde,
                fecha_hasta=fecha_hasta,
                solo_baratos=solo_baratos,
                incluir_irrelevantes=incluir_irrelevantes,
                limit=min(limit, 2000),
            )
            if con_cobertura and origen and destino:
                cobertura = get_cobertura_mensual(origen=origen, destino=destino)
                self.send_json({"vuelos": vuelos_list, "cobertura": cobertura}, is_head=is_head)
            else:
                self.send_json(vuelos_list, is_head=is_head)
            return
        elif path in ("/api/cobertura", "/api/vuelos/cobertura"):
            origen = qs.get("origen", ["BUE"])[0]
            destino = qs.get("destino", ["EQS"])[0]
            self.send_json(get_cobertura_mensual(origen=origen, destino=destino), is_head=is_head)
            return
        elif path == "/api/rutas":
            self.send_json(get_routes_summary(), is_head=is_head)
            return
        elif path == "/api/bitacora":
            status = qs.get("status", [None])[0]
            ruta = qs.get("ruta", [None])[0]
            limit = int(qs.get("limit", [150])[0])
            self.send_json(get_bitacora_entries(
                status=status,
                ruta=ruta,
                limit=min(limit, 500),
            ), is_head=is_head)
            return
        elif path == "/api/canario":
            self.send_json(get_canary_data(), is_head=is_head)
            return
        elif path == "/api/calendario":
            self.send_json(get_calendar_config(), is_head=is_head)
            return
        elif path == "/api/series":
            rutas_str = qs.get("rutas", ["BUE>EQS"])[0]
            agrupacion = qs.get("agrupacion", ["semanal"])[0].lower()
            metrica = qs.get("metrica", ["precio_ars"])[0].lower()
            incluir_irrelevantes = qs.get("incluir_irrelevantes", ["false"])[0].lower() in ("true", "1")
            rutas_list = [r.strip().upper() for r in rutas_str.split(",") if r.strip()]
            if not rutas_list:
                rutas_list = ["BUE>EQS"]
            self.send_json(calcular_series_temporales(
                rutas=rutas_list,
                agrupacion=agrupacion,
                metrica=metrica,
                incluir_irrelevantes=incluir_irrelevantes,
            ), is_head=is_head)
            return

        if path in ("/", "/index.html"):
            self.serve_static_file("index.html", "text/html; charset=utf-8", is_head=is_head)
            return
        elif path == "/style.css":
            self.serve_static_file("style.css", "text/css; charset=utf-8", is_head=is_head)
            return
        elif path == "/app.js":
            self.serve_static_file("app.js", "application/javascript; charset=utf-8", is_head=is_head)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Recurso no encontrado")

    def send_json(self, data: Any, is_head: bool = False):
        payload = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        if not is_head:
            self.wfile.write(payload)

    def serve_static_file(self, filename: str, content_type: str, is_head: bool = False):
        filepath = os.path.join(WEB_DIR, filename)
        if not os.path.exists(filepath):
            self.send_error(HTTPStatus.NOT_FOUND, f"Archivo {filename} no encontrado")
            return
        try:
            with open(filepath, "rb") as fh:
                content = fh.read()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.end_headers()
            if not is_head:
                self.wfile.write(content)
        except Exception as exc:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Error leyendo {filename}: {exc}")


def run_server(host: str = "0.0.0.0", port: int = 38530) -> None:
    server_address = (host, port)
    httpd = ThreadingHTTPServer(server_address, MetricaAereosHandler)
    logger.info("Servidor Métrica Aéreos iniciado en http://%s:%d", host, port)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Deteniendo servidor...")
        httpd.shutdown()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Servidor Web de Consulta de Métrica Aéreos")
    parser.add_argument("--host", default="0.0.0.0", help="Host o IP a escuchar (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=38530, help="Puerto a escuchar (default: 38530)")
    args = parser.parse_args()

    run_server(host=args.host, port=args.port)
