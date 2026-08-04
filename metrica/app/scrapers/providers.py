"""Proveedores de datos: de dónde salen los alojamientos de cada plataforma.

CAMBIO DE ESTRATEGIA. Durante meses tratamos "scrapear con nuestro navegador"
como la única forma de obtener datos de Airbnb, y cada vez que la plataforma
cambiaba algo había que parchear el extractor. El diagnóstico final mostró que el
problema no es el extractor: desde una IP de datacenter, Airbnb devuelve la
cáscara de la página SIN resultados —sin captcha y sin error— así que no hay
parser que pueda arreglarlo.

La respuesta no es un parser mejor: es dejar de depender de una sola fuente. Cada
plataforma puede alimentarse de:

  browser  -> nuestro Playwright (gratis; para Airbnb necesita proxy residencial)
  apify    -> un actor de Apify (ellos resuelven proxies y desbloqueo; se paga
              por resultado, no hay parser que mantener)
  http     -> cualquier API JSON de terceros, configurable por variables

Se elige por configuración, sin tocar código. Si mañana Airbnb vuelve a mutar,
se cambia el proveedor en vez de esperar a que yo reescriba un extractor.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import Settings, get_settings
from .base import Listing

logger = logging.getLogger("metrica.providers")


class BaseProvider:
    """Interfaz común: se usa igual sin importar de dónde vengan los datos."""

    name = "base"

    def __init__(self, platform: str, settings: Settings | None = None, **kw: Any) -> None:
        self.platform = platform
        self.settings = settings or get_settings()
        self.diag: dict = {"provider": self.name, "pages": 0, "parsed": 0,
                           "blocked": 0, "html_len": 0, "launched": False,
                           "last_error": None}

    async def __aenter__(self) -> "BaseProvider":
        return self

    async def __aexit__(self, *exc) -> None:
        return None

    async def search(self, query: str, checkin: str, checkout: str, adults: int,
                     currency: str, max_pages: int = 1) -> list[Listing]:
        raise NotImplementedError


class BrowserProvider(BaseProvider):
    """Nuestro scraper con Playwright (el camino de siempre)."""

    name = "browser"

    def __init__(self, platform: str, settings: Settings | None = None,
                 retries: int | None = None, goto_timeout: int | None = None,
                 status_cb=None, **kw: Any) -> None:
        super().__init__(platform, settings)
        from . import SCRAPERS
        self._scraper = SCRAPERS[platform](
            settings=self._platform_settings(), retries=retries,
            goto_timeout=goto_timeout, status_cb=status_cb)
        # Compartir el diagnóstico desde el arranque: si el navegador ni inicia,
        # el error tiene que llegar igual al runner.
        self.diag = self._scraper.diag
        self.diag["provider"] = self.name

    def _platform_settings(self) -> Settings:
        """Permite un proxy DISTINTO por plataforma.

        Booking anda perfecto sin proxy; Airbnb lo necesita. Separarlos evita
        pagar ancho de banda residencial por el tráfico que no lo precisa.
        """
        s = self.settings
        override = getattr(s, f"proxy_url_{self.platform}", None)
        if not override:
            return s
        clone = s.model_copy()
        clone.proxy_url = override
        return clone

    async def __aenter__(self) -> "BrowserProvider":
        await self._scraper.__aenter__()
        self.diag = self._scraper.diag
        self.diag["provider"] = self.name
        return self

    async def __aexit__(self, *exc) -> None:
        await self._scraper.__aexit__(*exc)

    async def search(self, query, checkin, checkout, adults, currency, max_pages=1):
        return await self._scraper.search(query, checkin, checkout, adults, currency, max_pages)


class ApifyProvider(BaseProvider):
    """Datos vía un actor de Apify (o cualquier API compatible).

    Apify corre el scraping con sus propios proxies residenciales y devuelve
    JSON. Nosotros no mantenemos selectores: si Airbnb cambia, lo arreglan ellos.
    Se paga por resultado, así que conviene limitar el alcance del relevamiento.
    """

    name = "apify"

    async def search(self, query, checkin, checkout, adults, currency, max_pages=1):
        s = self.settings
        if not s.apify_token:
            self.diag["last_error"] = "falta APIFY_TOKEN"
            return []
        actor = s.apify_actor or "tri_angle~airbnb-scraper"
        url = f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items"
        payload = {
            "locationQueries": [query], "locale": "es-AR", "currency": currency,
            "checkIn": checkin, "checkOut": checkout, "adults": adults,
            "maxItems": max(20, 20 * max_pages),
        }
        self.diag["launched"] = True
        try:
            async with httpx.AsyncClient(timeout=s.apify_timeout) as client:
                r = await client.post(url, params={"token": s.apify_token}, json=payload)
                if r.status_code >= 400:
                    self.diag["last_error"] = f"apify HTTP {r.status_code}: {r.text[:200]}"
                    return []
                items = r.json()
        except Exception as exc:  # noqa: BLE001
            self.diag["last_error"] = f"{type(exc).__name__}: {exc}"[:300]
            return []

        self.diag["pages"] += 1
        out = [l for l in (self._to_listing(it, checkin, checkout) for it in items or []) if l]
        self.diag["parsed"] += len(out)
        self.diag["selector"] = "apify"
        logger.info("[%s/apify] %s -> %d resultados", self.platform, query, len(out))
        return out

    # Los actores de Apify no comparten un esquema único: se resuelve por FORMA,
    # igual que la capa estructural del scraper propio.
    _ID = ("id", "listingId", "roomId", "listing_id", "room_id")
    _NAME = ("name", "title", "listingTitle", "listing_name")
    _PRICE = ("price", "pricing", "rate", "total", "pricePerNight", "price_per_night")

    def _to_listing(self, item: dict, checkin: str, checkout: str) -> Listing | None:
        if not isinstance(item, dict):
            return None
        lid = next((str(item[k]) for k in self._ID if item.get(k) not in (None, "")), None)
        name = next((str(item[k]) for k in self._NAME
                     if isinstance(item.get(k), str) and item[k].strip()), None)
        if not (lid and name):
            return None
        price = self._price_of(item)
        rating = item.get("rating") or item.get("stars") or item.get("avgRating")
        if isinstance(rating, dict):
            rating = rating.get("value") or rating.get("guestSatisfaction")
        url = item.get("url") or item.get("listingUrl") or f"https://www.airbnb.com/rooms/{lid}"
        return Listing(
            platform=self.platform, name=name.strip()[:400], price=price,
            currency=item.get("currency"), listing_id=str(lid).split("/")[-1],
            url=url, room_type=item.get("roomType") or item.get("propertyType"),
            property_type=item.get("propertyType") or item.get("roomType"),
            locality=(item.get("city") or item.get("location") or None),
            rating=float(rating) if isinstance(rating, (int, float)) else None,
            reviews=item.get("reviewsCount") or item.get("numberOfReviews"),
            checkin=checkin, checkout=checkout,
        )

    @classmethod
    def _price_of(cls, item: dict) -> float | None:
        from .util import parse_price
        for k in cls._PRICE:
            v = item.get(k)
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
            if isinstance(v, str) and any(c.isdigit() for c in v):
                p, _ = parse_price(v)
                if p:
                    return p
            if isinstance(v, dict):
                for kk in ("total", "amount", "value", "rate", "price", "nightly"):
                    vv = v.get(kk)
                    if isinstance(vv, (int, float)) and vv > 0:
                        return float(vv)
                    if isinstance(vv, str) and any(c.isdigit() for c in vv):
                        p, _ = parse_price(vv)
                        if p:
                            return p
        return None


class HttpProvider(BaseProvider):
    """API JSON genérica de terceros, configurada por variables de entorno.

    Permite enchufar cualquier servicio (StayAPI, SearchApi, uno propio) sin
    escribir código: se define la URL con marcadores y de dónde sale la lista.
    """

    name = "http"

    async def search(self, query, checkin, checkout, adults, currency, max_pages=1):
        s = self.settings
        tpl = s.airbnb_api_url
        if not tpl:
            self.diag["last_error"] = "falta AIRBNB_API_URL"
            return []
        url = (tpl.replace("{query}", query).replace("{checkin}", checkin)
               .replace("{checkout}", checkout).replace("{adults}", str(adults))
               .replace("{currency}", currency))
        headers = {}
        if s.airbnb_api_key:
            headers[s.airbnb_api_key_header or "Authorization"] = s.airbnb_api_key
        self.diag["launched"] = True
        try:
            async with httpx.AsyncClient(timeout=s.apify_timeout) as client:
                r = await client.get(url, headers=headers)
                if r.status_code >= 400:
                    self.diag["last_error"] = f"HTTP {r.status_code}: {r.text[:200]}"
                    return []
                data = r.json()
        except Exception as exc:  # noqa: BLE001
            self.diag["last_error"] = f"{type(exc).__name__}: {exc}"[:300]
            return []
        items = data
        for key in (s.airbnb_api_path or "").split("."):
            if key and isinstance(items, dict):
                items = items.get(key, [])
        conv = ApifyProvider(self.platform, self.settings)
        out = [l for l in (conv._to_listing(it, checkin, checkout)
                           for it in (items or [])) if l]
        self.diag["pages"] += 1
        self.diag["parsed"] += len(out)
        self.diag["selector"] = "http"
        return out


PROVIDERS = {"browser": BrowserProvider, "apify": ApifyProvider, "http": HttpProvider}


def provider_name_for(platform: str, settings: Settings | None = None) -> str:
    s = settings or get_settings()
    return (getattr(s, f"{platform}_provider", None) or "browser").lower()


def get_provider(platform: str, settings: Settings | None = None, **kw: Any) -> BaseProvider:
    """Devuelve el proveedor configurado para esa plataforma."""
    s = settings or get_settings()
    name = provider_name_for(platform, s)
    cls = PROVIDERS.get(name)
    if cls is None:
        logger.warning("Proveedor desconocido %r para %s; se usa el navegador", name, platform)
        cls = BrowserProvider
    if cls is BrowserProvider:
        return cls(platform, s, **kw)
    return cls(platform, s)
