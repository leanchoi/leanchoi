"""Utilidades de parseo compartidas por los scrapers."""
from __future__ import annotations

import re

# Simbolo/codigo de moneda -> codigo ISO
_CURRENCY_MAP = {
    "€": "EUR", "eur": "EUR",
    "$": "USD", "us$": "USD", "usd": "USD",
    "£": "GBP", "gbp": "GBP",
    "¥": "JPY", "jpy": "JPY",
}

_NUM_RE = re.compile(r"[\d][\d.,\s]*")


def parse_price(raw: str | None) -> tuple[float | None, str | None]:
    """Extrae (importe, moneda) de un texto tipo '€ 1.234,56' o '$1,234'.

    Maneja formato europeo (1.234,56) y anglosajon (1,234.56).
    """
    if not raw:
        return None, None
    text = raw.strip()
    currency = None
    low = text.lower()
    for token, iso in _CURRENCY_MAP.items():
        if token in low:
            currency = iso
            break

    m = _NUM_RE.search(text)
    if not m:
        return None, currency
    # Quitar espacios normales y no separables (&nbsp; -> \xa0)
    num = m.group(0).strip().replace(" ", "").replace("\xa0", "")

    has_dot = "." in num
    has_comma = "," in num
    if has_dot and has_comma:
        # Ambos presentes: el ultimo que aparece es el separador decimal.
        if num.rfind(",") > num.rfind("."):
            num = num.replace(".", "").replace(",", ".")  # europeo: 1.234,56
        else:
            num = num.replace(",", "")                    # anglosajon: 1,234.56
    elif has_dot or has_comma:
        # Un solo tipo de separador: decimal solo si hay 1 grupo final != 3
        # digitos (los precios no usan milesimas), en otro caso es de miles.
        sep = "." if has_dot else ","
        parts = num.split(sep)
        if len(parts) == 2 and len(parts[1]) != 3:
            num = parts[0] + "." + parts[1]  # decimal: 12,99 / 12.99
        else:
            num = "".join(parts)             # miles: 1.210 / 1,234 / 1.234.567
    try:
        return float(num), currency
    except ValueError:
        return None, currency


def parse_int(raw: str | None) -> int | None:
    """Extrae el primer entero de un texto ('1.234 comentarios' -> 1234)."""
    if not raw:
        return None
    digits = re.sub(r"[^\d]", "", raw)
    return int(digits) if digits else None


def parse_rating(raw: str | None) -> float | None:
    """Extrae una nota decimal ('8,6' o 'Rating 4.85' -> 8.6 / 4.85)."""
    if not raw:
        return None
    m = re.search(r"(\d+[.,]\d+|\d+)", raw)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", "."))
    except ValueError:
        return None


# Palabras clave -> tipología. Orden importa (más específico primero).
_TYPOLOGY_RULES = [
    ("cabana", ["cabaña", "cabana", "cabin", "cabañas", "log home"]),
    ("hosteria", ["hostería", "hosteria", "hostel", "hostal", "b&b", "bed and breakfast", "posada", "lodge", "refugio"]),
    ("hotel", ["hotel", "resort", "apart hotel", "aparthotel", "spa"]),
    ("departamento", ["departamento", "depto", "apartment", "apartamento", "apart", "monoambiente", "loft", "studio", "estudio", "flat"]),
    ("casa", ["casa", "house", "chalet", "home", "villa", "vivienda"]),
]


def classify_typology(name: str | None, room_type: str | None = None, platform: str | None = None) -> str:
    """Clasifica un alojamiento en una tipología a partir de su nombre/tipo.

    Heurística por palabras clave. Devuelve el valor del enum Typology.
    """
    haystack = " ".join(x for x in [name, room_type] if x).lower()
    for typ, keywords in _TYPOLOGY_RULES:
        if any(kw in haystack for kw in keywords):
            return typ
    if platform == "booking":
        return "hotel"
    return "otro"
