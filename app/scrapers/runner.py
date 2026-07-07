"""Orquestacion: ejecuta un scrapeo para un destino y persiste resultados."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Destination, PricePoint, ScrapeRun, utcnow
from .airbnb import AirbnbScraper
from .base import BaseScraper, Listing
from .booking import BookingScraper

logger = logging.getLogger("scraper.runner")

SCRAPERS: dict[str, type[BaseScraper]] = {
    "booking": BookingScraper,
    "airbnb": AirbnbScraper,
}


def compute_dates(checkin_offset_days: int, nights: int) -> tuple[str, str]:
    checkin = date.today() + timedelta(days=checkin_offset_days)
    checkout = checkin + timedelta(days=nights)
    return checkin.isoformat(), checkout.isoformat()


async def scrape_platform(
    platform: str, query: str, checkin: str, checkout: str,
    adults: int, currency: str, max_pages: int,
) -> list[Listing]:
    """Ejecuta un scraper concreto y devuelve los listings (sin tocar la BD)."""
    scraper_cls = SCRAPERS.get(platform)
    if not scraper_cls:
        raise ValueError(f"Plataforma desconocida: {platform}")
    async with scraper_cls() as scraper:
        return await scraper.search(query, checkin, checkout, adults, currency, max_pages)


async def run_destination(session: Session, destination: Destination) -> dict:
    """Scrapea todas las plataformas de un destino y guarda los precios.

    Devuelve un resumen por plataforma. Cada plataforma se aisla: si una falla
    o es bloqueada, las demas continuan.
    """
    checkin, checkout = compute_dates(destination.checkin_offset_days, destination.nights)
    summary: dict[str, dict] = {}

    for platform in destination.platform_list:
        run = ScrapeRun(
            destination_id=destination.id, platform=platform, status="running",
            started_at=utcnow(),
        )
        session.add(run)
        session.flush()  # obtener run.id

        try:
            listings = await scrape_platform(
                platform, destination.query, checkin, checkout,
                destination.adults, destination.currency, destination.max_pages,
            )
            for lst in listings:
                session.add(_to_price_point(destination.id, run.id, lst))
            run.status = "ok" if listings else "blocked"
            run.items_found = len(listings)
            summary[platform] = {"status": run.status, "items": len(listings)}
            logger.info("[%s] %s -> %d items", platform, destination.query, len(listings))
        except Exception as exc:  # noqa: BLE001
            run.status = "error"
            run.error = str(exc)[:2000]
            summary[platform] = {"status": "error", "error": str(exc)}
            logger.exception("[%s] fallo scrapeando %s", platform, destination.query)
        finally:
            run.finished_at = utcnow()
            session.flush()

    destination.last_run_at = utcnow()
    destination.last_status = ",".join(f"{p}:{v['status']}" for p, v in summary.items())
    session.commit()
    return summary


def _to_price_point(destination_id: int, run_id: int, lst: Listing) -> PricePoint:
    return PricePoint(
        destination_id=destination_id,
        run_id=run_id,
        platform=lst.platform,
        listing_id=lst.listing_id,
        name=lst.name[:400],
        url=lst.url,
        room_type=lst.room_type,
        price=lst.price,
        currency=lst.currency,
        price_raw=lst.price_raw,
        rating=lst.rating,
        reviews=lst.reviews,
        checkin=lst.checkin,
        checkout=lst.checkout,
        scraped_at=utcnow(),
    )
