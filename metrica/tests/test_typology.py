"""Tests de clasificación de tipología y parseo de precios."""
from app.scrapers.util import classify_typology, parse_price


def test_classify():
    assert classify_typology("Cabaña del bosque") == "cabana"
    assert classify_typology("Departamento céntrico 2 amb") == "departamento"
    assert classify_typology("Hotel Patagonia") == "hotel"
    assert classify_typology("Hostería Los Ñires") == "hosteria"
    assert classify_typology("Casa con jardín") == "casa"
    assert classify_typology("Algo raro") == "otro"
    # sesgo por plataforma cuando no hay señal
    assert classify_typology("Algo raro", platform="booking") == "hotel"


def test_price_ars_usd():
    assert parse_price("$ 97.275")[0] == 97275.0
    assert parse_price("u$s 65")[0] == 65.0
