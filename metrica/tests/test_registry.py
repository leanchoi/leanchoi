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


# ---------------- defectos observados en el crawl real ----------------
# Reproducen lo que devolvieron los sitios de Esquel y El Bolsón.

HTML_ESQUEL_LIKE = """
<html><body><div class="lista">
 <div class="item aloj"><p>Hotel Tehuelche</p>
   <p>(+54 9 2945): 452420 / 451534</p><p>tehuelchehotel@henkosa.com.ar</p></div>
 <div class="item aloj"><p>Sur Sur Patagónico</p>
   <p>+ 54 9 2945 691591 / + 54 9 2945 451234</p><p>hotelsursurpatagonico@gmail.com</p></div>
 <div class="item aloj"><p>Hotel Sol del Sur</p>
   <p>+54 9 2945 452189 / 451534</p><p>info@soldelsurhotel.com.ar</p>
   <p>www.soldelsurhotel.com.ar</p></div>
 <div class="item aloj"><p>Residencial Ski</p>
   <p>residencialski@gmail.com</p><p>Cabañas y departamentos</p></div>
</div></body></html>"""

HTML_CATEGORY_INDEX = """
<html><body><ul class="cats">
 <li class="cat"><a href="/alojamientos/hoteles">Hoteles</a></li>
 <li class="cat"><a href="/alojamientos/cabanas">Cabañas</a></li>
 <li class="cat"><a href="/alojamientos/campings">Campings</a></li>
 <li class="cat"><a href="/alojamientos/hostels">Hostels</a></li>
</ul></body></html>"""


def test_name_is_never_a_phone_or_email():
    """El crawl real tomaba '(+54 9 2945): 452420' y mails como NOMBRE."""
    rows = from_heuristic(HTML_ESQUEL_LIKE)
    names = {r["name"] for r in rows}
    assert "Hotel Tehuelche" in names, names
    assert "Residencial Ski" in names, names
    for n in names:
        assert "@" not in n, f"un email quedó como nombre: {n}"
        assert not n.startswith(("+", "(")), f"un teléfono quedó como nombre: {n}"
        assert not n.lower().startswith(("www.", "http")), f"una URL quedó como nombre: {n}"


def test_category_labels_are_not_establishments():
    """El Bolsón devolvía 'Cabañas', 'Hoteles', 'Campings': es el menú."""
    from app.registry.extract import category_links, looks_like_category_index
    rows = from_heuristic(HTML_CATEGORY_INDEX)
    assert looks_like_category_index(rows, HTML_CATEGORY_INDEX) or not rows
    links = category_links(HTML_CATEGORY_INDEX, "https://ej.gob.ar/alojamientos")
    assert any("hoteles" in u for u in links) and any("campings" in u for u in links), links


def test_structure_report_helps_write_selectors():
    from app.registry.extract import structure_report
    rep = structure_report(HTML_ESQUEL_LIKE)
    assert rep and rep[0]["count"] >= 4
    assert "item" in rep[0]["selector"] and "aloj" in rep[0]["selector"]


HTML_ESQUEL_ITEMS = """
<html><body>
 <div class="itemAlojamiento itemAlojamientoGrande">
   <div class="direccion">9 de julio 831</div>
   <div class="tituloAlojamiento">Hotel Tehuelche</div>
   <div class="tel">(+54 9 2945): 452420</div>
 </div>
 <div class="itemAlojamiento itemAlojamientoGrande">
   <div class="direccion">San Martin 961</div>
   <div class="tituloAlojamiento">Las Bayas Home Suites</div>
   <div class="tel">+54 9 2945 452189</div>
 </div>
</body></html>"""


def test_configured_item_selector_finds_name_not_address():
    """Esquel: la ficha empieza con la DIRECCIÓN; el nombre está más abajo.
    Con `item` configurado, igual hay que elegir el texto plausible correcto."""
    rows, strategy = extract(HTML_ESQUEL_ITEMS, {"item": "div.itemAlojamiento"})
    assert strategy == "selectors"
    names = {r["name"] for r in rows}
    assert names == {"Hotel Tehuelche", "Las Bayas Home Suites"}, names


def test_api_payload_extraction_for_spa_sites():
    """Bariloche es Angular: los alojamientos llegan por XHR, no en el HTML."""
    from app.registry.extract import from_api_payloads
    payload = {"data": {"hoteles": [
        {"nombre": "Hotel Panamericano", "direccion": "Bustillo 100",
         "telefono": "2944 425000", "categoria": "Hotel", "plazas": "300"},
        {"nombre": "Camping Petunia", "direccion": "Km 13", "tipo": "Camping"},
        {"nombre": "Buscar", "id": 1},          # ruido de UI: se descarta
    ]}}
    rows = from_api_payloads([payload])
    by = {r["name"]: r for r in rows}
    assert set(by) == {"Hotel Panamericano", "Camping Petunia"}, by
    assert by["Hotel Panamericano"]["typology"] == "hotel"
    assert by["Hotel Panamericano"]["capacity"] == 300
    assert by["Camping Petunia"]["typology"] == "camping"


def test_category_label_detection_by_tokens():
    """Detecta categorías aunque no estén literales: 'Refugios de montaña'."""
    from app.registry.extract import is_category_label
    assert is_category_label("Refugios de montaña")
    assert is_category_label("Bed & Breakfast")
    assert is_category_label("Casas y Departamentos")
    assert is_category_label("Buscar Alojamiento")
    assert not is_category_label("Hotel Tehuelche")
    assert not is_category_label("Cabañas Los Notros")


def test_drill_report_marks_the_name_candidate():
    from app.registry.extract import drill_report
    rep = drill_report(HTML_ESQUEL_ITEMS, "div.itemAlojamiento")
    assert rep["total_items"] == 2
    kids = rep["samples"][0]["children"]
    named = [c["text"] for c in kids if c["plausible_name"]]
    assert "Hotel Tehuelche" in named
    assert not any(c["plausible_name"] and c["text"].startswith("(+54") for c in kids)


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
