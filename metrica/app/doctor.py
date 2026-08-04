"""Autodiagnóstico y reparación de METRICA.

Un solo comando que responde "¿por qué no está midiendo?" y arregla lo que puede
arreglar solo. Pensado para correrse desde la terminal del VPS (o programado),
sin tener que interpretar logs.

Chequea, en orden de lo que rompe todo primero:
  1. Recursos del servidor (procesos, descriptores, memoria, disco, /dev/shm)
  2. Procesos huérfanos de Chromium (y los limpia)
  3. Navegador funcionando dentro del contenedor
  4. Parsers contra muestras guardadas (¿cambió el markup?)
  5. Base de datos y últimas corridas (¿qué dijo cada plataforma?)
"""
from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import time
from datetime import datetime, timedelta, timezone

OK, WARN, FAIL = "OK", "AVISO", "FALLA"


def _res(check: str, level: str, detail: str, fix: str | None = None) -> dict:
    return {"check": check, "level": level, "detail": detail, "fix": fix}


# --------------------------------------------------------------------------
def check_resources() -> list[dict]:
    """Lo que causó el BlockingIOError: procesos/descriptores/memoria/disco."""
    out = []
    try:
        nproc = len(os.listdir("/proc")) if os.path.isdir("/proc") else -1
        pids = [p for p in os.listdir("/proc") if p.isdigit()] if nproc > 0 else []
        n = len(pids)
        lvl = FAIL if n > 1500 else (WARN if n > 700 else OK)
        out.append(_res("procesos activos", lvl, f"{n} procesos",
                        "reiniciá el contenedor si están altos" if lvl != OK else None))
    except Exception as exc:  # noqa: BLE001
        out.append(_res("procesos activos", WARN, f"no se pudo leer: {exc}"))

    try:
        soft, hard = __import__("resource").getrlimit(__import__("resource").RLIMIT_NOFILE)
        n_open = len(os.listdir("/proc/self/fd"))
        lvl = FAIL if n_open > soft * 0.8 else (WARN if n_open > soft * 0.5 else OK)
        out.append(_res("descriptores de archivo", lvl, f"{n_open} abiertos (límite {soft})"))
    except Exception as exc:  # noqa: BLE001
        out.append(_res("descriptores de archivo", WARN, f"no se pudo leer: {exc}"))

    try:
        with open("/proc/meminfo") as fh:
            mem = {l.split(":")[0]: int(l.split()[1]) for l in fh if ":" in l}
        avail_mb = mem.get("MemAvailable", 0) // 1024
        lvl = FAIL if avail_mb < 200 else (WARN if avail_mb < 500 else OK)
        out.append(_res("memoria disponible", lvl, f"{avail_mb} MB",
                        "Chromium necesita ~300MB por instancia" if lvl != OK else None))
    except Exception as exc:  # noqa: BLE001
        out.append(_res("memoria disponible", WARN, f"no se pudo leer: {exc}"))

    try:
        du = shutil.disk_usage("/")
        free_mb = du.free // (1024 * 1024)
        lvl = FAIL if free_mb < 500 else (WARN if free_mb < 2000 else OK)
        out.append(_res("disco libre", lvl, f"{free_mb} MB"))
    except Exception as exc:  # noqa: BLE001
        out.append(_res("disco libre", WARN, f"no se pudo leer: {exc}"))

    if os.path.isdir("/dev/shm"):
        try:
            du = shutil.disk_usage("/dev/shm")
            free_mb = du.free // (1024 * 1024)
            lvl = FAIL if free_mb < 64 else (WARN if free_mb < 256 else OK)
            out.append(_res("/dev/shm", lvl, f"{free_mb} MB libres",
                            "subí shm_size en docker-compose (1gb)" if lvl != OK else None))
        except Exception:  # noqa: BLE001
            pass
    return out


def orphan_chromium(kill: bool = False) -> dict:
    """Detecta (y opcionalmente mata) procesos de Chromium/Playwright colgados."""
    found = []
    for pid in [p for p in os.listdir("/proc") if p.isdigit()]:
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as fh:
                cmd = fh.read().decode("utf-8", "ignore").replace("\0", " ")
            with open(f"/proc/{pid}/stat") as fh:
                start_ticks = int(fh.read().split()[21])
        except Exception:  # noqa: BLE001
            continue
        if not cmd:
            continue
        if ("chrome" in cmd or "chromium" in cmd or "playwright" in cmd
                or "headless_shell" in cmd):
            hz = os.sysconf("SC_CLK_TCK") or 100
            with open("/proc/uptime") as fh:
                uptime = float(fh.read().split()[0])
            age_min = (uptime - start_ticks / hz) / 60
            found.append({"pid": int(pid), "age_min": round(age_min, 1), "cmd": cmd[:90]})

    # "Huérfano" = lleva más de 20 minutos vivo: ningún scrapeo sano dura tanto.
    stale = [p for p in found if p["age_min"] > 20]
    killed = []
    if kill:
        for p in stale:
            try:
                os.kill(p["pid"], 9)
                killed.append(p["pid"])
            except Exception:  # noqa: BLE001
                pass
    return {"total": len(found), "stale": stale, "killed": killed}


async def check_browser() -> dict:
    """¿Arranca y renderiza Chromium dentro del contenedor? Sin red externa."""
    from .scrapers.booking import BookingScraper
    t0 = time.time()
    try:
        async def _run():
            async with BookingScraper(retries=1, goto_timeout=8000) as sc:
                ctx = await sc._new_context()
                page = await ctx.new_page()
                await page.set_content("<h1 id='t'>ok</h1>")
                txt = await page.inner_text("#t")
                await ctx.close()
                return txt
        txt = await asyncio.wait_for(_run(), timeout=60)
        ms = int((time.time() - t0) * 1000)
        return {"ok": txt == "ok", "ms": ms, "error": None}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "ms": int((time.time() - t0) * 1000),
                "error": f"{type(exc).__name__}: {exc}"[:200]}


def check_parsers() -> list[dict]:
    """¿Siguen funcionando los extractores? Detecta cambios de markup."""
    from pathlib import Path

    from .scrapers.airbnb import AirbnbScraper
    from .scrapers.booking import SEL_CARD, BookingScraper

    fx = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
    out = []
    try:
        html = (fx / "booking_sample.html").read_text(encoding="utf-8")
        sc = BookingScraper()
        rows = sc.parse(html, "2026-01-01", "2026-01-02")
        primary = sc.diag.get("selector") == SEL_CARD
        out.append(_res("parser booking", OK if rows and primary else FAIL,
                        f"{len(rows)} extraídos · selector={sc.diag.get('selector')}",
                        None if primary else "el selector primario dejó de matchear"))
    except Exception as exc:  # noqa: BLE001
        out.append(_res("parser booking", FAIL, str(exc)[:120]))
    try:
        html = (fx / "airbnb_sample.html").read_text(encoding="utf-8")
        rows = AirbnbScraper().parse(html, "2026-01-01", "2026-01-02")
        out.append(_res("parser airbnb", OK if rows else FAIL, f"{len(rows)} extraídos"))
    except Exception as exc:  # noqa: BLE001
        out.append(_res("parser airbnb", FAIL, str(exc)[:120]))
    return out


def check_runs(hours: int = 48) -> list[dict]:
    """Qué vienen diciendo las últimas corridas de cada plataforma."""
    from sqlalchemy import select

    from .db import session_scope
    from .models import ScrapeRun

    out = []
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    with session_scope() as s:
        runs = s.scalars(select(ScrapeRun).where(ScrapeRun.started_at >= since)).all()
        if not runs:
            return [_res(f"corridas últimas {hours}h", WARN, "ninguna corrida registrada",
                         "programá una medición o lanzala a mano")]
        for plat in ("booking", "airbnb"):
            rs = [r for r in runs if r.platform == plat]
            if not rs:
                out.append(_res(f"corridas {plat}", WARN, "sin corridas en el período"))
                continue
            okc = sum(1 for r in rs if r.status == "ok")
            obs = sum(r.observations or 0 for r in rs)
            worst = {}
            for r in rs:
                if r.status != "ok":
                    worst[r.status] = (worst.get(r.status, 0)) + 1
            lvl = OK if okc and obs else (FAIL if not okc else WARN)
            detail = f"{okc}/{len(rs)} ok · {obs} observaciones"
            if worst:
                detail += " · fallos: " + ", ".join(f"{k}×{v}" for k, v in worst.items())
            fix = None
            if "resources" in worst:
                fix = "el servidor se quedó sin recursos: reiniciá el contenedor"
            elif "blocked" in worst:
                fix = "IP bloqueada: configurá PROXY_URL (proxy residencial)"
            elif "empty" in worst:
                fix = "cargó sin bloqueo y no parseó: cambió el markup de la plataforma"
            out.append(_res(f"corridas {plat}", lvl, detail, fix))
    return out


# --------------------------------------------------------------------------
def check_providers() -> list[dict]:
    """Qué fuente de datos usa cada plataforma y si está bien configurada."""
    from .config import get_settings
    from .scrapers.providers import provider_name_for

    s = get_settings()
    out = []
    for plat in ("booking", "airbnb"):
        name = provider_name_for(plat, s)
        proxy = getattr(s, f"proxy_url_{plat}", None) or s.proxy_url
        detail = f"fuente={name}" + (" · con proxy" if proxy else " · SIN proxy")
        lvl, fix = OK, None
        if name == "browser" and plat == "airbnb" and not proxy:
            lvl = WARN
            fix = ("Airbnb desde IP de datacenter devuelve resultados VACÍOS. Poné "
                   "PROXY_URL_AIRBNB (proxy residencial) o cambiá AIRBNB_PROVIDER=apify")
        if name == "apify" and not s.apify_token:
            lvl, fix = FAIL, "falta APIFY_TOKEN"
        if name == "http" and not s.airbnb_api_url:
            lvl, fix = FAIL, "falta AIRBNB_API_URL"
        out.append(_res(f"fuente {plat}", lvl, detail, fix))
    return out


async def run_doctor(repair: bool = False, hours: int = 48) -> dict:
    checks: list[dict] = []
    checks += check_resources()
    checks += check_providers()

    orph = orphan_chromium(kill=repair)
    lvl = OK if not orph["stale"] else (OK if orph["killed"] else WARN)
    detail = f"{orph['total']} procesos de navegador · {len(orph['stale'])} colgados"
    if orph["killed"]:
        detail += f" · {len(orph['killed'])} eliminados"
    checks.append(_res("procesos de navegador", lvl, detail,
                       None if (not orph["stale"] or orph["killed"])
                       else "corré con --repair para limpiarlos"))

    br = await check_browser()
    checks.append(_res("navegador", OK if br["ok"] else FAIL,
                       f"{br['ms']}ms" + (f" · {br['error']}" if br["error"] else ""),
                       None if br["ok"] else "revisá la imagen Docker y shm_size"))

    checks += check_parsers()
    try:
        checks += check_runs(hours)
    except Exception as exc:  # noqa: BLE001
        checks.append(_res("corridas", WARN, f"no se pudo consultar la BD: {exc}"[:150]))

    fails = [c for c in checks if c["level"] == FAIL]
    warns = [c for c in checks if c["level"] == WARN]
    return {"checks": checks, "fails": len(fails), "warns": len(warns),
            "ok": not fails,
            "verdict": ("Todo en orden." if not fails and not warns else
                        "Hay avisos, pero el sistema puede medir." if not fails else
                        "HAY FALLAS que impiden medir — mirá los 'cómo arreglar'.")}


def print_report(rep: dict) -> None:
    icons = {OK: "OK  ", WARN: "AVISO", FAIL: "FALLA"}
    print("\n=== DIAGNÓSTICO METRICA ===\n")
    for c in rep["checks"]:
        print(f"  [{icons[c['level']]:<5}] {c['check']:<26} {c['detail']}")
        if c.get("fix"):
            print(f"            -> {c['fix']}")
    print(f"\n  {rep['verdict']}")
    print(f"  fallas={rep['fails']} avisos={rep['warns']}\n")
