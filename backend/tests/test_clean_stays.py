"""Tests for database-standard stay filtering, normalization, and deduplication."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.clean_and_verify_stays import (
    classify_budget_tier,
    clean_website_and_socials,
    consolidate_room_variants,
    evaluate_stay_eligibility,
    map_sub_category,
    parse_price_vnd,
    parse_rating,
    parse_review_count,
    recover_raw_category,
    validate_db_constraints,
)


def _base_raw(**overrides):
    rec = {
        "place_id": "ChIJtest1",
        "place_name": "Green Homestay",
        "city": "Đà Nẵng",
        "locality": "Hải Châu",
        "raw_address": "10 Bạch Đằng, Hải Châu, Đà Nẵng, Việt Nam",
        "raw_phone": "+84 905 959 366",
        "raw_website_url": None,
        "raw_category": "Lưu trú nhà dân",
        "raw_rating": "4,6",
        "raw_review_count": "120",
        "raw_price": "450.000 ₫",
        "raw_place_panel_text": "",
        "latitude": 16.071,
        "longitude": 108.225,
        "google_maps_url": "https://www.google.com/maps/place/Green+Homestay",
        "image_url": "https://lh3.googleusercontent.com/p/abc=w1200-h800-k-no",
        "gallery_urls": ["https://lh3.googleusercontent.com/p/abc=w1200-h800-k-no"],
    }
    rec.update(overrides)
    return rec


def test_recover_raw_category_handles_booking_labels():
    r1 = _base_raw(raw_category=None, raw_place_panel_text="4,5\n(88)·Khách sạn 3 sao\nTổng quan")
    assert recover_raw_category(r1) == "Khách sạn 3 sao"

    r2 = _base_raw(raw_category=None, raw_place_panel_text="Sami\nNhà/căn hộ du lịch\nDành cho 4 người")
    assert recover_raw_category(r2) == "Nhà/căn hộ du lịch"

    r3 = _base_raw(raw_category="Cách 1,1 km", raw_place_panel_text="")
    assert recover_raw_category(r3) is None


def test_map_sub_category_preserves_lodge_and_extracts_stars():
    sub, stars = map_sub_category("Khách sạn 4 sao", "Royal Hotel")
    assert sub == "hotel" and stars == 4

    sub, stars = map_sub_category("Nhà nghỉ trượt tuyết", "Nhà Nghỉ Hà Châu")
    assert sub == "guesthouse" and stars is None

    sub, _ = map_sub_category("Nhà/căn hộ du lịch", "Sami Homestay")
    assert sub == "homestay"


def test_clean_website_separates_official_ota_social_and_spam():
    web, soc, _ = clean_website_and_socials("https://br.bluepillow.com/deal/123", "https://maps.google.com/?q=1")
    assert web is None and "booking" not in soc

    web, soc, _ = clean_website_and_socials("https://www.booking.com/hotel/vn/abc.html?utm_source=x", None)
    assert web is None and soc["booking"].startswith("https://www.booking.com/")

    web, soc, _ = clean_website_and_socials("https://m.facebook.com/myhomestay?fbclid=123", None)
    assert web is None and soc["facebook"] == "https://www.facebook.com/myhomestay"

    web, _, _ = clean_website_and_socials("https://mikazuki.com.vn/?utm_medium=maps", None)
    assert web == "https://mikazuki.com.vn/"


def test_eligibility_drops_centroid_residential_and_keeps_valid_beach_stay():
    centroid = _base_raw(place_name="ดานัง", raw_address="333C+QMQ, Bà Nà, Đà Nẵng, Việt Nam", latitude=16.0544563, longitude=108.0717219)
    ok, reason = evaluate_stay_eligibility(centroid, "Khách sạn")
    assert not ok and reason == "city_centroid_placeholder_pin"

    condo = _base_raw(place_name="Chung cư Nam Cầu Trần Thị Lý", raw_category="Chung cư")
    ok, _ = evaluate_stay_eligibility(condo, "Chung cư")
    assert not ok

    valid_beach = _base_raw(place_name="Sea home 2 bedroom at Mỹ Khê Beach", raw_category="Căn hộ")
    ok, reason = evaluate_stay_eligibility(valid_beach, "Căn hộ")
    assert ok and reason is None


def test_parsers_and_room_variant_consolidation():
    assert parse_rating("4,7") == 4.7
    assert parse_review_count("1.234") == 1234
    assert parse_review_count("1,5 N") == 1500
    assert parse_price_vnd("200.432 ₫") == 200432
    assert classify_budget_tier(200432, "hotel", 3) == "$"
    assert classify_budget_tier(950000, "hotel", 3) == "$$"
    assert classify_budget_tier(2500000, "resort", 5) == "$$$"

    root = {
        "name": "Banana Flower Homestay",
        "city_code": "DANANG",
        "latitude": 16.0785,
        "longitude": 108.2191,
        "estimated_cost": 400000,
        "budget_tier": "$",
        "satisfaction_score": 4.5,
        "popularity_score": 2.0,
        "phone_number": None,
        "website_url": None,
        "image_url": "https://lh3.googleusercontent.com/p/1=w1200-h800-k-no",
        "gallery_urls": ["https://lh3.googleusercontent.com/p/1=w1200-h800-k-no"],
        "ai_metadata": {
            "place_id": "p1",
            "review_count": 20,
            "dedup_key": "bananaflower_16.078_108.219",
            "cleaning_rules_applied": [],
        },
    }
    variant = {
        **root,
        "name": "Banana Flower Homestay - Studio with Balcony",
        "estimated_cost": 550000,
        "image_url": "https://lh3.googleusercontent.com/p/2=w1200-h800-k-no",
        "gallery_urls": ["https://lh3.googleusercontent.com/p/2=w1200-h800-k-no"],
        "ai_metadata": {
            "place_id": "p2",
            "review_count": 5,
            "dedup_key": "bananaflowerstudio_16.078_108.219",
            "cleaning_rules_applied": [],
        },
    }
    consolidated, merged_count = consolidate_room_variants([root, variant])
    assert merged_count == 1
    assert len(consolidated) == 1
    assert consolidated[0]["estimated_cost"] == 400000
    assert consolidated[0]["ai_metadata"]["max_price_vnd"] == 550000
    assert len(consolidated[0]["gallery_urls"]) == 2
    assert validate_db_constraints(consolidated) == []
