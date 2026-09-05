"""Planificador de consultas para Métrica Aéreos.

Genera las consultas del conjunto 'ancla' para las rutas Tiers 1 y 2
según specs/config/rutas_muestreo.json y calendario.json.
Ordena aleatorizadamente ponderando por tier para evitar sesgos si la corrida se trunca.
"""
from __future__ import annotations

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


def generar_fechas_ancla(today: date, horizonte_dias: int = 90, cal: dict[str, Any] | None = None) -> list[date]:
    """Genera las fechas de alto valor analítico: viernes, feriados e hitos estacionales."""
    fechas = set()
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

    # 3. Hito Tulipanes Trevelin (1 de oct al 15 de nov)
    for d in range(1, horizonte_dias + 1):
        cur = today + timedelta(days=d)
        if cur.month == 10 or (cur.month == 11 and cur.day <= 15):
            fechas.add(cur)

    # 4. Hito Verano (5 de ene al 20 de feb)
    for d in range(1, horizonte_dias + 1):
        cur = today + timedelta(days=d)
        if (cur.month == 1 and cur.day >= 5) or (cur.month == 2 and cur.day <= 20):
            fechas.add(cur)

    return sorted(fechas)


def planificar_consultas_dia(
    observed_date: date | None = None,
    tiers_habilitados: tuple[int, ...] = (1, 2),
    seed: int | None = None,
) -> list[ConsultaPlanificada]:
    """Genera el lote de consultas para el día observado."""
    today = observed_date or date.today()
    cfg, cal = cargar_configuraciones()

    global_cfg = cfg.get("global", {})
    tope_dia = global_cfg.get("tope_consultas_dia", 250)
    ancla_cfg = cfg.get("conjuntos_de_fechas", {}).get("ancla", {})
    return_offset = ancla_cfg.get("return_offset_dias", 3)
    trip_type = ancla_cfg.get("trip_type", "round_trip")

    fechas_ancla = generar_fechas_ancla(today, horizonte_dias=90, cal=cal)

    # Rutas Tiers 1 y 2
    rutas = [r for r in cfg.get("rutas", []) if r.get("tier") in tiers_habilitados]

    consultas_t1: list[ConsultaPlanificada] = []
    consultas_t2: list[ConsultaPlanificada] = []

    for r in rutas:
        tier = r.get("tier", 2)
        origen = r["origen"]
        dest = r["destino"]

        for f_date in fechas_ancla:
            lead = (f_date - today).days
            # Cadencia: hasta 45 días diario; de 46 a 90 días cada 3 días
            if lead > 45 and (lead % 3 != 0):
                continue

            ret_date = f_date + timedelta(days=return_offset) if trip_type == "round_trip" else None

            qid = f"{origen}>{dest}_{f_date.isoformat()}_{tier}"
            item = ConsultaPlanificada(
                query_id=qid,
                tier=tier,
                origin=origen,
                dest=dest,
                flight_date=f_date.isoformat(),
                return_date=ret_date.isoformat() if ret_date else None,
                trip_type=trip_type,
                currency="ARS",
                pax_count=1,
            )

            if tier == 1:
                consultas_t1.append(item)
            else:
                consultas_t2.append(item)

    rng = random.Random(seed)
    rng.shuffle(consultas_t1)
    rng.shuffle(consultas_t2)

    # Prioridad Tier 1 (núcleo), luego Tier 2 (benchmark primario)
    plan_total = consultas_t1 + consultas_t2
    return plan_total[:tope_dia]


if __name__ == "__main__":
    plan = planificar_consultas_dia()
    print(f"Planificadas {len(plan)} consultas.")
    t1_c = sum(1 for c in plan if c.tier == 1)
    t2_c = sum(1 for c in plan if c.tier == 2)
    print(f"Tier 1: {t1_c} | Tier 2: {t2_c}")
    if plan:
        print("Ejemplo:", plan[0])
