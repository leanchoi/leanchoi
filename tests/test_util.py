"""Tests de las utilidades de parseo (precio/entero/rating)."""
from app.scrapers.util import parse_int, parse_price, parse_rating


def test_parse_price_europeo():
    assert parse_price("€ 1.234,56") == (1234.56, "EUR")
    assert parse_price("€ 240") == (240.0, "EUR")


def test_parse_price_anglosajon():
    assert parse_price("$1,234.50") == (1234.50, "USD")
    assert parse_price("£95") == (95.0, "GBP")


def test_parse_price_total_label():
    val, cur = parse_price("€ 1.210 total")
    assert val == 1210.0 and cur == "EUR"


def test_parse_price_vacio():
    assert parse_price(None) == (None, None)
    assert parse_price("sin precio") == (None, None)


def test_parse_int():
    assert parse_int("1.234 comentarios") == 1234
    assert parse_int("842 reviews") == 842
    assert parse_int(None) is None


def test_parse_rating():
    assert parse_rating("8,6") == 8.6
    assert parse_rating("4,92 (128)") == 4.92
    assert parse_rating("Excelente") is None
