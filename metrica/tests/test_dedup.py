"""Dedup por destino canónico: evita que una búsqueda de radio duplique un
alojamiento vecino (Esquel apareciendo en Trevelin) y lo atribuye a su lugar real."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.db import init_db, session_scope
from app.models import Destination, Family, Listing, Observation
from app.scrapers.runner import _upsert_listing
from app.scrapers.util import resolve_locality_destination


def test_resolve_locality_matches_sibling():
    sibs = [(1, "Esquel"), (2, "Trevelin"), (3, "El Bolsón")]
    assert resolve_locality_destination("Trevelin, Chubut", sibs) == 2
    assert resolve_locality_destination("Esquel, Argentina", sibs) == 1
    assert resolve_locality_destination("El Bolsón, Río Negro", sibs) == 3
    assert resolve_locality_destination("Bariloche", sibs) is None
    assert resolve_locality_destination(None, sibs) is None


def _family_two_dests():
    init_db()
    tok = uuid.uuid4().hex[:8]
    with session_scope() as s:
        fam = Family(name=f"Dedup-{tok}", platforms="booking")
        s.add(fam); s.flush()
        esquel = Destination(family_id=fam.id, name="Esquel")
        trevelin = Destination(family_id=fam.id, name="Trevelin")
        s.add_all([esquel, trevelin]); s.flush()
        return fam.id, esquel.id, trevelin.id, tok


def test_upsert_assigns_canonical_by_locality():
    fam_id, esquel_id, trevelin_id, tok = _family_two_dests()
    with session_scope() as s:
        sibs = [(esquel_id, "Esquel"), (trevelin_id, "Trevelin")]
        # Se scrapea BAJO Esquel, pero la localidad dice Trevelin → canónico Trevelin.
        lst = _upsert_listing(s, "booking", f"ext-{tok}", "Cabaña Río Percy", None, None,
                              destination_id=esquel_id, locality="Trevelin, Chubut", siblings=sibs)
        assert lst.destination_id == trevelin_id
        assert lst.locality == "Trevelin, Chubut"


def test_repair_dedupes_existing_observations(client_admin):
    client, headers = client_admin
    fam_id, esquel_id, trevelin_id, tok = _family_two_dests()
    today = date.today()
    with session_scope() as s:
        # Listing físico de Trevelin, pero cargado bajo Esquel (radio) con obs mal atribuidas.
        lst = Listing(platform="booking", external_id=f"r-{tok}", destination_id=esquel_id,
                      name="Hostería Trevelin", locality="Trevelin, Chubut", typology="hosteria")
        s.add(lst); s.flush()
        for dd in (5, 6):
            s.add(Observation(listing_id=lst.id, destination_id=esquel_id, platform="booking",
                  typology="hosteria", stay_checkin=today + timedelta(days=dd),
                  stay_checkout=today + timedelta(days=dd + 1),
                  observed_at=datetime.now(timezone.utc), observed_date=today,
                  price_ars=50000, price_usd=50, available=True))
        lid = lst.id

    r = client.post("/api/diagnostics/repair-destinations", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["reassigned_listings"] >= 1

    with session_scope() as s:
        lst = s.get(Listing, lid)
        assert lst.destination_id == trevelin_id
        obs = s.query(Observation).filter(Observation.listing_id == lid).all()
        assert obs and all(o.destination_id == trevelin_id for o in obs)


def test_composition_endpoint(client_admin):
    client, headers = client_admin
    fam_id, esquel_id, trevelin_id, tok = _family_two_dests()
    today = date.today()
    with session_scope() as s:
        specs = [("cabana", "booking", esquel_id), ("cabana", "airbnb", esquel_id),
                 ("hotel", "booking", trevelin_id)]
        for i, (typ, plat, did) in enumerate(specs):
            lst = Listing(platform=plat, external_id=f"c-{tok}-{i}", destination_id=did,
                          name=f"L{i}", typology=typ)
            s.add(lst); s.flush()
            s.add(Observation(listing_id=lst.id, destination_id=did, platform=plat, typology=typ,
                  stay_checkin=today + timedelta(days=5), stay_checkout=today + timedelta(days=6),
                  observed_at=datetime.now(timezone.utc), observed_date=today,
                  price_ars=40000, price_usd=40, available=True))

    r = client.get(f"/api/dashboard/composition?family_id={fam_id}", headers=headers)
    assert r.status_code == 200, r.text
    rows = {row["name"]: row for row in r.json()["rows"]}
    assert rows["Esquel"]["total"] == 2
    assert rows["Esquel"]["by_platform"].get("booking") == 1
    assert rows["Esquel"]["by_platform"].get("airbnb") == 1
    assert rows["Trevelin"]["by_typology"].get("hotel") == 1


@pytest.fixture()
def client_admin(monkeypatch):
    import app.scheduler as scheduler
    monkeypatch.setattr(scheduler, "start", lambda: None)
    monkeypatch.setattr(scheduler, "shutdown", lambda: None)
    monkeypatch.setattr(scheduler, "schedule_family", lambda f: None)
    from app.main import app
    with TestClient(app) as c:
        r = c.post("/api/auth/login", data={"username": "admin", "password": "admin12345"})
        assert r.status_code == 200, r.text
        yield c, {"Authorization": f"Bearer {r.json()['access_token']}"}
