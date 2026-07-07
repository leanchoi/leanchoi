"""Scraper de Airbnb.

Airbnb ofusca los nombres de clase CSS, asi que el DOM plano es fragil. La
estrategia primaria y mas robusta es extraer el blob JSON que Airbnb embebe en
la propia pagina (<script id="data-deferred-state-*">), que contiene los
resultados de busqueda estructurados. Recorremos ese JSON de forma resiliente
buscando los objetos de listing, con un fallback a DOM por data-testid.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Iterator
from urllib.parse import quote, urlencode

from parsel import Selector  # type: ignore

from .base import BaseScraper, Listing
from .util import parse_price, parse_rating

logger = logging.getLogger("scraper.airbnb")

SEL_JSON_STATE = 'script[id^="data-deferred-state"]::text, script#data-state::text'
SEL_CARD = '[data-testid="card-container"]'
SEL_CARD_TITLE = '[data-testid="listing-card-title"]'


class AirbnbScraper(BaseScraper):
    platform = "airbnb"
    wait_selector = SEL_CARD

    def build_url(self, query, checkin, checkout, adults, currency, page=0):
        # Airbnb pagina con un cursor opaco; para la version light usamos
        # items_offset (18 por pagina) que sigue funcionando en la URL.
        params = {
            "checkin": checkin,
            "checkout": checkout,
            "adults": adults,
            "currency": currency,
            "items_offset": page * 18,
        }
        return f"https://www.airbnb.com/s/{quote(query)}/homes?" + urlencode(params)

    def parse(self, html: str, checkin: str, checkout: str) -> list[Listing]:
        listings = self._parse_from_json(html, checkin, checkout)
        if listings:
            return listings
        logger.info("[airbnb] JSON sin resultados, probando fallback DOM")
        return self._parse_from_dom(html, checkin, checkout)

    # ---- estrategia primaria: JSON embebido ------------------------------
    def _parse_from_json(self, html: str, checkin: str, checkout: str) -> list[Listing]:
        sel = Selector(text=html)
        blobs = sel.css(SEL_JSON_STATE).getall()
        listings: list[Listing] = []
        seen: set[str] = set()
        for blob in blobs:
            try:
                data = json.loads(blob)
            except (json.JSONDecodeError, TypeError):
                continue
            for node in self._find_listing_nodes(data):
                item = self._node_to_listing(node, checkin, checkout)
                if item and item.listing_id not in seen:
                    if item.listing_id:
                        seen.add(item.listing_id)
                    listings.append(item)
        return listings

    def _find_listing_nodes(self, data: Any) -> Iterator[dict]:
        """Recorre el JSON y devuelve nodos que parezcan una tarjeta de listing.

        Un nodo valido es un dict que contiene un sub-dict 'listing' con 'id',
        o que expone directamente los campos tipicos de un resultado de stay.
        """
        stack = [data]
        while stack:
            cur = stack.pop()
            if isinstance(cur, dict):
                listing = cur.get("listing")
                if isinstance(listing, dict) and (listing.get("id") or listing.get("listingId")):
                    yield cur
                elif cur.get("__typename") in {"StaySearchResult", "DemandStaySearchResult"}:
                    yield cur
                stack.extend(cur.values())
            elif isinstance(cur, list):
                stack.extend(cur)

    def _node_to_listing(self, node: dict, checkin: str, checkout: str) -> Listing | None:
        listing = node.get("listing") if isinstance(node.get("listing"), dict) else node
        lid = str(listing.get("id") or listing.get("listingId") or "").split(":")[-1] or None
        name = listing.get("name") or listing.get("title") or listing.get("localizedCityName")
        if not name:
            return None

        price_raw = self._extract_price_str(node)
        price, currency = parse_price(price_raw)
        rating = self._extract_rating(listing)

        url = f"https://www.airbnb.com/rooms/{lid}" if lid else None
        room_type = listing.get("roomTypeCategory") or listing.get("pdpType")

        return Listing(
            platform=self.platform,
            name=str(name).strip(),
            price=price,
            currency=currency,
            price_raw=price_raw,
            listing_id=lid,
            url=url,
            room_type=room_type,
            rating=rating,
            checkin=checkin,
            checkout=checkout,
        )

    @staticmethod
    def _extract_price_str(node: dict) -> str | None:
        """Busca de forma resiliente un string de precio dentro del nodo."""
        # Rutas conocidas primero
        candidates = [
            ("structuredDisplayPrice", "primaryLine", "price"),
            ("structuredDisplayPrice", "primaryLine", "accessibilityLabel"),
            ("pricingQuote", "structuredStayDisplayPrice", "primaryLine", "price"),
        ]
        for path in candidates:
            cur: Any = node
            for key in path:
                if isinstance(cur, dict):
                    cur = cur.get(key)
                else:
                    cur = None
                    break
            if isinstance(cur, str) and any(c.isdigit() for c in cur):
                return cur

        # Busqueda generica: primer string tipo precio en el subarbol
        price_re = re.compile(r"[€$£¥]\s?\d")
        stack = [node]
        while stack:
            cur = stack.pop()
            if isinstance(cur, str):
                if price_re.search(cur):
                    return cur
            elif isinstance(cur, dict):
                stack.extend(cur.values())
            elif isinstance(cur, list):
                stack.extend(cur)
        return None

    @staticmethod
    def _extract_rating(listing: dict) -> float | None:
        for key in ("avgRatingLocalized", "avgRating", "starRating", "avgRatingA11yLabel"):
            val = listing.get(key)
            if val is not None:
                r = parse_rating(str(val))
                if r is not None:
                    return r
        return None

    # ---- fallback: DOM por data-testid -----------------------------------
    def _parse_from_dom(self, html: str, checkin: str, checkout: str) -> list[Listing]:
        sel = Selector(text=html)
        listings: list[Listing] = []
        for card in sel.css(SEL_CARD):
            name = card.css(f"{SEL_CARD_TITLE}::text").get()
            if not name:
                # a veces el titulo esta en un aria-label del enlace
                name = card.css("a::attr(aria-label)").get()
            if not name:
                continue
            href = card.css("a::attr(href)").get() or ""
            lid_match = re.search(r"/rooms/(\d+)", href)
            lid = lid_match.group(1) if lid_match else None

            # precio: cualquier texto con simbolo de moneda
            price_raw = None
            for txt in card.css("span::text").getall():
                if re.search(r"[€$£¥]\s?\d", txt):
                    price_raw = txt.strip()
                    break
            price, currency = parse_price(price_raw)

            listings.append(
                Listing(
                    platform=self.platform,
                    name=name.strip(),
                    price=price,
                    currency=currency,
                    price_raw=price_raw,
                    listing_id=lid,
                    url=f"https://www.airbnb.com/rooms/{lid}" if lid else None,
                    checkin=checkin,
                    checkout=checkout,
                )
            )
        return listings
