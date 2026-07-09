"""Tests del planner: expansión de fechas (rolling + checkpoints + hitos)."""
from datetime import date

from app.models import Family, Milestone, Recurrence
from app.planner import checkpoint_dates, expand_stay_dates, milestone_windows


def _family(**kw):
    defaults = dict(rolling_days=30, checkpoint_months="2,3,4,5,6", milestones=[])
    defaults.update(kw)
    f = Family(name="X", **{k: v for k, v in defaults.items() if k != "milestones"})
    f.milestones = defaults["milestones"]
    return f


def test_rolling_and_checkpoints():
    today = date(2026, 7, 9)
    fam = _family()
    dates = expand_stay_dates(fam, today)
    # rolling: 10-jul .. 8-ago (30 días)
    assert date(2026, 7, 10) in dates
    assert date(2026, 8, 8) in dates
    # checkpoints +2..+6 meses el mismo día
    for d in [date(2026, 9, 9), date(2026, 10, 9), date(2026, 11, 9), date(2026, 12, 9), date(2027, 1, 9)]:
        assert d in dates
    assert dates == sorted(set(dates))  # ordenado y sin duplicados


def test_checkpoint_clamp_fin_de_mes():
    # 31-ene + 1 mes -> feb no tiene 31, debe recortar a 28
    got = checkpoint_dates(date(2026, 1, 31), [1])
    assert got[0] == date(2026, 2, 28)


def test_milestone_annual_tulipanes():
    m = Milestone(name="Tulipanes", start_month=10, start_day=1, end_month=11, end_day=15,
                  recurrence=Recurrence.annual.value, enabled=True)
    days = milestone_windows(m, date(2026, 7, 9))
    assert date(2026, 10, 1) in days
    assert date(2026, 11, 15) in days
    assert date(2026, 9, 30) not in days


def test_milestone_once_eclipse():
    m = Milestone(name="Eclipse", start_month=1, start_day=23, end_month=2, end_day=20,
                  recurrence=Recurrence.once.value, year=2027, enabled=True)
    # desde nov-2026 el horizonte alcanza ene-2027
    days = milestone_windows(m, date(2026, 11, 1))
    assert date(2027, 1, 23) in days
    assert date(2027, 2, 20) in days
