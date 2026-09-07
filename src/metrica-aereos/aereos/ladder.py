"""Módulo de captura y persistencia de Escalera Tarifaria (Prompt 1g).

Implementa la sonda directa contra la API JSON nativa de Aerolíneas Argentinas
(Camino 1: https://api.aerolineas.com.ar/v1/flights/offers) para capturar
las cinco familias tarifarias (Base, Plus, Flex, Promo Premium, Premium Economy),
cupos de asientos y clases tarifarias.
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from datetime import date, datetime
from typing import Any

logger = logging.getLogger("aereos.ladder")

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BRONCE_DIR = os.path.join(BASE_DIR, "data", "bronce")

BRAND_RANKS = {
    "Base": 1,
    "Plus": 2,
    "Flex": 3,
    "Promo Premium": 4,
    "Premium Economy": 5,
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


class AerolineasLadderClient:
    """Cliente HTTP para interactuar con la API REST de Aerolíneas Argentinas."""

    def __init__(self, token_url: str = "https://www.aerolineas.com.ar/auth/token",
                 api_url: str = "https://api.aerolineas.com.ar/v1/flights/offers"):
        self.token_url = token_url
        self.api_url = api_url
        self._cached_token: str | None = None
        self._token_expires_at: float = 0.0

    def get_token(self, force_refresh: bool = False) -> str:
        """Obtiene o renueva el token JWT Bearer de acceso."""
        now = time.time()
        if not force_refresh and self._cached_token and now < (self._token_expires_at - 60):
            return self._cached_token

        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "es-AR,es;q=0.9",
        }
        req = urllib.request.Request(self.token_url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self._cached_token = data.get("access_token")
                # expires_in en la API suele ser timestamp absoluto o delta
                exp_raw = data.get("expires_in", now + 7200)
                if exp_raw > 1_000_000_000:
                    self._token_expires_at = float(exp_raw)
                else:
                    self._token_expires_at = now + float(exp_raw)
                logger.info("Token de Aerolíneas Argentinas negociado exitosamente")
                return self._cached_token
        except Exception as exc:
            logger.error("Error al negociar token de Aerolíneas: %s", exc)
            raise

    def fetch_flight_offers(
        self,
        origin: str,
        dest: str,
        flight_date: str | date,
        adults: int = 1,
    ) -> dict[str, Any]:
        """Consulta la escalera tarifaria completa para una ruta y fecha de vuelo."""
        f_str = flight_date.isoformat() if isinstance(flight_date, date) else flight_date
        f_compact = f_str.replace("-", "")

        token = self.get_token()
        query_leg = f"{origin.upper()}-{dest.upper()}-{f_compact}"
        url = f"{self.api_url}?adt={adults}&flightType=ONE_WAY&leg={query_leg}"

        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "es-AR,es;q=0.9",
            "Authorization": f"Bearer {token}",
            "X-Channel-Id": "WEB_AR",
        }

        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            if err.code == 401:
                # Reintentar una vez con token forzado
                logger.warning("Token expirado (401). Forzando renovación...")
                token = self.get_token(force_refresh=True)
                headers["Authorization"] = f"Bearer {token}"
                req2 = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req2, timeout=15) as resp2:
                    return json.loads(resp2.read().decode("utf-8"))
            raise


def parse_ladder_records(
    api_response: dict[str, Any],
    origin: str,
    dest: str,
    flight_date: str | date,
    observed_date: str | date | None = None,
) -> list[dict[str, Any]]:
    """Transforma la respuesta JSON de Aerolíneas Argentinas en registros planos para air_fare_ladder."""
    f_date_str = flight_date.isoformat() if isinstance(flight_date, date) else flight_date
    obs_date_str = (
        observed_date.isoformat() if isinstance(observed_date, date)
        else (observed_date or date.today().isoformat())
    )

    dt_flight = date.fromisoformat(f_date_str)
    dt_obs = date.fromisoformat(obs_date_str)
    lead_days = (dt_flight - dt_obs).days

    branded_offers = api_response.get("brandedOffers", {})
    # brandedOffers suele ser {"0": [offers...]}
    all_flight_groups = []
    if isinstance(branded_offers, dict):
        for val in branded_offers.values():
            if isinstance(val, list):
                all_flight_groups.extend(val)
    elif isinstance(branded_offers, list):
        all_flight_groups.extend(branded_offers)

    records: list[dict[str, Any]] = []

    for item in all_flight_groups:
        legs = item.get("legs", [])
        if not legs:
            continue

        # Extraer primer segmento de vuelo
        first_leg = legs[0]
        segments = first_leg.get("segments", [])
        if not segments:
            continue

        first_seg = segments[0]
        carrier = first_seg.get("airline", "AR")
        fn_num = first_seg.get("flightNumber", "")
        flight_number = f"{carrier}{fn_num}"
        dep_local = first_seg.get("departure")
        seg_orig = first_seg.get("origin", origin)
        seg_dest = segments[-1].get("destination", dest) if len(segments) > 1 else first_seg.get("destination", dest)

        offers = item.get("offers", [])
        for off in offers:
            brand_info = off.get("brand", {})
            brand_name = brand_info.get("name", "Desconocido")
            brand_id = brand_info.get("id", "")
            brand_rank = BRAND_RANKS.get(brand_name, 99)

            fare_info = off.get("fare", {})
            total_price = fare_info.get("total", 0.0)
            base_fare = fare_info.get("baseFare", 0.0)
            taxes = fare_info.get("taxes", 0.0)

            seat_avail = off.get("seatAvailability", {})
            seats_rem = seat_avail.get("seats") if isinstance(seat_avail, dict) else None

            records.append({
                "observed_date": obs_date_str,
                "flight_date": f_date_str,
                "lead_days": lead_days,
                "origin_iata": seg_orig,
                "dest_iata": seg_dest,
                "airline_code": carrier,
                "flight_number": flight_number,
                "depart_local": dep_local,
                "fare_brand": brand_name,
                "brand_id": brand_id,
                "brand_rank": brand_rank,
                "price_amount": float(total_price),
                "base_fare": float(base_fare),
                "taxes": float(taxes),
                "currency": "ARS",
                "is_available": True,
                "seats_remaining": seats_rem,
                "booking_class": off.get("bookingClass"),
                "fare_basis": off.get("fareBasis"),
                "source": "aerolineas_api",
                "collector_version": "1.0.0",
                "created_at": datetime.now().isoformat(),
            })

    # Ordenar registros por flight_number y brand_rank
    records.sort(key=lambda r: (r["flight_number"], r["brand_rank"]))
    return records


def guardar_observaciones_escalera(
    records: list[dict[str, Any]],
    output_dir: str | None = None,
) -> str:
    """Persiste los registros de escalera tarifaria en formato JSONL en la capa bronce."""
    dest_dir = output_dir or BRONCE_DIR
    os.makedirs(dest_dir, exist_ok=True)

    today_str = date.today().isoformat()
    filename = f"ladder_{today_str}.jsonl"
    filepath = os.path.join(dest_dir, filename)

    with open(filepath, "a", encoding="utf-8") as fh:
        for rec in records:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    logger.info("Guardados %d registros de escalera en %s", len(records), filepath)
    return filepath


def cargar_observaciones_escalera(
    origen: str | None = None,
    destino: str | None = None,
    fecha_vuelo: str | None = None,
    data_dir: str | None = None,
) -> list[dict[str, Any]]:
    """Carga y filtra registros de escalera tarifaria almacenados en la capa bronce."""
    source_dir = data_dir or BRONCE_DIR
    if not os.path.exists(source_dir):
        return []

    files = sorted(
        [f for f in os.listdir(source_dir) if f.startswith("ladder_") and f.endswith(".jsonl")],
        reverse=True,
    )

    records: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str, str, str, str]] = set()

    for fname in files:
        fpath = os.path.join(source_dir, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except Exception:
                        continue

                    orig_rec = rec.get("origin_iata", "").upper()
                    dest_rec = rec.get("dest_iata", "").upper()

                    def match_ap(c: str, q: str) -> bool:
                        q_u = q.upper()
                        if q_u == "BUE":
                            return c in ("BUE", "AEP", "EZE")
                        if c == "BUE":
                            return q_u in ("BUE", "AEP", "EZE")
                        return c == q_u

                    if origen and not match_ap(orig_rec, origen):
                        continue
                    if destino and not match_ap(dest_rec, destino):
                        continue
                    if fecha_vuelo and rec.get("flight_date") != fecha_vuelo:
                        continue

                    dedupe_key = (
                        rec.get("observed_date", ""),
                        rec.get("flight_date", ""),
                        rec.get("origin_iata", ""),
                        rec.get("dest_iata", ""),
                        rec.get("flight_number", ""),
                        rec.get("fare_brand", ""),
                    )
                    if dedupe_key in seen_keys:
                        continue
                    seen_keys.add(dedupe_key)
                    records.append(rec)
        except Exception as exc:
            logger.error("Error leyendo archivo de escalera %s: %s", fpath, exc)

    return records


def consultar_y_guardar_escalera(
    origen: str,
    destino: str,
    fecha_vuelo: str | date,
    adults: int = 1,
    client: AerolineasLadderClient | None = None,
) -> list[dict[str, Any]]:
    """Consulta la escalera tarifaria nativa de Aerolíneas Argentinas y la persiste en bronce."""
    c = client or AerolineasLadderClient()
    resp = c.fetch_flight_offers(origin=origen, dest=destino, flight_date=fecha_vuelo, adults=adults)
    records = parse_ladder_records(resp, origin=origen, dest=destino, flight_date=fecha_vuelo)
    if records:
        guardar_observaciones_escalera(records)
    return records


