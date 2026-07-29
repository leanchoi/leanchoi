"""Crawl de los sitios oficiales de turismo y persistencia del registro."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from urllib.parse import urljoin

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Listing, OfficialListing, OfficialMatch, RegistrySource
from ..scrapers.base import BaseScraper
from .extract import category_links, dedupe, extract, looks_like_category_index
from .match import best_matches, norm_name

logger = logging.getLogger("metrica.registry")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RegistryScraper(BaseScraper):
    """Navegador para sitios oficiales (muchos son SPA y necesitan render)."""
    platform = "registry"
    wait_selector = None

    def build_url(self, query, checkin, checkout, adults, currency, page=0):
        return query  # acá la "query" ya es la URL

    def parse(self, html, checkin, checkout):
        return []


async def fetch_html(url: str, wait_selector: str | None = None,
                     goto_timeout: int = 90000) -> str:
    """Descarga una página de sitio oficial.

    Los sitios municipales suelen ser LENTOS (no anti-bot), así que se usa un
    timeout generoso y, si `domcontentloaded` no llega, se reintenta con
    `commit` (apenas responde el servidor) + espera del contenido. Antes esto
    daba timeout a los 45s y perdíamos el sitio entero.
    """
    async with RegistryScraper(retries=1, goto_timeout=goto_timeout) as sc:
        try:
            return await sc.fetch_rendered(url, wait_selector=wait_selector)
        except Exception as first:  # noqa: BLE001
            logger.warning("[registry] %s lento; reintento tolerante: %s", url, first)
            return await sc.fetch_rendered(url, wait_selector=wait_selector,
                                           wait_until="commit")


async def crawl_source(session: Session, source: RegistrySource,
                       dry_run: bool = False) -> dict:
    """Descarga el sitio, extrae los establecimientos y (si no es dry_run) los
    guarda. Devuelve un resumen con la estrategia usada y una muestra."""
    cfg = source.selectors or {}
    result: dict = {"source_id": source.id, "name": source.name, "url": source.url,
                    "strategy": None, "found": 0, "saved": 0, "error": None, "sample": []}
    try:
        html = await fetch_html(source.url, wait_selector=cfg.get("wait"))
    except Exception as exc:  # noqa: BLE001
        result["error"] = f"{type(exc).__name__}: {exc}"[:400]
        source.last_status, source.last_error = "error", result["error"]
        source.last_crawl_at = _utcnow()
        return result

    rows, strategy = extract(html, cfg)

    # Si la página es un índice de CATEGORÍAS (Cabañas / Hoteles / Campings…),
    # los establecimientos están un nivel más adentro: se entra a cada categoría.
    if cfg.get("follow_categories", True) and (not rows or looks_like_category_index(rows, html)):
        links = category_links(html, source.url)
        if links:
            logger.info("[registry] %s parece índice de categorías; entrando a %d",
                        source.name, len(links))
            deep: list[dict] = []
            for link in links:
                try:
                    sub = await fetch_html(link, wait_selector=cfg.get("wait"))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("[registry] no se pudo abrir %s: %s", link, exc)
                    continue
                sub_rows, _ = extract(sub, cfg)
                sub_rows = [r for r in sub_rows if not looks_like_category_index([r], sub)]
                for r in sub_rows:
                    r.setdefault("raw", {})["category_url"] = link
                deep.extend(sub_rows)
            deep = dedupe(deep)
            if len(deep) > len(rows):
                rows, strategy = deep, f"{strategy}+categorias"

    # Completar URLs relativas
    for r in rows:
        if r.get("url") and not str(r["url"]).startswith("http"):
            r["url"] = urljoin(source.url, str(r["url"]))
    result["strategy"] = strategy
    result["found"] = len(rows)
    result["sample"] = [{k: r[k] for k in ("name", "typology", "typology_raw", "phone", "address")}
                        for r in rows[:15]]
    result["html_len"] = len(html)

    if not dry_run:
        result["saved"] = _persist(session, source, rows)
    source.last_crawl_at = _utcnow()
    source.last_count = len(rows)
    source.last_status = "ok" if rows else "empty"
    source.last_error = None if rows else (
        "no se reconocieron establecimientos: configurá selectores para este sitio "
        "(campo 'selectors') o revisá la URL")
    return result


def _persist(session: Session, source: RegistrySource, rows: list[dict]) -> int:
    saved = 0
    for r in rows:
        key = norm_name(r["name"])
        if not key:
            continue
        existing = session.scalar(select(OfficialListing).where(
            OfficialListing.source_id == source.id, OfficialListing.name_norm == key))
        if existing:
            existing.last_seen = _utcnow()
            for f in ("address", "phone", "email", "website", "capacity", "url", "typology_raw"):
                if r.get(f) and not getattr(existing, f):
                    setattr(existing, f, r[f])
            # la tipología del registro oficial manda sobre la inferida antes
            if r.get("typology") and r["typology"] != "otro":
                existing.typology = r["typology"]
        else:
            session.add(OfficialListing(
                source_id=source.id, destination_id=source.destination_id,
                name=r["name"], name_norm=key, typology=r["typology"],
                typology_raw=r.get("typology_raw"), address=r.get("address"),
                phone=r.get("phone"), email=r.get("email"), website=r.get("website"),
                capacity=r.get("capacity"), url=r.get("url"), raw=r.get("raw") or {},
                first_seen=_utcnow(), last_seen=_utcnow(),
            ))
            saved += 1
    session.flush()
    return saved


def match_destination(session: Session, destination_id: int, threshold: float = 0.62,
                      apply_typology: bool = True) -> dict:
    """Vincula los establecimientos oficiales del destino con los anuncios de
    plataforma y (opcional) corrige la tipología usando la del registro oficial."""
    officials = session.scalars(select(OfficialListing).where(
        OfficialListing.destination_id == destination_id)).all()
    listings = session.scalars(select(Listing).where(
        Listing.destination_id == destination_id)).all()
    cands = [(l.id, l.name) for l in listings]
    lmap = {l.id: l for l in listings}
    linked, retyped, new_links = 0, 0, 0
    used: set[int] = set()

    for off in officials:
        hits = best_matches(off.name, cands, threshold)
        hits = [(lid, s) for lid, s in hits if lid not in used]
        if not hits:
            continue
        lid, sc = hits[0]
        used.add(lid)
        linked += 1
        exists = session.scalar(select(OfficialMatch).where(
            OfficialMatch.official_id == off.id, OfficialMatch.listing_id == lid))
        if exists:
            exists.score = sc
        else:
            session.add(OfficialMatch(official_id=off.id, listing_id=lid, score=sc))
            new_links += 1
        # La tipología oficial es mejor fuente que el nombre marketinero.
        lst = lmap.get(lid)
        if (apply_typology and lst and off.typology and off.typology != "otro"
                and not lst.typology_manual and lst.typology != off.typology):
            lst.typology = off.typology
            lst.typology_manual = True   # queda fija: viene del registro oficial
            retyped += 1
    session.flush()
    return {"officials": len(officials), "listings": len(listings),
            "linked": linked, "new_links": new_links, "retyped": retyped}


def adoption_index(session: Session, destination_ids: list[int] | None = None) -> dict:
    """Índice de adopción digital: cuánto del inventario oficial está online.

    Por destino y por tipología: oficiales, cuántos están vinculados a un anuncio
    y el porcentaje. Responde '¿qué tipologías son más permeables a publicarse?'.
    """
    q = select(OfficialListing)
    if destination_ids:
        q = q.where(OfficialListing.destination_id.in_(destination_ids))
    officials = session.scalars(q).all()
    matched = {m.official_id for m in session.scalars(select(OfficialMatch)).all()}
    by_dest: dict = {}
    by_typ: dict = {}
    for o in officials:
        d = by_dest.setdefault(o.destination_id, {"official": 0, "online": 0})
        d["official"] += 1
        t = by_typ.setdefault(o.typology, {"official": 0, "online": 0})
        t["official"] += 1
        if o.id in matched:
            d["online"] += 1
            t["online"] += 1

    def _pct(d):
        return round(d["online"] / d["official"] * 100) if d["official"] else None
    return {
        "by_destination": [{"destination_id": k, **v, "pct": _pct(v)} for k, v in by_dest.items()],
        "by_typology": [{"typology": k, **v, "pct": _pct(v)} for k, v in by_typ.items()],
        "total": {"official": len(officials), "online": len([o for o in officials if o.id in matched]),
                  "pct": round(len([o for o in officials if o.id in matched]) / len(officials) * 100)
                  if officials else None},
    }
