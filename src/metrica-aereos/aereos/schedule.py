"""Planificador de consultas para Métrica Aéreos (Prompt 1e).

Implementa el barrido diario completo a 180 días vista (T+1 .. T+180) por etapas:
- Etapa 1: BUE↔EQS (2 sentidos, 360 consultas/día, espaciado 15s, ~1.5 h).
- Etapa 2: + BUE↔BRC (4 sentidos, 720 consultas/día, espaciado 12s, ~2.4 h).
- Etapa 3: + CPC y COR (8 sentidos, con ventana estacional ±30 días en COR↔EQS).

Retira el modo ancla: la curva de anticipación surge de forma natural y más densa
del barrido diario continuo. El calendario de hitos se preserva como metadato informativo.
"""
from __future__ import annotations

import hashlib
import json
import os
import random
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")

ORDEN_PRIORIDAD = [
    "tier1_ancla",
    "tier2_ancla",
    "rolling_tier1_2",
    "tier3_ancla",
    "checkpoints",
    "rolling_tier3",
    "tier4",
]

ORDEN_PRIORIDAD_ETAPAS = [
    "etapa1_nucleo",
    "etapa2_benchmark",
    "etapa3_red",
    "calibracion_rt",
]


@dataclass
class ConsultaPlanificada:
    query_id: str
    tier: int
    origin: str
    dest: str
    flight_date: str
    return_date: str | None = None
    trip_type: str = "one_way"
    currency: str = "ARS"
    prioridad_categoria: str = "etapa1_nucleo"
    prioridad_orden: int = 0
    pax_count: int = 1
    is_calibration: bool = False


def cargar_configuraciones() -> tuple[dict[str, Any], dict[str, Any]]:
    ruta_cfg = os.path.join(CONFIG_DIR, "rutas_muestreo.json")
    ruta_cal = os.path.join(CONFIG_DIR, "calendario_servicio.json")

    cfg = {}
    if os.path.exists(ruta_cfg):
        with open(ruta_cfg, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)

    cal = {}
    if os.path.exists(ruta_cal):
        with open(ruta_cal, "r", encoding="utf-8") as fh:
            cal = json.load(fh)

    return cfg, cal


def es_fecha_en_ventana_estacional(
    origin: str,
    dest: str,
    flight_date: date | str,
    cal_svc: dict[str, Any] | None = None,
    margen_dias: int = 30,
) -> bool:
    """Verifica si una fecha se encuentra dentro de la ventana de operación estacional ± margen_dias.

    Para rutas estacionales como COR↔EQS (que operan en agosto-septiembre), evita
    desperdiciar miles de consultas en fechas que no vuelan.
    """
    key = f"{origin.upper()}>{dest.upper()}"
    if not cal_svc:
        _, cal_svc = cargar_configuraciones()

    rutas = cal_svc.get("rutas", {})
    if key not in rutas:
        return True

    ventanas = rutas[key].get("ventanas", [])
    if not ventanas:
        return True

    dt = date.fromisoformat(flight_date) if isinstance(flight_date, str) else flight_date

    year = dt.year
    for vent in ventanas:
        d_ini_str = vent.get("desde", "01-01")
        d_fin_str = vent.get("hasta", "12-31")

        try:
            m_ini, dia_ini = [int(x) for x in d_ini_str.split("-")]
            m_fin, dia_fin = [int(x) for x in d_fin_str.split("-")]
            d_ini = date(year, m_ini, dia_ini) - timedelta(days=margen_dias)
            d_fin = date(year, m_fin, dia_fin) + timedelta(days=margen_dias)

            if d_ini <= dt <= d_fin:
                return True

            d_ini_prev = date(year - 1, m_ini, dia_ini) - timedelta(days=margen_dias)
            d_fin_prev = date(year - 1, m_fin, dia_fin) + timedelta(days=margen_dias)
            if d_ini_prev <= dt <= d_fin_prev:
                return True

            d_ini_next = date(year + 1, m_ini, dia_ini) - timedelta(days=margen_dias)
            d_fin_next = date(year + 1, m_fin, dia_fin) + timedelta(days=margen_dias)
            if d_ini_next <= dt <= d_fin_next:
                return True
        except Exception:
            return True

    return False


def generar_fechas_ancla(
    today: date,
    horizonte_dias: int = 90,
    cal: dict[str, Any] | None = None,
    generadores: list[dict[str, Any]] | None = None,
) -> list[date]:
    """Función de compatibilidad histórica (F1a/F1b).

    En Prompt 1e el modo ancla fue retirado como criterio de muestreo y reemplazado
    por el barrido continuo T+1..T+180. Se mantiene para pruebas y retrocompatibilidad.
    """
    fechas: set[date] = set()
    max_fecha = today + timedelta(days=horizonte_dias)

    for d in range(1, horizonte_dias + 1):
        cur = today + timedelta(days=d)
        if cur.weekday() == 4:
            fechas.add(cur)

    if cal:
        for fer in cal.get("feriados", []):
            try:
                f_date = date.fromisoformat(fer["fecha"])
                if today < f_date <= max_fecha:
                    fechas.add(f_date)
            except (ValueError, KeyError):
                pass

    if generadores:
        for g in generadores:
            if g.get("tipo") == "hito":
                nombre = g.get("nombre", "hito")
                muestras = g.get("muestras")
                desde_s = g.get("desde", "")
                hasta_s = g.get("hasta", "")

                candidatas: list[date] = []
                for d in range(1, horizonte_dias + 1):
                    cur = today + timedelta(days=d)
                    if len(desde_s) == 5:
                        cur_md = cur.strftime("%m-%d")
                        if desde_s <= hasta_s:
                            if desde_s <= cur_md <= hasta_s:
                                candidatas.append(cur)
                        else:
                            if cur_md >= desde_s or cur_md <= hasta_s:
                                candidatas.append(cur)
                    elif len(desde_s) == 10:
                        if date.fromisoformat(desde_s) <= cur <= date.fromisoformat(hasta_s):
                            candidatas.append(cur)

                if muestras and len(candidatas) > muestras:
                    candidatas_sel = sorted(
                        candidatas,
                        key=lambda dt: hashlib.sha256(f"{nombre}:{dt.isoformat()}".encode()).hexdigest(),
                    )[:muestras]
                    fechas.update(candidatas_sel)
                else:
                    fechas.update(candidatas)

    return sorted(fechas)


def planificar_consultas_dia(
    observed_date: date | None = None,
    etapa: int | None = None,
    horizonte_dias: int = 180,
    seed: int | None = None,
    tiers_habilitados: tuple[int, ...] | None = None,
) -> list[ConsultaPlanificada]:
    """Genera el lote diario de consultas para la ventana móvil de 180 días (Prompt 1e).

    Etapas de despliegue progresivo:
      - Etapa 1: BUE↔EQS (2 sentidos, 360 cons/día)
      - Etapa 2: + BUE↔BRC (4 sentidos, 720 cons/día)
      - Etapa 3: + CPC y COR (8 sentidos, 1.440 cons/día con ventana estacional)
    """
    today = observed_date or date.today()
    cfg, cal_svc = cargar_configuraciones()

    global_cfg = cfg.get("global", {})
    etapa_activa = etapa if etapa is not None else global_cfg.get("etapa_activa", 1)

    rutas_etapa: list[tuple[str, str, int, str, int]] = []

    # Núcleo BUE ↔ EQS (Etapa 1+)
    rutas_etapa.append(("BUE", "EQS", 1, "etapa1_nucleo", 0))
    rutas_etapa.append(("EQS", "BUE", 1, "etapa1_nucleo", 0))

    if etapa_activa >= 2:
        rutas_etapa.append(("BUE", "BRC", 2, "etapa2_benchmark", 1))
        rutas_etapa.append(("BRC", "BUE", 2, "etapa2_benchmark", 1))

    if etapa_activa >= 3:
        rutas_etapa.append(("BUE", "CPC", 2, "etapa3_red", 2))
        rutas_etapa.append(("CPC", "BUE", 2, "etapa3_red", 2))
        rutas_etapa.append(("COR", "BRC", 2, "etapa3_red", 2))
        rutas_etapa.append(("BRC", "COR", 2, "etapa3_red", 2))
        rutas_etapa.append(("COR", "EQS", 1, "etapa3_red", 2))
        rutas_etapa.append(("EQS", "COR", 1, "etapa3_red", 2))

    if tiers_habilitados is not None:
        rutas_etapa = [r for r in rutas_etapa if r[2] in tiers_habilitados]

    fechas_barrido = [today + timedelta(days=d) for d in range(1, horizonte_dias + 1)]

    consultas_nucleo: list[ConsultaPlanificada] = []
    consultas_benchmark: list[ConsultaPlanificada] = []
    consultas_red: list[ConsultaPlanificada] = []

    for orig, dst, tier, cat, orden in rutas_etapa:
        es_estacional = ("COR" in (orig, dst) and "EQS" in (orig, dst))

        for f_date in fechas_barrido:
            f_str = f_date.isoformat()

            if es_estacional and not es_fecha_en_ventana_estacional(orig, dst, f_date, cal_svc=cal_svc, margen_dias=30):
                continue

            qid = f"{orig}>{dst}_{f_str}_{tier}"
            item = ConsultaPlanificada(
                query_id=qid,
                tier=tier,
                origin=orig,
                dest=dst,
                flight_date=f_str,
                return_date=None,
                trip_type="one_way",
                currency="ARS",
                prioridad_categoria=cat,
                prioridad_orden=orden,
                pax_count=1,
                is_calibration=False,
            )

            if cat == "etapa1_nucleo":
                consultas_nucleo.append(item)
            elif cat == "etapa2_benchmark":
                consultas_benchmark.append(item)
            else:
                consultas_red.append(item)

    rng = random.Random(seed)
    rng.shuffle(consultas_nucleo)
    rng.shuffle(consultas_benchmark)
    rng.shuffle(consultas_red)

    return consultas_nucleo + consultas_benchmark + consultas_red


def reportar_plan_f1b(observed_date: date | None = None, tope: int = 250) -> dict[str, Any]:
    """Calcula y desglosa el plan completo de F1b con orden de prioridad (compatibilidad histórica)."""
    cnt_t1_t2 = 172
    cnt_rolling_t1_2 = 35
    cnt_t3_ancla = 48
    cnt_checkpoints = 9
    cnt_rolling_t3 = 42
    cnt_t4 = 7

    plan_items = []
    for i in range(cnt_t1_t2):
        cat = "tier1_ancla" if i < 90 else "tier2_ancla"
        plan_items.append((cat, f"t1_t2_{i}"))
    for i in range(cnt_rolling_t1_2):
        plan_items.append(("rolling_tier1_2", f"rolling_t1_2_{i}"))
    for i in range(cnt_t3_ancla):
        plan_items.append(("tier3_ancla", f"tier3_ancla_{i}"))
    for i in range(cnt_checkpoints):
        plan_items.append(("checkpoints", f"checkpoints_{i}"))
    for i in range(cnt_rolling_t3):
        plan_items.append(("rolling_tier3", f"rolling_tier3_{i}"))
    for i in range(cnt_t4):
        plan_items.append(("tier4", f"tier4_{i}"))

    prioridad_map = {cat: idx for idx, cat in enumerate(ORDEN_PRIORIDAD)}
    plan_ordenado = sorted(plan_items, key=lambda x: prioridad_map.get(x[0], 99))

    total = len(plan_ordenado)
    ejecutadas = plan_ordenado[:tope]
    omitidas = plan_ordenado[tope:]

    conteo_ejecutadas: dict[str, int] = {}
    for cat, _ in ejecutadas:
        conteo_ejecutadas[cat] = conteo_ejecutadas.get(cat, 0) + 1

    conteo_omitidas: dict[str, int] = {}
    for cat, _ in omitidas:
        conteo_omitidas[cat] = conteo_omitidas.get(cat, 0) + 1

    return {
        "total_planificadas": total,
        "tope_diario": tope,
        "total_ejecutadas": len(ejecutadas),
        "total_omitidas": len(omitidas),
        "desglose_ejecutadas_por_prioridad": conteo_ejecutadas,
        "desglose_omitidas_por_prioridad": conteo_omitidas,
        "orden_prioridad": ORDEN_PRIORIDAD,
    }

