"""
Synchronize data/raw/nature_heritage_danang_hue_phase2.json and food_beverage_danang_hue_phase1.json
with authentic Google Maps photos, ensuring exactly 5 photos in gallery_urls (cycled from authentic photos).
Also updates public.pois in PostgreSQL.
"""
from __future__ import annotations

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
RAW_DIR = PROJECT_ROOT / "data" / "raw"

def pad_gallery(photos: list[str], hero: str) -> list[str]:
    base = [p for p in photos if p]
    if not base:
        base = [hero] if hero else []
    if not base:
        return []
    result = list(base)
    while len(result) < 5:
        result.append(base[len(result) % len(base)])
    return result[:5]

def main():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT poi_id, name, image_url, gallery_urls, ai_metadata
        FROM public.pois;
    """)
    rows = cur.fetchall()

    db_pois = {}
    for r in rows:
        pid = str(r[0])
        name = r[1].strip()
        hero = r[2]
        gallery = r[3] or []
        meta = r[4] or {}
        padded_5 = pad_gallery(gallery, hero)
        
        # Update DB if gallery has less than 5 items
        if len(gallery) != 5 and padded_5:
            cur.execute("""
                UPDATE public.pois
                SET gallery_urls = %s
                WHERE poi_id = %s::uuid;
            """, (padded_5, pid))
            
        db_pois[name.lower()] = {
            "image_url": hero,
            "gallery_urls": padded_5,
            "ai_metadata": meta
        }

    conn.commit()
    conn.close()
    print("Updated public.pois with padded 5 authentic photos in gallery.")

    # Sync Phase 1 JSON
    p1_json_path = RAW_DIR / "food_beverage_danang_hue_phase1.json"
    if p1_json_path.exists():
        with open(p1_json_path, "r", encoding="utf-8") as f:
            p1_data = json.load(f)
        for item in p1_data:
            key = item.get("name", "").strip().lower()
            if key in db_pois and db_pois[key]["image_url"]:
                item["image_url"] = db_pois[key]["image_url"]
                item["gallery_urls"] = db_pois[key]["gallery_urls"]
            else:
                item["gallery_urls"] = pad_gallery(item.get("gallery_urls", []), item.get("image_url", ""))
        with open(p1_json_path, "w", encoding="utf-8") as f:
            json.dump(p1_data, f, ensure_ascii=False, indent=2)
        print(f"Synced {len(p1_data)} items in {p1_json_path.name}")

    # Sync Phase 2 JSON
    p2_json_path = RAW_DIR / "nature_heritage_danang_hue_phase2.json"
    if p2_json_path.exists():
        with open(p2_json_path, "r", encoding="utf-8") as f:
            p2_data = json.load(f)
        for item in p2_data:
            key = item.get("name", "").strip().lower()
            if key in db_pois and db_pois[key]["image_url"]:
                item["image_url"] = db_pois[key]["image_url"]
                item["gallery_urls"] = db_pois[key]["gallery_urls"]
                if key == "áo dài show huế" and db_pois[key]["ai_metadata"]:
                    meta = db_pois[key]["ai_metadata"]
                    if "featured_reviews" in meta:
                        item["featured_reviews"] = meta["featured_reviews"]
                    if "sample_reviews" in meta:
                        item["sample_reviews"] = meta["sample_reviews"]
                    if "eco_highlights" in meta:
                        item["eco_highlights"] = meta["eco_highlights"]
            else:
                item["gallery_urls"] = pad_gallery(item.get("gallery_urls", []), item.get("image_url", ""))
        with open(p2_json_path, "w", encoding="utf-8") as f:
            json.dump(p2_data, f, ensure_ascii=False, indent=2)
        print(f"Synced {len(p2_data)} items in {p2_json_path.name}")

    print("All datasets synchronized with exactly 5 authentic photos in gallery_urls!")

if __name__ == "__main__":
    main()
