"""Nuevas interrelaciones: hitos, altas/bajas y curva de anticipación."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.db import init_db, session_scope
from app.models import Destination, Family, Listing, Milestone, Observation


@pytest.fixture()
def client(monkeypatch):
    import app.scheduler as scheduler
    monkeypatch.setattr(scheduler, "start", lambda: None)
    monkeypatch.setattr(scheduler, "shutdown", lambda: None)
    monkeypatch.setattr(scheduler, "schedule_family", lambda f: None)
    from app.main import app
    with TestClient(app) as c:
        r = c.post("/api/auth/login", data={"username": "admin", "password": "admin12345"})
        assert r.status_code == 200, r.text
        yield c, {"Authorization": f"Bearer {r.json()['access_token']}"}


def _obs(s, lid, did, night, price, observed_at, observed_date, typ="cabana"):
    s.add(Observation(listing_id=lid, destination_id=did, platform="booking", typology=typ,
                      stay_checkin=night, stay_checkout=night + timedelta(days=1),
                      observed_at=observed_at, observed_date=observed_date,
                      price_ars=price, price_usd=price / 1000, currency_native="ARS",
                      available=True))


def test_churn_tracks_altas_bajas_and_returns(client):
    """Altas, bajas y reapariciones (bajas temporales) día a día."""
    c, h = client
    init_db()
    tok = uuid.uuid4().hex[:8]
    today = date.today()
    d1, d2, d3 = today - timedelta(days=2), today - timedelta(days=1), today
    with session_scope() as s:
        fam = Family(name=f"Churn-{tok}", platforms="booking"); s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="Esquel"); s.add(dest); s.flush()
        fam_id, did = fam.id, dest.id
        ids = []
        for i in range(3):
            l = Listing(platform="booking", external_id=f"ch-{tok}-{i}", destination_id=did,
                        name=f"A{i}", typology="cabana")
            s.add(l); s.flush(); ids.append(l.id)
        night = today + timedelta(days=10)
        at = datetime.now(timezone.utc)
        # día 1: A0, A1     día 2: A0 (A1 se cae)     día 3: A0, A1 (vuelve), A2 (alta nueva)
        _obs(s, ids[0], did, night, 100, at, d1); _obs(s, ids[1], did, night, 110, at, d1)
        _obs(s, ids[0], did, night, 105, at, d2)
        _obs(s, ids[0], did, night, 108, at, d3); _obs(s, ids[1], did, night, 115, at, d3)
        _obs(s, ids[2], did, night, 120, at, d3)

    r = c.get(f"/api/dashboard/churn?family_id={fam_id}", headers=h)
    assert r.status_code == 200, r.text
    pts = {p["observed_date"]: p for p in r.json()["points"]}
    assert pts[d2.isoformat()]["gone"] == 1        # A1 desapareció
    assert pts[d3.isoformat()]["new"] == 1         # A2 es alta nueva
    assert pts[d3.isoformat()]["returning"] == 1   # A1 reapareció (baja temporal)
    assert r.json()["universe"] == 3


def test_churn_detail_lists_who(client):
    c, h = client
    init_db()
    tok = uuid.uuid4().hex[:8]
    today = date.today()
    with session_scope() as s:
        fam = Family(name=f"ChD-{tok}", platforms="booking"); s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="Esquel"); s.add(dest); s.flush()
        fam_id, did = fam.id, dest.id
        keep = Listing(platform="booking", external_id=f"k-{tok}", destination_id=did,
                       name="Sigue", typology="cabana")
        gone = Listing(platform="booking", external_id=f"g-{tok}", destination_id=did,
                       name="Se fue", typology="hotel")
        s.add_all([keep, gone]); s.flush()
        night = today + timedelta(days=8); at = datetime.now(timezone.utc)
        _obs(s, keep.id, did, night, 100, at, today - timedelta(days=1))
        _obs(s, keep.id, did, night, 100, at, today)
        _obs(s, gone.id, did, night, 300, at, today - timedelta(days=1), typ="hotel")

    r = c.get(f"/api/dashboard/churn_detail?family_id={fam_id}", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["last_observed"] == today.isoformat()
    assert "Se fue" in [b["name"] for b in data["bajas"]]
    assert "Sigue" not in [b["name"] for b in data["bajas"]]


def test_lead_time_buckets_by_anticipation(client):
    """La misma noche medida con distinta anticipación cae en tramos distintos."""
    c, h = client
    init_db()
    tok = uuid.uuid4().hex[:8]
    today = date.today()
    with session_scope() as s:
        fam = Family(name=f"Lead-{tok}", platforms="booking"); s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="Esquel"); s.add(dest); s.flush()
        fam_id, did = fam.id, dest.id
        l = Listing(platform="booking", external_id=f"lt-{tok}", destination_id=did,
                    name="L", typology="cabana"); s.add(l); s.flush()
        at = datetime.now(timezone.utc)
        # noche fija; observada con 2 y con 45 días de anticipación
        night = today + timedelta(days=2)
        _obs(s, l.id, did, night, 200, at, today)                       # lead 2 -> "0-3 días"
        _obs(s, l.id, did, today + timedelta(days=45), 100, at, today)  # lead 45 -> "31-60 días"

    r = c.get(f"/api/dashboard/lead_time?family_id={fam_id}", headers=h)
    assert r.status_code == 200, r.text
    rows = {row["label"]: row for row in r.json()["rows"]}
    assert "0-3 días" in rows and "31-60 días" in rows
    assert rows["0-3 días"]["avg_price"] == 200
    assert rows["31-60 días"]["avg_price"] == 100


def test_milestones_compare_against_baseline(client):
    """El hito configurado se vuelve lectura: precio dentro vs fuera de la ventana."""
    c, h = client
    init_db()
    tok = uuid.uuid4().hex[:8]
    today = date.today()
    inside = today + timedelta(days=20)     # noche dentro del hito
    outside = today + timedelta(days=50)    # noche fuera
    with session_scope() as s:
        fam = Family(name=f"MS-{tok}", platforms="booking"); s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="Esquel"); s.add(dest); s.flush()
        # hito que cubre exactamente el día `inside`
        s.add(Milestone(family_id=fam.id, name="Evento", start_month=inside.month,
                        start_day=inside.day, end_month=inside.month, end_day=inside.day,
                        recurrence="annual", enabled=True))
        fam_id, did = fam.id, dest.id
        l = Listing(platform="booking", external_id=f"ms-{tok}", destination_id=did,
                    name="L", typology="cabana"); s.add(l); s.flush()
        at = datetime.now(timezone.utc)
        _obs(s, l.id, did, inside, 200, at, today)
        _obs(s, l.id, did, outside, 100, at, today)

    r = c.get(f"/api/dashboard/milestones?family_id={fam_id}", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["baseline"]["mean"] == 100
    row = next(x for x in data["rows"] if x["name"] == "Evento")
    assert row["avg_price"] == 200
    assert row["vs_baseline_pct"] == 100.0   # el doble que fuera del hito
    assert data["windows"]["Evento"]


def test_removed_dead_endpoints_are_gone(client):
    """ratings/availability se eliminaron: no se usaban en ningún lado."""
    c, h = client
    assert c.get("/api/dashboard/ratings", headers=h).status_code == 404
    assert c.get("/api/dashboard/availability", headers=h).status_code == 404
