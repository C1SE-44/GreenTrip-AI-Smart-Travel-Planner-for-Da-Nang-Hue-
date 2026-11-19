"""
Batch scraper to fetch real Google Maps photos for remaining POIs using Playwright.
Updates both poi_photos_cache.json and public.pois in PostgreSQL.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
from pathlib import Path
import re
import sys
import urllib.parse
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.postgres import get_connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("gmaps_batch")

CACHE_FILE = BACKEND_DIR.parent / "data" / "processed" / "poi_photos_cache.json"

def clean_query(name: str, city_name: str) -> str:
    cleaned = re.sub(r"\s*\([^)]*\)", "", name).strip()
    cleaned = re.sub(r"\s*–\s*.*$", "", cleaned).strip()
    cleaned = re.sub(r"\s*-\s*.*$", "", cleaned).strip()
    
    c_lower = city_name.lower().replace(" ", "").replace("-", "")
    is_danang = "danang" in c_lower or "đànẵng" in c_lower or "dn" in c_lower
    city_tag = "Đà Nẵng" if is_danang else "Huế"

    if city_tag.lower() not in cleaned.lower():
        cleaned = f"{cleaned} {city_tag}"
    return cleaned


async def fetch_photos_for_query(page: Any, query: str) -> tuple[str | None, list[str]]:
    encoded = urllib.parse.quote(query)
    url = f"https://www.google.com/maps/search/{encoded}"
    
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(2500)

        # If it returned a list of places, click the first place
        first_place = await page.query_selector("a[href*='/maps/place/']")
        if first_place:
            try:
                await first_place.click()
                await page.wait_for_timeout(2000)
            except Exception:
                pass

        # Check for photo button to open gallery if possible
        photo_btn = await page.query_selector("button[jsaction*='pane.heroHeaderImage'], button[aria-label*='Ảnh'], button[aria-label*='Photo']")
        if photo_btn:
            try:
                await photo_btn.click()
                await page.wait_for_timeout(2000)
            except Exception:
                pass

        img_srcs = await page.eval_on_selector_all("img", """els => {
            return els.map(e => e.src).filter(s => {
                if (!s) return false;
                return (
                    s.includes('googleusercontent.com/p/') ||
                    s.includes('lh3.googleusercontent.com/grass-cs/') ||
                    s.includes('lh5.googleusercontent.com/grass-cs/') ||
                    s.includes('lh3.googleusercontent.com/gps-cs-s/') ||
                    s.includes('lh5.googleusercontent.com/gps-cs-s/') ||
                    s.includes('lh3.googleusercontent.com/places/') ||
                    s.includes('lh4.googleusercontent.com/p/') ||
                    s.includes('lh5.googleusercontent.com/p/')
                );
            });
        }""")

        unique = []
        for src in img_srcs:
            base = src.split("=")[0]
            hi_res = f"{base}=w1200-h800-k-no"
            if hi_res not in unique:
                unique.append(hi_res)

        if not unique:
            return None, []

        hero = unique[0]
        gallery = unique[:5]
        return hero, gallery

    except Exception as exc:
        logger.warning(f"Error fetching for '{query}': {exc}")
        return None, []


async def run_batch(limit: int | None = None, concurrency: int = 3):
    from playwright.async_api import async_playwright

    # Load cache
    cache = {}
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            cache = {}

    # Query remaining Unsplash POIs
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.poi_id::text, p.name, ci.name
        FROM public.pois p
        JOIN public.cities ci ON p.city_id = ci.city_id
        WHERE p.image_url LIKE '%unsplash.com%'
        ORDER BY p.name ASC;
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    total = len(rows)
    logger.info(f"Found {total} POIs remaining with Unsplash images.")
    if limit:
        rows = rows[:limit]
        logger.info(f"Limiting execution to {len(rows)} POIs.")

    queue: asyncio.Queue[tuple[int, tuple[str, str, str]]] = asyncio.Queue()
    for idx, r in enumerate(rows, start=1):
        queue.put_nowait((idx, r))

    cache_lock = asyncio.Lock()
    db_lock = asyncio.Lock()
    success_count = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )

        async def worker(worker_id: int):
            nonlocal success_count
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                locale="vi-VN"
            )
            page = await context.new_page()

            while not queue.empty():
                try:
                    idx, (poi_id, name, city_name) = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

                q = clean_query(name, city_name)
                logger.info(f"[W{worker_id}] [{idx}/{len(rows)}] Querying: '{q}' (POI: {name})")
                
                hero, gallery = await fetch_photos_for_query(page, q)

                if hero:
                    async with cache_lock:
                        cache[poi_id] = {
                            "name": name,
                            "query": q,
                            "city": city_name,
                            "hero": hero,
                            "gallery": gallery,
                            "photos": True
                        }
                        with open(CACHE_FILE, "w", encoding="utf-8") as f:
                            json.dump(cache, f, ensure_ascii=False, indent=2)

                    async with db_lock:
                        with get_connection() as c:
                            with c.cursor() as cur_u:
                                cur_u.execute("""
                                    UPDATE public.pois
                                    SET image_url = %s, gallery_urls = %s
                                    WHERE poi_id = %s::uuid;
                                """, (hero, gallery, poi_id))
                            c.commit()
                    success_count += 1
                    logger.info(f"[W{worker_id}] SUCCESS: {name} -> {len(gallery)} photos found.")
                else:
                    logger.warning(f"[W{worker_id}] NO PHOTOS: {name}")

                await asyncio.sleep(0.5)
                queue.task_done()

            await context.close()

        workers = [asyncio.create_task(worker(i + 1)) for i in range(min(concurrency, len(rows)))]
        await asyncio.gather(*workers)
        await browser.close()

    logger.info(f"Done! Successfully enriched {success_count}/{len(rows)} POIs with real Google Maps photos.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--concurrency", type=int, default=3)
    args = parser.parse_args()

    asyncio.run(run_batch(limit=args.limit, concurrency=args.concurrency))


if __name__ == "__main__":
    main()
