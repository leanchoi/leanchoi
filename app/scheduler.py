"""Planificador de scrapeos automaticos por destino (APScheduler).

Cada destino define su periodicidad (interval_minutes o expresion cron). Este
modulo mantiene el scheduler sincronizado con la tabla de destinos: al crear,
editar, activar/desactivar o borrar un destino, se re-registra su job.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .db import session_scope
from .models import Destination
from .scrapers.runner import run_destination

logger = logging.getLogger("scheduler")

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")
    return _scheduler


def _job_id(destination_id: int) -> str:
    return f"dest-{destination_id}"


async def _run_job(destination_id: int) -> None:
    """Callback del scheduler: carga el destino y lo scrapea."""
    with session_scope() as session:
        dest = session.get(Destination, destination_id)
        if not dest or not dest.enabled:
            return
        logger.info("Scrapeo programado -> destino %s (%s)", destination_id, dest.query)
        await run_destination(session, dest)


def schedule_destination(dest: Destination) -> None:
    """Registra (o reemplaza) el job de un destino segun su periodicidad."""
    sched = get_scheduler()
    job_id = _job_id(dest.id)

    # Quitar job previo si existe
    if sched.get_job(job_id):
        sched.remove_job(job_id)

    if not dest.enabled:
        return

    if dest.cron:
        trigger = CronTrigger.from_crontab(dest.cron, timezone="UTC")
    else:
        minutes = dest.interval_minutes or 1440
        trigger = IntervalTrigger(minutes=minutes)

    sched.add_job(
        _run_job, trigger=trigger, id=job_id, args=[dest.id],
        replace_existing=True, misfire_grace_time=3600, coalesce=True, max_instances=1,
    )
    logger.info("Job programado para destino %s (%s)", dest.id, dest.query)


def unschedule_destination(destination_id: int) -> None:
    sched = get_scheduler()
    if sched.get_job(_job_id(destination_id)):
        sched.remove_job(_job_id(destination_id))


def load_all_jobs() -> None:
    """Al arrancar: programa todos los destinos activos."""
    with session_scope() as session:
        for dest in session.query(Destination).filter(Destination.enabled.is_(True)).all():
            schedule_destination(dest)


def start() -> None:
    sched = get_scheduler()
    if not sched.running:
        sched.start()
        logger.info("Scheduler iniciado")
    load_all_jobs()


def shutdown() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
