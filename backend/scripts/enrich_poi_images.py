"""
Enrich 339 POIs in public.pois with authentic high-resolution hero images and galleries.

Sources:
1. Curated Heritage Wikipedia / Wikimedia Commons mapping.
2. Curated Food & Beverage local specialty imagery catalog (curated_food_images.py).
3. Live Wikimedia Commons Search API for heritage/nature sites.
4. Graceful fallback (leaves NULL so frontend uses deterministic category hashes).

Usage:
    python backend/scripts/enrich_poi_images.py --dry-run
    python backend/scripts/enrich_poi_images.py --live-commit
    python backend/scripts/enrich_poi_images.py --limit 10
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
import time
import urllib.parse
import urllib.request
from typing import Any

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.postgres import get_connection
from scripts.curated_food_images import resolve_food_or_cafe_imagery
from scripts.curated_landmark_images import resolve_landmark_imagery

PROJECT_ROOT = BACKEND_ROOT.parent
OUTPUT_CATALOG_PATH = PROJECT_ROOT / "data" / "processed" / "poi_images_catalog.json"

USER_AGENT = "GreenTripAI/1.0 (admin@greentrip.ai; Smart Travel Planner for Da Nang - Hue)"

# Canonical Wikipedia / Wikimedia mapping for major Da Nang & Hue landmarks
KNOWN_HERITAGE_WIKI_MAP: dict[str, str] = {
    # Da Nang Landmarks
    "Cầu Rồng": "Cầu Rồng (Đà Nẵng)",
    "Ngũ Hành Sơn": "Ngũ Hành Sơn (Đà Nẵng)",
    "Bà Nà Hills": "Bà Nà Hills",
    "Bán đảo Sơn Trà": "Bán đảo Sơn Trà",
    "Bãi biển Mỹ Khê": "Bãi biển Mỹ Khê",
    "Mỹ Khê": "Bãi biển Mỹ Khê",
    "Bãi biển Non Nước": "Bãi biển Non Nước",
    "Chùa Linh Ứng Bãi Bụt": "Chùa Linh Ứng (Đà Nẵng)",
    "Chùa Linh Ứng": "Chùa Linh Ứng (Đà Nẵng)",
    "Đỉnh Bàn Cờ": "Bán đảo Sơn Trà",
    "Đèo Hải Vân": "Đèo Hải Vân",
    "Hải Vân Quan": "Hải Vân Quan",
    "Thành Điện Hải": "Thành Điện Hải",
    "Bảo tàng Điêu khắc Chăm": "Bảo tàng Nghệ thuật Điêu khắc Chăm Đà Nẵng",
    "Bảo tàng Nghệ thuật Điêu khắc Chăm": "Bảo tàng Nghệ thuật Điêu khắc Chăm Đà Nẵng",
    "Cầu Sông Hàn": "Cầu Sông Hàn",
    "Cầu Thuận Phước": "Cầu Thuận Phước",
    "Cầu Trần Thị Lý": "Cầu Trần Thị Lý",
    "Cầu Tình Yêu": "Cầu Tình yêu Đà Nẵng",
    "Chợ Hàn": "Chợ Hàn",
    "Chợ Cồn": "Chợ Cồn",
    "Nhà thờ Con Gà Đà Nẵng": "Nhà thờ chính tòa Đà Nẵng",
    "Nhà thờ Chính tòa Đà Nẵng": "Nhà thờ chính tòa Đà Nẵng",
    "Suối Mơ": "Khu du lịch Suối Mơ",
    "Rạn Nam Ô": "Nam Ô",
    "Ghềnh Bàng": "Bán đảo Sơn Trà",
    "Bãi Rạng": "Bán đảo Sơn Trà",
    "Giếng Trời": "Bà Nà Hills",
    # Hue Landmarks
    "Đại Nội Huế": "Hoàng thành Huế",
    "Hoàng thành Huế": "Hoàng thành Huế",
    "Kinh thành Huế": "Kinh thành Huế",
    "Chùa Thiên Mụ": "Chùa Thiên Mụ",
    "Lăng Tự Đức": "Lăng Tự Đức",
    "Lăng Khải Định": "Lăng Khải Định",
    "Lăng Minh Mạng": "Lăng Minh Mạng",
    "Lăng Gia Long": "Lăng Gia Long",
    "Lăng Đồng Khánh": "Lăng Đồng Khánh",
    "Lăng Thiệu Trị": "Lăng Thiệu Trị",
    "Lăng Dục Đức": "Lăng Dục Đức",
    "Cung An Định": "Cung An Định",
    "Điện Hòn Chén": "Điện Hòn Chén",
    "Hổ Quyền": "Hổ Quyền",
    "Cầu Trường Tiền": "Cầu Trường Tiền",
    "Trường Quốc Học Huế": "Trường Trung học phổ thông chuyên Quốc Học – Huế",
    "Chợ Đông Ba": "Chợ Đông Ba",
    "Nhà thờ Phủ Cam": "Nhà thờ chính tòa Phủ Cam",
    "Chùa Từ Đàm": "Chùa Từ Đàm",
    "Chùa Huyền Không Sơn Thượng": "Chùa Huyền Không Sơn Thượng",
    "Chùa Báo Quốc": "Chùa Báo Quốc (Huế)",
    "Đồi Vọng Cảnh": "Đồi Vọng Cảnh",
    "Đồi Thiên An": "Đồi Thiên An",
    "Hồ Thủy Tiên": "Hồ Thủy Tiên",
    "Phá Tam Giang": "Phá Tam Giang",
    "Đầm Chuồn": "Đầm Chuồn",
    "Vườn quốc gia Bạch Mã": "Vườn quốc gia Bạch Mã",
    "Suối Voi": "Suối Voi",
    "Bãi biển Lăng Cô": "Vịnh Lăng Cô",
    "Vịnh Lăng Cô": "Vịnh Lăng Cô",
    "Bãi biển Thuận An": "Bãi biển Thuận An",
    "Bãi biển Cảnh Dương": "Vịnh Chân Mây",
    "Công viên APEC": "Công viên APEC Đà Nẵng",
    "Cung Thể Thao Tiên Sơn": "Cung Thể thao Tiên Sơn",
    "Bảo tàng Mỹ thuật": "Bảo tàng Mỹ thuật Đà Nẵng",
    "Chùa Pháp Lâm": "Chùa Pháp Lâm",
    "Chùa Phổ Đà": "Chùa Pháp Lâm",
    "Chùa Bát Nhã": "Chùa Pháp Lâm",
    "Hồ Truồi": "Hồ Truồi",
    "Sông Hàn": "Sông Hàn",
    "Cầu Vòm Đồn Cả": "Đèo Hải Vân",
    "Suối Lương": "Đèo Hải Vân",
    "Hòa Phú Thành": "Khu du lịch Suối Mơ",
    "Bạch Mã Village": "Vườn quốc gia Bạch Mã",
    "A Lưới": "A Lưới",
    "Khải Định": "Lăng Khải Định",
    "Minh Mạng": "Lăng Minh Mạng",
    "Tự Đức": "Lăng Tự Đức",
    "Gia Long": "Lăng Gia Long",
    "Đồng Khánh": "Lăng Đồng Khánh",
    "Thanh Toàn": "Cầu ngói Thanh Toàn",
    "Thủy Xuân": "Làng hương Thủy Xuân",
    "Trúc Lâm Bạch Mã": "Thiền viện Trúc Lâm Bạch Mã",
    "Từ Hiếu": "Chùa Từ Hiếu",
    "Kỳ Đài": "Kỳ đài (Kinh thành Huế)",
    "Phủ Cam": "Nhà thờ chính tòa Phủ Cam",
    "Dòng Chúa Cứu Thế": "Nhà thờ Dòng Chúa Cứu Thế (Huế)",
    "Thiền Lâm": "Chùa Thiền Lâm",
    "Thanh Tiên": "Làng hoa giấy Thanh Tiên",
    "Túy Loan": "Bà Nà Hills",
    "Helio": "Công viên APEC Đà Nẵng",
    "Đài Tưởng Niệm": "Quảng trường 2 tháng 9",
    "Trung Tâm Hành Chính": "Cầu Sông Hàn",
    "Phước Tường": "Nhà thờ chính tòa Đà Nẵng",
    "Thác Mơ": "Khu du lịch Suối Mơ",
    "Suối Tiên": "Khu du lịch Suối Mơ",
    "Suối Hoa": "Khu du lịch Suối Mơ",
    "Nhị Hồ": "Vườn quốc gia Bạch Mã",
    "Nguyễn Chí Thanh": "Bảo tàng Lịch sử Quân sự Việt Nam",
}


def clean_poi_name(name: str) -> str:
    """Strip marketing noise, Michelin notes, branch numbers, and parentheses."""
    cleaned = re.sub(r"\s*\([^)]*\)", "", name)
    cleaned = re.sub(r"\s*–\s*.*$", "", cleaned)
    cleaned = re.sub(r"\s*-\s*.*$", "", cleaned)
    cleaned = re.sub(r"\s*/.*$", "", cleaned)
    return cleaned.strip() or name.strip()


def normalize_wikimedia_url(url: str) -> str:
    """Convert thumb.wikimedia.org to upload.wikimedia.org direct static URL."""
    if not url:
        return url
    m = re.match(
        r"https?://(?:thumb|upload)\.wikimedia\.org/wikipedia/commons/thumb/([^/]+/[^/]+)/([^/]+)/.*",
        url,
    )
    if m:
        folder, filename = m.groups()
        return f"https://upload.wikimedia.org/wikipedia/commons/{folder}/{filename}"
    return url.split("?")[0]


def query_wikipedia_pageimages(titles: list[str]) -> dict[str, str]:
    """Query Wikipedia pageimages for a batch of titles (up to 50 titles per call)."""
    if not titles:
        return {}

    titles_str = "|".join(titles)
    url = (
        "https://vi.wikipedia.org/w/api.php?action=query"
        f"&titles={urllib.parse.quote(titles_str)}"
        "&prop=pageimages&pithumbsize=1280&format=json"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            pages = data.get("query", {}).get("pages", {})
            results: dict[str, str] = {}
            for _, page in pages.items():
                title = page.get("title")
                thumb = page.get("thumbnail", {}).get("source")
                if title and thumb:
                    results[title] = normalize_wikimedia_url(thumb)
            return results
    except Exception as exc:
        print(f"  [WARN] Wikipedia batch query failed: {exc}", file=sys.stderr)
        return {}


def query_wikimedia_commons_search(query: str, limit: int = 4) -> list[str]:
    """Search Wikimedia Commons for photos by search query."""
    q_encoded = urllib.parse.quote(query)
    url = (
        "https://commons.wikimedia.org/w/api.php?action=query"
        f"&generator=search&gsrsearch={q_encoded}&gsrnamespace=6"
        f"&prop=imageinfo&iiprop=url&iiurlwidth=1280&gsrlimit={limit}&format=json"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            pages = data.get("query", {}).get("pages", {})
            images: list[str] = []
            for _, page in pages.items():
                infos = page.get("imageinfo", [])
                if infos and "thumburl" in infos[0]:
                    images.append(infos[0]["thumburl"])
            return images
    except Exception as exc:
        print(f"  [WARN] Wikimedia search query for '{query}' failed: {exc}", file=sys.stderr)
        return []


def resolve_poi_imagery(
    name: str,
    category: str,
    city: str,
    description: str,
    wiki_cache: dict[str, str],
) -> tuple[str | None, list[str]]:
    """Resolve hero image and gallery for a POI using multi-tier resolution strategy."""
    clean_name = clean_poi_name(name)

    # 1. Try Food & Beverage Semantic Specialty Match (ONLY for Food/Cafe)
    if category in ("Ẩm thực và quán ăn", "Quán cafe giải khát"):
        food_res = resolve_food_or_cafe_imagery(name, description)
        if food_res:
            return food_res["hero"], food_res["gallery"]
        return None, []

    # 2. Try Curated Landmark Imagery (covers major landmarks and themes in Da Nang & Hue)
    landmark_res = resolve_landmark_imagery(name, category, city)
    if landmark_res:
        hero = landmark_res["hero"]
        gallery = list(landmark_res["gallery"])

        # Check if Wikipedia has an authentic photo for this specific POI
        wiki_title = None
        for pattern, canonical in KNOWN_HERITAGE_WIKI_MAP.items():
            if pattern.lower() in clean_name.lower():
                wiki_title = canonical
                break

        if wiki_title and wiki_title in wiki_cache:
            wiki_hero = wiki_cache[wiki_title]
            if wiki_hero not in gallery:
                gallery.insert(0, wiki_hero)
            hero = wiki_hero
        elif clean_name in wiki_cache:
            wiki_hero = wiki_cache[clean_name]
            if wiki_hero not in gallery:
                gallery.insert(0, wiki_hero)
            hero = wiki_hero

        return hero, gallery

    # 3. Try Known Landmark / Wikipedia Match (For Heritage, Nature, Temples)
    wiki_title = None
    for pattern, canonical in KNOWN_HERITAGE_WIKI_MAP.items():
        if pattern.lower() in clean_name.lower():
            wiki_title = canonical
            break

    if wiki_title and wiki_title in wiki_cache:
        hero = wiki_cache[wiki_title]
        return hero, [hero]

    # 4. Check clean name directly in wiki_cache
    if clean_name in wiki_cache:
        hero = wiki_cache[clean_name]
        return hero, [hero]

    return None, []


def enrich_pois(dry_run: bool = True, limit: int | None = None) -> dict[str, Any]:
    """Run POI image enrichment pipeline."""
    print("=" * 70)
    print("  GREENTRIP AI - POI IMAGE ENRICHMENT PIPELINE")
    print(f"  Mode: {'DRY-RUN (No database writes)' if dry_run else 'LIVE COMMIT (Writing to Supabase)'}")
    print("=" * 70)

    # 1. Fetch all POIs from Supabase
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    p.poi_id::text,
                    p.name,
                    c.name AS category_name,
                    ci.name AS city_name,
                    p.description,
                    p.image_url,
                    p.gallery_urls
                FROM public.pois p
                JOIN public.poi_categories c ON p.category_id = c.category_id
                JOIN public.cities ci ON p.city_id = ci.city_id
                ORDER BY ci.name ASC, c.name ASC, p.name ASC;
            """)
            rows = cur.fetchall()

    if limit:
        rows = rows[:limit]
        print(f"Limited processing to first {limit} records.")

    total_records = len(rows)
    print(f"Loaded {total_records} POIs from Supabase.")

    # 2. Build batch list for Wikipedia PageImages
    titles_to_query: set[str] = set()
    for row in rows:
        name = row[1]
        clean = clean_poi_name(name)
        for pattern, canonical in KNOWN_HERITAGE_WIKI_MAP.items():
            if pattern.lower() in clean.lower():
                titles_to_query.add(canonical)
        titles_to_query.add(clean)

    wiki_titles_list = sorted(list(titles_to_query))
    print(f"Prepared {len(wiki_titles_list)} candidate titles for Wikipedia PageImages batch query.")

    # Query in batches of 40 titles
    wiki_cache: dict[str, str] = {}
    batch_size = 40
    for i in range(0, len(wiki_titles_list), batch_size):
        batch = wiki_titles_list[i : i + batch_size]
        batch_results = query_wikipedia_pageimages(batch)
        wiki_cache.update(batch_results)
        time.sleep(0.5)

    print(f"Successfully retrieved {len(wiki_cache)} high-res images from Wikipedia.")

    # 3. Resolve images for each POI
    enriched_catalog: list[dict[str, Any]] = []
    enriched_count = 0
    fallback_count = 0

    updates_to_commit: list[tuple[str | None, list[str], str]] = []

    for row in rows:
        poi_id, name, category, city, description, current_img, current_gallery = row
        hero, gallery = resolve_poi_imagery(name, category, city, description or "", wiki_cache)

        if hero:
            enriched_count += 1
        else:
            fallback_count += 1

        enriched_catalog.append({
            "poi_id": poi_id,
            "name": name,
            "city": city,
            "category": category,
            "hero_image": hero,
            "gallery_urls": gallery,
            "has_authentic_image": hero is not None,
        })

        updates_to_commit.append((hero, gallery, poi_id))

    coverage_pct = (enriched_count / total_records * 100) if total_records else 0
    print("-" * 70)
    print(f"Enrichment Summary:")
    print(f"  - Total Processed: {total_records}")
    print(f"  - With Authentic Image: {enriched_count} ({coverage_pct:.1f}%)")
    print(f"  - Using Fallback Category Pool: {fallback_count} ({100 - coverage_pct:.1f}%)")
    print("-" * 70)

    # 4. Save catalog JSON for auditing
    OUTPUT_CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "total_records": total_records,
                "enriched_count": enriched_count,
                "coverage_pct": round(coverage_pct, 2),
                "catalog": enriched_catalog,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"Saved full image catalog to: {OUTPUT_CATALOG_PATH}")

    # 5. Commit to database if live-commit
    if not dry_run and updates_to_commit:
        print("\nApplying updates to Supabase PostgreSQL...")
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    UPDATE public.pois
                    SET image_url = %s,
                        gallery_urls = %s,
                        updated_at = NOW()
                    WHERE poi_id = %s;
                    """,
                    updates_to_commit,
                )
            conn.commit()
        print(f"Successfully committed updates for {len(updates_to_commit)} POIs to Supabase.")
    elif dry_run:
        print("\n[INFO] DRY-RUN completed. No records were modified in Supabase.")
        print("To persist these images into Supabase, run with: --live-commit")

    return {
        "total_records": total_records,
        "enriched_count": enriched_count,
        "coverage_pct": coverage_pct,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich POIs in Supabase with authentic images")
    parser.add_argument(
        "--live-commit",
        action="store_true",
        help="Commit changes to Supabase PostgreSQL. Default is dry-run.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without committing changes (default).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit the number of records to process.",
    )
    args = parser.parse_args()

    is_live = args.live_commit and not args.dry_run
    enrich_pois(dry_run=not is_live, limit=args.limit)


if __name__ == "__main__":
    main()
