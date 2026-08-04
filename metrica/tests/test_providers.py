"""Fuentes de datos intercambiables por plataforma.

El diagnóstico final mostró que desde una IP de datacenter Airbnb devuelve la
página SIN resultados: no hay parser que lo arregle. La respuesta arquitectónica
es no depender de una sola fuente — se puede cambiar por configuración.
"""
import uuid
from datetime import date, timedelta

import pytest

from app.config import Settings
from app.scrapers.providers import (ApifyProvider, BrowserProvider, HttpProvider,
                                    get_provider, provider_name_for)


def _settings(**kw) -> Settings:
    base = dict(database_url="sqlite:///:memory:", secret_key="x")
    base.update(kw)
    return Settings(**base)


# ---------------- selección de proveedor ----------------
def test_default_is_browser():
    s = _settings()
    assert provider_name_for("booking", s) == "browser"
    assert provider_name_for("airbnb", s) == "browser"
    assert isinstance(get_provider("booking", s), BrowserProvider)


def test_provider_is_switchable_per_platform():
    """Booking sigue con el navegador y Airbnb pasa a Apify, sin tocar código."""
    s = _settings(airbnb_provider="apify", apify_token="tok")
    assert isinstance(get_provider("airbnb", s), ApifyProvider)
    assert isinstance(get_provider("booking", s), BrowserProvider)


def test_unknown_provider_falls_back_to_browser():
    s = _settings(airbnb_provider="inventado")
    assert isinstance(get_provider("airbnb", s), BrowserProvider)


def test_per_platform_proxy_is_applied():
    """Booking anda sin proxy; el residencial se paga sólo para Airbnb."""
    s = _settings(proxy_url_airbnb="http://user:pass@resi.example:8000")
    p_air = get_provider("airbnb", s)
    p_bok = get_provider("booking", s)
    assert p_air._scraper.settings.proxy_url == "http://user:pass@resi.example:8000"
    assert p_bok._scraper.settings.proxy_url is None


# ---------------- proveedor Apify ----------------
@pytest.mark.asyncio
async def test_apify_provider_maps_results(monkeypatch):
    """Traduce la respuesta del actor a nuestros listings, sin parser propio."""
    items = [
        {"id": "12345", "name": "Cabaña del Bosque", "price": {"total": 91000},
         "roomType": "Entire cabin", "rating": 4.9, "reviewsCount": 120,
         "url": "https://www.airbnb.com/rooms/12345", "city": "Esquel"},
        {"listingId": "678", "title": "Domo Patagónico", "pricePerNight": "$ 120.500",
         "propertyType": "Dome", "stars": 4.7},
        {"id": "", "name": ""},                      # basura: se descarta
    ]

    class _Resp:
        status_code = 200
        def json(self):
            return items

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        async def post(self, *a, **k): return _Resp()

    monkeypatch.setattr("app.scrapers.providers.httpx.AsyncClient", _Client)
    prov = ApifyProvider("airbnb", _settings(airbnb_provider="apify", apify_token="tok"))
    out = await prov.search("Esquel", "2026-09-01", "2026-09-02", 2, "ARS", 1)

    by = {l.listing_id: l for l in out}
    assert set(by) == {"12345", "678"}, by
    assert by["12345"].name == "Cabaña del Bosque"
    assert by["12345"].price == 91000
    assert by["12345"].rating == 4.9
    assert by["678"].price == 120500          # precio como texto con formato local
    assert prov.diag["parsed"] == 2


@pytest.mark.asyncio
async def test_apify_without_token_reports_clearly():
    prov = ApifyProvider("airbnb", _settings(airbnb_provider="apify"))
    out = await prov.search("Esquel", "2026-09-01", "2026-09-02", 2, "ARS", 1)
    assert out == []
    assert "APIFY_TOKEN" in prov.diag["last_error"]


@pytest.mark.asyncio
async def test_http_provider_reads_configured_json_path(monkeypatch):
    """Cualquier API de terceros: se configura la URL y dónde está el array."""
    class _Resp:
        status_code = 200
        def json(self):
            return {"data": {"results": [
                {"id": "77", "name": "Hostería Los Ñires", "price": 88000}]}}

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        async def get(self, *a, **k): return _Resp()

    monkeypatch.setattr("app.scrapers.providers.httpx.AsyncClient", _Client)
    s = _settings(airbnb_provider="http",
                  airbnb_api_url="https://api.ejemplo.com/s?q={query}&in={checkin}",
                  airbnb_api_path="data.results")
    prov = HttpProvider("airbnb", s)
    out = await prov.search("Esquel", "2026-09-01", "2026-09-02", 2, "ARS", 1)
    assert len(out) == 1 and out[0].name == "Hostería Los Ñires"
    assert out[0].price == 88000


# ---------------- integración con el runner ----------------
@pytest.mark.asyncio
async def test_runner_uses_configured_provider(monkeypatch):
    """El pipeline completo (dedup, tipologías, observaciones) funciona igual
    con datos que NO vienen de nuestro navegador."""
    from app.db import init_db, session_scope
    from app.models import Destination, Family, Observation
    import app.scrapers.runner as runner
    from app.scrapers.base import Listing as SL

    class FakeProvider:
        name = "fake"
        def __init__(self, *a, **k):
            self.diag = {"provider": "fake", "pages": 1, "parsed": 2, "blocked": 0,
                         "html_len": 0, "launched": True, "last_error": None}
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        async def search(self, query, ci, co, adults, currency, max_pages=1):
            return [
                SL(platform="airbnb", name="Cabaña Proveedor", price=95000,
                   currency=currency, listing_id="p1", locality="Esquel",
                   property_type="Cabin", checkin=ci, checkout=co),
                SL(platform="airbnb", name="Hotel Proveedor", price=180000,
                   currency=currency, listing_id="p2", locality="Esquel",
                   property_type="Hotel", checkin=ci, checkout=co),
            ]

    monkeypatch.setattr(runner, "get_provider", lambda platform, **kw: FakeProvider())
    init_db()
    tok = uuid.uuid4().hex[:8]
    with session_scope() as s:
        fam = Family(name=f"Prov-{tok}", platforms="airbnb"); s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="Esquel"); s.add(dest); s.flush()
        fam_id, did = fam.id, dest.id
    with session_scope() as s:
        dest = s.get(Destination, did)
        summary = await runner.run_destination(
            s, dest, [date.today() + timedelta(days=7)], ["airbnb"], adults=2,
            nights=1, max_pages=1, family_id=fam_id, fast=True, currencies=("ARS",))
    assert summary["airbnb"]["status"] == "ok", summary
    with session_scope() as s:
        obs = s.query(Observation).filter(Observation.destination_id == did).all()
        assert len(obs) == 2
        assert {o.typology for o in obs} == {"cabana", "hotel"}   # clasificó igual
        assert all(o.price_ars for o in obs)


def test_doctor_warns_airbnb_without_proxy(monkeypatch):
    """El doctor avisa la causa real en vez de dejarlo pasar."""
    from app.config import get_settings
    import app.doctor as doctor

    get_settings.cache_clear()
    rows = doctor.check_providers()
    air = next(r for r in rows if r["check"] == "fuente airbnb")
    assert air["level"] == "AVISO"
    assert "VACÍOS" in air["fix"] and ("PROXY_URL_AIRBNB" in air["fix"]
                                       or "AIRBNB_PROVIDER" in air["fix"])
