from pathlib import Path
import sys

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.enrich_with_curated_339 import (
    build_rich_description,
    clean_opening_hours,
    enrich_pois,
    parse_numeric_cost,
    parse_primary_address,
)


def test_parse_numeric_cost_handles_various_formats():
    assert parse_numeric_cost("Miễn phí (Free Entry)") == "0"
    assert parse_numeric_cost("Khoảng 45.000 – 70.000 VNĐ/người") == "60000"
    assert parse_numeric_cost("25.000 – 45.000 VNĐ/người") == "35000"
    assert parse_numeric_cost("200.000 VNĐ/vé người lớn") == "200000"
    assert parse_numeric_cost("") == ""
    assert parse_numeric_cost("Liên hệ") == ""


def test_clean_opening_hours_strips_periods():
    assert clean_opening_hours("07:00 – 22:00.") == "07:00 – 22:00"
    assert clean_opening_hours("06:30 – 21:30") == "06:30 – 21:30"
    assert clean_opening_hours("") == ""


def test_parse_primary_address_extracts_first_branch():
    single = parse_primary_address("113/3 Nguyễn Chí Thanh, Hải Châu, Đà Nẵng")
    assert single == "113/3 Nguyễn Chí Thanh, Hải Châu, Đà Nẵng"

    multi = parse_primary_address("441 Ông Ích Khiêm, Hải Châu / 212 Bạch Đằng, Hải Châu / 177 Hồ Nghinh")
    assert multi == "441 Ông Ích Khiêm, Hải Châu"


def test_build_rich_description_combines_sections():
    desc = build_rich_description(
        curated_desc="Quán gia truyền 30 năm.",
        services_or_menu="Bún chả cá: 35.000 VNĐ",
        price_level="Bình dân",
        other_details="Nên ghé buổi sáng.",
    )
    assert "Quán gia truyền 30 năm." in desc
    assert "[Menu / Dịch vụ & Giá vé]: Bún chả cá: 35.000 VNĐ" in desc
    assert "[Mức giá tham khảo]: Bình dân" in desc
    assert "[Lưu ý / Kinh nghiệm]: Nên ghé buổi sáng." in desc


def test_enrich_pois_generates_preview_and_catalog(tmp_path: Path):
    match_report = BACKEND_ROOT.parent / "data" / "processed" / "curated_339_match_report.json"
    curated_csv = BACKEND_ROOT.parent / "data" / "raw" / "curated_pois_339.csv"
    existing_pois = BACKEND_ROOT.parent / "data" / "processed" / "pois.csv"

    test_out_csv = tmp_path / "test_pois_enriched.csv"
    test_out_json = tmp_path / "test_preview.json"
    test_coords_cat = tmp_path / "test_coords.json"

    res = enrich_pois(
        match_report_path=match_report,
        curated_csv_path=curated_csv,
        existing_pois_path=existing_pois,
        output_enriched_csv=test_out_csv,
        output_preview_json=test_out_json,
        output_coords_catalog=test_coords_cat,
        overwrite_original=False,
    )

    assert res["enriched_count"] == 62
    assert test_out_csv.exists()
    assert test_out_json.exists()
    assert test_coords_cat.exists()
    assert res["verified_coords_count"] == 170
    assert res["pending_coords_count"] == 169
