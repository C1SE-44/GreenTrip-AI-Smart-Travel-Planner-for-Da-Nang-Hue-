from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.pois.explanation_service import (
    ExplanationServiceUnavailable,
    get_poi_explanation_facts,
)
from app.pois.schemas import PaginatedPOIResponse, POIExplanationFactsResponse
from app.pois.service import POIServiceUnavailable, get_poi_page
from app.pois.weights import ParsedSliderWeights, parse_slider_weights


router = APIRouter(prefix="/pois", tags=["POIs"])


@router.get("", response_model=PaginatedPOIResponse)
def get_pois(
    page: int = Query(default=1, ge=1, description="1-based page number"),
    limit: int = Query(default=10, ge=1, le=100, description="Items per page (maximum 100)"),
    category: str | None = Query(default=None, description="Filter by category name"),
    city: str | None = Query(default=None, description="Filter by city name"),
    weights: ParsedSliderWeights = Depends(parse_slider_weights),
) -> PaginatedPOIResponse:
    try:
        return get_poi_page(
            page=page,
            limit=limit,
            category=category,
            city=city,
            weights=weights,
        )
    except POIServiceUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch POIs.",
        ) from exc


@router.get(
    "/{poi_id}/explanation-facts",
    response_model=POIExplanationFactsResponse,
    summary="Return POI explanation facts",
    description="Return Knowledge Graph facts supporting a Why-this-place explanation.",
)
def get_explanation_facts(poi_id: UUID) -> POIExplanationFactsResponse:
    try:
        response = get_poi_explanation_facts(poi_id)
    except ExplanationServiceUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Knowledge Graph service is unavailable",
        ) from exc

    if response is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="POI not found",
        )

    return response
