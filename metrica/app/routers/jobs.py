"""Cola de trabajos: estado, progreso y cancelación."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..deps import require_editor, require_viewer
from ..jobs import _job_dict, manager
from ..models import Job, User

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
def list_jobs(limit: int = Query(30, ge=1, le=200), active_only: bool = False,
              session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    stmt = select(Job)
    if active_only:
        stmt = stmt.where(Job.status.in_(["queued", "running"]))
    stmt = stmt.order_by(desc(Job.id)).limit(limit)
    return [_job_dict(j) for j in session.scalars(stmt).all()]


@router.get("/{job_id}")
def get_job(job_id: int, session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Trabajo no encontrado")
    return _job_dict(job)


@router.post("/{job_id}/cancel")
def cancel_job(job_id: int, session: Session = Depends(get_session), _: User = Depends(require_editor)):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Trabajo no encontrado")
    if job.status in ("done", "error", "cancelled"):
        return {"status": job.status, "note": "ya finalizado"}
    manager.cancel(job_id)
    return {"status": "cancelling"}
