from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field, StrictInt, field_validator, model_validator


class AccommodationStop(BaseModel):
    poi_id: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    start_time: str | None = None
    end_time: str | None = None


class AccommodationDay(BaseModel):
    day_number: int = Field(ge=1, le=31)
    date: str | None = None
    stops: list[AccommodationStop] = Field(default_factory=list, max_length=200)

    @field_validator("date")
    @classmethod
    def valid_date(cls, value: str | None) -> str | None:
        return date.fromisoformat(value).isoformat() if value else None


class AccommodationItinerary(BaseModel):
    days: list[AccommodationDay] = Field(default_factory=list, max_length=31)


class AccommodationTripContext(BaseModel):
    destination: str = Field(min_length=1, max_length=100)
    days_count: int = Field(ge=1, le=31)
    start_date: str | None = None
    end_date: str | None = None
    date_mode: Literal["dates", "flex"] = "dates"
    adult_count: int = Field(default=1, ge=0, le=20)
    child_count: int = Field(default=0, ge=0, le=20)
    infant_count: int = Field(default=0, ge=0, le=20)
    pet_count: int = Field(default=0, ge=0, le=20)
    total_budget: int | None = Field(default=None, gt=0, le=1_000_000_000)
    lodging_preference: Literal["any", "budget", "standard", "luxury"] = "any"
    room_count: int | None = Field(default=None, ge=1, le=20)
    room_counts_by_group: dict[str, StrictInt] = Field(default_factory=dict, max_length=40)

    @field_validator("start_date", "end_date")
    @classmethod
    def valid_trip_date(cls, value: str | None) -> str | None:
        return date.fromisoformat(value).isoformat() if value else None

    @model_validator(mode="after")
    def consistent_dates(self):
        if self.date_mode == "flex":
            self.start_date = None
            self.end_date = None
        elif self.start_date and self.end_date:
            start = date.fromisoformat(self.start_date)
            end = date.fromisoformat(self.end_date)
            if end < start or (end - start).days + 1 != self.days_count:
                raise ValueError("Trip date range must match the selected number of days.")
        human_count = self.adult_count + self.child_count + self.infant_count
        if not 1 <= human_count <= 20:
            raise ValueError("Human traveler count must be between 1 and 20; pets are separate.")
        if any(not group_id or len(group_id) > 200 or not 1 <= rooms <= 20 for group_id, rooms in self.room_counts_by_group.items()):
            raise ValueError("Per-city room counts must use a valid group ID and be between 1 and 20.")
        return self


class AccommodationRecommendationRequest(BaseModel):
    alternative_id: str = Field(min_length=1, max_length=100)
    trip: AccommodationTripContext
    itinerary: AccommodationItinerary


class StayCandidate(BaseModel):
    stay_id: str
    name: str
    category: str | None = None
    city: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    image_url: str | None = None
    website_url: str | None = None
    nightly_room_price: float | None = None
    currency: str | None = None
    price_unit: str | None = None
    budget_tier: str | None = None
    max_guests_per_room: int | None = None
    room_types: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    rating: float | None = None
    review_count: int | None = None
    check_in: str | None = None
    check_out: str | None = None
    sustainability_evidence: str | None = None
    data_source: str
    updated_at: str | None = None


class AccommodationRecommendation(BaseModel):
    stay: StayCandidate
    match_score: float | None = Field(default=None, ge=0, le=100)
    average_coordinate_distance_km: float | None = None
    estimated_total_cost: float | None = None
    estimated_cost_unit: str | None = None
    reasons: list[str] = Field(default_factory=list)
    data_coverage: list[str] = Field(default_factory=list)


class AccommodationGroupRecommendations(BaseModel):
    group_id: str
    city: str
    area_label: str
    day_numbers: list[int]
    poi_count: int
    coordinate_poi_count: int
    nights: int
    nights_status: Literal["DATE_RANGE", "ESTIMATED", "UNKNOWN"]
    status: Literal["success", "no_data", "insufficient_location_data"]
    recommendations: list[AccommodationRecommendation] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class AccommodationRecommendationResponse(BaseModel):
    status: Literal["success", "no_data"]
    alternative_id: str
    itinerary_signature: str
    data_source: Literal["public.pois", "none"]
    groups: list[AccommodationGroupRecommendations] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
