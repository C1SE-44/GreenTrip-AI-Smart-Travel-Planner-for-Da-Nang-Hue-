"""
Export all 482 cleaned POIs from PostgreSQL public.pois to data/processed/all_pois_cleaned.csv.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.postgres import get_connection

PROJECT_ROOT = BACKEND_DIR.parent
OUTPUT_CSV = PROJECT_ROOT / "data" / "processed" / "all_pois_cleaned.csv"

def main():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT 
            p.poi_id::text,
            p.name,
            pc.name as category,
            p.sub_category,
            ci.name as city,
            ST_Y(p.geom::geometry) as latitude,
            ST_X(p.geom::geometry) as longitude,
            p.address,
            p.phone_number,
            p.website_url,
            p.social_links->>'facebook' as facebook_url,
            p.ai_metadata->>'google_maps_url' as google_maps_url,
            p.image_url,
            p.satisfaction_score,
            COALESCE((p.ai_metadata->>'review_count')::int, 0) as review_count,
            p.green_score,
            p.estimated_cost,
            p.average_visit_minutes,
            p.is_local_business,
            COALESCE(p.ai_metadata->>'price_range_display', '') as price_range_display,
            COALESCE(p.ai_metadata->>'verification_status', 'STANDARD_VERIFIED') as verification_status,
            CASE 
                WHEN p.ai_metadata->'menu_items' IS NOT NULL 
                THEN jsonb_array_length((p.ai_metadata->'menu_items')::jsonb) 
                ELSE 0 
            END as menu_items_count,
            CASE 
                WHEN p.ai_metadata->'featured_reviews' IS NOT NULL 
                THEN jsonb_array_length((p.ai_metadata->'featured_reviews')::jsonb) 
                ELSE 0 
            END as featured_reviews_count
        FROM public.pois p
        JOIN public.poi_categories pc ON p.category_id = pc.category_id
        JOIN public.cities ci ON p.city_id = ci.city_id
        ORDER BY p.name ASC;
    """)

    rows = cur.fetchall()
    conn.close()

    print(f"Exporting {len(rows)} POIs to {OUTPUT_CSV}...")
    fieldnames = [
        "poi_id", "name", "category", "sub_category", "city",
        "latitude", "longitude", "address", "phone_number", "website_url",
        "facebook_url", "google_maps_url", "image_url", "satisfaction_score",
        "review_count", "green_score", "estimated_cost", "average_visit_minutes",
        "is_local_business", "price_range_display", "verification_status",
        "menu_items_count", "featured_reviews_count"
    ]

    with open(OUTPUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow({
                "poi_id": r[0],
                "name": r[1],
                "category": r[2],
                "sub_category": r[3] or "",
                "city": r[4],
                "latitude": r[5],
                "longitude": r[6],
                "address": r[7] or "",
                "phone_number": r[8] or "",
                "website_url": r[9] or "",
                "facebook_url": r[10] or "",
                "google_maps_url": r[11] or "",
                "image_url": r[12] or "",
                "satisfaction_score": r[13],
                "review_count": r[14],
                "green_score": r[15],
                "estimated_cost": r[16],
                "average_visit_minutes": r[17],
                "is_local_business": r[18],
                "price_range_display": r[19],
                "verification_status": r[20],
                "menu_items_count": r[21],
                "featured_reviews_count": r[22]
            })

    print(f"Successfully exported {len(rows)} POIs to {OUTPUT_CSV} with clean UTF-8 encoding!")

if __name__ == "__main__":
    main()
