"""Tests de los parsers de Booking y Airbnb contra fixtures HTML."""
from pathlib import Path

from app.scrapers.airbnb import AirbnbScraper
from app.scrapers.booking import BookingScraper

FIX = Path(__file__).parent / "fixtures"


def test_booking_parser():
    html = (FIX / "booking_sample.html").read_text(encoding="utf-8")
    listings = BookingScraper().parse(html, "2026-08-01", "2026-08-03")
    assert len(listings) == 3

    first = listings[0]
    assert first.name == "Hotel Gran Via Capital"
    assert first.price == 240.0
    assert first.currency == "EUR"
    assert first.listing_id == "gran-via-capital"
    assert first.url == "https://www.booking.com/hotel/es/gran-via-capital.es.html"
    assert first.rating == 8.6
    assert first.reviews == 1234
    assert first.room_type == "Habitacion Doble Deluxe"
    assert first.checkin == "2026-08-01"

    # precio con separador de miles europeo
    assert listings[1].price == 1180.0


def test_airbnb_parser_json():
    html = (FIX / "airbnb_sample.html").read_text(encoding="utf-8")
    listings = AirbnbScraper().parse(html, "2026-08-01", "2026-08-03")
    assert len(listings) == 3

    by_id = {l.listing_id: l for l in listings}
    a = by_id["12345678"]
    assert a.name == "Apartamento luminoso en Malasana"
    assert a.price == 145.0
    assert a.currency == "EUR"
    assert a.rating == 4.92
    assert a.url == "https://www.airbnb.com/rooms/12345678"

    # precio por ruta alternativa (pricingQuote) con miles europeos
    assert by_id["11112222"].price == 1210.0


def test_airbnb_dom_fallback():
    html = """<html><body>
      <div data-testid="card-container">
        <a href="/rooms/999/photos" aria-label="Casa con piscina"></a>
        <span data-testid="listing-card-title">Casa con piscina</span>
        <span>€ 320 por noche</span>
      </div>
    </body></html>"""
    listings = AirbnbScraper().parse(html, "2026-08-01", "2026-08-03")
    assert len(listings) == 1
    assert listings[0].listing_id == "999"
    assert listings[0].price == 320.0
