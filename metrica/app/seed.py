"""Sembrado inicial: admin + preset BENCHMARK Patagonia Andina."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from .config import get_settings
from .models import Destination, Family, Milestone, Recurrence, Role, User
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


def seed_all(session: Session) -> None:
    seed_admin(session)
    seed_benchmark(session)
