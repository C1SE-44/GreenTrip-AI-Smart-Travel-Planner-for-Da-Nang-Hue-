from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class TransportStopInput(BaseModel):
    stop_id: str | None = Field(default=None, max_length=200)
    poi_id: str | None = Field(default=None, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinates_are_a_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("A stop must provide both coordinates or neither.")
        return self


class TransportDayInput(BaseModel):
    day_number: int = Field(ge=1, le=31)
    date: str | None = Field(default=None, max_length=10)
    stops: list[TransportStopInput] = Field(default_factory=list, max_length=200)

    @field_validator("date")
    @classmethod
    def valid_iso_date(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as error:
                raise ValueError("Transport day date must be an ISO calendar date.") from error
        return value


class TransportItineraryInput(BaseModel):
    days: list[TransportDayInput] = Field(min_length=1, max_length=31)

    @model_validator(mode="after")
    def unique_days_and_bounded_stops(self):
        day_numbers = [day.day_number for day in self.days]
        if len(set(day_numbers)) != len(day_numbers):
            raise ValueError("Itinerary day numbers must be unique.")
        if sum(len(day.stops) for day in self.days) > 200:
            raise ValueError("An itinerary may contain at most 200 stops for transport preview.")
        return self


class TransportTravelerCounts(BaseModel):
    adult_count: int | None = Field(default=None, ge=0, le=20)
    child_count: int | None = Field(default=None, ge=0, le=20)
    infant_count: int | None = Field(default=None, ge=0, le=20)
    pet_count: int | None = Field(default=None, ge=0, le=20)


class AccommodationGroupInput(BaseModel):
    group_id: str = Field(min_length=1, max_length=160)
    city: str = Field(min_length=1, max_length=100)
    status: Literal["RECOMMENDED", "SELECTED", "BOOKED_BY_USER", "CHOOSE_LATER"]
    name: str | None = Field(default=None, max_length=200)
    stay_id: str | None = Field(default=None, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    day_numbers: list[int] = Field(default_factory=list, max_length=31)

    @model_validator(mode="after")
    def coordinates_are_a_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Accommodation coordinates must include latitude and longitude.")
        return self


class TransportPreviewRequest(BaseModel):
    trip_id: str = Field(min_length=1, max_length=100)
    alternative_id: str = Field(min_length=1, max_length=100)
    itinerary: TransportItineraryInput
    travelers: TransportTravelerCounts | None = None
    accommodation_groups: list[AccommodationGroupInput] = Field(default_factory=list, max_length=40)


class TransportPoint(BaseModel):
    point_id: str
    point_type: Literal["POI", "ACCOMMODATION"]
    poi_id: str | None = None
    name: str
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class TransportRouteOption(BaseModel):
    mode: Literal["CAR", "PRIVATE_CAR", "TRAIN"]
    availability: Literal["AVAILABLE", "ESTIMATE_UNVERIFIED", "UNAVAILABLE", "USER_PROVIDED"]
    route_status: Literal["ROUTED", "HEURISTIC", "UNKNOWN"]
    provider: str
    route_profile: str
    distance_meters: float | None = Field(default=None, ge=0)
    duration_seconds: float | None = Field(default=None, ge=0)
    traffic_aware: bool = False
    departure_time_supported: bool = False
    fare_status: Literal["ESTIMATED", "PARTIAL", "UNAVAILABLE", "USER_PROVIDED"] = "UNAVAILABLE"
    estimated_fare: float | None = None
    fare_currency: str | None = None
    fare_unit: str | None = None
    fare_source: str | None = None
    fare_source_url: str | None = None
    fare_region: str | None = None
    emissions_status: Literal["ESTIMATED", "PARTIAL", "UNAVAILABLE"] = "UNAVAILABLE"
    estimated_co2e_kg: float | None = None
    emissions_unit: str | None = None
    emissions_source: str | None = None
    emissions_source_url: str | None = None
    emissions_region: str | None = None
    emissions_scope: str | None = None
    train_service_name: str | None = None
    train_departure_at: str | None = None
    train_arrival_at: str | None = None
    train_door_to_door_seconds: float | None = Field(default=None, ge=0)
    first_mile_distance_meters: float | None = Field(default=None, ge=0)
    first_mile_duration_seconds: float | None = Field(default=None, ge=0)
    first_mile_route_status: Literal["ROUTED", "HEURISTIC", "UNKNOWN"] | None = None
    last_mile_distance_meters: float | None = Field(default=None, ge=0)
    last_mile_duration_seconds: float | None = Field(default=None, ge=0)
    last_mile_route_status: Literal["ROUTED", "HEURISTIC", "UNKNOWN"] | None = None
    train_ticket_status: Literal["NOT_CONFIRMED"] | None = None
    data_source: str
    warnings: list[str] = Field(default_factory=list)


class TransportLeg(BaseModel):
    leg_id: str
    alternative_id: str
    day_number: int
    sequence: int = Field(ge=1)
    date: str | None = None
    scope: Literal["INTRACITY", "INTERCITY", "UNKNOWN"]
    origin: TransportPoint
    destination: TransportPoint
    options: list[TransportRouteOption] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class UncomputedTransportEndpoint(BaseModel):
    day_number: int
    endpoint: Literal["FIRST_MILE", "LAST_MILE"]
    city: str | None = None
    reason: str


class TransportProviderCapabilities(BaseModel):
    provider: str
    route_profile: str
    supported_modes: list[str]
    route_matrix: bool = False
    departure_time_supported: bool = False
    traffic_aware: bool = False


class TransportPreviewResponse(BaseModel):
    status: Literal["success", "partial", "unavailable"]
    trip_id: str
    alternative_id: str
    itinerary_fingerprint: str
    provider_capabilities: TransportProviderCapabilities
    legs: list[TransportLeg] = Field(default_factory=list)
    uncomputed_endpoints: list[UncomputedTransportEndpoint] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
