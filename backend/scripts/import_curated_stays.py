"""Safe, insert-only importer for curated stays (defaults to --dry-run).

Derived cleanly from Huynh Van Thien's ingestion contract in feature/#crawl-stays-data,
hardened for production safety:
1. Validates every row against Migration 018 CHECK bounds (`green_score` 0..1,
   `satisfaction_score` 0..5, `estimated_cost >= 0`, `average_visit_minutes` 1..1440).
2. Rejects any non-stay category unless `--allow-other-categories` is explicitly passed.
3. Uses `ON CONFLICT (poi_id) DO NOTHING` so the existing 482 curated POIs and
   their Supabase WebP image URLs can never be overwritten.
4. Invalidates POI cache (`poi_cache.invalidate_pois()`) best-effort after live commit.

Usage:
    python backend/scripts/import_curated_stays.py
    python backend/scripts/import_curated_stays.py --live-commit
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import uuid
from dataclasses import dataclass
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

from app.cache import poi_cache  # noqa: E402
from app.db.postgres import get_connection  # noqa: E402
from scripts.curate_top_stays import STAY_CATEGORY_NAME, UNIFIED_CSV_HEADERS  # noqa: E402

DEFAULT_CSV_PATH = PROJECT_ROOT / "data" / "processed" / "curated_stays_160.csv"


@dataclass(frozen=True)
class CuratedStayRow:
    poi_id: str
    city_code: str
    category: str
    sub_category: str | None
    cuisine: str | None
    name: str
    description: str | None
    address: str
    latitude: float
    longitude: float
    phone_number: str | None
    website_url: str | None
    email: str | None
    social_links: dict[str, Any]
    opening_hours: dict[str, Any]
    image_url: str
    gallery_urls: list[str]
    estimated_cost: float | None
    budget_tier: str
    average_visit_minutes: int
    satisfaction_score: float | None
    popularity_score: float | None
    green_score: float
    is_local_business: bool
    local_business_type: str | None
    vibes: list[str]
    best_time: list[str]
    eco_features: list[str]
    status: str
    is_active: bool
    ai_metadata: dict[str, Any]


def _parse_float(raw: str, *, field: str, line_number: int, allow_none: bool = False) -> float | None:
    stripped = raw.strip()
    if not stripped:
        if allow_none:
            return None
        raise ValueError(f"Line {line_number}: missing required float '{field}'")
    value = float(stripped)
    if not math.isfinite(value):
        raise ValueError(f"Line {line_number}: non-finite float for '{field}'")
    return value


def parse_curated_stay_row(
    row: dict[str, str],
    line_number: int,
    *,
    allow_other_categories: bool = False,
) -> CuratedStayRow:
    poi_id = row["poi_id"].strip()
    uuid.UUID(poi_id)

    category = row["category"].strip()
    if not allow_other_categories and category != STAY_CATEGORY_NAME:
        raise ValueError(
            f"Line {line_number}: expected category '{STAY_CATEGORY_NAME}', got '{category}'. "
            "Pass --allow-other-categories only if intentional."
        )

    name = row["name"].strip()
    if not name or len(name) > 255:
        raise ValueError(f"Line {line_number}: invalid name length")

    address = row["address"].strip()
    if not address:
        raise ValueError(f"Line {line_number}: address is required")

    image_url = row["image_url"].strip()
    if not image_url:
        raise ValueError(f"Line {line_number}: image_url is required")

    lat = _parse_float(row["latitude"], field="latitude", line_number=line_number)
    lon = _parse_float(row["longitude"], field="longitude", line_number=line_number)
    assert lat is not None and lon is not None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        raise ValueError(f"Line {line_number}: coordinates out of range ({lat}, {lon})")

    estimated_cost = _parse_float(row["estimated_cost"], field="estimated_cost", line_number=line_number, allow_none=True)
    if estimated_cost is not None and estimated_cost < 0.0:
        raise ValueError(f"Line {line_number}: estimated_cost must be >= 0 (Migration 018)")

    satisfaction_score = _parse_float(
        row["satisfaction_score"], field="satisfaction_score", line_number=line_number, allow_none=True
    )
    if satisfaction_score is not None and not (0.0 <= satisfaction_score <= 5.0):
        raise ValueError(f"Line {line_number}: satisfaction_score out of [0, 5] (Migration 018)")

    popularity_score = _parse_float(
        row["popularity_score"], field="popularity_score", line_number=line_number, allow_none=True
    )

    green_score = _parse_float(row["green_score"], field="green_score", line_number=line_number)
    assert green_score is not None
    if not (0.0 <= green_score <= 1.0):
        raise ValueError(f"Line {line_number}: green_score out of [0, 1] (Migration 018)")

    average_visit_minutes = int(row["average_visit_minutes"].strip())
    if not (1 <= average_visit_minutes <= 1440):
        raise ValueError(f"Line {line_number}: average_visit_minutes out of [1, 1440] (Migration 018)")

    return CuratedStayRow(
        poi_id=poi_id,
        city_code=row["city_code"].strip().upper(),
        category=category,
        sub_category=row["sub_category"].strip() or None,
        cuisine=row["cuisine"].strip() or None,
        name=name,
        description=row["description"].strip() or None,
        address=address,
        latitude=lat,
        longitude=lon,
        phone_number=row["phone_number"].strip() or None,
        website_url=row["website_url"].strip() or None,
        email=row["email"].strip() or None,
        social_links=json.loads(row["social_links"] or "{}"),
        opening_hours=json.loads(row["opening_hours"] or "{}"),
        image_url=image_url,
        gallery_urls=json.loads(row["gallery_urls"] or "[]"),
        estimated_cost=estimated_cost,
        budget_tier=row["budget_tier"].strip() or "$$",
        average_visit_minutes=average_visit_minutes,
        satisfaction_score=satisfaction_score,
        popularity_score=popularity_score,
        green_score=green_score,
        is_local_business=row["is_local_business"].strip().lower() == "true",
        local_business_type=row["local_business_type"].strip() or None,
        vibes=json.loads(row["vibes"] or "[]"),
        best_time=json.loads(row["best_time"] or "[]"),
        eco_features=json.loads(row["eco_features"] or "[]"),
        status=row["status"].strip() or "ACTIVE",
        is_active=row["is_active"].strip().lower() == "true",
        ai_metadata=json.loads(row["ai_metadata"] or "{}"),
    )


def load_curated_stays_csv(
    csv_path: Path,
    *,
    allow_other_categories: bool = False,
) -> list[CuratedStayRow]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != UNIFIED_CSV_HEADERS:
            raise ValueError("CSV header mismatch; regenerate with curate_top_stays.py")
        return [
            parse_curated_stay_row(row, idx, allow_other_categories=allow_other_categories)
            for idx, row in enumerate(reader, start=2)
        ]


def import_curated_stays(rows: list[CuratedStayRow], *, live_commit: bool = False) -> dict[str, int]:
    if not rows:
        raise ValueError("No rows provided to import.")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM public.pois;")
            before_count = int(cur.fetchone()[0])

            cur.execute("SELECT code, city_id::text FROM public.cities;")
            city_ids = {code.upper(): cid for code, cid in cur.fetchall()}
            missing_cities = {r.city_code for r in rows} - city_ids.keys()
            if missing_cities:
                raise ValueError(f"Missing city codes in public.cities: {sorted(missing_cities)}")

            poi_ids = [r.poi_id for r in rows]
            cur.execute("SELECT poi_id::text FROM public.pois WHERE poi_id = ANY(%s::uuid[]);", (poi_ids,))
            existing_ids = {row[0] for row in cur.fetchall()}

            if not live_commit:
                conn.rollback()
                return {
                    "before_count": before_count,
                    "would_insert_count": len(rows) - len(existing_ids),
                    "already_present_count": len(existing_ids),
                    "after_count": before_count,
                }

            for cat in sorted({r.category for r in rows}):
                cur.execute(
                    "INSERT INTO public.poi_categories (name) VALUES (%s) ON CONFLICT (name) DO NOTHING;",
                    (cat,),
                )
            cur.execute("SELECT name, category_id::text FROM public.poi_categories;")
            cat_ids = {name: cid for name, cid in cur.fetchall()}

            inserted_count = 0
            skipped_existing_count = 0
            for r in rows:
                cur.execute(
                    """
                    INSERT INTO public.pois (
                        poi_id, city_id, category_id, name, sub_category, cuisine,
                        description, address, geom, phone_number, website_url, email,
                        social_links, opening_hours, image_url, gallery_urls,
                        estimated_cost, budget_tier, average_visit_minutes,
                        satisfaction_score, popularity_score, green_score,
                        is_local_business, local_business_type, vibes, best_time,
                        eco_features, status, is_active, ai_metadata
                    ) VALUES (
                        %s::uuid, %s::uuid, %s::uuid, %s, %s, %s,
                        %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s, %s, %s,
                        %s::jsonb, %s::jsonb, %s, %s::text[],
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s::text[], %s::text[],
                        %s::text[], %s, %s, %s::jsonb
                    )
                    ON CONFLICT (poi_id) DO NOTHING
                    RETURNING poi_id::text;
                    """,
                    (
                        r.poi_id,
                        city_ids[r.city_code],
                        cat_ids[r.category],
                        r.name,
                        r.sub_category,
                        r.cuisine,
                        r.description,
                        r.address,
                        r.longitude,
                        r.latitude,
                        r.phone_number,
                        r.website_url,
                        r.email,
                        json.dumps(r.social_links, ensure_ascii=False),
                        json.dumps(r.opening_hours, ensure_ascii=False),
                        r.image_url,
                        r.gallery_urls,
                        r.estimated_cost,
                        r.budget_tier,
                        r.average_visit_minutes,
                        r.satisfaction_score,
                        r.popularity_score,
                        r.green_score,
                        r.is_local_business,
                        r.local_business_type,
                        r.vibes,
                        r.best_time,
                        r.eco_features,
                        r.status,
                        r.is_active,
                        json.dumps(r.ai_metadata, ensure_ascii=False),
                    ),
                )
                if cur.fetchone():
                    inserted_count += 1
                else:
                    skipped_existing_count += 1

            cur.execute("SELECT COUNT(*) FROM public.pois;")
            after_count = int(cur.fetchone()[0])

        conn.commit()

    try:
        poi_cache.invalidate_pois()
    except Exception:
        pass

    return {
        "before_count": before_count,
        "inserted_count": inserted_count,
        "skipped_existing_count": skipped_existing_count,
        "after_count": after_count,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Insert-only importer for curated_stays_160.csv.")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV_PATH)
    parser.add_argument("--live-commit", action="store_true", help="Write changes to PostgreSQL (insert-only).")
    parser.add_argument("--offline", action="store_true", help="Validate CSV only without querying DB.")
    parser.add_argument(
        "--allow-other-categories",
        action="store_true",
        help="Allow non-accommodation categories (disabled by default for safety).",
    )
    args = parser.parse_args(argv)

    rows = load_curated_stays_csv(args.csv, allow_other_categories=args.allow_other_categories)
    print(f"Validated {len(rows)} stay rows from {args.csv}")
    if args.offline and not args.live_commit:
        print("Offline dry-run complete.")
        return 0

    summary = import_curated_stays(rows, live_commit=args.live_commit)
    if args.live_commit:
        print(
            f"LIVE_INSERT_COMPLETE before_count={summary['before_count']} "
            f"inserted_count={summary['inserted_count']} "
            f"skipped_existing_count={summary['skipped_existing_count']} "
            f"after_count={summary['after_count']}"
        )
    else:
        print(
            f"DRY_RUN_COMPLETE before_count={summary['before_count']} "
            f"would_insert_count={summary['would_insert_count']} "
            f"already_present_count={summary['already_present_count']} "
            f"after_count={summary['after_count']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
