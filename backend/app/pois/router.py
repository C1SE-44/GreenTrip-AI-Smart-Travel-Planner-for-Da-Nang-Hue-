from fastapi import APIRouter, HTTPException, Query, status

from app.pois.schemas import PaginatedPOIResponse
from app.pois.service import POIServiceUnavailable, get_poi_page


router = APIRouter(prefix="/pois", tags=["POIs"])


@router.get("", response_model=PaginatedPOIResponse)
def get_pois(
    page: int = Query(default=1, ge=1, description="1-based page number"),
    limit: int = Query(default=10, ge=1, le=100, description="Items per page (maximum 100)"),
    category: str | None = Query(default=None, description="Filter by category name"),
    city: str | None = Query(default=None, description="Filter by city name"),
) -> PaginatedPOIResponse:
    try:
        return get_poi_page(page=page, limit=limit, category=category, city=city)
    except POIServiceUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch POIs.",
        ) from exc