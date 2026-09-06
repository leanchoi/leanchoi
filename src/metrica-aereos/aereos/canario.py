"""Canario de integridad por aerolínea y ruta para Métrica Aéreos.

Distingue entre rutas densas y rutas finas según specs/config/rutas_muestreo.json:
- Ruta densa (mediana 7d >= 5): alerta si el conteo cae > 30%.
- Ruta fina (mediana 7d < 5, ej. BUE-EQS con 1-2 vuelos): NO alerta ante caídas
  normales de disponibilidad (de 2 a 1), pero SÍ alerta si un operador que antes
  aparecía desaparece por 3 corridas consecutivas.
"""
from __future__ import annotations

import json
import logging
import os
import statistics
from datetime import date, timedelta
from typing import Any

logger = logging.getLogger("aereos.canario")
BITACORA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "bitacora")


def evaluar_operador_ruta(
    ruta: str,
    operador: str,
    historial_corridas: list[int],
    conteo_hoy: int,
    mediana_minima_densa: int = 5,
    umbral_caida_densa: float = 0.30,
    corridas_consecutivas_fina: int = 3,
) -> dict[str, Any]:
    """Evalúa un operador en una ruta distinguiendo régimen denso vs fino."""
    if not historial_corridas:
        return {
            "ruta": ruta,
            "operador": operador,
            "hoy": conteo_hoy,
            "regimen": "fina" if conteo_hoy < mediana_minima_densa else "densa",
            "estado": "calibrando",
            "alerta": False,
            "mensaje": f"Calibrando línea de base para {operador} en {ruta}",
        }

    mediana_7d = statistics.median(historial_corridas)
    es_densa = mediana_7d >= mediana_minima_densa

    if es_densa:
        caida_pct = (mediana_7d - conteo_hoy) / mediana_7d
        if caida_pct > umbral_caida_densa:
            msg = (
                f"ALERTA CANARIO (Ruta densa {ruta}): Itinerarios de {operador} cayeron {caida_pct:.1%} "
                f"(hoy: {conteo_hoy}, mediana 7d: {mediana_7d:.1f}). Posible degradación de parser."
            )
            return {
                "ruta": ruta,
                "operador": operador,
                "hoy": conteo_hoy,
                "mediana_7d": mediana_7d,
                "regimen": "densa",
                "estado": "alerta",
                "alerta": True,
                "mensaje": msg,
            }
        return {
            "ruta": ruta,
            "operador": operador,
            "hoy": conteo_hoy,
            "mediana_7d": mediana_7d,
            "regimen": "densa",
            "estado": "ok",
            "alerta": False,
            "mensaje": f"{operador} en {ruta} saludable",
        }
    else:
        # Régimen ruta fina (mediana < 5, ej. BUE-EQS)
        # Si hoy tiene vuelos (> 0), no hay alerta aunque haya bajado de 2 a 1
        if conteo_hoy > 0:
            return {
                "ruta": ruta,
                "operador": operador,
                "hoy": conteo_hoy,
                "mediana_7d": mediana_7d,
                "regimen": "fina",
                "estado": "ok",
                "alerta": False,
                "mensaje": f"{operador} en {ruta} presente ({conteo_hoy} vuelos)",
            }

        # conteo_hoy == 0: verificar si el operador operaba antes y si son N corridas consecutivas
        ultimas = [conteo_hoy] + historial_corridas[:corridas_consecutivas_fina - 1]
        operaba_antes = mediana_7d > 0

        if operaba_antes and len(ultimas) >= corridas_consecutivas_fina and all(c == 0 for c in ultimas):
            msg = (
                f"ALERTA CANARIO (Ruta fina {ruta}): {operador} desapareció por {corridas_consecutivas_fina} "
                f"corridas consecutivas (antes mediana {mediana_7d:.1f}). Posible bloqueo o pérdida de operador."
            )
            return {
                "ruta": ruta,
                "operador": operador,
                "hoy": 0,
                "mediana_7d": mediana_7d,
                "regimen": "fina",
                "estado": "alerta",
                "alerta": True,
                "mensaje": msg,
            }

        return {
            "ruta": ruta,
            "operador": operador,
            "hoy": conteo_hoy,
            "mediana_7d": mediana_7d,
            "regimen": "fina",
            "estado": "ok",
            "alerta": False,
            "mensaje": f"{operador} en {ruta} sin vuelos hoy (en seguimiento)",
        }


def evaluar_canario_dia(
    today: date,
    conteo_hoy_por_aerolinea: dict[str, int],
    bitacora_dir: str = BITACORA_DIR,
    umbral_caida: float = 0.30,
) -> dict[str, Any]:
    """Evalúa la salud global y por ruta fina/densa."""
    historial: dict[str, list[int]] = {}

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

        eval_res = evaluar_operador_ruta(
            ruta="GLOBAL",
            operador=aerolinea,
            historial_corridas=serie_pasada,
            conteo_hoy=cnt_hoy,
            mediana_minima_densa=5,
            umbral_caida_densa=umbral_caida,
        )

        if eval_res["alerta"]:
            alertas.append(eval_res["mensaje"])
            logger.warning(eval_res["mensaje"])

        resumen_operadores[aerolinea] = eval_res

    return {
        "fecha": today.isoformat(),
        "tiene_alertas": len(alertas) > 0,
        "alertas": alertas,
        "operadores": resumen_operadores,
    }
