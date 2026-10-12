from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.enrich_curated_pois import (
    clean_description,
    enrich_curated_pois,
    normalize_for_match,
    resolve_is_local_business,
    resolve_visit_minutes,
)


def test_clean_description_removes_citation_brackets() -> None:
    text_with_citations = "Là ngôi chùa 400 năm tuổi [1], bên dòng sông Hương thơ mộng [3], [4]."
    cleaned = clean_description(text_with_citations)
    assert "[1]" not in cleaned
    assert "[3]" not in cleaned
    assert "[4]" not in cleaned
    assert cleaned == "Là ngôi chùa 400 năm tuổi, bên dòng sông Hương thơ mộng."


def test_resolve_visit_minutes_heuristic() -> None:
    assert resolve_visit_minutes("60", "Di tích lịch sử và văn hóa", "Bảo tàng") == "60"
    assert resolve_visit_minutes("Not in source", "Tâm linh và chùa thiền", "Chùa Thiên Mụ") == "45"
    assert resolve_visit_minutes("Not in source", "Cảnh quan và thiên nhiên", "VinWonders") == "180"


def test_resolve_is_local_business_heuristic() -> None:
    assert resolve_is_local_business("True", "Ẩm thực và quán ăn", "Quán ăn") == "True"
    assert resolve_is_local_business("False", "Di tích lịch sử và văn hóa", "Bảo tàng") == "False"
    assert resolve_is_local_business("Not in source", "Quán cafe giải khát", "Cafe") == "True"
    assert resolve_is_local_business("Not in source", "Tâm linh và chùa thiền", "Chùa") == "False"


def test_normalize_for_match_handles_vietnamese_d() -> None:
    assert normalize_for_match("Bảo tàng Đà Nẵng") == "baotangdanang"
    assert normalize_for_match("Bao Tang Da Nang") == "baotangdanang"
    assert normalize_for_match("Chợ Cồn") == "chocon"
    assert normalize_for_match("Đồng Đình") == "dongdinh"


def test_enrich_curated_pois_workflow(tmp_path: Path) -> None:
    curated_csv = tmp_path / "curated.csv"
    processed_csv = tmp_path / "pois.csv"
    raw_json = tmp_path / "osm_pois.json"

    # 1. Existing POIs fixture: 1 item that matches ("Bảo tàng Đà Nẵng")
    existing_headers = [
        "osm_type", "osm_id", "city_code", "city_name", "name",
        "category_name", "latitude", "longitude", "address",
        "description", "phone", "website", "opening_hours", "cuisine",
        "is_local_business", "local_business_type", "estimated_cost",
        "average_visit_minutes", "satisfaction_score", "popularity_score",
    ]
    existing_rows = [
        {
            "osm_type": "node",
            "osm_id": "12345",
            "city_code": "DANANG",
            "city_name": "Da Nang",
            "name": "Bảo tàng Đà Nẵng",
            "category_name": "Di tích lịch sử và văn hóa",
            "latitude": "16.0754210",
            "longitude": "108.2227140",
            "address": "",
            "description": "Mô tả cũ sơ sài",
            "phone": "",
            "website": "",
            "opening_hours": "",
            "cuisine": "",
            "is_local_business": "False",
            "local_business_type": "bảo tàng",
            "estimated_cost": "",
            "average_visit_minutes": "",
            "satisfaction_score": "",
            "popularity_score": "",
        }
    ]
    with processed_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=existing_headers)
        writer.writeheader()
        writer.writerows(existing_rows)

    # 2. Raw JSON fixture
    raw_data = {
        "count": 1,
        "pois": [
            {
                "osm_type": "node",
                "osm_id": 12345,
                "city_code": "DANANG",
                "city_name": "Da Nang",
                "name": "Bảo tàng Đà Nẵng",
                "latitude": 16.075421,
                "longitude": 108.222714,
                "category_name": "Di tích lịch sử và văn hóa",
                "tags": {"name": "Bảo tàng Đà Nẵng", "tourism": "museum"},
            }
        ],
    }
    raw_json.write_text(json.dumps(raw_data, ensure_ascii=False), encoding="utf-8")

    # 3. Curated CSV fixture: 1 matching item + 1 new item ("Chùa Thiên Mụ")
    curated_rows = [
        [
            "Bảo tàng Đà Nẵng",
            "Da Nang",
            "Di tích lịch sử và văn hóa",
            "42 Bạch Đằng, Đà Nẵng",
            "Mô tả mới cực kỳ phong phú và chi tiết [1].",
            "60",
            "False",
            "bảo tàng",
            "[1]",
        ],
        [
            "Chùa Thiên Mụ",
            "Hue",
            "Tâm linh và chùa thiền",
            "Bên dòng sông Hương, Huế",
            "Ngôi chùa nổi tiếng tháp Phước Duyên [5].",
            "Not in source",
            "False",
            "chùa",
            "[5]",
        ],
    ]
    with curated_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(curated_rows)

    summary = enrich_curated_pois(
        curated_csv_path=curated_csv,
        processed_csv_path=processed_csv,
        raw_json_path=raw_json,
    )

    assert summary["curated_input_total"] == 2
    assert summary["existing_enriched"] == 1
    assert summary["newly_added"] == 1
    assert summary["total_pois_output"] == 2

    # Verify updated CSV on disk
    with processed_csv.open("r", encoding="utf-8") as f:
        results = list(csv.DictReader(f))

    # Check enriched item
    museum = next(p for p in results if p["name"] == "Bảo tàng Đà Nẵng")
    assert museum["description"] == "Mô tả mới cực kỳ phong phú và chi tiết."
    assert museum["address"] == "42 Bạch Đằng, Đà Nẵng"
    assert museum["average_visit_minutes"] == "60"

    # Check new item
    pagoda = next(p for p in results if p["name"] == "Chùa Thiên Mụ")
    assert pagoda["osm_type"] == "curated"
    assert pagoda["city_code"] == "HUE"
    assert pagoda["category_name"] == "Tâm linh và chùa thiền"
    assert pagoda["average_visit_minutes"] == "45"
    assert "[5]" not in pagoda["description"]
