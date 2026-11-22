from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.cache import poi_cache
from app.config import get_settings
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
    response: Response,
    page: int = Query(default=1, ge=1, description="1-based page number"),
    limit: int = Query(default=10, ge=1, le=100, description="Items per page (maximum 100)"),
    category: str | None = Query(default=None, description="Filter by category name"),
    city: str | None = Query(default=None, description="Filter by city name"),
    sub_category: str | None = Query(default=None, description="Filter by sub_category (e.g. western_international, traditional_noodles)"),
    cuisine: str | None = Query(default=None, description="Filter by cuisine (e.g. italian_pizza, japanese_sushi)"),
    budget_tier: str | None = Query(default=None, description="Filter by budget tier ($, $$, $$$, free)"),
    weights: ParsedSliderWeights = Depends(parse_slider_weights),
) -> PaginatedPOIResponse:
    cache_key = poi_cache.build_pois_cache_key(
        "list",
        {
            "page": page,
            "limit": limit,
            "category": category,
            "city": city,
            "sub_category": sub_category,
            "cuisine": cuisine,
            "budget_tier": budget_tier,
            "weights": weights.model_dump(mode="json"),
        },
    )
    cached_payload = poi_cache.get_json(cache_key)
    if cached_payload is not None:
        try:
            cached_model = PaginatedPOIResponse.model_validate(cached_payload)
            response.headers["X-Cache"] = "HIT"
            response.headers["Cache-Control"] = "public, max-age=60"
            return cached_model
        except Exception:
            pass

    try:
        result = get_poi_page(
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

    poi_cache.set_json(
        cache_key,
        result.model_dump(mode="json"),
        ttl_seconds=get_settings().POI_CACHE_TTL_SECONDS,
    )
    response.headers["X-Cache"] = "MISS"
    response.headers["Cache-Control"] = "public, max-age=60"
    return result


@router.get(
    "/{poi_id}/explanation-facts",
    response_model=POIExplanationFactsResponse,
    summary="Return POI explanation facts",
    description="Return Knowledge Graph facts supporting a Why-this-place explanation.",
)
def get_explanation_facts(poi_id: str, response: Response) -> POIExplanationFactsResponse:
    cache_key = poi_cache.build_pois_cache_key("explain", {"poi_id": poi_id})
    cached_payload = poi_cache.get_json(cache_key)
    if cached_payload is not None:
        try:
            cached_model = POIExplanationFactsResponse.model_validate(cached_payload)
            response.headers["X-Cache"] = "HIT"
            response.headers["Cache-Control"] = "public, max-age=120"
            return cached_model
        except Exception:
            pass

    try:
        result = get_poi_explanation_facts(poi_id)
    except ExplanationServiceUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Knowledge Graph service is unavailable",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="POI not found",
        )

    poi_cache.set_json(
        cache_key,
        result.model_dump(mode="json"),
        ttl_seconds=get_settings().POI_CACHE_TTL_SECONDS,
    )
    response.headers["X-Cache"] = "MISS"
    response.headers["Cache-Control"] = "public, max-age=120"
    return result
