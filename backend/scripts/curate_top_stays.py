"""Curate a balanced, verified 160-stay dataset (80 Da Nang + 80 Hue) from 51c5c3b.

Reads verified `Lưu trú và nghỉ dưỡng` records from a source unified CSV or Git
revision (`51c5c3b:data/processed/greentrip_pois_unified.csv`), verifies live
image reachability, enforces Migration 018 domain bounds, balances eco lodges,
homestays, resorts, villas, and hotels across `$`, `$$`, `$$$` budget tiers,
normalizes `/ đêm` price display, and writes compact CSV + quality report JSON.

Usage:
    python backend/scripts/curate_top_stays.py
    python backend/scripts/curate_top_stays.py --skip-image-check
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import subprocess
import sys
import uuid
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.pois.price_normalizer import normalize_poi_price_display  # noqa: E402

STAY_CATEGORY_NAME = "Lưu trú và nghỉ dưỡng"
DEFAULT_GIT_REF = "51c5c3b:data/processed/greentrip_pois_unified.csv"
DEFAULT_OUT_CSV = PROJECT_ROOT / "data" / "processed" / "curated_stays_160.csv"
DEFAULT_OUT_REPORT = PROJECT_ROOT / "data" / "processed" / "curated_stays_160_report.json"

UNIFIED_CSV_HEADERS = [
    "poi_id",
    "city_code",
    "city_name",
    "category",
    "sub_category",
    "cuisine",
    "name",
    "description",
    "address",
    "latitude",
    "longitude",
    "phone_number",
    "website_url",
    "email",
    "social_links",
    "opening_hours",
    "image_url",
    "gallery_urls",
    "estimated_cost",
    "budget_tier",
    "average_visit_minutes",
    "satisfaction_score",
    "popularity_score",
    "green_score",
    "is_local_business",
    "local_business_type",
    "vibes",
    "best_time",
    "eco_features",
    "status",
    "is_active",
    "ai_metadata",
]

CITY_QUOTAS: dict[str, dict[str, int]] = {
    "DANANG": {
        "eco_lodge": 8,
        "homestay": 25,
        "resort": 18,
        "villa": 12,
        "hotel": 17,
    },
    "HUE": {
        "eco_lodge": 6,
        "homestay": 28,
        "resort": 16,
        "villa": 12,
        "hotel": 18,
    },
}

BACKFILL_SUBCATEGORIES = ("homestay", "resort", "hotel", "villa", "eco_lodge")
BUDGET_TIER_ORDER = ("$", "$$", "$$$")
_NUMBERED_PREFIX_RE = re.compile(r"^\d+\.\s+")


def _is_finite_float(raw: str | None) -> float | None:
    if raw is None or not str(raw).strip():
        return None
    try:
        val = float(str(raw).strip())
    except ValueError:
        return None
    return val if math.isfinite(val) else None


def _is_valid_stay_candidate(row: dict[str, str]) -> bool:
    if row.get("category", "").strip() != STAY_CATEGORY_NAME:
        return False

    try:
        uuid.UUID(row["poi_id"].strip())
    except (ValueError, KeyError, AttributeError):
        return False

    city_code = row.get("city_code", "").strip().upper()
    if city_code not in CITY_QUOTAS:
        return False

    if not row.get("name", "").strip() or len(row["name"].strip()) > 255:
        return False
    if not row.get("address", "").strip():
        return False
    if not row.get("image_url", "").strip():
        return False

    lat = _is_finite_float(row.get("latitude"))
    lng = _is_finite_float(row.get("longitude"))
    if lat is None or lng is None or not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return False

    green_score = _is_finite_float(row.get("green_score"))
    if green_score is None or not (0.0 <= green_score <= 1.0):
        return False

    sat_score = _is_finite_float(row.get("satisfaction_score"))
    if sat_score is None or not (0.0 <= sat_score <= 5.0):
        return False

    est_cost = _is_finite_float(row.get("estimated_cost"))
    if est_cost is not None and est_cost < 0.0:
        return False

    try:
        visit_mins = int(float(row.get("average_visit_minutes") or "0"))
    except ValueError:
        return False
    if not (1 <= visit_mins <= 1440):
        return False

    try:
        ai_meta = json.loads(row.get("ai_metadata") or "{}")
    except json.JSONDecodeError:
        return False

    if not isinstance(ai_meta, dict) or ai_meta.get("verification_status") != "VERIFIED_ACTIVE":
        return False

    return True


def _rank_key(row: dict[str, str]) -> tuple[Any, ...]:
    ai_meta = json.loads(row.get("ai_metadata") or "{}")
    name = row["name"].strip()
    is_clean_name = 0 if _NUMBERED_PREFIX_RE.match(name) else 1
    est_cost = _is_finite_float(row.get("estimated_cost"))
    has_cost = 1 if (est_cost is not None and est_cost > 0) else 0
    sat_score = float(row.get("satisfaction_score") or 0.0)
    green_score = float(row.get("green_score") or 0.0)
    review_count = int(ai_meta.get("review_count") or 0)
    high_bar = 1 if (sat_score >= 4.4 and review_count >= 30) else 0
    return (
        -is_clean_name,
        -has_cost,
        -high_bar,
        -round(green_score, 4),
        -round(sat_score, 4),
        -min(review_count, 500),
        row["poi_id"].strip(),
    )


def _check_single_image_url(url: str, client: httpx.Client) -> tuple[str, bool]:
    try:
        resp = client.head(url)
        ct = resp.headers.get("content-type", "")
        if resp.status_code == 200 and ct.startswith("image/"):
            return url, True
        if resp.status_code in (403, 405, 400):
            get_resp = client.get(url)
            get_ct = get_resp.headers.get("content-type", "")
            return url, get_resp.status_code == 200 and get_ct.startswith("image/")
        return url, False
    except Exception:
        return url, False


def verify_image_urls(urls: list[str], max_workers: int = 20) -> dict[str, bool]:
    unique_urls = list(dict.fromkeys(u.strip() for u in urls if u and u.strip()))
    if not unique_urls:
        return {}
    limits = httpx.Limits(max_connections=max_workers, max_keepalive_connections=max_workers)
    with httpx.Client(
        timeout=8.0,
        follow_redirects=True,
        limits=limits,
        headers={"User-Agent": "Mozilla/5.0 (GreenTripStaysCurator/1.0)"},
    ) as client:
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            return dict(pool.map(lambda u: _check_single_image_url(u, client), unique_urls))


def _round_robin_pick_by_budget(
    candidates: list[dict[str, str]],
    quota: int,
    url_status: dict[str, bool] | None,
) -> list[dict[str, str]]:
    if quota <= 0:
        return []

    buckets: dict[str, list[dict[str, str]]] = {tier: [] for tier in BUDGET_TIER_ORDER}
    extra_bucket: list[dict[str, str]] = []

    for row in sorted(candidates, key=_rank_key):
        if url_status is not None and not url_status.get(row["image_url"].strip(), False):
            continue
        tier = row.get("budget_tier", "").strip()
        if tier in buckets:
            buckets[tier].append(row)
        else:
            extra_bucket.append(row)

    picked: list[dict[str, str]] = []
    tier_idx = {tier: 0 for tier in BUDGET_TIER_ORDER}

    while len(picked) < quota:
        progressed = False
        for tier in BUDGET_TIER_ORDER:
            if len(picked) >= quota:
                break
            idx = tier_idx[tier]
            bucket = buckets[tier]
            if idx < len(bucket):
                picked.append(bucket[idx])
                tier_idx[tier] += 1
                progressed = True
        if not progressed:
            break

    if len(picked) < quota and extra_bucket:
        needed = quota - len(picked)
        picked.extend(extra_bucket[:needed])

    return picked


def _normalize_selected_stay_row(
    row: dict[str, str],
    alive_gallery_urls: dict[str, bool] | None = None,
) -> dict[str, str]:
    normalized = {h: row.get(h, "") for h in UNIFIED_CSV_HEADERS}
    ai_meta = json.loads(normalized["ai_metadata"] or "{}")
    est_cost = _is_finite_float(normalized.get("estimated_cost"))
    raw_price_disp = ai_meta.get("price_range_display")
    raw_price_str = str(raw_price_disp).strip() if raw_price_disp else ""
    ai_meta["price_range_display"] = normalize_poi_price_display(
        poi_name=normalized["name"],
        category=STAY_CATEGORY_NAME,
        sub_category=normalized["sub_category"],
        raw_price_display=raw_price_str or None,
        estimated_cost=est_cost,
    )
    normalized["ai_metadata"] = json.dumps(ai_meta, ensure_ascii=False)

    hero = normalized["image_url"].strip()
    try:
        gallery = json.loads(normalized.get("gallery_urls") or "[]")
    except json.JSONDecodeError:
        gallery = []

    clean_gallery = [hero]
    for g in gallery:
        u = str(g).strip()
        if not u or u == hero or u in clean_gallery:
            continue
        if alive_gallery_urls is not None and not alive_gallery_urls.get(u, False):
            continue
        clean_gallery.append(u)
        if len(clean_gallery) >= 5:
            break
    normalized["gallery_urls"] = json.dumps(clean_gallery, ensure_ascii=False)

    if not normalized["opening_hours"].strip() or normalized["opening_hours"].strip() == "{}":
        normalized["opening_hours"] = json.dumps(
            {"status_text": "Nhận phòng 14:00 – Trả phòng 12:00"},
            ensure_ascii=False,
        )

    return normalized


def select_curated_stays(
    rows: list[dict[str, str]],
    *,
    city_quotas: dict[str, dict[str, int]] = CITY_QUOTAS,
    verify_images: bool = True,
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    """Select balanced top stays per city & sub-category with optional live image check."""
    valid_rows = [r for r in rows if _is_valid_stay_candidate(r)]
    by_city_sub: dict[str, dict[str, list[dict[str, str]]]] = defaultdict(lambda: defaultdict(list))
    for r in valid_rows:
        by_city_sub[r["city_code"].strip().upper()][r["sub_category"].strip()].append(r)

    url_status: dict[str, bool] | None = None
    if verify_images:
        candidate_urls: list[str] = []
        for city_code, quotas in city_quotas.items():
            for sc, quota in quotas.items():
                pool = sorted(by_city_sub[city_code].get(sc, []), key=_rank_key)
                # Inspect enough candidates across budget tiers to survive dead links cleanly
                tier_pools: dict[str, list[dict[str, str]]] = defaultdict(list)
                for item in pool:
                    tier_pools[item.get("budget_tier", "")].append(item)
                for items in tier_pools.values():
                    for item in items[: max(quota * 2, 16)]:
                        candidate_urls.append(item["image_url"].strip())
            # Also preload top backfill candidates across allowed sub-categories
            for sc in BACKFILL_SUBCATEGORIES:
                for item in sorted(by_city_sub[city_code].get(sc, []), key=_rank_key)[:40]:
                    candidate_urls.append(item["image_url"].strip())
        url_status = verify_image_urls(candidate_urls)

    selected: list[dict[str, str]] = []
    selected_ids: set[str] = set()
    backfill_notes: dict[str, list[str]] = defaultdict(list)

    for city_code, quotas in city_quotas.items():
        city_picked: list[dict[str, str]] = []
        target_city_total = sum(quotas.values())

        for sub_cat, quota in quotas.items():
            pool = [
                r for r in by_city_sub[city_code].get(sub_cat, [])
                if r["poi_id"].strip() not in selected_ids
            ]
            picks = _round_robin_pick_by_budget(pool, quota, url_status)
            for item in picks:
                selected_ids.add(item["poi_id"].strip())
                city_picked.append(item)
            if len(picks) < quota:
                backfill_notes[city_code].append(
                    f"{sub_cat}: {len(picks)}/{quota} (shortfall {quota - len(picks)})"
                )

        if len(city_picked) < target_city_total:
            for sub_cat in BACKFILL_SUBCATEGORIES:
                remaining = target_city_total - len(city_picked)
                if remaining <= 0:
                    break
                pool = [
                    r for r in by_city_sub[city_code].get(sub_cat, [])
                    if r["poi_id"].strip() not in selected_ids
                ]
                extra = _round_robin_pick_by_budget(pool, remaining, url_status)
                for item in extra:
                    selected_ids.add(item["poi_id"].strip())
                    city_picked.append(item)

        if len(city_picked) != target_city_total:
            raise RuntimeError(
                f"City {city_code} reached {len(city_picked)} stays instead of {target_city_total}."
            )

        selected.extend(city_picked)

    alive_gallery_urls: dict[str, bool] | None = None
    if verify_images:
        gallery_candidates: list[str] = []
        for item in selected:
            try:
                gals = json.loads(item.get("gallery_urls") or "[]")
            except json.JSONDecodeError:
                gals = []
            for u in gals[:5]:
                su = str(u).strip()
                if su and su not in (url_status or {}):
                    gallery_candidates.append(su)
        alive_gallery_urls = {**(url_status or {}), **verify_image_urls(gallery_candidates)}

    normalized_selected = [
        _normalize_selected_stay_row(row, alive_gallery_urls=alive_gallery_urls)
        for row in selected
    ]

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_source_stays": len(valid_rows),
        "total_curated": len(normalized_selected),
        "by_city": dict(Counter(r["city_code"] for r in normalized_selected)),
        "by_city_and_subcategory": {
            city: dict(Counter(r["sub_category"] for r in normalized_selected if r["city_code"] == city))
            for city in city_quotas
        },
        "by_budget_tier": dict(Counter(r["budget_tier"] for r in normalized_selected)),
        "green_score_range": [
            min(float(r["green_score"]) for r in normalized_selected),
            max(float(r["green_score"]) for r in normalized_selected),
        ],
        "satisfaction_score_range": [
            min(float(r["satisfaction_score"]) for r in normalized_selected),
            max(float(r["satisfaction_score"]) for r in normalized_selected),
        ],
        "with_estimated_cost": sum(1 for r in normalized_selected if r["estimated_cost"].strip()),
        "image_verification_enabled": verify_images,
        "backfill_notes": dict(backfill_notes),
    }
    return normalized_selected, report


def load_source_rows(*, source_csv: Path | None, git_ref: str) -> list[dict[str, str]]:
    if source_csv is not None:
        raw_text = source_csv.read_text(encoding="utf-8-sig")
    else:
        raw_bytes = subprocess.check_output(["git", "show", git_ref], cwd=str(PROJECT_ROOT))
        raw_text = raw_bytes.decode("utf-8-sig")
    return list(csv.DictReader(raw_text.splitlines()))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Curate top 160 verified eco stays (80 Da Nang + 80 Hue).")
    parser.add_argument("--source-csv", type=Path, default=None, help="Optional local CSV path instead of git ref.")
    parser.add_argument("--git-ref", default=DEFAULT_GIT_REF, help="Git blob ref to read unified CSV from.")
    parser.add_argument("--out-csv", type=Path, default=DEFAULT_OUT_CSV)
    parser.add_argument("--out-report", type=Path, default=DEFAULT_OUT_REPORT)
    parser.add_argument("--skip-image-check", action="store_true", help="Skip live HTTP verification (offline/test mode).")
    args = parser.parse_args(argv)

    source_rows = load_source_rows(source_csv=args.source_csv, git_ref=args.git_ref)
    curated, report = select_curated_stays(source_rows, verify_images=not args.skip_image_check)

    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.out_csv.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=UNIFIED_CSV_HEADERS)
        writer.writeheader()
        writer.writerows(curated)

    args.out_report.parent.mkdir(parents=True, exist_ok=True)
    args.out_report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"Curated {report['total_curated']} stays -> {args.out_csv} "
        f"(by_city={report['by_city']}, tiers={report['by_budget_tier']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
