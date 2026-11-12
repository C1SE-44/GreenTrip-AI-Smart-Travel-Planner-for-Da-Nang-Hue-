from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.pois.explanation_service import (
    ExplanationServiceUnavailable,
    get_poi_explanation_facts,
)
from app.pois.schemas import PaginatedPOIResponse, POIExplanationFactsResponse
from app.pois.service import POIServiceUnavailable, get_poi_page
from app.pois.weights import ParsedSliderWeights, parse_slider_weights


router = APIRouter(prefix="/pois", tags=["POIs"])


@router.get("/weights", response_model=ParsedSliderWeights)
def get_parsed_weights(
    weights: ParsedSliderWeights = Depends(parse_slider_weights),
) -> ParsedSliderWeights:
    """Expose PB08's existing slider parsing for PB09 request assembly."""
    return weights


@router.get("", response_model=PaginatedPOIResponse)
def get_pois(
    page: int = Query(default=1, ge=1, description="1-based page number"),
    limit: int = Query(default=10, ge=1, le=100, description="Items per page (maximum 100)"),
    category: str | None = Query(default=None, description="Filter by category name"),
    city: str | None = Query(default=None, description="Filter by city name"),
    sub_category: str | None = Query(default=None, description="Filter by sub_category (e.g. western_international, traditional_noodles)"),
    cuisine: str | None = Query(default=None, description="Filter by cuisine (e.g. italian_pizza, japanese_sushi)"),
    budget_tier: str | None = Query(default=None, description="Filter by budget tier ($, $$, $$$, free)"),
    weights: ParsedSliderWeights = Depends(parse_slider_weights),
) -> PaginatedPOIResponse:
    try:
        return get_poi_page(
            page=page,
            limit=limit,
            category=category,
            city=city,
            sub_category=sub_category,
            cuisine=cuisine,
            budget_tier=budget_tier,
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
def get_explanation_facts(poi_id: str) -> POIExplanationFactsResponse:
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
