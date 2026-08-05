"""Navegador mínimo para pruebas de conectividad (no scrapea nada)."""
from __future__ import annotations

from .base import BaseScraper


class ProbeScraper(BaseScraper):
    """Sólo abre el navegador; sirve para comprobar con qué IP se sale."""

    platform = "probe"
    wait_selector = None

    def build_url(self, query, checkin, checkout, adults, currency, page=0):
        return query

    def parse(self, html, checkin, checkout):
        return []
