from math import ceil

from app.pois.repository import list_pois
from app.pois.schemas import PaginatedPOIResponse, PaginationMetadata
from app.pois.weights import (
    ParsedSliderWeights,
    compute_poi_weighted_score,
    matches_slider_filters,
)


class POIServiceUnavailable(Exception):
    """Raised when POI data cannot be retrieved."""


def get_poi_page(
    page: int,
    limit: int,
    category: str | None = None,
    city: str | None = None,
    sub_category: str | None = None,
    cuisine: str | None = None,
    budget_tier: str | None = None,
    weights: ParsedSliderWeights | None = None,
) -> PaginatedPOIResponse:
    offset = (page - 1) * limit
    try:
        items, total = list_pois(
            limit=limit,
            offset=offset,
            category=category,
            city=city,
            sub_category=sub_category,
            cuisine=cuisine,
            budget_tier=budget_tier,
            weights=weights,
        )
    except Exception as exc:
        raise POIServiceUnavailable from exc

    if weights is not None:
        if weights.is_filtering_active:
            items = [poi for poi in items if matches_slider_filters(poi, weights)]
            if page == 1 and len(items) < limit and total > len(items):
                total = len(items)

        if weights.is_ranking_active:
            items = sorted(
                items,
                key=lambda poi: (-compute_poi_weighted_score(poi, weights), poi.name),
            )

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
