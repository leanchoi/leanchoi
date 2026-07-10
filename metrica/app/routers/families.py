"""Familias, destinos, hitos y ejecución de scrapeos."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_session
from ..deps import require_editor, require_viewer
from ..jobs import manager
from ..models import Destination, Family, Milestone, User
from ..planner import expand_stay_dates
from ..schemas import (
    DestinationIn, DestinationOut, FamilyIn, FamilyOut, MilestoneIn, MilestoneOut,
)

router = APIRouter(tags=["families"])


# ---- Familias ----
@router.get("/api/families", response_model=list[FamilyOut])
def list_families(session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    return session.query(Family).order_by(Family.id).all()


@router.get("/api/families/{fid}", response_model=FamilyOut)
def get_family(fid: int, session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    fam = session.get(Family, fid)
    if not fam:
        raise HTTPException(404, "Familia no encontrada")
    return fam


@router.post("/api/families", response_model=FamilyOut, status_code=201)
def create_family(payload: FamilyIn, session: Session = Depends(get_session),
                  _: User = Depends(require_editor)):
    fam = Family(**payload.model_dump())
    session.add(fam)
    session.commit()
    session.refresh(fam)
    return fam


@router.put("/api/families/{fid}", response_model=FamilyOut)
def update_family(fid: int, payload: FamilyIn, session: Session = Depends(get_session),
                  _: User = Depends(require_editor)):
    fam = session.get(Family, fid)
    if not fam:
        raise HTTPException(404, "Familia no encontrada")
    for k, v in payload.model_dump().items():
        setattr(fam, k, v)
    session.commit()
    session.refresh(fam)
    return fam


@router.delete("/api/families/{fid}", status_code=204)
def delete_family(fid: int, session: Session = Depends(get_session),
                  _: User = Depends(require_editor)):
    fam = session.get(Family, fid)
    if not fam:
        raise HTTPException(404, "Familia no encontrada")
    session.delete(fam)
    session.commit()


# ---- Destinos ----
@router.post("/api/families/{fid}/destinations", response_model=DestinationOut, status_code=201)
def add_destination(fid: int, payload: DestinationIn, session: Session = Depends(get_session),
                    _: User = Depends(require_editor)):
    fam = session.get(Family, fid)
    if not fam:
        raise HTTPException(404, "Familia no encontrada")
    dest = Destination(family_id=fid, **payload.model_dump())
    session.add(dest)
    session.commit()
    session.refresh(dest)
    return dest


@router.put("/api/destinations/{did}", response_model=DestinationOut)
def update_destination(did: int, payload: DestinationIn, session: Session = Depends(get_session),
                       _: User = Depends(require_editor)):
    dest = session.get(Destination, did)
    if not dest:
        raise HTTPException(404, "Destino no encontrado")
    for k, v in payload.model_dump().items():
        setattr(dest, k, v)
    session.commit()
    session.refresh(dest)
    return dest


@router.delete("/api/destinations/{did}", status_code=204)
def delete_destination(did: int, session: Session = Depends(get_session),
                       _: User = Depends(require_editor)):
    dest = session.get(Destination, did)
    if not dest:
        raise HTTPException(404, "Destino no encontrado")
    session.delete(dest)
    session.commit()


# ---- Hitos ----
@router.post("/api/families/{fid}/milestones", response_model=MilestoneOut, status_code=201)
def add_milestone(fid: int, payload: MilestoneIn, session: Session = Depends(get_session),
                  _: User = Depends(require_editor)):
    fam = session.get(Family, fid)
    if not fam:
        raise HTTPException(404, "Familia no encontrada")
    ms = Milestone(family_id=fid, **payload.model_dump())
    session.add(ms)
    session.commit()
    session.refresh(ms)
    return ms


@router.delete("/api/milestones/{mid}", status_code=204)
def delete_milestone(mid: int, session: Session = Depends(get_session),
                     _: User = Depends(require_editor)):
    ms = session.get(Milestone, mid)
    if not ms:
        raise HTTPException(404, "Hito no encontrado")
    session.delete(ms)
    session.commit()


# ---- Planificación (preview) y ejecución ----
@router.get("/api/families/{fid}/plan")
def preview_plan(fid: int, session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    """Muestra qué noches se medirían hoy (sin scrapear)."""
    fam = session.get(Family, fid)
    if not fam:
        raise HTTPException(404, "Familia no encontrada")
    dates = expand_stay_dates(fam, date.today())
    return {
        "family": fam.name,
        "today": date.today().isoformat(),
        "stay_dates_count": len(dates),
        "stay_dates": [d.isoformat() for d in dates],
        "destinations": [d.name for d in fam.destinations if d.enabled],
        "platforms": fam.platform_list,
    }


@router.post("/api/families/{fid}/run")
def run_family_now(fid: int, quick: bool = False, session: Session = Depends(get_session),
                   _: User = Depends(require_editor)):
    """Encola la medición de la familia.

    quick=True: prueba rápida (2 destinos × 2 noches, solo ARS, 1 página, timeout
    corto) para validar el flujo en un par de minutos. quick=False: completa.
    """
    fam = session.get(Family, fid)
    if not fam:
        raise HTTPException(404, "Familia no encontrada")
    if quick:
        return manager.enqueue_family(fid, limit_dates=2, limit_destinations=2, fast=True)
    return manager.enqueue_family(fid)


@router.post("/api/destinations/{did}/oneshot")
def oneshot(did: int, days: int = 3, session: Session = Depends(get_session),
            _: User = Depends(require_editor)):
    """Encola una foto rápida: un destino para las próximas `days` noches."""
    dest = session.get(Destination, did)
    if not dest:
        raise HTTPException(404, "Destino no encontrado")
    return manager.enqueue_oneshot(did, days=days)
