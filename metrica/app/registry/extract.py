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

# Un NOMBRE no puede ser un teléfono, un mail, una URL ni un precio.
_NOT_A_NAME = re.compile(
    r"^[\s\W\d]*$"                                  # sólo símbolos/números
    r"|^\+?\d[\d\s\-().+/]{5,}$"                    # teléfono
    r"|@[\w-]+\.[\w.]+"                             # email
    r"|^(?:https?://|www\.)"                        # URL
    r"|^\[?www\."                                   # markdown de URL
    r"|^\$|^u\$s", re.I)

# Etiquetas de categoría/navegación: son el menú del sitio, no establecimientos.
_CATEGORY_ONLY = {
    "hotel", "hoteles", "cabana", "cabanas", "hosteria", "hosterias", "hostel",
    "hostels", "hostal", "hostales", "camping", "campings", "apart", "aparts",
    "apart hotel", "apart hoteles", "departamento", "departamentos", "casa",
    "casas", "casas y departamentos", "bed & breakfast", "bed and breakfast",
    "b&b", "bungalow", "bungalows", "complejo", "complejos", "posada", "posadas",
    "refugio", "refugios", "estancia", "estancias", "dormi", "dormis",
    "alojamiento", "alojamientos", "buscar alojamiento", "donde dormir",
    "dónde dormir", "ver mas", "ver más", "leer mas", "leer más", "contacto",
    "inicio", "servicios", "turismo", "cabalgatas", "excursiones", "gastronomia",
    "gastronomía", "que hacer", "qué hacer",
}


def _plausible_name(name: str | None) -> bool:
    """¿Esto parece el nombre de un establecimiento?"""
    if not name:
        return False
    n = " ".join(name.split())
    if len(n) < 4 or len(n) > 160:
        return False
    if _NOT_A_NAME.search(n):
        return False
    from .match import norm_name
    if norm_name(n) in _CATEGORY_ONLY:     # es una categoría del menú
        return False
    return any(ch.isalpha() for ch in n)


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
            # El nombre sale del primer candidato PLAUSIBLE (no un teléfono, mail
            # o etiqueta de categoría): antes se colaba la línea de contacto.
            cands = (node.css("h1::text, h2::text, h3::text, h4::text, h5::text").getall()
                     + node.css("[class*=titul]::text, [class*=title]::text, [class*=nombre]::text").getall()
                     + node.css("a::attr(title)").getall()
                     + node.css("a::text").getall()
                     + node.css("strong::text, b::text").getall()
                     + texts)
            name = next((" ".join(c.split()) for c in cands if _plausible_name(c)), None)
            if not name:
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


def looks_like_category_index(rows: list[dict], html: str) -> bool:
    """True si lo extraído son categorías del menú y no establecimientos.

    Pasa en sitios que listan 'Cabañas / Hoteles / Campings' y esconden los
    alojamientos detrás de cada link.
    """
    if not rows:
        return False
    from .match import norm_name
    cats = sum(1 for r in rows if norm_name(r["name"]) in _CATEGORY_ONLY)
    return cats >= max(2, len(rows) // 2)


def category_links(html: str, base_url: str) -> list[str]:
    """Links de categorías de alojamiento, para entrar un nivel más."""
    from urllib.parse import urljoin

    sel = Selector(text=html)
    out: list[str] = []
    seen: set[str] = set()
    for a in sel.css("a"):
        href = a.attrib.get("href") or ""
        text = " ".join(t.strip() for t in a.css("::text").getall() if t.strip())
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        blob = f"{text} {href}"
        if not _LODGING_HINT.search(blob):
            continue
        url = urljoin(base_url, href)
        if url in seen or url.rstrip("/") == base_url.rstrip("/"):
            continue
        seen.add(url)
        out.append(url)
    return out[:12]


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


def structure_report(html: str, top: int = 12) -> list[dict]:
    """Radiografía del HTML: bloques repetidos con su selector y una muestra.

    Sirve para escribir `selectors` a medida de un sitio sin tener que mirar el
    HTML entero: se listan las 'firmas' (tag + clases) más repetidas con un
    ejemplo de su texto.
    """
    sel = Selector(text=html)
    groups: dict[str, list] = {}
    for node in sel.css("article, li, div, section, tr"):
        cls = (node.attrib.get("class") or "").strip()
        if not cls:
            continue
        sig = f"{node.root.tag}.{'.'.join(sorted(cls.split()))}"
        groups.setdefault(sig, []).append(node)

    out = []
    for sig, nodes in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:top]:
        if len(nodes) < 2:
            continue
        sample = nodes[0]
        texts = [t.strip() for t in sample.css("::text").getall() if t.strip()][:6]
        heads = [t.strip() for t in
                 sample.css("h1::text,h2::text,h3::text,h4::text,h5::text,a::text").getall()
                 if t.strip()][:3]
        out.append({
            "selector": sig.split(".")[0] + "." + ".".join(sig.split(".")[1:]),
            "count": len(nodes),
            "headings": heads,
            "sample_text": " | ".join(texts)[:220],
            "has_link": bool(sample.css("a::attr(href)").get()),
        })
    return out


def _richness(r: dict) -> int:
    return sum(1 for k in ("address", "phone", "email", "website", "capacity", "typology_raw")
               if r.get(k))
