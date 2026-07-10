"""Cola de trabajos de scrapeo en background, con progreso en vivo y ETA.

Un único worker procesa los trabajos de a uno (evita saturar recursos y las
plataformas). Cada trabajo actualiza su avance en la tabla `jobs`, que el
frontend consulta para mostrar barra de progreso, ítem actual y ETA.

Nota: el registro de cancelaciones vive en memoria; el sistema corre en un
único proceso uvicorn, así que alcanza. Al reiniciar, los trabajos que
quedaron 'running/queued' se marcan como interrumpidos.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from .db import session_scope
from .models import Destination, Family, Job
from .planner import expand_stay_dates
from .scrapers.runner import run_destination

logger = logging.getLogger("metrica.jobs")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobManager:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[int] = asyncio.Queue()
        self._cancels: set[int] = set()
        self._worker: asyncio.Task | None = None

    # ---- ciclo de vida ----
    def start(self) -> None:
        if self._worker is None or self._worker.done():
            # Recrear la cola ligada al loop activo (evita cruces de event loop).
            self._queue = asyncio.Queue()
            self._worker = asyncio.create_task(self._run_worker())
            logger.info("Worker de trabajos iniciado")

    def stop(self) -> None:
        if self._worker and not self._worker.done():
            self._worker.cancel()

    @staticmethod
    def reset_orphans() -> None:
        """Marca como interrumpidos los trabajos que quedaron colgados por un reinicio."""
        with session_scope() as s:
            for job in s.query(Job).filter(Job.status.in_(["queued", "running"])).all():
                job.status = "error"
                job.error = "Interrumpido por reinicio del servidor"
                job.finished_at = _utcnow()

    # ---- encolar ----
    def enqueue_family(self, family_id: int, limit_dates: int | None = None,
                       limit_destinations: int | None = None, fast: bool = False) -> dict:
        with session_scope() as s:
            fam = s.get(Family, family_id)
            if not fam:
                raise ValueError("Familia no encontrada")
            label = fam.name + (" · prueba rápida" if fast else "")
            job = Job(kind="family", label=label, family_id=family_id,
                      params={"limit_dates": limit_dates, "limit_destinations": limit_destinations,
                              "fast": fast}, status="queued")
            s.add(job)
            s.flush()
            jid = job.id
            data = _job_dict(job)
        self._queue.put_nowait(jid)
        return data

    def enqueue_oneshot(self, destination_id: int, days: int = 3, fast: bool = True) -> dict:
        with session_scope() as s:
            dest = s.get(Destination, destination_id)
            if not dest:
                raise ValueError("Destino no encontrado")
            job = Job(kind="oneshot", label=f"{dest.name} · foto rápida",
                      destination_id=destination_id, family_id=dest.family_id,
                      params={"days": days, "fast": fast}, status="queued")
            s.add(job)
            s.flush()
            jid = job.id
            data = _job_dict(job)
        self._queue.put_nowait(jid)
        return data

    def cancel(self, job_id: int) -> None:
        self._cancels.add(job_id)

    # ---- worker ----
    async def _run_worker(self) -> None:
        while True:
            job_id = await self._queue.get()
            try:
                await self._process(job_id)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Fallo procesando job %s", job_id)
                msg = f"{type(exc).__name__}: {exc}"[:1500]
                with session_scope() as s:
                    job = s.get(Job, job_id)
                    if job:
                        job.status = "error"; job.error = msg; job.finished_at = _utcnow()
            finally:
                self._cancels.discard(job_id)
                self._queue.task_done()

    async def _process(self, job_id: int) -> None:
        with session_scope() as s:
            job = s.get(Job, job_id)
            if not job:
                return
            if job_id in self._cancels:
                job.status = "cancelled"; job.finished_at = _utcnow(); return

            job.status = "running"; job.started_at = _utcnow(); s.commit()

            def cancel_check() -> bool:
                return job_id in self._cancels

            def progress(label: str, obs_delta: int) -> None:
                job.done_units += 1
                job.observations += obs_delta
                job.current_label = label
                s.commit()

            def status(label: str) -> None:
                # Reporta en vivo sin avanzar el contador (proof-of-life).
                job.current_label = label
                s.commit()

            params = job.params or {}
            fast = bool(params.get("fast"))
            # En modo rápido, para pruebas, medimos solo en ARS (mitad de tiempo).
            currencies = ("ARS",) if fast else ("ARS", "USD")
            max_pages = 1 if fast else 5

            if job.kind == "family":
                fam = s.get(Family, job.family_id)
                dests = [d for d in fam.destinations if d.enabled]
                platforms = fam.platform_list
                dates = expand_stay_dates(fam, date.today())
                limit = params.get("limit_dates")
                if limit:
                    dates = dates[:limit]
                limit_dest = params.get("limit_destinations")
                if limit_dest:
                    dests = dests[:limit_dest]
                job.total_units = len(dests) * len(platforms) * len(dates)
                s.commit()
                for dest in dests:
                    if cancel_check():
                        break
                    await run_destination(s, dest, dates, platforms, fam.adults, fam.nights,
                                          max_pages=max_pages, family_id=fam.id,
                                          progress=progress, cancel=cancel_check,
                                          status=status, fast=fast, currencies=currencies)
                fam.last_run_at = _utcnow()
            else:  # oneshot
                dest = s.get(Destination, job.destination_id)
                fam = dest.family
                days = params.get("days", 3)
                dates = [date.today() + timedelta(days=i) for i in range(1, days + 1)]
                platforms = fam.platform_list
                job.total_units = len(platforms) * len(dates)
                s.commit()
                await run_destination(s, dest, dates, platforms, fam.adults, fam.nights,
                                      max_pages=max_pages, family_id=fam.id,
                                      progress=progress, cancel=cancel_check,
                                      status=status, fast=fast, currencies=currencies)

            job.status = "cancelled" if cancel_check() else "done"
            job.current_label = None
            job.finished_at = _utcnow()
            s.commit()
            logger.info("Job %s terminado: %s (%d obs)", job_id, job.status, job.observations)


def _eta_seconds(job: Job) -> int | None:
    if job.status != "running" or not job.started_at or job.done_units <= 0:
        return None
    elapsed = (_utcnow() - job.started_at).total_seconds()
    rate = elapsed / job.done_units
    remaining = max(job.total_units - job.done_units, 0)
    return int(rate * remaining)


def _job_dict(job: Job) -> dict:
    pct = round(100 * job.done_units / job.total_units, 1) if job.total_units else 0.0
    return {
        "id": job.id, "kind": job.kind, "label": job.label, "status": job.status,
        "total_units": job.total_units, "done_units": job.done_units, "pct": pct,
        "observations": job.observations, "current_label": job.current_label,
        "eta_seconds": _eta_seconds(job), "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


# Singleton
manager = JobManager()
