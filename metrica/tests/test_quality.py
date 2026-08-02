"""Control de calidad: precios inverosímiles que distorsionan los promedios.

Reproduce el caso real de El Hoyo: un anunciante cargó una tarifa de ~2.000.000
por noche y la tarifa promedio del destino se fue por las nubes.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.db import init_db, session_scope
from app.models import Destination, Family, Listing, Observation
from app.quality import exclude_listings, find_outliers, impact_of_exclusion


@pytest.fixture()
def client(monkeypatch):
    import app.scheduler as scheduler
    monkeypatch.setattr(scheduler, "start", lambda: None)
    monkeypatch.setattr(scheduler, "shutdown", lambda: None)
    monkeypatch.setattr(scheduler, "schedule_family", lambda f: None)
    from app.main import app
    with TestClient(app) as c:
        r = c.post("/api/auth/login", data={"username": "admin", "password": "admin12345"})
        yield c, {"Authorization": f"Bearer {r.json()['access_token']}"}


def _el_hoyo_con_outlier():
    """8 cabañas normales (~150k) + 1 con 2.000.000 cargado mal."""
    init_db()
    tok = uuid.uuid4().hex[:8]
    today = date.today()
    with session_scope() as s:
        fam = Family(name=f"Q-{tok}", platforms="booking"); s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="El Hoyo"); s.add(dest); s.flush()
        fam_id, did = fam.id, dest.id
        bad_id = None
        precios = [140000, 150000, 155000, 160000, 148000, 152000, 158000, 145000, 2000000]
        for i, precio in enumerate(precios):
            lst = Listing(platform="booking", external_id=f"q-{tok}-{i}", destination_id=did,
                          name=("Cabaña Error de Carga" if precio == 2000000 else f"Cabaña {i}"),
                          typology="cabana")
            s.add(lst); s.flush()
            if precio == 2000000:
                bad_id = lst.id
            for dd in (5, 6):
                s.add(Observation(
                    listing_id=lst.id, destination_id=did, platform="booking",
                    typology="cabana", stay_checkin=today + timedelta(days=dd),
                    stay_checkout=today + timedelta(days=dd + 1),
                    observed_at=datetime.now(timezone.utc), observed_date=today,
                    price_ars=precio, price_usd=precio / 1000, currency_native="ARS",
                    available=True))
        return fam_id, did, bad_id


def test_detects_the_absurd_price():
    fam_id, did, bad_id = _el_hoyo_con_outlier()
    with session_scope() as s:
        rows = find_outliers(s, factor=8.0, destination_id=did)
    assert len(rows) == 1, rows
    r = rows[0]
    assert r["listing_id"] == bad_id
    assert r["name"] == "Cabaña Error de Carga"
    assert r["avg_price"] == 2000000
    assert r["ratio"] > 8
    assert r["destination"] == "El Hoyo"


def test_normal_prices_are_not_flagged():
    """No debe marcar a un alojamiento simplemente caro."""
    fam_id, did, bad_id = _el_hoyo_con_outlier()
    with session_scope() as s:
        rows = find_outliers(s, factor=8.0, destination_id=did)
        flagged = {r["listing_id"] for r in rows}
        normales = [l.id for l in s.query(Listing).filter(
            Listing.destination_id == did, Listing.id != bad_id).all()]
    assert not (flagged & set(normales)), "marcó alojamientos normales"


def test_exclusion_restores_a_sane_average():
    fam_id, did, bad_id = _el_hoyo_con_outlier()
    with session_scope() as s:
        antes = impact_of_exclusion(s, destination_id=did)["avg_con_outliers"]
        exclude_listings(s, [bad_id], "precio inverosímil")
    with session_scope() as s:
        imp = impact_of_exclusion(s, destination_id=did)
    assert antes > 300000, antes                    # el outlier disparaba el promedio
    assert imp["avg_sin_outliers"] < 200000, imp    # vuelve a un valor real
    assert imp["excluidos"] == 1


def test_excluded_listing_disappears_from_dashboard(client):
    """Excluir tiene que sacarlo de TODA la analítica, no sólo de la lista."""
    c, h = client
    fam_id, did, bad_id = _el_hoyo_con_outlier()

    before = c.get(f"/api/dashboard/summary?family_id={fam_id}", headers=h).json()
    assert before["max_price"] == 2000000
    assert before["avg_price"] > 300000

    r = c.put(f"/api/listings/{bad_id}/exclude", headers=h,
              json={"excluded": True, "reason": "precio mal cargado"})
    assert r.status_code == 200, r.text

    after = c.get(f"/api/dashboard/summary?family_id={fam_id}", headers=h).json()
    assert after["max_price"] <= 160000, after
    assert after["avg_price"] < 200000, after
    assert after["listings_live"] == before["listings_live"] - 1

    rows = c.get(f"/api/dashboard/listings?family_id={fam_id}", headers=h).json()["rows"]
    assert bad_id not in [x["listing_id"] for x in rows]


def test_outliers_endpoint_reports_impact(client):
    c, h = client
    fam_id, did, bad_id = _el_hoyo_con_outlier()
    r = c.get(f"/api/dashboard/outliers?destination_id={did}", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["count"] == 1
    assert data["rows"][0]["listing_id"] == bad_id
    assert "impacto" in data


def test_reincorporating_is_possible(client):
    c, h = client
    fam_id, did, bad_id = _el_hoyo_con_outlier()
    c.put(f"/api/listings/{bad_id}/exclude", headers=h, json={"excluded": True})
    r = c.put(f"/api/listings/{bad_id}/exclude", headers=h, json={"excluded": False})
    assert r.status_code == 200 and r.json()["excluded"] is False
    after = c.get(f"/api/dashboard/summary?family_id={fam_id}", headers=h).json()
    assert after["max_price"] == 2000000   # vuelve a contar
