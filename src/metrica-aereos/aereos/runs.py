"""Bitácora de ejecuciones de consultas para Métrica Aéreos.

Registra UNA FILA POR CONSULTA PLANIFICADA en formato JSONL según
specs/sql/01_air_schema.sql.
Incluye el desglose de itinerarios extraídos por aerolínea, caminos de extracción y raw_ref.
"""
from __future__ import annotations

import json
import os
import uuid
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from typing import Any

BITACORA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "bitacora")


@dataclass
class ScrapeRunLog:
    run_id: str
    batch_id: str
    observed_at: str
    observed_date: str
    origin_iata: str
    dest_iata: str
    flight_date: str
    return_date: str | None
    pax_count: int
    currency: str
    source: str
    status: str  # ok | sin_resultados | sin_servicio | bloqueado | timeout | parse_error | omitido_por_presupuesto | omitido_por_preflight
    itineraries_found: int
    itineraries_by_airline: dict[str, int]
    extraction_paths: dict[str, int]
    latency_ms: int | None
    http_status: int | None
    collector_version: str
    parser_version: str
    raw_ref: str | None = None
    error_detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class BitacoraManager:
    def __init__(self, bitacora_dir: str = BITACORA_DIR):
        self.bitacora_dir = bitacora_dir
        os.makedirs(self.bitacora_dir, exist_ok=True)

    def ruta_log_dia(self, obs_date: date | str) -> str:
        d_str = obs_date.isoformat() if isinstance(obs_date, date) else str(obs_date)
        return os.path.join(self.bitacora_dir, f"runs_{d_str}.jsonl")

    def registrar(self, run: ScrapeRunLog) -> None:
        """Escribe una entrada en la bitácora del día."""
        os.makedirs(self.bitacora_dir, exist_ok=True)
        archivo = self.ruta_log_dia(run.observed_date)
        linea = json.dumps(run.to_dict(), ensure_ascii=False)
        with open(archivo, "a", encoding="utf-8") as fh:
            fh.write(linea + chr(10))

    def leer_resumen_dia(self, obs_date: date | str) -> dict[str, Any]:
        """Lee el resumen de la corrida del día distinguiendo sin_servicio."""
        archivo = self.ruta_log_dia(obs_date)
        if not os.path.exists(archivo):
            return {"total_consultas": 0, "ok": 0, "sin_servicio": 0, "sin_resultados": 0, "fallos": 0, "por_aerolinea": {}}

        total = 0
        ok_count = 0
        sin_servicio_count = 0
        sin_resultados_count = 0
        fallos = 0
        por_aerolinea: dict[str, int] = {}

        with open(archivo, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                total += 1
                try:
                    data = json.loads(line)
                    status = data.get("status")
                    if status == "ok":
                        ok_count += 1
                    elif status == "sin_servicio":
                        sin_servicio_count += 1
                    elif status == "sin_resultados":
                        sin_resultados_count += 1
                    elif status in ("bloqueado", "timeout", "parse_error"):
                        fallos += 1

                    for aerolinea, cnt in data.get("itineraries_by_airline", {}).items():
                        por_aerolinea[aerolinea] = por_aerolinea.get(aerolinea, 0) + cnt
                except Exception:
                    fallos += 1

        return {
            "total_consultas": total,
            "ok": ok_count,
            "sin_servicio": sin_servicio_count,
            "sin_resultados": sin_resultados_count,
            "fallos": fallos,
            "cobertura_valida_pct": round(((ok_count + sin_servicio_count) / max(1, total)) * 100, 1),
            "itinerarios_por_aerolinea": por_aerolinea,
        }
