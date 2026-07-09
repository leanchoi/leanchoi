"""Planner: expande una Familia en el conjunto de noches (stay dates) a medir.

Para un `today` dado, la unión de:
  - rolling:      today+1 .. today+rolling_days          (diario, corto plazo)
  - checkpoints:  today + N meses (mismo día)            (mediano/largo plazo)
  - hitos:        todos los días de cada ventana activa  (eventos de demanda)
"""
from __future__ import annotations

from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from .models import Family, Milestone, Recurrence


def _clamp_day(year: int, month: int, day: int) -> date:
    """Devuelve una fecha válida aunque el día no exista en ese mes (ej. 31 feb)."""
    d = day
    while d > 0:
        try:
            return date(year, month, d)
        except ValueError:
            d -= 1
    return date(year, month, 1)


def checkpoint_dates(today: date, months: list[int]) -> list[date]:
    out = []
    for m in months:
        target = today + relativedelta(months=m)
        out.append(_clamp_day(target.year, target.month, today.day))
    return out


def milestone_windows(m: Milestone, today: date, horizon_months: int = 8) -> list[date]:
    """Genera los días de la(s) ventana(s) del hito que caen en el horizonte."""
    horizon_end = today + relativedelta(months=horizon_months)
    days: list[date] = []

    if m.recurrence == Recurrence.once.value:
        years = [m.year] if m.year else []
    else:
        # anual: probar este año y el próximo para cubrir el horizonte
        years = [today.year, today.year + 1]

    for y in years:
        if y is None:
            continue
        start = _clamp_day(y, m.start_month, m.start_day)
        end = _clamp_day(y, m.end_month, m.end_day)
        if end < start:  # ventana que cruza fin de año
            end = _clamp_day(y + 1, m.end_month, m.end_day)
        cur = start
        while cur <= end:
            if today <= cur <= horizon_end:
                days.append(cur)
            cur += timedelta(days=1)
    return days


def expand_stay_dates(family: Family, today: date) -> list[date]:
    """Conjunto ordenado y deduplicado de noches a medir hoy para esta familia."""
    dates: set[date] = set()

    # rolling corto plazo
    for i in range(1, family.rolling_days + 1):
        dates.add(today + timedelta(days=i))

    # checkpoints mediano/largo plazo
    for d in checkpoint_dates(today, family.checkpoint_list):
        dates.add(d)

    # hitos de demanda
    for m in family.milestones:
        if m.enabled:
            for d in milestone_windows(m, today):
                dates.add(d)

    return sorted(dates)
