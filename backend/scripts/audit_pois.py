from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.format_pois_csv import normalize_category


DEFAULT_CSV_PATH = PROJECT_ROOT / "data" / "processed" / "pois.csv"
DEFAULT_RAW_PATH = PROJECT_ROOT / "data" / "raw" / "osm_pois.json"
DEFAULT_REPORT_PATH = PROJECT_ROOT / "data" / "processed" / "poi_quality_report.json"

CITY_BOUNDS = {
    "DANANG": (15.75, 16.25, 107.85, 108.45),
    "HUE": (16.15, 16.65, 107.35, 108.10),
}

COMPLETENESS_FIELDS = (
    "address",
    "description",
    "phone",
    "website",
    "opening_hours",
    "cuisine",
)
DUPLICATE_REVIEW_DISTANCE_METERS = 250
COORDINATE_TOLERANCE = 1e-7


def normalize_name(name: str) -> str:
    return " ".join(name.casefold().split())


def haversine_distance_meters(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    earth_radius_meters = 6_371_000
    latitude_delta = math.radians(latitude_b - latitude_a)
    longitude_delta = math.radians(longitude_b - longitude_a)
    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(math.radians(latitude_a))
        * math.cos(math.radians(latitude_b))
        * math.sin(longitude_delta / 2) ** 2
    )
    return 2 * earth_radius_meters * math.asin(math.sqrt(haversine))


def _maps_search_url(name: str, city_name: str, latitude: float, longitude: float) -> str:
    query = quote_plus(f"{name} {city_name} {latitude:.6f},{longitude:.6f}")
    return f"https://www.google.com/maps/search/?api=1&query={query}"


def _osm_url(osm_type: str, osm_id: str) -> str:
    return f"https://www.openstreetmap.org/{quote_plus(osm_type)}/{quote_plus(osm_id)}"


def build_quality_report(
    csv_path: Path = DEFAULT_CSV_PATH,
    raw_path: Path = DEFAULT_RAW_PATH,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    with raw_path.open("r", encoding="utf-8") as raw_file:
        raw_data = json.load(raw_file)

    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if not reader.fieldnames:
            raise ValueError(f"POI CSV has no header: {csv_path}")
        required_columns = {
            "osm_type",
            "osm_id",
            "city_code",
            "city_name",
            "name",
            "category_name",
            "latitude",
            "longitude",
            *COMPLETENESS_FIELDS,
        }
        missing_columns = sorted(required_columns - set(reader.fieldnames))
        if missing_columns:
            raise ValueError(
                "POI CSV is missing required columns: "
                + ", ".join(missing_columns)
            )
        rows = list(reader)

    source_pois = raw_data.get("pois", [])
    source_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    duplicate_source_ids: list[str] = []
    for poi in source_pois:
        key = (str(poi.get("osm_type", "")), str(poi.get("osm_id", "")))
        if key in source_by_key:
            duplicate_source_ids.append(f"{key[0]}/{key[1]}")
        else:
            source_by_key[key] = poi

    seen_csv_ids: set[tuple[str, str]] = set()
    duplicate_csv_ids: list[dict[str, Any]] = []
    missing_values: Counter[str] = Counter()
    out_of_city_bounds: list[dict[str, Any]] = []
    source_mismatches: list[dict[str, Any]] = []
    review_queue: list[dict[str, Any]] = []
    same_name_groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    review_queue.extend(
        {
            "reason": "duplicate_raw_source_osm_id",
            "osm_ref": osm_ref,
        }
        for osm_ref in duplicate_source_ids
    )

    for line_number, row in enumerate(rows, start=2):
        osm_type = row["osm_type"].strip()
        osm_id = row["osm_id"].strip()
        key = (osm_type, osm_id)
        if key in seen_csv_ids:
            finding = {
                "reason": "duplicate_csv_osm_id",
                "line": line_number,
                "osm_ref": f"{osm_type}/{osm_id}",
            }
            duplicate_csv_ids.append(finding)
            review_queue.append(finding)
        seen_csv_ids.add(key)

        name = row["name"].strip()
        city_code = row["city_code"].strip().upper()
        city_name = row["city_name"].strip()
        for field in COMPLETENESS_FIELDS:
            if not row[field].strip():
                missing_values[field] += 1

        try:
            latitude = float(row["latitude"])
            longitude = float(row["longitude"])
        except ValueError:
            review_queue.append(
                {
                    "reason": "invalid_coordinates",
                    "line": line_number,
                    "name": name,
                    "osm_ref": f"{osm_type}/{osm_id}",
                }
            )
            continue

        if (
            not math.isfinite(latitude)
            or not math.isfinite(longitude)
            or not -90 <= latitude <= 90
            or not -180 <= longitude <= 180
        ):
            review_queue.append(
                {
                    "reason": "invalid_coordinates",
                    "line": line_number,
                    "name": name,
                    "osm_ref": f"{osm_type}/{osm_id}",
                    "latitude": row["latitude"],
                    "longitude": row["longitude"],
                }
            )
            continue

        bounds = CITY_BOUNDS.get(city_code)
        if bounds and not (
            bounds[0] <= latitude <= bounds[1]
            and bounds[2] <= longitude <= bounds[3]
        ):
            finding = {
                "reason": "outside_city_bbox",
                "line": line_number,
                "name": name,
                "city_code": city_code,
                "latitude": latitude,
                "longitude": longitude,
                "osm_ref": f"{osm_type}/{osm_id}",
                "osm_url": _osm_url(osm_type, osm_id),
            }
            out_of_city_bounds.append(finding)
            review_queue.append(finding)

        source_poi = source_by_key.get(key)
        if source_poi is None:
            source_mismatches.append(
                {
                    "reason": "missing_from_raw_source",
                    "line": line_number,
                    "osm_ref": f"{osm_type}/{osm_id}",
                    "name": name,
                }
            )
        else:
            tags = source_poi.get("tags", {})
            mismatch_fields: list[str] = []
            source_name = " ".join(str(source_poi.get("name", "")).split())
            if normalize_name(name) != normalize_name(source_name):
                mismatch_fields.append("name")
            if source_poi.get("city_code") != row["city_code"]:
                mismatch_fields.append("city_code")
            if abs(float(source_poi["latitude"]) - latitude) > COORDINATE_TOLERANCE:
                mismatch_fields.append("latitude")
            if abs(float(source_poi["longitude"]) - longitude) > COORDINATE_TOLERANCE:
                mismatch_fields.append("longitude")
            expected_cat = source_poi.get("category_name") or normalize_category(tags, name=name)
            if expected_cat != row["category_name"]:
                mismatch_fields.append("category_name")
            if mismatch_fields:
                finding = {
                    "reason": "csv_source_mismatch",
                    "line": line_number,
                    "name": name,
                    "osm_ref": f"{osm_type}/{osm_id}",
                    "fields": mismatch_fields,
                }
                source_mismatches.append(finding)
                review_queue.append(finding)

        same_name_groups[(city_code, normalize_name(name))].append(
            {
                "name": name,
                "city_name": city_name,
                "osm_type": osm_type,
                "osm_id": osm_id,
                "latitude": latitude,
                "longitude": longitude,
            }
        )

    possible_duplicates: list[dict[str, Any]] = []
    for places in same_name_groups.values():
        for index, first in enumerate(places):
            for second in places[index + 1 :]:
                distance = haversine_distance_meters(
                    first["latitude"],
                    first["longitude"],
                    second["latitude"],
                    second["longitude"],
                )
                if distance > DUPLICATE_REVIEW_DISTANCE_METERS:
                    continue

                pair = {
                    "reason": "nearby_same_name",
                    "review_status": "needs_manual_review",
                    "name": first["name"],
                    "city_name": first["city_name"],
                    "distance_meters": round(distance, 1),
                    "places": [
                        {
                            "osm_ref": f"{place['osm_type']}/{place['osm_id']}",
                            "latitude": place["latitude"],
                            "longitude": place["longitude"],
                            "osm_url": _osm_url(
                                place["osm_type"], place["osm_id"]
                            ),
                            "google_maps_search_url": _maps_search_url(
                                place["name"],
                                place["city_name"],
                                place["latitude"],
                                place["longitude"],
                            ),
                        }
                        for place in (first, second)
                    ],
                }
                possible_duplicates.append(pair)
                review_queue.append(pair)

    possible_duplicates.sort(key=lambda item: item["distance_meters"])
    review_queue.sort(key=lambda item: (item["reason"], item.get("line", 0)))

    source_retrieved_at = raw_data.get("source", {}).get("retrieved_at")
    now = generated_at or datetime.now(timezone.utc)
    source_age_days: int | None = None
    if source_retrieved_at:
        retrieved = datetime.fromisoformat(source_retrieved_at.replace("Z", "+00:00"))
        source_age_days = max(0, (now - retrieved).days)

    row_count = len(rows)
    return {
        "report_version": 1,
        "generated_at": now.isoformat(),
        "source": {
            "provider": raw_data.get("source", {}).get("provider", "unknown"),
            "license": raw_data.get("source", {}).get("license"),
            "retrieved_at": source_retrieved_at,
            "age_days_at_generation": source_age_days,
            "external_google_maps_api_check_performed": False,
        },
        "summary": {
            "csv_rows": row_count,
            "raw_source_rows": len(source_pois),
            "raw_source_declared_count": raw_data.get("count"),
            "raw_source_count_matches_declared": raw_data.get("count")
            == len(source_pois),
            "raw_source_ids_not_in_csv": len(
                set(source_by_key) - seen_csv_ids
            ),
            "csv_ids_missing_from_source": len(
                seen_csv_ids - set(source_by_key)
            ),
            "duplicate_csv_osm_ids": len(duplicate_csv_ids),
            "duplicate_source_osm_ids": len(duplicate_source_ids),
            "csv_source_mismatches": len(source_mismatches),
            "outside_city_bbox": len(out_of_city_bounds),
            "nearby_same_name_pairs_for_review": len(possible_duplicates),
        },
        "completeness": {
            field: {
                "missing": missing_values[field],
                "present": row_count - missing_values[field],
                "missing_percent": (
                    round(missing_values[field] * 100 / row_count, 1)
                    if row_count
                    else 0
                ),
            }
            for field in COMPLETENESS_FIELDS
        },
        "integrity_findings": {
            "duplicate_csv_osm_ids": duplicate_csv_ids,
            "duplicate_source_osm_ids": duplicate_source_ids,
            "csv_source_mismatches": source_mismatches,
            "outside_city_bbox": out_of_city_bounds,
        },
        "possible_duplicates": possible_duplicates,
        "review_queue": review_queue,
        "review_policy": (
            "Nearby matching names are candidates only. Confirm the place and "
            "its active status against an authoritative source before merging "
            "or deleting records. This report does not verify Google Maps data."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Audit processed POIs against their raw OpenStreetMap source."
    )
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV_PATH)
    parser.add_argument("--raw", type=Path, default=DEFAULT_RAW_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_REPORT_PATH)
    args = parser.parse_args()

    report = build_quality_report(args.csv, args.raw)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as report_file:
        json.dump(report, report_file, ensure_ascii=False, indent=2)
        report_file.write("\n")
    print(f"[SUCCESS] Wrote POI quality report to: {args.output}")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
