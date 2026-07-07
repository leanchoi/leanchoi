"""CLI para operar y, sobre todo, PROBAR el scrapeo desde la terminal.

Uso tipico en tu VPS (donde SI hay salida a internet):

    # Prueba directa de scrapeo, imprime resultados sin tocar la BD:
    python -m app.cli scrape --query "Madrid" --platform booking --pages 1
    python -m app.cli scrape --query "Barcelona" --platform airbnb

    # Inicializa la BD:
    python -m app.cli initdb

    # Crea un destino y lanza su scrapeo (guardando en BD):
    python -m app.cli add-destination --query "Valencia" --platforms booking,airbnb
    python -m app.cli run --destination 1

    # Arranca el servidor web (front + API + scheduler):
    python -m app.cli serve
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
from dataclasses import asdict

from .config import get_settings
from .db import init_db, session_scope
from .models import Destination
from .scrapers.runner import compute_dates, run_destination, scrape_platform

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


async def _cmd_scrape(args) -> int:
    s = get_settings()
    checkin, checkout = compute_dates(args.offset, args.nights)
    print(f">> Scrapeando {args.platform} | destino='{args.query}' "
          f"| {checkin} -> {checkout} | adultos={args.adults} | paginas={args.pages}")
    if s.proxy_url:
        print(f">> Usando proxy: {s.proxy_url.split('@')[-1]}")
    else:
        print(">> SIN proxy (recomendado configurar PROXY_URL residencial en produccion)")

    listings = await scrape_platform(
        args.platform, args.query, checkin, checkout, args.adults, args.currency, args.pages
    )
    print(f"\n>> {len(listings)} resultados\n" + "=" * 60)
    for i, lst in enumerate(listings[: args.show], 1):
        price = f"{lst.price} {lst.currency}" if lst.price else (lst.price_raw or "s/precio")
        rating = f" | ⭐ {lst.rating}" if lst.rating else ""
        print(f"{i:>2}. {lst.name[:55]:<55} {price}{rating}")
    if args.json:
        print("\n--- JSON ---")
        print(json.dumps([asdict(l) for l in listings], ensure_ascii=False, indent=2))
    if not listings:
        print("\n(!) 0 resultados: revisa proxy, o Booking/Airbnb aplicaron bloqueo.")
        return 2
    return 0


def _cmd_initdb(_args) -> int:
    init_db()
    print("BD inicializada.")
    return 0


def _cmd_add_destination(args) -> int:
    init_db()
    with session_scope() as session:
        dest = Destination(
            query=args.query, platforms=args.platforms, adults=args.adults,
            nights=args.nights, checkin_offset_days=args.offset, currency=args.currency,
            interval_minutes=args.interval, cron=args.cron, max_pages=args.pages,
        )
        session.add(dest)
        session.flush()
        print(f"Destino creado id={dest.id}: {dest.query} [{dest.platforms}]")
    return 0


async def _cmd_run(args) -> int:
    init_db()
    with session_scope() as session:
        dest = session.get(Destination, args.destination)
        if not dest:
            print(f"No existe el destino {args.destination}")
            return 1
        summary = await run_destination(session, dest)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def _cmd_serve(args) -> int:
    import uvicorn

    s = get_settings()
    uvicorn.run("app.main:app", host=args.host or s.host, port=args.port or s.port, reload=args.reload)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="app.cli", description="Scraper de precios Booking/Airbnb")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("scrape", help="Prueba de scrapeo directa (no toca la BD)")
    sp.add_argument("--query", required=True)
    sp.add_argument("--platform", choices=["booking", "airbnb"], required=True)
    sp.add_argument("--pages", type=int, default=1)
    sp.add_argument("--adults", type=int, default=2)
    sp.add_argument("--nights", type=int, default=2)
    sp.add_argument("--offset", type=int, default=30, help="dias hasta el check-in")
    sp.add_argument("--currency", default="EUR")
    sp.add_argument("--show", type=int, default=20, help="cuantos imprimir")
    sp.add_argument("--json", action="store_true", help="volcar JSON completo")
    sp.set_defaults(func=lambda a: asyncio.run(_cmd_scrape(a)))

    ip = sub.add_parser("initdb", help="Crea las tablas")
    ip.set_defaults(func=_cmd_initdb)

    ap = sub.add_parser("add-destination", help="Crea un destino en la BD")
    ap.add_argument("--query", required=True)
    ap.add_argument("--platforms", default="booking,airbnb")
    ap.add_argument("--adults", type=int, default=2)
    ap.add_argument("--nights", type=int, default=2)
    ap.add_argument("--offset", type=int, default=30)
    ap.add_argument("--currency", default="EUR")
    ap.add_argument("--interval", type=int, default=1440, help="minutos entre scrapeos")
    ap.add_argument("--cron", default=None, help="expresion cron (alternativa a --interval)")
    ap.add_argument("--pages", type=int, default=2)
    ap.set_defaults(func=_cmd_add_destination)

    rp = sub.add_parser("run", help="Scrapea un destino y guarda en BD")
    rp.add_argument("--destination", type=int, required=True)
    rp.set_defaults(func=lambda a: asyncio.run(_cmd_run(a)))

    sv = sub.add_parser("serve", help="Arranca el servidor web (front + API + scheduler)")
    sv.add_argument("--host", default=None)
    sv.add_argument("--port", type=int, default=None)
    sv.add_argument("--reload", action="store_true")
    sv.set_defaults(func=_cmd_serve)

    return p


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
