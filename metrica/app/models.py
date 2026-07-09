"""Modelos ORM de METRICA (SQLAlchemy 2.0).

Núcleo del sistema: la tabla `observations` tiene el grano de DOS fechas
(observed_date × stay_checkin), lo que permite reconstruir la curva de
anticipación de precios y la evolución de disponibilidad en el tiempo.
"""
from __future__ import annotations

import enum
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# --------------------------------------------------------------------------
#  Usuarios y roles (para el panel de admin y la venta futura)
# --------------------------------------------------------------------------
class Role(str, enum.Enum):
    admin = "admin"      # todo + gestión de usuarios
    editor = "editor"    # crea/edita familias y destinos, lanza scrapeos
    viewer = "viewer"    # solo ve dashboards y descarga datos


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default=Role.viewer.value)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# --------------------------------------------------------------------------
#  Familias (presets de búsqueda) e hitos de demanda
# --------------------------------------------------------------------------
class Family(Base):
    __tablename__ = "families"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_preset: Mapped[bool] = mapped_column(Boolean, default=False)

    # Medición base
    adults: Mapped[int] = mapped_column(Integer, default=1)
    nights: Mapped[int] = mapped_column(Integer, default=1)
    platforms: Mapped[str] = mapped_column(String(60), default="booking,airbnb")

    # Cadencia temporal
    rolling_days: Mapped[int] = mapped_column(Integer, default=30)          # próximos N días, diario
    checkpoint_months: Mapped[str] = mapped_column(String(60), default="2,3,4,5,6")  # +N meses

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Periodicidad de ejecución del scrapeo (minutos entre corridas)
    interval_minutes: Mapped[int] = mapped_column(Integer, default=1440)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    destinations: Mapped[list["Destination"]] = relationship(
        back_populates="family", cascade="all, delete-orphan"
    )
    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="family", cascade="all, delete-orphan"
    )

    @property
    def checkpoint_list(self) -> list[int]:
        return [int(x) for x in self.checkpoint_months.split(",") if x.strip().isdigit()]

    @property
    def platform_list(self) -> list[str]:
        return [p.strip() for p in self.platforms.split(",") if p.strip()]


class Recurrence(str, enum.Enum):
    annual = "annual"    # se repite todos los años (ej. Tulipanes)
    once = "once"        # ocurrencia única (ej. Eclipse 2027)


class Milestone(Base):
    """Ventana de observación intensiva por evento de demanda."""
    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    start_month: Mapped[int] = mapped_column(Integer)
    start_day: Mapped[int] = mapped_column(Integer)
    end_month: Mapped[int] = mapped_column(Integer)
    end_day: Mapped[int] = mapped_column(Integer)
    recurrence: Mapped[str] = mapped_column(String(12), default=Recurrence.annual.value)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)  # solo para 'once'
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    family: Mapped["Family"] = relationship(back_populates="milestones")


# --------------------------------------------------------------------------
#  Destinos
# --------------------------------------------------------------------------
class Destination(Base):
    __tablename__ = "destinations"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    booking_query: Mapped[str | None] = mapped_column(String(200), nullable=True)
    airbnb_query: Mapped[str | None] = mapped_column(String(200), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    active_in_dashboard: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    family: Mapped["Family"] = relationship(back_populates="destinations")

    def query_for(self, platform: str) -> str:
        if platform == "booking":
            return self.booking_query or self.name
        if platform == "airbnb":
            return self.airbnb_query or self.name
        return self.name


# --------------------------------------------------------------------------
#  Listing (dimensión: una fila por unidad única en el tiempo)
#
#  Identidad permanente: `id` (autoincrement interno) es el ID propio del
#  sistema y es lo que referencian las observaciones — NUNCA el nombre.
#  La correlación en el tiempo se hace por (platform, external_id), donde
#  external_id se deriva del LINK del anuncio (id/slug de la plataforma), que
#  es estable aunque cambie el nombre. Se guarda también la URL y el historial
#  de nombres en `attributes` para reconciliar por otros datos si hiciera falta.
# --------------------------------------------------------------------------
class Typology(str, enum.Enum):
    cabana = "cabana"
    departamento = "departamento"
    hotel = "hotel"
    hosteria = "hosteria"
    casa = "casa"
    otro = "otro"


class Listing(Base):
    __tablename__ = "listings"
    __table_args__ = (UniqueConstraint("platform", "external_id", name="uq_listing_platform_ext"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    platform: Mapped[str] = mapped_column(String(20), index=True)
    external_id: Mapped[str] = mapped_column(String(120), index=True)
    destination_id: Mapped[int | None] = mapped_column(
        ForeignKey("destinations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(400))
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    typology: Mapped[str] = mapped_column(String(20), default=Typology.otro.value, index=True)
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# --------------------------------------------------------------------------
#  Observación (tabla de hechos: DOS fechas)
# --------------------------------------------------------------------------
class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    destination_id: Mapped[int | None] = mapped_column(
        ForeignKey("destinations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    run_id: Mapped[int | None] = mapped_column(
        ForeignKey("scrape_runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    platform: Mapped[str] = mapped_column(String(20), index=True)
    typology: Mapped[str] = mapped_column(String(20), default=Typology.otro.value, index=True)

    # --- eje 1: la noche a la que apunta la tarifa ---
    stay_checkin: Mapped[date] = mapped_column(Date, index=True)
    stay_checkout: Mapped[date] = mapped_column(Date)

    # --- eje 2: cuándo lo observamos ---
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    observed_date: Mapped[date] = mapped_column(Date, index=True)

    # --- métricas ---
    price_ars: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    fx_implicit: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency_native: Mapped[str | None] = mapped_column(String(8), nullable=True)
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    room_type: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    reviews: Mapped[int | None] = mapped_column(Integer, nullable=True)


class FxDaily(Base):
    """Tipo de cambio implícito diario por plataforma (mediana entre listings)."""
    __tablename__ = "fx_daily"
    __table_args__ = (UniqueConstraint("observed_date", "platform", name="uq_fx_day_platform"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    observed_date: Mapped[date] = mapped_column(Date, index=True)
    platform: Mapped[str] = mapped_column(String(20))
    fx_rate: Mapped[float] = mapped_column(Float)
    sample_count: Mapped[int] = mapped_column(Integer, default=0)


class ScrapeRun(Base):
    __tablename__ = "scrape_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int | None] = mapped_column(ForeignKey("families.id", ondelete="SET NULL"), nullable=True, index=True)
    destination_id: Mapped[int | None] = mapped_column(ForeignKey("destinations.id", ondelete="SET NULL"), nullable=True, index=True)
    platform: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="running")  # running|ok|blocked|error
    stay_dates: Mapped[int] = mapped_column(Integer, default=0)
    observations: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
