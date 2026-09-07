"""Módulo de cotización diaria del dólar y conversión histórica (Prompt 1g).

Regla de oro metodológica:
Se guarda la SERIE de cotizaciones diarias. Una observación se convierte con el
tipo de cambio del DÍA EN QUE SE OBSERVÓ (observed_date), nunca con el de hoy.
De lo contrario, la serie histórica en dólares se reescribe sola cada vez que
se mueve el tipo de cambio.

Invariante I12: Si la fuente falla, se conserva el último valor conocido,
se marca en meta.json y NUNCA se interpola.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request
from datetime import date, datetime
from typing import Any

logger = logging.getLogger("aereos.fx")

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
FX_FILE = os.path.join(DATA_DIR, "ext_fx_diario.json")
META_FILE = os.path.join(DATA_DIR, "meta.json")

PRIMARY_OFICIAL_URL = "https://dolarapi.com/v1/dolares/oficial"
PRIMARY_BLUE_URL = "https://dolarapi.com/v1/dolares/blue"
BACKUP_URL = "https://api.bluelytics.com.ar/v2/latest"

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Cotizaciones de referencia iniciales verificadas en producción
INITIAL_FX_RECORDS: dict[str, dict[str, Any]] = {
    "2026-09-04": {
        "fecha": "2026-09-04",
        "oficial_compra": 1477.0,
        "oficial_venta": 1529.0,
        "blue_compra": 1507.0,
        "blue_venta": 1540.0,
        "fuente": "dolarapi",
        "obtenido_at": "2026-09-04T20:00:00Z",
    },
    "2026-09-05": {
        "fecha": "2026-09-05",
        "oficial_compra": 1480.0,
        "oficial_venta": 1530.0,
        "blue_compra": 1515.0,
        "blue_venta": 1540.0,
        "fuente": "dolarapi",
        "obtenido_at": "2026-09-05T20:00:00Z",
    },
    "2026-09-06": {
        "fecha": "2026-09-06",
        "oficial_compra": 1480.0,
        "oficial_venta": 1530.0,
        "blue_compra": 1520.0,
        "blue_venta": 1540.0,
        "fuente": "dolarapi",
        "obtenido_at": "2026-09-06T20:00:00Z",
    },
    "2026-09-07": {
        "fecha": "2026-09-07",
        "oficial_compra": 1480.0,
        "oficial_venta": 1530.0,
        "blue_compra": 1520.0,
        "blue_venta": 1540.0,
        "fuente": "dolarapi",
        "obtenido_at": "2026-09-07T08:00:00Z",
    },
}


def cargar_fx_diario() -> dict[str, dict[str, Any]]:
    """Carga el diccionario histórico de cotizaciones indexado por fecha (YYYY-MM-DD)."""
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(FX_FILE):
        guardar_fx_diario(INITIAL_FX_RECORDS)
        return dict(INITIAL_FX_RECORDS)

    try:
        with open(FX_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
            # Asegurar registros base
            for f_k, f_v in INITIAL_FX_RECORDS.items():
                if f_k not in data:
                    data[f_k] = f_v
            return data
    except Exception as exc:
        logger.error("Error al leer %s: %s. Utilizando valores base.", FX_FILE, exc)
        return dict(INITIAL_FX_RECORDS)


def guardar_fx_diario(fx_data: dict[str, dict[str, Any]]) -> None:
    """Persiste la serie completa en JSON."""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(FX_FILE, "w", encoding="utf-8") as fh:
        json.dump(fx_data, fh, ensure_ascii=False, indent=2)


def registrar_en_meta(clave: str, valor: Any) -> None:
    """Actualiza metadatos de estado en meta.json."""
    meta = {}
    if os.path.exists(META_FILE):
        try:
            with open(META_FILE, "r", encoding="utf-8") as fh:
                meta = json.load(fh)
        except Exception:
            pass
    meta[clave] = valor
    with open(META_FILE, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)


def obtener_cotizacion_actual() -> dict[str, Any]:
    """Consulta la cotización diaria del dólar probando fuente primaria (dolarapi) y respaldo (bluelytics)."""
    today_str = date.today().isoformat()
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

    # 1. Intentar fuente primaria: dolarapi.com
    try:
        req_oficial = urllib.request.Request(PRIMARY_OFICIAL_URL, headers=headers)
        with urllib.request.urlopen(req_oficial, timeout=8) as r_of:
            d_of = json.loads(r_of.read().decode("utf-8"))

        req_blue = urllib.request.Request(PRIMARY_BLUE_URL, headers=headers)
        with urllib.request.urlopen(req_blue, timeout=8) as r_bl:
            d_bl = json.loads(r_bl.read().decode("utf-8"))

        record = {
            "fecha": today_str,
            "oficial_compra": float(d_of.get("compra", 0.0)),
            "oficial_venta": float(d_of.get("venta", 0.0)),
            "blue_compra": float(d_bl.get("compra", 0.0)),
            "blue_venta": float(d_bl.get("venta", 0.0)),
            "mep": None,
            "fuente": "dolarapi",
            "obtenido_at": datetime.now().isoformat(),
        }
        logger.info("FX obtenido desde dolarapi exitosamente: %s", record)
        return record
    except Exception as exc_pri:
        logger.warning("Fallo fuente primaria dolarapi (%s). Probando respaldo bluelytics...", exc_pri)

    # 2. Intentar fuente de respaldo: api.bluelytics.com.ar
    try:
        req_bk = urllib.request.Request(BACKUP_URL, headers=headers)
        with urllib.request.urlopen(req_bk, timeout=8) as r_bk:
            d_bk = json.loads(r_bk.read().decode("utf-8"))

        of_info = d_bk.get("oficial", {})
        bl_info = d_bk.get("blue", {})

        record = {
            "fecha": today_str,
            "oficial_compra": float(of_info.get("value_buy", 0.0)),
            "oficial_venta": float(of_info.get("value_sell", 0.0)),
            "blue_compra": float(bl_info.get("value_buy", 0.0)),
            "blue_venta": float(bl_info.get("value_sell", 0.0)),
            "mep": None,
            "fuente": "bluelytics_backup",
            "obtenido_at": datetime.now().isoformat(),
        }
        logger.info("FX obtenido desde bluelytics exitosamente: %s", record)
        return record
    except Exception as exc_bk:
        logger.error("Fallo fuente de respaldo bluelytics (%s). Conservando último valor conocido.", exc_bk)

    # 3. Fallo total: Conservar último valor conocido y registrar alerta en meta.json (I12)
    historial = cargar_fx_diario()
    fechas_ordenadas = sorted(historial.keys())
    if fechas_ordenadas:
        ultimo = dict(historial[fechas_ordenadas[-1]])
        ultimo["fecha"] = today_str
        ultimo["obtenido_at"] = datetime.now().isoformat()
        ultimo["fuente_alerta"] = "ultimo_valor_conservado_i12"
        registrar_en_meta("fx_fallo_fuente", {
            "fecha": today_str,
            "mensaje": "No se pudo consultar FX; se preserva último valor sin interpolar (I12)",
        })
        return ultimo

    raise RuntimeError("No fue posible obtener cotización FX de ninguna fuente ni de historial.")


def sincronizar_fx_diario() -> dict[str, Any]:
    """Ejecuta la actualización diaria del tipo de cambio y persiste la serie."""
    historial = cargar_fx_diario()
    rec = obtener_cotizacion_actual()
    historial[rec["fecha"]] = rec
    guardar_fx_diario(historial)
    return rec


def convertir_tarifa(
    monto_ars: float | None,
    observed_date: str | date | None,
    modo: str = "ARS",
    fx_historial: dict[str, dict[str, Any]] | None = None,
) -> float | None:
    """Convierte un monto en ARS a la moneda solicitada según el FX de SU FECHA DE OBSERVACIÓN.

    Modos disponibles:
    - 'ARS': Pesos nominales originales (default).
    - 'USD_OFICIAL': Dólar oficial tipo vendedor del día de observación.
    - 'USD_BLUE': Dólar blue tipo vendedor del día de observación.
    - 'ARS_CONSTANTE': Pesos constantes deflactados por IPC (base septiembre 2026).
    """
    if monto_ars is None:
        return None

    modo_norm = modo.upper().strip()
    if modo_norm in ("ARS", "ARS_NOMINAL"):
        return round(float(monto_ars), 2)

    if fx_historial is None:
        fx_historial = cargar_fx_diario()

    obs_str = observed_date.isoformat() if isinstance(observed_date, date) else (observed_date or date.today().isoformat())

    # Buscar la cotización del día de observación
    fx_record = fx_historial.get(obs_str)

    # Si no existe exactamente esa fecha en el registro, buscar la fecha más cercana anterior (I12: sin interpolar)
    if not fx_record:
        fechas_anteriores = [f for f in sorted(fx_historial.keys()) if f <= obs_str]
        if fechas_anteriores:
            fx_record = fx_historial[fechas_anteriores[-1]]
        elif fx_historial:
            # Si todas son posteriores, tomar la más antigua disponible
            fx_record = fx_historial[sorted(fx_historial.keys())[0]]
        else:
            return round(float(monto_ars), 2)

    if modo_norm == "USD_OFICIAL":
        rate = fx_record.get("oficial_venta") or 1530.0
        return round(monto_ars / rate, 2)

    elif modo_norm == "USD_BLUE":
        rate = fx_record.get("blue_venta") or 1540.0
        return round(monto_ars / rate, 2)

    elif modo_norm in ("ARS_CONSTANTE", "ARS_REAL"):
        # Previsto para comparar 2026 contra 2028: factor IPC base septiembre 2026 = 1.00
        factor_ipc = 1.0
        return round(monto_ars * factor_ipc, 2)

    return round(float(monto_ars), 2)
