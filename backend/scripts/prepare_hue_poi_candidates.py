#!/usr/bin/env python3
"""Prepare reviewable, incremental Hue POI data from an Overpass export.

This script only writes local CSV/Markdown artifacts. It never writes to a database.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.format_pois_csv import (  # noqa: E402
    CSV_HEADERS,
    extract_address,
    extract_opening_hours,
    extract_phone,
    extract_website,
    normalize_category,
    process_pois,
)

DEFAULT_INPUT = PROJECT_ROOT / "data/raw/hue_overpass_export_2026-11-15.json"
DEFAULT_EXISTING_RAW = PROJECT_ROOT / "data/raw/osm_pois.json"
DEFAULT_EXISTING_CSV = PROJECT_ROOT / "data/processed/pois.csv"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data/processed"
DEFAULT_REPORT_DIR = PROJECT_ROOT / "data/reports"

LODGING_TYPES = {
    "hotel",
    "guest_house",
    "hostel",
    "motel",
    "resort",
    "apartment",
    "camp_site",
    "chalet",
    "alpine_hut",
}

POI_EXTRA_HEADERS = [
    "name_vi",
    "name_en",
    "contact_email",
    "contact_link",
    "image_url",
    "image_reference",
    "wikidata_id",
    "source_provider",
    "source_license",
    "source_url",
    "source_updated_at",
    "raw_tags_json",
]

LODGING_HEADERS = [
    "osm_type",
    "osm_id",
    "city_code",
    "city_name",
    "name",
    "name_vi",
    "name_en",
    "accommodation_type",
    "homestay_in_name",
    "latitude",
    "longitude",
    "address",
    "phone",
    "website",
    "contact_email",
    "contact_link",
    "opening_hours",
    "image_url",
    "image_reference",
    "wikidata_id",
    "source_provider",
    "source_license",
    "source_url",
    "source_updated_at",
    "source_status",
    "database_status",
    "raw_tags_json",
]

DUPLICATE_HEADERS = [
    *CSV_HEADERS,
    "existing_name",
    "existing_osm_type",
    "existing_osm_id",
    "distance_meters",
    "review_reason",
]


def _osm_key(record: dict[str, Any]) -> tuple[str, str]:
    return str(record.get("osm_type", "")), str(record.get("osm_id", ""))


def _normalize_name(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).lower().split())


def _element_coordinates(element: dict[str, Any]) -> tuple[float, float] | None:
    if element.get("type") == "node":
        latitude, longitude = element.get("lat"), element.get("lon")
    else:
        center = element.get("center") or {}
        latitude, longitude = center.get("lat"), center.get("lon")
    try:
        latitude, longitude = float(latitude), float(longitude)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        return None
    return latitude, longitude


def _convert_elements(elements: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    converted: dict[tuple[str, str], dict[str, Any]] = {}
    invalid_or_outside = 0
    for element in elements:
        tags = element.get("tags") or {}
        name = str(tags.get("name", "")).strip()
        coordinates = _element_coordinates(element)
        if not name or coordinates is None:
            invalid_or_outside += 1
            continue
        osm_type, osm_id = str(element.get("type", "")), str(element.get("id", ""))
        if not osm_type or not osm_id:
            invalid_or_outside += 1
            continue
        latitude, longitude = coordinates
        converted[(osm_type, osm_id)] = {
            "city_code": "HUE",
            "city_name": "Huế",
            "osm_type": osm_type,
            "osm_id": osm_id,
            "name": name,
            "latitude": latitude,
            "longitude": longitude,
            "tags": tags,
        }
    return list(converted.values()), invalid_or_outside


def _load_existing_raw(path: Path) -> tuple[list[dict[str, Any]], set[tuple[str, str]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    records = data.get("pois", []) if isinstance(data, dict) else []
    hue_records = [record for record in records if str(record.get("city_code", "")).upper() == "HUE"]
    return hue_records, {_osm_key(record) for record in hue_records}


def _load_existing_csv(path: Path) -> tuple[list[dict[str, str]], set[tuple[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        rows = [row for row in csv.DictReader(csv_file) if row.get("city_code", "").upper() == "HUE"]
    return rows, {_osm_key(row) for row in rows}


def _distance_meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    delta_lat, delta_lon = lat2 - lat1, lon2 - lon1
    h = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return 12_742_000 * math.asin(min(1.0, math.sqrt(h)))


def _find_possible_duplicate(
    candidate: dict[str, Any],
    existing_rows: list[dict[str, str]],
    *,
    threshold_meters: float = 100,
) -> tuple[dict[str, str], float] | None:
    name = _normalize_name(candidate.get("name"))
    point = (float(candidate["latitude"]), float(candidate["longitude"]))
    closest: tuple[dict[str, str], float] | None = None
    for existing in existing_rows:
        if _normalize_name(existing.get("name")) != name:
            continue
        try:
            existing_point = (float(existing["latitude"]), float(existing["longitude"]))
        except (TypeError, ValueError):
            continue
        distance = _distance_meters(point, existing_point)
        if distance < threshold_meters and (closest is None or distance < closest[1]):
            closest = existing, distance
    return closest


def _source_url(record: dict[str, Any]) -> str:
    return f"https://www.openstreetmap.org/{record['osm_type']}/{record['osm_id']}"


def _image_url(tags: dict[str, Any]) -> str:
    value = str(tags.get("image", "")).strip()
    return value if value.startswith(("https://", "http://")) else ""


def _image_reference(tags: dict[str, Any]) -> str:
    return "; ".join(
        f"{key}={tags[key]}" for key in ("image", "wikimedia_commons") if tags.get(key)
    )


def _website_url(tags: dict[str, Any]) -> str:
    value = extract_website(tags).strip()
    if not value:
        return ""
    if value.startswith(("https://", "http://")):
        return value
    if value.startswith("//"):
        return f"https:{value}"
    if re.match(r"^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?::\d+)?(?:/|$)", value):
        return f"https://{value}"
    return ""


def _contact_link(tags: dict[str, Any]) -> str:
    website = _website_url(tags)
    phone = extract_phone(tags)
    email = str(tags.get("email", tags.get("contact:email", ""))).strip()
    return website or (f"mailto:{email}" if email else (f"tel:{phone}" if phone else ""))


def _enrich_poi_row(
    row: dict[str, Any],
    source_by_key: dict[tuple[str, str], dict[str, Any]],
    source_updated_at: str,
) -> dict[str, Any]:
    source = source_by_key[_osm_key(row)]
    tags = source.get("tags") or {}
    return {
        **row,
        "website": _website_url(tags),
        "name_vi": str(tags.get("name:vi", "")).strip(),
        "name_en": str(tags.get("name:en", "")).strip(),
        "contact_email": str(tags.get("email", tags.get("contact:email", ""))).strip(),
        "contact_link": _contact_link(tags),
        "image_url": _image_url(tags),
        "image_reference": _image_reference(tags),
        "wikidata_id": str(tags.get("wikidata", "")).strip(),
        "source_provider": "OpenStreetMap / Overpass API",
        "source_license": "ODbL-1.0",
        "source_url": _source_url(source),
        "source_updated_at": source_updated_at,
        "raw_tags_json": json.dumps(tags, ensure_ascii=False, sort_keys=True),
    }


def _lodging_row(
    record: dict[str, Any],
    *,
    source_updated_at: str,
    existing_known_keys: set[tuple[str, str]],
) -> dict[str, Any]:
    tags = record.get("tags") or {}
    phone = extract_phone(tags)
    email = str(tags.get("email", tags.get("contact:email", ""))).strip()
    website = _website_url(tags)
    return {
        "osm_type": record["osm_type"],
        "osm_id": record["osm_id"],
        "city_code": "HUE",
        "city_name": "Huế",
        "name": record["name"],
        "name_vi": str(tags.get("name:vi", "")).strip(),
        "name_en": str(tags.get("name:en", "")).strip(),
        "accommodation_type": str(tags.get("tourism", "")),
        "homestay_in_name": "homestay" in _normalize_name(record["name"]),
        "latitude": record["latitude"],
        "longitude": record["longitude"],
        "address": extract_address(tags),
        "phone": phone,
        "website": website,
        "contact_email": email,
        "contact_link": _contact_link(tags),
        "opening_hours": extract_opening_hours(tags),
        "image_url": _image_url(tags),
        "image_reference": _image_reference(tags),
        "wikidata_id": str(tags.get("wikidata", "")).strip(),
        "source_provider": "OpenStreetMap / Overpass API",
        "source_license": "ODbL-1.0",
        "source_url": _source_url(record),
        "source_updated_at": source_updated_at,
        "source_status": "already_in_current_data" if _osm_key(record) in existing_known_keys else "new_to_current_data",
        "database_status": "separate_category_required",
        "raw_tags_json": json.dumps(tags, ensure_ascii=False, sort_keys=True),
    }


def _write_csv(path: Path, rows: list[dict[str, Any]], headers: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=headers, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _percent(count: int, total: int) -> str:
    return f"{count / total:.1%}" if total else "0.0%"


def _build_report(
    *,
    source: Path,
    source_updated_at: str,
    source_count: int,
    area_count: int,
    coordinate_extent: tuple[float, float, float, float] | None,
    eligible_count: int,
    already_known_count: int,
    new_before_review_count: int,
    candidates: list[dict[str, Any]],
    duplicates: list[dict[str, Any]],
    lodging: list[dict[str, Any]],
    duplicate_count_in_new: int,
    output_paths: dict[str, Path],
) -> str:
    categories = Counter(row["category_name"] for row in candidates)
    coverage = {
        "tên tiếng Việt": sum(bool(row.get("name_vi")) for row in candidates),
        "tên tiếng Anh": sum(bool(row.get("name_en")) for row in candidates),
        "mô tả": sum(bool(row.get("description")) for row in candidates),
        "địa chỉ": sum(bool(row.get("address")) for row in candidates),
        "điện thoại": sum(bool(row.get("phone")) for row in candidates),
        "website": sum(bool(row.get("website")) for row in candidates),
        "liên kết liên hệ (web/email/điện thoại)": sum(bool(row.get("contact_link")) for row in candidates),
        "giờ mở cửa": sum(bool(row.get("opening_hours")) for row in candidates),
        "thông tin ẩm thực": sum(bool(row.get("cuisine")) for row in candidates),
        "ảnh URL": sum(bool(row.get("image_url")) for row in candidates),
        "tham chiếu ảnh": sum(bool(row.get("image_reference")) for row in candidates),
        "Wikidata ID": sum(bool(row.get("wikidata_id")) for row in candidates),
    }
    lodging_contact = sum(bool(row.get("website") or row.get("phone") or row.get("contact_email")) for row in lodging)
    lodging_existing = sum(row.get("source_status") == "already_in_current_data" for row in lodging)
    category_lines = "\n".join(f"- {name}: {count}" for name, count in sorted(categories.items())) or "- Không có"
    extent_text = (
        f"{coordinate_extent[0]:.5f}°–{coordinate_extent[1]:.5f}°B, "
        f"{coordinate_extent[2]:.5f}°–{coordinate_extent[3]:.5f}°Đ"
        if coordinate_extent
        else "không có"
    )
    coverage_lines = "\n".join(
        f"- Có {label}: {count}/{len(candidates)} ({_percent(count, len(candidates))})"
        for label, count in coverage.items()
    )
    return f"""# Kiểm kê và mở rộng POI Huế từ OpenStreetMap

Ngày tạo bộ ứng viên: 2026-11-23
Nguồn đầu vào: `{source.name}`
Mốc dữ liệu OSM: `{source_updated_at or 'không có trong export'}`
Giấy phép nguồn: ODbL-1.0; giữ liên kết từng đối tượng OSM trong CSV.

## Kết quả

- Export có {source_count} đối tượng tổng cộng.
- Dùng {area_count} đối tượng có tên và tọa độ từ tập kết quả area Huế. Ảnh truy vấn cho thấy nguồn là `{{geocodeArea:Huế, Việt Nam}}`; JSON export không lưu lại câu truy vấn, nên cần giữ liên kết từng đối tượng để rà lại ranh giới khi cần.
- Hộp tọa độ quan sát được trong export: {extent_text}. Đây là phạm vi bao dữ liệu, không khẳng định ranh giới hành chính.
- {eligible_count} đối tượng được taxonomy hiện tại ánh xạ vào 5 nhóm POI.
- {already_known_count} đối tượng đã có OSM ID trong raw hoặc `pois.csv`; bỏ qua khi tạo dữ liệu tăng thêm.
- {new_before_review_count} POI theo OSM ID còn mới trước rà trùng; {len(duplicates)} bản ghi tên giống và cách POI hiện tại dưới 100m được tách vào file rà thủ công.
- {len(candidates)} POI còn lại sau chuẩn hóa và loại trùng nội bộ theo quy tắc formatter hiện tại; formatter loại thêm {duplicate_count_in_new} bản ghi trùng tên/toạ độ trong tập mới.

### Phân bổ nhóm trong bộ ứng viên

{category_lines}

### Độ phủ dữ liệu trong bộ ứng viên

{coverage_lines}

## Cơ sở lưu trú

- Có {len(lodging)} đối tượng OSM gắn tourism là hotel/guest_house/hostel/motel/resort/apartment/camp_site/chalet/alpine_hut trong tập area.
- {lodging_existing} bản ghi đã có OSM ID trong raw/CSV hiện tại; {len(lodging) - lodging_existing} bản ghi là mới theo OSM ID.
- {lodging_contact}/{len(lodging)} có ít nhất một website, điện thoại hoặc email được gắn trong OSM.
- Cột `accommodation_type` giữ nguyên loại OSM. `guest_house` không tự động được khẳng định là homestay; `homestay_in_name` chỉ đánh dấu tên có chữ “homestay”.
- Các bản ghi này được xuất riêng vì taxonomy/database hiện có 5 nhóm, chưa có nhóm lưu trú. Chưa nhập chúng vào POI đang phục vụ Explore.

## Ảnh, giá và đánh giá

- Export này không có tag `image` hoặc `wikimedia_commons` cho các POI, nên `image_url` để trống. `wikidata_id` và `image_reference` được giữ lại nếu nguồn có để làm bước tra ảnh sau.
- Nguồn không cung cấp giá, điểm đánh giá hay thời lượng tham quan đáng tin cậy; các trường đó vẫn để trống, không suy đoán.
- Điện thoại/website là dữ liệu cộng đồng OSM tại thời điểm export; cần kiểm tra lại trước khi hiển thị như thông tin liên hệ đã xác minh.

## Giới hạn trước khi nhập DB

- Các CSV là **bộ ứng viên để review**, không phải tệp nạp thẳng Supabase. Importer cũ yêu cầu header khớp tuyệt đối nên sẽ từ chối CSV có các cột kiểm kê bổ sung này; ngoài ra nó không lưu OSM ID/liên hệ vào bảng và từ chối chạy khi bảng đã có POI. Cần migration cột nguồn/liên hệ và một luồng upsert theo `(osm_type, osm_id)` trước khi nhập thật.
- Không có thao tác ghi database trong bước này.
- Không có thay đổi taxonomy/UI cho nhóm lưu trú trong bước này.

## Tệp tạo ra

- POI theo taxonomy hiện có: `{output_paths['poi'].relative_to(PROJECT_ROOT)}`
- Bản ghi cần rà trùng: `{output_paths['duplicate'].relative_to(PROJECT_ROOT)}`
- Cơ sở lưu trú chờ quyết định taxonomy: `{output_paths['lodging'].relative_to(PROJECT_ROOT)}`
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--existing-raw", type=Path, default=DEFAULT_EXISTING_RAW)
    parser.add_argument("--existing-csv", type=Path, default=DEFAULT_EXISTING_CSV)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    args = parser.parse_args(argv)

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    elements = payload.get("elements", [])
    source_updated_at = str((payload.get("osm3s") or {}).get("timestamp_osm_base", ""))
    source_records, skipped = _convert_elements(elements)
    existing_raw_rows, existing_raw_keys = _load_existing_raw(args.existing_raw)
    existing_csv_rows, existing_csv_keys = _load_existing_csv(args.existing_csv)
    existing_keys = existing_raw_keys | existing_csv_keys
    coordinates = [
        (float(record["latitude"]), float(record["longitude"]))
        for record in source_records
    ]
    coordinate_extent = (
        min(point[0] for point in coordinates),
        max(point[0] for point in coordinates),
        min(point[1] for point in coordinates),
        max(point[1] for point in coordinates),
    ) if coordinates else None
    existing_hue_rows = [
        row for row in existing_csv_rows
        if row.get("latitude") and row.get("longitude")
    ]

    already_known = [record for record in source_records if _osm_key(record) in existing_keys]
    unseen = [record for record in source_records if _osm_key(record) not in existing_keys]
    lodging_source = [
        record for record in source_records
        if str((record.get("tags") or {}).get("tourism", "")) in LODGING_TYPES
    ]
    mapped_unseen = [
        record for record in unseen
        if normalize_category(record.get("tags") or {}, name=record.get("name", ""))
    ]
    duplicate_rows: list[dict[str, Any]] = []
    safe_mapped: list[dict[str, Any]] = []
    for record in mapped_unseen:
        formatted, _ = process_pois([record])
        if not formatted:
            continue
        row = formatted[0]
        possible = _find_possible_duplicate(record, existing_hue_rows)
        if possible:
            existing, distance = possible
            duplicate_rows.append({
                **row,
                "existing_name": existing.get("name", ""),
                "existing_osm_type": existing.get("osm_type", ""),
                "existing_osm_id": existing.get("osm_id", ""),
                "distance_meters": round(distance, 1),
                "review_reason": "same normalized name within 100m of current processed Hue POI",
            })
        else:
            safe_mapped.append(record)

    processed_rows, stats = process_pois(safe_mapped)
    source_by_key = {_osm_key(record): record for record in safe_mapped}
    candidate_rows = [
        _enrich_poi_row(row, source_by_key, source_updated_at)
        for row in processed_rows
    ]

    lodging_rows = [
        _lodging_row(record, source_updated_at=source_updated_at, existing_known_keys=existing_keys)
        for record in lodging_source
    ]
    poi_path = args.output_dir / "hue_poi_candidates.csv"
    duplicate_path = args.output_dir / "hue_poi_duplicate_review.csv"
    lodging_path = args.output_dir / "hue_lodging_candidates.csv"
    report_path = args.report_dir / "HUE_POI_DATA_AUDIT_2026-11-23.md"
    output_paths = {"poi": poi_path, "duplicate": duplicate_path, "lodging": lodging_path}

    _write_csv(poi_path, candidate_rows, [*CSV_HEADERS, *POI_EXTRA_HEADERS])
    _write_csv(duplicate_path, duplicate_rows, DUPLICATE_HEADERS)
    _write_csv(lodging_path, lodging_rows, LODGING_HEADERS)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        _build_report(
            source=args.input,
            source_updated_at=source_updated_at,
            source_count=len(elements),
            area_count=len(source_records),
            coordinate_extent=coordinate_extent,
            eligible_count=sum(bool(normalize_category(record.get("tags") or {}, record.get("name", ""))) for record in source_records),
            already_known_count=len(already_known),
            new_before_review_count=len(mapped_unseen),
            candidates=candidate_rows,
            duplicates=duplicate_rows,
            lodging=lodging_rows,
            duplicate_count_in_new=stats["duplicate_count"],
            output_paths=output_paths,
        ),
        encoding="utf-8",
    )

    print(f"POI candidates: {len(candidate_rows)} -> {poi_path}")
    print(f"Possible duplicates: {len(duplicate_rows)} -> {duplicate_path}")
    print(f"Lodging candidates: {len(lodging_rows)} -> {lodging_path}")
    print(f"Audit report: {report_path}")
    print(f"Current processed Hue POIs: {len(existing_csv_rows)}")
    print(f"New POIs before manual duplicate review: {len(mapped_unseen)}")
    print(f"Excluded as possible duplicates: {len(duplicate_rows)}")
    print(f"Source elements skipped (unnamed/no coordinates/invalid OSM ID): {skipped}")
    print(f"Lodging already in current raw/processed data: {sum(row['source_status'] == 'already_in_current_data' for row in lodging_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
