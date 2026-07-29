"""CLI de METRICA: arrancar el server y probar el scrapeo desde la terminal."""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
from datetime import date, timedelta

from .config import get_settings
from .db import init_db, session_scope
from .scrapers.runner import scrape_date
from .seed import seed_all

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def _cmd_initdb(_a) -> int:
    init_db()
    with session_scope() as s:
        seed_all(s)
    print("BD inicializada + seed (admin + preset BENCHMARK).")
    return 0


async def _cmd_scrape(a) -> int:
    s = get_settings()
    checkin = date.today() + timedelta(days=a.offset)
    checkout = checkin + timedelta(days=a.nights)
    print(f">> {a.platform} | '{a.query}' | {checkin} -> {checkout} | ARS+USD | páginas={a.pages}")
    print(">> proxy:", s.proxy_url.split("@")[-1] if s.proxy_url else "SIN proxy (recomendado en prod)")
    merged = await scrape_date(a.platform, a.query, checkin, checkout, a.adults, a.pages)
    print(f"\n>> {len(merged)} listings\n" + "=" * 60)
    for i, (ext, d) in enumerate(list(merged.items())[: a.show], 1):
        print(f"{i:>2}. [{ext[:18]:<18}] {d['name'][:40]:<40} ARS={d['price_ars']} USD={d['price_usd']}")
    if a.json:
        print(json.dumps(merged, ensure_ascii=False, indent=2))
    return 0 if merged else 2


async def _cmd_registry(a) -> int:
    """Crawlea los sitios oficiales de turismo y arma el registro."""
    from sqlalchemy import select

    from .models import Destination, RegistrySource
    from .registry.crawler import adoption_index, crawl_source, match_destination

    init_db()
    with session_scope() as s:
        q = select(RegistrySource).where(RegistrySource.enabled)
        if a.destination:
            dest = s.scalar(select(Destination).where(Destination.name == a.destination))
            if not dest:
                print(f"!! destino no encontrado: {a.destination}")
                return 2
            q = q.where(RegistrySource.destination_id == dest.id)
        sources = s.scalars(q).all()
        if not sources:
            print("!! no hay fuentes cargadas (se siembran al iniciar la app)")
            return 2

        print(f">> {len(sources)} fuente(s) · modo {'INSPECCIÓN' if a.dry_run else 'GUARDADO'}\n")
        dest_ids = set()
        for src in sources:
            print(f"-- {src.name}\n   {src.url}")
            out = await crawl_source(s, src, dry_run=a.dry_run)
            s.commit()
            if out.get("error"):
                print(f"   ERROR: {out['error']}\n")
                continue
            print(f"   estrategia={out['strategy']} · encontrados={out['found']} "
                  f"· guardados={out['saved']} · html={out.get('html_len')}b")
            for smp in out["sample"][:8]:
                print(f"     · {smp['name'][:52]:<52} [{smp['typology']}]"
                      f"{' ' + str(smp.get('typology_raw'))[:22] if smp.get('typology_raw') else ''}")
            if out["found"] == 0:
                print("     (sin resultados: hay que configurar 'selectors' para este sitio)")
            print()
            dest_ids.add(src.destination_id)

        if not a.dry_run and a.match:
            print(">> vinculando con los anuncios de plataforma…")
            for did in dest_ids:
                r = match_destination(s, did, threshold=a.threshold)
                s.commit()
                dest = s.get(Destination, did)
                print(f"   {dest.name}: {r['linked']}/{r['officials']} oficiales vinculados "
                      f"· {r['retyped']} tipologías corregidas")
            idx = adoption_index(s, list(dest_ids))
            t = idx["total"]
            print(f"\n>> ADOPCIÓN DIGITAL: {t['online']}/{t['official']} "
                  f"({t['pct']}%) del inventario oficial está publicado online")
            for row in idx["by_typology"]:
                print(f"   {row['typology']:<14} {row['online']}/{row['official']} ({row['pct']}%)")
    return 0


def _cmd_serve(a) -> int:
    import uvicorn
    s = get_settings()
    uvicorn.run("app.main:app", host=a.host or s.host, port=a.port or s.port, reload=a.reload)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="app.cli", description="METRICA")
    sub = p.add_subparsers(dest="cmd", required=True)

    ip = sub.add_parser("initdb"); ip.set_defaults(func=_cmd_initdb)

    sp = sub.add_parser("scrape", help="Prueba de scrapeo (ARS+USD), no toca la BD")
    sp.add_argument("--query", required=True)
    sp.add_argument("--platform", choices=["booking", "airbnb"], required=True)
    sp.add_argument("--pages", type=int, default=2)
    sp.add_argument("--adults", type=int, default=1)
    sp.add_argument("--nights", type=int, default=1)
    sp.add_argument("--offset", type=int, default=30)
    sp.add_argument("--show", type=int, default=20)
    sp.add_argument("--json", action="store_true")
    sp.set_defaults(func=lambda a: asyncio.run(_cmd_scrape(a)))

    rg = sub.add_parser("registry", help="Crawlea los sitios oficiales de turismo")
    rg.add_argument("--destination", default=None, help="Solo este destino (ej. Esquel)")
    rg.add_argument("--dry-run", action="store_true", help="Inspecciona sin guardar")
    rg.add_argument("--match", action="store_true", help="Vincular con anuncios y corregir tipologías")
    rg.add_argument("--threshold", type=float, default=0.62, help="Umbral de similitud de nombres")
    rg.set_defaults(func=lambda a: asyncio.run(_cmd_registry(a)))

    sv = sub.add_parser("serve", help="Arranca el servidor")
    sv.add_argument("--host", default=None); sv.add_argument("--port", type=int, default=None)
    sv.add_argument("--reload", action="store_true")
    sv.set_defaults(func=_cmd_serve)
    return p


def main() -> int:
    a = build_parser().parse_args()
    return a.func(a)


if __name__ == "__main__":
    raise SystemExit(main())
