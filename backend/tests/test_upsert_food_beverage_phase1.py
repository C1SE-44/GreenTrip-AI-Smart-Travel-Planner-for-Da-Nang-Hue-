from decimal import Decimal
import json
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.upsert_food_beverage_phase1 import (
    PHASE1_JSON_PATH,
    build_poi_payload,
    compute_food_green_score,
    haversine_meters,
    match_existing_poi,
    normalize_vn_name,
    parse_estimated_cost_and_tier,
    strip_accents,
)


def test_phase1_json_dataset_integrity() -> None:
    assert Path(PHASE1_JSON_PATH).exists(), "Phase 1 JSON dataset must exist"
    records = json.loads(Path(PHASE1_JSON_PATH).read_text(encoding="utf-8"))
    assert len(records) == 118, f"Expected 118 Phase 1 establishments, got {len(records)}"

    codes = set()
    for rec in records:
        assert rec["id"].startswith("food-"), f"Invalid ID format: {rec['id']}"
        assert rec["id"] not in codes, f"Duplicate ID: {rec['id']}"
        codes.add(rec["id"])

        assert rec["name"].strip() != ""
        assert rec["city"] in ("Đà Nẵng", "Huế")
        assert 15.5 <= float(rec["latitude"]) <= 16.8
        assert 107.0 <= float(rec["longitude"]) <= 108.6
        assert len(rec["gallery_urls"]) == 5
        assert len(rec["sample_reviews"]) >= 2
        assert rec["phone"].startswith("+84") or rec["phone"] == ""
        assert rec["rating"] >= 4.0


def test_parse_estimated_cost_and_tier_food() -> None:
    cost, tier = parse_estimated_cost_and_tier("35.000đ - 65.000đ", "Ẩm thực và quán ăn")
    assert cost == Decimal(50000)
    assert tier == "$"

    cost2, tier2 = parse_estimated_cost_and_tier("150.000đ - 450.000đ", "Ẩm thực và quán ăn")
    assert cost2 == Decimal(300000)
    assert tier2 == "$$$"


def test_compute_food_green_score() -> None:
    vegan_item = {
        "is_vegetarian_friendly": True,
        "is_zero_waste_friendly": True,
        "eco_highlights": "Nguyên liệu hữu cơ Trà Quế",
    }
    score = compute_food_green_score(vegan_item)
    assert score >= 0.90

    normal_item = {
        "is_vegetarian_friendly": False,
        "is_zero_waste_friendly": False,
        "eco_highlights": "Thịt nướng than hoa",
    }
    assert compute_food_green_score(normal_item) == 0.50


def test_matching_preserves_existing_poi_and_inserts_new() -> None:
    existing = [
        {
            "poi_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "name": "Mì Quảng Bà Mua",
            "city_name": "Da Nang",
            "latitude": 16.064567,
            "longitude": 108.219876,
            "food_place_code": None,
        }
    ]

    # Exact match in same city -> must return existing poi_id
    candidate_match = {
        "id": "food-01",
        "name": "Mì Quảng Bà Mua (Đà Nẵng)",
        "city": "Đà Nẵng",
        "latitude": 16.064567,
        "longitude": 108.219876,
    }
    assert match_existing_poi(candidate_match, existing) == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    # Distinct place in Hue -> must NOT match
    candidate_new = {
        "id": "food-04",
        "name": "Bún Bò Mệ Kéo",
        "city": "Huế",
        "latitude": 16.471923,
        "longitude": 107.591245,
    }
    assert match_existing_poi(candidate_new, existing) is None


def test_phase1_menu_and_pricing_enrichment() -> None:
    """Verify that all 118 Phase 1 establishments have authentic menu photos and structured items."""
    records = json.loads(Path(PHASE1_JSON_PATH).read_text(encoding="utf-8"))
    assert len(records) == 118

    for rec in records:
        assert "menu_image_url" in rec, f"Missing menu_image_url in {rec['name']}"
        assert rec["menu_image_url"].startswith("http") or rec["menu_image_url"].startswith("/images/"), (
            f"Invalid menu image URL: {rec['menu_image_url']}"
        )
        assert "menu_items" in rec, f"Missing menu_items in {rec['name']}"
        assert len(rec["menu_items"]) >= 4, f"At least 4 dishes required for {rec['name']}"

        for dish in rec["menu_items"]:
            assert dish["name"].strip() != ""
            assert isinstance(dish["price"], int)
            assert dish["price"] >= 0
            assert dish.get("description", "").strip() != ""

        assert "price_range_display" in rec
        assert "₫" in rec["price_range_display"]

    # Specific check for Mì Quảng Bà Mua (captured directly from Google Maps)
    p0 = records[0]
    assert p0["id"] == "food-01"
    assert p0["name"] == "Mì Quảng Bà Mua"
    assert p0["menu_image_url"] == "/images/menus/mi-quang-ba-mua-menu.jpg"
    dish_names = [d["name"] for d in p0["menu_items"]]
    assert "Mỳ Quảng Tôm Thịt" in dish_names
    assert "Mỳ Quảng Thập Cẩm" in dish_names

