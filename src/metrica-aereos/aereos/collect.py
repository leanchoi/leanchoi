"""Orquestador principal de captura para Métrica Aéreos.

Ejecuta el plan de consultas diarias con:
- Persistencia estricta del payload crudo comprimido en bronce ANTES de parsear.
- Distinción entre 'sin_servicio' (día sin vuelo conocido, ej. martes en EQS) y 'sin_resultados'.
- Registro explícito en bitácora de 'omitido_por_presupuesto' ante excedentes del tope diario.
- Espaciado aleatorio de 15 a 45 segundos y pausa larga de 3 a 8 min cada 25 consultas.
- Circuit breaker ante 3 fallos consecutivos.
"""
from __future__ import annotations

import argparse
import gzip
import json
import logging
import os
import random
import sys
import time
import uuid
from datetime import date, datetime, timezone
from typing import Any

from primp import Client

from .canario import evaluar_canario_dia
from .parse import COLLECTOR_VERSION, PARSER_VERSION, parse_response_html
from .runs import BitacoraManager, ScrapeRunLog
from .schedule import planificar_consultas_dia
from .tfs import encode_tfs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("aereos.collect")

BASE_DIR = os.path.join(os.path.dirname(__file__), "..")
BRONCE_DIR = os.path.join(BASE_DIR, "data", "bronce")
BITACORA_DIR = os.path.join(BASE_DIR, "data", "bitacora")
CONFIG_DIR = os.path.join(BASE_DIR, "config")
DEFER_FLAG = "/tmp/metrica_aereos_preflight_defer"
GOOGLE_FLIGHTS_URL = "https://www.google.com/travel/flights"


def cargar_global_config() -> dict[str, Any]:
    cfg_path = os.path.join(CONFIG_DIR, "rutas_muestreo.json")
    if os.path.exists(cfg_path):
        with open(cfg_path, "r", encoding="utf-8") as fh:
            return json.load(fh).get("global", {})
    return {}


def get_http_client(proxy: str | None = None) -> Client:
    """Cliente HTTP con huella TLS/HTTP2 de Chrome para evitar bloqueos."""
    return Client(
        impersonate="chrome_145",
        impersonate_os="macos",
        referer=True,
        cookie_store=True,
        proxy=proxy,
    )


def ruta_archivo_bronce(obs_date: date | str) -> str:
    d_str = obs_date.isoformat() if isinstance(obs_date, date) else str(obs_date)
    os.makedirs(BRONCE_DIR, exist_ok=True)
    return os.path.join(BRONCE_DIR, f"vuelos_{d_str}.jsonl.gz")


def guardar_crudo(obs_date: date, query_id: str, html_text: str) -> tuple[str, str]:
    """Guarda la respuesta HTML cruda comprimida en data/bronce/raw/YYYY-MM-DD/{query_id}.html.gz."""
    d_str = obs_date.isoformat()
    raw_dir = os.path.join(BRONCE_DIR, "raw", d_str)
    os.makedirs(raw_dir, exist_ok=True)

    filename = f"{query_id}.html.gz"
    full_path = os.path.join(raw_dir, filename)
    rel_ref = os.path.join("raw", d_str, filename)

    with gzip.open(full_path, "wt", encoding="utf-8") as gz_fh:
        gz_fh.write(html_text)

    return full_path, rel_ref


def es_dia_sin_servicio(origin: str, dest: str, flight_date_str: str) -> bool:
    """Verifica si la ruta no opera servicio según calendario conocido.
    Ejemplo: Esquel (EQS) no opera los días martes.
    """
    try:
        d = date.fromisoformat(flight_date_str)
        # 1 = Martes
        if d.weekday() == 1 and ("EQS" in (origin, dest)):
            return True
    except Exception:
        pass
    return False


def ejecutar_captura(
    limit: int | None = None,
    dry_run: bool = False,
    single_route: tuple[str, str] | None = None,
    observed_date: date | None = None,
    proxy: str | None = None,
    force_parser_fail: bool = False,
    override_tope: int | None = None,
) -> int:
    today = observed_date or date.today()
    batch_id = str(uuid.uuid4())
    logger.info("Iniciando lote %s para fecha observada %s (dry_run=%s)", batch_id, today, dry_run)

    # 1. Chequeo de Preflight
    if os.path.exists(DEFER_FLAG):
        logger.warning("Bandera de preflight activa (%s). Cancelando corrida por interferencia/memoria.", DEFER_FLAG)
        bitacora = BitacoraManager(BITACORA_DIR)
        run_log = ScrapeRunLog(
            run_id=str(uuid.uuid4()),
            batch_id=batch_id,
            observed_at=datetime.now(timezone.utc).isoformat(),
            observed_date=today.isoformat(),
            origin_iata="ALL",
            dest_iata="ALL",
            flight_date=today.isoformat(),
            return_date=None,
            pax_count=1,
            currency="ARS",
            source="gflights_tfs",
            status="omitido_por_preflight",
            itineraries_found=0,
            itineraries_by_airline={},
            extraction_paths={},
            latency_ms=0,
            http_status=None,
            collector_version=COLLECTOR_VERSION,
            parser_version=PARSER_VERSION,
            raw_ref=None,
            error_detail="Memoria baja o procesos Chromium activos",
        )
        bitacora.registrar(run_log)
        try:
            os.remove(DEFER_FLAG)
        except OSError:
            pass
        return 0

    # 2. Planificar consultas
    plan = planificar_consultas_dia(observed_date=today)
    if single_route:
        orig, dst = single_route
        plan = [c for c in plan if c.origin.upper() == orig.upper() and c.dest.upper() == dst.upper()]

    if limit is not None and limit > 0:
        plan = plan[:limit]

    global_cfg = cargar_global_config()
    tope_dia = override_tope if override_tope is not None else global_cfg.get("tope_consultas_dia", 250)

    logger.info("Total consultas planificadas: %d (tope diario configurado: %d)", len(plan), tope_dia)
    if not plan:
        logger.info("No hay consultas planificadas.")
        return 0

    bitacora = BitacoraManager(BITACORA_DIR)
    bronce_path = ruta_archivo_bronce(today)
    client = get_http_client(proxy=proxy)

    consecutive_failures = 0
    total_itinerarios_lote = 0
    conteo_global_aerolineas: dict[str, int] = {}
    consultas_ejecutadas_red = 0

    for i, consulta in enumerate(plan):
        run_id = str(uuid.uuid4())
        obs_at = datetime.now(timezone.utc).isoformat()

        # Circuit breaker ante 3 fallos consecutivos
        if consecutive_failures >= 3:
            logger.error("CIRCUIT BREAKER: 3 fallos consecutivos. Omitiendo consultas restantes.")
            run_log = ScrapeRunLog(
                run_id=run_id,
                batch_id=batch_id,
                observed_at=obs_at,
                observed_date=today.isoformat(),
                origin_iata=consulta.origin,
                dest_iata=consulta.dest,
                flight_date=consulta.flight_date,
                return_date=consulta.return_date,
                pax_count=consulta.pax_count,
                currency=consulta.currency,
                source="gflights_tfs",
                status="omitido_por_presupuesto",
                itineraries_found=0,
                itineraries_by_airline={},
                extraction_paths={},
                latency_ms=None,
                http_status=None,
                collector_version=COLLECTOR_VERSION,
                parser_version=PARSER_VERSION,
                raw_ref=None,
                error_detail="Circuit breaker activo tras 3 fallos consecutivos",
            )
            bitacora.registrar(run_log)
            continue

        # Chequeo de tope diario de consultas (P1-2: no truncar en silencio)
        if consultas_ejecutadas_red >= tope_dia:
            logger.warning("Tope diario alcanzado (%d). Registrando %s como omitido_por_presupuesto", tope_dia, consulta.query_id)
            run_log = ScrapeRunLog(
                run_id=run_id,
                batch_id=batch_id,
                observed_at=obs_at,
                observed_date=today.isoformat(),
                origin_iata=consulta.origin,
                dest_iata=consulta.dest,
                flight_date=consulta.flight_date,
                return_date=consulta.return_date,
                pax_count=consulta.pax_count,
                currency=consulta.currency,
                source="gflights_tfs",
                status="omitido_por_presupuesto",
                itineraries_found=0,
                itineraries_by_airline={},
                extraction_paths={},
                latency_ms=None,
                http_status=None,
                collector_version=COLLECTOR_VERSION,
                parser_version=PARSER_VERSION,
                raw_ref=None,
                error_detail=f"Tope diario ({tope_dia}) alcanzado",
            )
            bitacora.registrar(run_log)
            continue

        # Codificar consulta Protobuf
        tfs = encode_tfs(
            origin=consulta.origin,
            destination=consulta.dest,
            departure_date=consulta.flight_date,
            return_date=consulta.return_date,
            trip_type="round_trip" if consulta.return_date else "one_way",
            adults=consulta.pax_count,
            seat="economy",
        )

        params = {"tfs": tfs, "hl": "es-AR", "gl": "AR", "curr": consulta.currency}
        t0 = time.time()
        status = "ok"
        error_detail = None
        http_code = None
        itinerarios_encontrados = 0
        por_aerolinea: dict[str, int] = {}
        paths_usados: dict[str, int] = {}
        raw_rel_ref = None

        if not dry_run:
            try:
                resp = client.get(GOOGLE_FLIGHTS_URL, params=params)
                http_code = resp.status_code
                latency_ms = int((time.time() - t0) * 1000)

                # REGLA P0-1: PERSISTIR EL CRUDO ANTES DE PARSEAR
                _, raw_rel_ref = guardar_crudo(today, consulta.query_id, resp.text)

                if http_code != 200:
                    status = "bloqueado" if http_code in (429, 403) else "parse_error"
                    error_detail = f"HTTP {http_code}"
                    consecutive_failures += 1
                else:
                    if force_parser_fail:
                        raise RuntimeError("Parser forzado a fallar para test de contrato")

                    observaciones, por_aerolinea, parse_err = parse_response_html(
                        resp.text,
                        origin=consulta.origin,
                        dest=consulta.dest,
                        flight_date=consulta.flight_date,
                        return_date=consulta.return_date,
                        observed_date=today.isoformat(),
                        trip_type=consulta.trip_type,
                        currency=consulta.currency,
                    )

                    if parse_err:
                        status = "parse_error"
                        error_detail = parse_err
                        consecutive_failures += 1
                    elif not observaciones:
                        # REGLA P1-1: DISTINGUIR sin_servicio DE sin_resultados
                        if es_dia_sin_servicio(consulta.origin, consulta.dest, consulta.flight_date):
                            status = "sin_servicio"
                            error_detail = "Sin servicio programado (ej. martes en EQS)"
                        else:
                            status = "sin_resultados"
                        consecutive_failures = 0
                    else:
                        status = "ok"
                        consecutive_failures = 0
                        itinerarios_encontrados = len(observaciones)
                        total_itinerarios_lote += itinerarios_encontrados

                        for obs in observaciones:
                            obs["run_id"] = run_id
                            p = obs.get("extraction_path", "desconocido")
                            paths_usados[p] = paths_usados.get(p, 0) + 1

                        # Guardar en bronce comprimido
                        with gzip.open(bronce_path, "at", encoding="utf-8") as gz_fh:
                            for obs in observaciones:
                                gz_fh.write(json.dumps(obs, ensure_ascii=False) + chr(10))

                        for aerolinea, cnt in por_aerolinea.items():
                            conteo_global_aerolineas[aerolinea] = conteo_global_aerolineas.get(aerolinea, 0) + cnt

            except Exception as exc:
                latency_ms = int((time.time() - t0) * 1000)
                status = "timeout" if "timeout" in str(exc).lower() else "parse_error"
                error_detail = f"{type(exc).__name__}: {exc}"
                consecutive_failures += 1
        else:
            latency_ms = 10
            status = "ok"
            itinerarios_encontrados = 0

        consultas_ejecutadas_red += 1
        run_log = ScrapeRunLog(
            run_id=run_id,
            batch_id=batch_id,
            observed_at=obs_at,
            observed_date=today.isoformat(),
            origin_iata=consulta.origin,
            dest_iata=consulta.dest,
            flight_date=consulta.flight_date,
            return_date=consulta.return_date,
            pax_count=consulta.pax_count,
            currency=consulta.currency,
            source="gflights_tfs",
            status=status,
            itineraries_found=itinerarios_encontrados,
            itineraries_by_airline=por_aerolinea,
            extraction_paths=paths_usados,
            latency_ms=latency_ms,
            http_status=http_code,
            collector_version=COLLECTOR_VERSION,
            parser_version=PARSER_VERSION,
            raw_ref=raw_rel_ref,
            error_detail=error_detail,
        )
        bitacora.registrar(run_log)

        logger.info(
            "[%d/%d] %s→%s salida=%s vuelta=%s => [%s] %d itinerarios (%s) en %d ms (raw=%s)",
            i + 1,
            len(plan),
            consulta.origin,
            consulta.dest,
            consulta.flight_date,
            consulta.return_date or "-",
            status,
            itinerarios_encontrados,
            por_aerolinea,
            latency_ms,
            raw_rel_ref or "none",
        )

        if i < len(plan) - 1 and not dry_run:
            if consultas_ejecutadas_red % 25 == 0:
                pausa_larga = random.uniform(180, 480)
                logger.info("Pausa larga preventiva de %.1f segundos tras %d consultas...", pausa_larga, consultas_ejecutadas_red)
                time.sleep(pausa_larga)
            else:
                pausa = random.uniform(15, 45)
                time.sleep(pausa)

    # 3. Canario al cierre de la corrida
    canario = evaluar_canario_dia(today, conteo_global_aerolineas, bitacora_dir=BITACORA_DIR)
    logger.info("Resultado del canario: %s", canario)

    resumen = bitacora.leer_resumen_dia(today)
    logger.info(
        "Corrida finalizada: %d consultas registradas (%d ejecutadas en red). Resumen: %s",
        len(plan),
        consultas_ejecutadas_red,
        resumen,
    )
    return 0


def reprocesar_crudo(raw_path: str, origin: str, dest: str, flight_date: str, return_date: str | None = None, trip_type: str = "one_way") -> list[dict[str, Any]]:
    """Reprocesa una respuesta cruda desde un archivo .html.gz."""
    with gzip.open(raw_path, "rt", encoding="utf-8") as f:
        html = f.read()
    obs, _, _ = parse_response_html(
        html,
        origin=origin,
        dest=dest,
        flight_date=flight_date,
        return_date=return_date,
        trip_type=trip_type,
    )
    return obs


def main() -> int:
    parser = argparse.ArgumentParser(description="Colector mínimo Métrica Aéreos")
    parser.add_argument("--limit", type=int, default=None, help="Límite de consultas a ejecutar")
    parser.add_argument("--dry-run", action="store_true", help="Simula sin hacer peticiones HTTP")
    parser.add_argument("--route", nargs=2, metavar=("ORIGEN", "DESTINO"), help="Filtra una sola ruta")
    parser.add_argument("--proxy", type=str, default=None, help="Proxy HTTP opcional")
    parser.add_argument("--force-fail", action="store_true", help="Fuerza error en parser para testing")
    parser.add_argument("--override-tope", type=int, default=None, help="Sobrescribe tope diario para testing")
    args = parser.parse_args()

    route_tuple = (args.route[0], args.route[1]) if args.route else None
    return ejecutar_captura(
        limit=args.limit,
        dry_run=args.dry_run,
        single_route=route_tuple,
        proxy=args.proxy,
        force_parser_fail=args.force_fail,
        override_tope=args.override_tope,
    )


if __name__ == "__main__":
    sys.exit(main())
