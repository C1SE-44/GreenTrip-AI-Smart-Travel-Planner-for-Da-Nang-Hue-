import os
from pathlib import Path
import re
import sys
from typing import Any

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app
from app.pois import repository
from app.pois.model import POI
from app.pois.weights import (
    BudgetTierEnum,
    EcoPriorityEnum,
    compute_budget_score_normalized,
    compute_green_score_normalized,
    compute_poi_weighted_score,
    matches_slider_filters,
    normalize_weights,
    parse_slider_weights,
)


# ─────────────────────────────────────────────
# Unit Tests for Helper Functions
# ─────────────────────────────────────────────

def test_normalize_weights_equal_split() -> None:
    norm_green, norm_budget = normalize_weights(50.0, 50.0)
    assert norm_green == 0.5
    assert norm_budget == 0.5
    assert norm_green + norm_budget == 1.0


def test_normalize_weights_custom_split() -> None:
    norm_green, norm_budget = normalize_weights(80.0, 20.0)
    assert norm_green == 0.8
    assert norm_budget == 0.2
    assert norm_green + norm_budget == 1.0


def test_normalize_weights_boundary_zero_and_hundred() -> None:
    norm_green, norm_budget = normalize_weights(100.0, 0.0)
    assert norm_green == 1.0
    assert norm_budget == 0.0

    norm_green_2, norm_budget_2 = normalize_weights(0.0, 100.0)
    assert norm_green_2 == 0.0
    assert norm_budget_2 == 1.0


def test_normalize_weights_zero_division_safety() -> None:
    """When both weights are 0, fallback to equal 0.5/0.5 split instead of dividing by zero."""
    norm_green, norm_budget = normalize_weights(0.0, 0.0)
    assert norm_green == 0.5
    assert norm_budget == 0.5

    parsed = parse_slider_weights(green_weight=0.0, budget_weight=0.0)
    assert parsed.zero_weights_fallback is True
    assert parsed.normalized_green_weight == 0.5
    assert parsed.normalized_budget_weight == 0.5


def test_parse_slider_weights_defaults() -> None:
    parsed = parse_slider_weights()
    assert parsed.green_weight_raw == 50.0
    assert parsed.budget_weight_raw == 50.0
    assert parsed.normalized_green_weight == 0.5
    assert parsed.normalized_budget_weight == 0.5
    assert parsed.min_eco_score == 0
    assert parsed.max_budget is None
    assert parsed.eco_certified_only is False
    assert parsed.green_transit_only is False
    assert parsed.is_ranking_active is False
    assert parsed.is_filtering_active is False
    assert parsed.zero_weights_fallback is False


def test_parse_slider_weights_continuous_values_decoupled_from_min_eco_score() -> None:
    """green_weight determines ranking priority and must NOT force min_eco_score hard filtering."""
    parsed = parse_slider_weights(green_weight=75.0, budget_weight=25.0)
    assert parsed.green_weight_raw == 75.0
    assert parsed.budget_weight_raw == 25.0
    assert parsed.normalized_green_weight == 0.75
    assert parsed.normalized_budget_weight == 0.25
    assert parsed.min_eco_score == 0
    assert parsed.is_ranking_active is True
    assert parsed.is_filtering_active is False


def test_parse_slider_weights_eco_priority_mapping() -> None:
    parsed_eco = parse_slider_weights(eco_priority=EcoPriorityEnum.ECO)
    assert parsed_eco.min_eco_score == 75
    assert parsed_eco.green_weight_raw == 75.0
    assert parsed_eco.is_filtering_active is True

    parsed_basic = parse_slider_weights(eco_priority=EcoPriorityEnum.BASIC)
    assert parsed_basic.min_eco_score == 30
    assert parsed_basic.green_weight_raw == 30.0

    parsed_all = parse_slider_weights(eco_priority=EcoPriorityEnum.ALL)
    assert parsed_all.min_eco_score == 0
    assert parsed_all.green_weight_raw == 50.0
    assert parsed_all.is_filtering_active is False


def test_parse_slider_weights_budget_tier_mapping() -> None:
    parsed_free = parse_slider_weights(budget_tier=BudgetTierEnum.FREE)
    assert parsed_free.max_budget == 0.0

    parsed_tier_1 = parse_slider_weights(budget_tier=BudgetTierEnum.TIER_1)
    assert parsed_tier_1.max_budget == 100_000.0

    parsed_tier_2 = parse_slider_weights(budget_tier=BudgetTierEnum.TIER_2)
    assert parsed_tier_2.max_budget == 400_000.0

    parsed_tier_3 = parse_slider_weights(budget_tier=BudgetTierEnum.TIER_3)
    assert parsed_tier_3.max_budget == 1_000_000.0

    parsed_tier_4 = parse_slider_weights(budget_tier=BudgetTierEnum.TIER_4)
    assert parsed_tier_4.max_budget is None


def test_parse_slider_weights_toggles() -> None:
    parsed = parse_slider_weights(
        eco_certified_only=True,
        green_transit_only=True,
    )
    assert parsed.eco_certified_only is True
    assert parsed.green_transit_only is True
    assert parsed.is_filtering_active is True


def test_green_and_budget_score_normalization_consistency() -> None:
    # Green score supports 0..1, 0..100, and None
    assert compute_green_score_normalized(0.85) == 0.85
    assert compute_green_score_normalized(85.0) == 0.85
    assert compute_green_score_normalized(None) == 0.5

    # Budget score uses estimated_cost when available, else budget_tier fallback, else 0.5
    assert compute_budget_score_normalized(0.0) == 1.0
    assert compute_budget_score_normalized(200_000.0) == 0.8
    assert compute_budget_score_normalized(1_000_000.0) == 0.0
    assert compute_budget_score_normalized(1_500_000.0) == 0.0
    assert compute_budget_score_normalized(None, "free") == 1.0
    assert compute_budget_score_normalized(None, "$") == 0.9
    assert compute_budget_score_normalized(None, "$$") == 0.65
    assert compute_budget_score_normalized(None, "$$$") == 0.3
    assert compute_budget_score_normalized(None, "$$$$") == 0.0
    assert compute_budget_score_normalized(None, None) == 0.5


# ─────────────────────────────────────────────
# API Integration & Multi-Objective Ranking Tests
# ─────────────────────────────────────────────

class FakeCursor:
    """Mô phỏng chính xác hành vi WHERE, ORDER BY và LIMIT/OFFSET của PostgreSQL."""

    def __init__(self, records: list[POI], queries: list[tuple[str, Any]]) -> None:
        self.records = records
        self.queries = queries
        self.rows: list[tuple[Any, ...]] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, query: str, parameters: tuple[Any, ...] | None = None) -> None:
        self.queries.append((query, parameters))
        matched = list(self.records)

        # 1. Filter: min_eco_score (WHERE green_score >= %s)
        if "p.green_score" in query and ">= %s" in query:
            min_score = next(
                (p for p in (parameters or ()) if isinstance(p, (int, float)) and p in (30.0, 55.0, 75.0, 90.0)),
                None,
            )
            if min_score is not None:
                matched = [
                    p for p in matched
                    if (
                        (p.green_score if (p.green_score or 0) > 1 else (p.green_score or 0) * 100.0)
                        >= min_score
                    )
                ]

        # 2. Filter: eco_certified_only
        if "array_length(p.eco_features, 1)" in query:
            matched = [
                p for p in matched
                if (
                    ((p.green_score if (p.green_score or 0) > 1 else (p.green_score or 0) * 100.0) >= 75.0)
                    or bool(p.eco_features)
                )
            ]

        # 3. Filter: green_transit_only
        if "array_to_string" in query:
            matched = [
                p for p in matched
                if any(
                    kw in " ".join(p.eco_features or []).lower()
                    for kw in ("transit", "bus", "bike", "bicycle", "walk", "xe buýt", "xe đạp", "đi bộ", "xe điện")
                )
                or (p.ai_metadata or {}).get("green_transit") is True
            ]

        # 4. Filter: max_budget with tier fallback
        if "<= %s" in query and "p.estimated_cost" in query and "budget_tier" in query:
            max_b = next(
                (p for p in (parameters or ()) if isinstance(p, (int, float)) and p in (0.0, 100_000.0, 400_000.0, 1_000_000.0)),
                None,
            )
            if max_b is not None:
                fallback_map = {"free": 0.0, "$": 100_000.0, "$$": 400_000.0, "$$$": 1_000_000.0}
                def eff_cost(p: POI) -> float | None:
                    if p.estimated_cost is not None:
                        return float(p.estimated_cost)
                    if p.budget_tier and p.budget_tier.strip().lower() in fallback_map:
                        return fallback_map[p.budget_tier.strip().lower()]
                    return None
                matched = [p for p in matched if eff_cost(p) is not None and eff_cost(p) <= max_b]

        # 5. Filter: budget_tier direct
        if "p.budget_tier = %s" in query:
            tier_param = next(
                (p for p in (parameters or ()) if isinstance(p, str) and p in ("free", "$", "$$", "$$$", "$$$$")),
                None,
            )
            if tier_param is not None:
                matched = [p for p in matched if (p.budget_tier or "").strip() == tier_param]

        # 6. Sorting (Multi-Objective Weighted Ranking vs Default)
        if "ORDER BY (" in query:
            m = re.search(r"ORDER BY \((\d+(?:\.\d+)?)\s*\*", query)
            if m:
                w_g = float(m.group(1))
                w_b = 1.0 - w_g
                fallback_scores = {"free": 1.0, "$": 0.9, "$$": 0.65, "$$$": 0.3, "$$$$": 0.0}

                def poi_score(p: POI) -> tuple[float, str]:
                    if p.green_score is None:
                        s_g = 0.5
                    elif p.green_score < 0:
                        s_g = 0.0
                    elif p.green_score <= 1.0:
                        s_g = float(p.green_score)
                    else:
                        s_g = min(1.0, float(p.green_score) / 100.0)

                    if p.estimated_cost is not None:
                        s_b = max(0.0, 1.0 - min(max(0.0, float(p.estimated_cost)), 1_000_000.0) / 1_000_000.0)
                    elif p.budget_tier and p.budget_tier.strip().lower() in fallback_scores:
                        s_b = fallback_scores[p.budget_tier.strip().lower()]
                    else:
                        s_b = 0.5

                    return (w_g * s_g + w_b * s_b, p.name)

                matched.sort(key=lambda p: (-poi_score(p)[0], poi_score(p)[1]))
        else:
            matched.sort(key=lambda p: (p.name, str(p.id)))

        if "COUNT(*)" in query:
            self.rows = [(len(matched),)]
            return

        limit, offset = (parameters[-2], parameters[-1]) if parameters and len(parameters) >= 2 else (len(matched), 0)
        page = matched[offset : offset + limit]
        self.rows = [
            (
                poi.id,
                poi.name,
                poi.category,
                poi.description,
                poi.latitude,
                poi.longitude,
                poi.address,
                poi.city,
                poi.estimated_cost,
                poi.average_visit_minutes,
                poi.satisfaction_score,
                poi.green_score,
                poi.is_local_business,
                poi.local_business_type,
                poi.image_url,
                poi.gallery_urls,
                poi.sub_category,
                poi.cuisine,
                poi.budget_tier,
                poi.vibes,
                poi.best_time,
                poi.eco_features,
                poi.ai_metadata,
                poi.phone_number,
                poi.website_url,
                poi.social_links,
                poi.opening_hours,
                poi.email,
            )
            for poi in page
        ]

    def fetchall(self) -> list[tuple[Any, ...]]:
        return self.rows

    def fetchone(self) -> tuple[Any, ...] | None:
        return self.rows[0] if self.rows else None


class FakeConnection:
    def __init__(self, records: list[POI], queries: list[tuple[str, Any]]) -> None:
        self.records = records
        self.queries = queries

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return FakeCursor(self.records, self.queries)


@pytest.fixture
def sample_pois() -> list[POI]:
    return [
        # POI A: High cost (800k -> budget_score 0.2), Very high green score (95 -> green_score 0.95)
        POI(
            id="poi-eco-resort",
            name="Alpha Eco Retreat",
            category="canh-quan",
            description="Luxury zero-waste nature retreat",
            latitude=16.10,
            longitude=108.25,
            address="Son Tra",
            city="Da Nang",
            estimated_cost=800_000.0,
            green_score=95.0,
            budget_tier="$$$",
            eco_features=["Zero-waste", "Solar"],
            ai_metadata={"green_transit": False},
        ),
        # POI B: Very low cost (20k -> budget_score 0.98), Low green score (40 -> green_score 0.40)
        POI(
            id="poi-street-food",
            name="Beta Street Stall",
            category="quan-an",
            description="Affordable local snack stall",
            latitude=16.06,
            longitude=108.22,
            address="Hai Chau",
            city="Da Nang",
            estimated_cost=20_000.0,
            green_score=40.0,
            budget_tier="$",
            eco_features=[],
            ai_metadata={"green_transit": True},
        ),
        # POI C: Moderate cost (null cost, tier $$ -> budget_score 0.65), High green score (0.80 on 0..1 scale)
        POI(
            id="poi-heritage-park",
            name="Gamma Heritage Garden",
            category="di-tich",
            description="Cultural garden near electric bus stop",
            latitude=16.46,
            longitude=107.58,
            address="Hue Center",
            city="Hue",
            estimated_cost=None,
            green_score=0.80,
            budget_tier="$$",
            eco_features=["Xe buýt điện", "Bảo tồn"],
            ai_metadata={"green_transit": True},
        ),
    ]


@pytest.fixture
def test_client(
    monkeypatch: pytest.MonkeyPatch, sample_pois: list[POI]
) -> tuple[TestClient, list[tuple[str, Any]]]:
    queries: list[tuple[str, Any]] = []
    monkeypatch.setattr(
        repository,
        "get_connection",
        lambda: FakeConnection(sample_pois, queries),
    )
    with TestClient(app) as client:
        yield client, queries


def test_api_accepts_valid_slider_weights(
    test_client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    client, _ = test_client
    response = client.get("/pois?green_weight=80&budget_weight=20")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 3


def test_changing_weights_reorders_pois_between_green_and_budget_priority(
    test_client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    """
    Proves that:
    1) High green_weight (90/10) ranks high-green POI ('poi-eco-resort') first.
    2) High budget_weight (10/90) ranks budget-friendly POI ('poi-street-food') first.
    3) Slider weights do NOT drop POIs (all 3 POIs remain in the response).
    """
    client, _ = test_client

    green_resp = client.get("/pois?green_weight=90&budget_weight=10")
    assert green_resp.status_code == 200
    green_items = green_resp.json()["items"]
    assert len(green_items) == 3
    assert [item["id"] for item in green_items] == [
        "poi-eco-resort",
        "poi-heritage-park",
        "poi-street-food",
    ]

    budget_resp = client.get("/pois?green_weight=10&budget_weight=90")
    assert budget_resp.status_code == 200
    budget_items = budget_resp.json()["items"]
    assert len(budget_items) == 3
    assert [item["id"] for item in budget_items] == [
        "poi-street-food",
        "poi-heritage-park",
        "poi-eco-resort",
    ]


def test_hard_filters_operate_independently_of_slider_weights(
    test_client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    client, _ = test_client

    # eco_priority=eco requires green_score >= 75 (excludes Beta Street Stall with green_score=40)
    # while budget_weight=90 still ranks Gamma Heritage Garden ($$) ahead of Alpha Eco Retreat (800k)
    resp = client.get("/pois?eco_priority=eco&green_weight=10&budget_weight=90")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert [item["id"] for item in items] == ["poi-heritage-park", "poi-eco-resort"]

    # green_transit_only=true keeps only POIs with green transit support
    transit_resp = client.get("/pois?green_transit_only=true")
    assert transit_resp.status_code == 200
    transit_ids = [item["id"] for item in transit_resp.json()["items"]]
    assert transit_ids == ["poi-street-food", "poi-heritage-park"]


def test_default_request_preserves_alphabetical_order_sql(
    test_client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    client, queries = test_client
    resp = client.get("/pois")
    assert resp.status_code == 200
    page_query, _ = queries[0]
    assert "ORDER BY p.name ASC, p.poi_id ASC" in page_query


def test_green_transit_only_pushed_to_sql_where_clause(
    test_client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    client, queries = test_client
    resp = client.get("/pois?green_transit_only=true")
    assert resp.status_code == 200
    page_query, page_params = queries[0]
    count_query, count_params = queries[1]

    # Both page query and count query must contain the green transit regex condition in SQL
    assert "array_to_string(COALESCE(p.eco_features" in page_query
    assert "array_to_string(COALESCE(p.eco_features" in count_query
    assert any("transit" in str(p) for p in page_params)
    assert any("transit" in str(p) for p in count_params)


def test_budget_fallback_in_sql_query(
    test_client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    client, queries = test_client
    # Test request with max_budget through tier
    resp = client.get("/pois?eco_priority=all&budget_tier=%24%24")
    assert resp.status_code == 200
    page_query, _ = queries[0]
    assert "p.budget_tier = %s" in page_query


def test_pb08_weights_endpoint_returns_parsed_slider_values(
    test_client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    client, _ = test_client
    response = client.get(
        "/pois/weights?green_weight=60&budget_weight=40&budget_tier=%24%24"
    )
    assert response.status_code == 200
    assert response.json() == {
        "green_weight_raw": 60.0,
        "budget_weight_raw": 40.0,
        "normalized_green_weight": 0.6,
        "normalized_budget_weight": 0.4,
        "min_eco_score": 0,
        "max_budget": 400_000.0,
        "eco_certified_only": False,
        "green_transit_only": False,
        "is_ranking_active": True,
        "is_filtering_active": True,
        "zero_weights_fallback": False,
    }


def test_zero_zero_weights_returns_equal_weights_fallback(
    test_client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    client, _ = test_client
    response = client.get("/pois/weights?green_weight=0&budget_weight=0")
    assert response.status_code == 200
    data = response.json()
    assert data["normalized_green_weight"] == 0.5
    assert data["normalized_budget_weight"] == 0.5
    assert data["zero_weights_fallback"] is True


@pytest.mark.parametrize(
    "query",
    [
        "?green_weight=0&budget_weight=100",
        "?green_weight=100&budget_weight=0",
        "?green_weight=0&budget_weight=0",
        "?green_weight=50.5&budget_weight=49.5",
        "?eco_priority=eco&budget_tier=%24%24",
        "?eco_certified_only=true&green_transit_only=true",
    ],
)
def test_api_accepts_valid_boundary_values(
    test_client: tuple[TestClient, list[tuple[str, Any]]], query: str
) -> None:
    client, _ = test_client
    response = client.get(f"/pois{query}")
    assert response.status_code == 200


@pytest.mark.parametrize(
    "invalid_query",
    [
        "?green_weight=-1",
        "?green_weight=100.1",
        "?green_weight=999",
        "?budget_weight=-0.01",
        "?budget_weight=105",
        "?green_weight=not_a_number",
        "?eco_priority=ultra_green",
        "?budget_tier=$$$$$",
    ],
)
def test_api_rejects_invalid_boundary_values_with_422(
    test_client: tuple[TestClient, list[tuple[str, Any]]], invalid_query: str
) -> None:
    client, _ = test_client
    response = client.get(f"/pois{invalid_query}")
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data


def test_openapi_schema_contains_slider_parameters(
    test_client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    client, _ = test_client
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()

    parameters = {
        param["name"]: param
        for param in schema["paths"]["/pois"]["get"]["parameters"]
    }

    assert "green_weight" in parameters
    green_schema = parameters["green_weight"]["schema"]
    if "anyOf" in green_schema:
        number_schema = next(s for s in green_schema["anyOf"] if s.get("type") == "number")
    else:
        number_schema = green_schema
    assert number_schema["minimum"] == 0.0
    assert number_schema["maximum"] == 100.0

    assert "budget_weight" in parameters
    budget_schema = parameters["budget_weight"]["schema"]
    if "anyOf" in budget_schema:
        budget_number_schema = next(s for s in budget_schema["anyOf"] if s.get("type") == "number")
    else:
        budget_number_schema = budget_schema
    assert budget_number_schema["minimum"] == 0.0
    assert budget_number_schema["maximum"] == 100.0

    assert "eco_priority" in parameters
    assert "budget_tier" in parameters
    assert "eco_certified_only" in parameters
    assert "green_transit_only" in parameters


# ─────────────────────────────────────────────
# Live PostgreSQL Tests (Run only when DATABASE_URL is configured)
# ─────────────────────────────────────────────

@pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="Requires live PostgreSQL connection (DATABASE_URL)",
)
def test_live_postgres_green_transit_only_pagination_consistency() -> None:
    """Xác minh rằng trên database thật, green_transit_only được lọc trong SQL và không làm nhảy total."""
    from app.pois.service import get_poi_page
    from app.pois.weights import parse_slider_weights

    weights = parse_slider_weights(green_transit_only=True)
    page1 = get_poi_page(page=1, limit=10, weights=weights)
    page2 = get_poi_page(page=2, limit=10, weights=weights)

    assert page1.pagination.total == 176
    assert page2.pagination.total == 176
    assert page1.pagination.total_pages == 18
    assert page2.pagination.total_pages == 18
    assert len(page1.items) == 10
    assert len(page2.items) == 10

    # Ensure no duplicate POIs between page 1 and page 2
    p1_ids = [item.id for item in page1.items]
    p2_ids = [item.id for item in page2.items]
    assert set(p1_ids).isdisjoint(p2_ids)


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="Requires live PostgreSQL connection (DATABASE_URL)",
)
def test_live_postgres_multi_objective_ranking_order_consistency() -> None:
    """Xác minh rằng tỷ trọng 90/10 vs 10/90 trên database thật xếp hạng POI chuẩn xác."""
    from app.pois.service import get_poi_page
    from app.pois.weights import parse_slider_weights

    green_weights = parse_slider_weights(green_weight=90.0, budget_weight=10.0)
    budget_weights = parse_slider_weights(green_weight=10.0, budget_weight=90.0)

    green_page = get_poi_page(page=1, limit=10, weights=green_weights)
    budget_page = get_poi_page(page=1, limit=10, weights=budget_weights)

    # Top item in green priority should have high green score
    assert green_page.items[0].green_score is not None
    assert green_page.items[0].green_score >= 0.85

    # Top item in budget priority should have low or 0 estimated cost
    assert budget_page.items[0].estimated_cost is not None
    assert budget_page.items[0].estimated_cost <= 100_000.0
