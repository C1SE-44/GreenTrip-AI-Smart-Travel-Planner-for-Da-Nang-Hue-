"""Railway schedule adapter contracts. No unverified timetable is bundled."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Protocol
from urllib.parse import urlparse

from pydantic import BaseModel, Field, model_validator

from app.itineraries.schemas import RouteStop
from app.transport.schemas import TransportPoint, TransportRouteOption

class RailStationRecord(BaseModel):
    station_id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    city: str = Field(min_length=1, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinates_are_a_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Station coordinates must include latitude and longitude.")
        return self


class RailServiceRecord(BaseModel):
    service_id: str = Field(min_length=1, max_length=100)
    service_name: str | None = Field(default=None, max_length=120)
    origin: RailStationRecord
    destination: RailStationRecord
    departure_at: datetime
    arrival_at: datetime
    source_kind: Literal["VERIFIED_PROVIDER", "USER_PROVIDED"]
    source_name: str | None = Field(default=None, max_length=200)
    source_url: str | None = Field(default=None, max_length=1000)
    updated_at: datetime | None = None
    valid_until: datetime | None = None
    station_buffer_minutes: int | None = Field(default=None, ge=0, le=360)
    transfer_buffer_minutes: int | None = Field(default=None, ge=0, le=360)
    fare_amount: float | None = Field(default=None, ge=0)
    fare_currency: str | None = None
    fare_unit: str | None = None
    ticket_status: Literal["NOT_CONFIRMED"] = "NOT_CONFIRMED"

    @model_validator(mode="after")
    def validate_service_data(self):
        if self.departure_at.utcoffset() is None or self.arrival_at.utcoffset() is None:
            raise ValueError("Rail times must include a timezone offset.")
        if self.arrival_at <= self.departure_at:
            raise ValueError("Rail arrival must be later than departure.")
        if self.source_kind == "VERIFIED_PROVIDER":
            parsed = urlparse(self.source_url or "")
            if not self.source_name or parsed.scheme != "https" or not parsed.netloc or not self.updated_at or not self.valid_until:
                raise ValueError("Verified rail data requires a named source, HTTPS URL, update time, and validity time.")
            if self.updated_at.utcoffset() is None:
                raise ValueError("Rail source update time must include a timezone offset.")
            if self.valid_until is not None and self.valid_until.utcoffset() is None:
                raise ValueError("Rail data validity time must include a timezone offset.")
        if self.fare_amount is not None and (not self.fare_currency or not self.fare_unit):
            raise ValueError("A rail fare requires currency and unit.")
        if self.fare_currency and self.fare_currency.upper() not in {"VND", "USD", "EUR"}:
            raise ValueError("Unsupported rail fare currency.")
        return self


class RailwayScheduleProvider(Protocol):
    def get_services(
        self, origin_city: str, destination_city: str, travel_date: str | None
    ) -> list[RailServiceRecord]: ...


class NoRailwayScheduleProvider:
    """Safe default until an authorized railway timetable source is configured."""

    def get_services(
        self, origin_city: str, destination_city: str, travel_date: str | None
    ) -> list[RailServiceRecord]:
        return []


def door_to_door_duration_seconds(
    *,
    first_mile_seconds: float | None,
    station_buffer_minutes: int | None,
    departure_at: datetime,
    arrival_at: datetime,
    transfer_buffer_minutes: int | None,
    last_mile_seconds: float | None,
) -> float | None:
    """Combine known components only; a missing component keeps total time unknown."""
    values = (first_mile_seconds, station_buffer_minutes, transfer_buffer_minutes, last_mile_seconds)
    if any(value is None for value in values):
        return None
    if departure_at.utcoffset() is None or arrival_at.utcoffset() is None or arrival_at <= departure_at:
        return None
    if first_mile_seconds < 0 or last_mile_seconds < 0 or station_buffer_minutes < 0 or transfer_buffer_minutes < 0:
        return None
    train_seconds = (arrival_at - departure_at).total_seconds()
    return (
        first_mile_seconds
        + station_buffer_minutes * 60
        + train_seconds
        + transfer_buffer_minutes * 60
        + last_mile_seconds
    )


def is_da_nang_hue_pair(origin_city: str | None, destination_city: str | None) -> bool:
    return {normalize_city(origin_city), normalize_city(destination_city)} == {"da nang", "hue"}


def normalize_city(value: str | None) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(char for char in normalized if not unicodedata.combining(char)).casefold().replace("đ", "d").strip()


def _route_between(
    origin: TransportPoint | RailStationRecord,
    destination: TransportPoint | RailStationRecord,
    route_metrics,
) -> tuple[float | None, float | None, str]:
    origin_latitude, origin_longitude = origin.latitude, origin.longitude
    destination_latitude, destination_longitude = destination.latitude, destination.longitude
    if any(value is None for value in (origin_latitude, origin_longitude, destination_latitude, destination_longitude)):
        return None, None, "unknown"
    origin_id = getattr(origin, "poi_id", None) or getattr(origin, "point_id", None) or getattr(origin, "station_id", "rail-origin")
    destination_id = getattr(destination, "poi_id", None) or getattr(destination, "point_id", None) or getattr(destination, "station_id", "rail-destination")
    stops = [
        RouteStop(order=1, poi_id=str(origin_id), name=origin.name, latitude=origin_latitude, longitude=origin_longitude),
        RouteStop(order=2, poi_id=str(destination_id), name=destination.name, latitude=destination_latitude, longitude=destination_longitude),
    ]
    try:
        metrics, provider = route_metrics(stops)
    except Exception:
        return None, None, "unavailable"
    metric = metrics[0] if metrics else None
    if provider != "osrm" or metric is None:
        return (metric or {}).get("distance_meters"), None, "heuristic" if provider == "fallback" else "unknown"
    return metric.get("distance_meters"), metric.get("duration_seconds"), "routed"


def build_train_options(
    *,
    origin: TransportPoint,
    destination: TransportPoint,
    travel_date: str | None,
    provider: RailwayScheduleProvider,
    route_metrics,
) -> list[TransportRouteOption]:
    """Build schedule-backed choices; user-provided timetables remain unconfirmed."""
    if not is_da_nang_hue_pair(origin.city, destination.city):
        return []
    try:
        services = provider.get_services(origin.city or "", destination.city or "", travel_date)
    except Exception:
        services = []
    candidates = [
        service for service in services
        if normalize_city(service.origin.city) == normalize_city(origin.city)
        and normalize_city(service.destination.city) == normalize_city(destination.city)
        and (not travel_date or service.departure_at.date().isoformat() == travel_date)
    ]
    if not candidates:
        return [TransportRouteOption(
            mode="TRAIN",
            availability="UNAVAILABLE",
            route_status="UNKNOWN",
            provider="No verified railway timetable provider",
            route_profile="railway",
            fare_status="UNAVAILABLE",
            emissions_status="UNAVAILABLE",
            data_source="No timetable source configured",
            train_ticket_status="NOT_CONFIRMED",
            warnings=[
                "Tàu Đà Nẵng–Huế qua Hải Vân có thể cân nhắc, nhưng chưa có lịch tàu/ga được xác minh.",
                "Không dùng tuyến driving để suy ra thời gian tàu; giờ chạy, giá vé và tình trạng vé chưa xác định.",
            ],
        )]

    options: list[TransportRouteOption] = []
    for service in candidates[:5]:
        first_distance, first_seconds, first_quality = _route_between(origin, service.origin, route_metrics)
        last_distance, last_seconds, last_quality = _route_between(service.destination, destination, route_metrics)
        door_seconds = door_to_door_duration_seconds(
            first_mile_seconds=first_seconds,
            station_buffer_minutes=service.station_buffer_minutes,
            departure_at=service.departure_at,
            arrival_at=service.arrival_at,
            transfer_buffer_minutes=service.transfer_buffer_minutes,
            last_mile_seconds=last_seconds,
        )
        verified = service.source_kind == "VERIFIED_PROVIDER"
        source_valid = verified and bool(service.source_name and service.source_url and service.updated_at and service.valid_until)
        if service.valid_until and service.valid_until < service.departure_at:
            source_valid = False
        availability = (
            "AVAILABLE" if source_valid and door_seconds is not None
            else "USER_PROVIDED" if not verified
            else "ESTIMATE_UNVERIFIED"
        )
        warnings: list[str] = []
        if not verified:
            warnings.append("Giờ tàu do người dùng cung cấp; chưa xác minh với lịch chính thức và không xác nhận vé đã đặt.")
        if first_quality != "routed" or last_quality != "routed":
            warnings.append("First-mile hoặc last-mile chưa có thời lượng đường bộ được routing xác minh.")
        if door_seconds is None:
            warnings.append("Chưa đủ first-mile, station buffer, train time, transfer buffer và last-mile để tính tổng door-to-door.")
        fare_verified = source_valid and service.fare_amount is not None
        fare_user = not verified and service.fare_amount is not None
        options.append(TransportRouteOption(
            mode="TRAIN",
            availability=availability,
            route_status="UNKNOWN",
            provider=service.source_name or "User-provided schedule",
            route_profile="railway",
            distance_meters=None,
            duration_seconds=door_seconds,
            departure_time_supported=True,
            fare_status="ESTIMATED" if fare_verified else "USER_PROVIDED" if fare_user else "UNAVAILABLE",
            estimated_fare=service.fare_amount,
            fare_currency=service.fare_currency,
            fare_unit=service.fare_unit,
            fare_source=(service.source_name or "User-provided fare") if service.fare_amount is not None else None,
            fare_source_url=service.source_url if fare_verified else None,
            fare_region="VN" if fare_verified else None,
            emissions_status="UNAVAILABLE",
            train_service_name=service.service_name or service.service_id,
            train_departure_at=service.departure_at.isoformat(),
            train_arrival_at=service.arrival_at.isoformat(),
            train_door_to_door_seconds=door_seconds,
            first_mile_distance_meters=first_distance,
            first_mile_duration_seconds=first_seconds,
            first_mile_route_status={"routed": "ROUTED", "heuristic": "HEURISTIC"}.get(first_quality, "UNKNOWN"),
            last_mile_distance_meters=last_distance,
            last_mile_duration_seconds=last_seconds,
            last_mile_route_status={"routed": "ROUTED", "heuristic": "HEURISTIC"}.get(last_quality, "UNKNOWN"),
            train_ticket_status="NOT_CONFIRMED",
            data_source=service.source_name or "User-provided schedule",
            warnings=warnings,
        ))
    return options
