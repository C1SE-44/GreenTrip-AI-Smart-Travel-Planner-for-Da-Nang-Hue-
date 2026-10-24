from pathlib import Path
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


def test_parse_slider_weights_continuous_values() -> None:
    parsed = parse_slider_weights(green_weight=75.0, budget_weight=25.0)
    assert parsed.green_weight_raw == 75.0
    assert parsed.budget_weight_raw == 25.0
    assert parsed.normalized_green_weight == 0.75
    assert parsed.normalized_budget_weight == 0.25
    assert parsed.min_eco_score == 75


def test_parse_slider_weights_eco_priority_mapping() -> None:
    parsed_eco = parse_slider_weights(eco_priority=EcoPriorityEnum.ECO)
    assert parsed_eco.min_eco_score == 75
    assert parsed_eco.green_weight_raw == 75.0

    parsed_basic = parse_slider_weights(eco_priority=EcoPriorityEnum.BASIC)
    assert parsed_basic.min_eco_score == 30
    assert parsed_basic.green_weight_raw == 30.0

    parsed_all = parse_slider_weights(eco_priority=EcoPriorityEnum.ALL)
    assert parsed_all.min_eco_score == 0
    assert parsed_all.green_weight_raw == 50.0


def test_parse_slider_weights_budget_tier_mapping() -> None:
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


# ─────────────────────────────────────────────
# API Integration & Boundary Validation Tests
# ─────────────────────────────────────────────

class FakeCursor:
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
        if "COUNT(*)" in query:
            self.rows = [(len(self.records),)]
            return

        limit, offset = (parameters[-2], parameters[-1]) if parameters else (0, 0)
        page = self.records[offset : offset + limit]
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
def test_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    poi = POI(
        id=1,
        name="Linh Ung Pagoda",
        category="chua",
        description="Famous pagoda",
        latitude=16.1,
        longitude=108.2,
        address="Son Tra",
        city="Da Nang",
    )
    queries: list[tuple[str, Any]] = []
    monkeypatch.setattr(
        repository,
        "get_connection",
        lambda: FakeConnection([poi], queries),
    )
    with TestClient(app) as client:
        yield client


def test_api_accepts_valid_slider_weights(test_client: TestClient) -> None:
    response = test_client.get("/pois?green_weight=80&budget_weight=20")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 1


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
def test_api_accepts_valid_boundary_values(test_client: TestClient, query: str) -> None:
    response = test_client.get(f"/pois{query}")
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
    test_client: TestClient, invalid_query: str
) -> None:
    response = test_client.get(f"/pois{invalid_query}")
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data


def test_openapi_schema_contains_slider_parameters(test_client: TestClient) -> None:
    response = test_client.get("/openapi.json")
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
