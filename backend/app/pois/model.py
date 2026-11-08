from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class POI:
    id: str | int
    name: str
    category: str | None
    description: str | None
    latitude: float | None
    longitude: float | None
    address: str | None
    city: str | None
    estimated_cost: float | None = None
    average_visit_minutes: int | None = None
    satisfaction_score: float | None = None
    green_score: float | None = None
    is_local_business: bool | None = None
    local_business_type: str | None = None
    image_url: str | None = None
    gallery_urls: list[str] | None = None
    sub_category: str | None = None
    cuisine: str | None = None
    budget_tier: str | None = None
    vibes: list[str] | None = None
    best_time: list[str] | None = None
    eco_features: list[str] | None = None
    ai_metadata: dict[str, Any] | None = None
    phone_number: str | None = None
    website_url: str | None = None
    social_links: dict[str, Any] | None = None
    opening_hours: dict[str, Any] | None = None
    email: str | None = None