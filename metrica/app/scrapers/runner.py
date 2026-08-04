"""Orquestación de scrapeo: ARS+USD, dedup de listings, observaciones de 2 fechas."""
from __future__ import annotations

import asyncio
import logging
import statistics
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Destination, Family, FxDaily, Listing, Observation, ScrapeRun
from .base import Listing as ScrapedListing, classify_outcome
from .providers import get_provider, provider_name_for
from .util import classify_typology, resolve_locality_destination
from . import SCRAPERS

logger = logging.getLogger("metrica.runner")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _scrape_currencies(platform: str, query: str, checkin: str, checkout: str,
                             adults: int, currencies: tuple[str, ...], max_pages: int,
                             retries: int | None = None, goto_timeout: int | None = None,
                             status_cb=None) -> tuple[dict[str, list[ScrapedListing]], dict]:
    """Scrapea TODAS las monedas reutilizando UN solo navegador.

    Antes se abría un navegador por moneda y por noche: en una corrida completa
    son miles de arranques, y cualquier fuga terminaba agotando el contenedor.
    Con un navegador por noche se reduce a la mitad y el ciclo de vida queda en
    un único lugar.
    """
    # La fuente de datos es configurable por plataforma (navegador propio, Apify,
    # API de terceros): si una plataforma cambia sus defensas, se cambia la fuente
    # en vez de reescribir el extractor.
    scraper = get_provider(platform, retries=retries, goto_timeout=goto_timeout,
                           status_cb=status_cb)
    out: dict[str, list[ScrapedListing]] = {c: [] for c in currencies}
    try:
        async with scraper:
            for currency in currencies:
                try:
                    out[currency] = await scraper.search(
                        query, checkin, checkout, adults, currency, max_pages)
                except Exception as exc:  # noqa: BLE001
                    scraper.diag["last_error"] = f"{type(exc).__name__}: {exc}"[:400]
                    logger.warning("[%s] fallo %s en %s: %s", platform, query, currency, exc)
    except Exception as exc:  # noqa: BLE001
        if not scraper.diag.get("last_error"):
            scraper.diag["last_error"] = f"{type(exc).__name__}: {exc}"[:400]
    return out, scraper.diag


async def scrape_date(platform: str, query: str, checkin: date, checkout: date,
                      adults: int, max_pages: int, currencies: tuple[str, ...] = ("ARS", "USD"),
                      fast: bool = False, status_cb=None,
                      diag_out: dict | None = None) -> dict[str, dict]:
    """Scrapea una noche en las monedas pedidas y mergea por external_id.

    fast=True: menos reintentos y timeout corto (para pruebas interactivas que
    deben avanzar rápido en vez de reintentar durante minutos).
    diag_out: si se pasa, se completa con {outcome, detail} explicando el
    resultado (ok/blocked/empty/error). Sin esto, un 0 resultados es indistinguible.

    Devuelve {external_id: {name, url, room_type, rating, reviews,
                            price_ars, price_usd}}.
    """
    ci, co = checkin.isoformat(), checkout.isoformat()
    merged: dict[str, dict] = {}
    retries = 1 if fast else None
    goto_timeout = 20000 if fast else None
    agg: dict = {"pages": 0, "blocked": 0, "parsed": 0, "last_error": None,
                 "html_len": 0, "launched": False, "selector": None, "degraded": False,
                 "room_links": 0, "json_nodes": 0, "dom_cards": 0, "consent": None}

    by_currency, diag = await _scrape_currencies(platform, query, ci, co, adults, currencies,
                                                 max_pages, retries=retries,
                                                 goto_timeout=goto_timeout, status_cb=status_cb)
    agg.update({k: diag.get(k, agg[k]) for k in
                ("pages", "blocked", "parsed", "html_len", "launched", "last_error",
                 "selector", "degraded", "room_links", "json_nodes", "dom_cards",
                 "consent")})
    for currency in currencies:
        price_key = "price_usd" if currency == "USD" else "price_ars"
        results = by_currency.get(currency) or []
        if not results:
            logger.warning("[%s] sin resultados %s %s (%s)", platform, query, currency,
                           diag.get("last_error") or f"bloqueos={diag.get('blocked')}")
        for r in results:
            if not r.listing_id:
                continue
            item = merged.setdefault(r.listing_id, {
                "name": r.name, "url": r.url, "room_type": r.room_type,
                "property_type": r.property_type, "rating": r.rating, "reviews": r.reviews,
                "locality": r.locality, "price_ars": None, "price_usd": None,
            })
            item[price_key] = r.price
            item["name"] = item["name"] or r.name
            item["url"] = item["url"] or r.url
            item["property_type"] = item["property_type"] or r.property_type
            item["locality"] = item["locality"] or r.locality
    if diag_out is not None:
        outcome, detail = classify_outcome(len(merged), agg)
        diag_out.update({"outcome": outcome, "detail": detail, **agg})
    return merged


def _upsert_listing(session: Session, platform: str, external_id: str, name: str,
                    url: str | None, room_type: str | None, destination_id: int,
                    property_type: str | None = None, locality: str | None = None,
                    siblings: list[tuple[int, str]] | None = None) -> Listing:
    external_id = external_id[:120]
    listing = session.scalar(
        select(Listing).where(Listing.platform == platform, Listing.external_id == external_id)
    )
    typ = classify_typology(name, room_type, platform, property_type)
    # Destino canónico: si la localidad reportada coincide con un destino hermano
    # (búsqueda por radio que trajo un vecino), se asigna ahí — no al buscado.
    canonical = destination_id
    if locality and siblings:
        matched = resolve_locality_destination(locality, siblings)
        if matched:
            canonical = matched
    if listing is None:
        listing = Listing(
            platform=platform, external_id=external_id, destination_id=canonical,
            name=name[:400], url=url, typology=typ, locality=(locality or None)[:160] if locality else None,
            property_type_raw=(property_type or None), first_seen=_utcnow(), last_seen=_utcnow(),
        )
        session.add(listing)
        session.flush()
    else:
        listing.last_seen = _utcnow()
        if locality and not listing.locality:
            listing.locality = locality[:160]
        # Si ahora conocemos la localidad y resuelve a otro destino, corregimos.
        if locality and siblings:
            matched = resolve_locality_destination(locality, siblings)
            if matched:
                listing.destination_id = matched
        if property_type:
            listing.property_type_raw = property_type[:120]
        # Si el nombre cambió, preservamos el anterior en el historial. La
        # identidad (listing.id) no se toca: se correlaciona por external_id/url.
        # Si el nombre fue puesto a mano, NO se pisa: sólo se registra el de la
        # plataforma en el historial para no perder el dato.
        if name and name[:400] != listing.name:
            attrs = dict(listing.attributes or {})
            # COPIA de la lista: dict() es superficial, así que mutar la original
            # dejaría el snapshot de SQLAlchemy igual al valor nuevo y NO se
            # emitiría UPDATE (el historial no se guardaba nunca).
            history = list(attrs.get("name_history", []))
            incoming = name[:400]
            keep = incoming if not listing.name_manual else listing.name
            tracked = listing.name if not listing.name_manual else incoming
            if tracked and tracked not in history:
                history.append(tracked)
            attrs["name_history"] = history[-10:]
            listing.attributes = attrs  # reasignar para que SQLAlchemy detecte el cambio
            listing.name = keep
        if url:
            listing.url = url
        # NO tocar la tipología si fue fijada a mano; si es automática, re-clasificar
        # cuando ahora tenemos mejor señal (antes era 'otro' o hay property_type).
        if not listing.typology_manual and (listing.typology == "otro" or property_type):
            listing.typology = typ
    return listing


# Presupuesto de tiempo por noche (segundos). Es una RED DE SEGURIDAD de último
# recurso, no el control principal: cada navegación ya está acotada por
# `goto_timeout` (20-45s) y `wait_for_selector` (15s). Escala con
# (monedas × páginas) para NO cancelar scrapeos legítimos del modo completo
# (2 monedas × 5 páginas ≈ 200-300s reales, muy por encima del viejo tope de 180).
def _unit_budget(fast: bool, max_pages: int, currencies: tuple[str, ...]) -> int:
    per_page = 30 if fast else 80
    return 30 + per_page * max(1, max_pages) * max(1, len(currencies))


# Noches consecutivas sin datos (por bloqueo o fallo técnico) tras las cuales se
# aborta la corrida de esa plataforma. Evita horas de golpeteo inútil.
CIRCUIT_BREAK_NIGHTS = 3


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
    unit_cap = _unit_budget(fast, max_pages, currencies)
    # Destinos hermanos (misma familia) para resolver la localidad canónica y no
    # duplicar alojamientos que una búsqueda por radio trae de una ciudad vecina.
    siblings = ([(d.id, d.name) for d in session.scalars(
        select(Destination).where(Destination.family_id == family_id)).all()]
        if family_id else [(destination.id, destination.name)])

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
        outcomes: dict = {}     # outcome -> detalle (para explicar el resultado del run)
        health: dict = {}       # salud del scrapeo (selector usado, degradación)
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
                night_diag: dict = {}
                merged = await asyncio.wait_for(
                    scrape_date(platform, query, checkin, checkout, adults, max_pages,
                                currencies=currencies, fast=fast, status_cb=_st,
                                diag_out=night_diag),
                    timeout=unit_cap,
                )
                oc = night_diag.get("outcome")
                if oc and oc != "ok":
                    outcomes.setdefault(oc, night_diag.get("detail"))
                if night_diag:
                    health.update({k: night_diag.get(k) for k in
                                   ("selector", "degraded", "pages", "parsed", "blocked",
                                    "consent", "room_links", "dom_cards")})
                obs_date = date.today()
                for ext_id, data in merged.items():
                    listing = _upsert_listing(session, platform, ext_id, data["name"],
                                              data["url"], data["room_type"], destination.id,
                                              property_type=data.get("property_type"),
                                              locality=data.get("locality"), siblings=siblings)
                    ars, usd = data["price_ars"], data["price_usd"]
                    fx = round(ars / usd, 2) if ars and usd else None
                    native = "ARS" if ars else ("USD" if usd else None)
                    room = (data["room_type"] or None)
                    session.add(Observation(
                        listing_id=listing.id, destination_id=listing.destination_id, run_id=run_id,
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

        # Pasada principal. Corta-circuito: si las primeras noches vienen todas
        # bloqueadas o con el navegador roto, ABORTA en vez de seguir golpeando
        # la plataforma durante horas (eso profundiza el bloqueo de IP y quema
        # la corrida entera sin traer un solo dato).
        failed: list = []
        streak = 0
        aborted = False
        for checkin in stay_dates:
            if cancel and cancel():
                break
            added, ok = await scrape_one_night(checkin)
            obs_count += added
            if not ok:
                failed.append(checkin)
            if progress:
                progress(f"{destination.name} · {platform} · {checkin.isoformat()}", added)
            # racha de noches sin datos por bloqueo/infra
            if added == 0 and ("blocked" in outcomes or "error" in outcomes):
                streak += 1
            elif added:
                streak = 0
                outcomes.pop("blocked", None)
            if streak >= CIRCUIT_BREAK_NIGHTS and obs_count == 0:
                aborted = True
                logger.error("[%s] %s: %d noches seguidas sin datos — se corta la corrida",
                             platform, destination.name, streak)
                if status:
                    status(f"{destination.name} · {platform} · cortado: la plataforma no responde")
                break

        # Segundo intento de las noches que fallaron (no re-cuenta el progreso).
        # Si cortamos por corta-circuito, no reintentamos: no hay nada que ganar.
        if failed and not aborted and not (cancel and cancel()):
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
            if obs_count:
                run.status, detail = "ok", None
            else:
                # Precedencia: recursos del servidor > bloqueo real > error > vacío.
                for cand in ("resources", "blocked", "error", "empty", "no_results"):
                    if cand in outcomes:
                        run.status, detail = cand, outcomes[cand]
                        break
                else:
                    run.status = "error" if last_error else "empty"
                    detail = last_error or "sin resultados y sin diagnóstico disponible"
            run.observations = obs_count
            run.diag = health or None
            msg = detail or last_error
            if aborted and msg:
                msg = (f"{msg} — corrida cortada tras {CIRCUIT_BREAK_NIGHTS} noches seguidas "
                       f"sin datos (se evita seguir golpeando la plataforma).")
            # Aviso temprano: trajo datos, pero con un selector alternativo. La
            # plataforma cambió el markup: hay que actualizar el primario ANTES
            # de que la alternativa también deje de servir y quedemos en cero.
            if health.get("degraded"):
                warn = (f"ATENCIÓN: {platform} cambió el markup — se usó el selector "
                        f"alternativo {health.get('selector')!r}. Actualizá el selector "
                        f"primario antes de que deje de funcionar.")
                logger.warning("[%s] %s", platform, warn)
                msg = f"{warn} {msg}" if msg else warn
            run.error = msg[:2000] if msg else None
            run.finished_at = _utcnow()
            session.commit()
            if run.status != "ok":
                logger.warning("[%s] %s -> %s: %s", platform, destination.name, run.status, msg)
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
