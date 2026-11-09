from decimal import Decimal
import json
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.upsert_nature_heritage_phase2 import (
    PHASE2_JSON_PATH,
    compute_nature_heritage_green_score,
    haversine_meters,
    match_existing_poi,
    normalize_vn_name,
    parse_estimated_cost_and_tier,
    strip_accents,
    upsert_nature_heritage_phase2,
)


def test_phase2_json_dataset_integrity() -> None:
    assert Path(PHASE2_JSON_PATH).exists(), "Phase 2 JSON dataset must exist"
    records = json.loads(Path(PHASE2_JSON_PATH).read_text(encoding="utf-8"))
    assert len(records) == 97, f"Expected 97 Phase 2 establishments, got {len(records)}"

    codes = set()
    for rec in records:
        assert rec["id"].startswith("eco-"), f"Invalid ID format: {rec['id']}"
        assert rec["id"] not in codes, f"Duplicate ID: {rec['id']}"
        codes.add(rec["id"])

        assert rec["name"].strip() != ""
        assert rec["city"] in ("Đà Nẵng", "Huế")
        assert 15.5 <= float(rec["latitude"]) <= 16.8
        assert 107.0 <= float(rec["longitude"]) <= 108.6
        assert len(rec["gallery_urls"]) == 5
        assert len(rec["sample_reviews"]) >= 2
        assert rec["rating"] >= 4.0
        assert rec["db_category"] in (
            "Cảnh quan và thiên nhiên",
            "Di tích lịch sử và văn hóa",
            "Tâm linh & Tôn giáo",
        )


def test_parse_estimated_cost_and_tier_nature() -> None:
    # Free admission
    cost_free, tier_free = parse_estimated_cost_and_tier("Miễn phí", "beach")
    assert cost_free == Decimal(0)
    assert tier_free == "$"

    # Ticket entry
    cost_ticket, tier_ticket = parse_estimated_cost_and_tier("200.000đ/vé người lớn", "heritage")
    assert cost_ticket == Decimal(200000)
    assert tier_ticket == "$$"

    # Cable car / Resort
    cost_resort, tier_resort = parse_estimated_cost_and_tier("Từ 2.500.000đ/đêm", "eco_resort")
    assert cost_resort == Decimal(2500000)
    assert tier_resort == "$$$$"


def test_compute_nature_heritage_green_score() -> None:
    eco_park = {
        "is_vegetarian_friendly": True,
        "is_zero_waste_friendly": True,
        "sub_category": "national_park",
        "eco_highlights": "Vườn quốc gia nguyên sinh bảo tồn đa dạng sinh học UNESCO",
    }
    score = compute_nature_heritage_green_score(eco_park)
    assert score >= 0.95

    standard_attraction = {
        "is_vegetarian_friendly": False,
        "is_zero_waste_friendly": False,
        "sub_category": "market",
        "eco_highlights": "Chợ truyền thống lâu đời",
    }
    assert compute_nature_heritage_green_score(standard_attraction) == 0.70


def test_matching_preserves_existing_poi_and_isolates_cities() -> None:
    existing = [
        {
            "poi_id": "11111111-1111-1111-1111-111111111111",
            "name": "Chùa Thiên Mụ (Linh Mụ Tự)",
            "city_name": "Hue",
            "latitude": 16.469712,
            "longitude": 107.548912,
            "eco_place_code": None,
        },
        {
            "poi_id": "22222222-2222-2222-2222-222222222222",
            "name": "Chùa Linh Ứng Bãi Bụt",
            "city_name": "Da Nang",
            "latitude": 16.104567,
            "longitude": 108.278912,
            "eco_place_code": None,
        },
    ]

    # Exact / Core match in Hue -> matches Thien Mu
    cand_thien_mu = {
        "id": "eco-62",
        "name": "Chùa Thiên Mụ",
        "city": "Huế",
        "latitude": 16.469712,
        "longitude": 107.548912,
    }
    assert match_existing_poi(cand_thien_mu, existing) == "11111111-1111-1111-1111-111111111111"

    # City isolation: Same or similar name in wrong city should NOT match
    cand_wrong_city = {
        "id": "eco-62",
        "name": "Chùa Thiên Mụ",
        "city": "Đà Nẵng",
        "latitude": 16.069712,
        "longitude": 108.248912,
    }
    assert match_existing_poi(cand_wrong_city, existing) is None

    # New item not in DB -> returns None
    cand_new = {
        "id": "eco-01",
        "name": "Bãi Biển Hoang Sơ Lạ",
        "city": "Đà Nẵng",
        "latitude": 16.123456,
        "longitude": 108.123456,
    }
    assert match_existing_poi(cand_new, existing) is None


def test_dry_run_idempotency_against_db() -> None:
    """Verifies that running dry-run does not crash and processes all 97 items."""
    result = upsert_nature_heritage_phase2(live_commit=False)
    assert result["total_processed"] == 97
    assert result["updated_count"] + result["inserted_count"] == 97
    assert result["live_commit"] is False
