"""Automatización: programa el scrapeo de cada familia según su periodicidad."""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .db import session_scope
from .jobs import manager
from .models import Family

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
    logger.info("Scrapeo programado -> encolando familia %s", family_id)
    manager.enqueue_family(family_id)


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


async def _watchdog() -> None:
    """Guardián: revisa la salud del sistema y repara lo que puede solo.

    El objetivo es que el sistema NO se degrade en silencio entre una revisión y
    otra: limpia procesos de navegador colgados (la causa del agotamiento de
    recursos) y deja registrado en el log si algo quedó mal.
    """
    from .doctor import run_doctor

    try:
        rep = await run_doctor(repair=True, hours=24)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Watchdog no pudo ejecutarse: %s", exc)
        return
    if rep["fails"]:
        for c in rep["checks"]:
            if c["level"] == "FALLA":
                logger.error("WATCHDOG · %s: %s%s", c["check"], c["detail"],
                             f" -> {c['fix']}" if c.get("fix") else "")
    else:
        logger.info("Watchdog OK (%d avisos)", rep["warns"])


def start() -> None:
    sched = get_scheduler()
    if not sched.running:
        sched.start()
        logger.info("Scheduler iniciado")
    load_all_jobs()
    # Chequeo de salud cada 3 horas, con limpieza automática de procesos colgados.
    sched.add_job(_watchdog, trigger=IntervalTrigger(hours=3), id="watchdog",
                  replace_existing=True, misfire_grace_time=1800,
                  coalesce=True, max_instances=1)


def shutdown() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
