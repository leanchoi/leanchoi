"""Analítica agregada para el dashboard.

Modelo de "estado actual": en vez de mirar una única foto (el último
observed_date global) —que una foto rápida chica podía tapar—, se usa la
ÚLTIMA observación por (alojamiento × noche). Así el tablero muestra todo lo
scrapeado, con el precio más fresco conocido de cada alojamiento y noche.
Las series temporales (evolución, curva) sí recorren todos los observed_date.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, distinct, func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..deps import require_viewer
from ..models import Destination, FxDaily, Listing, Observation, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


# --------------------------------------------------------------------------
#  Filtros compartidos
# --------------------------------------------------------------------------
class Filters:
    def __init__(self, family_id=None, currency="ARS", dest=None, platform=None,
                 typology=None, stay_from=None, stay_to=None):
        self.family_id = family_id
        self.currency = currency
        self.dest_ids = [int(x) for x in dest.split(",") if x.strip().isdigit()] if dest else None
        self.platform = platform or None
        self.typology = typology or None
        self.stay_from = stay_from or None
        self.stay_to = stay_to or None


def _filters(
    family_id: int | None = None, currency: str = "ARS", dest: str | None = None,
    platform: str | None = None, typology: str | None = None,
    stay_from: str | None = None, stay_to: str | None = None,
) -> Filters:
    return Filters(family_id, currency, dest, platform, typology, stay_from, stay_to)


def _price_col(currency: str):
    return Observation.price_usd if currency == "USD" else Observation.price_ars


def _scope_dest_ids(session: Session, f: Filters) -> list[int] | None:
    ids: list[int] | None = None
    if f.family_id is not None:
        ids = [d.id for d in session.scalars(
            select(Destination).where(Destination.family_id == f.family_id)).all()]
    if f.dest_ids is not None:
        ids = [i for i in f.dest_ids if ids is None or i in ids] if ids is not None else f.dest_ids
    return ids


def _apply(stmt, f: Filters, dest_ids):
    if dest_ids is not None:
        stmt = stmt.where(Observation.destination_id.in_(dest_ids))
    if f.platform:
        stmt = stmt.where(Observation.platform == f.platform)
    if f.typology:
        stmt = stmt.where(Observation.typology == f.typology)
    if f.stay_from:
        stmt = stmt.where(Observation.stay_checkin >= f.stay_from)
    if f.stay_to:
        stmt = stmt.where(Observation.stay_checkin <= f.stay_to)
    return stmt


def _latest_ids(f: Filters, dest_ids):
    """Select de los IDs de la última observación por (listing × noche) en scope."""
    grp = _apply(
        select(Observation.listing_id.label("lid"), Observation.stay_checkin.label("sc"),
               func.max(Observation.observed_at).label("mx")),
        f, dest_ids,
    ).group_by(Observation.listing_id, Observation.stay_checkin).subquery()
    return (select(func.min(Observation.id))
            .join(grp, and_(Observation.listing_id == grp.c.lid,
                            Observation.stay_checkin == grp.c.sc,
                            Observation.observed_at == grp.c.mx))
            .group_by(Observation.listing_id, Observation.stay_checkin))


def _current(f: Filters, dest_ids):
    """Condición WHERE: observaciones que son la más reciente de su listing×noche."""
    return Observation.id.in_(_latest_ids(f, dest_ids))


def _universe(session: Session, f: Filters, dest_ids) -> int:
    return session.scalar(_apply(select(func.count(distinct(Observation.listing_id))), f, dest_ids)) or 0


def _last_observed(session: Session, f: Filters, dest_ids):
    return session.scalar(_apply(select(func.max(Observation.observed_date)), f, dest_ids))


def _has_data(session: Session, f: Filters, dest_ids) -> bool:
    return bool(session.scalar(_apply(select(Observation.id), f, dest_ids).limit(1)))


# --------------------------------------------------------------------------
#  Opciones de filtro
# --------------------------------------------------------------------------
@router.get("/filters")
def filter_options(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                   _: User = Depends(require_viewer)):
    dest_ids = _scope_dest_ids(session, f)
    dests = session.scalars(
        select(Destination).where(Destination.family_id == f.family_id) if f.family_id
        else select(Destination)
    ).all()
    typ_q = _apply(select(distinct(Observation.typology)), f, dest_ids)
    typologies = [t for t in session.scalars(typ_q).all() if t]
    rng = _apply(select(func.min(Observation.stay_checkin), func.max(Observation.stay_checkin)), f, dest_ids)
    lo, hi = session.execute(rng).first() or (None, None)
    return {
        "destinations": [{"id": d.id, "name": d.name} for d in dests],
        "typologies": sorted(typologies), "platforms": ["booking", "airbnb"],
        "stay_min": lo.isoformat() if lo else None, "stay_max": hi.isoformat() if hi else None,
    }


# --------------------------------------------------------------------------
#  KPIs
# --------------------------------------------------------------------------
@router.get("/summary")
def summary(f: Filters = Depends(_filters), session: Session = Depends(get_session),
            _: User = Depends(require_viewer)):
    dest_ids = _scope_dest_ids(session, f)
    last = _last_observed(session, f, dest_ids)
    kpis = {"currency": f.currency, "last_observed": last.isoformat() if last else None,
            "avg_price": None, "min_price": None, "max_price": None,
            "listings_live": 0, "availability_index": None, "fx": None, "typologies": 0}
    if not _has_data(session, f, dest_ids):
        return kpis
    cur = select(Observation).where(_current(f, dest_ids)).subquery()
    pcol = cur.c.price_usd if f.currency == "USD" else cur.c.price_ars
    avg, mn, mx, live, ntyp = session.execute(select(
        func.avg(pcol), func.min(pcol), func.max(pcol),
        func.count(distinct(cur.c.listing_id)), func.count(distinct(cur.c.typology)),
    )).first()
    kpis["avg_price"] = round(avg, 2) if avg else None
    kpis["min_price"] = round(mn, 2) if mn else None
    kpis["max_price"] = round(mx, 2) if mx else None
    kpis["listings_live"] = live or 0
    kpis["typologies"] = ntyp or 0
    universe = _universe(session, f, dest_ids)
    if universe:
        kpis["availability_index"] = round((live or 0) / universe, 2)
    fxday = session.scalar(select(func.max(FxDaily.observed_date)))
    if fxday:
        fx = session.scalar(select(func.avg(FxDaily.fx_rate)).where(FxDaily.observed_date == fxday))
        kpis["fx"] = round(fx, 2) if fx else None
    return kpis


# --------------------------------------------------------------------------
#  Segmentos (foto actual)
# --------------------------------------------------------------------------
@router.get("/typology")
def by_typology(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    q = select(Observation.typology, func.avg(price), func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids), price.is_not(None)).group_by(Observation.typology)
    rows = [{"typology": t, "avg_price": round(a, 2) if a else None, "listings": n}
            for t, a, n in session.execute(q).all()]
    return {"currency": f.currency, "rows": rows}


@router.get("/destinations")
def by_destination(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                   _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    q = select(Observation.destination_id, func.avg(price), func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids), price.is_not(None)).group_by(Observation.destination_id)
    name_by_id = {d.id: d.name for d in session.scalars(select(Destination)).all()}
    rows = [{"destination_id": did, "name": name_by_id.get(did, f"#{did}"),
             "avg_price": round(a, 2) if a else None, "listings": n}
            for did, a, n in session.execute(q).all()]
    rows.sort(key=lambda r: r["avg_price"] or 0, reverse=True)
    return {"currency": f.currency, "rows": rows}


@router.get("/ratings")
def ratings_by_typology(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                        _: User = Depends(require_viewer)):
    dest_ids = _scope_dest_ids(session, f)
    q = select(Observation.typology, func.avg(Observation.rating), func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids), Observation.rating.is_not(None)).group_by(Observation.typology)
    rows = [{"typology": t, "avg_rating": round(a, 2) if a else None, "listings": n}
            for t, a, n in session.execute(q).all()]
    return {"rows": rows}


@router.get("/price_distribution")
def price_distribution(bins: int = Query(12, ge=4, le=40), f: Filters = Depends(_filters),
                       session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    q = select(price).where(_current(f, dest_ids), price.is_not(None))
    values = sorted(v for (v,) in session.execute(q).all() if v is not None)
    if not values:
        return {"currency": f.currency, "bins": []}
    lo, hi = values[0], values[-1]
    if hi <= lo:
        return {"currency": f.currency, "bins": [{"from": lo, "to": hi, "count": len(values)}]}
    width = (hi - lo) / bins
    buckets = [0] * bins
    for v in values:
        buckets[min(int((v - lo) / width), bins - 1)] += 1
    return {"currency": f.currency,
            "bins": [{"from": round(lo + i * width), "to": round(lo + (i + 1) * width), "count": c}
                     for i, c in enumerate(buckets)]}


@router.get("/listings")
def listings(f: Filters = Depends(_filters), limit: int = Query(400, ge=1, le=2000),
             session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    q = select(
        Observation.listing_id, func.avg(price).label("p"), func.avg(Observation.rating).label("r"),
        func.max(Observation.platform).label("plat"), func.max(Observation.typology).label("typ"),
        func.max(Observation.destination_id).label("did"),
    ).where(_current(f, dest_ids), price.is_not(None)).group_by(Observation.listing_id)
    raw = session.execute(q).all()
    if not raw:
        return {"currency": f.currency, "reference": None, "rows": [], "count": 0}
    prices = [float(x.p) for x in raw if x.p is not None]
    reference = round(sum(prices) / len(prices), 2) if prices else None
    lids = [x.listing_id for x in raw]
    lmap = {l.id: l for l in session.scalars(select(Listing).where(Listing.id.in_(lids))).all()}
    dnames = {d.id: d.name for d in session.scalars(select(Destination)).all()}

    def band(delta):
        if delta <= -0.25: return "muy_bajo"
        if delta <= -0.08: return "bajo"
        if delta < 0.08: return "promedio"
        if delta < 0.25: return "alto"
        return "muy_alto"

    rows = []
    for x in raw:
        p = round(float(x.p), 2) if x.p is not None else None
        delta = (p - reference) / reference if (p and reference) else 0.0
        lst = lmap.get(x.listing_id)
        rows.append({
            "listing_id": x.listing_id, "external_id": lst.external_id if lst else None,
            "name": lst.name if lst else f"#{x.listing_id}", "url": lst.url if lst else None,
            "platform": x.plat, "typology": lst.typology if lst else x.typ,
            "typology_manual": bool(lst.typology_manual) if lst else False,
            "destination": dnames.get(x.did, ""), "price": p,
            "rating": round(float(x.r), 2) if x.r is not None else None,
            "delta_pct": round(delta * 100, 1), "band": band(delta),
        })
    rows.sort(key=lambda r: r["price"] or 0)
    return {"currency": f.currency, "reference": reference, "count": len(rows), "rows": rows[:limit]}


@router.get("/calendar")
def calendar(days: int = Query(120, ge=7, le=400), f: Filters = Depends(_filters),
             session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    q = select(Observation.stay_checkin, func.avg(price), func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids),
               Observation.stay_checkin >= date.today(),
               Observation.stay_checkin <= date.today() + timedelta(days=days)) \
        .group_by(Observation.stay_checkin).order_by(Observation.stay_checkin)
    universe = _universe(session, f, dest_ids)
    rows = [{"stay_checkin": d.isoformat(), "avg_price": round(a, 2) if a else None, "listings": n,
             "occupancy": round(1 - (n / universe), 3) if universe else None}
            for d, a, n in session.execute(q).all()]
    return {"currency": f.currency, "universe": universe, "rows": rows}


@router.get("/availability")
def availability(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                 _: User = Depends(require_viewer)):
    dest_ids = _scope_dest_ids(session, f)
    q = select(Observation.stay_checkin, func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids),
               Observation.stay_checkin >= date.today(),
               Observation.stay_checkin <= date.today() + timedelta(days=40)) \
        .group_by(Observation.stay_checkin).order_by(Observation.stay_checkin)
    rows = [{"stay_checkin": d.isoformat(), "listings": n} for d, n in session.execute(q).all()]
    return {"rows": rows}


# --------------------------------------------------------------------------
#  Series temporales (recorren TODOS los observed_date)
# --------------------------------------------------------------------------
@router.get("/price_evolution")
def price_evolution(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                    _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    q = _apply(select(Observation.observed_date, func.avg(price),
                      func.count(distinct(Observation.listing_id))).where(price.is_not(None)), f, dest_ids) \
        .group_by(Observation.observed_date).order_by(Observation.observed_date)
    rows = [{"observed_date": d.isoformat(), "avg_price": round(a, 2) if a else None, "listings": n}
            for d, a, n in session.execute(q).all()]
    return {"currency": f.currency, "points": rows}


@router.get("/occupancy_evolution")
def occupancy_evolution(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                        _: User = Depends(require_viewer)):
    dest_ids = _scope_dest_ids(session, f)
    universe = _universe(session, f, dest_ids)
    if not universe:
        return {"universe": 0, "points": []}
    q = _apply(select(Observation.observed_date, func.count(distinct(Observation.listing_id))), f, dest_ids) \
        .group_by(Observation.observed_date).order_by(Observation.observed_date)
    points = [{"observed_date": d.isoformat(), "available": n, "occupancy": round(1 - (n / universe), 3)}
              for d, n in session.execute(q).all()]
    return {"universe": universe, "points": points}


@router.get("/price_curve")
def price_curve(destination_id: int, stay_checkin: str, currency: str = "ARS",
                session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    price = _price_col(currency)
    q = select(Observation.observed_date, func.avg(price)) \
        .where(Observation.destination_id == destination_id,
               Observation.stay_checkin == stay_checkin, price.is_not(None)) \
        .group_by(Observation.observed_date).order_by(Observation.observed_date)
    rows = [{"observed_date": d.isoformat(), "avg_price": round(a, 2) if a else None}
            for d, a in session.execute(q).all()]
    return {"currency": currency, "stay_checkin": stay_checkin, "points": rows}


# --------------------------------------------------------------------------
#  Estadística: comparación entre destinos y dispersión de precios
# --------------------------------------------------------------------------
def _percentile(sorted_vals: list[float], q: float):
    """Percentil por interpolación lineal (q en 0..1)."""
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    idx = q * (len(sorted_vals) - 1)
    lo = int(idx)
    frac = idx - lo
    if lo + 1 < len(sorted_vals):
        return sorted_vals[lo] + (sorted_vals[lo + 1] - sorted_vals[lo]) * frac
    return sorted_vals[lo]


def _stats(vals: list[float]) -> dict | None:
    """min/p25/mediana/p75/max + media, desvío estándar y coef. de variación."""
    vals = sorted(v for v in vals if v is not None)
    n = len(vals)
    if not n:
        return None
    mean = sum(vals) / n
    var = sum((v - mean) ** 2 for v in vals) / n if n > 1 else 0.0
    std = var ** 0.5
    return {
        "count": n, "min": round(vals[0], 2), "max": round(vals[-1], 2),
        "p25": round(_percentile(vals, 0.25), 2), "median": round(_percentile(vals, 0.5), 2),
        "p75": round(_percentile(vals, 0.75), 2), "mean": round(mean, 2),
        "std": round(std, 2), "cv": round(std / mean, 3) if mean else None,
    }


def _listing_price_map(session: Session, keycol, f: Filters, dest_ids) -> dict:
    """Precio actual por listing (promedio de sus noches) agrupado por `keycol`."""
    price = _price_col(f.currency)
    q = select(keycol, Observation.listing_id, func.avg(price)) \
        .where(_current(f, dest_ids), price.is_not(None)).group_by(keycol, Observation.listing_id)
    buckets: dict = {}
    for key, _lid, p in session.execute(q).all():
        if p is not None:
            buckets.setdefault(key, []).append(float(p))
    return buckets


@router.get("/typology_matrix")
def typology_matrix(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                    _: User = Depends(require_viewer)):
    """Tarifa promedio por tipología × destino (para barras agrupadas comparables)
    + el promedio general de cada tipología (para la línea de referencia)."""
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    name_by_id = {d.id: d.name for d in session.scalars(select(Destination)).all()}
    oq = select(Observation.typology, func.avg(price), func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids), price.is_not(None)).group_by(Observation.typology)
    overall = {t: {"avg": round(a, 2) if a else None, "listings": n} for t, a, n in session.execute(oq).all()}
    q = select(Observation.typology, Observation.destination_id, func.avg(price),
               func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids), price.is_not(None)) \
        .group_by(Observation.typology, Observation.destination_id)
    by_typ: dict = {}
    dseen: dict = {}
    for t, did, a, n in session.execute(q).all():
        by_typ.setdefault(t, []).append(
            {"destination_id": did, "name": name_by_id.get(did, f"#{did}"),
             "avg_price": round(a, 2) if a else None, "listings": n})
        dseen[did] = name_by_id.get(did, f"#{did}")
    rows = []
    for t, lst in by_typ.items():
        lst.sort(key=lambda r: r["name"])
        rows.append({"typology": t, "overall_avg": overall.get(t, {}).get("avg"),
                     "overall_listings": overall.get(t, {}).get("listings", 0), "by_dest": lst})
    rows.sort(key=lambda r: r["overall_avg"] or 0)
    dests = sorted(({"id": i, "name": n} for i, n in dseen.items()), key=lambda d: d["name"])
    return {"currency": f.currency, "destinations": dests, "rows": rows}


@router.get("/dispersion")
def dispersion(by: str = Query("destination"), f: Filters = Depends(_filters),
               session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    """Dispersión de tarifas (foto actual) por destino o tipología: percentiles,
    desvío estándar y coeficiente de variación. Revela si hay muchos baratos y
    algún outlier caro."""
    dest_ids = _scope_dest_ids(session, f)
    keycol = Observation.destination_id if by == "destination" else Observation.typology
    buckets = _listing_price_map(session, keycol, f, dest_ids)
    name_by_id = {d.id: d.name for d in session.scalars(select(Destination)).all()} if by == "destination" else None
    groups = []
    allvals: list[float] = []
    for key, vals in buckets.items():
        st = _stats(vals)
        if not st:
            continue
        allvals += vals
        name = name_by_id.get(key, f"#{key}") if by == "destination" else (key or "otro")
        groups.append({"key": key, "name": name, **st})
    groups.sort(key=lambda g: g["median"] or 0, reverse=True)
    return {"currency": f.currency, "by": by, "groups": groups, "overall": _stats(allvals)}


@router.get("/dispersion_evolution")
def dispersion_evolution(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                         _: User = Depends(require_viewer)):
    """Dispersión en el tiempo: por cada día observado, la distribución de precios
    del mercado. El coef. de variación cayendo = precios homogeneizándose; la banda
    min–max muestra cómo se mueven los más baratos y los más caros."""
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    q = _apply(select(Observation.observed_date, Observation.listing_id, func.avg(price))
               .where(price.is_not(None)), f, dest_ids) \
        .group_by(Observation.observed_date, Observation.listing_id)
    byday: dict = {}
    for od, _lid, p in session.execute(q).all():
        if p is not None:
            byday.setdefault(od, []).append(float(p))
    points = []
    for od in sorted(byday):
        st = _stats(byday[od])
        if st:
            points.append({"observed_date": od.isoformat(), **st})
    return {"currency": f.currency, "points": points}


@router.get("/composition")
def composition(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                _: User = Depends(require_viewer)):
    """Composición de la oferta por destino: mezcla de tipologías y volumen cargado
    en cada plataforma (presencia digital). Permite comparar destinos entre sí."""
    dest_ids = _scope_dest_ids(session, f)
    name_by_id = {d.id: d.name for d in session.scalars(select(Destination)).all()}
    tq = select(Observation.destination_id, Observation.typology, func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids)).group_by(Observation.destination_id, Observation.typology)
    pq = select(Observation.destination_id, Observation.platform, func.count(distinct(Observation.listing_id))) \
        .where(_current(f, dest_ids)).group_by(Observation.destination_id, Observation.platform)
    comp: dict = {}

    def _row(did):
        return comp.setdefault(did, {"destination_id": did, "name": name_by_id.get(did, f"#{did}"),
                                     "total": 0, "by_typology": {}, "by_platform": {}})
    for did, typ, n in session.execute(tq).all():
        _row(did)["by_typology"][typ] = n
    for did, plat, n in session.execute(pq).all():
        r = _row(did)
        r["by_platform"][plat] = n
        r["total"] += n  # cada listing tiene una plataforma → suma = total de listings
    rows = sorted(comp.values(), key=lambda r: r["total"], reverse=True)
    return {"currency": f.currency, "rows": rows}
