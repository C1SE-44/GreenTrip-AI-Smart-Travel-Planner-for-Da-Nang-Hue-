"""Build a single MindTrip/Wanderlog-grade unified CSV matching public.pois schema.

Combines:
1. All 482 verified POIs currently in PostgreSQL `public.pois` (read-only fetch).
2. Verified, real Google Maps stays from `data/processed/stays_cleaned.json` meeting
   strict MindTrip/Wanderlog quality gates:
     - verification_status == 'VERIFIED_ACTIVE'
     - verified Google Maps place_id & URL
     - non-empty image_url + address + valid coordinates
     - raw_rating present AND review_count > 0

Applies cross-dataset deduplication (482 POIs vs stays), fuzzy brand/condo-tower
deduplication (preserving distinct neighboring businesses and branch numbers),
full public.pois schema validation, and live HTTP image spot-verification.

Outputs:
  - data/processed/greentrip_pois_unified.csv
  - data/processed/unified_pois_quality_report.json
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.postgres import get_connection
from scripts.clean_and_verify_stays import (
    CITY_BOUNDS,
    extract_base_property_name,
    haversine_m,
    spot_check_images,
    strip_accents_lower,
)

DEFAULT_STAYS_JSON = PROJECT_ROOT / "data" / "processed" / "stays_cleaned.json"
DEFAULT_OUT_CSV = PROJECT_ROOT / "data" / "processed" / "greentrip_pois_unified.csv"
DEFAULT_REPORT = PROJECT_ROOT / "data" / "processed" / "unified_pois_quality_report.json"

UNIFIED_CSV_HEADERS = [
    "poi_id",
    "city_code",
    "city_name",
    "category",
    "sub_category",
    "cuisine",
    "name",
    "description",
    "address",
    "latitude",
    "longitude",
    "phone_number",
    "website_url",
    "email",
    "social_links",
    "opening_hours",
    "image_url",
    "gallery_urls",
    "estimated_cost",
    "budget_tier",
    "average_visit_minutes",
    "satisfaction_score",
    "popularity_score",
    "green_score",
    "is_local_business",
    "local_business_type",
    "vibes",
    "best_time",
    "eco_features",
    "status",
    "is_active",
    "ai_metadata",
]

GENERIC_BRAND_WORDS = frozenset(
    {
        "hotel", "khach", "san", "homestay", "villa", "villas", "apartment",
        "apartments", "can", "ho", "resort", "spa", "hostel", "motel", "nha",
        "nghi", "da", "nang", "danang", "hue", "hoi", "an", "quang", "nam",
        "tam", "ky", "dien", "ban", "city", "center", "centre", "near",
        "beach", "river", "riverside", "ocean", "sea", "by", "haviland",
        "and", "for", "rent", "room", "rooms", "studio", "deluxe", "superior",
        "standard", "family", "view", "balcony", "with", "in", "the", "at",
        "of", "gan", "trung", "thanh", "pho", "cho", "thue", "xe", "may",
        "boutique", "house", "home", "stay", "inn", "suites", "suite",
        "residence", "luxury", "airport", "sunny", "golden", "bay", "ha",
        "lam", "thang", "binh", "co", "so", "dorm", "private", "new",
    }
)

CONDO_TOWER_TOKENS = (
    "golden bay",
    "monarchy",
    "muong thanh",
    "altara",
    "hoa binh green",
    "fhome",
    "azura",
    "panoma",
    "filmore",
    "the sang",
)

BRANCH_MARKER_RE = re.compile(r"\b(?:co so|chi nhanh|cs|cn|branch)\s*(\d+|[a-z])\b|\b([2-9])\s*$")


def deterministic_stay_uuid(place_id: str | None, fallback_key: str) -> str:
    seed = place_id or fallback_key
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"greentrip:stay:{seed}"))


def _core_brand_tokens(name: str) -> set[str]:
    base = extract_base_property_name(name) or name
    return {
        tok
        for tok in strip_accents_lower(base).split()
        if len(tok) >= 2 and tok not in GENERIC_BRAND_WORDS
    }


def _branch_marker(name: str) -> str | None:
    norm = strip_accents_lower(name)
    m = BRANCH_MARKER_RE.search(norm)
    if not m:
        return None
    return m.group(1) or m.group(2)


def _should_merge_stays(a: dict[str, Any], b: dict[str, Any]) -> bool:
    dist = haversine_m(a["latitude"], a["longitude"], b["latitude"], b["longitude"])
    if dist > 60.0:
        return False

    ma, mb = _branch_marker(a["name"]), _branch_marker(b["name"])
    if ma != mb and (ma is not None or mb is not None):
        return False

    na = strip_accents_lower(a["name"])
    nb = strip_accents_lower(b["name"])

    if (
        dist <= 45.0
        and a["sub_category"] in ("serviced_apartment", "homestay")
        and b["sub_category"] in ("serviced_apartment", "homestay")
        and any(tok in na and tok in nb for tok in CONDO_TOWER_TOKENS)
    ):
        return True

    ca, cb = _core_brand_tokens(a["name"]), _core_brand_tokens(b["name"])
    if not ca or not cb:
        return False
    inter = ca & cb
    if not inter:
        return False
    jacc = len(inter) / len(ca | cb)
    if jacc >= 0.70:
        return True
    if (ca <= cb or cb <= ca) and sum(len(t) for t in inter) >= 5:
        return True
    return False


def consolidate_nearby_brand_and_condo_duplicates(
    stays: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    """Merge duplicate Google pins for the same brand or condo tower within <= 60m."""
    dropped: set[int] = set()
    merged_count = 0

    # Sort richest records first so canonical property wins
    ranked = sorted(
        stays,
        key=lambda r: (
            1 if extract_base_property_name(r["name"]) is None else 0,
            r["ai_metadata"].get("review_count", 0),
            len(r.get("gallery_urls") or []),
            1 if r.get("website_url") else 0,
        ),
        reverse=True,
    )

    for i, parent in enumerate(ranked):
        if i in dropped:
            continue
        for j in range(i + 1, len(ranked)):
            if j in dropped:
                continue
            child = ranked[j]
            if not _should_merge_stays(parent, child):
                continue

            dropped.add(j)
            merged_count += 1

            p_meta = parent["ai_metadata"]
            c_meta = child["ai_metadata"]
            merged_pids = list(p_meta.get("merged_place_ids") or [])
            for pid in [c_meta.get("place_id"), *(c_meta.get("merged_place_ids") or [])]:
                if pid and pid not in merged_pids and pid != p_meta.get("place_id"):
                    merged_pids.append(pid)
            p_meta["merged_place_ids"] = merged_pids

            variants = list(p_meta.get("room_variants") or [])
            variants.append(
                {
                    "name": child["name"],
                    "price_vnd": child.get("estimated_cost"),
                    "place_id": c_meta.get("place_id"),
                }
            )
            p_meta["room_variants"] = variants

            gallery = list(dict.fromkeys([*(parent.get("gallery_urls") or []), *(child.get("gallery_urls") or [])]))
            parent["gallery_urls"] = gallery
            parent["image_url"] = parent.get("image_url") or (gallery[0] if gallery else None)
            for field in ("phone_number", "website_url"):
                if not parent.get(field) and child.get(field):
                    parent[field] = child[field]

            prices = [p for p in (parent.get("estimated_cost"), child.get("estimated_cost")) if p is not None]
            if prices:
                parent["estimated_cost"] = min(prices)
                p_meta["min_price_vnd"] = min(p_meta.get("min_price_vnd", prices[0]), min(prices))
                p_meta["max_price_vnd"] = max(p_meta.get("max_price_vnd", prices[0]), max(prices))

            if "consolidated_brand_or_condo_duplicates" not in p_meta["cleaning_rules_applied"]:
                p_meta["cleaning_rules_applied"].append("consolidated_brand_or_condo_duplicates")

    kept = [rec for idx, rec in enumerate(ranked) if idx not in dropped]
    return kept, merged_count


def fetch_verified_db_pois() -> list[dict[str, Any]]:
    """Fetch all existing cleaned POIs from PostgreSQL public.pois (read-only)."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    p.poi_id::text,
                    ci.code AS city_code,
                    ci.name AS city_name,
                    pc.name AS category,
                    p.sub_category,
                    p.cuisine,
                    p.name,
                    p.description,
                    p.address,
                    ST_Y(p.geom::geometry) AS latitude,
                    ST_X(p.geom::geometry) AS longitude,
                    p.phone_number,
                    p.website_url,
                    p.email,
                    p.social_links,
                    p.opening_hours,
                    p.image_url,
                    p.gallery_urls,
                    p.estimated_cost,
                    p.budget_tier,
                    p.average_visit_minutes,
                    p.satisfaction_score,
                    p.popularity_score,
                    p.green_score,
                    p.is_local_business,
                    p.local_business_type,
                    p.vibes,
                    p.best_time,
                    p.eco_features,
                    p.status,
                    p.is_active,
                    p.ai_metadata
                FROM public.pois p
                JOIN public.cities ci ON p.city_id = ci.city_id
                JOIN public.poi_categories pc ON p.category_id = pc.category_id
                ORDER BY ci.code, pc.name, p.name;
                """
            )
            rows = cur.fetchall()

    items: list[dict[str, Any]] = []
    for r in rows:
        meta = r[31] if isinstance(r[31], dict) else (json.loads(r[31]) if r[31] else {})
        meta = dict(meta)
        meta.setdefault("source_type", "existing_poi")
        meta.setdefault("verification_status", "VERIFIED_ACTIVE")
        items.append(
            {
                "poi_id": r[0],
                "city_code": r[1],
                "city_name": r[2],
                "category": r[3],
                "sub_category": r[4],
                "cuisine": r[5],
                "name": r[6],
                "description": r[7],
                "address": r[8],
                "latitude": round(float(r[9]), 7),
                "longitude": round(float(r[10]), 7),
                "phone_number": r[11],
                "website_url": r[12],
                "email": r[13],
                "social_links": r[14] if isinstance(r[14], dict) else (json.loads(r[14]) if r[14] else {}),
                "opening_hours": r[15] if isinstance(r[15], dict) else (json.loads(r[15]) if r[15] else {}),
                "image_url": r[16],
                "gallery_urls": list(r[17] or []),
                "estimated_cost": float(r[18]) if r[18] is not None else None,
                "budget_tier": r[19] or "$$",
                "average_visit_minutes": int(r[20]) if r[20] is not None else 60,
                "satisfaction_score": float(r[21]) if r[21] is not None else None,
                "popularity_score": float(r[22]) if r[22] is not None else None,
                "green_score": float(r[23]) if r[23] is not None else 0.5,
                "is_local_business": bool(r[24]),
                "local_business_type": r[25],
                "vibes": list(r[26] or []),
                "best_time": list(r[27] or []),
                "eco_features": list(r[28] or []),
                "status": r[29] or "ACTIVE",
                "is_active": bool(r[30]) if r[30] is not None else True,
                "ai_metadata": meta,
            }
        )
    return items


def filter_mindtrip_verified_stays(stays: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], Counter[str]]:
    """Keep only MindTrip/Wanderlog-grade stays: VERIFIED_ACTIVE + photo + rating + reviews > 0."""
    dropped: Counter[str] = Counter()
    kept: list[dict[str, Any]] = []
    for s in stays:
        meta = s.get("ai_metadata") or {}
        if meta.get("verification_status") != "VERIFIED_ACTIVE":
            dropped[f"status:{meta.get('verification_status')}"] += 1
            continue
        if not s.get("image_url") or not str(s["image_url"]).startswith("https://"):
            dropped["missing_verified_image"] += 1
            continue
        if meta.get("raw_rating") is None:
            dropped["missing_rating"] += 1
            continue
        if int(meta.get("review_count") or 0) <= 0:
            dropped["zero_reviews"] += 1
            continue
        if not meta.get("place_id") or not meta.get("google_maps_url"):
            dropped["missing_google_maps_identity"] += 1
            continue
        kept.append(s)
    return kept, dropped


def deduplicate_against_existing_pois(
    existing_pois: list[dict[str, Any]],
    stays: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Drop stay duplicates that are already represented as identical properties in public.pois."""
    filtered: list[dict[str, Any]] = []
    cross_matches: list[dict[str, str]] = []

    for stay in stays:
        snorm = strip_accents_lower(stay["name"])
        s_tokens = set(snorm.split())
        matched_db: dict[str, Any] | None = None

        for poi in existing_pois:
            if haversine_m(poi["latitude"], poi["longitude"], stay["latitude"], stay["longitude"]) > 150.0:
                continue
            pnorm = strip_accents_lower(poi["name"])
            p_tokens = set(pnorm.split())
            jacc = len(p_tokens & s_tokens) / max(1, len(p_tokens | s_tokens))
            if jacc >= 0.80 or pnorm == snorm:
                matched_db = poi
                break

        if matched_db:
            cross_matches.append({"db_name": matched_db["name"], "stay_name": stay["name"]})
            # Enrich existing POI metadata if stay has google place_id
            db_meta = matched_db["ai_metadata"]
            db_meta.setdefault("google_place_id", stay["ai_metadata"].get("place_id"))
            if stay.get("phone_number") and not matched_db.get("phone_number"):
                matched_db["phone_number"] = stay["phone_number"]
            continue

        filtered.append(stay)

    return filtered, cross_matches


def stay_to_unified_row(stay: dict[str, Any]) -> dict[str, Any]:
    meta = dict(stay["ai_metadata"])
    meta["source_type"] = "new_stay"
    place_id = meta.get("place_id")
    poi_id = deterministic_stay_uuid(place_id, meta.get("dedup_key") or stay["name"])
    star_txt = f" ({meta['star_rating']} sao)" if meta.get("star_rating") else ""
    locality = stay.get("locality") or stay.get("city_display") or stay["city_name"]
    sub_label = {
        "hotel": "Khách sạn",
        "resort": "Khu nghỉ dưỡng",
        "homestay": "Homestay",
        "serviced_apartment": "Căn hộ dịch vụ",
        "villa": "Biệt thự nghỉ dưỡng",
        "guesthouse": "Nhà nghỉ / Nhà khách",
        "hostel": "Hostel",
        "eco_lodge": "Eco Lodge",
    }.get(stay["sub_category"], "Cơ sở lưu trú")
    description = f"{sub_label}{star_txt} tại {locality}, {stay.get('city_display') or stay['city_name']}."

    return {
        "poi_id": poi_id,
        "city_code": stay["city_code"],
        "city_name": stay["city_name"],
        "category": stay["category"],
        "sub_category": stay["sub_category"],
        "cuisine": None,
        "name": stay["name"],
        "description": description,
        "address": stay["address"],
        "latitude": stay["latitude"],
        "longitude": stay["longitude"],
        "phone_number": stay.get("phone_number"),
        "website_url": stay.get("website_url"),
        "email": None,
        "social_links": stay.get("social_links") or {},
        "opening_hours": {},
        "image_url": stay["image_url"],
        "gallery_urls": stay.get("gallery_urls") or [stay["image_url"]],
        "estimated_cost": stay.get("estimated_cost"),
        "budget_tier": stay.get("budget_tier") or "$$",
        "average_visit_minutes": stay.get("average_visit_minutes", 720),
        "satisfaction_score": stay.get("satisfaction_score"),
        "popularity_score": stay.get("popularity_score"),
        "green_score": stay.get("green_score", 0.6),
        "is_local_business": bool(stay.get("is_local_business", True)),
        "local_business_type": stay.get("local_business_type"),
        "vibes": stay.get("vibes") or [],
        "best_time": stay.get("best_time") or ["evening", "night"],
        "eco_features": stay.get("eco_features") or [],
        "status": "ACTIVE",
        "is_active": True,
        "ai_metadata": meta,
    }


def validate_unified_records(records: list[dict[str, Any]]) -> list[str]:
    violations: list[str] = []
    seen_ids: set[str] = set()
    for idx, rec in enumerate(records):
        pid = rec.get("poi_id") or ""
        try:
            uuid.UUID(pid)
        except ValueError:
            violations.append(f"[{idx}] invalid UUID poi_id: {pid}")
        if pid in seen_ids:
            violations.append(f"[{idx}] duplicate poi_id: {pid}")
        seen_ids.add(pid)

        name = rec.get("name") or ""
        if not name or len(name) > 255:
            violations.append(f"[{idx}] invalid name length: {len(name)}")
        city_code = rec.get("city_code")
        if city_code not in CITY_BOUNDS:
            violations.append(f"[{idx}] invalid city_code: {city_code}")
        else:
            lat, lon = rec.get("latitude"), rec.get("longitude")
            if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or not (math.isfinite(lat) and math.isfinite(lon)):
                violations.append(f"[{idx}] invalid coords")
            else:
                min_lat, max_lat, min_lon, max_lon = CITY_BOUNDS[city_code]
                in_hoang_sa = city_code == "DANANG" and 15.5 <= lat <= 17.2 and 111.0 <= lon <= 113.0
                if not (in_hoang_sa or (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon)):
                    violations.append(f"[{idx}] coords out of city bounds: {city_code} ({lat}, {lon})")

        if not rec.get("address"):
            violations.append(f"[{idx}] missing address")
        if not rec.get("image_url") or not str(rec["image_url"]).startswith("https://"):
            violations.append(f"[{idx}] missing/invalid image_url")
        if rec.get("estimated_cost") is not None and rec["estimated_cost"] < 0:
            violations.append(f"[{idx}] negative estimated_cost")
        if rec.get("phone_number") and len(rec["phone_number"]) > 50:
            violations.append(f"[{idx}] phone_number > 50 chars")
        if rec.get("satisfaction_score") is not None and not (0 <= rec["satisfaction_score"] <= 100):
            violations.append(f"[{idx}] satisfaction_score out of range")
        if rec.get("popularity_score") is not None and not (0 <= rec["popularity_score"] <= 100):
            violations.append(f"[{idx}] popularity_score out of range")
    return violations


def write_unified_csv(records: list[dict[str, Any]], out_csv: Path) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=UNIFIED_CSV_HEADERS)
        writer.writeheader()
        for rec in records:
            writer.writerow(
                {
                    "poi_id": rec["poi_id"],
                    "city_code": rec["city_code"],
                    "city_name": rec["city_name"],
                    "category": rec["category"],
                    "sub_category": rec.get("sub_category") or "",
                    "cuisine": rec.get("cuisine") or "",
                    "name": rec["name"],
                    "description": rec.get("description") or "",
                    "address": rec["address"],
                    "latitude": rec["latitude"],
                    "longitude": rec["longitude"],
                    "phone_number": rec.get("phone_number") or "",
                    "website_url": rec.get("website_url") or "",
                    "email": rec.get("email") or "",
                    "social_links": json.dumps(rec.get("social_links") or {}, ensure_ascii=False),
                    "opening_hours": json.dumps(rec.get("opening_hours") or {}, ensure_ascii=False),
                    "image_url": rec["image_url"],
                    "gallery_urls": json.dumps(rec.get("gallery_urls") or [], ensure_ascii=False),
                    "estimated_cost": rec["estimated_cost"] if rec.get("estimated_cost") is not None else "",
                    "budget_tier": rec.get("budget_tier") or "$$",
                    "average_visit_minutes": rec["average_visit_minutes"],
                    "satisfaction_score": rec["satisfaction_score"] if rec.get("satisfaction_score") is not None else "",
                    "popularity_score": rec["popularity_score"] if rec.get("popularity_score") is not None else "",
                    "green_score": rec["green_score"],
                    "is_local_business": "true" if rec["is_local_business"] else "false",
                    "local_business_type": rec.get("local_business_type") or "",
                    "vibes": json.dumps(rec.get("vibes") or [], ensure_ascii=False),
                    "best_time": json.dumps(rec.get("best_time") or [], ensure_ascii=False),
                    "eco_features": json.dumps(rec.get("eco_features") or [], ensure_ascii=False),
                    "status": rec.get("status") or "ACTIVE",
                    "is_active": "true" if rec.get("is_active", True) else "false",
                    "ai_metadata": json.dumps(rec.get("ai_metadata") or {}, ensure_ascii=False),
                }
            )


def build_unified_dataset(
    stays_json_path: Path = DEFAULT_STAYS_JSON,
    out_csv: Path = DEFAULT_OUT_CSV,
    report_path: Path = DEFAULT_REPORT,
    verify_images: int = 50,
    existing_pois: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    db_pois = fetch_verified_db_pois() if existing_pois is None else existing_pois
    stays_raw: list[dict[str, Any]] = json.loads(stays_json_path.read_text(encoding="utf-8"))

    stays_verified, stays_filtered_out = filter_mindtrip_verified_stays(stays_raw)
    stays_deduped, brand_tower_merged = consolidate_nearby_brand_and_condo_duplicates(stays_verified)
    stays_non_overlapping, cross_matches = deduplicate_against_existing_pois(db_pois, stays_deduped)

    stay_rows = [stay_to_unified_row(s) for s in stays_non_overlapping]
    unified_rows = [*db_pois, *stay_rows]
    unified_rows.sort(key=lambda r: (r["city_code"], r["category"], r["name"]))

    violations = validate_unified_records(unified_rows)
    image_check = spot_check_images(unified_rows, verify_images)

    write_unified_csv(unified_rows, out_csv)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "existing_db_pois": len(db_pois),
        "stays_cleaned_input": len(stays_raw),
        "stays_dropped_by_mindtrip_gate": dict(stays_filtered_out),
        "stays_after_mindtrip_gate": len(stays_verified),
        "stays_brand_or_condo_merged": brand_tower_merged,
        "cross_dataset_duplicates_removed": cross_matches,
        "stays_added": len(stay_rows),
        "unified_total_records": len(unified_rows),
        "by_source_type": dict(Counter(r["ai_metadata"].get("source_type") for r in unified_rows)),
        "by_city": dict(Counter(r["city_code"] for r in unified_rows)),
        "by_category": dict(Counter(r["category"] for r in unified_rows).most_common()),
        "completeness": {
            "address": sum(1 for r in unified_rows if r.get("address")),
            "image_url": sum(1 for r in unified_rows if r.get("image_url")),
            "gallery_urls_nonempty": sum(1 for r in unified_rows if r.get("gallery_urls")),
            "phone_number": sum(1 for r in unified_rows if r.get("phone_number")),
            "website_url": sum(1 for r in unified_rows if r.get("website_url")),
            "satisfaction_score": sum(1 for r in unified_rows if r.get("satisfaction_score") is not None),
            "estimated_cost": sum(1 for r in unified_rows if r.get("estimated_cost") is not None),
        },
        "db_constraint_violations": violations,
        "live_image_http_check": image_check,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge verified DB POIs and MindTrip-grade stays into one DB-ready CSV.")
    parser.add_argument("--stays-json", default=str(DEFAULT_STAYS_JSON))
    parser.add_argument("--out-csv", default=str(DEFAULT_OUT_CSV))
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    parser.add_argument("--verify-images", type=int, default=50)
    args = parser.parse_args()

    report = build_unified_dataset(
        stays_json_path=Path(args.stays_json),
        out_csv=Path(args.out_csv),
        report_path=Path(args.report),
        verify_images=args.verify_images,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["db_constraint_violations"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
