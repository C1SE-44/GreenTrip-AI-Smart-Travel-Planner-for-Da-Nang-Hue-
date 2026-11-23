from pathlib import Path
import sys
from unittest.mock import patch

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.cache import poi_cache
from app.main import app
from app.pois import explanation_repository, router
from app.pois.model import POI
from app.pois.schemas import PaginatedPOIResponse, PaginationMetadata
from app.pois.weights import (
    ParsedSliderWeights,
    is_poi_local_authentic,
    is_poi_west_of_han_river,
    matches_slider_filters,
    parse_slider_weights,
)


def _sample_poi(**overrides: object) -> POI:
    base = dict(
        id="poi-local-1",
        name="Mì Quảng Tơ - Hải Châu",
        category="Ẩm thực và quán ăn",
        description="Quán ăn bản địa phía Tây sông Hàn",
        latitude=16.067,
        longitude=108.215,
        address="Hải Châu, Đà Nẵng",
        city="Đà Nẵng",
        estimated_cost=45000.0,
        average_visit_minutes=45,
        satisfaction_score=4.7,
        green_score=0.82,
        is_local_business=True,
        local_business_type="restaurant",
        popularity_score=3.1,
    )
    base.update(overrides)
    return POI(**base)


def test_parse_slider_weights_supports_local_authentic_only():
    default_weights = parse_slider_weights()
    assert default_weights.local_authentic_only is False
    assert default_weights.is_filtering_active is False

    local_weights = parse_slider_weights(local_authentic_only=True)
    assert local_weights.local_authentic_only is True
    assert local_weights.is_filtering_active is True


def test_local_authentic_filters_west_han_river_craft_villages_and_crowds():
    west_eatery = _sample_poi(id="west-1", longitude=108.212, popularity_score=3.1)
    east_eatery = _sample_poi(
        id="east-1",
        name="Quán ven biển Mỹ Khê",
        longitude=108.245,
        popularity_score=3.1,
    )
    crowded_market = _sample_poi(
        id="crowded-1",
        name="Chợ Đông Ba",
        category="Di tích lịch sử và văn hóa",
        city="Huế",
        latitude=16.471,
        longitude=107.587,
        local_business_type="traditional_market",
        green_score=0.78,
        popularity_score=4.37,
    )
    craft_village = _sample_poi(
        id="craft-1",
        name="Làng Hương Thủy Xuân",
        category="Di tích lịch sử và văn hóa",
        city="Huế",
        latitude=16.434,
        longitude=107.568,
        local_business_type="craft_workshop",
        green_score=0.95,
        popularity_score=3.87,
    )

    assert is_poi_west_of_han_river(west_eatery) is True
    assert is_poi_west_of_han_river(east_eatery) is False

    assert is_poi_local_authentic(west_eatery) is True
    assert is_poi_local_authentic(east_eatery) is False
    assert is_poi_local_authentic(crowded_market) is False
    # Craft villages stay prioritized even when popularity_score is higher
    assert is_poi_local_authentic(craft_village) is True

    weights = ParsedSliderWeights(
        green_weight_raw=50.0,
        budget_weight_raw=50.0,
        normalized_green_weight=0.5,
        normalized_budget_weight=0.5,
        min_eco_score=0,
        local_authentic_only=True,
        is_filtering_active=True,
    )
    assert matches_slider_filters(west_eatery, weights) is True
    assert matches_slider_filters(east_eatery, weights) is False


def test_fetch_local_authentic_poi_ids_falls_back_gracefully_without_neo4j(monkeypatch):
    poi_cache.invalidate_pois()
    monkeypatch.setattr(explanation_repository, "get_driver", lambda: None)
    assert explanation_repository.fetch_local_authentic_poi_ids() == set()


def test_get_pois_local_authentic_only_isolates_cache_key():
    poi_cache.invalidate_pois()
    client = TestClient(app)
    recorded_flags: list[bool] = []

    def fake_page(**kwargs):
        weights = kwargs["weights"]
        recorded_flags.append(bool(weights.local_authentic_only))
        sample = _sample_poi()
        return PaginatedPOIResponse(
            items=[sample],
            pagination=PaginationMetadata(
                page=1,
                limit=10,
                total=1,
                total_pages=1,
                has_next=False,
                has_previous=False,
            ),
        )

    with patch.object(router, "get_poi_page", side_effect=fake_page):
        res_default = client.get("/pois?city=danang")
        res_local_1 = client.get("/pois?city=danang&local_authentic_only=true")
        res_local_2 = client.get("/pois?city=danang&local_authentic_only=true")

    assert res_default.status_code == 200
    assert res_default.headers.get("X-Cache") == "MISS"
    assert res_local_1.status_code == 200
    assert res_local_1.headers.get("X-Cache") == "MISS"
    assert res_local_1.json()["items"][0]["popularity_score"] == 3.1
    assert res_local_2.status_code == 200
    assert res_local_2.headers.get("X-Cache") == "HIT"
    assert recorded_flags == [False, True]
