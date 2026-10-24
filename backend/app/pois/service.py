from math import ceil

from app.pois.repository import list_pois
from app.pois.schemas import PaginatedPOIResponse, PaginationMetadata
from app.pois.weights import ParsedSliderWeights


class POIServiceUnavailable(Exception):
    """Raised when POI data cannot be retrieved."""


def get_poi_page(
    page: int,
    limit: int,
    category: str | None = None,
    city: str | None = None,
    weights: ParsedSliderWeights | None = None,
) -> PaginatedPOIResponse:
    offset = (page - 1) * limit
    try:
        items, total = list_pois(
            limit=limit,
            offset=offset,
            category=category,
            city=city,
        )
    except Exception as exc:
        raise POIServiceUnavailable from exc

    total_pages = ceil(total / limit) if total else 0
    return PaginatedPOIResponse(
        items=items,
        pagination=PaginationMetadata(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1,
        ),
    )