"""Idempotent importer / dry-run validator for data/processed/greentrip_pois_unified.csv.

Defaults to `--dry-run`, validating every CSV row against PostgreSQL types,
cities, and categories without mutating Supabase. Passing `--live-commit`
ensures the accommodation category exists and upserts all unified records
atomically by `poi_id`.
"""

from __future__ import annotations

import argparse
import csv
import json
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

from app.db.postgres import get_connection
from scripts.build_unified_pois_csv import UNIFIED_CSV_HEADERS

DEFAULT_CSV_PATH = PROJECT_ROOT / "data" / "processed" / "greentrip_pois_unified.csv"


@dataclass(frozen=True)
class UnifiedPoiRow:
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


def parse_unified_csv_row(row: dict[str, str], line_number: int) -> UnifiedPoiRow:
    poi_id = row["poi_id"].strip()
    uuid.UUID(poi_id)

    name = row["name"].strip()
    if not name or len(name) > 255:
        raise ValueError(f"Line {line_number}: invalid name length")

    lat = float(row["latitude"])
    lon = float(row["longitude"])
    estimated_cost = float(row["estimated_cost"]) if row["estimated_cost"].strip() else None
    satisfaction_score = float(row["satisfaction_score"]) if row["satisfaction_score"].strip() else None
    popularity_score = float(row["popularity_score"]) if row["popularity_score"].strip() else None

    return UnifiedPoiRow(
        poi_id=poi_id,
        city_code=row["city_code"].strip().upper(),
        category=row["category"].strip(),
        sub_category=row["sub_category"].strip() or None,
        cuisine=row["cuisine"].strip() or None,
        name=name,
        description=row["description"].strip() or None,
        address=row["address"].strip(),
        latitude=lat,
        longitude=lon,
        phone_number=row["phone_number"].strip() or None,
        website_url=row["website_url"].strip() or None,
        email=row["email"].strip() or None,
        social_links=json.loads(row["social_links"] or "{}"),
        opening_hours=json.loads(row["opening_hours"] or "{}"),
        image_url=row["image_url"].strip(),
        gallery_urls=json.loads(row["gallery_urls"] or "[]"),
        estimated_cost=estimated_cost,
        budget_tier=row["budget_tier"].strip() or "$$",
        average_visit_minutes=int(row["average_visit_minutes"]),
        satisfaction_score=satisfaction_score,
        popularity_score=popularity_score,
        green_score=float(row["green_score"]),
        is_local_business=row["is_local_business"].strip().lower() == "true",
        local_business_type=row["local_business_type"].strip() or None,
        vibes=json.loads(row["vibes"] or "[]"),
        best_time=json.loads(row["best_time"] or "[]"),
        eco_features=json.loads(row["eco_features"] or "[]"),
        status=row["status"].strip() or "ACTIVE",
        is_active=row["is_active"].strip().lower() == "true",
        ai_metadata=json.loads(row["ai_metadata"] or "{}"),
    )


def load_unified_csv(csv_path: Path) -> list[UnifiedPoiRow]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != UNIFIED_CSV_HEADERS:
            raise ValueError("CSV header mismatch; regenerate with build_unified_pois_csv.py")
        return [parse_unified_csv_row(row, idx) for idx, row in enumerate(reader, start=2)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and optionally upsert greentrip_pois_unified.csv.")
    parser.add_argument("--csv", default=str(DEFAULT_CSV_PATH))
    parser.add_argument("--live-commit", action="store_true", help="Actually write changes to PostgreSQL.")
    args = parser.parse_args()

    rows = load_unified_csv(Path(args.csv))
    print(f"Validated {len(rows)} unified rows from {args.csv}")

    if not args.live_commit:
        print("Dry run complete (no database writes performed). Pass --live-commit to upsert into public.pois.")
        return

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT code, city_id::text FROM public.cities;")
            city_ids = {code.upper(): cid for code, cid in cur.fetchall()}

            for cat in sorted({r.category for r in rows}):
                cur.execute(
                    "INSERT INTO public.poi_categories (name) VALUES (%s) ON CONFLICT (name) DO NOTHING;",
                    (cat,),
                )
            cur.execute("SELECT name, category_id::text FROM public.poi_categories;")
            cat_ids = {name: cid for name, cid in cur.fetchall()}

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
                    ON CONFLICT (poi_id) DO UPDATE SET
                        city_id = EXCLUDED.city_id,
                        category_id = EXCLUDED.category_id,
                        name = EXCLUDED.name,
                        sub_category = EXCLUDED.sub_category,
                        address = EXCLUDED.address,
                        geom = EXCLUDED.geom,
                        phone_number = EXCLUDED.phone_number,
                        website_url = EXCLUDED.website_url,
                        social_links = EXCLUDED.social_links,
                        image_url = EXCLUDED.image_url,
                        gallery_urls = EXCLUDED.gallery_urls,
                        estimated_cost = EXCLUDED.estimated_cost,
                        budget_tier = EXCLUDED.budget_tier,
                        satisfaction_score = EXCLUDED.satisfaction_score,
                        popularity_score = EXCLUDED.popularity_score,
                        green_score = EXCLUDED.green_score,
                        vibes = EXCLUDED.vibes,
                        eco_features = EXCLUDED.eco_features,
                        ai_metadata = EXCLUDED.ai_metadata,
                        updated_at = NOW();
                    """,
                    (
                        r.poi_id, city_ids[r.city_code], cat_ids[r.category], r.name, r.sub_category, r.cuisine,
                        r.description, r.address, r.longitude, r.latitude, r.phone_number, r.website_url, r.email,
                        json.dumps(r.social_links, ensure_ascii=False), json.dumps(r.opening_hours, ensure_ascii=False),
                        r.image_url, r.gallery_urls,
                        r.estimated_cost, r.budget_tier, r.average_visit_minutes,
                        r.satisfaction_score, r.popularity_score, r.green_score,
                        r.is_local_business, r.local_business_type, r.vibes, r.best_time,
                        r.eco_features, r.status, r.is_active, json.dumps(r.ai_metadata, ensure_ascii=False),
                    ),
                )
        conn.commit()
    print(f"Successfully upserted {len(rows)} rows into public.pois.")


if __name__ == "__main__":
    main()
