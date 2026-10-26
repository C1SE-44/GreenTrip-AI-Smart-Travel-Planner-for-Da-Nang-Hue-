from pathlib import Path
import sys

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.profile_and_match_curated import (
    clean_place_name,
    extract_meaningful_tokens,
    normalize_text,
    parse_branches,
    profile_and_match,
)


def test_clean_place_name_removes_awards_and_suffixes():
    assert clean_place_name("Bún Chả Cá Hờn (Đạt giải MICHELIN Bib Gourmand)") == "Bún Chả Cá Hờn"
    assert clean_place_name("Mì Quảng Ếch – Bếp Trang") == "Mì Quảng Ếch"
    assert clean_place_name("Cà phê Muối (Chi nhánh chính)") == "Cà phê Muối"


def test_normalize_text_removes_diacritics_and_spaces():
    assert normalize_text("Đà Nẵng") == "danang"
    assert normalize_text("Bảo tàng Mỹ thuật") == "baotangmythuat"


def test_extract_meaningful_tokens_removes_generic_words():
    tokens = extract_meaningful_tokens("Nhà hàng Bún thịt nướng Bà Dưỡng")
    assert "ba" in tokens
    assert "duong" in tokens
    assert "nha" not in tokens
    assert "hang" not in tokens


def test_parse_branches_detects_multiple_locations():
    single = parse_branches("123 Lê Duẩn, Hải Châu, Đà Nẵng")
    assert len(single) == 1
    assert single[0] == "123 Lê Duẩn, Hải Châu, Đà Nẵng"

    multi = parse_branches("441 Ông Ích Khiêm, Hải Châu / 212 Bạch Đằng, Hải Châu / 177 Hồ Nghinh, Sơn Trà")
    assert len(multi) == 3
    assert multi[0] == "441 Ông Ích Khiêm, Hải Châu"
    assert multi[1] == "212 Bạch Đằng, Hải Châu"
    assert multi[2] == "177 Hồ Nghinh, Sơn Trà"


def test_profile_and_match_dry_run_generates_valid_report(tmp_path: Path):
    curated_csv = BACKEND_ROOT.parent / "data" / "raw" / "curated_pois_339.csv"
    existing_csv = BACKEND_ROOT.parent / "data" / "processed" / "pois.csv"
    report_output = tmp_path / "test_report.json"

    report = profile_and_match(
        curated_csv_path=curated_csv,
        existing_csv_path=existing_csv,
        report_output_path=report_output,
    )

    assert report["report_metadata"]["total_curated_records"] == 339
    assert report["report_metadata"]["total_existing_pois"] == 2426
    summary = report["summary"]
    assert summary["by_status"]["UPDATE_CANDIDATE"] == 62
    assert summary["by_status"]["POSSIBLE_DUPLICATE"] == 108
    assert summary["by_status"]["NEW_CANDIDATE_NEEDS_COORDINATES"] == 169
    assert summary["by_city"]["Đà Nẵng"] == 170
    assert summary["by_city"]["Huế"] == 169
    assert summary["multi_branch_venues_count"] == 40
    assert report_output.exists()
