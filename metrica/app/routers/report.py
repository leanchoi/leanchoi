"""Reporte ejecutivo (foto) con conclusiones automáticas — imprimible."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..deps import require_viewer
from ..models import Destination, Family, FxDaily, Listing, Observation, User
from .dashboard import (Filters, _current, _filters, _last_observed,
                        _price_col, _scope_dest_ids, _universe)

router = APIRouter(prefix="/api/report", tags=["report"])

TYP_LABEL = {"cabana": "las cabañas", "departamento": "los departamentos", "hotel": "los hoteles",
             "hosteria": "las hosterías", "hostel": "los hostels", "casa": "las casas",
             "otro": "los sin clasificar"}


def _money(v, cur):
    if v is None:
        return "—"
    pref = "u$s " if cur == "USD" else "$ "
    return pref + f"{round(v):,}".replace(",", ".")


@router.get("")
def report(f: Filters = Depends(_filters), session: Session = Depends(get_session),
           _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    last = _last_observed(session, f, dest_ids)
    fam = session.get(Family, f.family_id) if f.family_id else None

    out = {
        "family": fam.name if fam else "Todos los destinos",
        "currency": f.currency,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "last_observed": last.isoformat() if last else None,
        "kpis": {}, "insights": [], "typology": [], "destinations": [],
        "top_cheap": [], "top_expensive": [], "calendar": [],
        "destinations_active": [session.get(Destination, d).name for d in dest_ids] if dest_ids else [],
    }
    if not last:
        out["insights"] = ["Todavía no hay datos para este destino. Corré una medición para generar el reporte."]
        return out

    snap = select(Observation).where(_current(f, dest_ids)).subquery()
    pcol = snap.c.price_usd if f.currency == "USD" else snap.c.price_ars
    avg, mn, mx, live, ntyp = session.execute(select(
        func.avg(pcol), func.min(pcol), func.max(pcol),
        func.count(distinct(snap.c.listing_id)), func.count(distinct(snap.c.typology)),
    )).first()
    universe = _universe(session, f, dest_ids)
    fx = session.scalar(select(func.avg(FxDaily.fx_rate)).where(FxDaily.observed_date == last))
    avail_idx = round(live / universe, 2) if universe else None
    out["kpis"] = {
        "avg_price": round(avg, 2) if avg else None, "min_price": round(mn, 2) if mn else None,
        "max_price": round(mx, 2) if mx else None, "listings_live": live or 0,
        "availability_index": avail_idx, "occupancy_pct": round((1 - live / universe) * 100) if universe else None,
        "fx": round(fx, 2) if fx else None, "typologies": ntyp or 0,
    }

    # --- por tipología ---
    tq = select(Observation.typology, func.avg(price), func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids), price.is_not(None)).group_by(Observation.typology)
    typ_rows = [{"typology": t, "avg_price": round(a, 2) if a else None, "listings": n}
                for t, a, n in session.execute(tq).all()]
    typ_rows.sort(key=lambda r: r["avg_price"] or 0)
    out["typology"] = typ_rows

    # --- por destino ---
    dq = select(Observation.destination_id, func.avg(price), func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids), price.is_not(None)).group_by(Observation.destination_id)
    dname = {d.id: d.name for d in session.scalars(select(Destination)).all()}
    dest_rows = [{"name": dname.get(did, f"#{did}"), "avg_price": round(a, 2) if a else None, "listings": n}
                 for did, a, n in session.execute(dq).all()]
    dest_rows.sort(key=lambda r: r["avg_price"] or 0)
    out["destinations"] = dest_rows

    # --- top baratos / caros (por listing) ---
    lq = select(Observation.listing_id, func.avg(price).label("p")) \
        .where(_current(f, dest_ids), price.is_not(None)).group_by(Observation.listing_id)
    lrows = [(lid, float(p)) for lid, p in session.execute(lq).all() if p is not None]
    lrows.sort(key=lambda x: x[1])
    lmap = {l.id: l for l in session.scalars(
        select(Listing).where(Listing.id.in_([r[0] for r in lrows]))).all()} if lrows else {}

    def _l(row):
        lst = lmap.get(row[0])
        return {"name": lst.name if lst else f"#{row[0]}", "price": round(row[1], 2),
                "typology": lst.typology if lst else "otro", "url": lst.url if lst else None}
    out["top_cheap"] = [_l(r) for r in lrows[:5]]
    out["top_expensive"] = [_l(r) for r in reversed(lrows[-5:])]

    # --- calendario (para mini-heatmap del reporte) ---
    cq = select(Observation.stay_checkin, func.avg(price), func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids),
               Observation.stay_checkin >= date.today(),
               Observation.stay_checkin <= date.today() + timedelta(days=45)) \
        .group_by(Observation.stay_checkin).order_by(Observation.stay_checkin)
    cal = [{"stay_checkin": d.isoformat(), "avg_price": round(a, 2) if a else None,
            "occupancy": round(1 - n / universe, 3) if universe else None, "listings": n}
           for d, a, n in session.execute(cq).all()]
    out["calendar"] = cal

    # --- INSIGHTS automáticos (conclusiones) ---
    out["insights"] = _insights(out, typ_rows, dest_rows, cal, f.currency, avg)
    return out


def _insights(out, typ_rows, dest_rows, cal, currency, overall_avg) -> list[str]:
    ins = []
    cur = currency
    # tipología vs promedio general
    if overall_avg:
        for r in typ_rows:
            if r["avg_price"] and r["listings"] >= 2:
                d = (r["avg_price"] - overall_avg) / overall_avg * 100
                if abs(d) >= 8:
                    dir_ = "por debajo" if d < 0 else "por encima"
                    lbl = TYP_LABEL.get(r["typology"], r["typology"])
                    ins.append(f"{lbl[0].upper() + lbl[1:]} están "
                               f"{abs(round(d))}% {dir_} del promedio ({_money(r['avg_price'], cur)}, "
                               f"{r['listings']} alojamientos).")
    # destino más caro / más barato
    if len(dest_rows) >= 2:
        cheap, exp = dest_rows[0], dest_rows[-1]
        if cheap["avg_price"] and exp["avg_price"]:
            ins.append(f"{exp['name']} es el destino más caro ({_money(exp['avg_price'], cur)}) y "
                       f"{cheap['name']} el más barato ({_money(cheap['avg_price'], cur)}): "
                       f"una diferencia de {round((exp['avg_price']/cheap['avg_price']-1)*100)}%.")
    # fin de semana vs semana (precio y ocupación) desde el calendario
    wk = {"we_p": [], "wd_p": [], "we_o": [], "wd_o": []}
    for c in cal:
        try:
            dow = date.fromisoformat(c["stay_checkin"]).weekday()
        except Exception:
            continue
        we = dow >= 4  # vie/sáb/dom
        if c["avg_price"] is not None:
            (wk["we_p"] if we else wk["wd_p"]).append(c["avg_price"])
        if c["occupancy"] is not None:
            (wk["we_o"] if we else wk["wd_o"]).append(c["occupancy"])
    if wk["we_p"] and wk["wd_p"]:
        we_avg = sum(wk["we_p"]) / len(wk["we_p"])
        wd_avg = sum(wk["wd_p"]) / len(wk["wd_p"])
        if wd_avg and abs(we_avg - wd_avg) / wd_avg >= 0.05:
            ins.append(f"El fin de semana la tarifa promedio es {round((we_avg/wd_avg-1)*100)}% "
                       f"{'más alta' if we_avg > wd_avg else 'más baja'} que entre semana.")
    if wk["we_o"] and wk["wd_o"]:
        we_o = sum(wk["we_o"]) / len(wk["we_o"]) * 100
        wd_o = sum(wk["wd_o"]) / len(wk["wd_o"]) * 100
        if abs(we_o - wd_o) >= 5:
            ins.append(f"La ocupación de fin de semana ronda el {round(we_o)}% vs {round(wd_o)}% "
                       f"entre semana.")
    # sin clasificar
    otro = next((r for r in typ_rows if r["typology"] == "otro"), None)
    if otro and otro["listings"] >= 3:
        ins.append(f"Hay {otro['listings']} alojamientos sin clasificar (tipología 'otro'): "
                   f"conviene revisarlos a mano en la lista para afinar los promedios por tipología.")
    if not ins:
        ins.append("Aún hay pocos datos para sacar conclusiones firmes. Se enriquece a medida "
                   "que se acumulan mediciones en el tiempo.")
    return ins
