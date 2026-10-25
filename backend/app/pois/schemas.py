from pydantic import BaseModel, ConfigDict


class POIResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str | int
    name: str
    category: str | None = None
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    address: str | None = None
    city: str | None = None
    estimated_cost: float | None = None
    average_visit_minutes: int | None = None
    satisfaction_score: float | None = None
    green_score: float | None = None
    is_local_business: bool | None = None
    local_business_type: str | None = None
    image_url: str | None = None
    gallery_urls: list[str] | None = None


class PaginationMetadata(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool
    has_previous: bool


class PaginatedPOIResponse(BaseModel):
    items: list[POIResponse]
    pagination: PaginationMetadata


class ExplanationPOI(BaseModel):
    id: str
    name: str | None = None
    is_local_business: bool | None = None
    local_business_type: str | None = None
    source: str | None = None


class ExplanationFact(BaseModel):
    relationship: str
    target_type: str
    target_key: str
    target_name: str | None = None


class POIExplanationFactsResponse(BaseModel):
    poi: ExplanationPOI
    facts: list[ExplanationFact]
