"""Test OFFLINE del parseo de Airbnb.

Airbnb entrega los resultados por su API interna (GraphQL StaysSearch), no en el
HTML plano. Acá reproducimos la forma real de esa respuesta y verificamos que la
extracción funciona SIN red. Esto prueba que el código está listo: lo único que
falta en producción es una IP no bloqueada (proxy residencial) para que la
plataforma responda — el bloqueo es de red, no del parser.
"""
import base64
import json

from app.scrapers.airbnb import AirbnbScraper

CI, CO = "2026-08-10", "2026-08-11"


def _staysearch_payload():
    """Forma simplificada pero realista de data.presentation.staysSearch."""
    def result(lid, name, price_str, rating, room_type):
        return {
            "__typename": "StaySearchResult",
            "listing": {
                "id": lid, "name": name, "roomTypeCategory": room_type,
                "avgRatingLocalized": rating,
            },
            "pricingQuote": {
                "structuredStayDisplayPrice": {
                    "primaryLine": {"price": price_str}
                }
            },
        }
    search_results = [
        result("1111", "Cabaña del Bosque", "$ 45.000", "4.9 (120)", "entire_home"),
        result("2222", "Departamento Céntrico", "$ 32.500", "4.7 (88)", "entire_home"),
        result("3333", "Habitación en Hostel", "$ 12.000", "4.5 (40)", "private_room"),
    ]
    return {"data": {"presentation": {"staysSearch": {
        "results": {"searchResults": search_results}}}}}


def test_find_and_extract_from_api_json():
    """El camino de intercepción de API: recorrer el JSON y armar listings."""
    scraper = AirbnbScraper()
    data = _staysearch_payload()
    nodes = list(scraper._find_listing_nodes(data))
    listings = [scraper._node_to_listing(n, CI, CO) for n in nodes]
    listings = [l for l in listings if l]
    by_id = {l.listing_id: l for l in listings}

    assert set(by_id) == {"1111", "2222", "3333"}, by_id
    assert by_id["1111"].name == "Cabaña del Bosque"
    assert by_id["1111"].price == 45000.0, by_id["1111"].price
    assert by_id["2222"].price == 32500.0
    assert by_id["3333"].price == 12000.0
    assert by_id["1111"].rating == 4.9
    assert by_id["1111"].url == "https://www.airbnb.com/rooms/1111"


def test_parse_from_embedded_json_script():
    """El respaldo: JSON embebido en <script type='application/json'>."""
    scraper = AirbnbScraper()
    payload = _staysearch_payload()
    html = ('<html><head><title>Airbnb</title></head><body>'
            f'<script type="application/json">{json.dumps(payload)}</script>'
            '</body></html>')
    listings = scraper.parse(html, CI, CO)
    ids = {l.listing_id for l in listings}
    assert {"1111", "2222", "3333"} <= ids, ids


def test_dom_fallback_by_room_links():
    """Último recurso: enlaces /rooms/ cuando no hay JSON utilizable."""
    scraper = AirbnbScraper()
    html = ('<html><body>'
            '<a href="/rooms/98765" aria-label="Cabaña Los Pinos">x</a>'
            '<a href="/rooms/plus/54321" aria-label="Loft Moderno">y</a>'
            '</body></html>')
    listings = scraper._parse_from_dom(html, CI, CO)
    ids = {l.listing_id for l in listings}
    assert ids == {"98765", "54321"}, ids


def test_decode_listing_id_handles_base64_graphql_ids():
    """Airbnb devuelve ids opacos en base64: sin decodificar, la URL /rooms/<id>
    queda rota y el external_id ilegible."""
    from app.scrapers.airbnb import decode_listing_id

    enc = base64.b64encode(b"DemandStayListing:123456").decode()
    assert decode_listing_id(enc) == "123456"
    assert decode_listing_id(base64.b64encode(b"StayListing:987").decode()) == "987"
    assert decode_listing_id("DemandStayListing:555") == "555"   # sin codificar
    assert decode_listing_id("42") == "42"                        # id plano
    assert decode_listing_id(None) is None
    assert decode_listing_id("") is None


def test_node_to_listing_uses_decoded_id_in_url():
    scraper = AirbnbScraper()
    enc = base64.b64encode(b"DemandStayListing:777").decode()
    node = {"listing": {"id": enc, "name": "Cabaña Test"},
            "pricingQuote": {"structuredStayDisplayPrice": {"primaryLine": {"price": "$ 10.000"}}}}
    item = scraper._node_to_listing(node, CI, CO)
    assert item.listing_id == "777"
    assert item.url == "https://www.airbnb.com/rooms/777"


def test_debug_signals_counts_nodes():
    """El diagnóstico cuenta nodos de listing en el JSON embebido."""
    scraper = AirbnbScraper()
    payload = _staysearch_payload()
    html = f'<script type="application/json">{json.dumps(payload)}</script>'
    sig = scraper.debug_signals(html)
    assert sig["json_listing_nodes"] >= 3, sig
