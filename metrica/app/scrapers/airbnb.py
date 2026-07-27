"""Scraper de Airbnb.

Airbnb ofusca los nombres de clase CSS, así que el DOM plano es frágil. La
estrategia primaria es extraer el/los blob(s) JSON que Airbnb embebe en la
página (scripts application/json con el estado de la búsqueda). Se recorre ese
JSON de forma resiliente buscando objetos de listing. Como respaldo, se usa un
fallback DOM basado en los enlaces /rooms/ (que persisten aunque cambien las
clases y los data-testid).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Iterator
from urllib.parse import quote, urlencode

from parsel import Selector  # type: ignore

from .base import BaseScraper, Listing
from .stealth import looks_blocked
from .util import parse_price, parse_rating

logger = logging.getLogger("scraper.airbnb")

# Amplio: cualquier <script type="application/json"> + los data-state conocidos.
SEL_JSON = ('script[type="application/json"]::text, '
            'script[id^="data-deferred-state"]::text, '
            'script#data-state::text')
SEL_CARD = '[data-testid="card-container"]'
SEL_CARD_TITLE = '[data-testid="listing-card-title"]'

_PRICE_RE = re.compile(r"[€$£¥]\s?\d|\d[\d.,]*\s?(?:USD|ARS|\$)")
_ROOM_RE = re.compile(r"/rooms/(?:plus/)?(\d+)")


class AirbnbScraper(BaseScraper):
    platform = "airbnb"
    wait_selector = SEL_CARD

    def build_url(self, query, checkin, checkout, adults, currency, page=0):
        params = {
            "checkin": checkin,
            "checkout": checkout,
            "adults": adults,
            "currency": currency,
            "items_offset": page * 18,
            "search_type": "pagination",
        }
        return f"https://www.airbnb.com/s/{quote(query)}/homes?" + urlencode(params)

    @staticmethod
    def _is_api(url: str) -> bool:
        return ("StaysSearch" in url or "/api/v3/" in url
                or "search_results" in url or "StaysMapS" in url)

    async def search(self, query, checkin, checkout, adults, currency, max_pages=1):
        """Override: intercepta la API interna de Airbnb (XHR JSON) y, como
        respaldo, parsea el HTML embebido/DOM. Es lo que hace que traiga datos:
        los resultados de Airbnb llegan por API después del render, no en el HTML."""
        results: list[Listing] = []
        seen: set[str] = set()
        for page_idx in range(max_pages):
            url = self.build_url(query, checkin, checkout, adults, currency, page_idx)
            context = await self._new_context()
            page = await context.new_page()
            captured: list = []
            page.on("response", lambda r: captured.append(r) if self._is_api(r.url) else None)
            page_results: list[Listing] = []
            try:
                self._status(f"airbnb: cargando resultados (pág {page_idx + 1})")
                await page.goto(url, wait_until="domcontentloaded", timeout=self.goto_timeout)
                await self._human_pause()
                await self._human_scroll(page)  # dispara la carga de la API
                await self._human_pause()
                html = await page.content()
                self.diag["pages"] += 1
                self.diag["html_len"] = max(self.diag["html_len"], len(html))
                if looks_blocked(html, await page.title()):
                    self.diag["blocked"] += 1
                # 1) API interceptada (lo más confiable)
                for resp in captured:
                    try:
                        data = await resp.json()
                    except Exception:  # noqa: BLE001
                        continue
                    for node in self._find_listing_nodes(data):
                        item = self._node_to_listing(node, checkin, checkout)
                        if item:
                            page_results.append(item)
                # 2) respaldo: HTML embebido / DOM
                if not page_results:
                    page_results = self.parse(html, checkin, checkout)
                self.diag["parsed"] += len(page_results)
                logger.info("[airbnb] pág %d -> %d (api=%d)", page_idx, len(page_results), len(captured))
            except Exception as exc:  # noqa: BLE001
                self.diag["last_error"] = f"{type(exc).__name__}: {exc}"[:400]
                logger.warning("[airbnb] error pág %d: %s", page_idx, exc)
            finally:
                await context.close()

            new = 0
            for r in page_results:
                if r.price is not None and not r.currency:
                    r.currency = currency
                if r.listing_id and r.listing_id in seen:
                    continue
                if r.listing_id:
                    seen.add(r.listing_id)
                results.append(r)
                new += 1
            if not new:
                break
            if page_idx < max_pages - 1:
                await self._human_pause()
        return results

    def parse(self, html: str, checkin: str, checkout: str) -> list[Listing]:
        listings = self._parse_from_json(html, checkin, checkout)
        if listings:
            return listings
        logger.info("[airbnb] JSON sin resultados, probando fallback DOM")
        return self._parse_from_dom(html, checkin, checkout)

    # ---- diagnóstico: por qué salió lo que salió --------------------------
    def debug_signals(self, html: str) -> dict:
        sel = Selector(text=html)
        blobs = [b for b in sel.css(SEL_JSON).getall() if b and b.strip()]
        parsed, nodes = 0, 0
        for b in blobs:
            try:
                data = json.loads(b)
            except (json.JSONDecodeError, TypeError):
                continue
            parsed += 1
            nodes += sum(1 for _ in self._find_listing_nodes(data))
        room_links = len(set(_ROOM_RE.findall(html)))
        cards = len(sel.css(SEL_CARD))
        title = (sel.css("title::text").get() or "").strip()[:120]
        return {"json_scripts": len(blobs), "json_parsed": parsed,
                "json_listing_nodes": nodes, "dom_cards": cards,
                "room_links": room_links, "title": title}

    # ---- estrategia primaria: JSON embebido ------------------------------
    def _parse_from_json(self, html: str, checkin: str, checkout: str) -> list[Listing]:
        sel = Selector(text=html)
        listings: list[Listing] = []
        seen: set[str] = set()
        for blob in sel.css(SEL_JSON).getall():
            if not blob or '"listing"' not in blob and '"rooms"' not in blob \
                    and "StaySearch" not in blob and "demandStayListing" not in blob:
                continue  # descartar rápido los scripts que no son de búsqueda
            try:
                data = json.loads(blob)
            except (json.JSONDecodeError, TypeError):
                continue
            for node in self._find_listing_nodes(data):
                item = self._node_to_listing(node, checkin, checkout)
                if item and (not item.listing_id or item.listing_id not in seen):
                    if item.listing_id:
                        seen.add(item.listing_id)
                    listings.append(item)
        return listings

    def _find_listing_nodes(self, data: Any) -> Iterator[dict]:
        """Recorre el JSON y devuelve nodos que parezcan una tarjeta de listing."""
        stack = [data]
        while stack:
            cur = stack.pop()
            if isinstance(cur, dict):
                listing = cur.get("listing") or cur.get("demandStayListing")
                typename = str(cur.get("__typename", ""))
                if isinstance(listing, dict) and (listing.get("id") or listing.get("listingId")):
                    yield cur
                elif "StaySearchResult" in typename or "StayListing" in typename:
                    yield cur
                elif (cur.get("id") or cur.get("listingId")) and \
                        (cur.get("name") or cur.get("title")) and self._has_price(cur):
                    yield cur
                stack.extend(cur.values())
            elif isinstance(cur, list):
                stack.extend(cur)

    @staticmethod
    def _has_price(node: dict) -> bool:
        for k in ("structuredDisplayPrice", "pricingQuote", "price", "priceString"):
            if k in node:
                return True
        return False

    def _node_to_listing(self, node: dict, checkin: str, checkout: str) -> Listing | None:
        listing = node.get("listing") or node.get("demandStayListing")
        if not isinstance(listing, dict):
            listing = node
        lid = str(listing.get("id") or listing.get("listingId") or "").split(":")[-1] or None
        name = (listing.get("name") or listing.get("title")
                or listing.get("localizedCityName") or listing.get("localizedName"))
        if not name:
            return None

        price_raw = self._extract_price_str(node)
        price, currency = parse_price(price_raw)
        rating = self._extract_rating(listing)

        url = f"https://www.airbnb.com/rooms/{lid}" if lid else None
        room_type = (listing.get("roomTypeCategory") or listing.get("pdpType")
                     or listing.get("spaceType"))
        locality = (listing.get("localizedCityName") or listing.get("localizedCity")
                    or listing.get("city") or listing.get("localizedName"))

        return Listing(
            platform=self.platform, name=str(name).strip(), price=price, currency=currency,
            price_raw=price_raw, listing_id=lid, url=url, room_type=room_type,
            locality=(str(locality).strip() if locality else None),
            rating=rating, checkin=checkin, checkout=checkout,
        )

    @staticmethod
    def _extract_price_str(node: dict) -> str | None:
        candidates = [
            ("structuredDisplayPrice", "primaryLine", "price"),
            ("structuredDisplayPrice", "primaryLine", "discountedPrice"),
            ("structuredDisplayPrice", "primaryLine", "accessibilityLabel"),
            ("pricingQuote", "structuredStayDisplayPrice", "primaryLine", "price"),
            ("pricingQuote", "rateWithServiceFee", "amountFormatted"),
        ]
        for path in candidates:
            cur: Any = node
            for key in path:
                cur = cur.get(key) if isinstance(cur, dict) else None
                if cur is None:
                    break
            if isinstance(cur, str) and any(c.isdigit() for c in cur):
                return cur
        # Búsqueda genérica en el subárbol
        stack = [node]
        while stack:
            cur = stack.pop()
            if isinstance(cur, str) and _PRICE_RE.search(cur):
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

    # ---- fallback: DOM por enlaces /rooms/ --------------------------------
    def _parse_from_dom(self, html: str, checkin: str, checkout: str) -> list[Listing]:
        sel = Selector(text=html)
        listings: list[Listing] = []
        seen: set[str] = set()

        # 1) tarjetas por data-testid (si existen)
        for card in sel.css(SEL_CARD):
            href = card.css("a::attr(href)").get() or ""
            m = _ROOM_RE.search(href)
            lid = m.group(1) if m else None
            if not lid or lid in seen:
                continue
            name = (card.css(f"{SEL_CARD_TITLE}::text").get()
                    or card.css("meta[itemprop='name']::attr(content)").get()
                    or card.css("a::attr(aria-label)").get())
            price_raw = next((t.strip() for t in card.css("span::text").getall()
                              if _PRICE_RE.search(t)), None)
            price, currency = parse_price(price_raw)
            seen.add(lid)
            listings.append(Listing(
                platform=self.platform, name=(name or f"Listing {lid}").strip(),
                price=price, currency=currency, price_raw=price_raw, listing_id=lid,
                url=f"https://www.airbnb.com/rooms/{lid}", checkin=checkin, checkout=checkout,
            ))
        if listings:
            return listings

        # 2) último recurso: cualquier enlace /rooms/ con su aria-label
        for a in sel.css("a[href*='/rooms/']"):
            href = a.attrib.get("href", "")
            m = _ROOM_RE.search(href)
            lid = m.group(1) if m else None
            if not lid or lid in seen:
                continue
            name = a.attrib.get("aria-label") or (a.css("::text").get() or "").strip()
            seen.add(lid)
            listings.append(Listing(
                platform=self.platform, name=(name or f"Listing {lid}").strip()[:200],
                listing_id=lid, url=f"https://www.airbnb.com/rooms/{lid}",
                checkin=checkin, checkout=checkout,
            ))
        return listings
