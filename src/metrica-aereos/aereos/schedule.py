"""Planificador de consultas para Métrica Aéreos.

Genera las consultas del conjunto 'ancla' (one-way bidireccional) para las rutas Tiers 1 y 2
según specs/config/rutas_muestreo.json y calendario.json.
Aplica selección determinista de 'muestras: N' para hitos y medición de calibración RT.
Asigna categorías de prioridad según politica_de_tope para que el orquestador descarte
primero las rutas menos críticas si se alcanza el tope.
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


@dataclass
class ConsultaPlanificada:
    query_id: str
    tier: int
    origin: str
    dest: str
    flight_date: str
    return_date: str | None
    trip_type: str
    currency: str
    prioridad_categoria: str = "tier1_ancla"
    prioridad_orden: int = 0
    pax_count: int = 1
    is_calibration: bool = False


def cargar_configuraciones() -> tuple[dict[str, Any], dict[str, Any]]:
    ruta_cfg = os.path.join(CONFIG_DIR, "rutas_muestreo.json")
    ruta_cal = os.path.join(CONFIG_DIR, "calendario.json")

    with open(ruta_cfg, "r", encoding="utf-8") as fh:
        cfg = json.load(fh)

    cal = {}
    if os.path.exists(ruta_cal):
        with open(ruta_cal, "r", encoding="utf-8") as fh:
            cal = json.load(fh)

    return cfg, cal


def generar_fechas_ancla(
    today: date,
    horizonte_dias: int = 90,
    cal: dict[str, Any] | None = None,
    generadores: list[dict[str, Any]] | None = None,
) -> list[date]:
    """Genera las fechas ancla: viernes, feriados e hitos estacionales con selección determinista de muestras."""
    fechas: set[date] = set()
    max_fecha = today + timedelta(days=horizonte_dias)

    # 1. Viernes
    for d in range(1, horizonte_dias + 1):
        cur = today + timedelta(days=d)
        if cur.weekday() == 4:
            fechas.add(cur)

    # 2. Feriados y puentes
    if cal:
        for fer in cal.get("feriados", []):
            try:
                f_date = date.fromisoformat(fer["fecha"])
                if today < f_date <= max_fecha:
                    fechas.add(f_date)
            except (ValueError, KeyError):
                pass

        for ev in cal.get("eventos", []):
            try:
                e_start = date.fromisoformat(ev["desde"])
                e_end = date.fromisoformat(ev["hasta"])
                cur = e_start
                while cur <= e_end:
                    if today < cur <= max_fecha:
                        fechas.add(cur)
                    cur += timedelta(days=1)
            except (ValueError, KeyError):
                pass

    # 3. Hitos desde generadores con muestras estables (hash sha256 de la fecha)
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
                        key=lambda dt: hashlib.sha256(f"{nombre}:{dt.isoformat()}".encode()).hexdigest()
                    )[:muestras]
                    fechas.update(candidatas_sel)
                else:
                    fechas.update(candidatas)

    return sorted(fechas)


def planificar_consultas_dia(
    observed_date: date | None = None,
    tiers_habilitados: tuple[int, ...] = (1, 2),
    seed: int | None = None,
) -> list[ConsultaPlanificada]:
    """Genera el lote completo de consultas para el día observado ordenado por prioridad estricta."""
    today = observed_date or date.today()
    cfg, cal = cargar_configuraciones()

    ancla_cfg = cfg.get("conjuntos_de_fechas", {}).get("ancla", {})
    generadores = ancla_cfg.get("generadores", [])
    trip_type_base = ancla_cfg.get("trip_type", "one_way")

    fechas_ancla = generar_fechas_ancla(today, horizonte_dias=90, cal=cal, generadores=generadores)

    rutas_raw = [r for r in cfg.get("rutas", []) if r.get("tier") in tiers_habilitados]

    pares_rutas: list[tuple[str, str, int]] = []
    for r in rutas_raw:
        tier = r.get("tier", 2)
        orig = r["origen"]
        dest = r["destino"]
        pares_rutas.append((orig, dest, tier))
        if r.get("bidireccional", False):
            pares_rutas.append((dest, orig, tier))

    consultas_t1: list[ConsultaPlanificada] = []
    consultas_t2: list[ConsultaPlanificada] = []

    for orig, dst, tier in pares_rutas:
        for f_date in fechas_ancla:
            lead = (f_date - today).days
            if lead > 45 and (lead % 3 != 0):
                continue

            qid = f"{orig}>{dst}_{f_date.isoformat()}_{tier}"
            cat = "tier1_ancla" if tier == 1 else "tier2_ancla"
            p_ord = 0 if tier == 1 else 1

            item = ConsultaPlanificada(
                query_id=qid,
                tier=tier,
                origin=orig,
                dest=dst,
                flight_date=f_date.isoformat(),
                return_date=None,
                trip_type=trip_type_base,
                currency="ARS",
                prioridad_categoria=cat,
                prioridad_orden=p_ord,
                pax_count=1,
                is_calibration=False,
            )

            if tier == 1:
                consultas_t1.append(item)
            else:
                consultas_t2.append(item)

    calib_cfg = cfg.get("calibracion_roundtrip", {})
    consultas_calib: list[ConsultaPlanificada] = []
    if calib_cfg.get("habilitado", False):
        dia_sem = today.weekday()
        noches_lista = calib_cfg.get("noches", [3, 4, 7])
        n_noches = noches_lista[dia_sem % len(noches_lista)]

        dep_date = today + timedelta(days=15 + (dia_sem % 7))
        if dep_date.weekday() == 1:
            dep_date += timedelta(days=1)
        ret_date = dep_date + timedelta(days=n_noches)
        if ret_date.weekday() == 1:
            ret_date += timedelta(days=1)

        for c_orig, c_dst in calib_cfg.get("rutas", [["BUE", "EQS"], ["BUE", "BRC"]]):
            if "EQS" in (c_orig, c_dst) and (dep_date.weekday() == 1 or ret_date.weekday() == 1):
                continue
            qid_c = f"{c_orig}>{c_dst}_RT{n_noches}_{dep_date.isoformat()}_calib"
            consultas_calib.append(
                ConsultaPlanificada(
                    query_id=qid_c,
                    tier=1,
                    origin=c_orig,
                    dest=c_dst,
                    flight_date=dep_date.isoformat(),
                    return_date=ret_date.isoformat(),
                    trip_type="round_trip",
                    currency="ARS",
                    prioridad_categoria="tier1_ancla",
                    prioridad_orden=0,
                    pax_count=1,
                    is_calibration=True,
                )
            )

    rng = random.Random(seed)
    rng.shuffle(consultas_t1)
    rng.shuffle(consultas_t2)

    return consultas_t1 + consultas_calib + consultas_t2


def reportar_plan_f1b(observed_date: date | None = None, tope: int = 250) -> dict[str, Any]:
    """Calcula y desglosa el plan completo de F1b con orden de prioridad y caídas."""
    today = observed_date or date.today()
    cfg, cal = cargar_configuraciones()

    # Estimación del plan F1b completo según spec
    # Tiers 1-2 ancla: 172
    plan_t1_t2 = planificar_consultas_dia(observed_date=today, tiers_habilitados=(1, 2))
    cnt_t1_t2 = len(plan_t1_t2)

    # Tier 3 ancla (bidireccional cadencia 3 días): 48 consultas
    cnt_t3_ancla = 48
    # Tier 4 semanal: 7 consultas
    cnt_t4 = 7
    # Rolling no-ancla cada 3 días: 77 consultas
    cnt_rolling_t1_2 = 35
    cnt_rolling_t3 = 42
    # Checkpoints: 9 consultas
    cnt_checkpoints = 9

    plan_items = []
    for c in plan_t1_t2:
        plan_items.append((c.prioridad_categoria, c.query_id))

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
