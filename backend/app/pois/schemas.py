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