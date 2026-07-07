"""Tests de la API + BD (sin red): CRUD de destinos, consulta y CSV.

La BD la fija conftest.py a un fichero temporal antes de importar la app.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    # Evitar arrancar el scheduler real durante los tests
    import app.scheduler as scheduler
    monkeypatch.setattr(scheduler, "start", lambda: None)
    monkeypatch.setattr(scheduler, "shutdown", lambda: None)
    monkeypatch.setattr(scheduler, "schedule_destination", lambda d: None)
    monkeypatch.setattr(scheduler, "unschedule_destination", lambda i: None)

    from app.main import app
    with TestClient(app) as c:
        yield c


def test_destination_crud(client):
    # crear
    r = client.post("/api/destinations", json={"query": "Madrid", "platforms": "booking"})
    assert r.status_code == 201, r.text
    dest = r.json()
    assert dest["query"] == "Madrid"
    did = dest["id"]

    # listar
    assert any(d["id"] == did for d in client.get("/api/destinations").json())

    # actualizar periodicidad
    r = client.put(f"/api/destinations/{did}", json={"interval_minutes": 60, "enabled": False})
    assert r.status_code == 200
    assert r.json()["interval_minutes"] == 60
    assert r.json()["enabled"] is False

    # borrar
    assert client.delete(f"/api/destinations/{did}").status_code == 204
    assert client.get(f"/api/destinations/{did}").status_code == 404


def test_prices_and_csv(client):
    # sembrar datos directamente en la BD
    from app.db import session_scope
    from app.models import Destination, PricePoint

    with session_scope() as s:
        d = Destination(query="Sevilla", platforms="booking")
        s.add(d)
        s.flush()
        s.add(PricePoint(destination_id=d.id, platform="booking", name="Hotel Giralda",
                         price=180.0, currency="EUR"))
        s.add(PricePoint(destination_id=d.id, platform="airbnb", name="Piso Triana",
                         price=90.0, currency="EUR"))
        did = d.id

    # consulta con filtro de plataforma
    rows = client.get(f"/api/prices?destination_id={did}&platform=booking").json()
    assert len(rows) == 1 and rows[0]["name"] == "Hotel Giralda"

    # filtro por precio
    rows = client.get(f"/api/prices?destination_id={did}&max_price=100").json()
    assert len(rows) == 1 and rows[0]["name"] == "Piso Triana"

    # CSV
    r = client.get(f"/api/prices.csv?destination_id={did}")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    body = r.text.splitlines()
    assert body[0].startswith("id,destination_id,platform")
    assert len(body) == 3  # cabecera + 2 filas


def test_stats(client):
    r = client.get("/api/stats")
    assert r.status_code == 200
    assert set(r.json()) == {"destinations", "price_points", "runs"}
