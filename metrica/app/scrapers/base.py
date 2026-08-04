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
    locality: str | None = None        # localidad/ciudad reportada por la plataforma
    property_type: str | None = None   # tipo de propiedad estructurado (si la plataforma lo da)
    rating: float | None = None
    reviews: int | None = None
    checkin: str | None = None
    checkout: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class BlockedError(RuntimeError):
    """Se detecto una pantalla anti-bot tras agotar los reintentos."""


def classify_outcome(found: int, diag: dict) -> tuple[str, str | None]:
    """Traduce el diagnóstico de una corrida a (outcome, detalle legible).

    Distinguir estos casos es lo que permite REPARAR en vez de adivinar:
      ok      -> hubo resultados
      blocked -> se detectó pantalla anti-bot (hace falta proxy residencial)
      error   -> excepción real (navegador caído, timeout, red)
      empty   -> cargó bien y sin bloqueo, pero no se parseó nada
                 (cambio de markup en la plataforma o sin disponibilidad)
    """
    if found:
        return "ok", None
    err = diag.get("last_error") or ""
    # Agotamiento de recursos del CONTENEDOR (procesos/descriptores/memoria).
    # No es la plataforma: es el servidor. Se distingue para no mandar a buscar
    # un proxy cuando lo que hay que hacer es liberar recursos.
    if ("BlockingIOError" in err or "Errno 11" in err or "Errno 24" in err
            or "Cannot allocate memory" in err or "Resource temporarily unavailable" in err):
        return "resources", ("el SERVIDOR se quedó sin recursos (procesos/descriptores). "
                             "Reiniciá el contenedor y corré 'doctor'; no es un bloqueo "
                             "de la plataforma")
    if not diag.get("launched"):
        return "error", diag.get("last_error") or "el navegador no pudo iniciarse"
    if diag.get("blocked"):
        return "blocked", ("pantalla anti-bot detectada; la IP del servidor está "
                           "bloqueada — hace falta PROXY_URL residencial")
    if diag.get("last_error"):
        return "error", diag["last_error"]
    if diag.get("pages") and diag.get("html_len"):
        # ¿Había datos de alojamientos en la página y no supimos leerlos, o la
        # plataforma directamente no devolvió ninguno? Son problemas opuestos.
        signals = (diag.get("room_links", 0) or 0) + (diag.get("json_nodes", 0) or 0) \
            + (diag.get("dom_cards", 0) or 0)
        if signals > 0:
            return "empty", (f"la página traía datos de alojamientos "
                             f"({diag.get('room_links', 0)} enlaces /rooms/, "
                             f"{diag.get('dom_cards', 0)} tarjetas) pero el parser no los "
                             f"extrajo: CAMBIÓ EL MARKUP — hay que actualizar el extractor")
        return "no_results", (f"la página cargó ({diag['html_len']} bytes) sin bloqueo visible "
                              f"pero SIN un solo alojamiento: la plataforma devolvió resultados "
                              f"vacíos (bloqueo silencioso por IP de datacenter, o sin "
                              f"disponibilidad real para esas fechas)")
    return "error", "no se obtuvo respuesta de la plataforma"


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
        # Diagnóstico de la corrida: permite distinguir BLOQUEO real de "no parseó
        # nada" (cambio de markup) o de un fallo del navegador. Sin esto, todo
        # termina reportándose como "blocked" y no se puede reparar.
        self.diag: dict = {"pages": 0, "blocked": 0, "parsed": 0, "last_error": None,
                           "html_len": 0, "launched": False, "consent": None}

    def _status(self, msg: str) -> None:
        if self.status_cb:
            try:
                self.status_cb(msg)
            except Exception:  # noqa: BLE001
                pass

    # ---- ciclo de vida del navegador -------------------------------------
    async def __aenter__(self) -> "BaseScraper":
        # OJO: si algo falla acá, `async with` NO llama a __aexit__, así que hay
        # que limpiar a mano. Sin esto, cada arranque fallido dejaba colgado el
        # proceso driver de Playwright y, tras miles de noches, el contenedor se
        # quedaba sin procesos/descriptores: BlockingIOError [Errno 11].
        self._pw = await async_playwright().start()
        try:
            launch_kwargs: dict[str, Any] = {
                "headless": self.settings.headless,
                "args": LAUNCH_ARGS,
            }
            if self.settings.playwright_executable_path:
                launch_kwargs["executable_path"] = self.settings.playwright_executable_path
            if self.settings.proxy_url:
                launch_kwargs["proxy"] = self._parse_proxy(self.settings.proxy_url)
            self._browser = await self._pw.chromium.launch(**launch_kwargs)
        except BaseException as exc:
            self.diag["last_error"] = f"navegador no pudo iniciar: {type(exc).__name__}: {exc}"[:400]
            await self._shutdown()          # <- evita la fuga
            raise
        self.diag["launched"] = True
        return self

    async def __aexit__(self, *exc) -> None:
        await self._shutdown()

    async def _shutdown(self) -> None:
        """Cierra navegador y driver SIEMPRE, aunque uno de los dos falle.

        Antes, si `browser.close()` tiraba excepción (típico cuando el navegador
        ya murió por presión de recursos), nunca se llamaba a `pw.stop()` y
        quedaba otro proceso huérfano.
        """
        browser, pw = self._browser, self._pw
        self._browser, self._pw = None, None
        if browser:
            try:
                await browser.close()
            except Exception as exc:  # noqa: BLE001
                logger.warning("[%s] error cerrando navegador: %s", self.platform, exc)
        if pw:
            try:
                await pw.stop()
            except Exception as exc:  # noqa: BLE001
                logger.warning("[%s] error deteniendo playwright: %s", self.platform, exc)

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

    # ---- muro de cookies --------------------------------------------------
    # Botones de consentimiento. Mientras el modal está abierto, la plataforma
    # NO renderiza los resultados y el scroll no dispara la carga: la página pesa
    # 260 KB y no tiene un solo alojamiento. Se cierra antes de mirar nada.
    CONSENT_SELECTORS = [
        'button[data-testid="accept-btn"]',
        'button[data-testid="accept-all"]',
        '[data-testid="main-cookies-banner-container"] button',
        'button#onetrust-accept-btn-handler',
        'button[aria-label*="Aceptar"]',
        'button[aria-label*="Accept"]',
    ]
    CONSENT_TEXTS = ["Aceptar todas", "Aceptar todo", "Aceptar y continuar", "Aceptar",
                     "Accept all", "Accept All", "OK, entendido", "Entendido", "Got it"]

    # JS que LOCALIZA el botón de consentimiento y lo marca para clickearlo con
    # un clic real. No busca por clase (Airbnb las ofusca) ni por tag (usa <div>):
    # busca por TEXTO, que es lo único estable entre rediseños.
    _CONSENT_JS = """
    (texts) => {
      const norm = s => (s || "").replace(/\\s+/g, " ").trim().toLowerCase();
      const wanted = texts.map(norm);
      const nodes = document.querySelectorAll('*');
      const hits = [];
      for (const el of nodes) {
        const t = norm(el.innerText || el.textContent || el.value);
        if (!t || t.length > 40 || !wanted.includes(t)) continue;
        const r = el.getBoundingClientRect();
        hits.push({el, w: r.width, h: r.height, kids: el.querySelectorAll('*').length});
      }
      if (!hits.length) return {found: 0};
      // El contenedor también contiene el texto: queremos el MÁS INTERNO.
      hits.sort((a, b) => a.kids - b.kids);
      const visibles = hits.filter(h => h.w >= 8 && h.h >= 8);
      const pick = (visibles[0] || hits[0]).el;
      pick.setAttribute('data-metrica-consent', '1');
      return {found: hits.length, visibles: visibles.length,
              w: Math.round((visibles[0] || hits[0]).w),
              h: Math.round((visibles[0] || hits[0]).h),
              tag: pick.tagName.toLowerCase(),
              text: norm(pick.innerText || pick.textContent)};
    }
    """

    async def _dismiss_consent(self, page, attempts: int = 6, delay: float = 1.5) -> bool:
        """Cierra el cartel de cookies. Devuelve True si lo cerró.

        Se REINTENTA: el cartel de Airbnb aparece recién cuando corre su JS, así
        que buscarlo apenas termina `domcontentloaded` no lo encuentra nunca.
        """
        info = None
        for attempt in range(attempts):
            for sel in self.CONSENT_SELECTORS:
                try:
                    el = await page.query_selector(sel)
                    if el and await el.is_visible():
                        await el.click(timeout=4000)
                        self.diag["consent"] = sel
                        await asyncio.sleep(1.2)
                        return True
                except Exception:  # noqa: BLE001
                    continue
            try:
                info = await page.evaluate(self._CONSENT_JS, self.CONSENT_TEXTS)
            except Exception as exc:  # noqa: BLE001
                info = {"error": str(exc)[:120]}
            if info and info.get("found"):
                # Clic REAL de mouse sobre el elemento marcado (dispara los
                # manejadores que un .click() de JS a veces no alcanza).
                try:
                    loc = page.locator("[data-metrica-consent='1']").first
                    await loc.click(timeout=5000, force=True)
                    self.diag["consent"] = f"{info.get('tag')}:{info.get('text')}"
                    await asyncio.sleep(1.5)
                    return True
                except Exception:
                    try:  # si el clic real falla, al menos el de JS
                        await page.evaluate(
                            "() => document.querySelector('[data-metrica-consent=\\'1\\']')?.click()")
                        self.diag["consent"] = f"js:{info.get('text')}"
                        await asyncio.sleep(1.5)
                        return True
                    except Exception:  # noqa: BLE001
                        pass
            await asyncio.sleep(delay)
        # Para poder diagnosticarlo la próxima: ¿no apareció, o apareció invisible?
        self.diag["consent_debug"] = info or {"found": 0, "nota": "nunca apareció el cartel"}
        return False

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
        self, url: str, wait_selector: str | None = None, scroll: bool = True,
        wait_until: str = "domcontentloaded",
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
                await page.goto(url, wait_until=wait_until, timeout=self.goto_timeout)
                await self._dismiss_consent(page)   # antes de esperar contenido
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
                    self.diag["blocked"] += 1
                    last_exc = BlockedError(f"Pantalla anti-bot en {url}")
                    await context.close()
                    await asyncio.sleep(2 ** attempt + random.random())  # backoff
                    continue
                await context.close()
                self.diag["html_len"] = max(self.diag["html_len"], len(html))
                return html
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                self.diag["last_error"] = f"{type(exc).__name__}: {exc}"[:400]
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

    def debug_signals(self, html: str) -> dict:
        """Señales de diagnóstico genéricas (cada scraper puede enriquecer)."""
        try:
            from parsel import Selector
            sel = Selector(text=html)
            title = (sel.css("title::text").get() or "").strip()[:120]
            cards = len(sel.css(self.wait_selector)) if self.wait_selector else 0
            return {"title": title, "cards": cards, "html_len": len(html)}
        except Exception:  # noqa: BLE001
            return {"html_len": len(html)}

    async def search(
        self, query: str, checkin: str, checkout: str, adults: int,
        currency: str, max_pages: int = 1,
    ) -> list[Listing]:
        """Recorre paginas de resultados y devuelve listings normalizados."""
        results: list[Listing] = []
        for page_idx in range(max_pages):
            url = self.build_url(query, checkin, checkout, adults, currency, page_idx)
            html = await self.fetch_rendered(url, wait_selector=self.wait_selector)
            self.diag["pages"] += 1
            page_results = self.parse(html, checkin, checkout)
            self.diag["parsed"] += len(page_results)
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
