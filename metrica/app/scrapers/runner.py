"""Orquestación de scrapeo: ARS+USD, dedup de listings, observaciones de 2 fechas."""
from __future__ import annotations

import logging
import statistics
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Destination, Family, FxDaily, Listing, Observation, ScrapeRun
from .base import Listing as ScrapedListing
from .util import classify_typology
from . import SCRAPERS

logger = logging.getLogger("metrica.runner")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _scrape_currency(platform: str, query: str, checkin: str, checkout: str,
                           adults: int, currency: str, max_pages: int) -> list[ScrapedListing]:
    scraper_cls = SCRAPERS[platform]
    async with scraper_cls() as scraper:
        return await scraper.search(query, checkin, checkout, adults, currency, max_pages)


async def scrape_date(platform: str, query: str, checkin: date, checkout: date,
                      adults: int, max_pages: int) -> dict[str, dict]:
    """Scrapea una noche en ARS y USD; mergea por external_id.

    Devuelve {external_id: {name, url, room_type, rating, reviews,
                            price_ars, price_usd}}.
    """
    ci, co = checkin.isoformat(), checkout.isoformat()
    merged: dict[str, dict] = {}

    for currency, price_key in (("ARS", "price_ars"), ("USD", "price_usd")):
        try:
            results = await _scrape_currency(platform, query, ci, co, adults, currency, max_pages)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[%s] fallo scrapeo %s %s: %s", platform, query, currency, exc)
            results = []
        for r in results:
            if not r.listing_id:
                continue
            item = merged.setdefault(r.listing_id, {
                "name": r.name, "url": r.url, "room_type": r.room_type,
                "rating": r.rating, "reviews": r.reviews,
                "price_ars": None, "price_usd": None,
            })
            item[price_key] = r.price
            item["name"] = item["name"] or r.name
            item["url"] = item["url"] or r.url
    return merged


def _upsert_listing(session: Session, platform: str, external_id: str, name: str,
                    url: str | None, room_type: str | None, destination_id: int) -> Listing:
    external_id = external_id[:120]
    listing = session.scalar(
        select(Listing).where(Listing.platform == platform, Listing.external_id == external_id)
    )
    typ = classify_typology(name, room_type, platform)
    if listing is None:
        listing = Listing(
            platform=platform, external_id=external_id, destination_id=destination_id,
            name=name[:400], url=url, typology=typ, first_seen=_utcnow(), last_seen=_utcnow(),
        )
        session.add(listing)
        session.flush()
    else:
        listing.last_seen = _utcnow()
        # Si el nombre cambió, preservamos el anterior en el historial. La
        # identidad (listing.id) no se toca: se correlaciona por external_id/url.
        if name and name[:400] != listing.name:
            attrs = dict(listing.attributes or {})
            history = attrs.get("name_history", [])
            if listing.name and listing.name not in history:
                history.append(listing.name)
            attrs["name_history"] = history[-10:]
            listing.attributes = attrs  # reasignar para que SQLAlchemy detecte el cambio
            listing.name = name[:400]
        if url:
            listing.url = url
        if listing.typology == "otro":
            listing.typology = typ
    return listing


async def run_destination(session: Session, destination: Destination, stay_dates: list[date],
                          platforms: list[str], adults: int, nights: int, max_pages: int,
                          family_id: int | None = None, progress=None, cancel=None) -> dict:
    """Scrapea un destino para un conjunto de noches y persiste observaciones.

    progress(current_label, obs_delta): se llama tras cada (plataforma × noche).
    cancel(): si devuelve True, corta de forma ordenada.
    """
    summary: dict[str, dict] = {}

    for platform in platforms:
        if platform not in SCRAPERS:
            continue
        if cancel and cancel():
            break
        run = ScrapeRun(family_id=family_id, destination_id=destination.id, platform=platform,
                        status="running", stay_dates=len(stay_dates), started_at=_utcnow())
        session.add(run)
        session.commit()  # el run queda persistido desde el arranque
        run_id = run.id

        obs_count = 0
        last_error: str | None = None
        query = destination.query_for(platform)

        # Cada noche es una transacción independiente: si una falla (bloqueo,
        # dato raro, overflow), se saltea y se loguea, sin matar el trabajo.
        for checkin in stay_dates:
            if cancel and cancel():
                break
            checkout = checkin + timedelta(days=nights)
            added = 0
            try:
                merged = await scrape_date(platform, query, checkin, checkout, adults, max_pages)
                obs_date = date.today()
                for ext_id, data in merged.items():
                    listing = _upsert_listing(session, platform, ext_id, data["name"],
                                              data["url"], data["room_type"], destination.id)
                    ars, usd = data["price_ars"], data["price_usd"]
                    fx = round(ars / usd, 2) if ars and usd else None
                    native = "ARS" if ars else ("USD" if usd else None)
                    room = (data["room_type"] or None)
                    session.add(Observation(
                        listing_id=listing.id, destination_id=destination.id, run_id=run_id,
                        platform=platform, typology=listing.typology,
                        stay_checkin=checkin, stay_checkout=checkout,
                        observed_at=_utcnow(), observed_date=obs_date,
                        price_ars=ars, price_usd=usd, fx_implicit=fx, currency_native=native,
                        available=True, room_type=room[:200] if room else None,
                        rating=data["rating"], reviews=data["reviews"],
                    ))
                    added += 1
                session.commit()
            except Exception as exc:  # noqa: BLE001
                session.rollback()
                last_error = f"{type(exc).__name__}: {exc}"
                logger.warning("[%s] fallo noche %s (%s): %s", platform, destination.name, checkin, exc)
                added = 0
            obs_count += added
            if progress:
                progress(f"{destination.name} · {platform} · {checkin.isoformat()}", added)

        run = session.get(ScrapeRun, run_id)
        if run:
            run.status = "ok" if obs_count else ("error" if last_error else "blocked")
            run.observations = obs_count
            run.error = last_error[:2000] if last_error else None
            run.finished_at = _utcnow()
            session.commit()
        summary[platform] = {"status": run.status if run else "error", "observations": obs_count}

        try:
            _update_fx_daily(session, platform)
            session.commit()
        except Exception:  # noqa: BLE001
            session.rollback()

    return summary


def _update_fx_daily(session: Session, platform: str) -> None:
    """Recalcula el tipo de cambio implícito de hoy (mediana entre observaciones)."""
    today = date.today()
    rows = session.scalars(
        select(Observation.fx_implicit).where(
            Observation.observed_date == today,
            Observation.platform == platform,
            Observation.fx_implicit.is_not(None),
        )
    ).all()
    if not rows:
        return
    fx = round(statistics.median(rows), 2)
    existing = session.scalar(
        select(FxDaily).where(FxDaily.observed_date == today, FxDaily.platform == platform)
    )
    if existing:
        existing.fx_rate = fx
        existing.sample_count = len(rows)
    else:
        session.add(FxDaily(observed_date=today, platform=platform, fx_rate=fx, sample_count=len(rows)))
    session.flush()


async def run_family(session: Session, family: Family) -> dict:
    """Corre la familia completa: expande fechas y scrapea cada destino activo."""
    from ..planner import expand_stay_dates

    stay_dates = expand_stay_dates(family, date.today())
    platforms = family.platform_list
    result: dict[str, dict] = {}
    for dest in family.destinations:
        if dest.enabled:
            result[dest.name] = await run_destination(
                session, dest, stay_dates, platforms, family.adults, family.nights,
                max_pages=5, family_id=family.id,
            )
    family.last_run_at = _utcnow()
    session.commit()
    return {"family": family.name, "stay_dates": len(stay_dates), "destinations": result}
