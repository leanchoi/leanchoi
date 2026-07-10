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


@router.get("/{lid}")
def get_listing(lid: int, session: Session = Depends(get_session),
                _: User = Depends(require_editor)):
    listing = session.get(Listing, lid)
    if not listing:
        raise HTTPException(404, "Alojamiento no encontrado")
    return {
        "id": listing.id, "platform": listing.platform, "external_id": listing.external_id,
        "name": listing.name, "url": listing.url, "typology": listing.typology,
        "typology_manual": listing.typology_manual, "property_type_raw": listing.property_type_raw,
        "name_history": (listing.attributes or {}).get("name_history", []),
    }
