"""Pydantic input and output schemas for GreenTrip AI Tool Calling."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


# --- Tool 1: search_pois ---
class SearchPoisInput(BaseModel):
    query: str = Field(description="Search keyword for place name, dish, activity or location")
    city: Literal["Danang", "Hue", "all"] | None = Field(default=None, description="Optional city filter")
    category: str | None = Field(default=None, description="Optional category filter (e.g. Ẩm thực, Di tích)")
    limit: int = Field(default=5, ge=1, le=20, description="Max POIs to return")


class PoiSummaryItem(BaseModel):
    poi_id: str
    name: str
    city: str
    category: str
    address: str
    green_score: float
    price_tier: int
    lat: float
    lng: float


class SearchPoisOutput(BaseModel):
    total_found: int
    pois: list[PoiSummaryItem] = Field(default_factory=list)


# --- Tool 2: get_poi_details ---
class GetPoiDetailsInput(BaseModel):
    poi_id: str = Field(description="Unique ID or exact UUID of the POI")


class GetPoiDetailsOutput(BaseModel):
    found: bool
    poi: dict[str, Any] | None = None
    error: str | None = None


# --- Tool 3: recommend_pois ---
class RecommendPoisInput(BaseModel):
    interests: list[str] = Field(description="List of traveler interest tags (e.g. ['chay', 'di san', 'bien', 'sinh thai'])")
    city: Literal["Danang", "Hue"] = Field(description="Destination city")
    budget_band: int = Field(default=2, ge=1, le=4, description="Budget band 1 (economy) to 4 (luxury)")
    limit: int = Field(default=5, ge=1, le=15, description="Number of recommendations")


class RecommendedPoiItem(BaseModel):
    poi_id: str
    name: str
    city: str
    category: str
    score: float
    reason: str
    green_score: float


class RecommendPoisOutput(BaseModel):
    total_found: int
    recommendations: list[RecommendedPoiItem] = Field(default_factory=list)


# --- Tool 4: get_poi_explanation ---
class GetPoiExplanationInput(BaseModel):
    poi_id: str = Field(description="Unique ID or exact name of the POI to explain")


class GetPoiExplanationOutput(BaseModel):
    poi_id: str
    poi_name: str
    is_local_business: bool
    local_business_type: str | None = None
    facts: list[dict[str, Any]] = Field(default_factory=list)
    explanation_text: str = Field(description="Human-readable justification why this place was recommended")
    kg_source: Literal["live_neo4j", "relational_projection", "description_fallback"] = "relational_projection"


# --- Tool 5: calculate_trip_cost ---
class CalculateTripCostInput(BaseModel):
    num_days: int = Field(ge=1, le=14, description="Number of travel days")
    num_people: int = Field(ge=1, le=30, description="Number of travelers")
    budget_tier: Literal["budget", "standard", "comfort", "luxury"] = Field(
        default="standard", description="Budget tier level"
    )


class CalculateTripCostOutput(BaseModel):
    num_days: int
    num_people: int
    budget_tier: str
    cost_per_person_per_day_vnd: int
    total_estimated_cost_vnd: int
    formatted_vnd: str
    budget_breakdown: dict[str, int]


# --- Tool 6: get_route_information ---
class GetRouteInformationInput(BaseModel):
    origin_lat: float = Field(ge=15.0, le=17.0, description="Latitude of start coordinate")
    origin_lng: float = Field(ge=107.0, le=109.0, description="Longitude of start coordinate")
    dest_lat: float = Field(ge=15.0, le=17.0, description="Latitude of destination coordinate")
    dest_lng: float = Field(ge=107.0, le=109.0, description="Longitude of destination coordinate")
    profile: Literal["driving", "bike", "walking"] = Field(default="driving")
    priority_profile: Literal["balanced", "eco_priority", "budget_constrained"] = Field(
        default="balanced", description="Priority profile for multi-criteria transport evaluation"
    )


class GetRouteInformationOutput(BaseModel):
    distance_meters: float
    distance_km: float
    duration_seconds: float
    duration_minutes: float
    is_fallback: bool
    routing_profile: str
    recommended_mode: str = "motorcycle"
    estimated_cost_vnd: float = 0.0
    carbon_kg: float = 0.0
    transport_options: list[dict[str, Any]] = Field(default_factory=list)
    recommendation_summary: str = ""


class RecommendTransportModeInput(BaseModel):
    origin_lat: float = Field(ge=15.0, le=17.0, description="Latitude of start coordinate")
    origin_lng: float = Field(ge=107.0, le=109.0, description="Longitude of start coordinate")
    dest_lat: float = Field(ge=15.0, le=17.0, description="Latitude of destination coordinate")
    dest_lng: float = Field(ge=107.0, le=109.0, description="Longitude of destination coordinate")
    priority_profile: Literal["balanced", "eco_priority", "budget_constrained"] = Field(
        default="balanced", description="Hồ sơ ưu tiên: balanced, eco_priority, budget_constrained"
    )
    user_preferred_mode: str | None = Field(default=None, description="Phương tiện ưa thích nếu có")


class RecommendTransportModeOutput(BaseModel):
    distance_km: float
    is_intercity: bool
    recommended_mode: str
    recommended_label: str
    recommendation_summary: str
    options: list[dict[str, Any]] = Field(default_factory=list)
    eco_tip: str



# --- Tool 7: get_carbon_estimate ---
class GetCarbonEstimateInput(BaseModel):
    distance_km: float = Field(ge=0.0, description="Travel distance in kilometers")
    transport_mode: Literal["motorbike", "car", "electric_bus", "bicycle", "walking"] = Field(
        default="car", description="Mode of transit"
    )


class GetCarbonEstimateOutput(BaseModel):
    distance_km: float
    transport_mode: str
    co2_kg: float
    green_alternative_mode: str
    potential_savings_co2_kg: float
    eco_tip: str


# --- Tool 8: rag_travel_knowledge ---
class RAGTravelKnowledgeInput(BaseModel):
    query: str = Field(description="Information query about sights, history, culinary dishes or green practices")
    city: Literal["Danang", "Hue", "all"] | None = Field(default=None, description="Optional city filter")
    top_k: int = Field(default=3, ge=1, le=10, description="Max curated knowledge chunks to return")


class RAGKnowledgeItem(BaseModel):
    title: str
    city: str
    category: str
    snippet: str
    source: str
    relevance_score: float


class RAGTravelKnowledgeOutput(BaseModel):
    query: str
    total_found: int
    knowledge_items: list[RAGKnowledgeItem] = Field(default_factory=list)


# --- Tool 9: generate_itinerary ---
class ItineraryStopItem(BaseModel):
    order: int
    poi_id: str
    name: str
    category: str
    city: str
    time_slot: str
    duration_mins: int
    estimated_cost: float = 0.0
    cost_vnd: float = 0.0
    cost_status: Literal["source_verified", "estimated", "missing_data"] = "estimated"
    green_score: float = 80.0
    selection_reason: str = ""
    kg_explanation: str | None = None
    kg_source: Literal["live_neo4j", "relational_projection", "description_fallback"] = "relational_projection"
    lat: float | None = None
    lng: float | None = None
    is_local_business: bool = False
    opening_hours: str = "07:30 - 17:30"
    schedule_status: Literal["verified", "unverified_hours", "outside_hours"] = "verified"
    arrival_time: str | None = None
    departure_time: str | None = None
    travel_time_from_prev_mins: int = 0
    travel_distance_from_prev_km: float = 0.0


class ItineraryDayItem(BaseModel):
    day: int
    day_number: int = 1
    theme: str
    focus_city: str
    stops: list[ItineraryStopItem] = Field(default_factory=list)
    day_distance_km: float = 0.0
    day_cost_vnd: float = 0.0
    day_carbon_kg: float = 0.0
    routing_type: str = "haversine_detour_fallback"


class GenerateItineraryInput(BaseModel):
    destination: str = Field(description="Target destination: 'Đà Nẵng', 'Huế', or 'Đà Nẵng & Huế'")
    duration_days: int = Field(default=2, ge=1, le=14, description="Number of trip days")
    travelers: int = Field(default=2, ge=1, le=30, description="Number of travelers")
    budget: float | None = Field(default=None, description="Total budget in VND (optional)")
    interests: list[str] = Field(default_factory=list, description="Traveler interests: nature, culture, food, eco")
    transport_mode: Literal["motorcycle", "driving", "transit", "walking"] = Field(
        default="motorcycle", description="Primary transport mode"
    )
    sustainability_preferences: list[str] = Field(
        default_factory=lambda: ["green_certified", "local_authentic"],
        description="Preferences for sustainability and eco-certifications"
    )
    current_itinerary_state: list[dict[str, Any]] | None = Field(
        default=None, description="Optional existing itinerary state to build upon"
    )


class GenerateItineraryOutput(BaseModel):
    title: str
    destination: str
    duration_days: int
    travelers: int
    total_cost_vnd: float
    total_distance_km: float
    total_carbon_kg: float
    transport_mode: str
    routing_type: str = "haversine_detour_fallback"
    optimization_method: str = "Multi-Objective Heuristic (Nearest-Neighbor + 2-Opt with Constraint Enforcement)"
    days: list[ItineraryDayItem] = Field(default_factory=list)
    selection_highlights: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    data_limitations: list[str] = Field(default_factory=list)


# --- Tool 10: update_itinerary ---
class UpdateItineraryInput(BaseModel):
    current_itinerary: list[dict[str, Any]] = Field(description="Active itinerary days with stops")
    instruction: str = Field(description="User edit instruction: e.g. fewer stops on day 2, remove POI, add eatery, reduce budget")
    target_day: int | None = Field(default=None, description="Target day number if mentioned")
    remove_poi_name: str | None = Field(default=None, description="Name or keyword of POI to remove")
    add_poi_preference: str | None = Field(default=None, description="Category or preference of POI to add")
    new_budget: float | None = Field(default=None, description="New total budget cap in VND")
    new_transport_mode: Literal["motorcycle", "driving", "transit", "walking"] | None = Field(
        default=None, description="Updated transit mode"
    )
    target_segment_index: int | None = Field(
        default=None, description="Optional specific segment index to update transport mode"
    )
    segment_transport_mode: str | None = Field(
        default=None, description="New transport mode for the specific segment"
    )


class UpdateItineraryOutput(BaseModel):
    updated_itinerary: list[dict[str, Any]] = Field(default_factory=list)
    mutation_summary: list[str] = Field(default_factory=list)
    cost_delta_vnd: float = 0.0
    carbon_delta_kg: float = 0.0
    warnings: list[str] = Field(default_factory=list)

