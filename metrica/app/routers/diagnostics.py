"""Diagnóstico de conectividad de scrapeo.

Responde la pregunta clave: ¿el problema es la IP/proxy del VPS o un bug?
Hace UNA búsqueda real (rápida) para un destino y reporta si la plataforma
respondió, si detectó bloqueo, cuántos resultados y cuánto tardó.
"""
from __future__ import annotations

import asyncio
import time
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from sqlalchemy import select, text

from ..config import get_settings
from ..db import get_session
from ..deps import require_admin, require_editor
from ..models import Destination, Listing, User
from ..scrapers import SCRAPERS
from ..scrapers.stealth import looks_blocked
from ..scrapers.util import resolve_locality_destination

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


@router.get("/browser")
async def browser_health(_: User = Depends(require_editor)):
    """¿El navegador funciona DENTRO del contenedor? No usa red externa.

    Separa el fallo de infraestructura (Chromium ausente/roto, /dev/shm chico)
    de un bloqueo de la plataforma. Si esto falla, ningún scrapeo puede andar.
    """
    from ..scrapers.booking import BookingScraper

    s = get_settings()
    out = {"ok": False, "executable": s.playwright_executable_path or "(default)",
           "proxy": bool(s.proxy_url), "error": None, "render_ok": False, "ms": None}
    t0 = time.time()
    try:
        async def _run():
            async with BookingScraper(retries=1, goto_timeout=8000) as sc:
                ctx = await sc._new_context()
                page = await ctx.new_page()
                await page.set_content("<html><body><h1 id='t'>metrica-ok</h1></body></html>")
                txt = await page.inner_text("#t")
                ua = await page.evaluate("navigator.userAgent")
                wd = await page.evaluate("navigator.webdriver")
                await ctx.close()
                return txt, ua, wd
        txt, ua, wd = await asyncio.wait_for(_run(), timeout=45)
        out["ok"] = True
        out["render_ok"] = (txt == "metrica-ok")
        out["user_agent"] = (ua or "")[:120]
        out["webdriver_hidden"] = (wd is None)
    except asyncio.TimeoutError:
        out["error"] = "timeout iniciando/renderizando en el navegador"
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"[:400]
    out["ms"] = int((time.time() - t0) * 1000)
    out["verdict"] = ("Navegador OK — si el scrapeo falla, el problema es la red/IP o el markup."
                      if out["ok"] else
                      "NAVEGADOR ROTO — ningún scrapeo puede funcionar. Revisá la imagen Docker "
                      "(Chromium/Playwright) y shm_size.")
    return out


@router.post("/repair-destinations")
def repair_destinations(session: Session = Depends(get_session), _: User = Depends(require_admin)):
    """Corrige la duplicación por búsquedas de radio: reasigna cada alojamiento a
    su destino canónico (por localidad) y hace que TODAS las observaciones sigan
    ese destino. Deja de aparecer el mismo alojamiento en dos destinos vecinos."""
    dests = session.scalars(select(Destination)).all()
    fam_dests: dict = {}
    dest_family: dict = {}
    for d in dests:
        fam_dests.setdefault(d.family_id, []).append((d.id, d.name))
        dest_family[d.id] = d.family_id
    reassigned = 0
    for lst in session.scalars(select(Listing).where(Listing.locality.is_not(None))).all():
        sibs = fam_dests.get(dest_family.get(lst.destination_id), [])
        m = resolve_locality_destination(lst.locality, sibs)
        if m and m != lst.destination_id:
            lst.destination_id = m
            reassigned += 1
    session.flush()
    # Las observaciones siguen al destino canónico de su listing (dedup total).
    res = session.execute(text(
        "UPDATE observations SET destination_id = "
        "(SELECT destination_id FROM listings WHERE listings.id = observations.listing_id) "
        "WHERE listing_id IS NOT NULL"))
    session.commit()
    return {"reassigned_listings": reassigned,
            "observations_updated": res.rowcount if res.rowcount is not None else -1}


@router.get("/probe")
async def probe(destination_id: int, platform: str = "booking",
                session: Session = Depends(get_session), _: User = Depends(require_editor)):
    """Prueba rápida de conectividad para un destino y plataforma."""
    dest = session.get(Destination, destination_id)
    if not dest:
        raise HTTPException(404, "Destino no encontrado")
    if platform not in SCRAPERS:
        raise HTTPException(400, "Plataforma inválida")

    s = get_settings()
    query = dest.query_for(platform)
    checkin = date.today() + timedelta(days=15)
    checkout = checkin + timedelta(days=1)
    scraper_cls = SCRAPERS[platform]

    result = {"platform": platform, "query": query, "proxy": bool(s.proxy_url),
              "reachable": False, "blocked": False, "results": 0, "ms": None,
              "sample": None, "error": None}

    t0 = time.time()
    try:
        async def _run():
            ci, co = checkin.isoformat(), checkout.isoformat()
            async with scraper_cls(retries=1, goto_timeout=22000) as scraper:
                # Camino REAL (para airbnb usa la intercepción de API)
                listings = await scraper.search(query, ci, co, 1, "ARS", 1)
                # Carga cruda para señales de diagnóstico
                url = scraper.build_url(query, ci, co, 1, "ARS", 0)
                html = await scraper.fetch_rendered(url, wait_selector=scraper.wait_selector)
                debug = scraper.debug_signals(html) if hasattr(scraper, "debug_signals") else None
                return html, listings, debug

        html, listings, debug = await asyncio.wait_for(_run(), timeout=70)
        result["reachable"] = True
        result["results"] = len(listings)
        result["blocked"] = looks_blocked(html)
        result["debug"] = debug
        if listings:
            top = listings[0]
            result["sample"] = {"name": top.name[:80], "price": top.price, "currency": top.currency}
    except asyncio.TimeoutError:
        result["error"] = "timeout: la plataforma no respondió a tiempo (posible bloqueo de IP de datacenter)"
    except Exception as exc:  # noqa: BLE001
        result["error"] = f"{type(exc).__name__}: {exc}"[:300]
    result["ms"] = int((time.time() - t0) * 1000)

    # Interpretación para el usuario
    if result["reachable"] and result["results"] > 0:
        result["verdict"] = "OK — la plataforma responde y devuelve resultados."
    elif result["reachable"] and result["blocked"]:
        result["verdict"] = "BLOQUEADO — respondió pero con pantalla anti-bot. Necesitás proxy residencial."
    elif result["reachable"]:
        result["verdict"] = "SIN RESULTADOS — respondió pero 0 alojamientos (revisá la query o proxy)."
    else:
        result["verdict"] = "NO RESPONDE — la IP del VPS probablemente está bloqueada. Configurá PROXY_URL."
    return result
