"""Scraper de Booking.com.

Booking renderiza las tarjetas de propiedad con atributos data-testid que son
razonablemente estables en el tiempo (mucho mas que los nombres de clase). La
estrategia primaria es DOM sobre esos atributos; si Booking cambia el markup,
los selectores estan centralizados abajo para ajustarlos rapido.
"""
from __future__ import annotations

import logging
import re
from urllib.parse import urlencode

from parsel import Selector  # type: ignore

from .base import BaseScraper, Listing
from .util import parse_int, parse_price, parse_rating

logger = logging.getLogger("scraper.booking")

# Selectores centralizados. Si Booking cambia el markup, se ajustan aqui.
SEL_CARD = '[data-testid="property-card"]'
SEL_TITLE = '[data-testid="title"]'
SEL_TITLE_LINK = 'a[data-testid="title-link"]'
SEL_PRICE = '[data-testid="price-and-discounted-price"]'
SEL_REVIEW_SCORE = '[data-testid="review-score"]'
SEL_UNIT = '[data-testid="recommended-units"]'
SEL_ADDRESS = '[data-testid="address"]'


class BookingScraper(BaseScraper):
    platform = "booking"
    wait_selector = SEL_CARD

    def build_url(self, query, checkin, checkout, adults, currency, page=0):
        params = {
            "ss": query,
            "checkin": checkin,
            "checkout": checkout,
            "group_adults": adults,
            "group_children": 0,
            "no_rooms": 1,
            "selected_currency": currency,
            "offset": page * 25,  # Booking pagina de 25 en 25
        }
        return "https://www.booking.com/searchresults.html?" + urlencode(params)

    def parse(self, html: str, checkin: str, checkout: str) -> list[Listing]:
        sel = Selector(text=html)
        cards = sel.css(SEL_CARD)
        listings: list[Listing] = []
        for card in cards:
            name = card.css(f"{SEL_TITLE}::text").get() or card.css(f"{SEL_TITLE_LINK}::text").get()
            if not name:
                continue
            name = name.strip()

            href = card.css(f"{SEL_TITLE_LINK}::attr(href)").get()
            url = self._absolute(href)
            listing_id = self._extract_id(href)

            price_raw = self._first_text(card, SEL_PRICE)
            price, currency = parse_price(price_raw)

            score_raw = self._first_text(card, SEL_REVIEW_SCORE)
            rating = parse_rating(score_raw)
            reviews = self._extract_reviews(card)

            room_type = self._first_text(card, SEL_UNIT)
            locality = self._first_text(card, SEL_ADDRESS)

            listings.append(
                Listing(
                    platform=self.platform,
                    name=name,
                    price=price,
                    currency=currency,
                    price_raw=price_raw.strip() if price_raw else None,
                    listing_id=listing_id,
                    url=url,
                    room_type=room_type,
                    locality=locality,
                    rating=rating,
                    reviews=reviews,
                    checkin=checkin,
                    checkout=checkout,
                )
            )
        return listings

    # ---- helpers ---------------------------------------------------------
    @staticmethod
    def _first_text(card, selector: str) -> str | None:
        parts = card.css(f"{selector} ::text").getall()
        text = " ".join(p.strip() for p in parts if p.strip())
        return text or None

    @staticmethod
    def _absolute(href: str | None) -> str | None:
        if not href:
            return None
        if href.startswith("http"):
            return href.split("?")[0]
        return "https://www.booking.com" + href.split("?")[0]

    @staticmethod
    def _extract_id(href: str | None) -> str | None:
        if not href:
            return None
        m = re.search(r"/hotel/[^/]+/([^./]+)\.", href)
        return m.group(1) if m else None

    @staticmethod
    def _extract_reviews(card) -> int | None:
        # El bloque de review-score suele contener "1.234 comentarios"
        block = card.css(f"{SEL_REVIEW_SCORE} ::text").getall()
        for txt in block:
            if re.search(r"coment|review|opinione|bewert", txt, re.I):
                n = parse_int(txt)
                if n:
                    return n
        return None
