"""Analítica agregada para el dashboard (con filtros y cross-filter)."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, func, select
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
    """IDs de destino en scope: intersección de familia y selección explícita."""
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


def _last_observed(session: Session, f: Filters, dest_ids):
    stmt = _apply(select(func.max(Observation.observed_date)), f, dest_ids)
    return session.scalar(stmt)


# --------------------------------------------------------------------------
#  Opciones de filtro disponibles
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
    rng = _apply(select(func.min(Observation.stay_checkin), func.max(Observation.stay_checkin)),
                 f, dest_ids)
    lo, hi = session.execute(rng).first() or (None, None)
    return {
        "destinations": [{"id": d.id, "name": d.name} for d in dests],
        "typologies": sorted(typologies),
        "platforms": ["booking", "airbnb"],
        "stay_min": lo.isoformat() if lo else None,
        "stay_max": hi.isoformat() if hi else None,
    }


# --------------------------------------------------------------------------
#  KPIs
# --------------------------------------------------------------------------
@router.get("/summary")
def summary(f: Filters = Depends(_filters), session: Session = Depends(get_session),
            _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    last = _last_observed(session, f, dest_ids)
    kpis = {"currency": f.currency, "last_observed": last.isoformat() if last else None,
            "avg_price": None, "median_price": None, "min_price": None, "max_price": None,
            "listings_live": 0, "availability_index": None, "fx": None, "typologies": 0}
    if not last:
        return kpis
    snap = _apply(select(Observation).where(Observation.observed_date == last), f, dest_ids).subquery()
    row = session.execute(select(
        func.avg(snap.c.price_ars if f.currency != "USD" else snap.c.price_usd),
        func.min(snap.c.price_ars if f.currency != "USD" else snap.c.price_usd),
        func.max(snap.c.price_ars if f.currency != "USD" else snap.c.price_usd),
        func.count(distinct(snap.c.listing_id)),
        func.count(distinct(snap.c.typology)),
    )).first()
    avg, mn, mx, live, ntyp = row
    kpis["avg_price"] = round(avg, 2) if avg else None
    kpis["min_price"] = round(mn, 2) if mn else None
    kpis["max_price"] = round(mx, 2) if mx else None
    kpis["listings_live"] = live or 0
    kpis["typologies"] = ntyp or 0

    universe = session.scalar(_apply(select(func.count(distinct(Observation.listing_id))), f, dest_ids)) or 0
    if universe:
        kpis["availability_index"] = round((live or 0) / universe, 2)
    fx = session.scalar(select(func.avg(FxDaily.fx_rate)).where(FxDaily.observed_date == last))
    kpis["fx"] = round(fx, 2) if fx else None
    return kpis


# --------------------------------------------------------------------------
#  Por tipología / por destino / ratings
# --------------------------------------------------------------------------
@router.get("/typology")
def by_typology(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    last = _last_observed(session, f, dest_ids)
    if not last:
        return {"currency": f.currency, "rows": []}
    q = _apply(select(Observation.typology, func.avg(price), func.count(distinct(Observation.listing_id)))
               .where(Observation.observed_date == last, price.is_not(None)), f, dest_ids) \
        .group_by(Observation.typology)
    rows = [{"typology": t, "avg_price": round(a, 2) if a else None, "listings": n}
            for t, a, n in session.execute(q).all()]
    return {"currency": f.currency, "last_observed": last.isoformat(), "rows": rows}


@router.get("/destinations")
def by_destination(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                   _: User = Depends(require_viewer)):
    """Comparación entre destinos: precio promedio y listings (foto reciente)."""
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    last = _last_observed(session, f, dest_ids)
    if not last:
        return {"currency": f.currency, "rows": []}
    q = _apply(select(Observation.destination_id, func.avg(price),
                      func.count(distinct(Observation.listing_id)))
               .where(Observation.observed_date == last, price.is_not(None)), f, dest_ids) \
        .group_by(Observation.destination_id)
    name_by_id = {d.id: d.name for d in session.scalars(select(Destination)).all()}
    rows = [{"destination_id": did, "name": name_by_id.get(did, f"#{did}"),
             "avg_price": round(a, 2) if a else None, "listings": n}
            for did, a, n in session.execute(q).all()]
    rows.sort(key=lambda r: r["avg_price"] or 0, reverse=True)
    return {"currency": f.currency, "last_observed": last.isoformat(), "rows": rows}


@router.get("/ratings")
def ratings_by_typology(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                        _: User = Depends(require_viewer)):
    dest_ids = _scope_dest_ids(session, f)
    last = _last_observed(session, f, dest_ids)
    if not last:
        return {"rows": []}
    q = _apply(select(Observation.typology, func.avg(Observation.rating),
                      func.count(distinct(Observation.listing_id)))
               .where(Observation.observed_date == last, Observation.rating.is_not(None)), f, dest_ids) \
        .group_by(Observation.typology)
    rows = [{"typology": t, "avg_rating": round(a, 2) if a else None, "listings": n}
            for t, a, n in session.execute(q).all()]
    return {"last_observed": last.isoformat(), "rows": rows}


# --------------------------------------------------------------------------
#  Distribución de precios (histograma)
# --------------------------------------------------------------------------
@router.get("/price_distribution")
def price_distribution(bins: int = Query(12, ge=4, le=40), f: Filters = Depends(_filters),
                       session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    last = _last_observed(session, f, dest_ids)
    if not last:
        return {"currency": f.currency, "bins": []}
    q = _apply(select(price).where(Observation.observed_date == last, price.is_not(None)), f, dest_ids)
    values = sorted(v for (v,) in session.execute(q).all() if v is not None)
    if not values:
        return {"currency": f.currency, "bins": []}
    lo, hi = values[0], values[-1]
    if hi <= lo:
        return {"currency": f.currency, "bins": [{"from": lo, "to": hi, "count": len(values)}]}
    width = (hi - lo) / bins
    buckets = [0] * bins
    for v in values:
        idx = min(int((v - lo) / width), bins - 1)
        buckets[idx] += 1
    return {"currency": f.currency, "last_observed": last.isoformat(),
            "bins": [{"from": round(lo + i * width), "to": round(lo + (i + 1) * width), "count": c}
                     for i, c in enumerate(buckets)]}


# --------------------------------------------------------------------------
#  Evolución del mercado en el tiempo (por día de observación)
# --------------------------------------------------------------------------
@router.get("/price_evolution")
def price_evolution(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                    _: User = Depends(require_viewer)):
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    q = _apply(select(Observation.observed_date, func.avg(price),
                      func.count(distinct(Observation.listing_id)))
               .where(price.is_not(None)), f, dest_ids) \
        .group_by(Observation.observed_date).order_by(Observation.observed_date)
    rows = [{"observed_date": d.isoformat(), "avg_price": round(a, 2) if a else None, "listings": n}
            for d, a, n in session.execute(q).all()]
    return {"currency": f.currency, "points": rows}


@router.get("/price_curve")
def price_curve(destination_id: int, stay_checkin: str, currency: str = "ARS",
                session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    """Curva de anticipación: precio promedio de UNA noche según avanza la observación."""
    price = _price_col(currency)
    q = select(Observation.observed_date, func.avg(price)) \
        .where(Observation.destination_id == destination_id,
               Observation.stay_checkin == stay_checkin, price.is_not(None)) \
        .group_by(Observation.observed_date).order_by(Observation.observed_date)
    rows = [{"observed_date": d.isoformat(), "avg_price": round(a, 2) if a else None}
            for d, a in session.execute(q).all()]
    return {"currency": currency, "stay_checkin": stay_checkin, "points": rows}


@router.get("/listings")
def listings(f: Filters = Depends(_filters), limit: int = Query(300, ge=1, le=2000),
             session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    """Lista de alojamientos del filtro actual, con precio promedio y desvío
    respecto del promedio del conjunto (para colorear por encima/debajo)."""
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    last = _last_observed(session, f, dest_ids)
    if not last:
        return {"currency": f.currency, "reference": None, "rows": []}

    q = _apply(select(
        Observation.listing_id,
        func.avg(price).label("p"),
        func.avg(Observation.rating).label("r"),
        func.max(Observation.platform).label("plat"),
        func.max(Observation.typology).label("typ"),
        func.max(Observation.destination_id).label("did"),
    ).where(Observation.observed_date == last, price.is_not(None)), f, dest_ids) \
        .group_by(Observation.listing_id)
    raw = session.execute(q).all()
    if not raw:
        return {"currency": f.currency, "reference": None, "rows": []}

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
            "listing_id": x.listing_id,
            "external_id": lst.external_id if lst else None,
            "name": (lst.name if lst else f"#{x.listing_id}"),
            "url": lst.url if lst else None,
            "platform": x.plat,
            "typology": lst.typology if lst else x.typ,
            "typology_manual": bool(lst.typology_manual) if lst else False,
            "destination": dnames.get(x.did, ""),
            "price": p, "rating": round(float(x.r), 2) if x.r is not None else None,
            "delta_pct": round(delta * 100, 1), "band": band(delta),
        })
    rows.sort(key=lambda r: r["price"] or 0)
    return {"currency": f.currency, "last_observed": last.isoformat(),
            "reference": reference, "count": len(rows), "rows": rows[:limit]}


@router.get("/availability")
def availability(f: Filters = Depends(_filters), session: Session = Depends(get_session),
                 _: User = Depends(require_viewer)):
    dest_ids = _scope_dest_ids(session, f)
    last = _last_observed(session, f, dest_ids)
    if not last:
        return {"rows": []}
    q = _apply(select(Observation.stay_checkin, func.count(distinct(Observation.listing_id)))
               .where(Observation.observed_date == last,
                      Observation.stay_checkin >= date.today(),
                      Observation.stay_checkin <= date.today() + timedelta(days=40)), f, dest_ids) \
        .group_by(Observation.stay_checkin).order_by(Observation.stay_checkin)
    rows = [{"stay_checkin": d.isoformat(), "listings": n} for d, n in session.execute(q).all()]
    return {"last_observed": last.isoformat(), "rows": rows}


@router.get("/calendar")
def calendar(days: int = Query(90, ge=7, le=400), f: Filters = Depends(_filters),
             session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    """Precio promedio y oferta disponible por noche (para heatmap de calendario)."""
    price = _price_col(f.currency)
    dest_ids = _scope_dest_ids(session, f)
    last = _last_observed(session, f, dest_ids)
    if not last:
        return {"currency": f.currency, "rows": [], "universe": 0}
    q = _apply(select(Observation.stay_checkin, func.avg(price),
                      func.count(distinct(Observation.listing_id)))
               .where(Observation.observed_date == last,
                      Observation.stay_checkin >= date.today(),
                      Observation.stay_checkin <= date.today() + timedelta(days=days)), f, dest_ids) \
        .group_by(Observation.stay_checkin).order_by(Observation.stay_checkin)
    universe = session.scalar(_apply(select(func.count(distinct(Observation.listing_id))), f, dest_ids)) or 0
    rows = [{"stay_checkin": d.isoformat(), "avg_price": round(a, 2) if a else None,
             "listings": n, "occupancy": round(1 - (n / universe), 3) if universe else None}
            for d, a, n in session.execute(q).all()]
    return {"currency": f.currency, "last_observed": last.isoformat(), "universe": universe, "rows": rows}


@router.get("/occupancy_evolution")
def occupancy_evolution(horizon: int = Query(30, ge=1, le=180), f: Filters = Depends(_filters),
                        session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    """Evolución histórica de la ocupación: por cada día de observación, qué
    proporción del inventario estaba tomada para las noches del horizonte próximo."""
    dest_ids = _scope_dest_ids(session, f)
    universe = session.scalar(_apply(select(func.count(distinct(Observation.listing_id))), f, dest_ids)) or 0
    if not universe:
        return {"universe": 0, "points": []}
    # distinct listings vistos (=disponibles) por día de observación
    q = _apply(select(Observation.observed_date, func.count(distinct(Observation.listing_id))),
               f, dest_ids) \
        .group_by(Observation.observed_date).order_by(Observation.observed_date)
    rows = session.execute(q).all()
    points = [{"observed_date": d.isoformat(), "available": n,
               "occupancy": round(1 - (n / universe), 3)} for d, n in rows]
    return {"universe": universe, "points": points}
