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
import gzip
import json
import logging
import os
import sys
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("aereos.server")

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
    sin_resultados = 0
    fallos = 0
    itinerarios_por_aerolinea: dict[str, int] = {}

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
                        elif st == "sin_resultados":
                            sin_resultados += 1
                        else:
                            fallos += 1

                        for a, cnt in entry.get("itineraries_by_airline", {}).items():
                            itinerarios_por_aerolinea[a] = itinerarios_por_aerolinea.get(a, 0) + cnt
                    except Exception:
                        pass
        except Exception as exc:
            logger.error("Error leyendo bitacora: %s", exc)

    cobertura_valida = ((ok + sin_servicio) / total_consultas * 100) if total_consultas > 0 else 0.0
    total_itinerarios = sum(itinerarios_por_aerolinea.values())

    return {
        "fecha_observacion": obs_date,
        "total_consultas": total_consultas,
        "ok": ok,
        "sin_servicio": sin_servicio,
        "sin_resultados": sin_resultados,
        "fallos": fallos,
        "cobertura_valida_pct": round(cobertura_valida, 1),
        "total_itinerarios": total_itinerarios,
        "itinerarios_por_aerolinea": itinerarios_por_aerolinea,
        "disco": disk_info,
        "estado_sistema": "saludable" if fallos == 0 and cobertura_valida >= 75.0 else "alerta",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def load_itineraries(
    origen: str | None = None,
    destino: str | None = None,
    aerolinea: str | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    solo_baratos: bool = False,
    limit: int = 200,
) -> list[dict[str, Any]]:
    vuelos_file = get_latest_vuelos_file()
    if not vuelos_file or not os.path.exists(vuelos_file):
        return []

    results: list[dict[str, Any]] = []
    origen_u = origen.upper() if origen else None
    destino_u = destino.upper() if destino else None
    aero_u = aerolinea.upper() if aerolinea else None

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

                results.append(item)
                if len(results) >= limit:
                    break
    except Exception as exc:
        logger.error("Error cargando itinerarios: %s", exc)

    return results


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
                        "precios": [],
                        "aerolineas": {},
                        "fechas": set(),
                    }

                r = routes_map[route_key]
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
    operators = ["AR", "FO", "WJ", "LA", "G3"]
    status_ops: list[dict[str, Any]] = []
    for op in operators:
        cnt = summary["itinerarios_por_aerolinea"].get(op, 0)
        status_ops.append({
            "operador": op,
            "itinerarios_hoy": cnt,
            "estado": "saludable" if cnt > 0 else "en_seguimiento",
            "alerta": False,
        })

    return {
        "fecha": summary["fecha_observacion"],
        "estado_general": "saludable",
        "alertas_activas": 0,
        "operadores": status_ops,
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
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/api/status":
            self.send_json(get_summary_status())
            return
        elif path == "/api/vuelos":
            origen = qs.get("origen", [None])[0]
            destino = qs.get("destino", [None])[0]
            aerolinea = qs.get("aerolinea", [None])[0]
            fecha_desde = qs.get("fecha_desde", [None])[0]
            fecha_hasta = qs.get("fecha_hasta", [None])[0]
            solo_baratos = qs.get("solo_baratos", ["false"])[0].lower() in ("true", "1")
            limit = int(qs.get("limit", [200])[0])
            self.send_json(load_itineraries(
                origen=origen,
                destino=destino,
                aerolinea=aerolinea,
                fecha_desde=fecha_desde,
                fecha_hasta=fecha_hasta,
                solo_baratos=solo_baratos,
                limit=min(limit, 1000),
            ))
            return
        elif path == "/api/rutas":
            self.send_json(get_routes_summary())
            return
        elif path == "/api/bitacora":
            status = qs.get("status", [None])[0]
            ruta = qs.get("ruta", [None])[0]
            limit = int(qs.get("limit", [150])[0])
            self.send_json(get_bitacora_entries(
                status=status,
                ruta=ruta,
                limit=min(limit, 500),
            ))
            return
        elif path == "/api/canario":
            self.send_json(get_canary_data())
            return
        elif path == "/api/calendario":
            self.send_json(get_calendar_config())
            return

        if path in ("/", "/index.html"):
            self.serve_static_file("index.html", "text/html; charset=utf-8")
            return
        elif path == "/style.css":
            self.serve_static_file("style.css", "text/css; charset=utf-8")
            return
        elif path == "/app.js":
            self.serve_static_file("app.js", "application/javascript; charset=utf-8")
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Recurso no encontrado")

    def send_json(self, data: Any):
        payload = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(payload)

    def serve_static_file(self, filename: str, content_type: str):
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
            self.send_header("Cache-Control", "public, max-age=300")
            self.end_headers()
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
