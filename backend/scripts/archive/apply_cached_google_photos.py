"""
Apply existing authentic Google Maps photos from poi_photos_cache.json to public.pois.
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

CACHE_PATH = BACKEND_DIR.parent / "data" / "processed" / "poi_photos_cache.json"

def main():
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        cache = json.load(f)

    # Name index for fallback matching
    name_to_data = {}
    for pid, data in cache.items():
        if data.get("hero") and "googleusercontent.com" in data.get("hero", ""):
            c_name = data.get("name", "").split("(")[0].strip().lower()
            name_to_data[c_name] = data

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT poi_id, name, image_url, gallery_urls
        FROM public.pois
        WHERE image_url LIKE '%unsplash.com%';
    """)
    unsplash_pois = cur.fetchall()
    print(f"Total POIs currently using Unsplash: {len(unsplash_pois)}")

    updated = 0
    updated_places = []
    still_need_scrape = []

    for r in unsplash_pois:
        pid = str(r[0])
        name = r[1].strip()
        name_clean = name.split("(")[0].strip().lower()

        photo_data = None
        if pid in cache and cache[pid].get("hero") and "googleusercontent.com" in cache[pid].get("hero", ""):
            photo_data = cache[pid]
        elif name_clean in name_to_data:
            photo_data = name_to_data[name_clean]

        if photo_data:
            hero = photo_data["hero"]
            gallery = photo_data.get("gallery", [hero])
            if not gallery:
                gallery = [hero]

            cur.execute("""
                UPDATE public.pois
                SET image_url = %s, gallery_urls = %s
                WHERE poi_id = %s::uuid;
            """, (hero, gallery, pid))
            updated += 1
            updated_places.append((name, hero))
        else:
            still_need_scrape.append((pid, name))

    conn.commit()
    conn.close()

    print(f"Successfully updated {updated} POIs from cache to Google CDN photos.")
    print(f"Remaining POIs that need fresh scraping: {len(still_need_scrape)}")
    print("\nSample 10 updated places:")
    for name, hero in updated_places[:10]:
        print(f" - {name} -> {hero[:60]}...")

if __name__ == "__main__":
    main()
