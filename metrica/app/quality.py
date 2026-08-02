"""Control de calidad de los precios scrapeados.

Un anunciante que carga mal la tarifa (por ejemplo 2.000.000 por noche en vez de
200.000) arruina todos los promedios del destino. Acá se detectan esos valores
comparando cada alojamiento contra sus PARES REALES —el mismo destino y la misma
tipología— con mediana, que no se deja arrastrar por el propio outlier.

El dato nunca se borra: el alojamiento se marca como excluido, con motivo, y se
puede revertir.
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Destination, Listing, Observation


def _median(vals: list[float]) -> float | None:
    vals = sorted(v for v in vals if v is not None)
    if not vals:
        return None
    n = len(vals)
    mid = n // 2
    return vals[mid] if n % 2 else (vals[mid - 1] + vals[mid]) / 2


def find_outliers(session: Session, factor: float = 8.0, currency: str = "ARS",
                  destination_id: int | None = None, min_peers: int = 4) -> list[dict]:
    """Alojamientos con precios inverosímiles frente a sus pares.

    factor: cuántas veces la mediana de los pares hace sospechoso un precio.
    min_peers: sin un mínimo de pares no hay con qué comparar (no se marca nada).
    """
    price = Observation.price_usd if currency == "USD" else Observation.price_ars
    q = select(Observation.listing_id, Observation.destination_id, Observation.typology,
               func.avg(price), func.max(price), func.count(Observation.id)) \
        .where(price.is_not(None)).group_by(Observation.listing_id,
                                            Observation.destination_id, Observation.typology)
    if destination_id:
        q = q.where(Observation.destination_id == destination_id)

    rows = session.execute(q).all()
    if not rows:
        return []

    # Mediana por (destino × tipología) y, de respaldo, por destino
    by_pair: dict = {}
    by_dest: dict = {}
    for lid, did, typ, avg, mx, n in rows:
        if avg is None:
            continue
        by_pair.setdefault((did, typ), []).append(float(avg))
        by_dest.setdefault(did, []).append(float(avg))
    med_pair = {k: _median(v) for k, v in by_pair.items()}
    med_dest = {k: _median(v) for k, v in by_dest.items()}

    lmap = {l.id: l for l in session.scalars(
        select(Listing).where(Listing.id.in_([r[0] for r in rows]))).all()}
    dnames = {d.id: d.name for d in session.scalars(select(Destination)).all()}

    out = []
    for lid, did, typ, avg, mx, n in rows:
        if avg is None:
            continue
        avg = float(avg)
        peers = by_pair.get((did, typ), [])
        # Con pocos pares de la misma tipología, comparar contra todo el destino
        if len(peers) >= min_peers:
            ref, scope = med_pair.get((did, typ)), f"{typ} en {dnames.get(did, did)}"
        else:
            ref, scope = med_dest.get(did), dnames.get(did, str(did))
        if not ref or ref <= 0:
            continue
        ratio = avg / ref
        if ratio < factor:
            continue
        lst = lmap.get(lid)
        out.append({
            "listing_id": lid, "name": lst.name if lst else f"#{lid}",
            "url": lst.url if lst else None,
            "platform": lst.platform if lst else None,
            "external_id": lst.external_id if lst else None,
            "destination": dnames.get(did, ""), "typology": typ,
            "avg_price": round(avg, 2), "max_price": round(float(mx), 2) if mx else None,
            "peer_median": round(ref, 2), "ratio": round(ratio, 1),
            "observations": n, "scope": scope,
            "already_excluded": bool(lst.excluded) if lst else False,
        })
    out.sort(key=lambda r: -r["ratio"])
    return out


def exclude_listings(session: Session, listing_ids: list[int], reason: str) -> int:
    n = 0
    for lid in listing_ids:
        lst = session.get(Listing, lid)
        if lst and not lst.excluded:
            lst.excluded = True
            lst.excluded_reason = reason[:200]
            n += 1
    session.flush()
    return n


def impact_of_exclusion(session: Session, currency: str = "ARS",
                        destination_id: int | None = None) -> dict:
    """Cuánto cambia el promedio al dejar afuera los excluidos (para justificarlo)."""
    price = Observation.price_usd if currency == "USD" else Observation.price_ars
    base = select(func.avg(price)).where(price.is_not(None))
    if destination_id:
        base = base.where(Observation.destination_id == destination_id)
    with_all = session.scalar(base)
    excluded_ids = [l.id for l in session.scalars(
        select(Listing).where(Listing.excluded.is_(True))).all()]
    clean = base
    if excluded_ids:
        clean = base.where(Observation.listing_id.notin_(excluded_ids))
    with_clean = session.scalar(clean)
    return {"avg_con_outliers": round(with_all, 2) if with_all else None,
            "avg_sin_outliers": round(with_clean, 2) if with_clean else None,
            "excluidos": len(excluded_ids)}
