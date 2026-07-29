"""Registro oficial: fuentes, crawl, matching e índice de adopción digital."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..deps import require_editor, require_viewer
from ..models import (Destination, Listing, OfficialListing, OfficialMatch,
                      RegistrySource, User)
from ..registry.crawler import adoption_index, crawl_source, match_destination

router = APIRouter(prefix="/api/registry", tags=["registry"])


class SourceIn(BaseModel):
    destination_id: int
    name: str
    url: str
    enabled: bool = True
    selectors: dict = {}


class SourceUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    enabled: bool | None = None
    selectors: dict | None = None


def _src_dict(s: RegistrySource, dest_name: str | None = None) -> dict:
    return {"id": s.id, "destination_id": s.destination_id, "destination": dest_name,
            "name": s.name, "url": s.url, "enabled": s.enabled, "selectors": s.selectors or {},
            "last_crawl_at": s.last_crawl_at.isoformat() if s.last_crawl_at else None,
            "last_count": s.last_count, "last_status": s.last_status, "last_error": s.last_error}


@router.get("/sources")
def list_sources(session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    dn = {d.id: d.name for d in session.scalars(select(Destination)).all()}
    return [_src_dict(s, dn.get(s.destination_id))
            for s in session.scalars(select(RegistrySource).order_by(RegistrySource.id)).all()]


@router.post("/sources", status_code=201)
def create_source(payload: SourceIn, session: Session = Depends(get_session),
                  _: User = Depends(require_editor)):
    if not session.get(Destination, payload.destination_id):
        raise HTTPException(404, "Destino no encontrado")
    src = RegistrySource(**payload.model_dump())
    session.add(src)
    session.commit()
    return _src_dict(src)


@router.put("/sources/{sid}")
def update_source(sid: int, payload: SourceUpdate, session: Session = Depends(get_session),
                  _: User = Depends(require_editor)):
    src = session.get(RegistrySource, sid)
    if not src:
        raise HTTPException(404, "Fuente no encontrada")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(src, k, v)
    session.commit()
    return _src_dict(src)


@router.delete("/sources/{sid}", status_code=204)
def delete_source(sid: int, session: Session = Depends(get_session),
                  _: User = Depends(require_editor)):
    src = session.get(RegistrySource, sid)
    if not src:
        raise HTTPException(404, "Fuente no encontrada")
    session.delete(src)
    session.commit()


@router.post("/sources/{sid}/inspect")
async def inspect_source(sid: int, session: Session = Depends(get_session),
                         _: User = Depends(require_editor)):
    """Prueba el crawl SIN guardar: dice qué estrategia funcionó y qué encontró.

    Es la herramienta para afinar un sitio nuevo: si devuelve poco o mal, se
    ajustan los `selectors` de la fuente y se vuelve a probar.
    """
    src = session.get(RegistrySource, sid)
    if not src:
        raise HTTPException(404, "Fuente no encontrada")
    try:
        return await asyncio.wait_for(crawl_source(session, src, dry_run=True), timeout=120)
    except asyncio.TimeoutError:
        raise HTTPException(504, "El sitio no respondió a tiempo")


@router.post("/sources/{sid}/crawl")
async def crawl(sid: int, session: Session = Depends(get_session),
                _: User = Depends(require_editor)):
    """Crawlea y GUARDA el registro oficial de esa fuente."""
    src = session.get(RegistrySource, sid)
    if not src:
        raise HTTPException(404, "Fuente no encontrada")
    try:
        out = await asyncio.wait_for(crawl_source(session, src, dry_run=False), timeout=180)
    except asyncio.TimeoutError:
        raise HTTPException(504, "El sitio no respondió a tiempo")
    session.commit()
    return out


@router.post("/crawl-all")
async def crawl_all(session: Session = Depends(get_session), _: User = Depends(require_editor)):
    """Crawlea todas las fuentes habilitadas (una por una, sin saturar)."""
    out = []
    for src in session.scalars(select(RegistrySource).where(RegistrySource.enabled)).all():
        try:
            out.append(await asyncio.wait_for(crawl_source(session, src, dry_run=False), timeout=180))
        except asyncio.TimeoutError:
            out.append({"source_id": src.id, "name": src.name, "error": "timeout"})
        session.commit()
    return {"sources": len(out), "results": out}


@router.get("/officials")
def list_officials(destination_id: int | None = None, typology: str | None = None,
                   only_offline: bool = False, limit: int = Query(500, ge=1, le=5000),
                   session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    """Establecimientos del registro oficial, con su vínculo online si existe."""
    q = select(OfficialListing)
    if destination_id:
        q = q.where(OfficialListing.destination_id == destination_id)
    if typology:
        q = q.where(OfficialListing.typology == typology)
    officials = session.scalars(q.limit(limit)).all()
    matches = {m.official_id: m for m in session.scalars(select(OfficialMatch)).all()}
    lmap = {l.id: l for l in session.scalars(select(Listing)).all()}
    dn = {d.id: d.name for d in session.scalars(select(Destination)).all()}
    rows = []
    for o in officials:
        m = matches.get(o.id)
        lst = lmap.get(m.listing_id) if m else None
        if only_offline and m:
            continue
        rows.append({
            "id": o.id, "name": o.name, "typology": o.typology, "typology_raw": o.typology_raw,
            "destination": dn.get(o.destination_id, ""), "address": o.address,
            "phone": o.phone, "website": o.website, "capacity": o.capacity, "url": o.url,
            "online": bool(m), "match_score": m.score if m else None,
            "listing_id": lst.id if lst else None,
            "listing_name": lst.name if lst else None,
            "platform": lst.platform if lst else None,
        })
    rows.sort(key=lambda r: (r["online"], r["name"]))
    return {"count": len(rows), "rows": rows}


@router.post("/match")
def run_match(destination_id: int, threshold: float = Query(0.62, ge=0.3, le=1.0),
              apply_typology: bool = True, session: Session = Depends(get_session),
              _: User = Depends(require_editor)):
    """Vincula oficiales con anuncios y corrige tipologías con el dato oficial."""
    if not session.get(Destination, destination_id):
        raise HTTPException(404, "Destino no encontrado")
    out = match_destination(session, destination_id, threshold, apply_typology)
    session.commit()
    return out


@router.get("/adoption")
def adoption(family_id: int | None = None, session: Session = Depends(get_session),
             _: User = Depends(require_viewer)):
    """Índice de adopción digital: qué % del inventario oficial está publicado."""
    dest_ids = None
    if family_id:
        dest_ids = [d.id for d in session.scalars(
            select(Destination).where(Destination.family_id == family_id)).all()]
    out = adoption_index(session, dest_ids)
    dn = {d.id: d.name for d in session.scalars(select(Destination)).all()}
    for row in out["by_destination"]:
        row["name"] = dn.get(row["destination_id"], f"#{row['destination_id']}")
    out["by_destination"].sort(key=lambda r: (r["pct"] is None, -(r["pct"] or 0)))
    out["by_typology"].sort(key=lambda r: (r["pct"] is None, -(r["pct"] or 0)))
    return out
