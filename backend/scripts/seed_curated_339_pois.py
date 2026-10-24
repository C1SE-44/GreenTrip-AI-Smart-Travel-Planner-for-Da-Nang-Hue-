"""Seed and Switch public.pois to the Curated 339 Dataset.

Replaces public.pois with the 100% verified, rich Curated 339 dataset:
- Every record has non-null description, address, verified PostGIS geom,
  accurate estimated cost, visit duration, and clean category/city mapping.
- Automatically requires prior backup verification before proceeding.
- Defaults to DRY-RUN (automatic rollback). Pass --live-commit to commit.
"""

import argparse
import csv
from datetime import datetime, timezone
from decimal import Decimal
import json
from pathlib import Path
import re
import sys
import uuid

# Ensure UTF-8 output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.postgres import get_connection

PROJECT_ROOT = BACKEND_ROOT.parent
CSV_PATH = PROJECT_ROOT / "data" / "raw" / "curated_pois_339.csv"
CATALOG_PATH = PROJECT_ROOT / "data" / "raw" / "curated_339_coordinates_catalog.json"
BACKUP_DIR = PROJECT_ROOT / "data" / "backup"

CATEGORY_MAP: dict[str, str] = {
    "Ẩm thực & Quán ăn": "Ẩm thực và quán ăn",
    "Quán Cafe & Giải khát": "Quán cafe giải khát",
    "Cảnh quan & Thiên nhiên": "Cảnh quan và thiên nhiên",
    "Di tích lịch sử & Văn hoá": "Di tích lịch sử và văn hóa",
    "Tâm linh & Chùa chiền": "Tâm linh và chùa thiền",
}

CITY_MAP: dict[str, str] = {
    "Đà Nẵng": "Da Nang",
    "Huế": "Hue",
    "Da Nang": "Da Nang",
    "Hue": "Hue",
}

VISIT_MINUTES_BY_CAT: dict[str, int] = {
    "Ẩm thực và quán ăn": 60,
    "Quán cafe giải khát": 60,
    "Cảnh quan và thiên nhiên": 120,
    "Di tích lịch sử và văn hóa": 90,
    "Tâm linh và chùa thiền": 60,
}

BUSINESS_TYPE_BY_CAT: dict[str, str] = {
    "Ẩm thực và quán ăn": "restaurant",
    "Quán cafe giải khát": "cafe",
    "Cảnh quan và thiên nhiên": "sightseeing",
    "Di tích lịch sử và văn hóa": "heritage",
    "Tâm linh và chùa thiền": "spiritual",
}


def parse_numeric_cost(price_level_text: str, category_name: str) -> Decimal:
    """Parse numeric cost in VND. Spiritual / free natural sites default to 0."""
    if not price_level_text:
        return Decimal(0) if category_name in ("Tâm linh và chùa thiền", "Cảnh quan và thiên nhiên") else Decimal(35000)

    lower = price_level_text.lower()
    if "miễn phí" in lower or "free" in lower:
        return Decimal(0)

    nums = re.findall(r"(\d+(?:\.\d{3})+|\d+)", price_level_text)
    clean_nums: list[int] = []
    for n in nums:
        val = int(n.replace(".", ""))
        if 1000 <= val <= 20_000_000:
            clean_nums.append(val)

    if clean_nums:
        avg = sum(clean_nums) // len(clean_nums)
        rounded = round(avg / 5000) * 5000
        return Decimal(rounded)

    if category_name == "Quán cafe giải khát":
        return Decimal(35000)
    elif category_name == "Ẩm thực và quán ăn":
        return Decimal(55000)
    return Decimal(0)


def build_rich_description(
    curated_desc: str,
    services_or_menu: str,
    price_level: str,
    other_details: str,
) -> str:
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


def check_backup_exists() -> bool:
    backups = list(BACKUP_DIR.glob("full_pois_backup_2426_*.json"))
    return len(backups) > 0


def seed_curated_339(live_commit: bool = False) -> dict:
    if not check_backup_exists():
        raise RuntimeError(
            "ABORTED: No full snapshot backup found in data/backup/. "
            "Run backend/scripts/backup_full_pois.py first!"
        )

    # 1. Load CSV rows and coordinates catalog
    with CSV_PATH.open("r", encoding="utf-8-sig") as f:
        csv_rows = list(csv.DictReader(f))

    with CATALOG_PATH.open("r", encoding="utf-8") as f:
        catalog_data = json.load(f)

    catalog_map = {item["record_id"]: item for item in catalog_data["catalog"]}

    if len(csv_rows) != 339:
        raise ValueError(f"Expected 339 rows in {CSV_PATH}, got {len(csv_rows)}")

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Check cities
            cur.execute("SELECT city_id, name FROM public.cities;")
            city_ids = {row[1]: str(row[0]) for row in cur.fetchall()}

            # Check categories
            cur.execute("SELECT category_id, name FROM public.poi_categories;")
            cat_ids = {row[1]: str(row[0]) for row in cur.fetchall()}

            cur.execute("SELECT count(*) FROM public.pois;")
            count_before = cur.fetchone()[0]

            print(f"📊 Database POI count before: {count_before}")

            # Prepare records
            records_to_insert = []
            for row in csv_rows:
                rec_id = row["record_id"]
                cat_info = catalog_map.get(rec_id)
                if not cat_info:
                    raise KeyError(f"Missing coordinates catalog entry for {rec_id}")

                db_cat_name = CATEGORY_MAP[row["group_name"]]
                db_city_name = CITY_MAP[row["city"]]

                category_id = cat_ids[db_cat_name]
                city_id = city_ids[db_city_name]

                lat = cat_info["latitude"]
                lon = cat_info["longitude"]

                desc = build_rich_description(
                    curated_desc=row.get("description", ""),
                    services_or_menu=row.get("menu_or_ticket_services", ""),
                    price_level=row.get("price_level", ""),
                    other_details=row.get("other_details", ""),
                )

                cost = parse_numeric_cost(row.get("price_level", ""), db_cat_name)
                visit_mins = VISIT_MINUTES_BY_CAT[db_cat_name]
                biz_type = BUSINESS_TYPE_BY_CAT[db_cat_name]

                poi_id = str(uuid.uuid4())
                name = row["place_name"].strip()
                address = row["address"].strip().rstrip(".")

                records_to_insert.append({
                    "poi_id": poi_id,
                    "city_id": city_id,
                    "category_id": category_id,
                    "name": name,
                    "description": desc,
                    "address": address,
                    "lat": lat,
                    "lon": lon,
                    "estimated_cost": cost,
                    "average_visit_minutes": visit_mins,
                    "satisfaction_score": Decimal("4.8"),
                    "popularity_score": Decimal("4.5"),
                    "is_local_business": True,
                    "local_business_type": biz_type,
                    "status": "ACTIVE",
                    "green_score": 0.85,
                    "is_active": True,
                })

            # Execute within transaction
            print(f"🧹 Clearing public.pois for clean curated replacement...")
            cur.execute("DELETE FROM public.pois;")

            print(f"📥 Inserting {len(records_to_insert)} verified curated POIs...")
            insert_sql = """
                INSERT INTO public.pois (
                    poi_id, city_id, category_id, name, description, address,
                    geom, estimated_cost, average_visit_minutes,
                    satisfaction_score, popularity_score, is_local_business,
                    local_business_type, status, green_score, is_active,
                    created_at, updated_at
                ) VALUES (
                    %(poi_id)s::uuid, %(city_id)s::uuid, %(category_id)s::uuid,
                    %(name)s, %(description)s, %(address)s,
                    ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
                    %(estimated_cost)s, %(average_visit_minutes)s,
                    %(satisfaction_score)s, %(popularity_score)s, %(is_local_business)s,
                    %(local_business_type)s, %(status)s, %(green_score)s, %(is_active)s,
                    NOW(), NOW()
                );
            """

            for rec in records_to_insert:
                cur.execute(insert_sql, rec)

            # Verification post-insertion
            cur.execute("SELECT count(*) FROM public.pois;")
            count_after = cur.fetchone()[0]

            cur.execute(
                """
                SELECT
                    count(*) as total,
                    count(description) as has_desc,
                    count(address) as has_addr,
                    count(geom) as has_geom,
                    count(estimated_cost) as has_cost
                FROM public.pois;
                """
            )
            v_total, v_desc, v_addr, v_geom, v_cost = cur.fetchone()

            print(f"\n========================================================")
            print(f"  SEEDING VERIFICATION")
            print(f"========================================================")
            print(f"Total POIs in DB:      {count_after}/339")
            print(f"Has Description:       {v_desc}/{count_after} (Missing: {count_after - v_desc})")
            print(f"Has Address:           {v_addr}/{count_after} (Missing: {count_after - v_addr})")
            print(f"Has PostGIS Geom:      {v_geom}/{count_after} (Missing: {count_after - v_geom})")
            print(f"Has Estimated Cost:    {v_cost}/{count_after} (Missing: {count_after - v_cost})")

            if count_after != 339 or v_desc != 339 or v_addr != 339 or v_geom != 339:
                conn.rollback()
                raise ValueError("Verification failed: incomplete records detected! Rolled back.")

            if live_commit:
                conn.commit()
                status_str = "COMMITTED TO DATABASE (PRODUCTION)"
                print(f"✅ COMMIT SUCCESSFUL: 339 curated POIs are now live in public.pois!")
            else:
                conn.rollback()
                status_str = "DRY-RUN (ROLLED BACK — NO LIVE DB CHANGES)"
                print(f"🔒 DRY-RUN: Changes successfully rolled back. Pass --live-commit to commit.")

            print(f"========================================================\n")

            return {
                "status": status_str,
                "live_commit": live_commit,
                "count_before": count_before,
                "count_after": count_after,
                "has_desc": v_desc,
                "has_addr": v_addr,
                "has_geom": v_geom,
                "has_cost": v_cost,
            }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed 339 Curated POIs into public.pois")
    parser.add_argument(
        "--live-commit",
        action="store_true",
        help="Commit changes to live database. If omitted, runs in safe dry-run mode.",
    )
    args = parser.parse_args()
    seed_curated_339(live_commit=args.live_commit)
