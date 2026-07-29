"""Registro oficial: extracción, matching y adopción digital.

No se puede depender de la web real en tests, así que se reproducen las tres
formas típicas en que un sitio municipal publica sus alojamientos.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.db import init_db, session_scope
from app.models import (Destination, Family, Listing, OfficialListing, OfficialMatch,
                        RegistrySource)
from app.registry.crawler import adoption_index, match_destination
from app.registry.extract import extract, from_heuristic, from_jsonld, from_microdata
from app.registry.match import norm_name, score

HTML_JSONLD = """
<html><body><script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"Hotel","name":"Hotel Los Nires","telephone":"+54 2945 45-1234",
  "address":{"streetAddress":"Av. Alvear 1200","addressLocality":"Esquel"},"url":"https://x.ar/nires"},
 {"@type":"Campground","name":"Camping La Colina","telephone":"2945 490000"},
 {"@type":"LodgingBusiness","name":"Cabañas Los Notros","email":"info@notros.ar"}
]}</script></body></html>"""

HTML_MICRODATA = """
<html><body>
 <div itemscope itemtype="https://schema.org/Hostel">
   <h3 itemprop="name">Hostel Del Sur</h3>
   <span itemprop="telephone">2945 12-3456</span>
 </div>
 <div itemscope itemtype="http://schema.org/Hotel">
   <h3 itemprop="name">Hotel Cordillera</h3>
 </div>
</body></html>"""

HTML_CARDS = """
<html><body><section class="listado">
 <article class="ficha aloj"><h3>Cabañas El Mirador</h3>
   <p>Cabañas equipadas · 6 plazas</p><p>Tel: 2945 45-9876</p></article>
 <article class="ficha aloj"><h3>Hostería Las Bandurrias</h3>
   <p>Hostería de montaña</p><p>info@bandurrias.com.ar</p></article>
 <article class="ficha aloj"><h3>Complejo Alto Andino</h3>
   <p>Departamentos y cabañas</p><p>Tel: 2945 44-1111</p></article>
 <article class="ficha aloj"><h3>Camping Municipal</h3>
   <p>Camping agreste · 120 personas</p></article>
</section></body></html>"""


# ---------------- extracción ----------------
def test_jsonld_extracts_and_classifies():
    rows = from_jsonld(HTML_JSONLD)
    by = {r["name"]: r for r in rows}
    assert "Hotel Los Nires" in by and by["Hotel Los Nires"]["typology"] == "hotel"
    assert by["Camping La Colina"]["typology"] == "camping"
    assert by["Cabañas Los Notros"]["typology"] == "cabana"
    assert by["Hotel Los Nires"]["phone"]
    assert "Esquel" in (by["Hotel Los Nires"]["address"] or "")


def test_microdata_extracts():
    rows = from_microdata(HTML_MICRODATA)
    by = {r["name"]: r for r in rows}
    assert by["Hostel Del Sur"]["typology"] == "hostel"
    assert by["Hotel Cordillera"]["typology"] == "hotel"


def test_heuristic_finds_repeated_cards():
    """Sin datos estructurados: se detectan las fichas repetidas."""
    rows = from_heuristic(HTML_CARDS)
    names = {r["name"] for r in rows}
    assert "Cabañas El Mirador" in names
    assert "Camping Municipal" in names
    assert len(names) >= 4, names
    by = {r["name"]: r for r in rows}
    assert by["Camping Municipal"]["typology"] == "camping"
    assert by["Hostería Las Bandurrias"]["typology"] == "hosteria"


def test_extract_prefers_structured_data():
    rows, strategy = extract(HTML_JSONLD)
    assert strategy == "jsonld" and len(rows) == 3
    rows, strategy = extract(HTML_CARDS)
    assert strategy == "heuristic" and rows


def test_extract_honours_configured_selectors():
    cfg = {"item": "article.ficha", "name": "h3"}
    rows, strategy = extract(HTML_CARDS, cfg)
    assert strategy == "selectors"
    assert "Cabañas El Mirador" in {r["name"] for r in rows}


# ---------------- matching ----------------
def test_name_matching_survives_marketing_noise():
    assert score("Cabañas Los Notros", "✨Cabañas Los Notros - Vista al Lago✨") > 0.8
    assert score("Hotel Los Ñires", "Hotel Los Nires") > 0.8
    assert score("Complejo Alto Andino", "Alto Andino Apart & Spa") > 0.6
    # distintos establecimientos no deben matchear
    assert score("Cabañas El Mirador", "Hotel Cordillera") < 0.5


def test_norm_name_strips_accents_and_symbols():
    assert norm_name("✨Cabañas Los Ñires!!") == "cabanas los nires"


# ---------------- integración: match + adopción ----------------
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


def _scenario():
    """3 oficiales; 2 publicados online (uno con nombre marketinero)."""
    init_db()
    tok = uuid.uuid4().hex[:8]
    with session_scope() as s:
        fam = Family(name=f"Reg-{tok}", platforms="booking"); s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="Esquel"); s.add(dest); s.flush()
        src = RegistrySource(destination_id=dest.id, name="Turismo Esquel",
                             url=f"https://ej.ar/{tok}"); s.add(src); s.flush()
        officials = [("Cabañas Los Notros", "cabana"), ("Hotel Cordillera", "hotel"),
                     ("Camping Municipal", "camping")]
        for n, t in officials:
            s.add(OfficialListing(source_id=src.id, destination_id=dest.id, name=n,
                                  name_norm=norm_name(n), typology=t))
        # anuncios: dos coinciden (uno con ruido), la tipología viene MAL de la plataforma
        s.add(Listing(platform="booking", external_id=f"a-{tok}", destination_id=dest.id,
                      name="✨Cabañas Los Notros - Vista al Lago✨", typology="otro"))
        s.add(Listing(platform="booking", external_id=f"b-{tok}", destination_id=dest.id,
                      name="Hotel Cordillera", typology="otro"))
        s.flush()
        return fam.id, dest.id


def test_match_links_and_fixes_typologies(client):
    c, h = client
    fam_id, dest_id = _scenario()
    r = c.post(f"/api/registry/match?destination_id={dest_id}", headers=h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["officials"] == 3 and out["linked"] == 2
    assert out["retyped"] == 2      # ambas tipologías corregidas con el dato oficial
    with session_scope() as s:
        typ = {l.name: (l.typology, l.typology_manual) for l in
               s.query(Listing).filter(Listing.destination_id == dest_id).all()}
    assert typ["Hotel Cordillera"] == ("hotel", True)
    assert typ["✨Cabañas Los Notros - Vista al Lago✨"] == ("cabana", True)


def test_adoption_index_reports_offline_inventory(client):
    c, h = client
    fam_id, dest_id = _scenario()
    c.post(f"/api/registry/match?destination_id={dest_id}", headers=h)
    r = c.get(f"/api/registry/adoption?family_id={fam_id}", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total"]["official"] == 3
    assert data["total"]["online"] == 2
    assert data["total"]["pct"] == 67
    typ = {t["typology"]: t for t in data["by_typology"]}
    assert typ["camping"]["online"] == 0        # el camping no está publicado
    assert typ["hotel"]["pct"] == 100


def test_officials_endpoint_can_list_offline_only(client):
    c, h = client
    fam_id, dest_id = _scenario()
    c.post(f"/api/registry/match?destination_id={dest_id}", headers=h)
    r = c.get(f"/api/registry/officials?destination_id={dest_id}&only_offline=true", headers=h)
    assert r.status_code == 200, r.text
    names = [row["name"] for row in r.json()["rows"]]
    assert names == ["Camping Municipal"], names


def test_sources_crud_and_seeded(client):
    c, h = client
    r = c.get("/api/registry/sources", headers=h)
    assert r.status_code == 200
    # el seed carga las fuentes oficiales conocidas del preset
    urls = " ".join(s["url"] for s in r.json())
    assert "esquel.tur.ar" in urls and "trevelin.tur.ar" in urls
