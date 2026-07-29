"""Sembrado inicial: admin + preset BENCHMARK Patagonia Andina."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from .config import get_settings
from .models import (Destination, Family, Milestone, Recurrence, RegistrySource, Role, User)
from .security import hash_password

logger = logging.getLogger("metrica.seed")

BENCHMARK_DESTINOS = [
    "Esquel", "Trevelin", "El Bolsón", "El Hoyo", "Lago Puelo",
    "Bariloche", "San Martín de los Andes", "Villa La Angostura", "Junín de los Andes",
]


def seed_admin(session: Session) -> None:
    """Crea el admin inicial si no existe ningún usuario."""
    if session.query(User).count() > 0:
        return
    s = get_settings()
    admin = User(
        username=s.admin_username, email=s.admin_email, role=Role.admin.value,
        hashed_password=hash_password(s.admin_password), is_active=True,
    )
    session.add(admin)
    session.commit()
    logger.info("Admin inicial creado: %s", s.admin_username)


def seed_benchmark(session: Session) -> None:
    """Crea la familia preset BENCHMARK Patagonia Andina si no existe."""
    if session.query(Family).filter(Family.name == "BENCHMARK Patagonia Andina").first():
        return
    fam = Family(
        name="BENCHMARK Patagonia Andina",
        description="Corredor de los Andes patagónicos. 1 noche · 1 persona. "
                    "Rolling 30 días + checkpoints a +2..+6 meses.",
        is_preset=True, adults=1, nights=1, platforms="booking,airbnb",
        rolling_days=30, checkpoint_months="2,3,4,5,6", interval_minutes=1440, enabled=True,
    )
    session.add(fam)
    session.flush()

    for nombre in BENCHMARK_DESTINOS:
        session.add(Destination(family_id=fam.id, name=nombre, active_in_dashboard=True))

    # Hito recurrente: Tulipanes (1 oct → 15 nov, todos los años)
    session.add(Milestone(
        family_id=fam.id, name="Tulipanes", start_month=10, start_day=1,
        end_month=11, end_day=15, recurrence=Recurrence.annual.value, enabled=True,
    ))
    # Hito único: Eclipse 2027 (23 ene → 20 feb 2027)
    session.add(Milestone(
        family_id=fam.id, name="Eclipse 2027", start_month=1, start_day=23,
        end_month=2, end_day=20, recurrence=Recurrence.once.value, year=2027, enabled=True,
    ))
    session.commit()
    logger.info("Preset BENCHMARK Patagonia Andina creado con %d destinos", len(BENCHMARK_DESTINOS))


# Sitios oficiales de turismo por destino (fuente de verdad del inventario).
# Se pueden editar/agregar desde la API; estos vienen cargados para arrancar.
# selectores conocidos por sitio (verificados sobre el HTML real del municipio)
REGISTRY_SELECTORS = {
    # Esquel expone 22 fichas con esta clase; el primer texto de la ficha es la
    # dirección, así que el nombre se resuelve por el buscador de nombre plausible.
    "https://www.esquel.tur.ar/planifica/alojamiento/": {"item": "div.itemAlojamiento"},
}

REGISTRY_SOURCES = {
    "Esquel": ("Turismo Esquel", "https://www.esquel.tur.ar/planifica/alojamiento/"),
    "Trevelin": ("Turismo Trevelin", "https://trevelin.tur.ar/donde-dormir/"),
    "El Bolsón": ("Turismo El Bolsón", "https://www.turismoelbolson.gob.ar/alojamientos-donde-dormir"),
    "Bariloche": ("Bariloche Turismo", "https://barilocheturismo.gob.ar/es/buscar-hotel"),
    "Villa La Angostura": ("Villa La Angostura Turismo", "https://villalaangostura.gov.ar/alojamientos/"),
    "San Martín de los Andes": ("SMandes Turismo", "https://sanmartindelosandes.gov.ar/alojamiento/"),
}


def seed_registry_sources(session: Session) -> None:
    """Carga las fuentes oficiales conocidas para los destinos del preset."""
    for dest in session.query(Destination).all():
        cfg = REGISTRY_SOURCES.get(dest.name)
        if not cfg:
            continue
        name, url = cfg
        sel = REGISTRY_SELECTORS.get(url, {})
        exists = session.query(RegistrySource).filter(
            RegistrySource.destination_id == dest.id, RegistrySource.url == url).first()
        if exists:
            # actualizar selectores conocidos si la fuente aún no tiene ninguno
            if sel and not (exists.selectors or {}):
                exists.selectors = sel
            continue
        session.add(RegistrySource(destination_id=dest.id, name=name, url=url,
                                   enabled=True, selectors=sel))
    session.commit()


def seed_all(session: Session) -> None:
    seed_admin(session)
    seed_benchmark(session)
    seed_registry_sources(session)
