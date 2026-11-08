"""
Profile, validate, and dry-run match the 339 curated POIs against existing POIs.

This script is STRICTLY READ-ONLY:
- It does not modify, truncate, or insert into any database.
- It produces a structured audit report in data/processed/curated_339_match_report.json.
- It outputs detailed breakdown statistics and categorization (UPDATE_CANDIDATE, POSSIBLE_DUPLICATE, NEW_CANDIDATE_NEEDS_COORDINATES).

Run via:
    python backend/scripts/profile_and_match_curated.py
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Ensure UTF-8 output on Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CURATED_CSV = PROJECT_ROOT / "data" / "raw" / "curated_pois_339.csv"
DEFAULT_EXISTING_CSV = PROJECT_ROOT / "data" / "processed" / "pois.csv"
DEFAULT_REPORT_PATH = PROJECT_ROOT / "data" / "processed" / "curated_339_match_report.json"

# Controlled DB Categories mapping from 339 dataset group_name
CURATED_GROUP_TO_DB_CATEGORY: dict[str, str] = {
    "Ẩm thực & Quán ăn": "Ẩm thực và quán ăn",
    "Quán Cafe & Giải khát": "Quán cafe giải khát",
    "Cảnh quan & Thiên nhiên": "Cảnh quan và thiên nhiên",
    "Di tích lịch sử & Văn hoá": "Di tích lịch sử và văn hóa",
    "Tâm linh & Chùa chiền": "Tâm linh và chùa thiền",
}

CITY_MAP: dict[str, tuple[str, str]] = {
    "đà nẵng": ("DANANG", "Da Nang"),
    "huế": ("HUE", "Hue"),
    "da nang": ("DANANG", "Da Nang"),
    "hue": ("HUE", "Hue"),
}

GENERIC_NAMES: set[str] = {
    "be thui", "nha hang hai san", "nhahanghaisan", "bun thit nuong", "bunthitnuong",
    "quan cafe", "quancafe", "quancaphe", "cafe", "caphe", "quanan", "nhahang",
    "banh mi", "banhmi", "trasua", "tra sua", "tiem banh", "an vat", "anvat", "che", "quan com"
}


def clean_place_name(name: str) -> str:
    """Strip Michelin tags, awards, or branch notes in parentheses."""
    cleaned = re.sub(r"\(.*?\)", "", name)
    cleaned = re.sub(r"–.*$", "", cleaned)
    cleaned = re.sub(r"-.*$", "", cleaned)
    return cleaned.strip()


def normalize_text(text: str) -> str:
    """Lowercase, remove accents (NFD/Mn), remove special characters."""
    text = text.lower().replace("đ", "d")
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9]", "", text)
    return text


def extract_meaningful_tokens(text: str) -> set[str]:
    """Extract substantive keywords ignoring generic stopwords."""
    text = text.lower().replace("đ", "d")
    text = re.sub(r"\(.*?\)", "", text)
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    words = set(re.findall(r"[a-z0-9]+", text))
    stopwords = {
        "quan", "tiem", "nha", "hang", "cafe", "ca", "phe", "coffee",
        "chua", "den", "thien", "vien", "khu", "du", "lich", "tp",
        "da", "nang", "hue", "dac", "san"
    }
    return words - stopwords


def parse_branches(address: str) -> list[str]:
    """Detect multiple branches separated by ' / ' or '|', preserving alley numbers like '113/3'."""
    if not address:
        return []
    parts = [p.strip() for p in re.split(r"\s+/\s+|\s*\|\s*", address) if len(p.strip()) >= 5]
    return parts if len(parts) > 1 else [address.strip()]


def profile_and_match(
    curated_csv_path: Path = DEFAULT_CURATED_CSV,
    existing_csv_path: Path = DEFAULT_EXISTING_CSV,
    report_output_path: Path = DEFAULT_REPORT_PATH,
) -> dict[str, Any]:
    if not curated_csv_path.exists():
        raise FileNotFoundError(f"Curated CSV not found at: {curated_csv_path}")
    if not existing_csv_path.exists():
        raise FileNotFoundError(f"Existing POIs CSV not found at: {existing_csv_path}")

    # 1. Load Curated CSV
    with curated_csv_path.open("r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        curated_rows = list(reader)

    # 2. Load Existing POIs CSV
    with existing_csv_path.open("r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        existing_rows = list(reader)

    # Index existing POIs by City Code
    existing_by_city: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in existing_rows:
        city_code = "DANANG" if "da nang" in p.get("city_name", "").lower() else "HUE"
        raw_name = p.get("name", "").strip()
        cleaned = clean_place_name(raw_name)
        norm_n = normalize_text(cleaned)
        toks = extract_meaningful_tokens(raw_name)
        existing_by_city[city_code].append({
            "poi": p,
            "raw_name": raw_name,
            "cleaned_name": cleaned,
            "norm_name": norm_n,
            "tokens": toks,
            "is_generic": norm_n in GENERIC_NAMES,
        })

    # 3. Process & Classify each curated row
    classified_records: list[dict[str, Any]] = []
    counts_by_status = Counter()
    counts_by_city = Counter()
    counts_by_group = Counter()
    multi_branch_records: list[dict[str, Any]] = []

    for row in curated_rows:
        record_id = row.get("record_id", "").strip()
        raw_place_name = row.get("place_name", "").strip()
        raw_city = row.get("city", "").strip()
        raw_group_name = row.get("group_name", "").strip()
        raw_address = row.get("address", "").strip()
        raw_description = row.get("description", "").strip()
        raw_hours = row.get("opening_hours", "").strip()
        raw_services = row.get("menu_or_ticket_services", "").strip()
        raw_price_level = row.get("price_level", "").strip()

        counts_by_city[raw_city] += 1
        counts_by_group[raw_group_name] += 1

        # Check multi-branch addresses
        branches = parse_branches(raw_address)
        is_multi_branch = len(branches) > 1
        if is_multi_branch:
            multi_branch_records.append({
                "record_id": record_id,
                "place_name": raw_place_name,
                "branch_count": len(branches),
                "branches": branches,
            })

        # Basic validation
        if not raw_place_name or not raw_city or not raw_group_name:
            counts_by_status["INVALID"] += 1
            classified_records.append({
                "record_id": record_id,
                "place_name": raw_place_name,
                "status": "INVALID",
                "reason": "Missing required fields (place_name, city, or group_name)",
            })
            continue

        city_lookup = CITY_MAP.get(raw_city.strip().lower())
        if not city_lookup:
            counts_by_status["INVALID"] += 1
            classified_records.append({
                "record_id": record_id,
                "place_name": raw_place_name,
                "status": "INVALID",
                "reason": f"Unrecognized city: {raw_city}",
            })
            continue

        city_code, standard_city_name = city_lookup
        db_category = CURATED_GROUP_TO_DB_CATEGORY.get(raw_group_name, raw_group_name)

        # Match against existing POIs in same city
        cleaned_c = clean_place_name(raw_place_name)
        norm_c = normalize_text(cleaned_c)
        toks_c = extract_meaningful_tokens(raw_place_name)

        candidates = existing_by_city[city_code]
        match_record: dict[str, Any] | None = None
        match_type: str | None = None
        confidence: float = 0.0

        # Pass 1: Exact Name Match (on specific non-generic name)
        for cand in candidates:
            if cand["norm_name"] == norm_c and not cand["is_generic"]:
                match_record = cand
                match_type = "EXACT_NAME_MATCH"
                confidence = 1.0
                break

        # Pass 2: Substring or high token overlap (Fuzzy)
        if not match_record:
            best_overlap = 0
            best_cand = None
            for cand in candidates:
                if cand["is_generic"]:
                    continue
                # Substring check for distinct names (>= 7 chars)
                if len(norm_c) >= 7 and len(cand["norm_name"]) >= 7:
                    if norm_c in cand["norm_name"] or cand["norm_name"] in norm_c:
                        best_cand = cand
                        match_type = "FUZZY_SUBSTRING_MATCH"
                        confidence = 0.85
                        break
                # Significant token overlap
                if len(toks_c) >= 2 and len(cand["tokens"]) >= 2:
                    overlap = len(toks_c & cand["tokens"])
                    ratio = overlap / min(len(toks_c), len(cand["tokens"]))
                    if overlap >= 2 and ratio >= 0.8 and overlap > best_overlap:
                        best_overlap = overlap
                        best_cand = cand
                        confidence = round(0.7 + (ratio * 0.2), 2)
                        match_type = "FUZZY_TOKEN_MATCH"

            if best_cand:
                match_record = best_cand

        # Determine Classification Status
        if match_type == "EXACT_NAME_MATCH":
            status = "UPDATE_CANDIDATE"
        elif match_type in ("FUZZY_SUBSTRING_MATCH", "FUZZY_TOKEN_MATCH"):
            status = "POSSIBLE_DUPLICATE"
        else:
            status = "NEW_CANDIDATE_NEEDS_COORDINATES"

        counts_by_status[status] += 1

        record_entry: dict[str, Any] = {
            "record_id": record_id,
            "place_name": raw_place_name,
            "city": standard_city_name,
            "city_code": city_code,
            "curated_group": raw_group_name,
            "db_category": db_category,
            "status": status,
            "has_coordinates": False,  # Curated CSV currently has no lat/lng columns
            "is_multi_branch": is_multi_branch,
            "branch_count": len(branches),
            "address": raw_address,
            "has_description": bool(raw_description),
            "has_opening_hours": bool(raw_hours),
            "has_menu_or_services": bool(raw_services),
            "has_price_level": bool(raw_price_level),
        }

        if match_record:
            ex_poi = match_record["poi"]
            record_entry["match_details"] = {
                "match_type": match_type,
                "confidence": confidence,
                "existing_name": ex_poi.get("name"),
                "existing_osm_type": ex_poi.get("osm_type"),
                "existing_osm_id": ex_poi.get("osm_id"),
                "existing_category": ex_poi.get("category_name"),
                "existing_latitude": float(ex_poi["latitude"]) if ex_poi.get("latitude") else None,
                "existing_longitude": float(ex_poi["longitude"]) if ex_poi.get("longitude") else None,
                "existing_has_address": bool(ex_poi.get("address")),
                "existing_has_description": bool(ex_poi.get("description")),
            }

        classified_records.append(record_entry)

    # 4. Compile Comprehensive Audit Report
    report: dict[str, Any] = {
        "report_metadata": {
            "report_name": "Curated 339 POIs Profiling and Deduplication Audit",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "curated_csv_file": str(curated_csv_path.name),
            "existing_pois_csv_file": str(existing_csv_path.name),
            "total_curated_records": len(curated_rows),
            "total_existing_pois": len(existing_rows),
        },
        "summary": {
            "by_status": dict(counts_by_status),
            "by_city": dict(counts_by_city),
            "by_group": dict(counts_by_group),
            "multi_branch_venues_count": len(multi_branch_records),
            "coordinates_present_in_curated": 0,
            "coordinates_missing_in_curated": len(curated_rows),
        },
        "multi_branch_samples": multi_branch_records[:10],
        "records": classified_records,
    }

    # 5. Write Report to disk
    report_output_path.parent.mkdir(parents=True, exist_ok=True)
    with report_output_path.open("w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    return report


def print_summary_table(report: dict[str, Any]) -> None:
    meta = report["report_metadata"]
    summary = report["summary"]
    by_status = summary["by_status"]

    print("=" * 70)
    print("  GREEN TRIP — CURATED 339 DATASET AUDIT & MATCHING REPORT")
    print("=" * 70)
    print(f"Generated at: {meta['generated_at']}")
    print(f"Curated Source: {meta['curated_csv_file']} ({meta['total_curated_records']} rows)")
    print(f"Baseline POIs: {meta['existing_pois_csv_file']} ({meta['total_existing_pois']} rows)")
    print("-" * 70)
    print("1. CLASSIFICATION BREAKDOWN:")
    print(f"  • UPDATE_CANDIDATE (Exact match with existing POI) : {by_status.get('UPDATE_CANDIDATE', 0):3d} ({by_status.get('UPDATE_CANDIDATE', 0)/meta['total_curated_records']*100:.1f}%)")
    print(f"  • POSSIBLE_DUPLICATE (Fuzzy match / Needs manual review) : {by_status.get('POSSIBLE_DUPLICATE', 0):3d} ({by_status.get('POSSIBLE_DUPLICATE', 0)/meta['total_curated_records']*100:.1f}%)")
    print(f"  • NEW_CANDIDATE (New venue / Needs geocoding)         : {by_status.get('NEW_CANDIDATE_NEEDS_COORDINATES', 0):3d} ({by_status.get('NEW_CANDIDATE_NEEDS_COORDINATES', 0)/meta['total_curated_records']*100:.1f}%)")
    print(f"  • INVALID (Missing required fields)                  : {by_status.get('INVALID', 0):3d}")
    print("-" * 70)
    print("2. GEOGRAPHIC DISTRIBUTION:")
    for city, count in summary["by_city"].items():
        print(f"  • {city:<15}: {count:3d} venues")
    print("-" * 70)
    print("3. CATEGORY TAXONOMY DISTRIBUTION:")
    for group, count in summary["by_group"].items():
        db_cat = CURATED_GROUP_TO_DB_CATEGORY.get(group, group)
        print(f"  • {group:<26} -> {db_cat:<26}: {count:3d}")
    print("-" * 70)
    print(f"4. MULTI-BRANCH VENUES DETECTED: {summary['multi_branch_venues_count']} venues")
    print(f"5. COORDINATES STATUS: 0/{meta['total_curated_records']} have coordinates in raw CSV")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Profile and match 339 curated POIs.")
    parser.add_argument("--curated-csv", type=Path, default=DEFAULT_CURATED_CSV)
    parser.add_argument("--existing-csv", type=Path, default=DEFAULT_EXISTING_CSV)
    parser.add_argument("--output-report", type=Path, default=DEFAULT_REPORT_PATH)
    args = parser.parse_args()

    report_data = profile_and_match(
        curated_csv_path=args.curated_csv,
        existing_csv_path=args.existing_csv,
        report_output_path=args.output_report,
    )
    print_summary_table(report_data)
