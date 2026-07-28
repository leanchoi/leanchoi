"""Overrides manuales del alojamiento: tipología, nombre y la tipología Hostel."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.db import init_db, session_scope
from app.models import Destination, Family, Listing
from app.scrapers.runner import _upsert_listing
from app.scrapers.util import classify_typology


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


def _listing(name="Nombre Marketinero Deluxe", typ="otro"):
    init_db()
    tok = uuid.uuid4().hex[:8]
    with session_scope() as s:
        fam = Family(name=f"Ov-{tok}", platforms="booking"); s.add(fam); s.flush()
        d = Destination(family_id=fam.id, name="Esquel"); s.add(d); s.flush()
        l = Listing(platform="booking", external_id=f"ov-{tok}", destination_id=d.id,
                    name=name, typology=typ)
        s.add(l); s.flush()
        return l.id, d.id, tok


# ---------------- tipología Hostel ----------------
def test_hostel_is_its_own_typology():
    """Un hostel no es una hostería: otro público y otra tarifa (cama compartida)."""
    assert classify_typology("Hostel Patagonia") == "hostel"
    assert classify_typology("Albergue Municipal") == "hostel"
    assert classify_typology("Hostal del Sur") == "hostel"
    assert classify_typology("X", property_type="Hostel") == "hostel"
    # y la hostería sigue siendo hostería
    assert classify_typology("Hostería Los Ñires") == "hosteria"
    assert classify_typology("Posada del Angel") == "hosteria"
    # el hotel no se confunde con hostel
    assert classify_typology("Hotel Patagonia") == "hotel"


def test_hostel_accepted_by_typology_endpoint(client):
    c, h = client
    lid, _did, _tok = _listing()
    r = c.put(f"/api/listings/{lid}/typology", headers=h, json={"typology": "hostel"})
    assert r.status_code == 200, r.text
    assert r.json()["typology"] == "hostel"


# ---------------- override de nombre ----------------
def test_rename_listing_sticks_and_keeps_original(client):
    c, h = client
    lid, _did, _tok = _listing(name="✨ Increíble Cabaña Premium ✨")
    r = c.put(f"/api/listings/{lid}/name", headers=h, json={"name": "Cabañas Don Pedro"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Cabañas Don Pedro" and body["manual"] is True
    assert body["platform_name"] == "✨ Increíble Cabaña Premium ✨"

    detail = c.get(f"/api/listings/{lid}", headers=h).json()
    assert detail["name_manual"] is True
    assert "✨ Increíble Cabaña Premium ✨" in detail["name_history"]


def test_scrape_does_not_overwrite_manual_name(client):
    """El scrapeo no pisa un nombre puesto a mano, pero sí registra el de la
    plataforma en el historial para no perder el dato."""
    c, h = client
    lid, did, tok = _listing(name="Nombre Original Plataforma")
    c.put(f"/api/listings/{lid}/name", headers=h, json={"name": "Cabañas Don Pedro"})

    with session_scope() as s:
        _upsert_listing(s, "booking", f"ov-{tok}", "OTRO Nombre Marketinero 2026",
                        None, None, destination_id=did)
    with session_scope() as s:
        lst = s.get(Listing, lid)
        assert lst.name == "Cabañas Don Pedro"          # se respetó el manual
        assert lst.name_manual is True
        hist = (lst.attributes or {}).get("name_history", [])
        assert "OTRO Nombre Marketinero 2026" in hist    # el de plataforma quedó registrado


def test_revert_name_to_platform(client):
    c, h = client
    lid, _did, _tok = _listing(name="Nombre Plataforma")
    c.put(f"/api/listings/{lid}/name", headers=h, json={"name": "Mi Nombre"})
    r = c.put(f"/api/listings/{lid}/name", headers=h, json={"manual": False})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Nombre Plataforma"
    assert r.json()["manual"] is False


def test_rename_requires_editor(client):
    c, h = client
    lid, _did, _tok = _listing()
    c.post("/api/users", headers=h, json={"username": f"v{uuid.uuid4().hex[:6]}",
                                          "password": "viewer123", "role": "viewer"})
    # un viewer no puede renombrar
    users = c.get("/api/users", headers=h).json()
    vname = [u["username"] for u in users if u["role"] == "viewer"][-1]
    tok = c.post("/api/auth/login", data={"username": vname, "password": "viewer123"}).json()
    vh = {"Authorization": f"Bearer {tok['access_token']}"}
    assert c.put(f"/api/listings/{lid}/name", headers=vh, json={"name": "X"}).status_code == 403
