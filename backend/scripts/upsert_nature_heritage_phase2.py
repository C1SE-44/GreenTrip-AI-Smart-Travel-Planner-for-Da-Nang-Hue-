"""Smart Upsert 97 Verified Nature, Heritage, Craft & Spiritual Places (Đà Nẵng & Huế) into public.pois.

Reads `data/raw/nature_heritage_danang_hue_phase2.json` and performs an idempotent,
safe upsert into PostgreSQL `public.pois`:
- Matches existing POIs by `ai_metadata->>'eco_place_code'`, normalized name,
  or Haversine distance <= 150m with shared keyword tokens within the same city.
- Updates matched POIs in-place (preserving `poi_id` and all foreign keys).
- Inserts new POIs with PostGIS `geography(Point, 4326)` geometry.
- Computes satisfaction, popularity, and high green sustainability scores.
- Defaults to safe DRY-RUN (`conn.rollback()`). Pass `--live-commit` to commit.
"""

from __future__ import annotations

import argparse
from decimal import Decimal
import json
import math
from pathlib import Path
import re
import sys
import unicodedata
import uuid
from typing import Any

from psycopg.types.json import Jsonb

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.postgres import get_connection
from scripts.enrich_poi_scores import (
    calculate_popularity_score,
    calculate_satisfaction_score,
)

PROJECT_ROOT = BACKEND_ROOT.parent
PHASE2_JSON_PATH = PROJECT_ROOT / "data" / "raw" / "nature_heritage_danang_hue_phase2.json"

CITY_MAP: dict[str, str] = {
    "Đà Nẵng": "Da Nang",
    "Da Nang": "Da Nang",
    "Huế": "Hue",
    "Hue": "Hue",
}

CATEGORY_MAP: dict[str, str] = {
    "Cảnh quan và thiên nhiên": "Cảnh quan và thiên nhiên",
    "Di tích lịch sử và văn hóa": "Di tích lịch sử và văn hóa",
    "Tâm linh & Tôn giáo": "Tâm linh & Tôn giáo",
    "Tâm linh và chùa chiền": "Tâm linh & Tôn giáo",
    "Lưu trú và nghỉ dưỡng": "Cảnh quan và thiên nhiên",
}

LOCAL_BIZ_TYPE_BY_SUB: dict[str, str] = {
    "craft_village": "craft_workshop",
    "market": "traditional_market",
    "performance": "cultural_venue",
    "museum": "museum",
    "art_space": "art_gallery",
    "hot_spring": "eco_lodge",
    "eco_resort": "eco_lodge",
    "agritourism": "organic_farm",
    "community_based": "community_tourism",
    "camping": "eco_camping",
    "wellness": "wellness_center",
    "monastery": "spiritual_sanctuary",
    "pagoda": "spiritual_sanctuary",
    "church": "spiritual_sanctuary",
}


def strip_accents(text: str) -> str:
    """Normalize and strip Vietnamese accents."""
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return unicodedata.normalize("NFC", text).lower().strip()


def normalize_vn_name(name: str, strip_parentheses: bool = True) -> str:
    """Normalize Vietnamese establishment names for robust string matching."""
    val = (name or "").strip()
    if strip_parentheses:
        val = re.sub(r"\([^)]*\)", "", val).strip()
    val = strip_accents(val)
    val = re.sub(
        r"^(khu du lich|khu sinh thai|vuon quoc gia|bao tang|chua|thien vien|nha tho|cau|bai bien|bai tam|doi|rung|dam pha|dam|pha|ho|thac|suoi|lang|cho|trung tam)\s+",
        "",
        val,
        flags=re.IGNORECASE,
    ).strip()
    val = re.sub(r"[^\w\s]", " ", val)
    return " ".join(val.split())


def extract_keywords(name: str) -> set[str]:
    """Extract significant keywords from a name for token comparison."""
    clean = normalize_vn_name(name, strip_parentheses=True)
    stop_words = {
        "khu", "du", "lich", "sinh", "thai", "vuon", "quoc", "gia", "bao", "tang",
        "chua", "thien", "vien", "nha", "tho", "cau", "bai", "bien", "tam", "doi",
        "rung", "dam", "pha", "ho", "thac", "suoi", "lang", "cho", "trung", "tam",
        "da", "nang", "hue", "co", "do", "viet", "nam", "va"
    }
    return {w for w in clean.split() if len(w) >= 2 and w not in stop_words}


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Haversine distance in meters between two WGS84 coordinates."""
    earth_radius_m = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    return 2.0 * earth_radius_m * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def match_existing_poi(
    candidate: dict[str, Any],
    existing_rows: list[dict[str, Any]],
) -> str | None:
    """Find matching `poi_id` in the same city."""
    cand_city = CITY_MAP.get(candidate["city"], candidate["city"])
    same_city = [row for row in existing_rows if row["city_name"] == cand_city]

    # 1. Match by stored eco_place_code in ai_metadata
    cand_code = candidate["id"]
    for row in same_city:
        if row.get("eco_place_code") == cand_code:
            return str(row["poi_id"])

    # 2. Match by exact or core normalized name
    cand_exact = strip_accents(candidate["name"])
    cand_core = normalize_vn_name(candidate["name"], strip_parentheses=True)

    for row in same_city:
        row_exact = strip_accents(row["name"])
        row_core = normalize_vn_name(row["name"], strip_parentheses=True)
        if cand_exact == row_exact:
            return str(row["poi_id"])
        if cand_core and len(cand_core) >= 4 and cand_core == row_core:
            return str(row["poi_id"])

    # 3. Containment match for prominent places (e.g. "Bạch Mã", "Lăng Cô", "Đại Nội")
    for row in same_city:
        row_exact = strip_accents(row["name"])
        row_core = normalize_vn_name(row["name"], strip_parentheses=True)
        if cand_core and len(cand_core) >= 6:
            if cand_core in row_exact or row_core in cand_exact:
                return str(row["poi_id"])

    # 4. Proximity + Keyword token overlap
    cand_lat = float(candidate["latitude"])
    cand_lon = float(candidate["longitude"])
    cand_tokens = extract_keywords(candidate["name"])

    best_id: str | None = None
    best_dist = 200.1
    for row in same_city:
        if row.get("latitude") is None or row.get("longitude") is None:
            continue
        dist = haversine_meters(
            cand_lat,
            cand_lon,
            float(row["latitude"]),
            float(row["longitude"]),
        )
        if dist <= 200.0:
            row_tokens = extract_keywords(row["name"])
            if cand_tokens and row_tokens and (cand_tokens & row_tokens):
                if dist < best_dist:
                    best_dist = dist
                    best_id = str(row["poi_id"])

    return best_id


def parse_estimated_cost_and_tier(price_range: str, sub_cat: str) -> tuple[Decimal, str]:
    """Parse Vietnamese price range string into (estimated_cost_vnd, budget_tier)."""
    text = (price_range or "").strip().lower()
    if "miễn phí" in text:
        return Decimal(0), "$"

    raw_nums = re.findall(r"\d+(?:\.\d{3})+", text)
    values = [int(n.replace(".", "")) for n in raw_nums if 10_000 <= int(n.replace(".", "")) <= 20_000_000]

    if not values:
        if "resort" in sub_cat or "onsen" in sub_cat:
            cost = Decimal(1_500_000)
        elif "performance" in sub_cat:
            cost = Decimal(300_000)
        elif "heritage" in sub_cat:
            cost = Decimal(150_000)
        else:
            cost = Decimal(30_000)
    else:
        avg_val = sum(values) // len(values)
        cost = Decimal(int(round(avg_val / 5_000) * 5_000))

    if cost == 0:
        tier = "$"
    elif cost <= 60_000:
        tier = "$"
    elif cost <= 250_000:
        tier = "$$"
    elif cost <= 800_000:
        tier = "$$$"
    else:
        tier = "$$$$"

    return cost, tier


def compute_nature_heritage_green_score(item: dict[str, Any]) -> float:
    """Calculate multi-criteria green sustainability score for Phase 2 places (0.0 to 1.0)."""
    score = 0.70
    if item.get("is_zero_waste_friendly"):
        score += 0.12
    if item.get("is_vegetarian_friendly"):
        score += 0.08

    sub = (item.get("sub_category") or "").lower()
    if sub in ("national_park", "mangrove_forest", "lagoon", "agritourism", "community_based", "monastery"):
        score += 0.08
    elif sub in ("craft_village", "heritage", "stream", "waterfall"):
        score += 0.05

    eco_high = (item.get("eco_highlights") or "").lower()
    if any(k in eco_high for k in ("hữu cơ", "nguyên sinh", "bảo tồn", "unesco", "di sản", "sinh thái", "làng mai")):
        score += 0.05

    return min(1.0, round(score, 2))


def build_poi_payload(
    item: dict[str, Any],
    city_id: str,
    category_id: str,
    poi_id: str | None = None,
) -> dict[str, Any]:
    """Construct psycopg payload dictionary with strict type mapping."""
    resolved_id = poi_id or str(uuid.uuid4())
    sub_cat = item.get("sub_category", "")

    cost, budget_tier = parse_estimated_cost_and_tier(item.get("price_range", ""), sub_cat)

    if sub_cat in ("national_park", "heritage", "museum", "hot_spring", "eco_resort"):
        visit_minutes = 150
    elif sub_cat in ("craft_village", "lagoon", "adventure", "camping"):
        visit_minutes = 120
    else:
        visit_minutes = 90

    sat_score = calculate_satisfaction_score(item.get("rating"), item.get("review_count"))
    pop_score = calculate_popularity_score(
        item.get("review_count"),
        name=item["name"],
        description=item.get("eco_highlights", ""),
        category=item.get("db_category", "Cảnh quan và thiên nhiên"),
        sub_category=sub_cat,
    )
    grn_score = compute_nature_heritage_green_score(item)

    eco_highlights = (item.get("eco_highlights") or "").strip()
    eco_features = [part.strip() for part in re.split(r"[,;]", eco_highlights) if part.strip()]

    vibes = item.get("activities_list") or [
        t.strip() for t in (item.get("activities_tags") or "").split(";") if t.strip()
    ]
    best_time = [str(x).strip() for x in (item.get("best_time") or []) if str(x).strip()]

    open_text = (item.get("opening_hours") or "07:00 - 18:00").strip()
    live_status = (item.get("opening_hours_live_status") or "Mở cửa đón khách").strip()

    opening_hours_json: dict[str, Any] = {
        "status_text": open_text,
        "live_status": live_status,
        "open_now": True,
        "is_temporarily_closed": False,
        "seasonal_note": item.get("seasonal_note", ""),
    }

    social_links_json: dict[str, str] = {}
    if item.get("facebook_url"):
        social_links_json["facebook"] = str(item["facebook_url"]).strip()
    if item.get("google_maps_url"):
        social_links_json["google_maps"] = str(item["google_maps_url"]).strip()

    ai_metadata_json: dict[str, Any] = {
        "eco_place_code": item["id"],
        "area": item.get("area", ""),
        "google_category": item.get("google_category", ""),
        "mindtrip_category": item.get("mindtrip_category", "Nature & Explore"),
        "raw_rating": float(item.get("rating", 4.6)),
        "review_count": int(item.get("review_count", 0)),
        "price_range_display": item.get("price_range", ""),
        "recommended_duration_hours": item.get("recommended_duration_hours", "2.0"),
        "eco_highlights": eco_highlights,
        "amenities": item.get("amenities") or [],
        "featured_reviews": item.get("featured_reviews") or [],
        "sample_reviews": item.get("sample_reviews") or [],
        "transport_tip": (item.get("transport_tip") or "").strip(),
        "seasonal_note": (item.get("seasonal_note") or "").strip(),
        "is_vegetarian_friendly": bool(item.get("is_vegetarian_friendly")),
        "is_zero_waste_friendly": bool(item.get("is_zero_waste_friendly")),
        "external_booking_url": item.get("external_booking_url", ""),
        "carbon_footprint_score": int(round(grn_score * 100)),
        "source": "curated_phase2_nature_heritage_97",
    }

    gallery_urls = [str(u).strip() for u in (item.get("gallery_urls") or []) if str(u).strip()]
    image_url = str(item.get("image_url") or (gallery_urls[0] if gallery_urls else "")).strip()

    desc = f"{item['name']} tại {item.get('area', '')}, {item['city']}. {eco_highlights}"

    return {
        "poi_id": resolved_id,
        "city_id": city_id,
        "category_id": category_id,
        "name": item["name"].strip(),
        "description": desc.strip(),
        "address": item["address"].strip(),
        "lat": float(item["latitude"]),
        "lon": float(item["longitude"]),
        "estimated_cost": cost,
        "average_visit_minutes": visit_minutes,
        "satisfaction_score": Decimal(str(sat_score)),
        "popularity_score": Decimal(str(pop_score)),
        "green_score": grn_score,
        "is_local_business": True,
        "local_business_type": LOCAL_BIZ_TYPE_BY_SUB.get(sub_cat, "attraction"),
        "status": "ACTIVE",
        "is_active": True,
        "image_url": image_url,
        "gallery_urls": gallery_urls,
        "sub_category": sub_cat,
        "cuisine": None,
        "budget_tier": budget_tier,
        "vibes": vibes,
        "best_time": best_time,
        "eco_features": eco_features,
        "phone_number": (item.get("phone") or "").strip() or None,
        "website_url": (item.get("website_url") or "").strip() or None,
        "social_links": Jsonb(social_links_json),
        "opening_hours": Jsonb(opening_hours_json),
        "ai_metadata": Jsonb(ai_metadata_json),
    }


def upsert_nature_heritage_phase2(
    live_commit: bool = False,
    json_path: Path = PHASE2_JSON_PATH,
) -> dict[str, Any]:
    """Execute Smart Upsert of Phase 2 establishments into `public.pois`."""
    if not json_path.exists():
        raise FileNotFoundError(f"Dataset not found: {json_path}")

    items: list[dict[str, Any]] = json.loads(json_path.read_text(encoding="utf-8"))
    print(f"Loaded {len(items)} Phase 2 establishments from {json_path}")

    with get_connection() as conn:
        with conn.cursor() as cur:
            # 1. Fetch cities
            cur.execute("SELECT city_id::text, name FROM public.cities;")
            city_ids = {row[1]: row[0] for row in cur.fetchall()}

            # 2. Fetch categories
            cur.execute("SELECT category_id::text, name FROM public.poi_categories;")
            cat_ids = {row[1]: row[0] for row in cur.fetchall()}

            # 3. Fetch existing POIs
            cur.execute(
                """
                SELECT
                    p.poi_id::text,
                    p.name,
                    ci.name AS city_name,
                    ST_Y(p.geom::geometry) AS latitude,
                    ST_X(p.geom::geometry) AS longitude,
                    p.ai_metadata->>'eco_place_code' AS eco_place_code
                FROM public.pois p
                JOIN public.cities ci ON p.city_id = ci.city_id;
                """
            )
            existing_rows = [
                {
                    "poi_id": r[0],
                    "name": r[1],
                    "city_name": r[2],
                    "latitude": r[3],
                    "longitude": r[4],
                    "eco_place_code": r[5],
                }
                for r in cur.fetchall()
            ]

            count_before = len(existing_rows)

            update_sql = """
                UPDATE public.pois
                SET
                    city_id = %(city_id)s::uuid,
                    category_id = %(category_id)s::uuid,
                    name = %(name)s,
                    description = %(description)s,
                    address = %(address)s,
                    geom = ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
                    estimated_cost = %(estimated_cost)s,
                    average_visit_minutes = %(average_visit_minutes)s,
                    satisfaction_score = %(satisfaction_score)s,
                    popularity_score = %(popularity_score)s,
                    green_score = %(green_score)s,
                    is_local_business = %(is_local_business)s,
                    local_business_type = %(local_business_type)s,
                    status = %(status)s,
                    is_active = %(is_active)s,
                    image_url = %(image_url)s,
                    gallery_urls = %(gallery_urls)s,
                    sub_category = %(sub_category)s,
                    budget_tier = %(budget_tier)s,
                    vibes = %(vibes)s,
                    best_time = %(best_time)s,
                    eco_features = %(eco_features)s,
                    phone_number = %(phone_number)s,
                    website_url = %(website_url)s,
                    social_links = COALESCE(social_links, '{}'::jsonb) || %(social_links)s,
                    opening_hours = %(opening_hours)s,
                    ai_metadata = COALESCE(ai_metadata, '{}'::jsonb) || %(ai_metadata)s,
                    updated_at = NOW()
                WHERE poi_id = %(poi_id)s::uuid;
            """

            insert_sql = """
                INSERT INTO public.pois (
                    poi_id,
                    city_id,
                    category_id,
                    name,
                    description,
                    address,
                    geom,
                    estimated_cost,
                    average_visit_minutes,
                    satisfaction_score,
                    popularity_score,
                    green_score,
                    is_local_business,
                    local_business_type,
                    status,
                    is_active,
                    image_url,
                    gallery_urls,
                    sub_category,
                    cuisine,
                    budget_tier,
                    vibes,
                    best_time,
                    eco_features,
                    phone_number,
                    website_url,
                    social_links,
                    opening_hours,
                    ai_metadata,
                    created_at,
                    updated_at
                ) VALUES (
                    %(poi_id)s::uuid,
                    %(city_id)s::uuid,
                    %(category_id)s::uuid,
                    %(name)s,
                    %(description)s,
                    %(address)s,
                    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
                    %(estimated_cost)s,
                    %(average_visit_minutes)s,
                    %(satisfaction_score)s,
                    %(popularity_score)s,
                    %(green_score)s,
                    %(is_local_business)s,
                    %(local_business_type)s,
                    %(status)s,
                    %(is_active)s,
                    %(image_url)s,
                    %(gallery_urls)s,
                    %(sub_category)s,
                    %(cuisine)s,
                    %(budget_tier)s,
                    %(vibes)s,
                    %(best_time)s,
                    %(eco_features)s,
                    %(phone_number)s,
                    %(website_url)s,
                    %(social_links)s,
                    %(opening_hours)s,
                    %(ai_metadata)s,
                    NOW(),
                    NOW()
                );
            """

            updated_count = 0
            inserted_count = 0
            matched_details: list[dict[str, str]] = []

            for item in items:
                db_city_name = CITY_MAP.get(item["city"], item["city"])
                city_id = city_ids.get(db_city_name)
                if not city_id:
                    raise ValueError(f"Unknown city: {item['city']}")

                db_cat_name = CATEGORY_MAP.get(item["db_category"], item["db_category"])
                category_id = cat_ids.get(db_cat_name)
                if not category_id:
                    raise ValueError(f"Unknown category: {item['db_category']} -> {db_cat_name}")

                matched_poi_id = match_existing_poi(item, existing_rows)

                if matched_poi_id:
                    payload = build_poi_payload(item, city_id, category_id, poi_id=matched_poi_id)
                    cur.execute(update_sql, payload)
                    updated_count += 1
                    matched_details.append({
                        "id": item["id"],
                        "name": item["name"],
                        "action": "UPDATE",
                        "poi_id": matched_poi_id,
                    })
                else:
                    new_id = str(uuid.uuid4())
                    payload = build_poi_payload(item, city_id, category_id, poi_id=new_id)
                    cur.execute(insert_sql, payload)
                    inserted_count += 1
                    # Append to existing_rows to prevent duplicate insertions within this batch
                    existing_rows.append({
                        "poi_id": new_id,
                        "name": item["name"],
                        "city_name": db_city_name,
                        "latitude": float(item["latitude"]),
                        "longitude": float(item["longitude"]),
                        "eco_place_code": item["id"],
                    })
                    matched_details.append({
                        "id": item["id"],
                        "name": item["name"],
                        "action": "INSERT",
                        "poi_id": new_id,
                    })

            cur.execute("SELECT count(*) FROM public.pois;")
            count_after = cur.fetchone()[0]

            if live_commit:
                conn.commit()
                print(f"[LIVE COMMIT SUCCESS] public.pois: {count_before} -> {count_after}")
            else:
                conn.rollback()
                print(f"[DRY RUN SUCCESS (Rollback)] public.pois would change: {count_before} -> {count_before + inserted_count}")

            print(f"Summary: {len(items)} processed | {updated_count} UPDATED | {inserted_count} INSERTED")
            return {
                "total_processed": len(items),
                "updated_count": updated_count,
                "inserted_count": inserted_count,
                "count_before": count_before,
                "count_after": count_after if live_commit else (count_before + inserted_count),
                "live_commit": live_commit,
                "matched_details": matched_details,
            }


def main():
    parser = argparse.ArgumentParser(description="Smart Upsert Phase 2 Nature & Heritage POIs into PostgreSQL")
    parser.add_argument("--live-commit", action="store_true", help="Commit changes to database (default is dry-run)")
    args = parser.parse_args()

    upsert_nature_heritage_phase2(live_commit=args.live_commit)


if __name__ == "__main__":
    main()
