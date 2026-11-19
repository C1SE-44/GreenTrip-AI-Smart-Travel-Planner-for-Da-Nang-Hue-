"""Database-standard filtering, cleaning, deduplication, and verification for crawled stays.

Transforms raw Google Maps stay records (backend/raw_gmaps_stays_full.json) into
clean, PostgreSQL `public.pois`-aligned stay records with strict schema checks,
E.164 phone standardization, official-website vs OTA/social separation, room-variant
consolidation, Bayesian satisfaction & logarithmic popularity scores, and live HTTP
image spot-verification.

Usage:
    python backend/scripts/clean_and_verify_stays.py [--verify-images 50]
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
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

from scripts.clean_and_verify_all_pois import is_dummy_phone, normalize_e164_phone, slugify
from scripts.enrich_poi_scores import calculate_popularity_score, calculate_satisfaction_score

DEFAULT_INPUT = BACKEND_DIR / "raw_gmaps_stays_full.json"
DEFAULT_OUT_JSON = PROJECT_ROOT / "data" / "processed" / "stays_cleaned.json"
DEFAULT_OUT_CSV = PROJECT_ROOT / "data" / "processed" / "stays_cleaned.csv"
DEFAULT_REPORT = PROJECT_ROOT / "data" / "processed" / "stays_quality_report.json"

STAY_CATEGORY_NAME = "Lưu trú và nghỉ dưỡng"

AMBIGUOUS_RESIDENTIAL_CATEGORIES = frozenset(
    {
        "chung cu",
        "khu lien hop can ho",
        "toa nha voi cac can ho da duoc hoan thien",
        "khu phuc hop nha o",
        "du an nha",
    }
)

STAY_NAME_KEYWORDS = (
    "hotel", "khach san", "homestay", "resort", "villa", "nha nghi",
    "apartment", "can ho", "hostel", "motel", "house", "stay", "lodge",
    "retreat", "bungalow", "suite", "studio", "inn", "home", "phong",
    "room", "plaza", "tower", "residence", "sleep box", "glamp",
)

NON_STAY_NAME_BLOCKLIST = (
    "dang uy", "uy ban", "ubnd", "cong an", "benh vien", "tram y te",
    "truong tieu hoc", "truong thcs", "truong thpt", "truong mam non",
    "dai hoc", "khu do thi", "khu pho du lich", "lang truyen thong",
    "ky tuc xa", "beer quan", "nha van hoa",
    "tap hoa", "cho thue leu", "cong ty du lich", "massage tai nha",
    "nha o xa hoi", "tai dinh cu", "xuong noi that", "noi that thien an",
    "cdt can ho", "cong ty co phan can ho", "ho phuoc hoa", "duong so 16",
    "cu dinh", "nha tran van nhi", "nha thay chan", "duy phuoc",
    "thon cam lanh",
)
EXACT_NON_STAY_NAMES = frozenset({"hoa xuan", "my khe beach", "bai bien my khe", "bai bien"})

CENTROID_PLACEHOLDER_PLUS_CODES = ("333c+qmq",)

AGGREGATOR_SPAM_DOMAINS = (
    "br.bluepillow.com",
    "bluepillow.com",
    "freecancellations.com",
    "deals.vio.com",
    "vio.com",
    "business.google.com",
    "sites.google.com",
)

OTA_BOOKING_DOMAINS = (
    "booking.com",
    "agoda.com",
    "airbnb.com",
    "vrbo.com",
    "traveloka.com",
    "trip.com",
    "expedia.com",
    "hotels.com",
    "oyorooms.com",
)

INTERNATIONAL_CHAINS = (
    "marriott", "sheraton", "melia", "meliá", "hyatt", "intercontinental",
    "pullman", "novotel", "hilton", "accor", "wyndham", "radisson",
    "four seasons", "banyan tree", "angsana", "crowne plaza", "voco ",
    "mercure", "ibis", "le meridien", "best western", "fusion",
)

ROOM_SUFFIX_TOKENS = (
    "room", "studio", "apartment", "suite", "villa", "bungalow", "dormitory",
    "dorm", "bed", "phong", "can ho", "entire house", "entire home",
    "balcony", "ocean view", "sea view", "city view", "garden view",
    "river view", "mountain view", "pool view", "courtyard view",
    "kitchenette", "bedroom", "1br", "2br", "3br", "4br", "deluxe",
    "superior", "standard", "family", "queen", "king", "twin", "double",
    "single", "triple", "quadruple",
)

CITY_BOUNDS = {
    "DANANG": (14.90, 16.25, 107.20, 108.85),
    "HUE": (16.05, 16.75, 107.00, 108.25),
}

_PUA_RE = re.compile(r"[\ue000-\uf8ff]")


def strip_accents_lower(text: str) -> str:
    value = unicodedata.normalize("NFKD", (text or "").casefold())
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def clean_str(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = _PUA_RE.sub(" ", str(value))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or None


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def recover_raw_category(record: dict[str, Any]) -> str | None:
    cat = clean_str(record.get("raw_category"))
    if cat and strip_accents_lower(cat).startswith("cach "):
        cat = None
    if cat:
        return cat

    panel = unicodedata.normalize("NFC", str(record.get("raw_place_panel_text") or ""))
    if not panel:
        return None

    m = re.search(r"\(\s*[\d.,]+\s*[kKmM]?\s*\)\s*(?:·\s*|\n)([^\n]{2,60})", panel)
    if m:
        candidate = clean_str(m.group(1).split("·", 1)[0])
        if candidate:
            norm = strip_accents_lower(candidate)
            if norm not in {"tong quan", "overview", "gia", "prices", "bai danh gia", "reviews", "gioi thieu", "about"} and not norm.startswith(("bua sang", "do xe", "wi fi", "cach ")):
                return candidate

    for label in ("Nhà/căn hộ du lịch", "Căn hộ", "Biệt thự", "Nhà ở", "Phòng riêng"):
        if re.search(rf"(?:^|\n){re.escape(label)}(?:\n|$)", panel):
            return label
    return None


def map_sub_category(raw_category: str | None, name: str) -> tuple[str, int | None]:
    cat_norm = strip_accents_lower(raw_category or "")
    name_norm = strip_accents_lower(name)

    star_match = re.search(r"([1-5])\s*sao\b", cat_norm)
    star_rating = int(star_match.group(1)) if star_match else None

    if "khu cam trai" in cat_norm or "choi cam trai" in cat_norm or "cu tru o trang trai" in cat_norm or any(
        w in name_norm for w in ("glamp", "eco lodge", "ecolodge", "farmstay", "forest stay")
    ):
        return "eco_lodge", star_rating
    if "nghi duong" in cat_norm or "resort" in cat_norm or "resort" in name_norm:
        return "resort", star_rating
    if "biet thu" in cat_norm or "nha vuon" in cat_norm or "nha tranh" in cat_norm or "villa" in name_norm:
        return "villa", star_rating
    if (
        any(
            k in cat_norm
            for k in ("luu tru nha dan", "nha o", "giuong bua sang", "phong rieng", "cho tro trong nha")
        )
        or "homestay" in name_norm
        or ("nha can ho du lich" in cat_norm and not any(w in name_norm for w in ("apartment", "can ho", "penthouse", "condotel", "studio")))
    ):
        return "homestay", star_rating
    if any(
        k in cat_norm
        for k in ("can ho", "chung cu", "toa nha", "cho o duoc phuc vu", "cho o tu nau an")
    ) or any(w in name_norm for w in ("apartment", "can ho", "penthouse", "condotel")):
        return "serviced_apartment", star_rating
    if "nha nghi thanh nien" in cat_norm or any(w in name_norm for w in ("hostel", "dorm", "sleep box")):
        return "hostel", star_rating
    if any(
        k in cat_norm
        for k in (
            "nha nghi truot tuyet", "nha khach", "tram nghi", "nha tro",
            "phong cho thue", "nha nghi hanh huong", "khach san tinh yeu",
            "dai ly cho thue nha nghi", "dai ly cho thue phong nghi",
        )
    ) or any(w in name_norm for w in ("nha nghi", "motel", "guest house", "guesthouse")):
        return "guesthouse", star_rating
    if "khach san" in cat_norm or "noi luu tru" in cat_norm or any(w in name_norm for w in ("hotel", "khach san")):
        return "hotel", star_rating
    return "homestay", star_rating


def parse_rating(raw_rating: Any) -> float | None:
    if raw_rating is None:
        return None
    s = str(raw_rating).strip().replace(",", ".")
    m = re.search(r"([1-5](?:\.\d{1,2})?)", s)
    if not m:
        return None
    val = float(m.group(1))
    return round(val, 2) if 1.0 <= val <= 5.0 else None


def parse_review_count(raw_rc: Any) -> int:
    if raw_rc is None:
        return 0
    s = str(raw_rc).strip().lower()
    if not s:
        return 0
    m = re.match(r"([\d.,]+)\s*([knm])?", s)
    if not m:
        return 0
    num_str, unit = m.group(1), m.group(2)
    if unit in ("k", "n"):
        return int(round(float(num_str.replace(",", ".")) * 1000))
    if unit == "m":
        return int(round(float(num_str.replace(",", ".")) * 1_000_000))
    digits = re.sub(r"[^\d]", "", num_str)
    return int(digits) if digits else 0


def parse_price_vnd(raw_price: Any) -> int | None:
    if raw_price is None:
        return None
    digits = re.sub(r"[^\d]", "", str(raw_price))
    if not digits:
        return None
    val = int(digits)
    return val if 50_000 <= val <= 100_000_000 else None


def classify_budget_tier(price_vnd: int | None, sub_category: str, star_rating: int | None) -> str:
    if price_vnd is not None:
        if price_vnd < 500_000:
            return "$"
        if price_vnd <= 1_500_000:
            return "$$"
        return "$$$"
    if star_rating and star_rating >= 4:
        return "$$$"
    if sub_category in ("resort", "villa"):
        return "$$$"
    if sub_category in ("guesthouse", "hostel"):
        return "$"
    return "$$"


def clean_website_and_socials(
    raw_url: str | None,
    maps_url: str | None,
) -> tuple[str | None, dict[str, str], list[str]]:
    rules: list[str] = []
    socials: dict[str, str] = {}
    if maps_url:
        socials["google_maps"] = maps_url.strip()

    website_url: str | None = None
    url = (raw_url or "").strip()
    if not url or not url.startswith(("http://", "https://")):
        return None, socials, rules

    cleaned = re.sub(r"[?&](mibextid|utm_[^=]+|fbclid|hl)=[^&]+", "", url).rstrip("?&")
    host = urllib.parse.urlsplit(cleaned).netloc.lower()

    if any(spam in host for spam in AGGREGATOR_SPAM_DOMAINS):
        rules.append("purged_aggregator_or_spam_website")
        return None, socials, rules

    if "facebook.com" in host or "fb.com" in host:
        socials["facebook"] = cleaned.replace("://m.facebook.com/", "://www.facebook.com/")
        rules.append("moved_facebook_to_social_links")
        return None, socials, rules
    if "instagram.com" in host:
        socials["instagram"] = cleaned
        rules.append("moved_instagram_to_social_links")
        return None, socials, rules
    if "zalo.me" in host:
        socials["zalo"] = cleaned
        rules.append("moved_zalo_to_social_links")
        return None, socials, rules
    if any(ota in host for ota in OTA_BOOKING_DOMAINS):
        socials["booking"] = cleaned
        rules.append("moved_ota_to_social_links")
        return None, socials, rules

    website_url = cleaned
    rules.append("official_website_verified")
    return website_url, socials, rules


def evaluate_stay_eligibility(record: dict[str, Any], raw_cat: str | None) -> tuple[bool, str | None]:
    name = clean_str(record.get("place_name")) or ""
    if not name or len(name) > 255:
        return False, "invalid_or_empty_name"

    lat, lon = record.get("latitude"), record.get("longitude")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or not (
        math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180
    ):
        return False, "missing_or_invalid_coordinates"

    addr = clean_str(record.get("raw_address"))
    if not addr:
        return False, "missing_address"

    addr_low = addr.lower()
    if any(code in addr_low for code in CENTROID_PLACEHOLDER_PLUS_CODES) and abs(lat - 16.0545) < 0.005 and abs(lon - 108.0717) < 0.005:
        return False, "city_centroid_placeholder_pin"

    panel_head = strip_accents_lower((record.get("raw_place_panel_text") or "")[:350])
    if any(p in panel_head for p in ("dong cua vinh vien", "bi dong vinh vien", "tam thoi dong cua", "dong cua tam thoi", "permanently closed", "temporarily closed")):
        return False, "closed_property"

    name_norm = strip_accents_lower(name)
    if name_norm in EXACT_NON_STAY_NAMES:
        return False, f"non_stay_name:{name_norm}"
    for bad in NON_STAY_NAME_BLOCKLIST:
        if bad in name_norm:
            if not any(stay_w in name_norm for stay_w in ("hotel", "khach san", "homestay", "resort", "villa", "nha nghi", "apartment", "hostel", "motel", "lodge")):
                return False, f"non_stay_name:{bad}"

    cat_norm = strip_accents_lower(raw_cat or "")
    if cat_norm in AMBIGUOUS_RESIDENTIAL_CATEGORIES:
        if not any(kw in name_norm for kw in STAY_NAME_KEYWORDS):
            return False, f"non_tourist_residential:{cat_norm}"
        if any(bad in name_norm for bad in ("nha o xa hoi", "tai dinh cu", "khu do thi", "chung cu phuoc ly", "chung cu nam cau")):
            return False, "residential_housing_complex"

    city_vn = record.get("city")
    city_code = "HUE" if city_vn == "Huế" else "DANANG"
    min_lat, max_lat, min_lon, max_lon = CITY_BOUNDS[city_code]
    in_hoang_sa = city_code == "DANANG" and 15.5 <= lat <= 17.2 and 111.0 <= lon <= 113.0
    if not (in_hoang_sa or (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon)):
        return False, f"outside_city_bounds:{city_code}"

    return True, None


def extract_base_property_name(name: str) -> str | None:
    for sep in (" - ", " – "):
        if sep in name:
            prefix, suffix = name.split(sep, 1)
            prefix_clean = prefix.strip()
            suffix_norm = strip_accents_lower(suffix)
            if len(strip_accents_lower(prefix_clean)) >= 4 and any(tok in suffix_norm for tok in ROOM_SUFFIX_TOKENS):
                return prefix_clean
    return None


def compute_stay_green_score(sub_category: str, name: str, is_local: bool) -> tuple[float, list[str], list[str]]:
    name_norm = strip_accents_lower(name)
    score = {
        "eco_lodge": 0.84,
        "homestay": 0.72,
        "villa": 0.66,
        "hostel": 0.65,
        "serviced_apartment": 0.60,
        "guesthouse": 0.58,
        "hotel": 0.56,
        "resort": 0.60,
    }.get(sub_category, 0.58)

    eco_features: list[str] = []
    vibes: list[str] = []

    if is_local:
        score += 0.05
        eco_features.append("Ủng hộ cơ sở lưu trú địa phương")

    if any(w in name_norm for w in ("eco", "green", "xanh", "garden", "vuon", "bamboo", "nature", "forest", "farm", "retreat", "suoi", "lang")):
        score += 0.08
        eco_features.append("Không gian xanh gần gũi thiên nhiên")
        vibes.append("Yên bình")

    if any(w in name_norm for w in ("beach", "bien", "ocean", "sea", "my khe", "lang co", "son tra")):
        vibes.append("Gần biển")
    if any(w in name_norm for w in ("river", "song", "han", "huong")):
        vibes.append("View sông")
    if sub_category in ("homestay", "eco_lodge"):
        vibes.append("Bản địa")
    elif sub_category in ("resort", "villa"):
        vibes.append("Nghỉ dưỡng")
    elif sub_category == "hotel":
        vibes.append("Tiện nghi")

    if not eco_features:
        eco_features.append("Lưu trú du lịch Đà Nẵng - Huế")
    if not vibes:
        vibes.append("Thoải mái")

    return round(min(0.95, max(0.45, score)), 2), eco_features, vibes


def consolidate_room_variants(items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Merge room-level sub-listings sharing same base property name within <= 60m."""
    clusters: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        base = extract_base_property_name(item["name"]) or item["name"]
        clusters[strip_accents_lower(base)].append(item)

    output: list[dict[str, Any]] = []
    merged_count = 0

    for base_norm, grp in clusters.items():
        if len(grp) == 1 or len(base_norm) < 4:
            output.extend(grp)
            continue

        # Partition by spatial proximity <= 60m
        spatial_groups: list[list[dict[str, Any]]] = []
        for item in grp:
            placed = False
            for sg in spatial_groups:
                if haversine_m(item["latitude"], item["longitude"], sg[0]["latitude"], sg[0]["longitude"]) <= 60.0:
                    sg.append(item)
                    placed = True
                    break
            if not placed:
                spatial_groups.append([item])

        for sg in spatial_groups:
            if len(sg) == 1:
                output.append(sg[0])
                continue

            # Pick canonical parent: prefer non-room-suffixed listing, then richness
            def rank_parent(rec: dict[str, Any]) -> tuple[int, int, int, int]:
                is_root = 1 if extract_base_property_name(rec["name"]) is None else 0
                has_img = 1 if rec["image_url"] else 0
                revs = rec["ai_metadata"].get("review_count", 0)
                gal = len(rec["gallery_urls"])
                return (is_root, has_img, revs, gal)

            sg_sorted = sorted(sg, key=rank_parent, reverse=True)
            parent = sg_sorted[0]
            base_display = extract_base_property_name(parent["name"])
            if base_display and len(sg_sorted) > 1 and extract_base_property_name(parent["name"]) is not None:
                # Multiple room variants with no root entry -> promote clean base name
                parent["ai_metadata"]["original_primary_name"] = parent["name"]
                parent["name"] = base_display

            variants: list[dict[str, Any]] = []
            merged_pids = list(parent["ai_metadata"].get("merged_place_ids") or [])
            all_gallery = list(parent["gallery_urls"])
            prices = [p for p in [parent["estimated_cost"]] if p is not None]

            for child in sg_sorted[1:]:
                merged_count += 1
                pid = child["ai_metadata"].get("place_id")
                if pid and pid not in merged_pids:
                    merged_pids.append(pid)
                for url in child["gallery_urls"]:
                    if url not in all_gallery:
                        all_gallery.append(url)
                if child["estimated_cost"] is not None:
                    prices.append(child["estimated_cost"])
                variants.append(
                    {
                        "name": child["name"],
                        "price_vnd": child["estimated_cost"],
                        "place_id": pid,
                    }
                )
                for field in ("phone_number", "website_url"):
                    if not parent.get(field) and child.get(field):
                        parent[field] = child[field]

            parent["gallery_urls"] = all_gallery
            parent["image_url"] = parent["image_url"] or (all_gallery[0] if all_gallery else None)
            if prices:
                parent["estimated_cost"] = min(prices)
                parent["ai_metadata"]["min_price_vnd"] = min(prices)
                parent["ai_metadata"]["max_price_vnd"] = max(prices)
                parent["ai_metadata"]["price_range_display"] = (
                    f"{min(prices):,}".replace(",", ".") + " ₫"
                    if min(prices) == max(prices)
                    else f"{min(prices):,} – {max(prices):,} ₫".replace(",", ".")
                )
            if merged_pids:
                parent["ai_metadata"]["merged_place_ids"] = merged_pids
            if variants:
                parent["ai_metadata"]["room_variants"] = variants
                parent["ai_metadata"]["cleaning_rules_applied"].append("consolidated_room_variants")
            output.append(parent)

    return output, merged_count


def validate_db_constraints(records: list[dict[str, Any]]) -> list[str]:
    violations: list[str] = []
    seen_dedup: set[str] = set()
    for idx, rec in enumerate(records):
        name = rec.get("name") or ""
        if not name or len(name) > 255:
            violations.append(f"[{idx}] invalid name length: {len(name)}")
        if rec.get("city_code") not in ("DANANG", "HUE"):
            violations.append(f"[{idx}] invalid city_code: {rec.get('city_code')}")
        lat, lon = rec.get("latitude"), rec.get("longitude")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            violations.append(f"[{idx}] non-numeric coords")
        if rec.get("estimated_cost") is not None and rec["estimated_cost"] < 0:
            violations.append(f"[{idx}] negative estimated_cost")
        if not (0 <= rec.get("satisfaction_score", -1) <= 100):
            violations.append(f"[{idx}] satisfaction_score out of [0, 100]")
        if not (0 <= rec.get("popularity_score", -1) <= 100):
            violations.append(f"[{idx}] popularity_score out of [0, 100]")
        if rec.get("phone_number") and len(rec["phone_number"]) > 50:
            violations.append(f"[{idx}] phone_number > 50 chars")
        if rec.get("budget_tier") not in ("$", "$$", "$$$"):
            violations.append(f"[{idx}] invalid budget_tier: {rec.get('budget_tier')}")
        dk = rec.get("ai_metadata", {}).get("dedup_key")
        if dk:
            if dk in seen_dedup:
                violations.append(f"[{idx}] duplicate dedup_key: {dk}")
            seen_dedup.add(dk)
    return violations


def spot_check_images(records: list[dict[str, Any]], sample_size: int) -> dict[str, Any]:
    with_img = [r for r in records if r.get("image_url")]
    if sample_size <= 0 or not with_img:
        return {"checked": 0, "ok": 0, "failed": 0, "failures": []}
    step = max(1, len(with_img) // sample_size)
    samples = with_img[::step][:sample_size]
    ok = 0
    failures: list[dict[str, Any]] = []
    for r in samples:
        url = r["image_url"]
        try:
            req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                ctype = resp.headers.get("Content-Type") or ""
                if resp.status == 200 and "image" in ctype:
                    ok += 1
                else:
                    failures.append({"name": r["name"], "status": resp.status, "content_type": ctype})
        except Exception as exc:
            failures.append({"name": r["name"], "error": str(exc)[:150]})
    return {"checked": len(samples), "ok": ok, "failed": len(failures), "failures": failures}


def run_pipeline(
    input_path: Path = DEFAULT_INPUT,
    out_json: Path = DEFAULT_OUT_JSON,
    out_csv: Path = DEFAULT_OUT_CSV,
    report_path: Path = DEFAULT_REPORT,
    verify_images: int = 40,
) -> dict[str, Any]:
    raw_records: list[dict[str, Any]] = json.loads(input_path.read_text(encoding="utf-8"))
    dropped_reasons: Counter[str] = Counter()
    cleaned_items: list[dict[str, Any]] = []
    dummy_phones_purged = 0
    url_rules_counter: Counter[str] = Counter()

    for raw in raw_records:
        raw_cat = recover_raw_category(raw)
        ok, reason = evaluate_stay_eligibility(raw, raw_cat)
        if not ok:
            dropped_reasons[reason or "ineligible"] += 1
            continue

        name = clean_str(raw.get("place_name")) or ""
        address = clean_str(raw.get("raw_address")) or ""
        lat = round(float(raw["latitude"]), 7)
        lon = round(float(raw["longitude"]), 7)
        city_vn = "Huế" if raw.get("city") == "Huế" else "Đà Nẵng"
        city_code = "HUE" if city_vn == "Huế" else "DANANG"
        city_name = "Hue" if city_code == "HUE" else "Da Nang"

        sub_category, star_rating = map_sub_category(raw_cat, name)

        raw_phone = clean_str(raw.get("raw_phone"))
        phone_number = normalize_e164_phone(raw_phone)
        if raw_phone and not phone_number:
            dummy_phones_purged += 1

        website_url, social_links, url_rules = clean_website_and_socials(
            raw.get("raw_website_url"),
            raw.get("google_maps_url"),
        )
        for rule in url_rules:
            url_rules_counter[rule] += 1

        rating = parse_rating(raw.get("raw_rating"))
        review_count = parse_review_count(raw.get("raw_review_count"))
        price_vnd = parse_price_vnd(raw.get("raw_price"))
        budget_tier = classify_budget_tier(price_vnd, sub_category, star_rating)

        satisfaction_score = calculate_satisfaction_score(rating, review_count)
        popularity_score = calculate_popularity_score(
            review_count,
            name=name,
            category=STAY_CATEGORY_NAME,
            sub_category=sub_category,
        )

        name_norm = strip_accents_lower(name)
        is_local = not any(chain in name_norm for chain in INTERNATIONAL_CHAINS)
        green_score, eco_features, vibes = compute_stay_green_score(sub_category, name, is_local)

        gallery_urls = [
            u.strip()
            for u in (raw.get("gallery_urls") or [])
            if isinstance(u, str) and u.strip().startswith("https://")
        ]
        # Deduplicate preserving order
        gallery_urls = list(dict.fromkeys(gallery_urls))
        image_url = clean_str(raw.get("image_url"))
        if image_url and not image_url.startswith("https://"):
            image_url = None
        image_url = image_url or (gallery_urls[0] if gallery_urls else None)

        local_business_type = (
            "eco_lodge" if sub_category == "eco_lodge"
            else "homestay" if sub_category == "homestay"
            else "serviced_apartment" if sub_category == "serviced_apartment"
            else "boutique_villa" if sub_category == "villa"
            else "guesthouse" if sub_category in ("guesthouse", "hostel")
            else "resort" if sub_category == "resort"
            else "local_hotel"
        )

        verification_status = (
            "VERIFIED_ACTIVE" if (image_url and address and rating is not None)
            else "VERIFIED_PARTIAL" if (address and (image_url or rating is not None))
            else "NEEDS_REVIEW"
        )

        rules_applied = [
            "pua_icons_stripped",
            "city_bounds_verified",
            *url_rules,
        ]
        if phone_number:
            rules_applied.append("phone_e164_standardized")
        elif raw_phone:
            rules_applied.append("dummy_phone_purged")

        dedup_key = f"{slugify(name)}_{round(lat, 3)}_{round(lon, 3)}"
        price_display = f"{price_vnd:,} ₫".replace(",", ".") if price_vnd is not None else None

        cleaned_items.append(
            {
                "name": name,
                "category": STAY_CATEGORY_NAME,
                "sub_category": sub_category,
                "city_code": city_code,
                "city_name": city_name,
                "city_display": city_vn,
                "area_id": raw.get("area_id"),
                "locality": raw.get("locality"),
                "latitude": lat,
                "longitude": lon,
                "address": address,
                "phone_number": phone_number,
                "website_url": website_url,
                "social_links": social_links,
                "image_url": image_url,
                "gallery_urls": gallery_urls,
                "estimated_cost": price_vnd,
                "budget_tier": budget_tier,
                "average_visit_minutes": 720,
                "satisfaction_score": satisfaction_score,
                "popularity_score": popularity_score,
                "green_score": green_score,
                "is_local_business": is_local,
                "local_business_type": local_business_type,
                "vibes": vibes,
                "best_time": ["evening", "night"],
                "eco_features": eco_features,
                "status": "ACTIVE",
                "ai_metadata": {
                    "place_id": raw.get("place_id"),
                    "merged_place_ids": raw.get("merged_place_ids") or [],
                    "dedup_key": dedup_key,
                    "raw_category": raw_cat,
                    "star_rating": star_rating,
                    "raw_rating": rating,
                    "review_count": review_count,
                    "price_range_display": price_display,
                    "google_maps_url": raw.get("google_maps_url"),
                    "verification_status": verification_status,
                    "last_verified_at": datetime.now(timezone.utc).date().isoformat(),
                    "cleaning_rules_applied": rules_applied,
                },
            }
        )

    cleaned_items, room_variants_merged = consolidate_room_variants(cleaned_items)

    # Guarantee unique dedup_key (e.g. different branches/units in same building tower)
    seen_dk: Counter[str] = Counter()
    for item in cleaned_items:
        dk = item["ai_metadata"]["dedup_key"]
        seen_dk[dk] += 1
        if seen_dk[dk] > 1:
            item["ai_metadata"]["dedup_key"] = f"{dk}_{seen_dk[dk]}"

    violations = validate_db_constraints(cleaned_items)
    image_check = spot_check_images(cleaned_items, verify_images)

    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(cleaned_items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    csv_fields = [
        "place_id", "name", "category", "sub_category", "star_rating", "city_code",
        "city_name", "locality", "latitude", "longitude", "address", "phone_number",
        "website_url", "booking_url", "facebook_url", "google_maps_url", "image_url",
        "gallery_count", "estimated_cost", "budget_tier", "raw_rating", "review_count",
        "satisfaction_score", "popularity_score", "green_score", "is_local_business",
        "local_business_type", "verification_status",
    ]
    with out_csv.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields)
        writer.writeheader()
        for item in cleaned_items:
            meta = item["ai_metadata"]
            soc = item["social_links"]
            writer.writerow(
                {
                    "place_id": meta.get("place_id") or "",
                    "name": item["name"],
                    "category": item["category"],
                    "sub_category": item["sub_category"],
                    "star_rating": meta.get("star_rating") or "",
                    "city_code": item["city_code"],
                    "city_name": item["city_name"],
                    "locality": item.get("locality") or "",
                    "latitude": item["latitude"],
                    "longitude": item["longitude"],
                    "address": item["address"],
                    "phone_number": item["phone_number"] or "",
                    "website_url": item["website_url"] or "",
                    "booking_url": soc.get("booking") or "",
                    "facebook_url": soc.get("facebook") or "",
                    "google_maps_url": soc.get("google_maps") or "",
                    "image_url": item["image_url"] or "",
                    "gallery_count": len(item["gallery_urls"]),
                    "estimated_cost": item["estimated_cost"] if item["estimated_cost"] is not None else "",
                    "budget_tier": item["budget_tier"],
                    "raw_rating": meta.get("raw_rating") if meta.get("raw_rating") is not None else "",
                    "review_count": meta.get("review_count", 0),
                    "satisfaction_score": item["satisfaction_score"],
                    "popularity_score": item["popularity_score"],
                    "green_score": item["green_score"],
                    "is_local_business": item["is_local_business"],
                    "local_business_type": item["local_business_type"],
                    "verification_status": meta.get("verification_status"),
                }
            )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "input_records": len(raw_records),
        "output_records": len(cleaned_items),
        "dropped_total": sum(dropped_reasons.values()),
        "dropped_by_reason": dict(dropped_reasons.most_common()),
        "room_variants_merged": room_variants_merged,
        "dummy_phones_purged": dummy_phones_purged,
        "url_rules_applied": dict(url_rules_counter.most_common()),
        "cities": dict(Counter(r["city_code"] for r in cleaned_items)),
        "sub_categories": dict(Counter(r["sub_category"] for r in cleaned_items).most_common()),
        "budget_tiers": dict(Counter(r["budget_tier"] for r in cleaned_items)),
        "verification_status": dict(Counter(r["ai_metadata"]["verification_status"] for r in cleaned_items)),
        "completeness": {
            "address": sum(1 for r in cleaned_items if r.get("address")),
            "coordinates": sum(1 for r in cleaned_items if r.get("latitude") is not None),
            "image_url": sum(1 for r in cleaned_items if r.get("image_url")),
            "phone_number": sum(1 for r in cleaned_items if r.get("phone_number")),
            "official_website_url": sum(1 for r in cleaned_items if r.get("website_url")),
            "estimated_cost": sum(1 for r in cleaned_items if r.get("estimated_cost") is not None),
            "raw_rating": sum(1 for r in cleaned_items if r["ai_metadata"].get("raw_rating") is not None),
            "review_count_gt_0": sum(1 for r in cleaned_items if r["ai_metadata"].get("review_count", 0) > 0),
        },
        "db_constraint_violations": violations,
        "live_image_http_check": image_check,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean and verify crawled stays to GreenTrip DB standards.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--out-json", default=str(DEFAULT_OUT_JSON))
    parser.add_argument("--out-csv", default=str(DEFAULT_OUT_CSV))
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    parser.add_argument("--verify-images", type=int, default=40)
    args = parser.parse_args()

    report = run_pipeline(
        input_path=Path(args.input),
        out_json=Path(args.out_json),
        out_csv=Path(args.out_csv),
        report_path=Path(args.report),
        verify_images=args.verify_images,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["db_constraint_violations"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
