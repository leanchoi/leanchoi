"""Orquestación de scrapeo: ARS+USD, dedup de listings, observaciones de 2 fechas."""
from __future__ import annotations

import asyncio
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
                           adults: int, currency: str, max_pages: int,
                           retries: int | None = None, goto_timeout: int | None = None,
                           status_cb=None) -> list[ScrapedListing]:
    scraper_cls = SCRAPERS[platform]
    async with scraper_cls(retries=retries, goto_timeout=goto_timeout, status_cb=status_cb) as scraper:
        return await scraper.search(query, checkin, checkout, adults, currency, max_pages)


async def scrape_date(platform: str, query: str, checkin: date, checkout: date,
                      adults: int, max_pages: int, currencies: tuple[str, ...] = ("ARS", "USD"),
                      fast: bool = False, status_cb=None) -> dict[str, dict]:
    """Scrapea una noche en las monedas pedidas y mergea por external_id.

    fast=True: menos reintentos y timeout corto (para pruebas interactivas que
    deben avanzar rápido en vez de reintentar durante minutos).

    Devuelve {external_id: {name, url, room_type, rating, reviews,
                            price_ars, price_usd}}.
    """
    ci, co = checkin.isoformat(), checkout.isoformat()
    merged: dict[str, dict] = {}
    retries = 1 if fast else None
    goto_timeout = 20000 if fast else None

    for currency in currencies:
        price_key = "price_usd" if currency == "USD" else "price_ars"
        try:
            results = await _scrape_currency(platform, query, ci, co, adults, currency, max_pages,
                                             retries=retries, goto_timeout=goto_timeout,
                                             status_cb=status_cb)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[%s] fallo scrapeo %s %s: %s", platform, query, currency, exc)
            results = []
        for r in results:
            if not r.listing_id:
                continue
            item = merged.setdefault(r.listing_id, {
                "name": r.name, "url": r.url, "room_type": r.room_type,
                "property_type": r.property_type, "rating": r.rating, "reviews": r.reviews,
                "price_ars": None, "price_usd": None,
            })
            item[price_key] = r.price
            item["name"] = item["name"] or r.name
            item["url"] = item["url"] or r.url
            item["property_type"] = item["property_type"] or r.property_type
    return merged


def _upsert_listing(session: Session, platform: str, external_id: str, name: str,
                    url: str | None, room_type: str | None, destination_id: int,
                    property_type: str | None = None) -> Listing:
    external_id = external_id[:120]
    listing = session.scalar(
        select(Listing).where(Listing.platform == platform, Listing.external_id == external_id)
    )
    typ = classify_typology(name, room_type, platform, property_type)
    if listing is None:
        listing = Listing(
            platform=platform, external_id=external_id, destination_id=destination_id,
            name=name[:400], url=url, typology=typ,
            property_type_raw=(property_type or None), first_seen=_utcnow(), last_seen=_utcnow(),
        )
        session.add(listing)
        session.flush()
    else:
        listing.last_seen = _utcnow()
        if property_type:
            listing.property_type_raw = property_type[:120]
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
        # NO tocar la tipología si fue fijada a mano; si es automática, re-clasificar
        # cuando ahora tenemos mejor señal (antes era 'otro' o hay property_type).
        if not listing.typology_manual and (listing.typology == "otro" or property_type):
            listing.typology = typ
    return listing


# Tope de tiempo por noche (segundos): evita que una unidad se quede clavada.
UNIT_TIMEOUT_FAST = 60
UNIT_TIMEOUT_FULL = 180


async def run_destination(session: Session, destination: Destination, stay_dates: list[date],
                          platforms: list[str], adults: int, nights: int, max_pages: int,
                          family_id: int | None = None, progress=None, cancel=None,
                          status=None, fast: bool = False,
                          currencies: tuple[str, ...] = ("ARS", "USD")) -> dict:
    """Scrapea un destino para un conjunto de noches y persiste observaciones.

    progress(current_label, obs_delta): se llama tras cada (plataforma × noche).
    status(label): reporta en vivo qué se está haciendo (sin avanzar el contador).
    cancel(): si devuelve True, corta de forma ordenada.
    fast: menos reintentos/timeout corto (pruebas interactivas).
    """
    summary: dict[str, dict] = {}
    unit_cap = UNIT_TIMEOUT_FAST if fast else UNIT_TIMEOUT_FULL

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
        errors: dict = {"last": None}
        query = destination.query_for(platform)

        # Scrapeo de UNA noche (transacción independiente). Devuelve (added, ok).
        async def scrape_one_night(checkin, retry=False):
            checkout = checkin + timedelta(days=nights)
            if status:
                status(f"{destination.name} · {platform} · {checkin.isoformat()}"
                       + (" · reintento" if retry else " · buscando…"))
            added = 0
            try:
                def _st(msg):
                    if status:
                        status(f"{destination.name} · {msg}")
                merged = await asyncio.wait_for(
                    scrape_date(platform, query, checkin, checkout, adults, max_pages,
                                currencies=currencies, fast=fast, status_cb=_st),
                    timeout=unit_cap,
                )
                obs_date = date.today()
                for ext_id, data in merged.items():
                    listing = _upsert_listing(session, platform, ext_id, data["name"],
                                              data["url"], data["room_type"], destination.id,
                                              property_type=data.get("property_type"))
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
                return added, True
            except Exception as exc:  # noqa: BLE001
                session.rollback()
                errors["last"] = f"{type(exc).__name__}: {exc}"
                logger.warning("[%s] fallo noche %s (%s)%s: %s", platform, destination.name,
                               checkin, " [reintento]" if retry else "", exc)
                return 0, False

        # Pasada principal
        failed: list = []
        for checkin in stay_dates:
            if cancel and cancel():
                break
            added, ok = await scrape_one_night(checkin)
            obs_count += added
            if not ok:
                failed.append(checkin)
            if progress:
                progress(f"{destination.name} · {platform} · {checkin.isoformat()}", added)

        # Segundo intento de las noches que fallaron (no re-cuenta el progreso)
        if failed and not (cancel and cancel()):
            logger.info("[%s] %s: reintentando %d noche(s) que fallaron", platform,
                        destination.name, len(failed))
            for checkin in failed:
                if cancel and cancel():
                    break
                await asyncio.sleep(3)  # espaciar el reintento
                added, ok = await scrape_one_night(checkin, retry=True)
                obs_count += added

        last_error = errors["last"]
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
