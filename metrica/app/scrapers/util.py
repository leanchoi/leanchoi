"""Utilidades de parseo compartidas por los scrapers."""
from __future__ import annotations

import re
import unicodedata

# Palabras genéricas de nombres de destino que NO alcanzan para desambiguar.
_DEST_STOP = {"el", "la", "los", "las", "san", "santa", "villa", "de", "del", "lago", "puerto"}


def _norm(s: str | None) -> str:
    """Minúsculas, sin acentos, solo alfanumérico + espacios."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", " ", s)


def resolve_locality_destination(locality: str | None, siblings: list[tuple[int, str]]) -> int | None:
    """Devuelve el id del destino cuyo nombre coincide con la localidad reportada.

    `siblings`: lista de (destination_id, nombre). Primero intenta match del nombre
    completo dentro de la localidad; si no, por el token distintivo del nombre
    (evita 'el'/'la'/'san'…). Si nada coincide, None (se conserva la asignación
    previa). Esto corrige la confusión por búsquedas de radio en plataformas.
    """
    if not locality or not siblings:
        return None
    loc = _norm(locality)
    for did, name in siblings:  # 1) nombre completo del destino en la localidad
        n = _norm(name)
        if n and n in loc:
            return did
    for did, name in siblings:  # 2) token distintivo (largo, no genérico)
        toks = [t for t in _norm(name).split() if t not in _DEST_STOP and len(t) > 3]
        if any(re.search(rf"\b{re.escape(t)}\b", loc) for t in toks):
            return did
    return None

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
    ("cabana", ["cabaña", "cabana", "cabin", "cabañas", "log home", "domo", "bungalow",
                "glamping", "tiny house", "tiny home", "rancho"]),
    # Hostel es su propia tipología: otro público y otra estructura de tarifa
    # (cama en habitación compartida) — promediarlo con hosterías distorsiona.
    ("hostel", ["hostel", "hostal", "albergue", "backpacker", "hostelling"]),
    ("hosteria", ["hostería", "hosteria", "b&b", "bed and breakfast",
                  "posada", "lodge", "refugio", "hospedaje", "guest house",
                  "casa de huéspedes", "casa de huespedes"]),
    ("hotel", ["hotel", "resort", "apart hotel", "aparthotel", "apart-hotel", "complejo turístico",
               "complejo turistico"]),
    ("departamento", ["departamento", "depto", "apartment", "apartamento", "apart ", "monoambiente",
                      "loft", "studio", "estudio", "flat", "duplex", "dúplex", "ph"]),
    ("casa", ["casa", "house", "chalet", "home", "villa", "vivienda", "quinta"]),
]

# Mapeo del "tipo de propiedad" estructurado de la plataforma -> taxonomía.
# (Booking y Airbnb exponen esto; es mucho más confiable que el nombre.)
_PROPERTY_TYPE_MAP = {
    "cabana": ["cabin", "cabaña", "cabana", "chalet", "cottage", "domo", "dome", "bungalow", "hut"],
    "departamento": ["apartment", "apartamento", "departamento", "condo", "loft", "serviced apartment",
                     "aparthotel", "apart hotel", "rental unit", "guest suite"],
    "hotel": ["hotel", "resort", "boutique hotel", "hotel room", "aparthotel"],
    "hostel": ["hostel", "hostal", "albergue", "backpacker"],
    "hosteria": ["bed and breakfast", "b&b", "guesthouse", "guest house",
                 "lodge", "inn", "posada", "hostería", "hosteria", "country house"],
    "casa": ["house", "casa", "home", "villa", "townhouse", "entire home", "farm stay", "cottage"],
}


def _match_keywords(text: str) -> str | None:
    for typ, keywords in _TYPOLOGY_RULES:
        if any(kw in text for kw in keywords):
            return typ
    return None


def classify_typology(name: str | None, room_type: str | None = None,
                      platform: str | None = None, property_type: str | None = None) -> str:
    """Clasifica un alojamiento en una tipología.

    Prioridad: (1) tipo de propiedad estructurado de la plataforma, (2) palabras
    clave en nombre/tipo de habitación. Si nada matchea, 'otro' (no se fuerza
    'hotel', para no clasificar mal).
    """
    # 1) tipo de propiedad estructurado (lo más confiable)
    if property_type:
        pt = property_type.lower()
        for typ, keys in _PROPERTY_TYPE_MAP.items():
            if any(k in pt for k in keys):
                return typ

    # 2) palabras clave en nombre + tipo de habitación
    haystack = " ".join(x for x in [name, room_type] if x).lower()
    hit = _match_keywords(haystack)
    if hit:
        return hit

    return "otro"
