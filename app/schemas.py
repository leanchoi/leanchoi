"""Esquemas Pydantic para la API."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DestinationBase(BaseModel):
    query: str = Field(..., min_length=1, max_length=200)
    platforms: str = "booking,airbnb"
    adults: int = Field(2, ge=1, le=30)
    nights: int = Field(2, ge=1, le=60)
    checkin_offset_days: int = Field(30, ge=0, le=365)
    currency: str = "EUR"
    interval_minutes: int | None = Field(1440, ge=5)
    cron: str | None = None
    enabled: bool = True
    max_pages: int = Field(2, ge=1, le=20)


class DestinationCreate(DestinationBase):
    pass


class DestinationUpdate(BaseModel):
    query: str | None = None
    platforms: str | None = None
    adults: int | None = Field(None, ge=1, le=30)
    nights: int | None = Field(None, ge=1, le=60)
    checkin_offset_days: int | None = Field(None, ge=0, le=365)
    currency: str | None = None
    interval_minutes: int | None = Field(None, ge=5)
    cron: str | None = None
    enabled: bool | None = None
    max_pages: int | None = Field(None, ge=1, le=20)


class DestinationOut(DestinationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    last_run_at: datetime | None = None
    last_status: str | None = None


class PricePointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    destination_id: int
    platform: str
    listing_id: str | None = None
    name: str
    url: str | None = None
    room_type: str | None = None
    price: float | None = None
    currency: str | None = None
    price_raw: str | None = None
    rating: float | None = None
    reviews: int | None = None
    checkin: str | None = None
    checkout: str | None = None
    scraped_at: datetime


class ScrapeRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    destination_id: int
    platform: str
    status: str
    items_found: int
    error: str | None = None
    started_at: datetime
    finished_at: datetime | None = None
