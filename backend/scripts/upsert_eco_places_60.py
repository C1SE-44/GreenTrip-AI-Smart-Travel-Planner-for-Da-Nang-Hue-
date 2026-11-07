"""Smart Upsert 60 Verified Eco-Friendly Places (Đà Nẵng & Huế) into public.pois.

Reads `data/raw/eco_places_danang_hue_60.json` crawled via Browsentic MCP and
performs a safe, non-destructive Upsert into `public.pois`:
- Matches existing POIs by `ai_metadata->>'eco_place_code'`, normalized name in
  the same city, or Haversine distance <= 150m with shared core brand tokens.
- Updates matched POIs in-place (preserving `poi_id` and foreign-key relations).
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
ECO_JSON_PATH = PROJECT_ROOT / "data" / "raw" / "eco_places_danang_hue_60.json"

CITY_MAP: dict[str, str] = {
    "Đà Nẵng": "Da Nang",
    "Da Nang": "Da Nang",
    "Huế": "Hue",
    "Hue": "Hue",
}

BUSINESS_TYPE_BY_CAT: dict[str, str] = {
    "Ẩm thực và quán ăn": "restaurant",
    "Quán cafe giải khát": "cafe",
    "Cảnh quan và thiên nhiên": "sightseeing",
    "Di tích lịch sử và văn hóa": "heritage",
    "Tâm linh và chùa thiền": "spiritual",
}

GENERIC_PREFIXES = (
    "nha hang chay ",
    "quan chay ",
    "nha hang ",
    "khu du lich sinh thai ",
    "khu sinh thai ",
    "khu cam trai ",
    "lang sinh thai ",
    "lang nghe dan lat ",
    "lang nghe ",
    "lang co ",
    "danh thang ",
    "thuc pham sach ",
    "hop tac xa ",
    "htx ",
    "quan ",
)

STOPWORD_TOKENS = {
    "nha",
    "hang",
    "quan",
    "chay",
    "cafe",
    "coffee",
    "caphe",
    "phe",
    "farm",
    "eco",
    "green",
    "hue",
    "nang",
    "khu",
    "sinh",
    "thai",
    "lang",
    "nghe",
    "glamping",
    "camping",
    "garden",
    "vegetarian",
    "vegan",
    "bistro",
    "the",
    "and",
    "phu",
    "hoa",
    "son",
    "nam",
    "bac",
}


def strip_accents(text: str) -> str:
    """Convert Vietnamese text to ASCII lowercase tokens."""
    if not text:
        return ""
    replaced = text.replace("đ", "d").replace("Đ", "D")
    decomposed = unicodedata.normalize("NFD", replaced)
    without_marks = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", without_marks).lower()
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_vn_name(name: str, strip_parentheses: bool = False) -> str:
    """Normalize a POI name for deterministic matching."""
    raw = re.sub(r"\([^)]*\)", " ", name) if strip_parentheses else name
    norm = strip_accents(raw)
    for prefix in GENERIC_PREFIXES:
        if norm.startswith(prefix) and len(norm) > len(prefix) + 2:
            norm = norm[len(prefix) :].strip()
            break
    return norm


def extract_brand_tokens(name: str) -> set[str]:
    """Extract distinctive brand tokens to prevent nearby distinct farms from colliding."""
    norm = normalize_vn_name(name, strip_parentheses=True)
    return {tok for tok in norm.split() if len(tok) >= 3 and tok not in STOPWORD_TOKENS}


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
        if row.get("eco_place_code") == cand_code:
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
    lower = text.lower()

    if lower.startswith("miễn phí") or lower == "free":
        return Decimal(0), "free"

    raw_nums = re.findall(r"\d+(?:\.\d{3})+", text)
    values = [int(n.replace(".", "")) for n in raw_nums if 5_000 <= int(n.replace(".", "")) <= 20_000_000]

    if not values:
        if "miễn phí" in lower:
            return Decimal(0), "free"
        fallback = Decimal(45_000) if db_category in ("Quán cafe giải khát", "Ẩm thực và quán ăn") else Decimal(0)
    else:
        avg_val = sum(values) // len(values)
        rounded = int(round(avg_val / 5_000) * 5_000)
        fallback = Decimal(rounded)

    if fallback <= 0:
        tier = "free"
    elif fallback <= 120_000:
        tier = "$"
    elif fallback <= 500_000:
        tier = "$$"
    else:
        tier = "$$$"

    return fallback, tier


def parse_average_visit_minutes(duration_hours: str, db_category: str) -> int:
    """Convert recommended_duration_hours (e.g. '1.5-2', '4-24') into realistic visit minutes."""
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", duration_hours or "")]
    if not nums:
        return 90 if db_category in ("Cảnh quan và thiên nhiên", "Di tích lịch sử và văn hóa") else 60

    if len(nums) >= 2:
        low, high = nums[0], nums[1]
        if high >= 10.0:
            # Overnight camping / eco-stay: schedule a 4-hour block in day-trip planner
            minutes = int(round(max(low, 4.0) * 60))
        else:
            minutes = int(round(((low + high) / 2.0) * 60))
    else:
        minutes = int(round(nums[0] * 60))

    return max(30, min(240, int(round(minutes / 15) * 15)))


def infer_cuisine(item: dict[str, Any]) -> str | None:
    """Infer standardized CuisineType for food & cafe POIs."""
    cat = item.get("db_category", "")
    if cat not in ("Ẩm thực và quán ăn", "Quán cafe giải khát"):
        return None
    blob = f"{item.get('name', '')} {item.get('sub_category', '')} {item.get('activities_tags', '')}".lower()
    if any(k in blob for k in ("chay", "vegan", "vegetarian", "plant", "organic")):
        return "plant_based_vegan"
    if "pizza" in blob:
        return "italian_pizza"
    if cat == "Ẩm thực và quán ăn":
        return "vietnamese_local"
    return None


def compute_curated_green_score(item: dict[str, Any], db_city_name: str) -> float:
    """Compute MCDA green score enriched with verified eco-friendly operational highlights."""
    base = calculate_green_score(
        category=item["db_category"],
        sub_category=item.get("sub_category", ""),
        cuisine=infer_cuisine(item) or "",
        city=db_city_name,
        address=item.get("address", ""),
        name=item["name"],
        description=f"{item.get('description', '')} {item.get('eco_highlights', '')}",
    )
    eco_blob = f"{item.get('eco_highlights', '')} {item.get('activities_tags', '')}".lower()
    eco_bonus = 0.0
    if any(k in eco_blob for k in ("không rác thải nhựa", "giảm nhựa", "zero_waste", "tái chế", "hữu cơ", "organic", "bảo tồn", "net zero")):
        eco_bonus += 0.08
    if any(k in eco_blob for k in ("ít bê tông", "không động cơ", "cycling", "kayak", "sup", "năng lượng", "vườn", "rừng")):
        eco_bonus += 0.06
    return round(min(0.98, max(0.78, base + eco_bonus)), 2)


def build_poi_payload(
    item: dict[str, Any],
    city_id: str,
    category_id: str,
    poi_id: str | None = None,
) -> dict[str, Any]:
    """Assemble full SQL parameter dictionary for INSERT or UPDATE on `public.pois`."""
    resolved_id = poi_id or str(uuid.uuid4())
    db_cat = item["db_category"]
    db_city = CITY_MAP[item["city"]]

    cost, budget_tier = parse_estimated_cost_and_tier(item.get("price_range", ""), db_cat)
    visit_minutes = parse_average_visit_minutes(item.get("recommended_duration_hours", ""), db_cat)

    sat_score = calculate_satisfaction_score(item.get("rating"), item.get("review_count"))
    pop_score = calculate_popularity_score(
        item.get("review_count"),
        name=item["name"],
        description=item.get("description", ""),
        category=db_cat,
        sub_category=item.get("sub_category", ""),
    )
    grn_score = compute_curated_green_score(item, db_city)

    eco_highlights = (item.get("eco_highlights") or "").strip()
    eco_features = [part.strip() for part in re.split(r"[,;]", eco_highlights) if part.strip()]

    transport_tip = (item.get("transport_tip") or "").strip()
    transit_blob = f"{transport_tip} {item.get('activities_tags', '')}".lower()
    has_green_transit = any(
        kw in transit_blob
        for kw in ("xe đạp", "đi bộ", "xe điện", "xe buýt", "cycling", "walk", "kayak", "sup", "tnGo".lower())
    )
    if has_green_transit and not any("giao thông xanh" in f.lower() or "xe đạp" in f.lower() for f in eco_features):
        eco_features.append("Thuận tiện tiếp cận bằng giao thông xanh (xe đạp / đi bộ / xe điện)")

    vibes = item.get("activities_list") or [
        t.strip() for t in (item.get("activities_tags") or "").split(";") if t.strip()
    ]
    best_time = [str(x).strip() for x in (item.get("best_time") or []) if str(x).strip()]

    open_text = (item.get("opening_hours") or "Mở cả ngày").strip()
    live_status = (item.get("opening_hours_live_status") or open_text).strip()
    is_temp_closed = "tạm thời đóng cửa" in open_text.lower() or "tạm thời đóng cửa" in live_status.lower()

    opening_hours_json: dict[str, Any] = {
        "status_text": open_text,
        "live_status": live_status,
        "open_now": not is_temp_closed,
        "is_temporarily_closed": is_temp_closed,
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
        "mindtrip_category": item.get("mindtrip_category", ""),
        "plus_code": item.get("plus_code", ""),
        "raw_rating": float(item.get("rating", 4.5)),
        "review_count": int(item.get("review_count", 0)),
        "price_range_display": item.get("price_range", ""),
        "recommended_duration_hours": item.get("recommended_duration_hours", ""),
        "eco_highlights": eco_highlights,
        "amenities": item.get("amenities") or [],
        "transport_tip": transport_tip,
        "seasonal_note": item.get("seasonal_note", ""),
        "featured_reviews": item.get("featured_reviews") or [],
        "green_transit": has_green_transit,
        "carbon_footprint_score": int(round(grn_score * 100)),
        "source": "browsentic_google_maps_verified_60",
    }

    gallery_urls = [str(u).strip() for u in (item.get("gallery_urls") or []) if str(u).strip()]
    image_url = str(item.get("image_url") or (gallery_urls[0] if gallery_urls else "")).strip()

    return {
        "poi_id": resolved_id,
        "city_id": city_id,
        "category_id": category_id,
        "name": item["name"].strip(),
        "description": item["description"].strip(),
        "address": item["address"].strip(),
        "lat": float(item["latitude"]),
        "lon": float(item["longitude"]),
        "estimated_cost": cost,
        "average_visit_minutes": visit_minutes,
        "satisfaction_score": Decimal(str(sat_score)),
        "popularity_score": Decimal(str(pop_score)),
        "green_score": grn_score,
        "is_local_business": True,
        "local_business_type": BUSINESS_TYPE_BY_CAT.get(db_cat, "sightseeing"),
        "status": "ACTIVE",
        "is_active": True,
        "image_url": image_url,
        "gallery_urls": gallery_urls,
        "sub_category": item.get("sub_category") or None,
        "cuisine": infer_cuisine(item),
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


def upsert_eco_places_60(
    live_commit: bool = False,
    json_path: Path = ECO_JSON_PATH,
) -> dict[str, Any]:
    """Execute Smart Upsert of 60 eco places into `public.pois`."""
    if not json_path.exists():
        raise FileNotFoundError(f"Dataset not found: {json_path}")

    items: list[dict[str, Any]] = json.loads(json_path.read_text(encoding="utf-8"))
    if len(items) != 60:
        raise ValueError(f"Expected 60 eco places in {json_path}, got {len(items)}")

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

            for item in items:
                db_city = CITY_MAP[item["city"]]
                db_cat = item["db_category"]
                if db_city not in city_ids:
                    raise KeyError(f"City '{db_city}' not found in public.cities")
                if db_cat not in cat_ids:
                    raise KeyError(f"Category '{db_cat}' not found in public.poi_categories")

                available_existing = [r for r in existing_rows if r["poi_id"] not in claimed_poi_ids]
                matched_poi_id = match_existing_poi(item, available_existing)

                payload = build_poi_payload(
                    item=item,
                    city_id=city_ids[db_city],
                    category_id=cat_ids[db_cat],
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

            cur.execute(
                """
                SELECT COUNT(*)
                FROM public.pois
                WHERE ai_metadata ? 'eco_place_code'
                  AND image_url IS NOT NULL
                  AND COALESCE(array_length(gallery_urls, 1), 0) = 5
                  AND jsonb_array_length(COALESCE(ai_metadata->'featured_reviews', '[]'::jsonb)) >= 1;
                """
            )
            verified_eco_count = cur.fetchone()[0]

            if verified_eco_count != 60:
                conn.rollback()
                raise RuntimeError(
                    f"Verification failed: expected 60 enriched eco POIs, got {verified_eco_count}. Rolled back."
                )

            print("\n========================================================")
            print("  ECO PLACES 60 — SMART UPSERT SUMMARY")
            print("========================================================")
            print(f"POIs before:           {count_before}")
            print(f"Matched & Updated:     {len(updated_ids)}")
            print(f"Newly Inserted:        {len(inserted_ids)}")
            print(f"POIs after:            {count_after}")
            print(f"Verified 60 Eco POIs:  {verified_eco_count}/60 (5 photos + reviews + metadata)")

            if live_commit:
                conn.commit()
                mode = "COMMITTED"
                print("✅ LIVE COMMIT SUCCESSFUL: All 60 eco places are live in PostgreSQL!")
            else:
                conn.rollback()
                mode = "DRY_RUN"
                print("🔒 DRY-RUN COMPLETE: Rolled back cleanly. Pass --live-commit to persist.")
            print("========================================================\n")

            return {
                "mode": mode,
                "count_before": count_before,
                "updated_count": len(updated_ids),
                "inserted_count": len(inserted_ids),
                "count_after": count_after,
                "verified_eco_count": verified_eco_count,
            }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Smart Upsert 60 Eco Places into public.pois")
    parser.add_argument(
        "--live-commit",
        action="store_true",
        help="Persist changes to PostgreSQL. Defaults to dry-run rollback when omitted.",
    )
    args = parser.parse_args()
    upsert_eco_places_60(live_commit=args.live_commit)
