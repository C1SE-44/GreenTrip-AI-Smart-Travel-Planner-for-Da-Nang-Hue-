"""Smart Upsert 118 Verified Food & Beverage / Cafe Places (Đà Nẵng & Huế) into public.pois.

Reads `data/raw/food_beverage_danang_hue_phase1.json` and performs an idempotent,
safe upsert into PostgreSQL `public.pois`:
- Matches existing POIs by `ai_metadata->>'food_place_code'`, normalized name,
  or Haversine distance <= 150m with shared brand tokens.
- Updates matched POIs in-place (preserving `poi_id` and all foreign keys).
- Inserts new POIs with PostGIS `geography(Point, 4326)` geometry.
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
    calculate_green_score,
    calculate_popularity_score,
    calculate_satisfaction_score,
)

PROJECT_ROOT = BACKEND_ROOT.parent
PHASE1_JSON_PATH = PROJECT_ROOT / "data" / "raw" / "food_beverage_danang_hue_phase1.json"

CITY_MAP: dict[str, str] = {
    "Đà Nẵng": "Da Nang",
    "Da Nang": "Da Nang",
    "Huế": "Hue",
    "Hue": "Hue",
}

BUSINESS_TYPE_BY_CAT: dict[str, str] = {
    "Ẩm thực và quán ăn": "restaurant",
    "Quán cafe giải khát": "cafe",
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
        r"^(quán|nhà hàng|tiệm|cà phê|cafe|trà quán|trà đình|xưởng|tiệm bánh|bánh ép|bún chả cá|bún bò|mì quảng)\s+",
        "",
        val,
        flags=re.IGNORECASE,
    ).strip()
    val = re.sub(r"[^\w\s]", " ", val)
    return " ".join(val.split())


def extract_brand_tokens(name: str) -> set[str]:
    """Extract significant brand keywords from an establishment name."""
    clean = normalize_vn_name(name, strip_parentheses=True)
    stop_words = {
        "quan", "nha", "hang", "tiem", "ca", "phe", "cafe", "dac", "san",
        "da", "nang", "hue", "mon", "viet", "ngon", "truyen", "thong",
        "chay", "tra", "banh", "bun", "mi", "hai", "san", "pho", "co"
    }
    tokens = {word for word in clean.split() if len(word) >= 2 and word not in stop_words}
    return tokens


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
    """Find matching `poi_id` in the same city without false-positive collisions."""
    cand_city = CITY_MAP.get(candidate["city"], candidate["city"])
    same_city = [row for row in existing_rows if row["city_name"] == cand_city]

    cand_code = candidate["id"]
    for row in same_city:
        if row.get("food_place_code") == cand_code:
            return str(row["poi_id"])

    cand_exact = strip_accents(candidate["name"])
    cand_core = normalize_vn_name(candidate["name"], strip_parentheses=True)

    for row in same_city:
        row_exact = strip_accents(row["name"])
        row_core = normalize_vn_name(row["name"], strip_parentheses=True)
        if cand_exact == row_exact or (cand_core and cand_core == row_core):
            return str(row["poi_id"])

    cand_lat = float(candidate["latitude"])
    cand_lon = float(candidate["longitude"])
    cand_tokens = extract_brand_tokens(candidate["name"])

    best_id: str | None = None
    best_dist = 150.1
    for row in same_city:
        if row.get("latitude") is None or row.get("longitude") is None:
            continue
        dist = haversine_meters(
            cand_lat,
            cand_lon,
            float(row["latitude"]),
            float(row["longitude"]),
        )
        if dist <= 150.0:
            row_tokens = extract_brand_tokens(row["name"])
            if cand_tokens and row_tokens and (cand_tokens & row_tokens):
                if dist < best_dist:
                    best_dist = dist
                    best_id = str(row["poi_id"])

    return best_id


def parse_estimated_cost_and_tier(
    price_range: str,
    db_category: str,
) -> tuple[Decimal, str]:
    """Parse Vietnamese price range string into (estimated_cost_vnd, budget_tier)."""
    text = (price_range or "").strip()
    raw_nums = re.findall(r"\d+(?:\.\d{3})+", text)
    values = [int(n.replace(".", "")) for n in raw_nums if 10_000 <= int(n.replace(".", "")) <= 20_000_000]

    if not values:
        fallback = Decimal(45_000) if "cafe" in db_category.lower() else Decimal(60_000)
    else:
        avg_val = sum(values) // len(values)
        rounded = int(round(avg_val / 5_000) * 5_000)
        fallback = Decimal(rounded)

    if fallback <= 60_000:
        tier = "$"
    elif fallback <= 250_000:
        tier = "$$"
    elif fallback <= 600_000:
        tier = "$$$"
    else:
        tier = "$$$$"

    return fallback, tier


def compute_food_green_score(item: dict[str, Any]) -> float:
    """Calculate multi-criteria green score for dining & cafe places (0.0 to 1.0)."""
    score = 0.50
    if item.get("is_vegetarian_friendly"):
        score += 0.25
    if item.get("is_zero_waste_friendly"):
        score += 0.15
    eco_high = (item.get("eco_highlights") or "").lower()
    if any(k in eco_high for k in ("hữu cơ", "organic", "trà quế", "nông sản", "bản địa", "sạch")):
        score += 0.10
    return min(1.0, round(score, 2))


def build_poi_payload(
    item: dict[str, Any],
    city_id: str,
    category_id: str,
    poi_id: str | None = None,
) -> dict[str, Any]:
    """Construct psycopg payload dictionary with strict type mapping."""
    resolved_id = poi_id or str(uuid.uuid4())
    db_cat = item["db_category"]

    cost, budget_tier = parse_estimated_cost_and_tier(item.get("price_range", ""), db_cat)
    visit_minutes = 60 if "cafe" in db_cat.lower() else 75

    sat_score = calculate_satisfaction_score(item.get("rating"), item.get("review_count"))
    pop_score = calculate_popularity_score(
        item.get("review_count"),
        name=item["name"],
        description=item.get("eco_highlights", ""),
        category=db_cat,
        sub_category=item.get("sub_category", ""),
    )
    grn_score = compute_food_green_score(item)

    eco_highlights = (item.get("eco_highlights") or "").strip()
    eco_features = [part.strip() for part in re.split(r"[,;]", eco_highlights) if part.strip()]

    vibes = item.get("activities_list") or [
        t.strip() for t in (item.get("activities_tags") or "").split(";") if t.strip()
    ]
    best_time = [str(x).strip() for x in (item.get("best_time") or []) if str(x).strip()]

    open_text = (item.get("opening_hours") or "07:00 - 22:00").strip()
    live_status = (item.get("opening_hours_live_status") or "Đang mở cửa").strip()

    seasonal_note = (item.get("seasonal_note") or "").strip()
    transport_tip = (item.get("transport_tip") or "").strip()

    opening_hours_json: dict[str, Any] = {
        "status_text": open_text,
        "live_status": live_status,
        "open_now": True,
        "is_temporarily_closed": False,
        "seasonal_note": seasonal_note,
    }

    social_links_json: dict[str, str] = {}
    if item.get("facebook_url"):
        social_links_json["facebook"] = str(item["facebook_url"]).strip()
    if item.get("google_maps_url"):
        social_links_json["google_maps"] = str(item["google_maps_url"]).strip()

    ai_metadata_json: dict[str, Any] = {
        "food_place_code": item["id"],
        "area": item.get("area", ""),
        "google_category": item.get("google_category", ""),
        "mindtrip_category": item.get("mindtrip_category", "Food & Dining"),
        "raw_rating": float(item.get("rating", 4.4)),
        "review_count": int(item.get("review_count", 0)),
        "price_range_display": item.get("price_range_display") or item.get("price_range", ""),
        "menu_image_url": item.get("menu_image_url") or "",
        "menu_items": item.get("menu_items") or [],
        "recommended_duration_hours": item.get("recommended_duration_hours", "1.0"),
        "eco_highlights": eco_highlights,
        "amenities": item.get("amenities") or [],
        "featured_reviews": item.get("featured_reviews") or [],
        "sample_reviews": item.get("sample_reviews") or [],
        "transport_tip": transport_tip,
        "seasonal_note": seasonal_note,
        "is_vegetarian_friendly": bool(item.get("is_vegetarian_friendly")),
        "is_zero_waste_friendly": bool(item.get("is_zero_waste_friendly")),
        "external_booking_url": item.get("external_booking_url", ""),
        "carbon_footprint_score": int(round(grn_score * 100)),
        "source": "curated_phase1_food_beverage_118",
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
        "local_business_type": BUSINESS_TYPE_BY_CAT.get(db_cat, "restaurant"),
        "status": "ACTIVE",
        "is_active": True,
        "image_url": image_url,
        "gallery_urls": gallery_urls,
        "sub_category": item.get("sub_category") or None,
        "cuisine": item.get("sub_category", "Vietnamese"),
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


def upsert_food_beverage_phase1(
    live_commit: bool = False,
    json_path: Path = PHASE1_JSON_PATH,
) -> dict[str, Any]:
    """Execute Smart Upsert of Phase 1 food & beverage places into `public.pois`."""
    if not json_path.exists():
        raise FileNotFoundError(f"Dataset not found: {json_path}")

    items: list[dict[str, Any]] = json.loads(json_path.read_text(encoding="utf-8"))
    print(f"Loaded {len(items)} Phase 1 establishments from {json_path}")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT city_id::text, name FROM public.cities;")
            city_ids = {row[1]: row[0] for row in cur.fetchall()}

            cur.execute("SELECT category_id::text, name FROM public.poi_categories;")
            cat_ids = {row[1]: row[0] for row in cur.fetchall()}

            cur.execute(
                """
                SELECT
                    p.poi_id::text,
                    p.name,
                    ci.name AS city_name,
                    ST_Y(p.geom::geometry) AS latitude,
                    ST_X(p.geom::geometry) AS longitude,
                    p.ai_metadata->>'food_place_code' AS food_place_code
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
                    "food_place_code": r[5],
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
                    cuisine = COALESCE(%(cuisine)s, cuisine),
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
                    poi_id, city_id, category_id, name, description, address,
                    geom, estimated_cost, average_visit_minutes,
                    satisfaction_score, popularity_score, green_score,
                    is_local_business, local_business_type, status, is_active,
                    image_url, gallery_urls, sub_category, cuisine, budget_tier,
                    vibes, best_time, eco_features,
                    phone_number, website_url, social_links, opening_hours, ai_metadata,
                    created_at, updated_at
                ) VALUES (
                    %(poi_id)s::uuid, %(city_id)s::uuid, %(category_id)s::uuid,
                    %(name)s, %(description)s, %(address)s,
                    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
                    %(estimated_cost)s, %(average_visit_minutes)s,
                    %(satisfaction_score)s, %(popularity_score)s, %(green_score)s,
                    %(is_local_business)s, %(local_business_type)s, %(status)s, %(is_active)s,
                    %(image_url)s, %(gallery_urls)s, %(sub_category)s, %(cuisine)s, %(budget_tier)s,
                    %(vibes)s, %(best_time)s, %(eco_features)s,
                    %(phone_number)s, %(website_url)s, %(social_links)s, %(opening_hours)s, %(ai_metadata)s,
                    NOW(), NOW()
                );
            """

            updated_ids: list[str] = []
            inserted_ids: list[str] = []
            claimed_poi_ids: set[str] = set()

            # Ensure category mapping fallbacks
            default_cat = cat_ids.get("Ẩm thực và quán ăn") or list(cat_ids.values())[0]

            for item in items:
                db_city = CITY_MAP[item["city"]]
                db_cat = item["db_category"]

                city_id = city_ids.get(db_city)
                if not city_id:
                    raise KeyError(f"City '{db_city}' not found in public.cities")

                category_id = cat_ids.get(db_cat, default_cat)

                available_existing = [r for r in existing_rows if r["poi_id"] not in claimed_poi_ids]
                matched_poi_id = match_existing_poi(item, available_existing)

                payload = build_poi_payload(
                    item=item,
                    city_id=city_id,
                    category_id=category_id,
                    poi_id=matched_poi_id,
                )

                if matched_poi_id:
                    cur.execute(update_sql, payload)
                    claimed_poi_ids.add(matched_poi_id)
                    updated_ids.append(f"{item['id']} -> {item['name']} ({matched_poi_id})")
                else:
                    cur.execute(insert_sql, payload)
                    inserted_ids.append(f"{item['id']} -> {item['name']} ({payload['poi_id']})")

            cur.execute("SELECT COUNT(*) FROM public.pois;")
            count_after = cur.fetchone()[0]

            stats = {
                "count_before": count_before,
                "count_after": count_after,
                "total_processed": len(items),
                "updated_count": len(updated_ids),
                "inserted_count": len(inserted_ids),
                "live_commit": live_commit,
            }

            if live_commit:
                conn.commit()
                print(f"[LIVE COMMIT] Successfully upserted {len(items)} Phase 1 POIs!")
            else:
                conn.rollback()
                print(f"[DRY RUN] Rolled back changes. Previewed {len(items)} POIs.")

            print(f"Stats: before={count_before}, after={count_after}, updated={len(updated_ids)}, inserted={len(inserted_ids)}")
            return stats


def main():
    parser = argparse.ArgumentParser(description="Smart Upsert Phase 1 Food & Beverage POIs")
    parser.add_argument(
        "--live-commit",
        action="store_true",
        help="Commit changes to database (default is dry-run)",
    )
    args = parser.parse_args()
    upsert_food_beverage_phase1(live_commit=args.live_commit)


if __name__ == "__main__":
    main()
