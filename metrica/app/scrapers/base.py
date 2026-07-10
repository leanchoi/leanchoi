"""Clase base de scraper: navegador stealth + reintentos + rate limiting.

Concentra toda la logica "dificil" de vencer las barreras anti-bot, para que
cada scraper concreto (Booking, Airbnb) solo se ocupe de construir la URL y
extraer los datos del HTML ya renderizado.
"""
from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass, field
from typing import Any

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)

from ..config import Settings, get_settings
from .stealth import LAUNCH_ARGS, STEALTH_JS, looks_blocked

logger = logging.getLogger("scraper")


@dataclass
class Listing:
    """Resultado normalizado de un alojamiento (independiente de plataforma)."""

    platform: str
    name: str
    price: float | None = None
    currency: str | None = None
    price_raw: str | None = None
    listing_id: str | None = None
    url: str | None = None
    room_type: str | None = None
    rating: float | None = None
    reviews: int | None = None
    checkin: str | None = None
    checkout: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class BlockedError(RuntimeError):
    """Se detecto una pantalla anti-bot tras agotar los reintentos."""


class BaseScraper:
    platform: str = "base"

    def __init__(self, settings: Settings | None = None, retries: int | None = None,
                 goto_timeout: int | None = None, status_cb=None):
        self.settings = settings or get_settings()
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        # Overrides por corrida (las pruebas interactivas fallan rápido).
        self.retries = retries if retries is not None else self.settings.max_retries
        self.goto_timeout = goto_timeout if goto_timeout is not None else 45000
        self.status_cb = status_cb  # callable(str): reporta "qué está haciendo" en vivo

    def _status(self, msg: str) -> None:
        if self.status_cb:
            try:
                self.status_cb(msg)
            except Exception:  # noqa: BLE001
                pass

    # ---- ciclo de vida del navegador -------------------------------------
    async def __aenter__(self) -> "BaseScraper":
        self._pw = await async_playwright().start()
        launch_kwargs: dict[str, Any] = {
            "headless": self.settings.headless,
            "args": LAUNCH_ARGS,
        }
        if self.settings.playwright_executable_path:
            launch_kwargs["executable_path"] = self.settings.playwright_executable_path
        if self.settings.proxy_url:
            launch_kwargs["proxy"] = self._parse_proxy(self.settings.proxy_url)
        self._browser = await self._pw.chromium.launch(**launch_kwargs)
        return self

    async def __aexit__(self, *exc) -> None:
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()

    @staticmethod
    def _parse_proxy(proxy_url: str) -> dict[str, str]:
        """Convierte una URL de proxy (con o sin credenciales) al formato Playwright."""
        from urllib.parse import urlparse

        parsed = urlparse(proxy_url)
        server = f"{parsed.scheme}://{parsed.hostname}"
        if parsed.port:
            server += f":{parsed.port}"
        out = {"server": server}
        if parsed.username:
            out["username"] = parsed.username
        if parsed.password:
            out["password"] = parsed.password
        return out

    async def _new_context(self) -> BrowserContext:
        """Crea un contexto con huella realista (UA rotado, locale, viewport)."""
        assert self._browser is not None
        ua = random.choice(self.settings.user_agents)
        context = await self._browser.new_context(
            user_agent=ua,
            locale=self.settings.locale,
            timezone_id=self.settings.timezone,
            viewport={"width": 1440, "height": 900},
            device_scale_factor=1,
            is_mobile=False,
            has_touch=False,
            extra_http_headers={
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
                "Sec-Ch-Ua": '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
                "Upgrade-Insecure-Requests": "1",
            },
        )
        await context.add_init_script(STEALTH_JS)
        if self.settings.block_resources:
            await context.route("**/*", self._maybe_block_resource)
        return context

    @staticmethod
    async def _maybe_block_resource(route) -> None:
        """Bloquea recursos pesados (imagenes/fuentes/media) para ir mas rapido."""
        if route.request.resource_type in {"image", "media", "font"}:
            await route.abort()
        else:
            await route.continue_()

    # ---- utilidades de comportamiento humano -----------------------------
    async def _human_pause(self) -> None:
        await asyncio.sleep(random.uniform(self.settings.min_delay, self.settings.max_delay))

    async def _human_scroll(self, page: Page, steps: int = 6) -> None:
        """Scroll gradual para disparar carga perezosa y parecer humano."""
        for _ in range(steps):
            await page.mouse.wheel(0, random.randint(600, 1100))
            await asyncio.sleep(random.uniform(0.4, 1.1))

    # ---- fetch con reintentos y deteccion de bloqueo ---------------------
    async def fetch_rendered(
        self, url: str, wait_selector: str | None = None, scroll: bool = True
    ) -> str:
        """Carga una URL renderizada con reintentos + rotacion ante bloqueo.

        Devuelve el HTML final. Lanza BlockedError si se agota max_retries
        detectando pantallas anti-bot.
        """
        last_exc: Exception | None = None
        for attempt in range(1, self.retries + 1):
            context = await self._new_context()
            page = await context.new_page()
            try:
                self._status(f"{self.platform}: cargando (intento {attempt}/{self.retries})")
                await page.goto(url, wait_until="domcontentloaded", timeout=self.goto_timeout)
                await self._human_pause()
                if wait_selector:
                    try:
                        await page.wait_for_selector(wait_selector, timeout=15000)
                    except Exception:
                        pass  # seguimos: puede estar en el HTML aunque el selector cambie
                if scroll:
                    await self._human_scroll(page)
                    await self._human_pause()

                html = await page.content()
                title = await page.title()
                if looks_blocked(html, title):
                    logger.warning(
                        "[%s] bloqueo detectado (intento %d/%d) en %s",
                        self.platform, attempt, self.retries, url,
                    )
                    self._status(f"{self.platform}: bloqueo detectado, reintentando…")
                    last_exc = BlockedError(f"Pantalla anti-bot en {url}")
                    await context.close()
                    await asyncio.sleep(2 ** attempt + random.random())  # backoff
                    continue
                await context.close()
                return html
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                logger.warning(
                    "[%s] error intento %d/%d: %s", self.platform, attempt,
                    self.retries, exc,
                )
                await context.close()
                await asyncio.sleep(2 ** attempt + random.random())
        raise last_exc or BlockedError(f"No se pudo cargar {url}")

    # ---- API que implementa cada scraper concreto ------------------------
    def build_url(self, query: str, checkin: str, checkout: str, adults: int,
                  currency: str, page: int = 0) -> str:
        raise NotImplementedError

    def parse(self, html: str, checkin: str, checkout: str) -> list[Listing]:
        raise NotImplementedError

    async def search(
        self, query: str, checkin: str, checkout: str, adults: int,
        currency: str, max_pages: int = 1,
    ) -> list[Listing]:
        """Recorre paginas de resultados y devuelve listings normalizados."""
        results: list[Listing] = []
        for page_idx in range(max_pages):
            url = self.build_url(query, checkin, checkout, adults, currency, page_idx)
            html = await self.fetch_rendered(url, wait_selector=self.wait_selector)
            page_results = self.parse(html, checkin, checkout)
            # La busqueda se pidio en una moneda concreta: si un precio viene sin
            # simbolo de moneda, asumimos la solicitada.
            for r in page_results:
                if r.price is not None and not r.currency:
                    r.currency = currency
            logger.info("[%s] pagina %d -> %d resultados", self.platform, page_idx, len(page_results))
            if not page_results:
                break  # sin resultados: no seguimos paginando
            results.extend(page_results)
            if page_idx < max_pages - 1:
                await self._human_pause()
        return results

    wait_selector: str | None = None
