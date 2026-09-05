"""Codificador Protobuf del parámetro ?tfs= de Google Flights.

Vendorizado según especificación de Prompt 1 para evitar dependencias externas
frágiles en tiempo de ejecución.
"""
from __future__ import annotations

from base64 import b64encode
from datetime import date, datetime
from typing import Literal

from .flights_pb2 import Airport, FlightData, Info, Passenger, Seat, Trip


def encode_tfs(
    origin: str,
    destination: str,
    departure_date: str | date,
    return_date: str | date | None = None,
    trip_type: Literal["one_way", "round_trip"] = "round_trip",
    adults: int = 1,
    seat: Literal["economy", "premium_economy", "business", "first"] = "economy",
) -> str:
    """Codifica los parámetros de búsqueda al formato Protobuf base64 para Google Flights."""
    dep_str = departure_date.isoformat() if isinstance(departure_date, (date, datetime)) else str(departure_date)

    flight_slices = [
        FlightData(
            date=dep_str,
            from_airport=Airport(airport=origin.upper()),
            to_airport=Airport(airport=destination.upper()),
        )
    ]

    trip_enum = Trip.ONE_WAY
    if trip_type == "round_trip" and return_date:
        ret_str = return_date.isoformat() if isinstance(return_date, (date, datetime)) else str(return_date)
        flight_slices.append(
            FlightData(
                date=ret_str,
                from_airport=Airport(airport=destination.upper()),
                to_airport=Airport(airport=origin.upper()),
            )
        )
        trip_enum = Trip.ROUND_TRIP

    seat_map = {
        "economy": Seat.ECONOMY,
        "premium_economy": Seat.PREMIUM_ECONOMY,
        "business": Seat.BUSINESS,
        "first": Seat.FIRST,
    }

    passengers = [Passenger.ADULT for _ in range(max(1, min(9, adults)))]

    info = Info(
        data=flight_slices,
        seat=seat_map.get(seat.lower(), Seat.ECONOMY),
        trip=trip_enum,
        passengers=passengers,
    )

    return b64encode(info.SerializeToString()).decode("utf-8")
