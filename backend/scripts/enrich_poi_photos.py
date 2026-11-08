"""
GreenTrip AI - Google Maps Real Photography Scraper & Database Enricher
Fetches authentic user-contributed photography directly from Google Maps (lh3.googleusercontent.com)
for all Da Nang & Hue POIs, replacing generic stock placeholders with real on-site photos.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Any, TypedDict

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db.postgres import get_connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("gmaps_enricher")

CACHE_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "processed" / "poi_photos_cache.json"


def clean_search_query(name: str, city_name: str) -> str:
    """Cleans descriptive parenthesized notes and prefixes to form a high-precision Google Maps search query."""
    cleaned = re.sub(r"\s*\([^)]*\)", "", name).strip()
    cleaned = re.sub(r"\s*–\s*.*$", "", cleaned).strip()
    cleaned = re.sub(r"\s*-\s*.*$", "", cleaned).strip()

    # Accurate city detection handling 'Da Nang', 'Đà Nẵng', 'DANANG', 'Hue', 'Huế'
    c_lower = city_name.lower().replace(" ", "").replace("-", "")
    is_danang = "danang" in c_lower or "đànẵng" in c_lower or "dn" in c_lower
    city_tag = "Đà Nẵng" if is_danang else "Huế"

    if city_tag.lower() not in cleaned.lower():
        cleaned = f"{cleaned} {city_tag}"

    return cleaned


class ScrapedPhotos(TypedDict):
    hero: str | None
    gallery: list[str]


async def fetch_place_photos_from_gmaps(page: Any, query: str) -> ScrapedPhotos:
    """Navigates to Google Maps search for the given query and extracts real photos."""
    encoded_query = urllib.parse.quote(query)
    url = f"https://www.google.com/maps/search/{encoded_query}"
    
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(3500)
        
        # Check if Google Maps resolved to a place panel or list of places
        # If it's a list, click the first place result
        first_result = await page.query_selector("a[href*='/maps/place/']")
        if first_result:
            try:
                await first_result.click()
                await page.wait_for_timeout(2500)
            except Exception:
                pass

        # Extract all image elements with Google CDN photo sources
        img_srcs = await page.eval_on_selector_all("img", """els => {
            return els.map(e => e.src).filter(s => {
                if (!s) return false;
                return (
                    s.includes('googleusercontent.com/p/') ||
                    s.includes('lh3.googleusercontent.com/grass-cs/') ||
                    s.includes('lh5.googleusercontent.com/p/') ||
                    s.includes('lh3.googleusercontent.com/places/') ||
                    s.includes('lh4.googleusercontent.com/p/')
                );
            });
        }""")

        unique_photos: list[str] = []
        for src in img_srcs:
            # Strip resolution parameter and build high-res standard size
            base_url = src.split("=")[0]
            hi_res = f"{base_url}=w1200-h800-k-no"
            if hi_res not in unique_photos:
                unique_photos.append(hi_res)

        if not unique_photos:
            return {"hero": None, "gallery": []}

        hero = unique_photos[0]
        gallery = unique_photos[:5]
        return {"hero": hero, "gallery": gallery}

    except Exception as exc:
        logger.warning(f"Error querying Google Maps for '{query}': {exc}")
        return {"hero": None, "gallery": []}


def load_cache() -> dict[str, Any]:
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_cache(cache: dict[str, Any]) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


async def run_pipeline(
    limit: int | None = None,
    live_commit: bool = False,
    delay: float = 0.5,
    concurrency: int = 3,
) -> None:
    from playwright.async_api import async_playwright

    # Load POIs from Supabase
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT p.poi_id::text, p.name, ci.name, p.image_url, p.gallery_urls
                FROM public.pois p
                JOIN public.cities ci ON p.city_id = ci.city_id
                ORDER BY p.name ASC;
            """)
            rows = cur.fetchall()

    logger.info(f"Loaded {len(rows)} POIs from Supabase.")
    if limit:
        rows = rows[:limit]
        logger.info(f"Applying limit: processing {len(rows)} POIs.")

    cache = load_cache()
    logger.info(f"Loaded cache containing {len(cache)} existing entries.")

    cache_lock = asyncio.Lock()
    db_lock = asyncio.Lock()
    queue: asyncio.Queue[tuple[int, tuple[Any, ...]]] = asyncio.Queue()

    for idx, row in enumerate(rows, start=1):
        queue.put_nowait((idx, row))

    updated_count = 0
    total_scraped = 0
    total_items = len(rows)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )

        async def worker(worker_id: int):
            nonlocal updated_count, total_scraped
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                locale="vi-VN"
            )
            page = await context.new_page()

            while not queue.empty():
                try:
                    idx, (poi_id, name, city_name, current_hero, current_gallery) = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

                query = clean_search_query(name, city_name)

                # Check cache first
                async with cache_lock:
                    cached_data = cache.get(poi_id)

                if cached_data and cached_data.get("photos"):
                    hero = cached_data["hero"]
                    gallery = cached_data["gallery"]
                    logger.info(f"[W{worker_id}] [{idx}/{total_items}] [CACHE] {name} ({len(gallery)} photos)")
                else:
                    logger.info(f"[W{worker_id}] [{idx}/{total_items}] [SCRAPE] '{query}' (POI: {name})")
                    res = await fetch_place_photos_from_gmaps(page, query)
                    hero = res["hero"]
                    gallery = res["gallery"]

                    async with cache_lock:
                        cache[poi_id] = {
                            "name": name,
                            "query": query,
                            "city": city_name,
                            "hero": hero,
                            "gallery": gallery,
                            "photos": len(gallery) > 0
                        }
                        save_cache(cache)
                        total_scraped += 1

                    await asyncio.sleep(delay)

                if hero and gallery:
                    async with cache_lock:
                        updated_count += 1
                    if live_commit:
                        async with db_lock:
                            with get_connection() as conn:
                                with conn.cursor() as cur:
                                    cur.execute("""
                                        UPDATE public.pois
                                        SET image_url = %s, gallery_urls = %s
                                        WHERE poi_id = %s::uuid;
                                    """, (hero, gallery, poi_id))
                                conn.commit()

                queue.task_done()

            await context.close()

        # Launch concurrent workers
        actual_concurrency = min(concurrency, total_items)
        logger.info(f"Launching {actual_concurrency} concurrent Google Maps scraping workers...")
        worker_tasks = [asyncio.create_task(worker(i + 1)) for i in range(actual_concurrency)]
        await asyncio.gather(*worker_tasks)

        await browser.close()

    logger.info("==================================================")
    logger.info("PIPELINE EXECUTION SUMMARY:")
    logger.info(f"Total POIs Evaluated: {len(rows)}")
    logger.info(f"POIs with Authentic Google Photos: {updated_count} ({updated_count / len(rows) * 100:.1f}%)")
    logger.info(f"Newly Scraped from Google Maps: {total_scraped}")
    logger.info(f"Mode: {'LIVE COMMIT (Written to Supabase)' if live_commit else 'DRY RUN (Cache only)'}")
    logger.info("==================================================")


def main():
    parser = argparse.ArgumentParser(description="Enrich POIs with authentic Google Maps photography")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of POIs to process")
    parser.add_argument("--live-commit", action="store_true", help="Write changes to Supabase PostgreSQL")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between requests in seconds")
    parser.add_argument("--concurrency", type=int, default=3, help="Number of concurrent browser workers")
    args = parser.parse_args()

    asyncio.run(run_pipeline(
        limit=args.limit,
        live_commit=args.live_commit,
        delay=args.delay,
        concurrency=args.concurrency
    ))


if __name__ == "__main__":
    main()
