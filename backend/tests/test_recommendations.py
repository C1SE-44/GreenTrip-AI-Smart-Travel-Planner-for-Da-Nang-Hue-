from __future__ import annotations

from decimal import Decimal
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.pois.weights import ParsedSliderWeights
from app.recommendations import repository, service
from app.recommendations.poi_feature_extractor import POIFeatureExtractor
from app.recommendations.recommender_engine import ContentBasedRecommender
from app.recommendations.repository import (
    DestinationResolutionError,
    RecommendationRepositoryError,
)
from app.recommendations.schemas import RecommendationRequest
from app.trips.schemas import (
    BudgetTier,
    CostBreakdown,
    DestinationType,
    ValidatedTripData,
)


def make_request(
    *,
    destination: str = DestinationType.DA_NANG.value,
    days: int = 1,
    num_people: int = 1,
    food_budget: float = 1_000_000,
    activity_budget: float = 0,
    top_k: int = 50,
    min_eco_score: int = 0,
    max_budget: float | None = None,
    pacing_level: str = "Relaxed",
) -> RecommendationRequest:
    trip_data = ValidatedTripData(
        destination=destination,
        days=days,
        num_people=num_people,
        total_budget=food_budget + activity_budget,
        daily_budget_per_person=500_000,
        budget_tier=BudgetTier.BUDGET,
        pacing_level=pacing_level,
        pacing_label="Relaxed",
        pacing_desc="Relaxed trip",
        is_budget_sufficient=True,
        min_recommended_budget=0,
        preferences=["culture"],
        cost_breakdown=CostBreakdown(
            accommodation=0,
            food_and_beverage=food_budget,
            transportation=0,
            activities_and_tickets=activity_budget,
        ),
        recommendations=[],
    )
    slider_weights = ParsedSliderWeights(
        green_weight_raw=50,
        budget_weight_raw=50,
        normalized_green_weight=0.5,
        normalized_budget_weight=0.5,
        min_eco_score=min_eco_score,
        max_budget=max_budget,
    )
    return RecommendationRequest(
        interests=["culture"],
        top_k=top_k,
        trip_data=trip_data,
        slider_weights=slider_weights,
    )


def make_poi(
    poi_id: str,
    *,
    city: str = "Đà Nẵng",
    cost: object = 100,
    budget_tier: str = "$$",
    green: float = 0.8,
    satisfaction: float = 4.5,
    popularity: float = 10,
    category: str = "Lịch sử",
) -> dict:
    return {
        "poi_id": poi_id,
        "name": poi_id,
        "description": "A historic cultural place",
        "category_name": category,
        "sub_category": "heritage",
        "vibes": ["culture"],
        "ai_metadata": {"dna_tags": ["heritage", "culture"]},
        "city": city,
        "local_business_type": None,
        "estimated_cost": cost,
        "budget_tier": budget_tier,
        "average_visit_minutes": 90,
        "satisfaction_score": satisfaction,
        "popularity_score": popularity,
        "is_local_business": False,
        "green_score": green,
        "is_active": True,
        "lat": 16.05,
        "lng": 108.2,
    }


class FakeCursor:
    def __init__(self, connection: "FakeConnection") -> None:
        self.connection = connection
        self.description = None
        self._rows = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, query: str, params: tuple | None = None) -> None:
        self.connection.executed.append((query, params))
        if "FROM public.cities" in query:
            requested_codes = set(params[0]) if params else set()
            self._rows = [
                (city_id, code)
                for city_id, code in self.connection.city_rows
                if code in requested_codes
            ]
        else:
            self.description = [SimpleNamespace(name="poi_id")]
            self._rows = []

    def fetchall(self) -> list[tuple]:
        return self._rows


class FakeConnection:
    def __init__(self, city_rows: list[tuple[str, str]]) -> None:
        self.city_rows = city_rows
        self.executed: list[tuple[str, tuple | None]] = []

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)


POI_COLUMNS = {
    "poi_id", "name", "description", "category_id", "city_id", "geom",
    "local_business_type", "estimated_cost", "satisfaction_score",
    "is_local_business", "green_score", "is_active", "sub_category",
    "budget_tier", "vibes", "ai_metadata", "average_visit_minutes",
    "popularity_score",
}
CATEGORY_COLUMNS = {"category_id", "name"}
CITY_COLUMNS = {"city_id", "name", "code"}


@pytest.mark.parametrize(
    ("destination", "expected_ids"),
    [
        (DestinationType.DA_NANG.value, [101]),
        (DestinationType.HUE.value, [202]),
        (DestinationType.BOTH.value, [101, 202]),
    ],
)
def test_repository_filters_using_resolved_city_ids(
    destination: str, expected_ids: list[int]
) -> None:
    connection = FakeConnection([(101, "DANANG"), (202, "HUE")])
    columns = {"pois": POI_COLUMNS, "poi_categories": CATEGORY_COLUMNS, "cities": CITY_COLUMNS}
    with patch.object(repository, "_table_columns", side_effect=lambda _c, table: columns[table]):
        repository.list_recommendation_pois(connection, destination=destination)

    select_sql, select_params = connection.executed[-1]
    assert "p.city_id = ANY(%s)" in select_sql
    assert select_params == (expected_ids,)
    assert "JOIN public.cities AS ci ON ci.city_id = p.city_id" in select_sql


def test_unknown_destination_fails_instead_of_returning_cross_city_pois() -> None:
    with pytest.raises(DestinationResolutionError, match="Unsupported destination"):
        repository.resolve_destination_city_ids(FakeConnection([]), "Paris")


def test_destination_with_missing_city_record_fails_explicitly() -> None:
    with pytest.raises(DestinationResolutionError, match="DANANG"):
        repository.resolve_destination_city_ids(FakeConnection([]), DestinationType.DA_NANG.value)


def test_destination_filter_requires_poi_city_id() -> None:
    connection = FakeConnection([(101, "DANANG")])
    columns = {
        "pois": POI_COLUMNS - {"city_id"},
        "poi_categories": CATEGORY_COLUMNS,
        "cities": CITY_COLUMNS,
    }
    with patch.object(repository, "_table_columns", side_effect=lambda _c, table: columns[table]):
        with pytest.raises(RecommendationRepositoryError, match="pois.city_id"):
            repository.list_recommendation_pois(
                connection, destination=DestinationType.DA_NANG.value
            )


@pytest.mark.parametrize(
    ("tier", "expected"),
    [
        ("free", 0),
        ("$", 50_000),
        ("$$", 120_000),
        ("$$$", 250_000),
        ("$$$$", 250_000),
        ("unlisted", 80_000),
    ],
)
def test_null_cost_uses_budget_tier_fallback(tier: str, expected: int) -> None:
    normalized = service._with_effective_cost(make_poi("poi", cost=None, budget_tier=tier))
    assert normalized is not None
    assert normalized["estimated_cost"] == Decimal(expected)
    assert normalized["effective_estimated_cost"] == Decimal(expected)


def test_explicit_zero_cost_is_preserved() -> None:
    normalized = service._with_effective_cost(make_poi("free", cost=0, budget_tier="$$"))
    assert normalized is not None
    assert normalized["estimated_cost"] == Decimal(0)


@pytest.mark.parametrize("invalid_cost", [-1, float("nan"), float("inf"), "invalid"])
def test_invalid_explicit_cost_is_rejected(invalid_cost: object) -> None:
    assert service._with_effective_cost(make_poi("bad", cost=invalid_cost)) is None


@pytest.mark.parametrize("num_people", [1, 2, 4])
def test_group_cost_multiplier_respects_exact_budget_boundary(num_people: int) -> None:
    poi = make_poi("exact", cost=125)
    request = make_request(
        num_people=num_people,
        food_budget=125 * num_people,
    )
    assert service._select_with_trip_budget([poi], request) == [poi]


def test_selected_group_costs_never_exceed_global_poi_budget() -> None:
    pois = [make_poi(f"poi-{i}", cost=40) for i in range(4)]
    request = make_request(num_people=2, food_budget=150)

    selected = service._select_with_trip_budget(pois, request)

    assert sum(Decimal(poi["estimated_cost"]) * 2 for poi in selected) <= Decimal(150)


def test_greedy_skips_over_budget_ranked_poi_and_chooses_cheaper_one() -> None:
    expensive = make_poi("expensive", cost=60)
    affordable = make_poi("affordable", cost=40)
    request = make_request(num_people=2, food_budget=100)

    selected = service._select_with_trip_budget([expensive, affordable], request)

    assert [poi["poi_id"] for poi in selected] == ["affordable"]


def test_balanced_three_day_time_capacity_accepts_six_feasible_pois() -> None:
    pois = [make_poi(f"poi-{i}", cost=10) for i in range(6)]
    for poi in pois[:3]:
        poi["average_visit_minutes"] = 120
    for poi in pois[3:]:
        poi["average_visit_minutes"] = 60
    request = make_request(days=3, pacing_level="Balanced", food_budget=1_000)

    selected = service._select_with_trip_budget(pois, request)

    assert len(selected) == 6
    assert service._daily_visit_capacity(request.trip_data) * request.trip_data.days == 810


def test_poi_over_daily_capacity_is_skipped_for_later_candidate() -> None:
    too_long = make_poi("too-long", cost=1)
    too_long["average_visit_minutes"] = 400
    shorter = make_poi("shorter", cost=1)
    shorter["average_visit_minutes"] = 60
    request = make_request(days=1, pacing_level="Balanced", food_budget=10)

    assert service._select_with_trip_budget([too_long, shorter], request) == [shorter]


@pytest.mark.parametrize("duration", [None, 0, -5, "invalid", float("nan")])
def test_invalid_poi_duration_uses_90_minute_fallback(duration: object) -> None:
    poi = make_poi("fallback-duration", cost=1)
    poi["average_visit_minutes"] = duration
    request = make_request(days=1, pacing_level="Balanced", food_budget=10)

    assert service._effective_visit_minutes(poi) == Decimal(90)
    assert service._select_with_trip_budget([poi], request) == [poi]


def test_selection_respects_top_k_without_days_times_three_cap() -> None:
    pois = [make_poi(f"poi-{i}", cost=1) for i in range(14)]
    for poi in pois:
        poi["average_visit_minutes"] = 60
    request = make_request(
        days=3, pacing_level="Balanced", food_budget=100, top_k=12
    )

    selected = service._select_with_trip_budget(pois, request)

    # Balanced permits four 60-minute visits per day, exceeding the old cap.
    assert len(selected) == 12


def test_top_k_remains_an_upper_bound() -> None:
    pois = [make_poi(f"poi-{i}", cost=1) for i in range(5)]
    request = make_request(days=3, food_budget=100, top_k=2)

    assert len(service._select_with_trip_budget(pois, request)) == 2


def test_pacing_capacities_are_monotonic_and_unknown_defaults_to_balanced() -> None:
    relaxed = make_request(pacing_level="Relaxed").trip_data
    balanced = make_request(pacing_level="Balanced").trip_data
    fast = make_request(pacing_level="Fast").trip_data
    unknown = make_request(pacing_level="new-pacing-value").trip_data

    assert service._daily_visit_capacity(relaxed) == 210
    assert service._daily_visit_capacity(balanced) == 270
    assert service._daily_visit_capacity(fast) == 330
    assert service._daily_visit_capacity(unknown) == 270


def test_selection_skips_duplicate_poi_ids() -> None:
    first = make_poi("duplicate", cost=1)
    duplicate = make_poi("duplicate", cost=1)
    later = make_poi("unique", cost=1)
    request = make_request(food_budget=10, top_k=3)

    selected = service._select_with_trip_budget([first, duplicate, later], request)

    assert [poi["poi_id"] for poi in selected] == ["duplicate", "unique"]


def build_ranker(pois: list[dict]) -> ContentBasedRecommender:
    matrix, _, vectorizer, _ = POIFeatureExtractor().fit_transform(pois)
    return ContentBasedRecommender(pois, matrix, vectorizer)


def test_green_minimum_and_per_person_max_budget_are_hard_filters() -> None:
    pois = [
        make_poi("green-and-cheap", cost=100, green=0.8),
        make_poi("too-gray", cost=50, green=0.49),
        make_poi("too-expensive", cost=101, green=0.9),
    ]
    ranked = build_ranker(pois).rank_pois(
        ["culture"],
        normalized_green_weight=0.5,
        top_k=None,
        min_eco_score=50,
        max_budget=100,
    )
    assert [poi["poi_id"] for poi in ranked] == ["green-and-cheap"]


def test_ranking_is_deterministic_and_top_k_is_respected() -> None:
    pois = [make_poi("b"), make_poi("a")]
    ranker = build_ranker(pois)
    ranked = ranker.rank_pois(["culture"], 0.5, top_k=None)
    top_one = ranker.rank_pois(["culture"], 0.5, top_k=1)
    assert [poi["poi_id"] for poi in ranked] == ["a", "b"]
    assert [poi["poi_id"] for poi in top_one] == ["a"]


def test_empty_database_results_return_empty_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "list_recommendation_pois", lambda *_args, **_kwargs: [])
    response = service.get_poi_recommendations(make_request(), object())
    assert response.total == 0
    assert response.data == []


def test_database_failure_is_propagated_without_mock_recommendations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(*_args: object, **_kwargs: object) -> list[dict]:
        raise RecommendationRepositoryError("database unavailable")

    monkeypatch.setattr(service, "list_recommendation_pois", fail)
    with pytest.raises(RecommendationRepositoryError, match="database unavailable"):
        service.get_poi_recommendations(make_request(), object())
