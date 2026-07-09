"""Acceso a datos crudos: consulta de observaciones y descarga CSV."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..deps import require_viewer
from ..models import Listing, Observation, ScrapeRun, User
from ..schemas import ObservationOut

router = APIRouter(tags=["data"])


def _obs_query(destination_id, platform, typology, stay_from, stay_to):
    stmt = select(Observation)
    if destination_id is not None:
        stmt = stmt.where(Observation.destination_id == destination_id)
    if platform:
        stmt = stmt.where(Observation.platform == platform)
    if typology:
        stmt = stmt.where(Observation.typology == typology)
    if stay_from:
        stmt = stmt.where(Observation.stay_checkin >= stay_from)
    if stay_to:
        stmt = stmt.where(Observation.stay_checkin <= stay_to)
    return stmt.order_by(desc(Observation.observed_at))


@router.get("/api/observations", response_model=list[ObservationOut])
def list_observations(
    destination_id: int | None = None, platform: str | None = None, typology: str | None = None,
    stay_from: str | None = None, stay_to: str | None = None,
    limit: int = Query(300, ge=1, le=10000), offset: int = Query(0, ge=0),
    session: Session = Depends(get_session), _: User = Depends(require_viewer),
):
    stmt = _obs_query(destination_id, platform, typology, stay_from, stay_to).limit(limit).offset(offset)
    return list(session.scalars(stmt).all())


@router.get("/api/observations.csv")
def download_csv(
    destination_id: int | None = None, platform: str | None = None, typology: str | None = None,
    stay_from: str | None = None, stay_to: str | None = None,
    session: Session = Depends(get_session), _: User = Depends(require_viewer),
):
    stmt = _obs_query(destination_id, platform, typology, stay_from, stay_to)
    rows = session.scalars(stmt).all()
    # mapa listing_id -> (external_id, nombre, url) para incluir el ID propio y el link
    lids = {r.listing_id for r in rows}
    listings = {l.id: l for l in session.scalars(select(Listing).where(Listing.id.in_(lids))).all()} if lids else {}

    cols = ["observation_id", "listing_id", "external_id", "nombre", "url", "platform", "typology",
            "stay_checkin", "stay_checkout", "observed_date", "price_ars", "price_usd",
            "fx_implicit", "available", "rating", "reviews"]

    def generate():
        buf = io.StringIO(); w = csv.writer(buf)
        w.writerow(cols); yield buf.getvalue(); buf.seek(0); buf.truncate(0)
        for r in rows:
            lst = listings.get(r.listing_id)
            w.writerow([
                r.id, r.listing_id, lst.external_id if lst else "", lst.name if lst else "",
                lst.url if lst else "", r.platform, r.typology, r.stay_checkin, r.stay_checkout,
                r.observed_date, r.price_ars, r.price_usd, r.fx_implicit, r.available,
                r.rating, r.reviews,
            ])
            yield buf.getvalue(); buf.seek(0); buf.truncate(0)

    return StreamingResponse(generate(), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=metrica_observaciones.csv"})


@router.get("/api/runs")
def list_runs(limit: int = Query(50, ge=1, le=500), session: Session = Depends(get_session),
              _: User = Depends(require_viewer)):
    rows = session.scalars(select(ScrapeRun).order_by(desc(ScrapeRun.started_at)).limit(limit)).all()
    return [
        {"id": r.id, "family_id": r.family_id, "destination_id": r.destination_id,
         "platform": r.platform, "status": r.status, "stay_dates": r.stay_dates,
         "observations": r.observations, "error": r.error,
         "started_at": r.started_at, "finished_at": r.finished_at}
        for r in rows
    ]
