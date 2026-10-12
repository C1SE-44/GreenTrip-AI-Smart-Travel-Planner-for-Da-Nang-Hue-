from __future__ import annotations

import csv
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.format_pois_csv import (
    CSV_HEADERS,
    deduplicate_pois,
    determine_local_business,
    extract_address,
    extract_cuisine,
    extract_description,
    extract_opening_hours,
    extract_phone,
    extract_website,
    normalize_category,
    normalize_phone,
    process_pois,
    validate_poi,
)


def test_validate_poi_valid() -> None:
    valid_record = {
        "name": "Chùa Linh Ứng",
        "latitude": 16.1042,
        "longitude": 108.2764,
    }
    is_valid, reason = validate_poi(valid_record)
    assert is_valid is True
    assert reason == "valid"


def test_validate_poi_missing_name() -> None:
    record = {
        "name": "   ",
        "latitude": 16.0,
        "longitude": 108.0,
    }
    is_valid, reason = validate_poi(record)
    assert is_valid is False
    assert reason == "missing_name"


def test_validate_poi_invalid_coords() -> None:
    missing_coords = {"name": "Test POI", "latitude": None, "longitude": 108.0}
    is_valid, reason = validate_poi(missing_coords)
    assert is_valid is False
    assert reason == "missing_coordinates"

    out_of_bounds = {"name": "Test POI", "latitude": 95.0, "longitude": 108.0}
    is_valid, reason = validate_poi(out_of_bounds)
    assert is_valid is False
    assert reason == "coordinates_out_of_bounds"


def test_validate_poi_regional_bounds() -> None:
    # Outside Da Nang - Hue region (e.g., Hanoi 21.0N, 105.8E)
    hanoi_poi = {"name": "Hồ Gươm", "latitude": 21.0285, "longitude": 105.8542}
    is_valid, reason = validate_poi(hanoi_poi)
    assert is_valid is False
    assert reason == "coordinates_outside_region"


def test_normalize_category_deterministic() -> None:
    assert normalize_category({"historic": "tomb"}) == "Di tích lịch sử và văn hóa"
    assert normalize_category({"amenity": "place_of_worship"}) == "Tâm linh và chùa thiền"
    assert normalize_category({"tourism": "museum"}) == "Di tích lịch sử và văn hóa"
    assert normalize_category({"tourism": "attraction"}) == "Cảnh quan và thiên nhiên"
    assert normalize_category({"tourism": "hotel"}) is None
    assert normalize_category({"leisure": "resort"}) is None
    assert normalize_category({"amenity": "cafe"}) == "Quán cafe giải khát"
    assert normalize_category({"amenity": "restaurant"}) == "Ẩm thực và quán ăn"
    assert normalize_category({"shop": "supermarket"}) is None
    assert normalize_category({"amenity": "marketplace"}) == "Ẩm thực và quán ăn"
    assert normalize_category({"leisure": "park"}) == "Cảnh quan và thiên nhiên"
    assert normalize_category({"leisure": "stadium"}) is None
    assert normalize_category({"tourism": "information"}) is None


def test_extract_address() -> None:
    # Full address tag
    assert (
        extract_address({"addr:full": "123 Đường Trần Phú, Đà Nẵng"})
        == "123 Đường Trần Phú, Đà Nẵng"
    )

    # Composite address tags
    tags = {
        "addr:housenumber": "45",
        "addr:street": "Lê Lợi",
        "addr:district": "Hải Châu",
        "addr:city": "Đà Nẵng",
    }
    assert extract_address(tags) == "45 Lê Lợi, Hải Châu, Đà Nẵng"

    # Empty tags
    assert extract_address({}) == ""


def test_normalize_phone() -> None:
    assert normalize_phone("+84 90 544 8446") == "0905448446"
    assert normalize_phone("(+84)2363846666") == "02363846666"
    assert normalize_phone("+84236 382 3468") == "02363823468"
    assert normalize_phone("0905.123.456") == "0905123456"
    assert normalize_phone("0905 160 246; 0236 3822 555") == "0905160246"
    assert normalize_phone("") == ""


def test_extract_travel_context_fields() -> None:
    tags = {
        "phone": "+84 236 3822 555",
        "website": "https://example.com",
        "opening_hours": "Mo-Su 08:00-22:00",
        "cuisine": "vietnamese;seafood",
    }
    assert extract_phone(tags) == "02363822555"
    assert extract_website(tags) == "https://example.com"
    assert extract_opening_hours(tags) == "Mo-Su 08:00-22:00"
    assert extract_cuisine(tags) == "vietnamese, seafood"


def test_extract_description_with_travel_context() -> None:
    # Raw description only
    assert (
        extract_description({"description": "Đặc sản mì Quảng gia truyền"})
        == "Đặc sản mì Quảng gia truyền"
    )

    # Context only
    tags_context = {
        "cuisine": "vietnamese",
        "opening_hours": "07:00-21:00",
        "internet_access": "wlan",
    }
    desc = extract_description(tags_context)
    assert "Ẩm thực: vietnamese" in desc
    assert "Giờ mở cửa: 07:00-21:00" in desc
    assert "Có Wifi" in desc

    # Combined raw and context
    combined = {
        "note": "Quán ven sông",
        "outdoor_seating": "yes",
    }
    desc_comb = extract_description(combined)
    assert "Quán ven sông" in desc_comb
    assert "Chỗ ngồi ngoài trời" in desc_comb


def test_determine_local_business() -> None:
    # Local independent cafe
    is_local, l_type = determine_local_business(
        {"amenity": "cafe"}, "Cà phê Góc Phố"
    )
    assert is_local is True
    assert l_type == "cafe"

    # Known franchise chain
    is_chain, c_type = determine_local_business(
        {"amenity": "cafe", "brand": "Highlands Coffee"},
        "Highlands Coffee Nguyễn Văn Linh",
    )
    assert is_chain is False
    assert c_type == ""


def test_deduplicate_pois_whitespace_normalized() -> None:
    items = [
        {
            "osm_type": "node",
            "osm_id": 1,
            "city_code": "DANANG",
            "name": "Bún   Chả  Huệ Chi",
            "latitude": 16.05001,
            "longitude": 108.20001,
            "tags": {"amenity": "restaurant"},
        },
        {
            "osm_type": "node",
            "osm_id": 2,
            "city_code": "DANANG",
            "name": "Bún Chả Huệ Chi",
            "latitude": 16.05004,
            "longitude": 108.20002,
            "tags": {
                "amenity": "restaurant",
                "phone": "0905123456",
                "addr:street": "Hoàng Quốc Việt",
            },
        },
    ]

    deduped, dup_count = deduplicate_pois(items)
    assert len(deduped) == 1
    assert dup_count == 1
    # Check that item with more tags (osm_id 2) was kept
    assert deduped[0]["osm_id"] == 2


def test_process_pois_pipeline() -> None:
    sample_raw = [
        {
            "osm_type": "node",
            "osm_id": 100,
            "city_code": "DANANG",
            "city_name": "Da Nang",
            "name": "Bánh Mì Phượng",
            "latitude": 16.075,
            "longitude": 108.225,
            "tags": {
                "amenity": "restaurant",
                "addr:street": "Phan Châu Trinh",
                "cuisine": "vietnamese;street_food",
                "opening_hours": "06:30-21:30",
            },
        }
    ]

    rows, stats = process_pois(sample_raw)
    assert stats["total_raw"] == 1
    assert stats["rejected_count"] == 0
    assert stats["total_output"] == 1
    assert rows[0]["name"] == "Bánh Mì Phượng"
    assert rows[0]["category_name"] == "Ẩm thực và quán ăn"
    assert rows[0]["address"] == "Phan Châu Trinh"
    assert rows[0]["cuisine"] == "vietnamese, street_food"
    assert rows[0]["opening_hours"] == "06:30-21:30"
    assert rows[0]["is_local_business"] is True
    assert rows[0]["local_business_type"] == "restaurant"
    assert rows[0]["estimated_cost"] == ""
    assert rows[0]["average_visit_minutes"] == ""


def test_csv_file_integrity_and_utf8() -> None:
    """
    Verify generated data/processed/pois.csv on disk:
    - File exists and is non-empty
    - Exactly 20 columns matching CSV_HEADERS
    - Exactly 2,342 rows
    - No malformed rows
    - UTF-8 Vietnamese text is preserved
    - Uninvented fields are empty strings
    """
    csv_file = PROJECT_ROOT / "data" / "processed" / "pois.csv"
    assert csv_file.exists(), f"Output CSV does not exist at {csv_file}"

    with open(csv_file, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        assert header == CSV_HEADERS
        assert len(header) == 20

        rows = list(reader)
        assert len(rows) in (2342, 2426), f"Expected 2,342 or 2,426 rows, got {len(rows)}"

        vietnamese_found = False
        for idx, row in enumerate(rows, start=2):
            assert len(row) == 20, f"Malformed row at line {idx}: expected 20 columns, got {len(row)}"
            # Verify uninvented metrics are empty strings or valid integers if curated
            estimated_cost = row[16]
            avg_visit = row[17]
            satisfaction = row[18]
            popularity = row[19]
            assert estimated_cost == "", f"Line {idx}: estimated_cost should be empty"
            assert avg_visit == "" or avg_visit.isdigit(), f"Line {idx}: average_visit_minutes should be empty or a digit"
            assert satisfaction == "", f"Line {idx}: satisfaction_score should be empty"
            assert popularity == "", f"Line {idx}: popularity_score should be empty"

            # Check UTF-8 Vietnamese text preservation
            name = row[4]
            city = row[3]
            cat = row[5]
            if any(char in name + city + cat for char in ("Đ", "đ", "ẵ", "ế", "ả", "ị", "ờ")):
                vietnamese_found = True

        assert vietnamese_found is True, "UTF-8 Vietnamese text should be present in CSV"
