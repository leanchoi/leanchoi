"""Vinculación entre el registro oficial y los anuncios de las plataformas.

El problema: el mismo establecimiento aparece como "Cabañas Los Notros" en el
municipio y como "✨Cabañas Los Notros - Vista al Lago✨" en Booking. Se compara
por nombre normalizado (sin acentos, sin ruido de marketing, sin palabras
genéricas del rubro) usando similitud de tokens + subcadena.
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

# Palabras del rubro y de marketing que no aportan a la identidad
_STOP = {
    "cabanas", "cabana", "hotel", "hosteria", "hostel", "hostal", "apart", "aparts",
    "departamento", "departamentos", "depto", "deptos", "complejo", "camping",
    "bungalow", "bungalows", "posada", "residencial", "alojamiento", "alojamientos",
    "casa", "casas", "domo", "domos", "lodge", "refugio", "albergue", "resort",
    "de", "del", "la", "el", "los", "las", "y", "en", "con", "para", "por", "a",
    "the", "and", "of", "at", "in", "vista", "vistas", "premium", "deluxe", "luxury",
    "boutique", "spa", "suites", "suite", "centro", "centrico", "patagonia",
}


def norm_name(s: str | None) -> str:
    """Minúsculas, sin acentos, sin emojis ni puntuación, espacios colapsados."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _tokens(s: str) -> set[str]:
    return {t for t in norm_name(s).split() if t not in _STOP and len(t) > 2}


def score(a: str, b: str) -> float:
    """Similitud 0..1 entre dos nombres de establecimiento."""
    na, nb = norm_name(a), norm_name(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    ta, tb = _tokens(a), _tokens(b)
    if ta and tb:
        inter = ta & tb
        if inter:
            jac = len(inter) / len(ta | tb)
            # cobertura del nombre más corto: "los notros" dentro de
            # "los notros vista al lago" debe puntuar alto
            cover = len(inter) / min(len(ta), len(tb))
            base = 0.45 * jac + 0.55 * cover
        else:
            base = 0.0
    else:
        base = 0.0
    # subcadena directa (nombre oficial contenido en el de la plataforma)
    if len(na) >= 6 and (na in nb or nb in na):
        base = max(base, 0.9)
    return max(base, SequenceMatcher(None, na, nb).ratio() * 0.85)


def best_matches(official_name: str, candidates: list[tuple[int, str]],
                 threshold: float = 0.62) -> list[tuple[int, float]]:
    """Devuelve [(listing_id, score)] ordenado, por encima del umbral."""
    out = [(lid, score(official_name, nm)) for lid, nm in candidates]
    out = [(lid, round(s, 3)) for lid, s in out if s >= threshold]
    out.sort(key=lambda x: -x[1])
    return out
