"""Automatización: programa el scrapeo de cada familia según su periodicidad."""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .db import session_scope
from .models import Family
from .scrapers.runner import run_family

logger = logging.getLogger("metrica.scheduler")

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")
    return _scheduler


def _job_id(family_id: int) -> str:
    return f"family-{family_id}"


async def _run_job(family_id: int) -> None:
    with session_scope() as session:
        fam = session.get(Family, family_id)
        if not fam or not fam.enabled:
            return
        logger.info("Scrapeo programado -> familia %s (%s)", family_id, fam.name)
        await run_family(session, fam)


def schedule_family(fam: Family) -> None:
    sched = get_scheduler()
    jid = _job_id(fam.id)
    if sched.get_job(jid):
        sched.remove_job(jid)
    if not fam.enabled:
        return
    sched.add_job(_run_job, trigger=IntervalTrigger(minutes=fam.interval_minutes or 1440),
                  id=jid, args=[fam.id], replace_existing=True,
                  misfire_grace_time=3600, coalesce=True, max_instances=1)


def load_all_jobs() -> None:
    with session_scope() as session:
        for fam in session.query(Family).filter(Family.enabled.is_(True)).all():
            schedule_family(fam)


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
