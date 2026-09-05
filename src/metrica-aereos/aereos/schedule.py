"""Planificador de consultas para Métrica Aéreos.

Genera las consultas del conjunto 'ancla' (one-way bidireccional) para las rutas Tiers 1 y 2
según specs/config/rutas_muestreo.json y calendario.json.
Aplica selección determinista de 'muestras: N' para hitos y medición de calibración RT.
NO trunca el plan en silencio: devuelve el plan completo para que el orquestador
registre las excedentes como 'omitido_por_presupuesto'.
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
        if cur.weekday() == 4:  # Viernes
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

    # 3. Hitos desde generadores con muestras estables (hash de la fecha)
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
                    if len(desde_s) == 5:  # 'MM-DD'
                        cur_md = cur.strftime("%m-%d")
                        if desde_s <= hasta_s:
                            if desde_s <= cur_md <= hasta_s:
                                candidatas.append(cur)
                        else:  # Cruce de fin de año
                            if cur_md >= desde_s or cur_md <= hasta_s:
                                candidatas.append(cur)
                    elif len(desde_s) == 10:  # 'YYYY-MM-DD'
                        if date.fromisoformat(desde_s) <= cur <= date.fromisoformat(hasta_s):
                            candidatas.append(cur)

                if muestras and len(candidatas) > muestras:
                    # Selección determinista por hash sha256: completamente estable entre corridas
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
    """Genera el lote completo de consultas para el día observado (sin truncar en silencio)."""
    today = observed_date or date.today()
    cfg, cal = cargar_configuraciones()

    ancla_cfg = cfg.get("conjuntos_de_fechas", {}).get("ancla", {})
    generadores = ancla_cfg.get("generadores", [])
    trip_type_base = ancla_cfg.get("trip_type", "one_way")

    fechas_ancla = generar_fechas_ancla(today, horizonte_dias=90, cal=cal, generadores=generadores)

    # Rutas por tier con expansión bidireccional
    rutas_raw = [r for r in cfg.get("rutas", []) if r.get("tier") in tiers_habilitados]

    # Lista de pares (origen, destino, tier)
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
            # Cadencia: 1..45 días diario; 46..90 días cada 3 días
            if lead > 45 and (lead % 3 != 0):
                continue

            qid = f"{orig}>{dst}_{f_date.isoformat()}_{tier}"
            item = ConsultaPlanificada(
                query_id=qid,
                tier=tier,
                origin=orig,
                dest=dst,
                flight_date=f_date.isoformat(),
                return_date=None,  # One-way por sentido
                trip_type=trip_type_base,
                currency="ARS",
                pax_count=1,
                is_calibration=False,
            )

            if tier == 1:
                consultas_t1.append(item)
            else:
                consultas_t2.append(item)

    # Medición de calibración roundtrip (~8 consultas por semana)
    calib_cfg = cfg.get("calibracion_roundtrip", {})
    consultas_calib: list[ConsultaPlanificada] = []
    if calib_cfg.get("habilitado", False):
        dia_sem = today.weekday()
        noches_lista = calib_cfg.get("noches", [3, 4, 7])
        n_noches = noches_lista[dia_sem % len(noches_lista)]

        # Buscar fecha de ida a 15-30 días que no sea martes
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
                    pax_count=1,
                    is_calibration=True,
                )
            )

    rng = random.Random(seed)
    rng.shuffle(consultas_t1)
    rng.shuffle(consultas_t2)

    # Prioridad Tier 1 (núcleo), luego calibración, luego Tier 2
    # NO se trunca con [:tope_dia]: el orquestador registra las excedentes en bitácora
    return consultas_t1 + consultas_calib + consultas_t2
