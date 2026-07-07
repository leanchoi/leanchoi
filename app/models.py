"""Modelos ORM (SQLAlchemy 2.0)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Destination(Base):
    """Un destino a scrapear con su periodicidad y parametros de busqueda."""

    __tablename__ = "destinations"

    id: Mapped[int] = mapped_column(primary_key=True)
    query: Mapped[str] = mapped_column(String(200), index=True)  # p.ej. "Madrid"
    # Plataformas activas, CSV: "booking,airbnb"
    platforms: Mapped[str] = mapped_column(String(100), default="booking,airbnb")

    adults: Mapped[int] = mapped_column(Integer, default=2)
    nights: Mapped[int] = mapped_column(Integer, default=2)
    # Dias en el futuro donde empieza el check-in
    checkin_offset_days: Mapped[int] = mapped_column(Integer, default=30)
    currency: Mapped[str] = mapped_column(String(8), default="EUR")

    # Periodicidad. Se soportan dos modos (uno u otro):
    #  - interval_minutes: cada N minutos
    #  - cron: expresion cron de 5 campos ("0 6 * * *")
    interval_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1440)
    cron: Mapped[str | None] = mapped_column(String(100), nullable=True)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    max_pages: Mapped[int] = mapped_column(Integer, default=2)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(50), nullable=True)

    runs: Mapped[list["ScrapeRun"]] = relationship(
        back_populates="destination", cascade="all, delete-orphan"
    )
    prices: Mapped[list["PricePoint"]] = relationship(
        back_populates="destination", cascade="all, delete-orphan"
    )

    @property
    def platform_list(self) -> list[str]:
        return [p.strip() for p in self.platforms.split(",") if p.strip()]


class ScrapeRun(Base):
    """Registro de una ejecucion de scrapeo (para diagnostico y trazabilidad)."""

    __tablename__ = "scrape_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    destination_id: Mapped[int] = mapped_column(
        ForeignKey("destinations.id", ondelete="CASCADE"), index=True
    )
    platform: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="running")  # running|ok|blocked|error
    items_found: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    destination: Mapped["Destination"] = relationship(back_populates="runs")


class PricePoint(Base):
    """Un precio observado para un alojamiento concreto en una fecha concreta."""

    __tablename__ = "price_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    destination_id: Mapped[int] = mapped_column(
        ForeignKey("destinations.id", ondelete="CASCADE"), index=True
    )
    run_id: Mapped[int | None] = mapped_column(
        ForeignKey("scrape_runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    platform: Mapped[str] = mapped_column(String(20), index=True)

    listing_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(400))
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    room_type: Mapped[str | None] = mapped_column(String(200), nullable=True)

    price: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    price_raw: Mapped[str | None] = mapped_column(String(120), nullable=True)

    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    reviews: Mapped[int | None] = mapped_column(Integer, nullable=True)

    checkin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    checkout: Mapped[str | None] = mapped_column(String(20), nullable=True)

    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )

    destination: Mapped["Destination"] = relationship(back_populates="prices")
