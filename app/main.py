"""API FastAPI + frontend de consulta.

Expone:
  - CRUD de destinos (con periodicidad)
  - Lanzar un scrapeo bajo demanda
  - Consulta y descarga (CSV) de precios
  - Historico de ejecuciones
  - Sirve el frontend (app/static/index.html)
"""
from __future__ import annotations

import csv
import io
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from . import scheduler
from .db import get_session, init_db
from .models import Destination, PricePoint, ScrapeRun
from .schemas import (
    DestinationCreate,
    DestinationOut,
    DestinationUpdate,
    PricePointOut,
    ScrapeRunOut,
)
from .scrapers.runner import run_destination

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("api")

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler.start()
    logger.info("App lista")
    yield
    scheduler.shutdown()


app = FastAPI(title="Scraper de precios Booking/Airbnb", version="0.1.0", lifespan=lifespan)


# --------------------------------------------------------------------------
#  Destinos (CRUD + periodicidad)
# --------------------------------------------------------------------------
@app.get("/api/destinations", response_model=list[DestinationOut])
def list_destinations(session: Session = Depends(get_session)):
    return session.query(Destination).order_by(Destination.id).all()


@app.post("/api/destinations", response_model=DestinationOut, status_code=201)
def create_destination(payload: DestinationCreate, session: Session = Depends(get_session)):
    dest = Destination(**payload.model_dump())
    session.add(dest)
    session.commit()
    session.refresh(dest)
    scheduler.schedule_destination(dest)
    return dest


@app.get("/api/destinations/{dest_id}", response_model=DestinationOut)
def get_destination(dest_id: int, session: Session = Depends(get_session)):
    dest = session.get(Destination, dest_id)
    if not dest:
        raise HTTPException(404, "Destino no encontrado")
    return dest


@app.put("/api/destinations/{dest_id}", response_model=DestinationOut)
def update_destination(
    dest_id: int, payload: DestinationUpdate, session: Session = Depends(get_session)
):
    dest = session.get(Destination, dest_id)
    if not dest:
        raise HTTPException(404, "Destino no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(dest, key, value)
    session.commit()
    session.refresh(dest)
    scheduler.schedule_destination(dest)  # re-programa con la nueva periodicidad
    return dest


@app.delete("/api/destinations/{dest_id}", status_code=204)
def delete_destination(dest_id: int, session: Session = Depends(get_session)):
    dest = session.get(Destination, dest_id)
    if not dest:
        raise HTTPException(404, "Destino no encontrado")
    scheduler.unschedule_destination(dest_id)
    session.delete(dest)
    session.commit()


@app.post("/api/destinations/{dest_id}/run")
async def run_now(dest_id: int, session: Session = Depends(get_session)):
    """Lanza un scrapeo inmediato del destino y devuelve el resumen."""
    dest = session.get(Destination, dest_id)
    if not dest:
        raise HTTPException(404, "Destino no encontrado")
    summary = await run_destination(session, dest)
    return {"destination_id": dest_id, "summary": summary}


# --------------------------------------------------------------------------
#  Precios (consulta + descarga)
# --------------------------------------------------------------------------
def _prices_query(session, destination_id, platform, min_price, max_price, search):
    stmt = select(PricePoint)
    if destination_id is not None:
        stmt = stmt.where(PricePoint.destination_id == destination_id)
    if platform:
        stmt = stmt.where(PricePoint.platform == platform)
    if min_price is not None:
        stmt = stmt.where(PricePoint.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(PricePoint.price <= max_price)
    if search:
        stmt = stmt.where(PricePoint.name.ilike(f"%{search}%"))
    return stmt.order_by(desc(PricePoint.scraped_at))


@app.get("/api/prices", response_model=list[PricePointOut])
def list_prices(
    destination_id: int | None = None,
    platform: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    search: str | None = None,
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    stmt = _prices_query(session, destination_id, platform, min_price, max_price, search)
    stmt = stmt.limit(limit).offset(offset)
    return list(session.scalars(stmt).all())


@app.get("/api/prices.csv")
def download_prices_csv(
    destination_id: int | None = None,
    platform: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    search: str | None = None,
    session: Session = Depends(get_session),
):
    stmt = _prices_query(session, destination_id, platform, min_price, max_price, search)
    rows = session.scalars(stmt).all()

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        cols = [
            "id", "destination_id", "platform", "listing_id", "name", "url",
            "room_type", "price", "currency", "price_raw", "rating", "reviews",
            "checkin", "checkout", "scraped_at",
        ]
        writer.writerow(cols)
        yield buf.getvalue(); buf.seek(0); buf.truncate(0)
        for r in rows:
            writer.writerow([getattr(r, c) for c in cols])
            yield buf.getvalue(); buf.seek(0); buf.truncate(0)

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=precios.csv"},
    )


# --------------------------------------------------------------------------
#  Ejecuciones (diagnostico)
# --------------------------------------------------------------------------
@app.get("/api/runs", response_model=list[ScrapeRunOut])
def list_runs(
    destination_id: int | None = None,
    limit: int = Query(50, ge=1, le=500),
    session: Session = Depends(get_session),
):
    stmt = select(ScrapeRun)
    if destination_id is not None:
        stmt = stmt.where(ScrapeRun.destination_id == destination_id)
    stmt = stmt.order_by(desc(ScrapeRun.started_at)).limit(limit)
    return list(session.scalars(stmt).all())


@app.get("/api/stats")
def stats(session: Session = Depends(get_session)):
    return {
        "destinations": session.query(Destination).count(),
        "price_points": session.query(PricePoint).count(),
        "runs": session.query(ScrapeRun).count(),
    }


# --------------------------------------------------------------------------
#  Salud (para HEALTHCHECK de Docker y verificacion en el VPS)
# --------------------------------------------------------------------------
@app.get("/health")
def health():
    """Endpoint barato (no toca la BD) para healthcheck y Capa 1 de verificacion."""
    return {"status": "ok"}


# --------------------------------------------------------------------------
#  Frontend
# --------------------------------------------------------------------------
@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
