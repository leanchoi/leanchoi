"""Extracción de establecimientos desde sitios oficiales de turismo.

Cada municipio arma su web distinto, así que en vez de un scraper por sitio se
usan estrategias en cascada, de más confiable a más heurística:

  1. JSON-LD (schema.org LodgingBusiness/Hotel/Campground) — dato estructurado.
  2. Microdata (itemtype schema.org) — idem, en atributos HTML.
  3. Selectores configurados a mano para ese sitio (RegistrySource.selectors).
  4. Heurística de tarjetas: bloques repetidos con nombre + contacto.

Así el crawler funciona sin conocer el sitio de antemano, y si hace falta se
afina por configuración (sin tocar código).
"""
from __future__ import annotations

import json
import re
from typing import Any, Iterable

from parsel import Selector  # type: ignore

from ..scrapers.util import classify_typology

# Tipos schema.org que representan alojamiento
LODGING_TYPES = {
    "hotel", "lodgingbusiness", "bedandbreakfast", "hostel", "motel", "resort",
    "campground", "apartment", "aparthotel", "house", "suite", "vacationrental",
    "touristattraction",  # algunos sitios etiquetan mal; se filtra por señales
}

_PHONE_RE = re.compile(r"(?:\+?54)?[\s\-.()]*(?:9)?[\s\-.()]*\d{2,4}[\s\-.()]*\d{3}[\s\-.()]*\d{3,4}")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_CAP_RE = re.compile(r"(\d{1,4})\s*(?:plazas|camas|personas|pax)", re.I)

# Palabras que delatan que un bloque es un alojamiento (para la heurística)
_LODGING_HINT = re.compile(
    r"caba[ñn]a|hotel|hoster[ií]a|hostel|hostal|albergue|apart|departamento|"
    r"camping|bungalow|posada|complejo|resort|lodge|refugio|domo|caba|b&b|"
    r"bed\s*&?\s*breakfast|alojamiento|dormis?", re.I)


def _txt(x: Any) -> str | None:
    """Normaliza a texto simple (schema.org a veces anida objetos/listas)."""
    if x is None:
        return None
    if isinstance(x, str):
        return x.strip() or None
    if isinstance(x, (int, float)):
        return str(x)
    if isinstance(x, list):
        for i in x:
            t = _txt(i)
            if t:
                return t
        return None
    if isinstance(x, dict):
        for k in ("name", "@value", "text", "value"):
            if k in x:
                return _txt(x[k])
    return None


def _address_of(node: dict) -> str | None:
    a = node.get("address")
    if isinstance(a, str):
        return a.strip() or None
    if isinstance(a, dict):
        parts = [_txt(a.get(k)) for k in
                 ("streetAddress", "addressLocality", "addressRegion")]
        joined = ", ".join(p for p in parts if p)
        return joined or None
    if isinstance(a, list) and a:
        return _address_of({"address": a[0]})
    return None


def _capacity_of(node: dict, blob: str | None = None) -> int | None:
    for k in ("numberOfRooms", "maximumAttendeeCapacity", "occupancy"):
        v = _txt(node.get(k))
        if v and v.isdigit():
            return int(v)
    if blob:
        m = _CAP_RE.search(blob)
        if m:
            return int(m.group(1))
    return None


def _mk(name: str, typ_raw: str | None = None, **kw) -> dict:
    """Arma el registro normalizado de un establecimiento."""
    name = re.sub(r"\s+", " ", (name or "")).strip(" -–·|")
    return {
        "name": name[:400],
        "typology": classify_typology(name, None, None, typ_raw),
        "typology_raw": (typ_raw or None),
        "address": kw.get("address"), "phone": kw.get("phone"),
        "email": kw.get("email"), "website": kw.get("website"),
        "capacity": kw.get("capacity"), "url": kw.get("url"),
        "raw": kw.get("raw") or {},
    }


# --------------------------------------------------------------------------
#  1) JSON-LD
# --------------------------------------------------------------------------
def _walk(data: Any) -> Iterable[dict]:
    stack = [data]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            yield cur
            stack.extend(cur.values())
        elif isinstance(cur, list):
            stack.extend(cur)


def from_jsonld(html: str) -> list[dict]:
    sel = Selector(text=html)
    out: list[dict] = []
    for blob in sel.css('script[type="application/ld+json"]::text').getall():
        try:
            data = json.loads(blob)
        except (json.JSONDecodeError, TypeError):
            continue
        for node in _walk(data):
            types = node.get("@type")
            types = [types] if isinstance(types, str) else (types or [])
            tset = {str(t).lower() for t in types}
            if not (tset & LODGING_TYPES):
                continue
            name = _txt(node.get("name"))
            if not name:
                continue
            out.append(_mk(
                name, next(iter(tset), None),
                address=_address_of(node), phone=_txt(node.get("telephone")),
                email=_txt(node.get("email")), website=_txt(node.get("url")),
                capacity=_capacity_of(node), url=_txt(node.get("url")),
                raw={"source": "jsonld", "types": sorted(tset)},
            ))
    return out


# --------------------------------------------------------------------------
#  2) Microdata schema.org
# --------------------------------------------------------------------------
def from_microdata(html: str) -> list[dict]:
    sel = Selector(text=html)
    out: list[dict] = []
    for node in sel.css("[itemtype]"):
        itype = (node.attrib.get("itemtype") or "").rsplit("/", 1)[-1].lower()
        if itype not in LODGING_TYPES:
            continue
        name = (node.css('[itemprop="name"]::text').get()
                or node.css('[itemprop="name"]::attr(content)').get())
        if not name or not name.strip():
            continue
        blob = " ".join(t.strip() for t in node.css("::text").getall() if t.strip())
        out.append(_mk(
            name, itype,
            address=(node.css('[itemprop="address"] ::text').get() or "").strip() or None,
            phone=(node.css('[itemprop="telephone"]::text').get() or "").strip() or None,
            email=(node.css('[itemprop="email"]::text').get() or "").strip() or None,
            website=node.css('[itemprop="url"]::attr(href)').get(),
            capacity=_capacity_of({}, blob),
            url=node.css("a::attr(href)").get(),
            raw={"source": "microdata", "types": [itype]},
        ))
    return out


# --------------------------------------------------------------------------
#  3) Selectores configurados para el sitio
# --------------------------------------------------------------------------
def from_selectors(html: str, sel_cfg: dict) -> list[dict]:
    item_sel = (sel_cfg or {}).get("item")
    if not item_sel:
        return []
    sel = Selector(text=html)
    out: list[dict] = []
    for node in sel.css(item_sel):
        def pick(key, attr=None):
            css = sel_cfg.get(key)
            if not css:
                return None
            v = node.css(f"{css}::attr({attr})").get() if attr else \
                " ".join(t.strip() for t in node.css(f"{css} ::text").getall() if t.strip())
            return (v or "").strip() or None
        name = pick("name") or (node.css("::text").get() or "").strip()
        if not name:
            continue
        blob = " ".join(t.strip() for t in node.css("::text").getall() if t.strip())
        out.append(_mk(
            name, pick("typology"),
            address=pick("address"), phone=pick("phone") or _first(_PHONE_RE, blob),
            email=pick("email") or _first(_EMAIL_RE, blob),
            website=pick("link", "href"), capacity=_capacity_of({}, blob),
            url=pick("link", "href") or node.css("a::attr(href)").get(),
            raw={"source": "selectors"},
        ))
    return out


def _first(rx: re.Pattern, text: str | None) -> str | None:
    if not text:
        return None
    m = rx.search(text)
    return m.group(0).strip() if m else None


# --------------------------------------------------------------------------
#  4) Heurística de tarjetas repetidas
# --------------------------------------------------------------------------
def from_heuristic(html: str) -> list[dict]:
    """Busca bloques repetidos que parezcan fichas de alojamiento.

    Estrategia: agrupar elementos por 'firma' (tag + clases) y quedarse con el
    grupo más numeroso cuyos textos tengan pinta de alojamiento (nombre + alguna
    señal de contacto o palabra clave del rubro).
    """
    sel = Selector(text=html)
    groups: dict[str, list] = {}
    for node in sel.css("article, li, div"):
        cls = (node.attrib.get("class") or "").strip()
        if not cls:
            continue
        sig = f"{node.root.tag}.{' '.join(sorted(cls.split()))[:80]}"
        groups.setdefault(sig, []).append(node)

    best: list[dict] = []
    for _sig, nodes in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        if len(nodes) < 3:            # necesitamos repetición para hablar de listado
            continue
        cand: list[dict] = []
        for node in nodes:
            texts = [t.strip() for t in node.css("::text").getall() if t.strip()]
            if not texts:
                continue
            blob = " ".join(texts)
            if len(blob) > 900:       # bloque contenedor, no una ficha
                continue
            name = (node.css("h1::text, h2::text, h3::text, h4::text, h5::text").get()
                    or node.css("a::attr(title)").get()
                    or node.css("a::text").get() or texts[0])
            name = (name or "").strip()
            if len(name) < 3 or len(name) > 160:
                continue
            phone, email = _first(_PHONE_RE, blob), _first(_EMAIL_RE, blob)
            if not (_LODGING_HINT.search(blob) or phone or email):
                continue
            typ_raw = _first(_LODGING_HINT, blob)
            cand.append(_mk(
                name, typ_raw, phone=phone, email=email,
                website=node.css("a::attr(href)").get(),
                capacity=_capacity_of({}, blob), url=node.css("a::attr(href)").get(),
                raw={"source": "heuristic"},
            ))
        # nos quedamos con el grupo que más fichas plausibles produce
        uniq = {c["name"].lower(): c for c in cand}
        if len(uniq) > len(best):
            best = list(uniq.values())
    return best


# --------------------------------------------------------------------------
#  Orquestador
# --------------------------------------------------------------------------
def extract(html: str, selectors: dict | None = None) -> tuple[list[dict], str]:
    """Devuelve (establecimientos, estrategia_usada) probando en cascada."""
    for name, fn in (("selectors", lambda: from_selectors(html, selectors or {})),
                     ("jsonld", lambda: from_jsonld(html)),
                     ("microdata", lambda: from_microdata(html)),
                     ("heuristic", lambda: from_heuristic(html))):
        try:
            rows = fn()
        except Exception:  # noqa: BLE001
            rows = []
        rows = dedupe(rows)
        if rows:
            return rows, name
    return [], "none"


def dedupe(rows: list[dict]) -> list[dict]:
    """Deduplica por nombre normalizado, conservando el registro más completo."""
    from .match import norm_name

    best: dict[str, dict] = {}
    for r in rows:
        key = norm_name(r["name"])
        if not key or len(key) < 3:
            continue
        cur = best.get(key)
        if cur is None or _richness(r) > _richness(cur):
            best[key] = r
    return list(best.values())


def _richness(r: dict) -> int:
    return sum(1 for k in ("address", "phone", "email", "website", "capacity", "typology_raw")
               if r.get(k))
