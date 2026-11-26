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
from app.recommendations import repository, router, service
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
        daily_budget_per_person=max(
            1.0, (food_budget + activity_budget) / (num_people * days)
        ),
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
    "best_time", "opening_hours",
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
    assert "AS best_time" in select_sql
    assert "AS opening_hours" in select_sql


def test_recommendation_response_preserves_scheduling_metadata() -> None:
    poi = make_poi("schedule-ready")
    poi.update({
        "best_time": ["morning", "afternoon"],
        "opening_hours": {"monday": "09:00-17:00"},
        "average_visit_minutes": 75,
    })

    response = service._recommend_by_ideas_and_taxonomy(
        [poi],
        RecommendationRequest(interests=["culture"], top_k=1),
    )

    assert response.data[0].best_time == ["morning", "afternoon"]
    assert response.data[0].opening_hours == {"monday": "09:00-17:00"}
    assert response.data[0].average_visit_minutes == 75
    assert response.data[0].sub_category == "heritage"


def test_first_screen_recommendations_rank_by_submitted_interests() -> None:
    culture_poi = make_poi("heritage-museum", category="Culture & Heritage")
    culture_poi["description"] = "Historic heritage museum with cultural exhibits"
    culture_poi["sub_category"] = "heritage"
    food_poi = make_poi("local-noodles", category="Local Food")
    food_poi["description"] = "Local cuisine serving traditional food and noodles"
    food_poi["sub_category"] = "traditional_noodles"
    food_poi["vibes"] = ["food"]
    food_poi["ai_metadata"] = {"dna_tags": ["cuisine", "local_food"]}

    culture_results = service._recommend_by_ideas_and_taxonomy(
        [culture_poi, food_poi], RecommendationRequest(interests=["culture"], top_k=2)
    )
    food_results = service._recommend_by_ideas_and_taxonomy(
        [culture_poi, food_poi], RecommendationRequest(interests=["food"], top_k=2)
    )
    free_text_results = service._recommend_by_ideas_and_taxonomy(
        [culture_poi, food_poi], RecommendationRequest(interests=["local cuisine noodles"], top_k=2)
    )

    assert culture_results.data[0].poi_id == "heritage-museum"
    assert [poi.poi_id for poi in culture_results.data] == ["heritage-museum"]
    assert food_results.data[0].poi_id == "local-noodles"
    assert [poi.poi_id for poi in food_results.data] == ["local-noodles"]
    assert free_text_results.data[0].poi_id == "local-noodles"


def test_pb09_response_exposes_actual_personalized_score_components() -> None:
    poi = make_poi("nature-site", category="Nature Landscape")
    poi["description"] = "Coastal forest nature trail and scenic landscape"
    food_poi = make_poi("local-food", category="Local Food")
    food_poi["sub_category"] = "traditional_noodles"
    food_poi["description"] = "Local cuisine serving traditional food and noodles"

    nature_result = service._recommend_by_ideas_and_taxonomy(
        [poi, food_poi], RecommendationRequest(interests=["nature"], top_k=1)
    ).data[0]
    food_result = service._recommend_by_ideas_and_taxonomy(
        [poi, food_poi], RecommendationRequest(interests=["food"], top_k=1)
    ).data[0]

    assert nature_result.score_breakdown is not None
    assert nature_result.score_breakdown.algorithm == "preference_first_hybrid"
    assert nature_result.score_breakdown.matched_interests == ["nature"]
    assert food_result.score_breakdown is not None
    assert food_result.score_breakdown.matched_interests == ["food"]
    nature_factor = next(
        factor for factor in nature_result.score_breakdown.factors
        if factor.key == "preference_similarity"
    )
    assert nature_factor.normalized_value is not None
    assert round(sum(factor.contribution_points for factor in nature_result.score_breakdown.factors), 1) == nature_result.match_score


def test_beach_interest_uses_taxonomy_and_excludes_unrelated_high_quality_pois() -> None:
    beach = make_poi("beach", green=0.25, satisfaction=4.0, popularity=5)
    beach.update({
        "name": "My Khe Beach",
        "category_name": "Cảnh quan và thiên nhiên",
        "sub_category": "beach_coastline",
        "description": "Swimming and snorkeling at the sandy coast",
        "vibes": ["outdoor", "coastal"],
        "ai_metadata": {"dna_tags": ["sea_view", "beach"]},
    })
    heritage = make_poi(
        "heritage", green=1.0, satisfaction=5.0, popularity=100_000,
        category="Lịch sử và di sản",
    )
    heritage.update({
        "name": "Imperial Citadel",
        "sub_category": "heritage",
        "description": "Historic imperial palace and cultural heritage",
        "vibes": ["history"],
    })

    response = service._recommend_by_ideas_and_taxonomy(
        [heritage, beach], RecommendationRequest(interests=["beach"], top_k=10)
    )

    assert [poi.poi_id for poi in response.data] == ["beach"]
    preference = next(
        factor for factor in response.data[0].score_breakdown.factors
        if factor.key == "preference_similarity"
    )
    assert preference.normalized_value == 1.0
    assert preference.contribution_points >= 90.0


def test_beach_taxonomy_match_beats_secondary_signals_and_loose_tag_match() -> None:
    direct_beach = make_poi(
        "direct-beach", green=0.1, satisfaction=3.0, popularity=0,
        category="Cảnh quan và thiên nhiên",
    )
    direct_beach.update({
        "name": "Sandy shoreline",
        "sub_category": "beach_coastline",
        "description": "Sandy shore with swimming access.",
        "vibes": [],
        "ai_metadata": {},
    })
    tagged_resort = make_poi(
        "tagged-resort", green=1.0, satisfaction=5.0, popularity=100_000,
        category="Lưu trú và nghỉ dưỡng",
    )
    tagged_resort.update({
        "name": "Quiet stay",
        "sub_category": "resort",
        "description": "A quiet accommodation.",
        "vibes": ["beach"],
        "ai_metadata": {},
    })

    ranked = build_ranker([tagged_resort, direct_beach]).rank_pois(
        ["beach"], 0.7, top_k=None, budget_target_per_person=100
    )

    assert [poi["poi_id"] for poi in ranked] == ["direct-beach", "tagged-resort"]
    assert ranked[0]["score_breakdown"]["factors"][0]["contribution_points"] == 90.0


def test_vietnamese_interest_labels_normalize_to_taxonomy_and_text() -> None:
    beach = make_poi("beach", category="Cảnh quan và thiên nhiên")
    beach.update({
        "name": "Bãi biển Mỹ Khê",
        "sub_category": "beach_coastline",
        "description": "A sandy beach with swimming and coastal scenery.",
        "vibes": ["outdoor"],
        "ai_metadata": {"dna_tags": ["coastal"]},
    })
    heritage = make_poi("heritage", category="Lịch sử và di sản")
    heritage.update({"name": "Đại Nội Huế", "sub_category": "imperial_citadel"})

    beach_results = service._recommend_by_ideas_and_taxonomy(
        [beach, heritage], RecommendationRequest(interests=["Biển"], top_k=5)
    )
    culture_results = service._recommend_by_ideas_and_taxonomy(
        [beach, heritage], RecommendationRequest(interests=["Văn hóa – Lịch sử"], top_k=5)
    )

    assert [poi.poi_id for poi in beach_results.data] == ["beach"]
    assert [poi.poi_id for poi in culture_results.data] == ["heritage"]


def test_multiple_interests_keep_all_groups_and_sort_by_final_score() -> None:
    beach_one = make_poi("beach-1", green=0.5)
    beach_one.update({"sub_category": "beach_coastline", "description": "Beach swimming"})
    beach_two = make_poi("beach-2", green=0.5)
    beach_two.update({"sub_category": "beach", "description": "Coastal beach walk"})
    food_one = make_poi("food-1", green=0.5, category="Ẩm thực và quán ăn")
    food_one.update({"sub_category": "traditional_noodles", "description": "Local cuisine"})
    food_two = make_poi("food-2", green=0.5, category="Ẩm thực và quán ăn")
    food_two.update({"sub_category": "seafood", "description": "Fresh seafood restaurant"})

    response = service._recommend_by_ideas_and_taxonomy(
        [beach_one, beach_two, food_one, food_two],
        RecommendationRequest(interests=["beach", "food"], top_k=4),
    )

    matched = [poi.score_breakdown.matched_interests for poi in response.data]
    assert len(response.data) == 4
    assert {interest for group in matched for interest in group} == {"beach", "food"}
    assert [poi.match_score for poi in response.data] == sorted(
        (poi.match_score for poi in response.data), reverse=True
    )


def test_multi_match_pois_remain_unique_and_follow_final_score_order() -> None:
    beach = make_poi("beach", category="Cảnh quan và thiên nhiên")
    beach.update({
        "sub_category": "beach_coastline",
        "description": "A sandy beach for swimming.",
        "vibes": ["outdoor"],
        "ai_metadata": {},
    })
    food = make_poi("food", category="Ẩm thực và quán ăn")
    food.update({
        "sub_category": "traditional_noodles",
        "description": "Local cuisine and traditional noodles.",
        "vibes": ["culinary"],
        "ai_metadata": {},
    })
    coastal_seafood = make_poi("coastal-seafood", category="Ẩm thực và quán ăn")
    coastal_seafood.update({
        "sub_category": "coastal_seafood",
        "description": "Local seafood restaurant.",
        "vibes": ["culinary"],
        "ai_metadata": {},
    })

    response = service._recommend_by_ideas_and_taxonomy(
        [coastal_seafood, food, beach],
        RecommendationRequest(interests=["beach", "food"], top_k=2),
    )

    assert len({poi.poi_id for poi in response.data}) == len(response.data)
    assert [poi.match_score for poi in response.data] == sorted(
        (poi.match_score for poi in response.data), reverse=True
    )


def test_free_text_interest_is_used_and_explained_from_actual_match() -> None:
    poi = make_poi("quiet-beach", category="Cảnh quan và thiên nhiên")
    poi.update({
        "name": "Quiet sunrise beach path",
        "sub_category": "beach_coastline",
        "description": "A quiet path by the beach to watch sunrise.",
    })
    request = RecommendationRequest(interests=["quiet sunrise beach"], top_k=1)

    response = service._recommend_by_ideas_and_taxonomy([poi], request)

    assert response.data[0].score_breakdown.matched_interests == ["quiet sunrise beach"]
    assert "quiet sunrise beach" in response.data[0].explanation_snippet


def test_no_matching_interest_returns_no_personalized_unrelated_pois() -> None:
    heritage = make_poi("heritage", category="Lịch sử và di sản")
    heritage.update({"name": "Imperial Citadel", "sub_category": "heritage"})

    response = service._recommend_by_ideas_and_taxonomy(
        [heritage], RecommendationRequest(interests=["beach"], top_k=10)
    )

    assert response.total == 0
    assert response.data == []


def test_incidental_menu_mentions_do_not_turn_restaurant_into_beach_poi() -> None:
    restaurant = make_poi("restaurant", category="Ẩm thực và quán ăn")
    restaurant.update({
        "name": "Riverside Restaurant",
        "sub_category": "western",
        "description": "Restaurant beside the river with local dining.",
        "vibes": ["culinary", "local_specialty"],
        "ai_metadata": {
            "menu_items": [
                {"name": "Pasta with sea crab", "description": "Fresh crab from the sea."},
            ],
            "eco_highlights": "River and sea cleanup activity.",
        },
    })

    response = service._recommend_by_ideas_and_taxonomy(
        [restaurant], RecommendationRequest(interests=["beach"], top_k=10)
    )

    assert response.data == []


def test_no_interests_keeps_quality_green_fallback_without_interest_filter() -> None:
    cheap = make_poi("historic-site", green=0.4)
    expensive = make_poi("restaurant", green=0.8, category="Ẩm thực và quán ăn")
    ranked = build_ranker([cheap, expensive]).rank_pois([], 0.7, top_k=None)

    assert len(ranked) == 2
    assert all(item["score_breakdown"]["algorithm"] == "content_quality_green" for item in ranked)
    assert all(item["matched_interests"] == [] for item in ranked)


def test_budget_changes_cannot_promote_unrelated_poi_over_selected_interest() -> None:
    beach = make_poi("beach", cost=100, green=0.2, popularity=0)
    beach.update({"name": "My Khe Beach", "sub_category": "beach_coastline"})
    unrelated = make_poi("unrelated", cost=500, green=1.0, satisfaction=5.0, popularity=100_000)
    unrelated.update({"name": "Historic palace", "sub_category": "heritage"})
    ranker = build_ranker([unrelated, beach])

    low_budget = ranker.rank_pois(["beach"], 0.7, top_k=None, budget_target_per_person=100)
    high_budget = ranker.rank_pois(["beach"], 0.7, top_k=None, budget_target_per_person=500)

    assert [item["poi_id"] for item in low_budget] == ["beach"]
    assert [item["poi_id"] for item in high_budget] == ["beach"]


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


def test_soft_budget_changes_pb09_ranking_without_filtering_candidates() -> None:
    near_target = make_poi("a", cost=100, green=0.5, popularity=0)
    far_from_target = make_poi("b", cost=500, green=0.5, popularity=0)
    near_target.update({"name": "Shared place", "description": "same description"})
    far_from_target.update({"name": "Shared place", "description": "same description"})
    ranker = build_ranker([near_target, far_from_target])

    low_target = ranker.rank_pois(
        ["culture"], 0.0, top_k=None, budget_target_per_person=100
    )
    higher_target = ranker.rank_pois(
        ["culture"], 0.0, top_k=None, budget_target_per_person=500
    )

    assert [poi["poi_id"] for poi in low_target] == ["a", "b"]
    assert [poi["poi_id"] for poi in higher_target] == ["b", "a"]
    assert next(
        factor for factor in low_target[0]["score_breakdown"]["factors"]
        if factor["key"] == "budget_alignment"
    )["source"] == "validated_trip_daily_budget"


def test_budget_tier_is_a_soft_signal_when_pb07_daily_amount_is_missing() -> None:
    affordable = make_poi("a", cost=10, budget_tier="$", green=0.5, popularity=0)
    premium = make_poi("b", cost=500, budget_tier="$$$", green=0.5, popularity=0)
    affordable.update({"name": "Shared place", "description": "same description"})
    premium.update({"name": "Shared place", "description": "same description"})
    ranker = build_ranker([affordable, premium])

    budget_first = ranker.rank_pois(
        ["culture"], 0.0, top_k=None, budget_tier_preference="budget"
    )
    luxury_first = ranker.rank_pois(
        ["culture"], 0.0, top_k=None, budget_tier_preference="luxury"
    )

    assert [poi["poi_id"] for poi in budget_first] == ["a", "b"]
    assert [poi["poi_id"] for poi in luxury_first] == ["b", "a"]


def test_recommendation_reason_does_not_claim_unsubmitted_preferences() -> None:
    poi = make_poi("neutral", category="Local food")
    poi["score_breakdown"] = {
        "factors": [{
            "key": "preference_similarity",
            "normalized_value": 0.0,
        }],
    }

    explanation = service._explanation(poi, [])
    explanation_for_unmatched_interest = service._explanation(poi, ["beach"])

    assert "sở thích" not in explanation.casefold()
    assert "sở thích" not in explanation_for_unmatched_interest.casefold()
    assert "historic cultural place" in explanation


def test_pb09_keeps_pois_outside_total_budget_as_soft_recommendations() -> None:
    poi = make_poi("over-budget", cost=10_000)
    request = make_request(food_budget=1, activity_budget=0)
    normalized = service._with_effective_cost(poi)
    assert normalized is not None

    response = service._rank_and_format([normalized], request)

    assert [item.poi_id for item in response.data] == ["over-budget"]
    assert response.data[0].score_breakdown is not None
    assert response.data[0].score_breakdown.budget_time_filter_applied is False
    assert any(
        factor.key == "budget_alignment"
        for factor in response.data[0].score_breakdown.factors
    )
    assert round(sum(
        factor.contribution_points
        for factor in response.data[0].score_breakdown.factors
    ), 1) == response.data[0].match_score


def test_trip_data_keeps_pb09_independent_of_selected_ideas() -> None:
    culture_poi = make_poi("heritage-museum", category="Culture & Heritage")
    culture_poi["description"] = "Historic heritage museum with cultural exhibits"
    food_poi = make_poi("local-noodles", category="Local Food")
    food_poi["description"] = "Local cuisine serving traditional food and noodles"
    request = make_request(top_k=2, food_budget=1_000_000)
    request.ideas = ["local-noodles"]

    response = service._recommend_by_ideas_and_taxonomy(
        [culture_poi, food_poi], request
    )

    assert response.data[0].poi_id == "heritage-museum"


def test_ranking_is_deterministic_and_top_k_is_respected() -> None:
    pois = [make_poi("b"), make_poi("a")]
    ranker = build_ranker(pois)
    ranked = ranker.rank_pois(["culture"], 0.5, top_k=None)
    top_one = ranker.rank_pois(["culture"], 0.5, top_k=1)
    assert [poi["poi_id"] for poi in ranked] == ["a", "b"]
    assert [poi["poi_id"] for poi in top_one] == ["a"]


def test_recommendations_page_through_more_than_fifty_ranked_pois_without_duplicates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pois = [make_poi(f"poi-{index:03d}") for index in range(65)]
    monkeypatch.setattr(service, "list_recommendation_pois", lambda *_args, **_kwargs: pois)
    request = make_request(top_k=10)

    first_page = service.get_poi_recommendations(request, object())
    assert len(first_page.data) == 10
    assert first_page.total == 65
    assert first_page.has_more is True
    assert first_page.next_offset == 10
    assert first_page.snapshot_id

    all_ids = [item.poi_id for item in first_page.data]
    all_scores = [item.match_score for item in first_page.data]
    page = first_page
    while page.has_more:
        request = RecommendationRequest(
            **{
                **request.model_dump(),
                "offset": page.next_offset,
                "snapshot_id": page.snapshot_id,
            }
        )
        page = service.get_poi_recommendations(request, object())
        assert len(page.data) <= 10
        assert not page.has_more or len(page.data) == 10
        all_ids.extend(item.poi_id for item in page.data)
        all_scores.extend(item.match_score for item in page.data)

    assert len(all_ids) == 65
    assert len(set(all_ids)) == 65
    assert all_ids == sorted(all_ids)
    assert all_scores == sorted(all_scores, reverse=True)


def test_page_sort_is_score_descending_then_poi_id_and_rejects_changed_snapshot() -> None:
    records = [
        {"poi_id": "z", "name": "Z", "match_score": 82.0, "is_local_business": False, "explanation_snippet": ""},
        {"poi_id": "b", "name": "B", "match_score": 91.0, "is_local_business": False, "explanation_snippet": ""},
        {"poi_id": "a", "name": "A", "match_score": 82.0, "is_local_business": False, "explanation_snippet": ""},
    ]
    request = RecommendationRequest(top_k=10)

    response = service._page_recommendation_data(records, request)

    assert [(item.match_score, item.poi_id) for item in response.data] == [
        (91.0, "b"),
        (82.0, "a"),
        (82.0, "z"),
    ]
    assert response.total == 3
    assert response.has_more is False
    with pytest.raises(service.RecommendationSnapshotMismatch):
        service._page_recommendation_data(
            [*records, {"poi_id": "new", "name": "New", "match_score": 20.0, "is_local_business": False, "explanation_snippet": ""}],
            RecommendationRequest(top_k=1, offset=1, snapshot_id=response.snapshot_id),
        )


def test_nonzero_offset_requires_a_ranking_snapshot() -> None:
    with pytest.raises(ValueError, match="snapshot_id is required"):
        RecommendationRequest(top_k=10, offset=10)


def test_stale_recommendation_snapshot_is_reported_as_http_conflict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def stale(*_args: object, **_kwargs: object) -> None:
        raise service.RecommendationSnapshotMismatch("results changed")

    monkeypatch.setattr(router, "get_poi_recommendations", stale)
    with pytest.raises(router.HTTPException) as raised:
        router.recommend_pois(
            RecommendationRequest(offset=10, snapshot_id="0" * 64),
            object(),
        )

    assert raised.value.status_code == 409


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


def test_csv_fallback_keeps_missing_poi_coordinates_unknown(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    csv_path = tmp_path / "pois.csv"
    csv_path.write_text(
        "osm_id,name,category_name,city_name,latitude,longitude\n"
        "place-1,Quán chưa xác minh,Ẩm thực,Đà Nẵng,,\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(repository, "_CSV_PATH", csv_path)

    pois = repository._load_pois_from_csv("Đà Nẵng")

    assert len(pois) == 1
    assert pois[0]["lat"] is None
    assert pois[0]["lng"] is None
