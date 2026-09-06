"""Orquestador principal de captura para Métrica Aéreos (F1a - Prompt 1c).

Ejecuta el plan de consultas con:
- Persistencia del BLOB JSON comprimido (.json.gz) en bronce ANTES de parsear (~8 KB vs 2 MB).
- Guardado de 5 fixtures de HTML completo por día (rotación 7 días).
- Poda automática de disco con presupuesto declarado (8 GB) y aviso en meta.json.
- Clasificación estricta de 'sin_servicio' con 3 condiciones (cero itinerarios + respuesta_valida + calendario_explica).
- Registro explícito de hechos en bitácora (respuesta_valida, calendario_explica, calendario_version).
- Circuit breaker ante 3 fallos y registro de omitido_por_presupuesto por orden de prioridad.
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
from .parse import (
    COLLECTOR_VERSION,
    PARSER_VERSION,
    evaluar_calendario_servicio,
    extract_json_blob,
    parse_payload_json,
    parse_response_html,
    validar_respuesta_estructural,
)
from .runs import BitacoraManager, ScrapeRunLog
from .schedule import ORDEN_PRIORIDAD, planificar_consultas_dia
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
META_JSON_PATH = os.path.join(BASE_DIR, "data", "meta.json")
DEFER_FLAG = "/tmp/metrica_aereos_preflight_defer"
GOOGLE_FLIGHTS_URL = "https://www.google.com/travel/flights"


def cargar_configuracion_completa() -> tuple[dict[str, Any], dict[str, Any]]:
    ruta_cfg = os.path.join(CONFIG_DIR, "rutas_muestreo.json")
    ruta_cal_svc = os.path.join(CONFIG_DIR, "calendario_servicio.json")

    cfg = {}
    if os.path.exists(ruta_cfg):
        with open(ruta_cfg, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)

    cal_svc = {}
    if os.path.exists(ruta_cal_svc):
        with open(ruta_cal_svc, "r", encoding="utf-8") as fh:
            cal_svc = json.load(fh)

    return cfg, cal_svc


def es_dia_sin_servicio(origin: str, dest: str, flight_date_str: str) -> bool:
    """Determina si para una ruta y fecha la ausencia está explicada por calendario (compatibilidad)."""
    _, cal_svc = cargar_configuracion_completa()
    explica, _ = evaluar_calendario_servicio(origin, dest, flight_date_str, cal_svc)
    return explica


def get_http_client(proxy: str | None = None) -> Client:
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


def guardar_crudo(
    obs_date: date,
    query_id: str,
    html_text: str,
    json_blob_str: str | None = None,
    guardar_fixture: bool = False,
) -> tuple[str, str]:
    """Guarda el BLOB JSON comprimido en data/bronce/raw/YYYY-MM-DD/{query_id}.json.gz."""
    d_str = obs_date.isoformat()
    raw_dir = os.path.join(BRONCE_DIR, "raw", d_str)
    os.makedirs(raw_dir, exist_ok=True)

    if json_blob_str:
        filename = f"{query_id}.json.gz"
        full_path = os.path.join(raw_dir, filename)
        rel_ref = os.path.join("raw", d_str, filename)
        with gzip.open(full_path, "wt", encoding="utf-8") as gz_fh:
            gz_fh.write(json_blob_str)
    else:
        # Fallback a HTML si no se pudo extraer el blob JSON (interstitial o error)
        filename = f"{query_id}.html.gz"
        full_path = os.path.join(raw_dir, filename)
        rel_ref = os.path.join("raw", d_str, filename)
        with gzip.open(full_path, "wt", encoding="utf-8") as gz_fh:
            gz_fh.write(html_text)

    # Fixture completa opcional (hasta 5 por día, retención 7 días)
    if guardar_fixture:
        fix_dir = os.path.join(BRONCE_DIR, "fixtures", d_str)
        os.makedirs(fix_dir, exist_ok=True)
        fix_path = os.path.join(fix_dir, f"{query_id}.html.gz")
        with gzip.open(fix_path, "wt", encoding="utf-8") as gz_fh:
            gz_fh.write(html_text)

    return full_path, rel_ref


def verificar_y_podar_disco(
    bronce_dir: str = BRONCE_DIR,
    presupuesto_bytes: int = 8 * 1024 * 1024 * 1024,
    meta_path: str = META_JSON_PATH,
) -> dict[str, Any]:
    """Verifica el tamaño de la capa bronce y poda los archivos raw más antiguos si excede el presupuesto."""
    raw_root = os.path.join(bronce_dir, "raw")
    if not os.path.exists(raw_root):
        return {"podados": 0, "bytes_liberados": 0, "alerta": False}

    archivos_info: list[tuple[str, int, float]] = []
    total_bytes = 0

    for root, _, files in os.walk(bronce_dir):
        for f in files:
            fp = os.path.join(root, f)
            try:
                sz = os.path.getsize(fp)
                mtime = os.path.getmtime(fp)
                total_bytes += sz
                if "/raw/" in fp:
                    archivos_info.append((fp, sz, mtime))
            except OSError:
                pass

    if total_bytes <= presupuesto_bytes:
        return {"total_bytes": total_bytes, "podados": 0, "bytes_liberados": 0, "alerta": False}

    # Ordenar raw files por fecha de modificación ascendente (más viejos primero)
    archivos_info.sort(key=lambda x: x[2])
    podados = 0
    bytes_liberados = 0
    bytes_a_liberar = total_bytes - presupuesto_bytes

    for fp, sz, _ in archivos_info:
        if bytes_liberados >= bytes_a_liberar:
            break
        try:
            os.remove(fp)
            bytes_liberados += sz
            podados += 1
        except OSError:
            pass

    # Registrar alerta en meta.json
    alerta_info = {
        "alerta_disco": {
            "mensaje": f"Presupuesto de disco superado ({round(presupuesto_bytes/(1024*1024), 1)} MB). Poda automática ejecutada.",
            "archivos_podados": podados,
            "bytes_liberados": bytes_liberados,
            "bytes_restantes": total_bytes - bytes_liberados,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    }

    try:
        os.makedirs(os.path.dirname(meta_path), exist_ok=True)
        meta_actual = {}
        if os.path.exists(meta_path):
            with open(meta_path, "r", encoding="utf-8") as mf:
                meta_actual = json.load(mf)
        meta_actual.update(alerta_info)
        with open(meta_path, "w", encoding="utf-8") as mf:
            json.dump(meta_actual, mf, indent=2, ensure_ascii=False)
    except Exception as exc:
        logger.error("Error actualizando meta.json tras poda: %s", exc)

    logger.warning("PODA DE DISCO: %d archivos podados, %d bytes liberados.", podados, bytes_liberados)
    return {"total_bytes": total_bytes - bytes_liberados, "podados": podados, "bytes_liberados": bytes_liberados, "alerta": True}


def ejecutar_captura(
    limit: int | None = None,
    dry_run: bool = False,
    single_route: tuple[str, str] | None = None,
    observed_date: date | None = None,
    proxy: str | None = None,
    force_parser_fail: bool = False,
    simulate_interstitial: bool = False,
    override_tope: int | None = None,
    override_presupuesto_bytes: int | None = None,
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

    cfg, cal_svc = cargar_configuracion_completa()
    global_cfg = cfg.get("global", {})
    tope_dia = override_tope if override_tope is not None else global_cfg.get("tope_consultas_dia", 250)
    presupuesto_disco_gb = global_cfg.get("retencion_crudo", {}).get("presupuesto_disco_gb", 8)
    presupuesto_bytes = override_presupuesto_bytes if override_presupuesto_bytes is not None else presupuesto_disco_gb * 1024 * 1024 * 1024

    # 2. Planificar consultas
    plan = planificar_consultas_dia(observed_date=today)
    if single_route:
        orig, dst = single_route
        plan = [c for c in plan if c.origin.upper() == orig.upper() and c.dest.upper() == dst.upper()]

    if limit is not None and limit > 0:
        plan = plan[:limit]

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
    fixtures_guardadas_hoy = 0

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

        # Chequeo de tope diario de consultas (por orden de prioridad)
        if consultas_ejecutadas_red >= tope_dia:
            logger.warning("Tope diario alcanzado (%d). Omitiendo %s (%s)", tope_dia, consulta.query_id, consulta.prioridad_categoria)
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
            trip_type=consulta.trip_type,
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
        resp_valida = False
        cal_explica = False
        cal_ver = cal_svc.get("version", 1)

        if not dry_run:
            try:
                resp = client.get(GOOGLE_FLIGHTS_URL, params=params)
                http_code = resp.status_code
                latency_ms = int((time.time() - t0) * 1000)

                html_resp = resp.text
                if simulate_interstitial:
                    # Payload simulado de bloqueo/interstitial
                    html_resp = "<html><body>Please verify you are human. CAPTCHA required.</body></html>"

                # P0: Extraer BLOB JSON antes de guardar para ahorrar disco
                blob_json_str, blob_err = extract_json_blob(html_resp)

                # Guardar BLOB JSON (o HTML si blob no existe)
                es_fixture = (fixtures_guardadas_hoy < 5)
                _, raw_rel_ref = guardar_crudo(
                    today,
                    consulta.query_id,
                    html_resp,
                    json_blob_str=blob_json_str,
                    guardar_fixture=es_fixture,
                )
                if es_fixture:
                    fixtures_guardadas_hoy += 1

                if http_code != 200:
                    status = "bloqueado" if http_code in (429, 403) else "parse_error"
                    error_detail = f"HTTP {http_code}"
                    consecutive_failures += 1
                elif blob_err:
                    status = "parse_error"
                    error_detail = blob_err
                    consecutive_failures += 1
                else:
                    if force_parser_fail:
                        raise RuntimeError("Parser forzado a fallar para test de contrato")

                    payload = json.loads(blob_json_str)

                    # P1: Evaluar validez estructural y calendario de servicio (HECHOS)
                    resp_valida = validar_respuesta_estructural(payload, consulta.origin, consulta.dest)
                    cal_explica, cal_ver, cal_motivo = evaluar_calendario_servicio(
                        consulta.origin, consulta.dest, consulta.flight_date, cal_svc, return_detalle=True
                    )

                    observaciones, por_aerolinea, parse_err = parse_payload_json(
                        payload,
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
                        # REGLA P1: Clasificación precisa de vacíos según calendario y mercado
                        if resp_valida and cal_explica:
                            if cal_motivo == "fuera_de_ventana":
                                status = "fuera_de_ventana_de_venta"
                                error_detail = "Fuera de ventana estacional de servicio (ej. nieve)"
                            else:
                                status = "sin_servicio"
                                error_detail = "Sin servicio programado según calendario semanal"
                        elif resp_valida and not cal_explica:
                            # Ruta opera pero no devuelve vuelos -> evaluar capacidad agotada (S3) vs lejanía
                            try:
                                dt_f = date.fromisoformat(consulta.flight_date)
                                lead_d = (dt_f - today).days
                            except Exception:
                                lead_d = 0

                            if lead_d > 180:
                                status = "fuera_de_ventana_de_venta"
                                error_detail = f"Fecha lejana ({lead_d}d): inventario aún no abierto a la venta"
                            elif consulta.dest in ("EQS", "BRC", "CPC") or consulta.origin in ("EQS", "BRC", "CPC"):
                                status = "capacidad_agotada"
                                error_detail = "Ruta operando normalmente pero sin disponibilidad / agotado (Señal S3)"
                            else:
                                status = "sin_resultados"
                                error_detail = "Cero itinerarios devueltos (causa no determinada)"
                        else:
                            status = "sin_resultados"
                            error_detail = "Respuesta sin evidencia estructural de búsqueda (posible soft-block)"
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

                        with gzip.open(bronce_path, "at", encoding="utf-8") as gz_fh:
                            for obs in observaciones:
                                gz_fh.write(json.dumps(obs, ensure_ascii=False) + "\n")

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
            resp_valida = True

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

        logger.info(
            "[%d/%d] %s→%s salida=%s vuelta=%s => [%s] %d itins (%s) en %d ms (resp_valida=%s, cal_explica=%s, raw=%s)",
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
            resp_valida,
            cal_explica,
            raw_rel_ref or "none",
        )

        if i < len(plan) - 1 and not dry_run:
            if consultas_ejecutadas_red % 25 == 0:
                pausa_larga = random.uniform(180, 480)
                logger.info("Pausa larga preventiva de %.1f s tras %d consultas...", pausa_larga, consultas_ejecutadas_red)
                time.sleep(pausa_larga)
            else:
                pausa = random.uniform(15, 45)
                time.sleep(pausa)

    # 3. Poda de disco automática al finalizar lote
    poda_res = verificar_y_podar_disco(
        bronce_dir=BRONCE_DIR,
        presupuesto_bytes=presupuesto_bytes,
        meta_path=META_JSON_PATH,
    )
    logger.info("Chequeo de presupuesto de disco: %s", poda_res)

    # 4. Canario al cierre de la corrida
    canario = evaluar_canario_dia(today, conteo_global_aerolineas, bitacora_dir=BITACORA_DIR)
    logger.info("Resultado del canario: %s", canario)

    resumen = bitacora.leer_resumen_dia(today)
    logger.info(
        "Corrida finalizada: %d consultas registradas (%d en red). Resumen: %s",
        len(plan),
        consultas_ejecutadas_red,
        resumen,
    )
    return 0


def reprocesar_crudo(
    raw_path: str,
    origin: str,
    dest: str,
    flight_date: str,
    return_date: str | None = None,
    trip_type: str = "one_way",
) -> list[dict[str, Any]]:
    """Reprocesa una respuesta cruda desde un archivo .json.gz o .html.gz."""
    with gzip.open(raw_path, "rt", encoding="utf-8") as f:
        contenido = f.read()

    if raw_path.endswith(".json.gz"):
        payload = json.loads(contenido)
        obs, _, _ = parse_payload_json(
            payload,
            origin=origin,
            dest=dest,
            flight_date=flight_date,
            return_date=return_date,
            trip_type=trip_type,
        )
        return obs
    else:
        obs, _, _ = parse_response_html(
            contenido,
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
    parser.add_argument("--simulate-interstitial", action="store_true", help="Simula respuesta de interstitial")
    parser.add_argument("--override-tope", type=int, default=None, help="Sobrescribe tope diario para testing")
    parser.add_argument("--override-presupuesto-mb", type=int, default=None, help="Sobrescribe presupuesto de disco en MB para testing")
    args = parser.parse_args()

    presupuesto_bytes = args.override_presupuesto_mb * 1024 * 1024 if args.override_presupuesto_mb is not None else None
    route_tuple = (args.route[0], args.route[1]) if args.route else None
    return ejecutar_captura(
        limit=args.limit,
        dry_run=args.dry_run,
        single_route=route_tuple,
        proxy=args.proxy,
        force_parser_fail=args.force_fail,
        simulate_interstitial=args.simulate_interstitial,
        override_tope=args.override_tope,
        override_presupuesto_bytes=presupuesto_bytes,
    )


if __name__ == "__main__":
    sys.exit(main())
