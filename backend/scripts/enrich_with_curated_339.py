"""
Enrich existing POIs with high-value metadata from the 339 curated dataset.

Safety Features:
- Does not modify database directly.
- By default, runs in PREVIEW mode and writes to `data/processed/pois_enriched.csv`
  so `data/processed/pois.csv` remains safe until verified.
- Outputs detailed change log in `data/processed/curated_62_enrichment_preview.json`.
- Generates coordinate catalog `data/raw/curated_339_coordinates_catalog.json`.

Run via:
    python backend/scripts/enrich_with_curated_339.py [--apply]
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MATCH_REPORT_PATH = PROJECT_ROOT / "data" / "processed" / "curated_339_match_report.json"
CURATED_CSV_PATH = PROJECT_ROOT / "data" / "raw" / "curated_pois_339.csv"
EXISTING_POIS_PATH = PROJECT_ROOT / "data" / "processed" / "pois.csv"
OUTPUT_ENRICHED_CSV = PROJECT_ROOT / "data" / "processed" / "pois_enriched.csv"
OUTPUT_PREVIEW_JSON = PROJECT_ROOT / "data" / "processed" / "curated_62_enrichment_preview.json"
OUTPUT_COORDS_CATALOG = PROJECT_ROOT / "data" / "raw" / "curated_339_coordinates_catalog.json"


def parse_numeric_cost(price_level_text: str) -> str:
    """
    Extract a sensible single numeric cost estimate (in VND) from text.
    Examples:
        'Miễn phí (Free Entry)' -> '0'
        'Khoảng 45.000 – 70.000 VNĐ/người' -> '55000'
        '20.000 – 40.000 VNĐ' -> '30000'
    """
    if not price_level_text:
        return ""
    lower = price_level_text.lower()
    if "miễn phí" in lower or "free" in lower:
        return "0"

    nums = re.findall(r"(\d+(?:\.\d{3})+|\d+)", price_level_text)
    clean_nums: list[int] = []
    for n in nums:
        val = int(n.replace(".", ""))
        if 1000 <= val <= 20_000_000:
            clean_nums.append(val)

    if clean_nums:
        avg = sum(clean_nums) // len(clean_nums)
        # Round to nearest 5,000 VND
        rounded = round(avg / 5000) * 5000
        return str(rounded)
    return ""


def clean_opening_hours(hours_text: str) -> str:
    """Clean trailing periods or excess whitespace in opening hours."""
    if not hours_text:
        return ""
    cleaned = hours_text.strip().rstrip(".")
    return cleaned.strip()


def build_rich_description(
    curated_desc: str,
    services_or_menu: str,
    price_level: str,
    other_details: str,
) -> str:
    """Combine curated description, menu/ticket information and tips cleanly."""
    parts: list[str] = []
    if curated_desc:
        parts.append(curated_desc.strip())

    if services_or_menu:
        parts.append(f"[Menu / Dịch vụ & Giá vé]: {services_or_menu.strip()}")

    if price_level:
        parts.append(f"[Mức giá tham khảo]: {price_level.strip()}")

    if other_details:
        parts.append(f"[Lưu ý / Kinh nghiệm]: {other_details.strip()}")

    return "\n\n".join(parts)


def parse_primary_address(raw_address: str) -> str:
    """Extract primary branch address from multi-branch string, preserving alley numbers like 113/3."""
    if not raw_address:
        return ""
    branches = [b.strip() for b in re.split(r"\s+/\s+|\s*\|\s*", raw_address) if len(b.strip()) >= 5]
    return branches[0] if branches else raw_address.strip()


def enrich_pois(
    match_report_path: Path = MATCH_REPORT_PATH,
    curated_csv_path: Path = CURATED_CSV_PATH,
    existing_pois_path: Path = EXISTING_POIS_PATH,
    output_enriched_csv: Path = OUTPUT_ENRICHED_CSV,
    output_preview_json: Path = OUTPUT_PREVIEW_JSON,
    output_coords_catalog: Path = OUTPUT_COORDS_CATALOG,
    overwrite_original: bool = False,
) -> dict[str, Any]:
    with match_report_path.open("r", encoding="utf-8") as f:
        match_report = json.load(f)

    with curated_csv_path.open("r", encoding="utf-8-sig") as f:
        curated_rows = {r["record_id"]: r for r in csv.DictReader(f)}

    with existing_pois_path.open("r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        existing_pois = list(reader)

    # Index existing POIs by (osm_type, osm_id)
    existing_index: dict[tuple[str, str], dict[str, str]] = {
        (p["osm_type"], p["osm_id"]): p for p in existing_pois
    }

    update_candidates = [
        r for r in match_report["records"] if r["status"] == "UPDATE_CANDIDATE"
    ]

    enrichment_diffs: list[dict[str, Any]] = []
    enriched_count = 0

    for cand in update_candidates:
        record_id = cand["record_id"]
        curated = curated_rows.get(record_id)
        if not curated:
            continue

        m_details = cand["match_details"]
        osm_key = (m_details["existing_osm_type"], str(m_details["existing_osm_id"]))
        poi_target = existing_index.get(osm_key)
        if not poi_target:
            continue

        # Prepare enriched fields
        old_desc = poi_target.get("description", "")
        old_hours = poi_target.get("opening_hours", "")
        old_address = poi_target.get("address", "")
        old_cost = poi_target.get("estimated_cost", "")
        old_local = poi_target.get("is_local_business", "")

        new_desc = build_rich_description(
            curated.get("description", ""),
            curated.get("menu_or_ticket_services", ""),
            curated.get("price_level", ""),
            curated.get("other_details", ""),
        )
        new_hours = clean_opening_hours(curated.get("opening_hours", ""))
        new_address = parse_primary_address(curated.get("address", ""))
        new_cost = parse_numeric_cost(curated.get("price_level", ""))

        field_changes: dict[str, dict[str, str]] = {}

        # 1. Update Description (curated description is substantially richer)
        if new_desc and new_desc != old_desc:
            field_changes["description"] = {"old": old_desc, "new": new_desc}
            poi_target["description"] = new_desc

        # 2. Update Opening Hours
        if new_hours and (not old_hours or len(new_hours) > len(old_hours)):
            field_changes["opening_hours"] = {"old": old_hours, "new": new_hours}
            poi_target["opening_hours"] = new_hours

        # 3. Update Address if existing is empty or curated has specific street address
        if new_address and (not old_address or len(old_address) < 10):
            field_changes["address"] = {"old": old_address, "new": new_address}
            poi_target["address"] = new_address

        # 4. Update Estimated Cost
        if new_cost and not old_cost:
            field_changes["estimated_cost"] = {"old": old_cost, "new": new_cost}
            poi_target["estimated_cost"] = new_cost

        # 5. Local Business Flag
        if old_local != "True":
            field_changes["is_local_business"] = {"old": old_local, "new": "True"}
            poi_target["is_local_business"] = "True"

        if field_changes:
            enriched_count += 1
            enrichment_diffs.append({
                "record_id": record_id,
                "place_name": cand["place_name"],
                "osm_type": osm_key[0],
                "osm_id": osm_key[1],
                "city": cand["city"],
                "changed_fields_count": len(field_changes),
                "field_changes": field_changes,
            })

    # Save Enriched Preview CSV
    target_csv = existing_pois_path if overwrite_original else output_enriched_csv
    with target_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(existing_pois)

    # Save Enrichment Preview Report
    preview_report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_update_candidates": len(update_candidates),
        "successfully_enriched_count": enriched_count,
        "output_csv": str(target_csv.name),
        "enrichment_diffs": enrichment_diffs,
    }
    with output_preview_json.open("w", encoding="utf-8") as f:
        json.dump(preview_report, f, ensure_ascii=False, indent=2)

    # 6. Generate Coordinates Catalog for all 339 venues
    coords_catalog: list[dict[str, Any]] = []
    for r in match_report["records"]:
        m = r.get("match_details")
        has_coords = bool(m and m.get("existing_latitude") and m.get("existing_longitude"))
        catalog_entry: dict[str, Any] = {
            "record_id": r["record_id"],
            "place_name": r["place_name"],
            "city": r["city"],
            "group_name": r["curated_group"],
            "db_category": r["db_category"],
            "status": r["status"],
            "latitude": m["existing_latitude"] if has_coords else None,
            "longitude": m["existing_longitude"] if has_coords else None,
            "coordinates_verified": has_coords,
            "coordinate_source": "EXISTING_POI_MATCH" if has_coords else "PENDING_GEOCODING",
            "is_multi_branch": r.get("is_multi_branch", False),
            "address": r.get("address", ""),
        }
        coords_catalog.append(catalog_entry)

    catalog_data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_records": len(coords_catalog),
        "verified_with_coords_count": sum(1 for c in coords_catalog if c["coordinates_verified"]),
        "pending_geocoding_count": sum(1 for c in coords_catalog if not c["coordinates_verified"]),
        "catalog": coords_catalog,
    }
    with output_coords_catalog.open("w", encoding="utf-8") as f:
        json.dump(catalog_data, f, ensure_ascii=False, indent=2)

    return {
        "enriched_count": enriched_count,
        "target_csv": str(target_csv),
        "preview_json": str(output_preview_json),
        "catalog_json": str(output_coords_catalog),
        "verified_coords_count": catalog_data["verified_with_coords_count"],
        "pending_coords_count": catalog_data["pending_geocoding_count"],
    }


def print_summary(result: dict[str, Any]) -> None:
    print("=" * 70)
    print("  GREEN TRIP — CURATED 339 ENRICHMENT & COORDINATE CATALOG")
    print("=" * 70)
    print(f"Successfully Enriched POIs: {result['enriched_count']}/62 UPDATE_CANDIDATES")
    print(f"Enriched CSV Output: {result['target_csv']}")
    print(f"Enrichment Diff Preview: {result['preview_json']}")
    print(f"Coordinate Catalog: {result['catalog_json']}")
    print(f" - Verified with coordinates: {result['verified_coords_count']} venues")
    print(f" - Pending geocoding:         {result['pending_coords_count']} venues")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich POIs with 339 curated dataset.")
    parser.add_argument("--apply", action="store_true", help="Overwrite original pois.csv")
    args = parser.parse_args()

    res = enrich_pois(overwrite_original=args.apply)
    print_summary(res)
