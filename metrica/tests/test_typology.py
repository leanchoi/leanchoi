"""Tests de clasificación de tipología y parseo de precios."""
from app.scrapers.util import classify_typology, parse_price


def test_classify_by_name():
    assert classify_typology("Cabaña del bosque") == "cabana"
    assert classify_typology("Domo geodésico") == "cabana"
    assert classify_typology("Departamento céntrico 2 amb") == "departamento"
    assert classify_typology("Hotel Patagonia") == "hotel"
    assert classify_typology("Hostería Los Ñires") == "hosteria"
    assert classify_typology("Casa con jardín") == "casa"
    # sin señal -> 'otro' (ya NO se fuerza 'hotel', que clasificaba mal)
    assert classify_typology("Las Bandurrias") == "otro"
    assert classify_typology("Las Bandurrias", platform="booking") == "otro"


def test_classify_by_property_type_priority():
    # el tipo de propiedad estructurado manda sobre el nombre
    assert classify_typology("Las Bandurrias", property_type="Cabin") == "cabana"
    assert classify_typology("Complejo X", property_type="Apartment") == "departamento"
    assert classify_typology("Refugio Sur", property_type="Hotel") == "hotel"


def test_price_ars_usd():
    assert parse_price("$ 97.275")[0] == 97275.0
    assert parse_price("u$s 65")[0] == 65.0
