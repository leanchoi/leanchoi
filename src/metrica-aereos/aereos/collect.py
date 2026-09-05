"""Orquestador principal de captura para Métrica Aéreos.

Ejecuta el plan de consultas diarias con:
- Espaciado aleatorio de 15 a 45 segundos.
- Pausa larga de 3 a 8 minutos cada 25 consultas.
- Tope duro de 250 consultas/día.
- Circuit breaker ante 3 fallos consecutivos.
- Escritura directa a JSONL.gz (capa bronce) y bitácora de corridas.
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
DEFER_FLAG = "/tmp/metrica_aereos_preflight_defer"
GOOGLE_FLIGHTS_URL = "https://www.google.com/travel/flights"


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


def ejecutar_captura(
    limit: int | None = None,
    dry_run: bool = False,
    single_route: tuple[str, str] | None = None,
    observed_date: date | None = None,
    proxy: str | None = None,
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
        plan = [c for c in plan if c.origin == orig.upper() and c.dest == dst.upper()]

    if limit is not None and limit > 0:
        plan = plan[:limit]

    logger.info("Total consultas a ejecutar: %d", len(plan))
    if not plan:
        logger.info("No hay consultas planificadas.")
        return 0

    bitacora = BitacoraManager(BITACORA_DIR)
    bronce_path = ruta_archivo_bronce(today)
    client = get_http_client(proxy=proxy)

    consecutive_failures = 0
    total_itinerarios_lote = 0
    conteo_global_aerolineas: dict[str, int] = {}
    consultas_ejecutadas = 0

    for i, consulta in enumerate(plan):
        run_id = str(uuid.uuid4())
        obs_at = datetime.now(timezone.utc).isoformat()

        # Circuit breaker a los 3 fallos consecutivos
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
                error_detail="Circuit breaker activo tras 3 fallos consecutivos",
            )
            bitacora.registrar(run_log)
            continue

        # Codificar consulta
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

        if not dry_run:
            try:
                resp = client.get(GOOGLE_FLIGHTS_URL, params=params)
                http_code = resp.status_code
                latency_ms = int((time.time() - t0) * 1000)

                if http_code != 200:
                    status = "bloqueado" if http_code in (429, 403) else "parse_error"
                    error_detail = f"HTTP {http_code}"
                    consecutive_failures += 1
                else:
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
                        status = "sin_resultados"
                        consecutive_failures = 0
                    else:
                        status = "ok"
                        consecutive_failures = 0
                        itinerarios_encontrados = len(observaciones)
                        total_itinerarios_lote += itinerarios_encontrados

                        # Contar caminos de extracción
                        for obs in observaciones:
                            obs["run_id"] = run_id
                            p = obs.get("extraction_path", "desconocido")
                            paths_usados[p] = paths_usados.get(p, 0) + 1

                        # Guardar observaciones en capa bronce comprimida
                        with gzip.open(bronce_path, "at", encoding="utf-8") as gz_fh:
                            for obs in observaciones:
                                gz_fh.write(json.dumps(obs, ensure_ascii=False) + "\n")

                        # Sumar al conteo global del lote
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

        consultas_ejecutadas += 1
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
            error_detail=error_detail,
        )
        bitacora.registrar(run_log)

        logger.info(
            "[%d/%d] %s→%s salida=%s vuelta=%s => [%s] %d itinerarios (%s) en %d ms",
            i + 1,
            len(plan),
            consulta.origin,
            consulta.dest,
            consulta.flight_date,
            consulta.return_date,
            status,
            itinerarios_encontrados,
            por_aerolinea,
            latency_ms,
        )

        # Pausas entre consultas
        if i < len(plan) - 1 and not dry_run:
            # Pausa larga cada 25 consultas: 3 a 8 min
            if (i + 1) % 25 == 0:
                pausa_larga = random.uniform(180, 480)
                logger.info("Pausa larga preventiva de %.1f segundos tras %d consultas...", pausa_larga, i + 1)
                time.sleep(pausa_larga)
            else:
                # Espaciado normal: 15 a 45 s
                pausa = random.uniform(15, 45)
                time.sleep(pausa)

    # 3. Canario al cierre de la corrida
    canario = evaluar_canario_dia(today, conteo_global_aerolineas, bitacora_dir=BITACORA_DIR)
    logger.info("Resultado del canario: %s", canario)

    logger.info(
        "Corrida finalizada: %d consultas ejecutadas, %d itinerarios totales capturados. Desglose: %s",
        consultas_ejecutadas,
        total_itinerarios_lote,
        conteo_global_aerolineas,
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Colector mínimo Métrica Aéreos")
    parser.add_argument("--limit", type=int, default=None, help="Límite de consultas a ejecutar")
    parser.add_argument("--dry-run", action="store_true", help="Simula sin hacer peticiones HTTP")
    parser.add_argument("--route", nargs=2, metavar=("ORIGEN", "DESTINO"), help="Filtra una sola ruta")
    parser.add_argument("--proxy", type=str, default=None, help="Proxy HTTP opcional")
    args = parser.parse_args()

    route_tuple = (args.route[0], args.route[1]) if args.route else None
    return ejecutar_captura(limit=args.limit, dry_run=args.dry_run, single_route=route_tuple, proxy=args.proxy)


if __name__ == "__main__":
    sys.exit(main())
