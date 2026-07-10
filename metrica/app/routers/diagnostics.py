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

from ..config import get_settings
from ..db import get_session
from ..deps import require_editor
from ..models import Destination, User
from ..scrapers import SCRAPERS
from ..scrapers.stealth import looks_blocked

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


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
