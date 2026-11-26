"""Audit, repair broken POI media URLs, and migrate POI images to Supabase Storage."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
import io
import json
from pathlib import Path
import re
import sys
from typing import Any

import httpx
from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.db.postgres import get_connection  # noqa: E402

CURATED_REPLACEMENTS: dict[str, str] = {
    "seafood": "https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/6ada5f81-2278-5cbe-86a2-c2cb91480fa8.webp",
    "market": "https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/5c492955-4c55-43c9-af22-37445cd4fa38.webp",
    "food": "https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/63273e05-399c-45a6-8de9-dc774049816e.webp",
    "beach": "https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/20dbadbe-372a-4238-99ce-537e9bf8f5c7.webp",
    "lake": "https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/e6d32403-30c9-4de2-b111-96b8fddae21f.webp",
    "culture": "https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/f7d6e8a3-2a21-4242-8a84-66f1643f39a1.webp",
    "nature": "https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/c976ac2a-8a0f-41e4-ab2b-c8e6e1c2c36d.webp",
}


_SUPABASE_DB_HOST_RE = re.compile(r"^(https?://)db\.([a-z0-9-]+\.supabase\.co)", re.IGNORECASE)


def normalize_supabase_url(supabase_url: str) -> str:
    """Strip accidental Postgres `db.` subdomain prefix from Supabase project URL."""
    cleaned = supabase_url.strip().rstrip("/")
    return _SUPABASE_DB_HOST_RE.sub(r"\1\2", cleaned)


def build_storage_headers(api_key: str) -> dict[str, str]:
    key = api_key.strip()
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


def build_public_storage_url(supabase_url: str, bucket: str, object_path: str) -> str:
    base = normalize_supabase_url(supabase_url)
    clean_bucket = bucket.strip().strip("/")
    clean_path = object_path.strip().lstrip("/")
    return f"{base}/storage/v1/object/public/{clean_bucket}/{clean_path}"


def optimize_image_to_webp(raw_bytes: bytes, max_width: int = 1200, quality: int = 82) -> bytes:
    """Resize down to max_width preserving aspect ratio and encode to lightweight WebP."""
    with Image.open(io.BytesIO(raw_bytes)) as img:
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        width, height = img.size
        if width > max_width and max_width > 0:
            new_height = max(1, round(height * (max_width / width)))
            resample = getattr(Image, "Resampling", Image).LANCZOS
            img = img.resize((max_width, new_height), resample)
        out = io.BytesIO()
        img.save(out, format="WEBP", quality=quality, method=6)
        return out.getvalue()


def select_replacement_url(name: str, category: str | None = None) -> str:
    lower_name = (name or "").lower()
    lower_cat = (category or "").lower()
    if any(k in lower_name for k in ("hải sản", "hai san", "seafood")):
        return CURATED_REPLACEMENTS["seafood"]
    if "chợ" in lower_name or "market" in lower_name:
        return CURATED_REPLACEMENTS["market"]
    if any(k in lower_name for k in ("bãi", "biển", "bien", "beach")):
        return CURATED_REPLACEMENTS["beach"]
    if any(k in lower_name for k in ("hồ", "ho xanh", "suối", "thác")):
        return CURATED_REPLACEMENTS["lake"]
    if any(k in lower_cat for k in ("ẩm thực", "quan-an", "quán ăn")):
        return CURATED_REPLACEMENTS["food"]
    if any(k in lower_cat for k in ("di tích", "chùa", "di-tich", "chua")):
        return CURATED_REPLACEMENTS["culture"]
    return CURATED_REPLACEMENTS["nature"]


def _is_unrelated_mismatch(poi_name: str, url: str) -> bool:
    lower_name = (poi_name or "").lower()
    lower_url = url.lower()
    # Prevent unrelated landmark image (Thien Mu Pagoda) appearing for a market POI
    if "chợ" in lower_name and "thienmupagoda" in lower_url:
        return True
    return False


def clean_poi_media(
    poi_name: str,
    image_url: str | None,
    gallery_urls: list[str] | None,
    url_status: dict[str, bool],
    fallback_url: str,
) -> tuple[str, list[str], bool]:
    """Return (clean_image_url, clean_gallery_urls, changed) keeping only working, relevant URLs."""
    original_img = (image_url or "").strip()
    original_gallery = [str(u).strip() for u in (gallery_urls or []) if str(u).strip()]

    def is_valid(url: str) -> bool:
        return bool(url) and url_status.get(url, False) and not _is_unrelated_mismatch(poi_name, url)

    clean_gallery: list[str] = []
    for url in original_gallery:
        if is_valid(url) and url not in clean_gallery:
            clean_gallery.append(url)

    if is_valid(original_img):
        clean_img = original_img
    elif clean_gallery:
        clean_img = clean_gallery[0]
    else:
        clean_img = fallback_url

    if clean_img not in clean_gallery:
        clean_gallery.insert(0, clean_img)

    changed = clean_img != original_img or clean_gallery != original_gallery
    return clean_img, clean_gallery, changed


def _check_url_alive(url: str, client: httpx.Client) -> tuple[str, bool]:
    try:
        resp = client.head(url)
        ct = resp.headers.get("content-type", "")
        if resp.status_code == 200 and ct.startswith("image/"):
            return url, True
        if resp.status_code in (403, 405):
            get_resp = client.get(url)
            get_ct = get_resp.headers.get("content-type", "")
            return url, get_resp.status_code == 200 and get_ct.startswith("image/")
        return url, False
    except Exception:
        return url, False


def _audit_urls(urls: set[str]) -> dict[str, bool]:
    if not urls:
        return {}
    with httpx.Client(
        timeout=6.0,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (GreenTripImageAudit/1.0)"},
    ) as client:
        with ThreadPoolExecutor(max_workers=20) as pool:
            return dict(pool.map(lambda u: _check_url_alive(u, client), urls))


def _write_backup_csv(backup_path: Path, rows: list[tuple[Any, ...]]) -> None:
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    with backup_path.open("w", newline="", encoding="utf-8") as fp:
        writer = csv.writer(fp)
        writer.writerow(["poi_id", "name", "old_image_url", "old_gallery_urls_json"])
        for pid, name, _, img, gal in rows:
            writer.writerow([str(pid), name, img or "", json.dumps(list(gal or []), ensure_ascii=False)])


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit and migrate GreenTrip POI images.")
    parser.add_argument("--audit-only", action="store_true", help="Only report image URL health.")
    parser.add_argument("--fix-broken", action="store_true", help="Repair dead/broken POI URLs in DB.")
    parser.add_argument("--migrate-supabase", action="store_true", help="Upload alive images to Supabase Storage bucket.")
    parser.add_argument("--dry-run", action="store_true", help="Preview DB changes without committing.")
    parser.add_argument("--bucket", default="poi-images", help="Target Supabase Storage bucket.")
    parser.add_argument("--limit", type=int, default=0, help="Limit POIs processed during upload (0 = all).")
    parser.add_argument("--backup-csv", default="", help="Optional path to save pre-change rollback CSV.")
    args = parser.parse_args()

    if not (args.audit_only or args.fix_broken or args.migrate_supabase):
        args.audit_only = True

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT p.poi_id, p.name, c.name AS category, p.image_url, p.gallery_urls
                FROM public.pois p
                LEFT JOIN public.poi_categories c ON p.category_id = c.category_id
                ORDER BY p.name
                """
            )
            rows = cur.fetchall()

        all_urls: set[str] = set()
        for _, _, _, img, gal in rows:
            if img:
                all_urls.add(str(img).strip())
            for u in gal or []:
                if u:
                    all_urls.add(str(u).strip())

        url_status = _audit_urls(all_urls)
        bad_urls = {u for u, alive in url_status.items() if not alive}
        print(f"TOTAL_POIS={len(rows)} UNIQUE_URLS={len(all_urls)} BAD_UNIQUE_URLS={len(bad_urls)}")

        if args.audit_only:
            for pid, name, cat, img, gal in rows:
                img_bad = not img or str(img).strip() in bad_urls
                gal_bad = sum(1 for u in (gal or []) if str(u).strip() in bad_urls)
                if img_bad or gal_bad:
                    print(f"  BROKEN: {pid} | {name} ({cat}) | img_bad={img_bad} | gal_bad={gal_bad}/{len(gal or [])}")
            return 0

        if args.backup_csv:
            _write_backup_csv(Path(args.backup_csv), rows)
            print(f"BACKUP_SAVED={args.backup_csv}")

        if args.fix_broken:
            updated = 0
            with conn.cursor() as cur:
                for pid, name, cat, img, gal in rows:
                    fallback = select_replacement_url(name, cat)
                    clean_img, clean_gal, changed = clean_poi_media(name, img, gal, url_status, fallback)
                    if changed:
                        updated += 1
                        print(f"  FIX: {name} -> image={clean_img[:65]} (gallery={len(clean_gal)})")
                        if not args.dry_run:
                            cur.execute(
                                "UPDATE public.pois SET image_url = %s, gallery_urls = %s WHERE poi_id = %s",
                                (clean_img, clean_gal, pid),
                            )
            if not args.dry_run:
                conn.commit()
            print(f"FIX_BROKEN_UPDATED={updated} DRY_RUN={args.dry_run}")

        if args.migrate_supabase:
            settings = get_settings()
            supabase_url = normalize_supabase_url(settings.SUPABASE_URL)
            api_key = settings.SUPABASE_SECRET_KEY.strip() or settings.SUPABASE_SERVICE_ROLE_KEY.strip()
            if not supabase_url or not api_key:
                print(
                    "MIGRATION_SKIPPED: Thiếu SUPABASE_SECRET_KEY (hoặc SUPABASE_SERVICE_ROLE_KEY) trong .env. "
                    "Hãy thêm key server của Supabase vào .env rồi chạy lại --migrate-supabase."
                )
                return 2

            headers = build_storage_headers(api_key)
            bucket_prefix = f"/storage/v1/object/public/{args.bucket}/"
            pending = [
                (pid, name, cat, img, gal)
                for pid, name, cat, img, gal in rows
                if str(img or "").strip() and bucket_prefix not in str(img or "")
            ]
            if args.limit:
                pending = pending[: args.limit]

            def _download_convert_upload(
                item: tuple[Any, str, str | None, str | None, list[str] | None],
                dl_client: httpx.Client,
                up_client: httpx.Client,
            ) -> tuple[Any, str, list[str], str]:
                pid, name, cat, img, gal = item
                src_url = str(img or "").strip()
                fallback_url = select_replacement_url(name, cat)
                if not url_status.get(src_url, False):
                    src_url = fallback_url

                raw_bytes: bytes | None = None
                try:
                    resp = dl_client.get(src_url)
                    resp.raise_for_status()
                    webp_bytes = optimize_image_to_webp(resp.content)
                    raw_bytes = webp_bytes
                except Exception:
                    if src_url != fallback_url:
                        resp = dl_client.get(fallback_url)
                        resp.raise_for_status()
                        raw_bytes = optimize_image_to_webp(resp.content)
                        src_url = fallback_url
                    else:
                        raise

                obj_path = f"{pid}.webp"
                public_url = build_public_storage_url(supabase_url, args.bucket, obj_path)
                if not args.dry_run:
                    upload_url = f"{supabase_url}/storage/v1/object/{args.bucket}/{obj_path}"
                    up_headers = {**headers, "Content-Type": "image/webp", "x-upsert": "true"}
                    up_resp = up_client.post(upload_url, headers=up_headers, content=raw_bytes)
                    up_resp.raise_for_status()

                new_gal = [public_url] + [
                    u for u in (gal or []) if u and u != src_url and url_status.get(u, False)
                ]
                return pid, public_url, new_gal[:5], name

            migrated = 0
            failed = 0
            limits = httpx.Limits(max_connections=16, max_keepalive_connections=16)
            with (
                httpx.Client(
                    timeout=15.0,
                    follow_redirects=True,
                    limits=limits,
                    headers={"User-Agent": "Mozilla/5.0 (GreenTripImageMigrate/1.0)"},
                ) as dl_client,
                httpx.Client(timeout=20.0, limits=limits) as up_client,
                ThreadPoolExecutor(max_workers=8) as pool,
                conn.cursor() as cur,
            ):
                future_map = {
                    pool.submit(_download_convert_upload, item, dl_client, up_client): item
                    for item in pending
                }
                for fut in as_completed(future_map):
                    pid, name, _, _, _ = future_map[fut]
                    try:
                        done_pid, public_url, new_gal, _ = fut.result()
                        if not args.dry_run:
                            cur.execute(
                                "UPDATE public.pois SET image_url = %s, gallery_urls = %s WHERE poi_id = %s",
                                (public_url, new_gal, done_pid),
                            )
                        migrated += 1
                        if not args.dry_run and migrated % 25 == 0:
                            conn.commit()
                            print(f"MIGRATE_PROGRESS={migrated}/{len(pending)}")
                    except Exception as exc:
                        failed += 1
                        print(f"  WARN_SKIP: {pid} | {name} | {exc}")
                if not args.dry_run:
                    conn.commit()
            print(f"MIGRATED_TO_SUPABASE={migrated} FAILED={failed} DRY_RUN={args.dry_run}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
