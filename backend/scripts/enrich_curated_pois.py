"""
Merge and enrich POIs using curated data from Gemini NotebookLM.

Workflow (Option A):
1. Loads 105 curated POIs from data/raw/notebooklm_pois.csv.
2. Cleans text, strips citations ([1], [2], etc.), resolves visit minutes and business types.
3. Looks up exact real-world coordinates from curated_coordinates.py.
4. Matches with existing data/processed/pois.csv:
   - If matched: Enriches description, address, category, and visit minutes.
   - If new: Appends as a curated POI with unique ID (osm_type='curated', osm_id=900000000+idx).
5. Synchronizes the raw provenance entries into data/raw/osm_pois.json so quality audits pass.
6. Writes updated data/processed/pois.csv.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

# Ensure standard output handles UTF-8 on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from scripts.curated_coordinates import CURATED_COORDINATES

CURATED_RAW_CSV = PROJECT_ROOT / "data" / "raw" / "notebooklm_pois.csv"
PROCESSED_CSV = PROJECT_ROOT / "data" / "processed" / "pois.csv"
RAW_JSON = PROJECT_ROOT / "data" / "raw" / "osm_pois.json"

CSV_HEADERS = [
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
    "is_local_business",
    "local_business_type",
    "estimated_cost",
    "average_visit_minutes",
    "satisfaction_score",
    "popularity_score",
]

# Baseline visit durations (minutes)
VISIT_MINUTES_BY_CATEGORY = {
    "Ẩm thực và quán ăn": 45,
    "Quán cafe giải khát": 45,
    "Di tích lịch sử và văn hóa": 60,
    "Cảnh quan và thiên nhiên": 90,
    "Tâm linh và chùa thiền": 45,
}

# Known aliases to match curated names with existing OSM POI names
CURATED_ALIASES = {
    "Bảo tàng Chăm Đà Nẵng": ["Bảo tàng Nghệ thuật Điêu khắc Chăm Đà Nẵng"],
    "Quán bánh xèo Bà Dưỡng": ["Bánh Xèo Bà Dưỡng", "Ba Duong Banh Xeo"],
    "Cafe Muối / Cà phê muối": ["Cafe Muối", "Cà phê muối"],
    "Bảo tàng Lê Bá Đảng": ["Le Ba Dang Art Foundation"],
    "Mì Quảng 1A": ["Mi Quang 1A"],
    "Mì Quảng Bà Vị": ["Mi Quang Ba Vi"],
    "Bali Coffee": ["BALI coffee"],
    "Cafe An Nhiên": ["Café An Nhiên"],
    "Nook cafe & Bar": ["Nook Cafe & Bar"],
    "Hanok": ["Hanok Cafe"],
}


def normalize_for_match(text: str) -> str:
    """Normalize string for fuzzy-matching (lowercase, no accents, alphanumeric only)."""
    text = text.lower().replace("đ", "d")
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9]", "", text)
    return text


def clean_description(desc: str) -> str:
    """Strip citation brackets like [1], [2], [3], [4] and clean extra whitespace."""
    cleaned = re.sub(r"\s*\[\d+\](?:\s*,\s*\[\d+\])*", "", desc)
    cleaned = re.sub(r"\s+([,.:;?!])", r"\1", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned.strip().strip('"').strip("'").strip()


def resolve_visit_minutes(val: str, category: str, name: str) -> str:
    """Return an integer string for average visit minutes."""
    val = val.strip()
    if val.isdigit() and int(val) > 0:
        return val
    if "vinwonders" in name.lower():
        return "180"
    return str(VISIT_MINUTES_BY_CATEGORY.get(category, 45))


def resolve_is_local_business(val: str, category: str, name: str) -> str:
    """Return 'True' or 'False' for local business indicator."""
    val_lower = val.strip().lower()
    if val_lower in ("true", "false"):
        return "True" if val_lower == "true" else "False"

    # Not in source heuristic:
    if category in ("Ẩm thực và quán ăn", "Quán cafe giải khát"):
        return "True"
    return "False"


def enrich_curated_pois(
    curated_csv_path: Path = CURATED_RAW_CSV,
    processed_csv_path: Path = PROCESSED_CSV,
    raw_json_path: Path = RAW_JSON,
) -> dict[str, Any]:
    # 1. Load curated rows from NotebookLM CSV
    with curated_csv_path.open("r", encoding="utf-8") as f:
        reader = csv.reader(f)
        curated_rows = [row for row in reader if row and any(cell.strip() for cell in row)]

    print(f"Loaded {len(curated_rows)} curated rows from {curated_csv_path}")

    # 2. Load existing processed POIs
    with processed_csv_path.open("r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        existing_pois = list(reader)

    print(f"Loaded {len(existing_pois)} existing POIs from {processed_csv_path}")

    # Index existing POIs by normalized name + city_code
    osm_index: dict[tuple[str, str], dict[str, str]] = {}
    for poi in existing_pois:
        key = (normalize_for_match(poi["name"]), poi["city_code"].upper())
        osm_index[key] = poi

    # 3. Load and prepare raw JSON data for provenance sync
    with raw_json_path.open("r", encoding="utf-8") as f:
        raw_data = json.load(f)
    raw_pois_list = raw_data.get("pois", [])
    raw_by_key = {
        (str(p.get("osm_type", "")), str(p.get("osm_id", ""))): p for p in raw_pois_list
    }
    raw_keys_set = set(raw_by_key.keys())

    enriched_count = 0
    added_count = 0
    new_curated_records: list[dict[str, str]] = []

    for idx, row in enumerate(curated_rows, start=1):
        # Expect columns: name, city_name, category_name, address, description, average_visit_minutes, is_local_business, local_business_type, citations
        curated_name = row[0].strip()
        curated_city_name = row[1].strip()
        curated_city_code = "DANANG" if "da nang" in curated_city_name.lower() else "HUE"
        curated_category = row[2].strip()
        curated_address = row[3].strip()
        curated_desc = clean_description(row[4].strip())
        curated_visit_min = resolve_visit_minutes(
            row[5] if len(row) > 5 else "", curated_category, curated_name
        )
        curated_is_local = resolve_is_local_business(
            row[6] if len(row) > 6 else "", curated_category, curated_name
        )
        curated_biz_type = row[7].strip() if len(row) > 7 else ""

        # Coordinates from verified coordinate table
        if curated_name in CURATED_COORDINATES:
            lat_f, lng_f = CURATED_COORDINATES[curated_name]
        else:
            raise ValueError(f"Missing coordinates for curated POI: {curated_name}")
        lat_str = f"{lat_f:.7f}"
        lng_str = f"{lng_f:.7f}"

        # Standard display name (clean slash if cafe muối)
        display_name = curated_name
        if "Cafe Muối / Cà phê muối" in curated_name:
            display_name = "Cà phê Muối"

        # Check match with existing OSM POI
        norm_name = normalize_for_match(curated_name)
        matched_poi: dict[str, str] | None = osm_index.get((norm_name, curated_city_code))

        if not matched_poi and curated_name in CURATED_ALIASES:
            for alias in CURATED_ALIASES[curated_name]:
                alias_norm = normalize_for_match(alias)
                if (alias_norm, curated_city_code) in osm_index:
                    matched_poi = osm_index[(alias_norm, curated_city_code)]
                    break

        if matched_poi:
            # ENRICH existing POI
            matched_poi["description"] = curated_desc
            if curated_address and not matched_poi.get("address"):
                matched_poi["address"] = curated_address
            matched_poi["average_visit_minutes"] = curated_visit_min
            matched_poi["category_name"] = curated_category
            matched_poi["is_local_business"] = curated_is_local
            if curated_biz_type and not matched_poi.get("local_business_type"):
                matched_poi["local_business_type"] = curated_biz_type
            
            # Sync category to raw source if present
            raw_key = (str(matched_poi["osm_type"]), str(matched_poi["osm_id"]))
            if raw_key in raw_by_key:
                raw_by_key[raw_key]["category_name"] = curated_category

            enriched_count += 1
        else:
            # ADD as new curated POI
            curated_osm_id = str(900000000 + idx)
            new_record: dict[str, str] = {
                "osm_type": "curated",
                "osm_id": curated_osm_id,
                "city_code": curated_city_code,
                "city_name": curated_city_name,
                "name": display_name,
                "category_name": curated_category,
                "latitude": lat_str,
                "longitude": lng_str,
                "address": curated_address,
                "description": curated_desc,
                "phone": "",
                "website": "",
                "opening_hours": "",
                "cuisine": "",
                "is_local_business": curated_is_local,
                "local_business_type": curated_biz_type,
                "estimated_cost": "",
                "average_visit_minutes": curated_visit_min,
                "satisfaction_score": "",
                "popularity_score": "",
            }
            new_curated_records.append(new_record)
            added_count += 1

            # Sync raw provenance entry into raw_pois_list
            raw_key = ("curated", curated_osm_id)
            if raw_key not in raw_keys_set:
                tags: dict[str, Any] = {
                    "name": display_name,
                    "curated_source": "NotebookLM",
                    "business_type": curated_biz_type,
                }
                if curated_category == "Tâm linh và chùa thiền":
                    tags["amenity"] = "place_of_worship"
                elif curated_category == "Di tích lịch sử và văn hóa":
                    tags["tourism"] = "museum"
                elif curated_category == "Quán cafe giải khát":
                    tags["amenity"] = "cafe"
                elif curated_category == "Ẩm thực và quán ăn":
                    tags["amenity"] = "restaurant"
                elif curated_category == "Cảnh quan và thiên nhiên":
                    tags["tourism"] = "theme_park"

                raw_entry = {
                    "city_code": curated_city_code,
                    "city_name": curated_city_name,
                    "osm_type": "curated",
                    "osm_id": int(curated_osm_id),
                    "name": display_name,
                    "latitude": float(lat_str),
                    "longitude": float(lng_str),
                    "category_name": curated_category,
                    "tags": tags,
                }
                raw_pois_list.append(raw_entry)
                raw_keys_set.add(raw_key)
                raw_by_key[raw_key] = raw_entry

    # Combine existing + new
    total_pois = existing_pois + new_curated_records

    # Write updated processed CSV
    with processed_csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        writer.writeheader()
        writer.writerows(total_pois)

    # Write updated raw JSON with synced count
    raw_data["pois"] = raw_pois_list
    raw_data["count"] = len(raw_pois_list)
    with raw_json_path.open("w", encoding="utf-8") as f:
        json.dump(raw_data, f, ensure_ascii=False, indent=2)

    summary = {
        "curated_input_total": len(curated_rows),
        "existing_enriched": enriched_count,
        "newly_added": added_count,
        "total_pois_output": len(total_pois),
        "raw_json_pois_count": len(raw_pois_list),
    }

    print("\nEnrichment complete!")
    print(f" - Enriched existing POIs: {enriched_count}")
    print(f" - Added new curated POIs: {added_count}")
    print(f" - Total POIs in CSV: {len(total_pois)}")
    print(f" - Total POIs in raw JSON: {len(raw_pois_list)}")
    return summary


if __name__ == "__main__":
    enrich_curated_pois()
