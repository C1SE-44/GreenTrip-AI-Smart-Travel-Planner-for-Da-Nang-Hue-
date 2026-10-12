from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.audit_pois import build_quality_report, haversine_distance_meters


CSV_FIELDS = [
    "osm_type",
    "osm_id",
    "city_code",
    "city_name",
    "name",
    "category_name",
    "latitude",
    "longitude",
    "address",
    "description",
    "phone",
    "website",
    "opening_hours",
    "cuisine",
]


def write_fixture_files(tmp_path: Path) -> tuple[Path, Path]:
    csv_path = tmp_path / "pois.csv"
    raw_path = tmp_path / "osm_pois.json"

    rows = [
        {
            "osm_type": "node",
            "osm_id": "100",
            "city_code": "HUE",
            "city_name": "Hue",
            "name": "Lăng Tự Đức",
            "category_name": "Di tích lịch sử và văn hóa",
            "latitude": "16.4331813",
            "longitude": "107.5645857",
            "address": "",
            "description": "",
            "phone": "",
            "website": "",
            "opening_hours": "",
            "cuisine": "",
        },
        {
            "osm_type": "relation",
            "osm_id": "200",
            "city_code": "HUE",
            "city_name": "Hue",
            "name": "Lăng Tự Đức",
            "category_name": "Di tích lịch sử và văn hóa",
            "latitude": "16.4329409",
            "longitude": "107.5655529",
            "address": "Huế",
            "description": "",
            "phone": "",
            "website": "",
            "opening_hours": "",
            "cuisine": "",
        },
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    raw_data = {
        "source": {
            "provider": "OpenStreetMap",
            "license": "ODbL-1.0",
            "retrieved_at": "2026-10-01T00:00:00+00:00",
        },
        "count": 2,
        "pois": [
            {
                "osm_type": row["osm_type"],
                "osm_id": int(row["osm_id"]),
                "city_code": row["city_code"],
                "name": row["name"],
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "tags": {"historic": "monument", "name": row["name"]},
            }
            for row in rows
        ],
    }
    raw_path.write_text(
        json.dumps(raw_data, ensure_ascii=False),
        encoding="utf-8",
    )
    return csv_path, raw_path


def test_haversine_distance_returns_expected_short_distance() -> None:
    distance = haversine_distance_meters(16.4331813, 107.5645857, 16.4329409, 107.5655529)

    assert 100 < distance < 115


def test_audit_reports_missing_fields_and_non_destructive_duplicate_candidates(
    tmp_path: Path,
) -> None:
    csv_path, raw_path = write_fixture_files(tmp_path)
    report = build_quality_report(
        csv_path,
        raw_path,
        generated_at=datetime(2026, 10, 9, tzinfo=timezone.utc),
    )

    assert report["source"]["provider"] == "OpenStreetMap"
    assert report["source"]["age_days_at_generation"] == 8
    assert report["source"]["external_google_maps_api_check_performed"] is False
    assert report["summary"]["csv_rows"] == 2
    assert report["summary"]["raw_source_ids_not_in_csv"] == 0
    assert report["summary"]["csv_source_mismatches"] == 0
    assert report["summary"]["nearby_same_name_pairs_for_review"] == 1
    assert report["completeness"]["address"]["missing"] == 1
    assert report["possible_duplicates"][0]["review_status"] == "needs_manual_review"
    assert len(report["possible_duplicates"][0]["places"]) == 2
    assert len(report["review_queue"]) == 1


def test_audit_flags_csv_records_missing_from_raw_source(tmp_path: Path) -> None:
    csv_path, raw_path = write_fixture_files(tmp_path)
    raw_data = json.loads(raw_path.read_text(encoding="utf-8"))
    raw_data["pois"].pop()
    raw_path.write_text(json.dumps(raw_data, ensure_ascii=False), encoding="utf-8")

    report = build_quality_report(csv_path, raw_path)

    assert report["summary"]["csv_ids_missing_from_source"] == 1
    assert report["summary"]["csv_source_mismatches"] == 1
    assert (
        report["integrity_findings"]["csv_source_mismatches"][0]["reason"]
        == "missing_from_raw_source"
    )


def test_audit_rejects_csv_missing_required_columns(tmp_path: Path) -> None:
    csv_path = tmp_path / "pois.csv"
    raw_path = tmp_path / "osm_pois.json"
    csv_path.write_text("name,latitude,longitude\n", encoding="utf-8")
    raw_path.write_text('{"pois": []}', encoding="utf-8")

    try:
        build_quality_report(csv_path, raw_path)
    except ValueError as exc:
        assert "missing required columns" in str(exc)
    else:
        raise AssertionError("Expected malformed CSV header to fail the audit")
