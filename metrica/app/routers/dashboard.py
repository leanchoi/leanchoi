"""Analítica agregada para el dashboard."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..deps import require_viewer
from ..models import Destination, FxDaily, Listing, Observation, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _price_col(currency: str):
    return Observation.price_usd if currency == "USD" else Observation.price_ars


def _family_destination_ids(session: Session, family_id: int | None) -> list[int] | None:
    if family_id is None:
        return None
    return [d.id for d in session.scalars(
        select(Destination).where(Destination.family_id == family_id)
    ).all()]


@router.get("/summary")
def summary(family_id: int | None = None, currency: str = "ARS",
            session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    """KPIs de la foto más reciente."""
    price = _price_col(currency)
    dest_ids = _family_destination_ids(session, family_id)

    base = select(Observation)
    if dest_ids is not None:
        base = base.where(Observation.destination_id.in_(dest_ids))

    # última fecha de observación disponible
    last_obs = session.scalar(base.with_only_columns(func.max(Observation.observed_date)))
    kpis = {"currency": currency, "last_observed": last_obs.isoformat() if last_obs else None,
            "avg_price": None, "listings_live": 0, "availability_index": None, "fx": None}
    if not last_obs:
        return kpis

    today_filter = base.where(Observation.observed_date == last_obs)

    avg_price = session.scalar(today_filter.with_only_columns(func.avg(price)))
    kpis["avg_price"] = round(avg_price, 2) if avg_price else None

    live = session.scalar(today_filter.with_only_columns(func.count(distinct(Observation.listing_id))))
    kpis["listings_live"] = live or 0

    # índice de disponibilidad ~ listings vistos hoy / universo histórico del scope
    universe_q = select(func.count(distinct(Observation.listing_id)))
    if dest_ids is not None:
        universe_q = universe_q.where(Observation.destination_id.in_(dest_ids))
    universe = session.scalar(universe_q) or 0
    if universe:
        kpis["availability_index"] = round((live or 0) / universe, 2)

    fx = session.scalar(select(func.avg(FxDaily.fx_rate)).where(FxDaily.observed_date == last_obs))
    kpis["fx"] = round(fx, 2) if fx else None
    return kpis


@router.get("/typology")
def by_typology(family_id: int | None = None, currency: str = "ARS",
                session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    """Precio promedio por tipología (foto más reciente)."""
    price = _price_col(currency)
    dest_ids = _family_destination_ids(session, family_id)

    base = select(func.max(Observation.observed_date))
    if dest_ids is not None:
        base = base.where(Observation.destination_id.in_(dest_ids))
    last_obs = session.scalar(base)
    if not last_obs:
        return {"currency": currency, "rows": []}

    q = select(Observation.typology, func.avg(price), func.count(distinct(Observation.listing_id))) \
        .where(Observation.observed_date == last_obs, price.is_not(None)) \
        .group_by(Observation.typology)
    if dest_ids is not None:
        q = q.where(Observation.destination_id.in_(dest_ids))
    rows = [{"typology": t, "avg_price": round(a, 2) if a else None, "listings": n}
            for t, a, n in session.execute(q).all()]
    return {"currency": currency, "last_observed": last_obs.isoformat(), "rows": rows}


@router.get("/price_curve")
def price_curve(destination_id: int, stay_checkin: str, currency: str = "ARS",
                session: Session = Depends(get_session), _: User = Depends(require_viewer)):
    """Curva de anticipación: evolución del precio promedio de UNA noche
    a medida que avanzan las fechas de observación."""
    price = _price_col(currency)
    q = select(Observation.observed_date, func.avg(price)) \
        .where(Observation.destination_id == destination_id,
               Observation.stay_checkin == stay_checkin, price.is_not(None)) \
        .group_by(Observation.observed_date).order_by(Observation.observed_date)
    rows = [{"observed_date": d.isoformat(), "avg_price": round(a, 2) if a else None}
            for d, a in session.execute(q).all()]
    return {"currency": currency, "stay_checkin": stay_checkin, "points": rows}


@router.get("/availability")
def availability(family_id: int | None = None, session: Session = Depends(get_session),
                 _: User = Depends(require_viewer)):
    """Listings disponibles por noche en los próximos días (índice de disponibilidad)."""
    dest_ids = _family_destination_ids(session, family_id)
    last_obs = select(func.max(Observation.observed_date))
    if dest_ids is not None:
        last_obs = last_obs.where(Observation.destination_id.in_(dest_ids))
    lo = session.scalar(last_obs)
    if not lo:
        return {"rows": []}
    q = select(Observation.stay_checkin, func.count(distinct(Observation.listing_id))) \
        .where(Observation.observed_date == lo,
               Observation.stay_checkin >= date.today(),
               Observation.stay_checkin <= date.today() + timedelta(days=30)) \
        .group_by(Observation.stay_checkin).order_by(Observation.stay_checkin)
    if dest_ids is not None:
        q = q.where(Observation.destination_id.in_(dest_ids))
    rows = [{"stay_checkin": d.isoformat(), "listings": n} for d, n in session.execute(q).all()]
    return {"last_observed": lo.isoformat(), "rows": rows}
