"""Esquemas Pydantic de la API."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


# --- Auth / usuarios ---
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=80)
    password: str = Field(..., min_length=6)
    email: str | None = None
    role: str = "viewer"


class UserUpdate(BaseModel):
    password: str | None = Field(None, min_length=6)
    email: str | None = None
    role: str | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str | None = None
    role: str
    is_active: bool
    created_at: datetime
    last_login: datetime | None = None


# --- Familias / hitos ---
class MilestoneIn(BaseModel):
    name: str
    start_month: int = Field(..., ge=1, le=12)
    start_day: int = Field(..., ge=1, le=31)
    end_month: int = Field(..., ge=1, le=12)
    end_day: int = Field(..., ge=1, le=31)
    recurrence: str = "annual"
    year: int | None = None
    enabled: bool = True


class MilestoneOut(MilestoneIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class DestinationIn(BaseModel):
    name: str
    booking_query: str | None = None
    airbnb_query: str | None = None
    enabled: bool = True
    active_in_dashboard: bool = True


class DestinationOut(DestinationIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    family_id: int


class FamilyIn(BaseModel):
    name: str
    description: str | None = None
    adults: int = 1
    nights: int = 1
    platforms: str = "booking,airbnb"
    rolling_days: int = Field(30, ge=1, le=365)
    checkpoint_months: str = "2,3,4,5,6"
    interval_minutes: int = Field(1440, ge=30)
    enabled: bool = True


class FamilyOut(FamilyIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_preset: bool
    created_at: datetime
    last_run_at: datetime | None = None
    destinations: list[DestinationOut] = []
    milestones: list[MilestoneOut] = []


class ObservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    platform: str
    typology: str
    stay_checkin: date
    stay_checkout: date
    observed_date: date
    price_ars: float | None = None
    price_usd: float | None = None
    fx_implicit: float | None = None
    available: bool
    rating: float | None = None
