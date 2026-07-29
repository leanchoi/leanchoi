"""METRICA — API + frontend con autenticación y panel de administración."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import scheduler
from .db import init_db, session_scope
from .jobs import manager
from .routers import (auth, dashboard, data, diagnostics, families, jobs, listings,
                      registry, report, users)
from .seed import seed_all

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("metrica")

STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with session_scope() as session:
        seed_all(session)
    manager.reset_orphans()   # limpia trabajos colgados por un reinicio
    manager.start()           # worker de la cola de trabajos
    scheduler.start()
    logger.info("METRICA lista")
    yield
    scheduler.shutdown()
    manager.stop()


app = FastAPI(title="METRICA", version="0.1.0", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(families.router)
app.include_router(data.router)
app.include_router(dashboard.router)
app.include_router(jobs.router)
app.include_router(diagnostics.router)
app.include_router(listings.router)
app.include_router(report.router)
app.include_router(registry.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/login")
def login_page():
    return FileResponse(STATIC / "login.html")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
