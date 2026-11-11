"""Request and response models for POI recommendations."""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.pois.weights import ParsedSliderWeights
from app.trips.schemas import ValidatedTripData


class RecommendationRequest(BaseModel):
    """Preferences used to generate a ranked POI list."""

    interests: list[str] = Field(default_factory=list)
    budget_band: int = Field(default=2, ge=1, le=3, description="1=Low, 2=Medium, 3=High")
    budget_tier: str | None = Field(default=None, description="any, budget, standard, upgrade, luxury")
    destination: str | None = Field(default=None, description="Destination city, e.g. Đà Nẵng, Huế")
    ideas: list[str] = Field(default_factory=list, description="POI names or IDs user added to ideas")
    trip_days: int | None = Field(default=None, ge=1, le=30, description="Duration of the trip in days")
    green_priority: float = Field(default=0.7, ge=0.0, le=1.0)
    top_k: int = Field(default=10, ge=1, le=50)
    trip_data: ValidatedTripData | None = Field(
        default=None,
        description="Validated PB07 response data; submit the response's data object.",
    )
    slider_weights: ParsedSliderWeights | None = Field(
        default=None,
        description="Parsed PB08 slider weights and hard eco/budget constraints.",
    )

    @field_validator("interests", mode="before")
    @classmethod
    def interests_must_not_be_blank(cls, interests: Any) -> list[str]:
        if not interests:
            return []
        if isinstance(interests, list):
            cleaned = [str(interest).strip() for interest in interests]
            return [interest for interest in cleaned if interest]
        return [str(interests).strip()]

    @model_validator(mode="after")
    def require_preferences(self) -> "RecommendationRequest":
        return self


class RecommendationPOI(BaseModel):
    """A POI and its recommendation metadata."""

    poi_id: str
    name: str
    category_name: str | None = None
    sub_category: str | None = None
    average_visit_minutes: float | None = None
    best_time: list[str] | None = None
    opening_hours: dict[str, Any] | None = None
    match_score: float = Field(ge=0.0, le=100.0)
    estimated_cost: float | None = None
    satisfaction_score: float | None = None
    is_local_business: bool
    green_score: float | None = None
    lat: float | None = None
    lng: float | None = None
    image: str | None = None
    gallery: list[str] | None = None
    city: str | None = None
    explanation_snippet: str


class RecommendationResponse(BaseModel):
    """Response envelope returned by the recommendation endpoint."""

    status: Literal["success"] = "success"
    total: int = Field(ge=0)
    data: list[RecommendationPOI]
