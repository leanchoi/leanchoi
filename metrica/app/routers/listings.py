"""Gestión de alojamientos: override manual de tipología."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_session
from ..deps import require_editor
from ..models import Listing, Typology, User

router = APIRouter(prefix="/api/listings", tags=["listings"])

_VALID = {t.value for t in Typology}


class TypologyIn(BaseModel):
    typology: str
    manual: bool = True  # False = volver a clasificación automática


@router.put("/{lid}/typology")
def set_typology(lid: int, payload: TypologyIn, session: Session = Depends(get_session),
                 _: User = Depends(require_editor)):
    """Fija (o libera) la tipología de un alojamiento. Queda pegada al listing
    permanente: el scrapeo no la sobreescribe mientras esté en manual."""
    listing = session.get(Listing, lid)
    if not listing:
        raise HTTPException(404, "Alojamiento no encontrado")
    if payload.typology not in _VALID:
        raise HTTPException(400, f"Tipología inválida. Opciones: {sorted(_VALID)}")
    listing.typology = payload.typology
    listing.typology_manual = payload.manual
    session.commit()
    return {"id": listing.id, "typology": listing.typology, "manual": listing.typology_manual}


class NameIn(BaseModel):
    name: str | None = None   # None / vacío = volver al nombre de la plataforma
    manual: bool = True


@router.put("/{lid}/name")
def set_name(lid: int, payload: NameIn, session: Session = Depends(get_session),
             _: User = Depends(require_editor)):
    """Renombra un alojamiento a mano (los nombres marketineros de las plataformas
    dificultan identificar el establecimiento). El nombre queda fijo: el scrapeo no
    lo pisa. El nombre de la plataforma se conserva en el historial."""
    listing = session.get(Listing, lid)
    if not listing:
        raise HTTPException(404, "Alojamiento no encontrado")
    attrs = dict(listing.attributes or {})
    history = list(attrs.get("name_history", []))  # copia: ver nota en runner._upsert_listing
    new_name = (payload.name or "").strip()

    if not payload.manual or not new_name:
        # Volver al automático: recuperar el último nombre de plataforma conocido.
        original = attrs.get("platform_name")
        if original:
            if listing.name and listing.name not in history:
                history.append(listing.name)
            listing.name = original[:400]
        listing.name_manual = False
    else:
        if not listing.name_manual and listing.name:
            attrs["platform_name"] = listing.name   # guardar el original una sola vez
        if listing.name and listing.name not in history:
            history.append(listing.name)
        listing.name = new_name[:400]
        listing.name_manual = True

    attrs["name_history"] = history[-10:]
    listing.attributes = attrs
    session.commit()
    return {"id": listing.id, "name": listing.name, "manual": listing.name_manual,
            "platform_name": attrs.get("platform_name")}


class ExcludeIn(BaseModel):
    excluded: bool = True
    reason: str | None = None


@router.put("/{lid}/exclude")
def set_excluded(lid: int, payload: ExcludeIn, session: Session = Depends(get_session),
                 _: User = Depends(require_editor)):
    """Excluye (o reincorpora) un alojamiento del análisis.

    Para precios cargados mal por el anunciante: el dato no se borra, se marca,
    y deja de contaminar promedios, dispersión y rankings.
    """
    listing = session.get(Listing, lid)
    if not listing:
        raise HTTPException(404, "Alojamiento no encontrado")
    listing.excluded = payload.excluded
    listing.excluded_reason = (payload.reason or "precio inverosímil")[:200] \
        if payload.excluded else None
    session.commit()
    return {"id": listing.id, "excluded": listing.excluded,
            "reason": listing.excluded_reason}


@router.get("/{lid}")
def get_listing(lid: int, session: Session = Depends(get_session),
                _: User = Depends(require_editor)):
    listing = session.get(Listing, lid)
    if not listing:
        raise HTTPException(404, "Alojamiento no encontrado")
    return {
        "id": listing.id, "platform": listing.platform, "external_id": listing.external_id,
        "name": listing.name, "url": listing.url, "typology": listing.typology,
        "typology_manual": listing.typology_manual, "name_manual": listing.name_manual,
        "property_type_raw": listing.property_type_raw, "locality": listing.locality,
        "platform_name": (listing.attributes or {}).get("platform_name"),
        "name_history": (listing.attributes or {}).get("name_history", []),
    }
