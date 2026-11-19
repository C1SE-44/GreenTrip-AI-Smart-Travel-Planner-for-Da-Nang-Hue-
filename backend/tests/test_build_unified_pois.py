"""Tests for unified MindTrip/Wanderlog POI CSV builder and importer dry-run parser."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.build_unified_pois_csv import (
    consolidate_nearby_brand_and_condo_duplicates,
    deduplicate_against_existing_pois,
    deterministic_stay_uuid,
    filter_mindtrip_verified_stays,
    stay_to_unified_row,
    validate_unified_records,
    write_unified_csv,
)
from scripts.import_unified_pois import load_unified_csv


def _sample_stay(name: str, lat: float, lon: float, sub: str = "hotel", reviews: int = 25, pid: str = "ChIJ1"):
    return {
        "name": name,
        "category": "Lưu trú và nghỉ dưỡng",
        "sub_category": sub,
        "city_code": "DANANG",
        "city_name": "Da Nang",
        "city_display": "Đà Nẵng",
        "locality": "Hải Châu",
        "latitude": lat,
        "longitude": lon,
        "address": "10 Bạch Đằng, Hải Châu, Đà Nẵng",
        "phone_number": "+84 905 959 366",
        "website_url": None,
        "social_links": {"google_maps": "https://www.google.com/maps/place/x"},
        "image_url": "https://lh3.googleusercontent.com/p/abc=w1200-h800-k-no",
        "gallery_urls": ["https://lh3.googleusercontent.com/p/abc=w1200-h800-k-no"],
        "estimated_cost": 550000,
        "budget_tier": "$$",
        "average_visit_minutes": 720,
        "satisfaction_score": 4.5,
        "popularity_score": 2.1,
        "green_score": 0.65,
        "is_local_business": True,
        "local_business_type": "local_hotel",
        "vibes": ["Tiện nghi"],
        "best_time": ["evening", "night"],
        "eco_features": ["Ủng hộ cơ sở lưu trú địa phương"],
        "ai_metadata": {
            "place_id": pid,
            "merged_place_ids": [],
            "dedup_key": f"k_{pid}",
            "raw_rating": 4.5,
            "review_count": reviews,
            "google_maps_url": "https://www.google.com/maps/place/x",
            "verification_status": "VERIFIED_ACTIVE",
            "cleaning_rules_applied": [],
        },
    }


def test_mindtrip_gate_filters_unreviewed_and_missing_photos():
    s_ok = _sample_stay("Good Hotel", 16.07, 108.22, reviews=10, pid="p1")
    s_zero = _sample_stay("Zero Rev", 16.07, 108.22, reviews=0, pid="p2")
    s_partial = _sample_stay("Partial", 16.07, 108.22, reviews=5, pid="p3")
    s_partial["ai_metadata"]["verification_status"] = "VERIFIED_PARTIAL"
    s_noimg = _sample_stay("No Img", 16.07, 108.22, reviews=5, pid="p4")
    s_noimg["image_url"] = None

    kept, dropped = filter_mindtrip_verified_stays([s_ok, s_zero, s_partial, s_noimg])
    assert len(kept) == 1 and kept[0]["name"] == "Good Hotel"
    assert dropped["zero_reviews"] == 1
    assert dropped["status:VERIFIED_PARTIAL"] == 1
    assert dropped["missing_verified_image"] == 1


def test_brand_dedup_keeps_distinct_neighbors_and_branches():
    a = _sample_stay("Han Riverine Hotel", 16.0714, 108.2250, reviews=200, pid="p1")
    b = _sample_stay("Bamboo Green Riverside Hotel", 16.0715, 108.2251, reviews=150, pid="p2")
    c = _sample_stay("Win's Homestay", 16.0500, 108.2400, sub="homestay", reviews=40, pid="p3")
    d = _sample_stay("Win's Danang Homestay", 16.05003, 108.24002, sub="homestay", reviews=10, pid="p4")
    e = _sample_stay("Gold Lucky Homestay", 16.4600, 107.5900, sub="homestay", reviews=30, pid="p5")
    f = _sample_stay("Gold Lucky Homestay Cơ sở 2", 16.4602, 107.5902, sub="homestay", reviews=20, pid="p6")

    kept, merged = consolidate_nearby_brand_and_condo_duplicates([a, b, c, d, e, f])
    names = {r["name"] for r in kept}
    assert merged == 1
    assert "Han Riverine Hotel" in names and "Bamboo Green Riverside Hotel" in names
    assert "Win's Homestay" in names and "Win's Danang Homestay" not in names
    assert "Gold Lucky Homestay" in names and "Gold Lucky Homestay Cơ sở 2" in names


def test_cross_dedup_and_csv_roundtrip(tmp_path: Path):
    db_poi = stay_to_unified_row(_sample_stay("Hue Ecolodge", 16.44, 107.57, sub="eco_lodge", pid="db1"))
    db_poi["city_code"] = "HUE"
    db_poi["city_name"] = "Hue"
    db_poi["category"] = "Cảnh quan và thiên nhiên"
    db_poi["poi_id"] = "11111111-1111-1111-1111-111111111111"

    dup_stay = _sample_stay("Hue Ecolodge", 16.4401, 107.5701, sub="eco_lodge", pid="g1")
    dup_stay["city_code"] = "HUE"
    dup_stay["city_name"] = "Hue"
    new_stay = _sample_stay("Sanouva Danang Hotel", 16.068, 108.221, sub="hotel", pid="g2")

    non_overlap, cross = deduplicate_against_existing_pois([db_poi], [dup_stay, new_stay])
    assert len(cross) == 1
    assert len(non_overlap) == 1 and non_overlap[0]["name"] == "Sanouva Danang Hotel"

    rows = [db_poi, stay_to_unified_row(non_overlap[0])]
    assert validate_unified_records(rows) == []

    csv_path = tmp_path / "unified.csv"
    write_unified_csv(rows, csv_path)
    parsed = load_unified_csv(csv_path)
    assert len(parsed) == 2
    assert parsed[1].poi_id == deterministic_stay_uuid("g2", "k_g2")
    assert parsed[1].gallery_urls == ["https://lh3.googleusercontent.com/p/abc=w1200-h800-k-no"]
