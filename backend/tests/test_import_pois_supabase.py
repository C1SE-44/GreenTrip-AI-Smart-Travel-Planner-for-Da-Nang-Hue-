from __future__ import annotations

import csv
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.format_pois_csv import CSV_HEADERS
from scripts.import_pois_supabase import (
    VISIT_MINUTES_BY_CATEGORY,
    parse_poi_row,
    read_pois_csv,
)


def valid_csv_row(**overrides: str) -> dict[str, str]:
    row = dict.fromkeys(CSV_HEADERS, "")
    row.update(
        {
            "osm_type": "node",
            "osm_id": "12345",
            "city_code": "DANANG",
            "city_name": "Da Nang",
            "name": "Chùa Linh Ứng",
            "category_name": "Tâm linh và chùa thiền",
            "latitude": "16.1042",
            "longitude": "108.2764",
            "is_local_business": "False",
        }
    )
    row.update(overrides)
    return row


def test_parse_poi_row_maps_types_and_category_baseline() -> None:
    record = parse_poi_row(valid_csv_row(), line_number=2)

    assert record.city_code == "DANANG"
    assert record.latitude == 16.1042
    assert record.longitude == 108.2764
    assert record.average_visit_minutes == 45
    assert record.is_local_business is False


def test_parse_poi_row_uses_explicit_visit_minutes_when_present() -> None:
    record = parse_poi_row(
        valid_csv_row(average_visit_minutes="75"),
        line_number=2,
    )

    assert record.average_visit_minutes == 75


def test_parse_poi_row_rejects_unknown_category_without_baseline() -> None:
    with pytest.raises(ValueError, match="no visit-duration baseline"):
        parse_poi_row(valid_csv_row(category_name="Unknown"), line_number=2)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("latitude", "not-a-number", "must be numbers"),
        ("longitude", "181", "coordinates must be finite"),
        ("is_local_business", "yes", "must be True or False"),
        ("average_visit_minutes", "-1", "between 0 and 32767"),
        ("satisfaction_score", "101", "must not exceed 100"),
    ],
)
def test_parse_poi_row_rejects_invalid_values(
    field: str,
    value: str,
    message: str,
) -> None:
    with pytest.raises(ValueError, match=message):
        parse_poi_row(valid_csv_row(**{field: value}), line_number=2)


def test_read_pois_csv_rejects_header_mismatch(tmp_path: Path) -> None:
    csv_path = tmp_path / "bad.csv"
    csv_path.write_text("name,latitude,longitude\n", encoding="utf-8")

    with pytest.raises(ValueError, match="header does not match"):
        read_pois_csv(csv_path)


def test_read_pois_csv_rejects_duplicate_osm_identifiers(tmp_path: Path) -> None:
    csv_path = tmp_path / "duplicates.csv"
    row = valid_csv_row()
    with csv_path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_HEADERS)
        writer.writeheader()
        writer.writerow(row)
        writer.writerow(row)

    with pytest.raises(ValueError, match="duplicate OSM identifier"):
        read_pois_csv(csv_path)


def test_visit_baselines_cover_every_csv_category() -> None:
    assert set(VISIT_MINUTES_BY_CATEGORY) == {
        "Ẩm thực và quán ăn",
        "Quán cafe giải khát",
        "Di tích lịch sử và văn hóa",
        "Cảnh quan và thiên nhiên",
        "Tâm linh và chùa thiền",
    }
