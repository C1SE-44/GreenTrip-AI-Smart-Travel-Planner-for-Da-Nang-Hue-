from dataclasses import dataclass


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