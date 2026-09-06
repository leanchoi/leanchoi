"""Parser resiliente de respuestas de Google Flights.

Procesa la estructura JSON de Google Flights con fallback dinámico y
clasificación por operador (AR, FO, WJ).
Incluye extracción aislada del BLOB JSON, validación estructural de respuesta y
evaluación del calendario de servicio versionado.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Any

from selectolax.lexbor import LexborHTMLParser

COLLECTOR_VERSION = "1.0.0"
PARSER_VERSION = "1.0.2"


def extract_json_blob(html: str) -> tuple[str | None, str | None]:
    """Extrae el string del blob JSON de datos de vuelo desde el HTML.

    Devuelve: (json_blob_str, error_msg)
    """
    if not html:
        return None, "Respuesta HTML vacía"

    parser = LexborHTMLParser(html)
    script = parser.css_first('script[class*="ds:1"]')
    if not script:
        for s in parser.css('script'):
            txt = s.text() or ""
            if "AF_initDataCallback" in txt and "data:" in txt and "[null," in txt:
                script = s
                break

    if not script:
        return None, "No se encontró bloque script con datos de vuelo"

    js = script.text() or ""
    if "data:" not in js:
        return None, "Script no contiene clave data:"

    try:
        data_str = js.split("data:", 1)[1].rsplit(",", 1)[0].strip()
        return data_str, None
    except Exception as exc:
        return None, f"Error extrayendo data_str: {exc}"


def validar_respuesta_estructural(payload: Any, origin: str, dest: str) -> bool:
    """Verifica que la respuesta contenga evidencia de que el buscador entendió la consulta.

    Busca metadatos de ruta, códigos IATA o ciudades presentes en el JSON,
    discriminando de una página de interstitial, CAPTCHA o bloqueo blando.
    """
    if not payload or not isinstance(payload, list) or len(payload) < 4:
        return False

    orig_upper = origin.upper()
    dest_upper = dest.upper()
    payload_str = str(payload)

    has_orig = (orig_upper in payload_str) or (orig_upper == "BUE" and ("AEP" in payload_str or "EZE" in payload_str or "Buenos Aires" in payload_str))
    has_dest = (dest_upper in payload_str) or (dest_upper == "BUE" and ("AEP" in payload_str or "EZE" in payload_str or "Buenos Aires" in payload_str))

    return has_orig or has_dest


def evaluar_calendario_servicio(
    origin: str,
    dest: str,
    flight_date_str: str,
    cal_config: dict[str, Any]
) -> tuple[bool, int]:
    """Evalúa si el calendario de servicio versionado explica la ausencia de vuelos.

    REGLA CRÍTICA: Para una ruta SIN entrada en el calendario, NUNCA se asume sin_servicio.
    Devuelve: (calendario_explica, version)
    """
    cal_version = cal_config.get("version", 1)
    key = f"{origin.upper()}>{dest.upper()}"
    rutas = cal_config.get("rutas", {})

    if key not in rutas:
        return False, cal_version

    r_info = rutas[key]
    try:
        d = date.fromisoformat(flight_date_str)
    except Exception:
        return False, cal_version

    wday = d.weekday()  # 0=Lunes, 1=Martes, ..., 6=Domingo
    patron = r_info.get("patron_semanal", [])
    ventanas = r_info.get("ventanas", [])

    cur_md = d.strftime("%m-%d")
    en_ventana = False
    for vent in ventanas:
        d_ini = vent.get("desde", "01-01")
        d_fin = vent.get("hasta", "12-31")
        if d_ini <= d_fin:
            if d_ini <= cur_md <= d_fin:
                en_ventana = True
                break
        else:
            if cur_md >= d_ini or cur_md <= d_fin:
                en_ventana = True
                break

    if not en_ventana:
        # Fuera de ventana de operación estacional -> no vuela
        return True, cal_version

    if wday not in patron:
        # Día de la semana sin servicio programado (ej. martes en EQS, viernes en COR-EQS)
        return True, cal_version

    # Sí opera según calendario: la ausencia no está explicada
    return False, cal_version


def _is_valid_itinerary_list(cand: Any) -> bool:
    """Verifica que un candidato de lista realmente contenga itinerarios de vuelo."""
    if not isinstance(cand, list) or not cand:
        return False
    valid_count = 0
    for item in cand:
        if isinstance(item, list) and len(item) > 0 and isinstance(item[0], list):
            finfo = item[0]
            if len(finfo) > 2 and isinstance(finfo[2], list) and finfo[2]:
                first_seg = finfo[2][0]
                if isinstance(first_seg, list) and len(first_seg) > 22 and isinstance(first_seg[22], list):
                    valid_count += 1
    return valid_count > 0


def parse_response_html(
    html: str,
    origin: str,
    dest: str,
    flight_date: str,
    return_date: str | None = None,
    observed_date: str | None = None,
    trip_type: str = "one_way",
    currency: str = "ARS",
) -> tuple[list[dict[str, Any]], dict[str, int], str | None]:
    """Extrae observaciones de vuelo desde el HTML crudo de Google Flights.

    Devuelve: (observaciones, conteo_por_aerolínea, error)
    """
    data_str, err = extract_json_blob(html)
    if err:
        return [], {}, err

    try:
        payload = json.loads(data_str)
    except Exception as exc:
        return [], {}, f"JSONDecodeError al parsear payload: {exc}"

    return parse_payload_json(
        payload,
        origin=origin,
        dest=dest,
        flight_date=flight_date,
        return_date=return_date,
        observed_date=observed_date,
        trip_type=trip_type,
        currency=currency,
    )


def parse_payload_json(
    payload: Any,
    origin: str,
    dest: str,
    flight_date: str,
    return_date: str | None = None,
    observed_date: str | None = None,
    trip_type: str = "one_way",
    currency: str = "ARS",
) -> tuple[list[dict[str, Any]], dict[str, int], str | None]:
    """Parsea el objeto JSON de Google Flights."""
    if not payload or not isinstance(payload, list) or len(payload) < 4:
        return [], {}, None

    items = None
    if len(payload) > 3 and isinstance(payload[3], list) and payload[3] and isinstance(payload[3][0], list):
        if _is_valid_itinerary_list(payload[3][0]):
            items = payload[3][0]

    if not items:
        for elem in payload:
            if isinstance(elem, list) and elem:
                if _is_valid_itinerary_list(elem):
                    items = elem
                    break
                elif isinstance(elem[0], list) and _is_valid_itinerary_list(elem[0]):
                    items = elem[0]
                    break

    if not items:
        return [], {}, None

    obs_date_str = observed_date or date.today().isoformat()
    d_flight = date.fromisoformat(flight_date)
    d_obs = date.fromisoformat(obs_date_str)
    lead_days = (d_flight - d_obs).days

    observations: list[dict[str, Any]] = []
    airline_counts: dict[str, int] = {}

    for k in items:
        if not isinstance(k, list) or not k:
            continue

        flight_info = k[0]
        if not isinstance(flight_info, list) or not flight_info:
            continue

        segments = flight_info[2] if len(flight_info) > 2 and isinstance(flight_info[2], list) else []
        flight_nos: list[str] = []
        stopover_iatas: list[str] = []
        carrier_code = None
        carrier_name = None

        for idx, seg in enumerate(segments):
            if isinstance(seg, list):
                if len(seg) > 22 and isinstance(seg[22], list) and len(seg[22]) >= 2:
                    c_code = seg[22][0]
                    f_no = seg[22][1]
                    c_name = seg[22][3] if len(seg[22]) > 3 else None
                    if not carrier_code and c_code:
                        carrier_code = str(c_code).strip().upper()
                    if not carrier_name and c_name:
                        carrier_name = str(c_name).strip()
                    flight_nos.append(f"{c_code}{f_no}")
                if idx < len(segments) - 1 and len(seg) > 6 and seg[6]:
                    stopover_iatas.append(str(seg[6]))

        airline_names = flight_info[1] if len(flight_info) > 1 and isinstance(flight_info[1], list) else []
        primary_name = carrier_name or (airline_names[0] if airline_names and airline_names[0] else "Desconocida")

        name_lower = primary_name.lower()
        if carrier_code == "AR" or "aerol" in name_lower:
            code = "AR"
            norm_name = "Aerolíneas Argentinas"
        elif carrier_code == "FO" or "flybondi" in name_lower:
            code = "FO"
            norm_name = "Flybondi"
        elif carrier_code in ("WJ", "JA") or "jetsmart" in name_lower or "jet smart" in name_lower:
            code = "WJ"
            norm_name = "JetSMART"
        else:
            code = carrier_code or (primary_name[:2].upper() if primary_name != "Desconocida" else "XX")
            norm_name = primary_name

        airline_counts[code] = airline_counts.get(code, 0) + 1

        flight_numbers_str = ",".join(flight_nos) if flight_nos else None
        stops_count = max(0, len(segments) - 1)
        duration_minutes = flight_info[8] if len(flight_info) > 8 and isinstance(flight_info[8], (int, float)) else None

        depart_local = None
        arrive_local = None
        if segments:
            first_seg = segments[0]
            last_seg = segments[-1]
            if isinstance(first_seg, list) and len(first_seg) > 20 and len(first_seg) > 8 and first_seg[20] and first_seg[8]:
                d = first_seg[20]
                t = first_seg[8]
                hour = t[0] if len(t) > 0 and t[0] is not None else 0
                minute = t[1] if len(t) > 1 and t[1] is not None else 0
                depart_local = f"{d[0]:04d}-{d[1]:02d}-{d[2]:02d} {hour:02d}:{minute:02d}"

            if isinstance(last_seg, list) and len(last_seg) > 21 and len(last_seg) > 10 and last_seg[21] and last_seg[10]:
                d = last_seg[21]
                t = last_seg[10]
                hour = t[0] if len(t) > 0 and t[0] is not None else 0
                minute = t[1] if len(t) > 1 and t[1] is not None else 0
                arrive_local = f"{d[0]:04d}-{d[1]:02d}-{d[2]:02d} {hour:02d}:{minute:02d}"

        # Extracción de precio con fallback dinámico
        price = None
        extraction_path = "not_found"

        if len(k) > 1 and k[1] and isinstance(k[1], list) and len(k[1][0]) > 1:
            cand = k[1][0][1]
            if isinstance(cand, (int, float)) and 5000 <= cand <= 15000000:
                price = float(cand)
                extraction_path = "k1_standard"

        if price is None and segments and isinstance(segments[0], list) and len(segments[0]) > 31:
            cand = segments[0][31]
            if isinstance(cand, (int, float)) and 5000 <= cand <= 15000000:
                price = float(cand)
                extraction_path = "segment_idx31"

        if price is None:
            candidates: list[tuple[float, str]] = []

            def _search_price(obj: Any, path: str = ""):
                if isinstance(obj, (int, float)):
                    if 10000 <= obj <= 10000000 and obj < 1000000000:
                        candidates.append((float(obj), path))
                elif isinstance(obj, list):
                    for i, v in enumerate(obj):
                        _search_price(v, f"{path}[{i}]")
                elif isinstance(obj, dict):
                    for key, v in enumerate(obj.items()):
                        _search_price(v, f"{path}.{key}")

            _search_price(k)
            if candidates:
                price, cand_path = candidates[0]
                extraction_path = f"traverse_{cand_path}"

        raw_hash = (
            f"{origin.upper()}>{dest.upper()}|"
            f"{flight_date}|"
            f"{return_date or '-'}"
            f"|{code}|"
            f"{flight_numbers_str or '-'}"
            f"|{depart_local or '-'}|-|1|{currency.upper()}"
        )
        itinerary_hash = hashlib.md5(raw_hash.encode("utf-8")).hexdigest()

        obs = {
            "observed_date": obs_date_str,
            "flight_date": flight_date,
            "return_date": return_date,
            "lead_days": lead_days,
            "trip_type": trip_type,
            "pax_count": 1,
            "origin_iata": origin.upper(),
            "dest_iata": dest.upper(),
            "airline_code": code,
            "airline_name": norm_name,
            "flight_numbers": flight_numbers_str,
            "depart_local": depart_local,
            "arrive_local": arrive_local,
            "duration_minutes": duration_minutes,
            "stops_count": stops_count,
            "stopover_iatas": stopover_iatas,
            "price_amount": price,
            "currency": currency.upper(),
            "price_ars": price if currency.upper() == "ARS" else None,
            "price_usd": price if currency.upper() == "USD" else None,
            "fx_rate": None,
            "fx_source": None,
            "is_cheapest_of_query": False,
            "fare_brand": None,
            "seats_remaining": None,
            "source": "gflights_tfs",
            "collector_version": COLLECTOR_VERSION,
            "parser_version": PARSER_VERSION,
            "extraction_path": extraction_path,
            "itinerary_hash": itinerary_hash,
        }
        observations.append(obs)

    valid_prices = [o["price_amount"] for o in observations if o["price_amount"] is not None]
    if valid_prices:
        min_p = min(valid_prices)
        for o in observations:
            if o["price_amount"] == min_p:
                o["is_cheapest_of_query"] = True

    return observations, airline_counts, None
