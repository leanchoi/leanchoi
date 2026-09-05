"""Canario de integridad por aerolínea para Métrica Aéreos.

Evalúa si los itinerarios de CUALQUIER operador caen >30% respecto de su
mediana móvil de 7 días. Previene la degradación silenciosa cuando un operador
desaparece del scraping.
"""
from __future__ import annotations

import glob
import json
import logging
import os
import statistics
from datetime import date, timedelta
from typing import Any

logger = logging.getLogger("aereos.canario")
BITACORA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "bitacora")


def evaluar_canario_dia(
    today: date,
    conteo_hoy_por_aerolinea: dict[str, int],
    bitacora_dir: str = BITACORA_DIR,
    umbral_caida: float = 0.30,
) -> dict[str, Any]:
    """Evalúa la salud de la captura por aerolínea respecto a los 7 días anteriores."""
    historial: dict[str, list[int]] = {}

    # Leer los últimos 7 días
    for d in range(1, 8):
        dia_pasado = today - timedelta(days=d)
        archivo = os.path.join(bitacora_dir, f"runs_{dia_pasado.isoformat()}.jsonl")
        if not os.path.exists(archivo):
            continue

        conteo_dia: dict[str, int] = {}
        with open(archivo, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    for aerolinea, cnt in data.get("itineraries_by_airline", {}).items():
                        conteo_dia[aerolinea] = conteo_dia.get(aerolinea, 0) + cnt
                except Exception:
                    pass

        for aerolinea, cnt in conteo_dia.items():
            historial.setdefault(aerolinea, []).append(cnt)

    alertas: list[str] = []
    resumen_operadores: dict[str, Any] = {}

    for aerolinea in ("AR", "FO", "WJ"):
        cnt_hoy = conteo_hoy_por_aerolinea.get(aerolinea, 0)
        serie_pasada = historial.get(aerolinea, [])

        if len(serie_pasada) >= 3:
            mediana_7d = statistics.median(serie_pasada)
            if mediana_7d >= 3:
                caida_pct = (mediana_7d - cnt_hoy) / mediana_7d
                if caida_pct > umbral_caida:
                    msg = (
                        f"ALERTA CANARIO: Itinerarios de {aerolinea} cayeron {caida_pct:.1%} "
                        f"(hoy: {cnt_hoy}, mediana 7d: {mediana_7d:.1f}). Posible bloqueo o cambio de layout."
                    )
                    alertas.append(msg)
                    logger.warning(msg)

                resumen_operadores[aerolinea] = {
                    "hoy": cnt_hoy,
                    "mediana_7d": mediana_7d,
                    "caida_pct": caida_pct,
                    "estado": "alerta" if caida_pct > umbral_caida else "ok",
                }
            else:
                resumen_operadores[aerolinea] = {"hoy": cnt_hoy, "mediana_7d": mediana_7d, "estado": "bajo_volumen"}
        else:
            resumen_operadores[aerolinea] = {
                "hoy": cnt_hoy,
                "dias_muestra": len(serie_pasada),
                "estado": "calibrando",
            }

    return {
        "fecha": today.isoformat(),
        "tiene_alertas": len(alertas) > 0,
        "alertas": alertas,
        "operadores": resumen_operadores,
    }
