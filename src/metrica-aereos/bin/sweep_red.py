#!/usr/bin/env python3
"""Barrido ad-hoc inmediato de Panel de Red y Superficie Completa para Métrica Aéreos.

Permite ejecutar de inmediato la captura de:
- Panel de Red (126 consultas): REL, PMY, CRD, USH, FTE, IGR, JUJ, SLA, MDZ (7 leads fijos).
- Superficie Completa (BRC, CPC desde BUE).
Escribe directamente en capa bronce (vuelos_YYYY-MM-DD.jsonl.gz), capa cruda (raw/) y bitácora.
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
from datetime import date, datetime, timedelta, timezone
from typing import Any

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from aereos.collect import (
    COLLECTOR_VERSION,
    GOOGLE_FLIGHTS_URL,
    PARSER_VERSION,
    evaluar_calendario_servicio,
    extract_json_blob,
    get_http_client,
    guardar_crudo,
    parse_payload_json,
    ruta_archivo_bronce,
    validar_respuesta_estructural,
)
from aereos.runs import BitacoraManager, ScrapeRunLog
from aereos.schedule import (
    ConsultaPlanificada,
    cargar_configuraciones,
    es_fecha_en_ventana_estacional,
)
from aereos.tfs import encode_tfs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("aereos.sweep_red")

BRONCE_DIR = os.path.join(BASE_DIR, "data", "bronce")
BITACORA_DIR = os.path.join(BASE_DIR, "data", "bitacora")


def planificar_panel_red(today: date) -> list[ConsultaPlanificada]:
    destinos = ["REL", "PMY", "CRD", "USH", "FTE", "IGR", "JUJ", "SLA", "MDZ"]
    leads = [7, 14, 30, 60, 90, 120, 180]
    consultas: list[ConsultaPlanificada] = []

    for dst in destinos:
        for sentido_o, sentido_d in [("BUE", dst), (dst, "BUE")]:
            for lead in leads:
                f_date = today + timedelta(days=lead)
                f_str = f_date.isoformat()
                qid = f"red_{sentido_o}>{sentido_d}_{f_str}_lead{lead}"
                consultas.append(ConsultaPlanificada(
                    query_id=qid,
                    tier=3 if dst in ("REL", "PMY", "CRD", "USH", "FTE") else 4,
                    origin=sentido_o,
                    dest=sentido_d,
                    flight_date=f_str,
                    prioridad_categoria="panel_de_red",
                    prioridad_orden=1,
                ))
    return consultas


def planificar_superficie_faltante(today: date, destinos: list[str] | None = None, horizonte: int = 180) -> list[ConsultaPlanificada]:
    if not destinos:
        destinos = ["BRC", "CPC"]
    consultas: list[ConsultaPlanificada] = []
    fechas = [today + timedelta(days=d) for d in range(1, horizonte + 1)]

    for dst in destinos:
        for sentido_o, sentido_d in [("BUE", dst), (dst, "BUE")]:
            for f_date in fechas:
                f_str = f_date.isoformat()
                qid = f"sup_{sentido_o}>{sentido_d}_{f_str}"
                consultas.append(ConsultaPlanificada(
                    query_id=qid,
                    tier=2,
                    origin=sentido_o,
                    dest=sentido_d,
                    flight_date=f_str,
                    prioridad_categoria="superficie_completa",
                    prioridad_orden=2,
                ))
    return consultas


def ejecutar_barrido(
    plan: list[ConsultaPlanificada],
    observed_date: date | None = None,
    delay_min: float = 0.8,
    delay_max: float = 1.3,
) -> int:
    today = observed_date or date.today()
    batch_id = str(uuid.uuid4())
    logger.info("Iniciando barrido batch %s: %d consultas para fecha %s", batch_id, len(plan), today)

    bitacora = BitacoraManager(BITACORA_DIR)
    bronce_path = ruta_archivo_bronce(today)
    client = get_http_client()
    _, cal_svc = cargar_configuraciones()

    total_itins = 0
    total_ok = 0
    consecutive_errs = 0

    for i, c in enumerate(plan):
        run_id = str(uuid.uuid4())
        obs_at = datetime.now(timezone.utc).isoformat()
        t0 = time.time()

        tfs = encode_tfs(
            origin=c.origin,
            destination=c.dest,
            departure_date=c.flight_date,
            return_date=c.return_date,
            trip_type=c.trip_type,
            adults=c.pax_count,
            seat="economy",
        )
        params = {"tfs": tfs, "hl": "es-AR", "gl": "AR", "curr": c.currency}

        status = "desconocido"
        http_code = None
        itinerarios_encontrados = 0
        por_aerolinea: dict[str, int] = {}
        paths_usados: dict[str, int] = {}
        raw_rel_ref = None
        resp_valida = False
        cal_explica = False
        cal_ver = cal_svc.get("version", 1)
        error_detail = None

        try:
            resp = client.get(GOOGLE_FLIGHTS_URL, params=params)
            http_code = resp.status_code
            latency_ms = int((time.time() - t0) * 1000)
            html_resp = resp.text

            blob_json_str, blob_err = extract_json_blob(html_resp)
            _, raw_rel_ref = guardar_crudo(
                today,
                c.query_id,
                html_resp,
                json_blob_str=blob_json_str,
                guardar_fixture=False,
            )

            if http_code != 200:
                status = "bloqueado" if http_code in (429, 403) else "error_http"
                error_detail = f"HTTP {http_code}"
                consecutive_errs += 1
            elif blob_err:
                status = "parse_error"
                error_detail = blob_err
                consecutive_errs += 1
            else:
                payload = json.loads(blob_json_str)
                resp_valida = validar_respuesta_estructural(payload, c.origin, c.dest)
                cal_explica, cal_ver, cal_motivo = evaluar_calendario_servicio(
                    c.origin, c.dest, c.flight_date, cal_svc, return_detalle=True
                )

                observaciones, por_aerolinea, parse_err = parse_payload_json(
                    payload,
                    origin=c.origin,
                    dest=c.dest,
                    flight_date=c.flight_date,
                    return_date=c.return_date,
                    observed_date=today.isoformat(),
                    trip_type=c.trip_type,
                    currency=c.currency,
                )

                if parse_err:
                    status = "parse_error"
                    error_detail = parse_err
                    consecutive_errs += 1
                elif not observaciones:
                    if resp_valida and cal_explica:
                        status = "fuera_de_ventana_de_venta" if cal_motivo == "fuera_de_ventana" else "sin_servicio"
                    else:
                        status = "sin_resultados"
                    consecutive_errs = 0
                else:
                    status = "ok"
                    total_ok += 1
                    consecutive_errs = 0
                    itinerarios_encontrados = len(observaciones)
                    total_itins += itinerarios_encontrados

                    for obs in observaciones:
                        obs["run_id"] = run_id
                        p = obs.get("extraction_path", "desconocido")
                        paths_usados[p] = paths_usados.get(p, 0) + 1

                    with gzip.open(bronce_path, "at", encoding="utf-8") as gz_fh:
                        for obs in observaciones:
                            gz_fh.write(json.dumps(obs, ensure_ascii=False) + "\n")

        except Exception as exc:
            latency_ms = int((time.time() - t0) * 1000)
            status = "timeout" if "timeout" in str(exc).lower() else "exception"
            error_detail = str(exc)
            consecutive_errs += 1

        run_log = ScrapeRunLog(
            run_id=run_id,
            batch_id=batch_id,
            observed_at=obs_at,
            observed_date=today.isoformat(),
            origin_iata=c.origin,
            dest_iata=c.dest,
            flight_date=c.flight_date,
            return_date=c.return_date,
            pax_count=c.pax_count,
            currency=c.currency,
            source="gflights_tfs",
            status=status,
            itineraries_found=itinerarios_encontrados,
            itineraries_by_airline=por_aerolinea,
            extraction_paths=paths_usados,
            respuesta_valida=resp_valida,
            calendario_explica=cal_explica,
            calendario_version=cal_ver,
            latency_ms=latency_ms,
            http_status=http_code,
            collector_version=COLLECTOR_VERSION,
            parser_version=PARSER_VERSION,
            raw_ref=raw_rel_ref,
            error_detail=error_detail,
        )
        bitacora.registrar(run_log)

        ops_summary = " · ".join(f"{k}:{v}" for k, v in por_aerolinea.items()) if por_aerolinea else "0"
        logger.info(
            "[%d/%d] %s→%s %s => [%s] %d vuelos (%s) en %d ms",
            i + 1,
            len(plan),
            c.origin,
            c.dest,
            c.flight_date,
            status,
            itinerarios_encontrados,
            ops_summary,
            latency_ms,
        )

        if consecutive_errs >= 5:
            logger.error("ALERTA: 5 errores consecutivos. Deteniendo barrido preventivamente.")
            break

        if i < len(plan) - 1:
            time.sleep(random.uniform(delay_min, delay_max))

    logger.info("Barrido completado: %d consultas ejecutadas, %d exitosas, %d itinerarios guardados en %s.",
                len(plan), total_ok, total_itins, bronce_path)
    return total_itins


def main():
    parser = argparse.ArgumentParser(description="Barrido de vuelos ad-hoc para Métrica Aéreos")
    parser.add_argument("--modo", choices=["panel", "superficie", "todo"], default="panel",
                        help="Modo de barrido: 'panel' (9 destinos red), 'superficie' (BRC, CPC), 'todo' (ambos)")
    parser.add_argument("--delay-min", type=float, default=0.8, help="Pausa mínima en segundos entre consultas")
    parser.add_argument("--delay-max", type=float, default=1.3, help="Pausa máxima en segundos entre consultas")
    parser.add_argument("--horizonte", type=int, default=180, help="Horizonte de días para superficie completa")
    args = parser.parse_args()

    today = date.today()
    plan: list[ConsultaPlanificada] = []

    if args.modo in ("panel", "todo"):
        plan_panel = planificar_panel_red(today)
        logger.info("Planificadas %d consultas para Panel de Red (9 destinos x 2 sentidos x 7 leads).", len(plan_panel))
        plan.extend(plan_panel)

    if args.modo in ("superficie", "todo"):
        plan_sup = planificar_superficie_faltante(today, destinos=["BRC", "CPC"], horizonte=args.horizonte)
        logger.info("Planificadas %d consultas para Superficie Completa (BRC, CPC).", len(plan_sup))
        plan.extend(plan_sup)

    total_guardados = ejecutar_barrido(plan, observed_date=today, delay_min=args.delay_min, delay_max=args.delay_max)
    print(f"BARRIDO FINALIZADO: {total_guardados} nuevos itinerarios consolidados.")


if __name__ == "__main__":
    main()
