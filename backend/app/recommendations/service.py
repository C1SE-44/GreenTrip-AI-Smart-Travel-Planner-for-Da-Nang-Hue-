"""PB09 orchestration for PB07/PB08-aware POI recommendations."""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any

from psycopg import Connection

from app.recommendations.poi_feature_extractor import POIFeatureExtractor
from app.recommendations.recommender_engine import ContentBasedRecommender
from app.recommendations.repository import list_recommendation_pois
from app.recommendations.schemas import RecommendationRequest, RecommendationResponse
from app.trips.schemas import ValidatedTripData


logger = logging.getLogger(__name__)

COST_FALLBACK_BY_TIER: dict[str, Decimal] = {
    "free": Decimal(0),
    "$": Decimal(50_000),
    "$$": Decimal(120_000),
    "$$$": Decimal(250_000),
    "$$$$": Decimal(250_000),
    "unknown": Decimal(80_000),
}

# Visit-only planning capacity after allowing time for transport, meals, and
# breaks. These are heuristics; PB09 does not create a day-by-day itinerary.
DAILY_VISIT_MINUTES_BY_PACING: dict[str, int] = {
    "relaxed": 210,
    "balanced": 270,
    # PB07 currently calls its intensive pacing option "Fast".
    "fast": 330,
    "intensive": 330,
}
DEFAULT_DAILY_VISIT_MINUTES = 270
DEFAULT_POI_VISIT_MINUTES = Decimal(90)


def _decimal_value(value: Any) -> Decimal | None:
    """Convert psycopg/Pydantic numeric values without float summation drift."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return number if number.is_finite() else None


def _legacy_band_allows(poi: dict[str, Any], budget_band: int) -> bool:
    """Retain the original per-POI bands for older frontend requests."""
    cost = _decimal_value(
        poi.get("effective_estimated_cost", poi.get("estimated_cost"))
    )
    if cost is None or cost < 0:
        return False
    if budget_band == 1:
        return cost <= Decimal(100_000)
    if budget_band == 2:
        return cost <= Decimal(500_000)
    return cost > Decimal(500_000)


def _with_effective_cost(poi: dict[str, Any]) -> dict[str, Any] | None:
    """Return a copy with an effective per-person VND cost, or reject it.

    A NULL database price uses the explicit budget-tier estimate. Explicit
    malformed, negative, NaN, and infinite values are rejected rather than
    silently replaced with a tier estimate.
    """
    raw_cost = poi.get("estimated_cost")
    if raw_cost is None:
        tier = str(poi.get("budget_tier") or "unknown").strip().casefold()
        cost = COST_FALLBACK_BY_TIER.get(tier, COST_FALLBACK_BY_TIER["unknown"])
    else:
        cost = _decimal_value(raw_cost)
        if cost is None or cost < 0:
            logger.warning(
                "Skipping POI %s because estimated_cost is invalid: %r",
                poi.get("poi_id"),
                raw_cost,
            )
            return None

    normalized = dict(poi)
    normalized["estimated_cost"] = cost
    normalized["effective_estimated_cost"] = cost
    return normalized


def _with_effective_costs(poi_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Resolve all per-person prices once so filters, ranking, and output agree."""
    return [
        normalized
        for poi in poi_list
        if (normalized := _with_effective_cost(poi)) is not None
    ]


def _trip_activity_budget(request: RecommendationRequest) -> Decimal:
    """Return PB07's food plus activity/ticket allocation as an exact amount."""
    trip_data = request.trip_data
    if trip_data is None:
        raise ValueError("PB07 trip_data is required to enforce the global budget")

    food_budget = _decimal_value(trip_data.cost_breakdown.food_and_beverage)
    activity_budget = _decimal_value(trip_data.cost_breakdown.activities_and_tickets)
    if food_budget is None or activity_budget is None:
        raise ValueError("PB07 food and activity budgets must be finite numbers")
    if food_budget < 0 or activity_budget < 0:
        raise ValueError("PB07 food and activity budgets cannot be negative")
    return food_budget + activity_budget


def _trip_num_people(request: RecommendationRequest) -> Decimal:
    """Return PB07 group size; the validated PB07 model requires this value."""
    trip_data = request.trip_data
    if trip_data is None:
        return Decimal(1)

    num_people = _decimal_value(trip_data.num_people)
    if num_people is None or num_people <= 0 or num_people != num_people.to_integral_value():
        raise ValueError("PB07 num_people must be a positive integer")
    return num_people


def _daily_visit_capacity(trip_data: ValidatedTripData) -> int:
    """Resolve PB07 pacing to the configured visit-only daily capacity.

    Unknown values use the Balanced capacity to remain predictable when PB07
    introduces a new display value.
    """
    pacing_level = str(getattr(trip_data, "pacing_level", "")).strip().casefold()
    return DAILY_VISIT_MINUTES_BY_PACING.get(
        pacing_level, DEFAULT_DAILY_VISIT_MINUTES
    )


def _effective_visit_minutes(poi: dict[str, Any]) -> Decimal:
    """Read a valid POI duration or use the configured 90-minute fallback."""
    duration = _decimal_value(poi.get("average_visit_minutes"))
    if duration is None or duration <= 0:
        return DEFAULT_POI_VISIT_MINUTES
    return duration


def _resolved_green_score(poi: dict[str, Any]) -> float:
    """Return the normalized green score used by the engine."""
    raw = poi.get("resolved_green_score", poi.get("green_score"))
    if raw is None:
        return 0.8 if poi.get("is_local_business") is True else 0.5
    score = _decimal_value(raw)
    if score is None:
        return 0.8 if poi.get("is_local_business") is True else 0.5
    return min(1.0, max(0.0, float(score)))


def _explanation(poi: dict[str, Any], interests: list[str]) -> str:
    """Create a concise explanation from a matching category or description."""
    category = str(poi.get("category_name") or poi.get("category") or "địa điểm này")
    matching_interest = next(
        (interest for interest in interests if interest.casefold() in category.casefold()),
        None,
    )
    if matching_interest:
        return f"Phù hợp với sở thích {matching_interest} và thuộc nhóm {category}."

    description = poi.get("description")
    if isinstance(description, str) and description.strip():
        snippet = " ".join(description.split())
        if len(snippet) > 145:
            snippet = snippet[:142].rstrip() + "..."
        return f"Được gợi ý theo sở thích của bạn. {snippet}"
    return f"Được gợi ý theo sở thích của bạn; thuộc nhóm {category}."


def _select_with_trip_budget(
    ranked: list[dict[str, Any]],
    request: RecommendationRequest,
) -> list[dict[str, Any]]:
    """Select ranked POIs within PB07 group-budget and per-day time limits.

    POIs are assigned internally to the first day with sufficient remaining
    capacity. This deterministic first-fit allocation enforces both the total
    visit-time budget and each day's limit without generating an itinerary.
    The available budget remains PB07 food plus activities; meal POIs are not
    classified reliably enough here to apply further meal-budget deductions.
    """
    trip_data = request.trip_data
    if trip_data is None:
        return []

    target_count = request.top_k
    remaining_budget = _trip_activity_budget(request)
    num_people = _trip_num_people(request)
    daily_capacity = Decimal(_daily_visit_capacity(trip_data))
    total_remaining_minutes = daily_capacity * trip_data.days
    daily_remaining = [daily_capacity for _ in range(trip_data.days)]
    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()

    for poi in ranked:
        if len(selected) >= target_count:
            break

        poi_id = str(poi.get("poi_id") or "").strip()
        if not poi_id or poi_id in selected_ids:
            continue

        per_person_cost = _decimal_value(
            poi.get("effective_estimated_cost", poi.get("estimated_cost"))
        )
        # The engine normally filters this already; repeat the guard at the
        # budget boundary so malformed repository data cannot bypass it.
        if per_person_cost is None or per_person_cost < 0:
            continue
        group_cost = per_person_cost * num_people
        if group_cost > remaining_budget:
            continue

        visit_minutes = _effective_visit_minutes(poi)
        if visit_minutes > total_remaining_minutes:
            continue
        # First-fit by trip day is deterministic and ensures an individual
        # visit never exceeds one day's allowance, even if total time remains.
        assigned_day = next(
            (day for day, remaining in enumerate(daily_remaining)
             if visit_minutes <= remaining),
            None,
        )
        if assigned_day is None:
            continue

        selected.append(poi)
        selected_ids.add(poi_id)
        remaining_budget -= group_cost
        total_remaining_minutes -= visit_minutes
        daily_remaining[assigned_day] -= visit_minutes

    if not selected and ranked:
        logger.info(
            "No POIs fit PB07 group budget/time limits (budget=%s VND, people=%s, days=%d).",
            _trip_activity_budget(request),
            _trip_num_people(request),
            trip_data.days,
        )
    return selected


def _rank_and_format(
    poi_list: list[dict[str, Any]], request: RecommendationRequest
) -> RecommendationResponse:
    """Apply PB07/PB08 context, rank candidates, then enforce the global budget."""
    if not poi_list:
        return RecommendationResponse(total=0, data=[])

    trip_data = request.trip_data
    interests = list(dict.fromkeys(
        [*(trip_data.preferences if trip_data else []), *request.interests]
    ))
    candidates = poi_list
    if not candidates:
        return RecommendationResponse(total=0, data=[])

    slider = request.slider_weights
    green_weight = (
        slider.normalized_green_weight if slider is not None else request.green_priority
    )
    min_eco_score = slider.min_eco_score if slider is not None else 0
    max_budget = slider.max_budget if slider is not None else None

    extractor = POIFeatureExtractor()
    feature_matrix, _, vectorizer, _ = extractor.fit_transform(candidates)
    recommender = ContentBasedRecommender(candidates, feature_matrix, vectorizer)
    ranked = recommender.rank_pois(
        interests,
        normalized_green_weight=green_weight,
        top_k=None,
        min_eco_score=min_eco_score,
        max_budget=max_budget,
    )

    if trip_data is not None:
        selected = _select_with_trip_budget(ranked, request)
    else:
        # Compatibility path for the current UI until it submits PB07 data.
        eligible = ranked if slider is not None else [
            poi for poi in ranked
            if _legacy_band_allows(poi, request.budget_band)
        ]
        selected = eligible[: request.top_k]

    data = [
        {
            "poi_id": str(poi.get("poi_id", "")),
            "name": str(poi.get("name") or ""),
            "category_name": poi.get("category_name") or poi.get("category"),
            "match_score": poi["match_score"],
            "estimated_cost": float(poi["effective_estimated_cost"]),
            "satisfaction_score": poi.get("satisfaction_score"),
            "is_local_business": poi.get("is_local_business") is True,
            "green_score": _resolved_green_score(poi),
            "lat": poi.get("lat"),
            "lng": poi.get("lng"),
            "explanation_snippet": _explanation(poi, interests),
        }
        for poi in selected
    ]
    return RecommendationResponse(total=len(data), data=data)


def get_poi_recommendations(
    request: RecommendationRequest,
    connection: Connection | None,
) -> RecommendationResponse:
    """Read destination-scoped live POIs and rank them without mock fallback."""
    destination = request.trip_data.destination if request.trip_data is not None else None
    poi_list = list_recommendation_pois(connection, destination=destination)
    logger.info("Retrieved %d active POIs for PB09.", len(poi_list))
    return _rank_and_format(_with_effective_costs(poi_list), request)
