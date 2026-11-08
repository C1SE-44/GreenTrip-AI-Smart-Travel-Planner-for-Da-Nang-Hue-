from decimal import Decimal
import json
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.upsert_eco_places_60 import (
    ECO_JSON_PATH,
    build_poi_payload,
    haversine_meters,
    match_existing_poi,
    parse_average_visit_minutes,
    parse_estimated_cost_and_tier,
)


def test_parse_estimated_cost_and_tier_cases() -> None:
    cost_free, tier_free = parse_estimated_cost_and_tier(
        "Miễn phí tham quan (thuê kayak/SUP ~100.000–150.000 ₫)",
        "Cảnh quan và thiên nhiên",
    )
    assert cost_free == Decimal(0)
    assert tier_free == "free"

    cost_low, tier_low = parse_estimated_cost_and_tier(
        "50.000–120.000 ₫/người",
        "Ẩm thực và quán ăn",
    )
    assert cost_low == Decimal(85000)
    assert tier_low == "$"

    cost_mid, tier_mid = parse_estimated_cost_and_tier(
        "150.000–350.000 ₫/người",
        "Ẩm thực và quán ăn",
    )
    assert cost_mid == Decimal(250000)
    assert tier_mid == "$$"

    cost_high, tier_high = parse_estimated_cost_and_tier(
        "Từ ~743.000 ₫/đêm",
        "Cảnh quan và thiên nhiên",
    )
    assert cost_high == Decimal(745000)
    assert tier_high == "$$$"


def test_parse_average_visit_minutes_caps_overnight_stays() -> None:
    assert parse_average_visit_minutes("0.5", "Ẩm thực và quán ăn") == 30
    assert parse_average_visit_minutes("1.5-2", "Cảnh quan và thiên nhiên") == 105
    assert parse_average_visit_minutes("4-24", "Cảnh quan và thiên nhiên") == 240


def test_match_existing_poi_avoids_nearby_distinct_farm_collision() -> None:
    existing = [
        {
            "poi_id": "11111111-1111-1111-1111-111111111111",
            "name": "An Phú Farm Bà Nà",
            "city_name": "Da Nang",
            "latitude": 16.0172965,
            "longitude": 108.0702798,
            "eco_place_code": None,
        },
        {
            "poi_id": "22222222-2222-2222-2222-222222222222",
            "name": "Bán Đảo Sơn Trà",
            "city_name": "Da Nang",
            "latitude": 16.1160000,
            "longitude": 108.2734000,
            "eco_place_code": None,
        },
    ]

    # Bana Rita is ~85m from An Phú Farm on the same road, but has distinct brand tokens -> MUST NOT collide
    bana_rita = {
        "id": "dn-09",
        "name": "Bana Rita Glamping Farm",
        "city": "Đà Nẵng",
        "latitude": 16.017716,
        "longitude": 108.0696199,
    }
    assert haversine_meters(16.0172965, 108.0702798, 16.017716, 108.0696199) < 150.0
    assert match_existing_poi(bana_rita, existing) is None

    # Exact normalized name match in same city -> MUST match existing poi_id
    son_tra = {
        "id": "dn-01",
        "name": "Bán đảo Sơn Trà",
        "city": "Đà Nẵng",
        "latitude": 16.1159837,
        "longitude": 108.273341,
    }
    assert match_existing_poi(son_tra, existing) == "22222222-2222-2222-2222-222222222222"


def test_eco_60_json_dataset_integrity_and_payload_builder() -> None:
    assert Path(ECO_JSON_PATH).exists()
    records = json.loads(Path(ECO_JSON_PATH).read_text(encoding="utf-8"))
    assert len(records) == 60
    assert sum(1 for r in records if r["city"] == "Đà Nẵng") == 30
    assert sum(1 for r in records if r["city"] == "Huế") == 30

    for item in records:
        assert item["image_url"].startswith("https://")
        assert len(item["gallery_urls"]) == 5
        assert len(item["featured_reviews"]) >= 1
        payload = build_poi_payload(
            item=item,
            city_id="00000000-0000-0000-0000-000000000001",
            category_id="00000000-0000-0000-0000-000000000002",
        )
        assert 0.78 <= payload["green_score"] <= 0.98
        assert payload["ai_metadata"].obj["eco_place_code"] == item["id"]
        assert len(payload["ai_metadata"].obj["featured_reviews"]) >= 1
