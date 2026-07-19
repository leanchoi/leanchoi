"""Test del modelo de "estado actual" del dashboard.

Reproduce el bug reportado: una medición histórica grande quedaba TAPADA por
una "foto rápida" chica y reciente (la lógica vieja miraba solo el último
observed_date global). El modelo nuevo usa la ÚLTIMA observación por
(alojamiento × noche), así el tablero muestra TODO lo scrapeado con el precio
más fresco conocido de cada combinación.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.db import session_scope
from app.models import Destination, Family, Listing, Observation


@pytest.fixture()
def client(monkeypatch):
    import app.scheduler as scheduler
    monkeypatch.setattr(scheduler, "start", lambda: None)
    monkeypatch.setattr(scheduler, "shutdown", lambda: None)
    monkeypatch.setattr(scheduler, "schedule_family", lambda f: None)
    from app.main import app
    with TestClient(app) as c:
        yield c


def _login(client):
    r = client.post("/api/auth/login", data={"username": "admin", "password": "admin12345"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# Tipologías por listing (índice 1..5)
_TYP = {1: "cabana", 2: "cabana", 3: "departamento", 4: "hotel", 5: "otro"}


def _seed_masking_scenario():
    """Medición histórica grande (hace 3 días) + foto rápida chica (hoy).

    Devuelve (family_id, destination_id, night_a).
    """
    today = date.today()
    d0 = datetime.now(timezone.utc) - timedelta(days=3)   # observed_at histórico
    d1 = datetime.now(timezone.utc)                        # observed_at de la foto rápida
    night_a = today + timedelta(days=10)
    night_b = today + timedelta(days=20)
    tok = uuid.uuid4().hex[:8]  # aísla cada test en la BD compartida

    with session_scope() as s:
        fam = Family(name=f"MaskTest-{tok}", adults=1, nights=1, platforms="booking")
        s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="Esquel")
        s.add(dest); s.flush()
        fam_id, dest_id = fam.id, dest.id

        listings = {}
        for i in range(1, 6):
            lst = Listing(platform="booking", external_id=f"b-{tok}-{i}", destination_id=dest_id,
                          name=f"Aloj {i}", typology=_TYP[i])
            s.add(lst); s.flush()
            listings[i] = lst.id

        def _obs(lid, night, price, observed_at, observed_dt):
            s.add(Observation(
                listing_id=lid, destination_id=dest_id, platform="booking",
                typology=_TYP[[k for k, v in listings.items() if v == lid][0]],
                stay_checkin=night, stay_checkout=night + timedelta(days=1),
                observed_at=observed_at, observed_date=observed_dt,
                price_ars=price, price_usd=round(price / 1000, 2), fx_implicit=1000.0,
                currency_native="ARS", available=True,
            ))

        # --- medición histórica (observed_date = hoy-3): 5 listings × 2 noches ---
        base = {1: 100, 2: 200, 3: 300, 4: 400, 5: 500}
        for i in range(1, 6):
            _obs(listings[i], night_a, base[i], d0, (today - timedelta(days=3)))
            _obs(listings[i], night_b, base[i] + 10, d0, (today - timedelta(days=3)))

        # --- foto rápida (observed_date = hoy): SOLO L1 en la noche A, precio nuevo ---
        _obs(listings[1], night_a, 150, d1, today)

    return fam_id, dest_id, night_a


def test_dashboard_shows_all_scraped_not_just_latest_snapshot(client):
    """El KPI y la lista reflejan las 5 propiedades, no solo la de la foto rápida."""
    headers = _login(client)
    fam_id, dest_id, night_a = _seed_masking_scenario()

    r = client.get(f"/api/dashboard/summary?family_id={fam_id}", headers=headers)
    assert r.status_code == 200, r.text
    kpi = r.json()
    # Bug viejo: listings_live == 1 (solo la foto rápida). Nuevo: 5.
    assert kpi["listings_live"] == 5, kpi
    # Precios "actuales": L1@150 (fresco) + L1@110 + L2..L5 (10 obs) => promedio 310.
    assert kpi["avg_price"] == pytest.approx(310, abs=1), kpi
    assert kpi["min_price"] == pytest.approx(110, abs=1)   # L1 noche B
    assert kpi["max_price"] == pytest.approx(510, abs=1)   # L5 noche B


def test_dashboard_listing_uses_fresh_price(client):
    """El alojamiento re-medido usa el precio nuevo, no el histórico."""
    headers = _login(client)
    fam_id, dest_id, night_a = _seed_masking_scenario()

    r = client.get(f"/api/dashboard/listings?family_id={fam_id}", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["count"] == 5, data
    by_name = {row["name"]: row for row in data["rows"]}
    assert set(by_name) == {f"Aloj {i}" for i in range(1, 6)}
    # L1: promedio de sus dos noches actuales = (150 + 110) / 2 = 130
    assert by_name["Aloj 1"]["price"] == pytest.approx(130, abs=1), by_name["Aloj 1"]


def test_price_evolution_spans_all_observed_dates(client):
    """La serie temporal recorre TODOS los observed_date (no solo el último)."""
    headers = _login(client)
    fam_id, dest_id, night_a = _seed_masking_scenario()

    r = client.get(f"/api/dashboard/price_evolution?family_id={fam_id}", headers=headers)
    assert r.status_code == 200, r.text
    points = r.json()["points"]
    # Dos observed_date: hoy-3 (histórico) y hoy (foto rápida).
    assert len(points) == 2, points
    assert points[0]["observed_date"] < points[1]["observed_date"]


def test_report_consistent_with_dashboard(client):
    """El reporte ejecutivo usa el mismo modelo de estado actual."""
    headers = _login(client)
    fam_id, dest_id, night_a = _seed_masking_scenario()

    r = client.get(f"/api/report?family_id={fam_id}", headers=headers)
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["kpis"]["listings_live"] == 5, rep["kpis"]
    assert rep["kpis"]["avg_price"] == pytest.approx(310, abs=1), rep["kpis"]
    # top baratos/caros cubren las 5 propiedades por precio medio de sus noches
    assert len(rep["top_cheap"]) == 5
    assert rep["top_cheap"][0]["price"] <= rep["top_expensive"][0]["price"]


def test_typology_matrix_compares_destinations(client):
    """La matriz tipología×destino da barras comparables + promedio de referencia."""
    headers = _login(client)
    fam_id, dest_id, night_a = _seed_masking_scenario()
    r = client.get(f"/api/dashboard/typology_matrix?family_id={fam_id}", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    cab = next((row for row in data["rows"] if row["typology"] == "cabana"), None)
    assert cab is not None and cab["overall_avg"] is not None
    # cabaña existe en un solo destino (Esquel) en el escenario → 1 barra
    assert len(cab["by_dest"]) >= 1
    assert all("avg_price" in d and "name" in d for d in cab["by_dest"])


def test_dispersion_reports_percentiles_and_cv(client):
    """La dispersión devuelve percentiles, desvío y coef. de variación por grupo."""
    headers = _login(client)
    fam_id, dest_id, night_a = _seed_masking_scenario()
    r = client.get(f"/api/dashboard/dispersion?family_id={fam_id}&by=destination", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["by"] == "destination" and data["overall"] is not None
    g = data["groups"][0]
    for k in ("min", "p25", "median", "p75", "max", "std", "cv", "count"):
        assert k in g, g
    assert g["min"] <= g["median"] <= g["max"]


def test_dispersion_evolution_spans_days(client):
    """La dispersión evolutiva recorre los observed_date con stats por día."""
    headers = _login(client)
    fam_id, dest_id, night_a = _seed_masking_scenario()
    r = client.get(f"/api/dashboard/dispersion_evolution?family_id={fam_id}", headers=headers)
    assert r.status_code == 200, r.text
    pts = r.json()["points"]
    assert len(pts) == 2  # hoy-3 y hoy
    assert all("cv" in p and "median" in p for p in pts)


def test_typology_aggregates_current_snapshot(client):
    """La agregación por tipología corre sobre el estado actual (todas las noches)."""
    headers = _login(client)
    fam_id, dest_id, night_a = _seed_masking_scenario()

    r = client.get(f"/api/dashboard/typology?family_id={fam_id}", headers=headers)
    assert r.status_code == 200, r.text
    rows = {row["typology"]: row for row in r.json()["rows"]}
    # cabana agrupa L1 (2 noches) + L2 (2 noches) = 2 alojamientos distintos
    assert rows["cabana"]["listings"] == 2, rows
    assert set(rows) == {"cabana", "departamento", "hotel", "otro"}
