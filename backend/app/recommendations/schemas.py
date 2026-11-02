"""Request and response models for POI recommendations."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.pois.weights import ParsedSliderWeights
from app.trips.schemas import ValidatedTripData


class RecommendationRequest(BaseModel):
    """Preferences used to generate a ranked POI list."""

    interests: list[str] = Field(default_factory=list)
    budget_band: int = Field(default=2, ge=1, le=3, description="1=Low, 2=Medium, 3=High")
    green_priority: float = Field(default=0.7, ge=0.0, le=1.0)
    top_k: int = Field(default=50, ge=1, le=50)
    trip_data: ValidatedTripData | None = Field(
        default=None,
        description="Validated PB07 response data; submit the response's data object.",
    )
    slider_weights: ParsedSliderWeights | None = Field(
        default=None,
        description="Parsed PB08 slider weights and hard eco/budget constraints.",
    )

    @field_validator("interests")
    @classmethod
    def interests_must_not_be_blank(cls, interests: list[str]) -> list[str]:
        cleaned = [interest.strip() for interest in interests]
        return [interest for interest in cleaned if interest]

    @model_validator(mode="after")
    def require_preferences(self) -> "RecommendationRequest":
        if (self.trip_data is None) != (self.slider_weights is None):
            raise ValueError("trip_data and slider_weights must be provided together")
        if not self.interests and not (
            self.trip_data and self.trip_data.preferences
        ):
            raise ValueError("provide interests or PB07 trip_data preferences")
        return self


class RecommendationPOI(BaseModel):
    """A POI and its recommendation metadata."""

    poi_id: str
    name: str
    category_name: str | None = None
    match_score: float = Field(ge=0.0, le=100.0)
    estimated_cost: float | None = None
    satisfaction_score: float | None = None
    is_local_business: bool
    green_score: float | None = None
    lat: float | None = None
    lng: float | None = None
    explanation_snippet: str


class RecommendationResponse(BaseModel):
    """Response envelope returned by the recommendation endpoint."""

    status: Literal["success"] = "success"
    total: int = Field(ge=0)
    data: list[RecommendationPOI]
