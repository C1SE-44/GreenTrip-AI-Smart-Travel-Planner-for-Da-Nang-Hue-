from __future__ import annotations

import csv
import json
import sys
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

# Ensure standard output handles UTF-8 on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ============================================================
# Architectural Documentation
# ============================================================
# 1. average_visit_minutes: Intentionally left empty in this CSV to prevent source
#    data fabrication. OSM does not provide dwell time. It is derived later in Task 1.23
#    via Category Baseline Heuristics during database ingestion.
# 2. is_local_business: Rule-based heuristic inferring independent local businesses
#    vs corporate chains using the 'brand' tag and recognized commercial chains.
# 3. category_name: GreenTrip 10-class travel taxonomy, mapping raw OSM tags into
#    controlled travel categories for Task 1.23 FK resolution (poi_categories.category_id).
# ============================================================


# ============================================================
# Configuration
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]
INPUT_FILE = PROJECT_ROOT / "data" / "raw" / "osm_pois.json"
OUTPUT_DIR = PROJECT_ROOT / "data" / "processed"
OUTPUT_FILE = OUTPUT_DIR / "pois.csv"

CSV_HEADERS = [
    # Provenance
    "osm_type",
    "osm_id",
    # Geography & FK Mapping
    "city_code",
    "city_name",
    # Identity & Categorization
    "name",
    "category_name",
    "latitude",
    "longitude",
    # Travel Context
    "address",
    "description",
    "phone",
    "website",
    "opening_hours",
    "cuisine",
    "is_local_business",
    "local_business_type",
    # Database Metric Placeholders (uninvented)
    "estimated_cost",
    "average_visit_minutes",
    "satisfaction_score",
    "popularity_score",
]

# Recognizable commercial chains / corporate franchises
KNOWN_CHAINS = {
    "highlands coffee",
    "the coffee house",
    "starbucks",
    "phúc long",
    "phuc long",
    "cong caphe",
    "cộng cà phê",
    "winmart",
    "winmart+",
    "co.opmart",
    "coopmart",
    "go!",
    "big c",
    "lotte mart",
    "kfc",
    "lotteria",
    "jollibee",
    "mcdonald's",
    "pizza hut",
    "domino's pizza",
    "cgv",
    "lotte cinema",
    "circle k",
    "ministop",
    "gs25",
    "7-eleven",
}


# ============================================================
# Category Normalization
# ============================================================

CONTROLLED_CATEGORIES: tuple[str, ...] = (
    "Ẩm thực và quán ăn",
    "Quán cafe giải khát",
    "Di tích lịch sử và văn hóa",
    "Cảnh quan và thiên nhiên",
    "Tâm linh và chùa thiền",
)


def normalize_category(tags: dict[str, Any], name: str = "") -> str | None:
    """
    Map raw OpenStreetMap tags and names into 5 controlled travel categories.

    Controlled categories:
    1. Ẩm thực và quán ăn
    2. Quán cafe giải khát
    3. Di tích lịch sử và văn hóa
    4. Cảnh quan và thiên nhiên
    5. Tâm linh và chùa thiền
    """
    historic = tags.get("historic")
    tourism = tags.get("tourism")
    amenity = tags.get("amenity")
    leisure = tags.get("leisure")
    shop = tags.get("shop")
    name_clean = (name or str(tags.get("name", ""))).strip().lower()

    # 1. Tâm linh và chùa thiền (Priority 1)
    if amenity in {"place_of_worship", "monastery"} or any(
        w in name_clean
        for w in ["chùa ", "thiền viện", "tịnh xá", "tu viện", "nhà thờ", "giáo xứ"]
    ):
        if "chợ" not in name_clean:
            return "Tâm linh và chùa thiền"
    if (historic or any(w in name_clean for w in ["đền ", "miếu"])) and any(
        w in name_clean for w in ["đền ", "miếu"]
    ) and "chợ" not in name_clean:
        return "Tâm linh và chùa thiền"

    # 2. Di tích lịch sử và văn hóa (Priority 2)
    if (
        historic
        or tourism in {"museum", "gallery", "artwork"}
        or amenity in {"museum", "arts_centre", "theatre"}
        or any(
            w in name_clean
            for w in [
                "bảo tàng",
                "di tích",
                "lăng ",
                "lăng mộ",
                "hoàng thành",
                "đại nội",
                "cố đô",
                "cổng thành",
                "di sản",
            ]
        )
    ):
        return "Di tích lịch sử và văn hóa"

    # 3. Cảnh quan và thiên nhiên (Priority 3)
    if (
        tourism in {"attraction", "viewpoint", "zoo", "theme_park"}
        or leisure in {"park", "garden", "nature_reserve", "common"}
        or any(
            w in name_clean
            for w in [
                "bãi biển",
                "bãi tắm",
                "bán đảo",
                "đỉnh ",
                "đèo ",
                "suối ",
                "thác ",
                "công viên",
                "hồ ",
            ]
        )
    ):
        return "Cảnh quan và thiên nhiên"

    # 4. Quán cafe giải khát (Priority 4)
    if (
        amenity in {"cafe", "internet_cafe", "ice_cream", "bar", "pub"}
        or shop in {"coffee", "tea", "beverages"}
        or any(
            w in name_clean
            for w in ["cafe", "cà phê", "coffee", "trà sữa", "trà chanh", "nước mía", "giải khát"]
        )
    ):
        return "Quán cafe giải khát"

    # 5. Ẩm thực và quán ăn (Priority 5)
    if (
        amenity in {"restaurant", "fast_food", "food_court", "marketplace"}
        or shop in {"bakery", "pastry", "deli"}
        or any(
            w in name_clean
            for w in [
                "nhà hàng",
                "quán ăn",
                "ẩm thực",
                "bún ",
                "phở ",
                "cơm ",
                "bánh mì",
                "hải sản",
                "đặc sản",
                "chợ đêm",
                "lẩu",
                "nướng",
                "chè",
            ]
        )
    ):
        return "Ẩm thực và quán ăn"

    return None


# ============================================================
# Field Extractors & Travel Context
# ============================================================

def extract_address(tags: dict[str, Any]) -> str:
    """
    Extract and assemble structured address from OSM tags.
    """
    if "addr:full" in tags and str(tags["addr:full"]).strip():
        return str(tags["addr:full"]).strip()

    parts: list[str] = []
    num = str(tags.get("addr:housenumber", "")).strip()
    street = str(tags.get("addr:street", "")).strip()

    if num and street:
        parts.append(f"{num} {street}")
    elif street:
        parts.append(street)
    elif num:
        parts.append(num)

    subdistrict = str(tags.get("addr:subdistrict", "")).strip()
    if subdistrict:
        parts.append(subdistrict)

    district = str(tags.get("addr:district", "")).strip()
    if district:
        parts.append(district)

    city = (
        str(tags.get("addr:city", "")).strip()
        or str(tags.get("addr:province", "")).strip()
    )
    if city:
        parts.append(city)

    return ", ".join(parts)


def normalize_phone(raw: str) -> str:
    """
    Standardize Vietnamese phone numbers by removing punctuation,
    converting +84 / 84 international prefix to standard domestic 0x,
    and selecting the primary phone number if multiple are provided.
    """
    if not raw:
        return ""
    # Select primary phone if multiple are delimited by ; or ,
    primary = raw.split(";")[0].split(",")[0].strip()
    digits_and_plus = re.sub(r"[\(\)\.\-\s]", "", primary)
    if digits_and_plus.startswith("+84"):
        return "0" + digits_and_plus[3:]
    elif digits_and_plus.startswith("84") and len(digits_and_plus) >= 11:
        return "0" + digits_and_plus[2:]
    return digits_and_plus


def extract_phone(tags: dict[str, Any]) -> str:
    for key in ("phone", "contact:phone", "mobile"):
        val = str(tags.get(key, "")).strip()
        if val:
            return normalize_phone(val)
    return ""


def extract_website(tags: dict[str, Any]) -> str:
    for key in ("website", "contact:website", "url"):
        val = str(tags.get(key, "")).strip()
        if val:
            return val
    return ""


def extract_opening_hours(tags: dict[str, Any]) -> str:
    return str(tags.get("opening_hours", "")).strip()


def extract_cuisine(tags: dict[str, Any]) -> str:
    val = str(tags.get("cuisine", "")).strip()
    if val:
        return val.replace(";", ", ")
    return ""


def extract_description(tags: dict[str, Any]) -> str:
    """
    Extract meaningful travel context from OSM description and tags.
    Preserves raw descriptions while synthesizing factual amenities if present.
    """
    raw_desc = ""
    for key in ("description:vi", "description", "description:en", "note"):
        val = str(tags.get(key, "")).strip()
        if val:
            raw_desc = " ".join(val.split())
            break

    context_parts: list[str] = []

    cuisine = extract_cuisine(tags)
    if cuisine:
        context_parts.append(f"Ẩm thực: {cuisine}")

    hours = extract_opening_hours(tags)
    if hours:
        context_parts.append(f"Giờ mở cửa: {hours}")

    if str(tags.get("internet_access", "")).lower() in {"yes", "wlan", "wifi"}:
        context_parts.append("Có Wifi")

    if str(tags.get("outdoor_seating", "")).lower() == "yes":
        context_parts.append("Chỗ ngồi ngoài trời")

    if str(tags.get("wheelchair", "")).lower() == "yes":
        context_parts.append("Hỗ trợ xe lăn")

    stars = str(tags.get("stars", "")).strip()
    if stars:
        context_parts.append(f"Tiêu chuẩn: {stars} sao")

    ctx_str = ". ".join(context_parts)
    if ctx_str:
        ctx_str += "."

    if raw_desc and ctx_str:
        return f"{raw_desc} | {ctx_str}"
    elif raw_desc:
        return raw_desc
    elif ctx_str:
        return ctx_str

    return ""


def determine_local_business(tags: dict[str, Any], name: str) -> tuple[bool, str]:
    """
    Infer whether an establishment is a local independent business
    based on brand tags and category types.
    """
    brand = str(tags.get("brand", "")).strip().lower()
    name_lower = name.strip().lower()

    if brand or any(chain in name_lower for chain in KNOWN_CHAINS):
        return False, ""

    amenity = tags.get("amenity")
    tourism = tags.get("tourism")
    shop = tags.get("shop")

    if amenity == "cafe":
        return True, "cafe"
    if amenity == "restaurant":
        return True, "restaurant"
    if amenity == "marketplace":
        return True, "traditional_market"
    if shop in {"gift", "craft"}:
        return True, "craft_gift_shop"
    if shop in {"bakery", "coffee"}:
        return True, "local_food_specialty"
    if tourism in {"guest_house", "hostel", "chalet", "alpine_hut"}:
        return True, "homestay_guesthouse"

    return False, ""


# ============================================================
# Validation & Deduplication
# ============================================================

def validate_poi(poi: dict[str, Any]) -> tuple[bool, str]:
    """
    Validate record integrity: non-empty name, valid geographic coordinates,
    and regional bounds (Da Nang & Thua Thien Hue travel corridor).
    """
    name = (poi.get("name") or "").strip()
    if not name:
        return False, "missing_name"

    lat = poi.get("latitude")
    lon = poi.get("longitude")
    if lat is None or lon is None:
        return False, "missing_coordinates"

    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (ValueError, TypeError):
        return False, "non_numeric_coordinates"

    if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lon_f <= 180.0):
        return False, "coordinates_out_of_bounds"

    # Regional bounding check for Da Nang & Hue travel corridor
    if not (15.0 <= lat_f <= 17.5 and 107.0 <= lon_f <= 109.0):
        return False, "coordinates_outside_region"

    return True, "valid"


def deduplicate_pois(
    pois: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    """
    Deduplicate POIs by (city_code, normalized_name, rounded coordinates).
    Whitespace inside names is collapsed so 'Bún   Chả' and 'Bún Chả' match.
    Retains the record with the most descriptive tag count.
    """
    groups: dict[tuple[str, str, float, float], list[dict[str, Any]]] = (
        defaultdict(list)
    )

    for poi in pois:
        name_normalized = " ".join(str(poi.get("name", "")).strip().lower().split())
        key = (
            str(poi.get("city_code", "")).strip().upper(),
            name_normalized,
            round(float(poi["latitude"]), 4),
            round(float(poi["longitude"]), 4),
        )
        groups[key].append(poi)

    deduped: list[dict[str, Any]] = []
    duplicate_count = 0

    for group in groups.values():
        if len(group) > 1:
            duplicate_count += len(group) - 1
            # Retain item with richer metadata
            group.sort(
                key=lambda item: len(item.get("tags", {})),
                reverse=True,
            )
        deduped.append(group[0])

    return deduped, duplicate_count


# ============================================================
# Transformation Pipeline
# ============================================================

def process_pois(
    raw_pois: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Run full ETL pipeline: validate -> deduplicate -> extract -> tabularize.
    """
    valid_pois: list[dict[str, Any]] = []
    rejected_reasons: Counter[str] = Counter()

    for p in raw_pois:
        is_valid, reason = validate_poi(p)
        if is_valid:
            valid_pois.append(p)
        else:
            rejected_reasons[reason] += 1

    deduped_pois, duplicate_count = deduplicate_pois(valid_pois)

    formatted_rows: list[dict[str, Any]] = []
    category_counts: Counter[str] = Counter()
    missing_addr_count = 0
    missing_desc_count = 0
    missing_phone_count = 0
    missing_web_count = 0
    missing_hours_count = 0
    missing_cuisine_count = 0
    local_biz_count = 0

    for p in deduped_pois:
        tags = p.get("tags", {})
        name = str(p.get("name", "")).strip()
        cat_name = normalize_category(tags, name=name)
        if not cat_name:
            continue
        category_counts[cat_name] += 1
        address = extract_address(tags)
        if not address:
            missing_addr_count += 1

        desc = extract_description(tags)
        if not desc:
            missing_desc_count += 1

        phone = extract_phone(tags)
        if not phone:
            missing_phone_count += 1

        website = extract_website(tags)
        if not website:
            missing_web_count += 1

        hours = extract_opening_hours(tags)
        if not hours:
            missing_hours_count += 1

        cuisine = extract_cuisine(tags)
        if not cuisine:
            missing_cuisine_count += 1

        is_local, l_type = determine_local_business(tags, name)
        if is_local:
            local_biz_count += 1

        row = {
            "osm_type": p.get("osm_type", ""),
            "osm_id": p.get("osm_id", ""),
            "city_code": p.get("city_code", ""),
            "city_name": p.get("city_name", ""),
            "name": name,
            "category_name": cat_name,
            "latitude": float(p["latitude"]),
            "longitude": float(p["longitude"]),
            "address": address,
            "description": desc,
            "phone": phone,
            "website": website,
            "opening_hours": hours,
            "cuisine": cuisine,
            "is_local_business": is_local,
            "local_business_type": l_type,
            # Database fields uninvented to prevent source data fabrication
            "estimated_cost": "",
            "average_visit_minutes": "",
            "satisfaction_score": "",
            "popularity_score": "",
        }
        formatted_rows.append(row)

    stats = {
        "total_raw": len(raw_pois),
        "rejected_count": sum(rejected_reasons.values()),
        "rejected_reasons": dict(rejected_reasons),
        "duplicate_count": duplicate_count,
        "total_output": len(formatted_rows),
        "category_distribution": dict(category_counts),
        "local_business_count": local_biz_count,
        "missing_address": missing_addr_count,
        "missing_description": missing_desc_count,
        "missing_phone": missing_phone_count,
        "missing_website": missing_web_count,
        "missing_hours": missing_hours_count,
        "missing_cuisine": missing_cuisine_count,
        "missing_cost": len(formatted_rows),
        "missing_visit_minutes": len(formatted_rows),
        "missing_satisfaction": len(formatted_rows),
        "missing_popularity": len(formatted_rows),
    }

    return formatted_rows, stats


def write_csv(rows: list[dict[str, Any]], dest_path: Path) -> None:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dest_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    print("==============================================")
    print(" GreenTrip AI - POI Formatter (ETL)")
    print(" Sprint 1 - PB05 - Task 1.21")
    print("==============================================")

    if not INPUT_FILE.exists():
        print(f"[ERROR] Input raw file not found at: {INPUT_FILE}")
        sys.exit(1)

    print(f"[INFO] Reading raw data from: {INPUT_FILE}")
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    raw_pois = data.get("pois", [])
    rows, stats = process_pois(raw_pois)

    write_csv(rows, OUTPUT_FILE)

    total = stats["total_output"]
    print(f"\n[SUCCESS] Wrote {total} rows to: {OUTPUT_FILE}")
    print("\n----------------- Summary Report -----------------")
    print(f"Total raw POIs in input:     {stats['total_raw']}")
    print(f"Rejected records:            {stats['rejected_count']}")
    if stats["rejected_count"] > 0:
        for r, cnt in stats["rejected_reasons"].items():
            print(f"  - {r}: {cnt}")
    print(f"Duplicates removed:          {stats['duplicate_count']}")
    print(f"Total formatted output rows: {total}")
    print(
        f"Local businesses identified: {stats['local_business_count']} ({(stats['local_business_count']/total)*100:.2f}%)"
    )

    print("\nCategory Distribution:")
    for cat, count in sorted(
        stats["category_distribution"].items(),
        key=lambda item: item[1],
        reverse=True,
    ):
        pct = (count / total) * 100
        print(f"  - {cat:28s}: {count:5d} ({pct:5.2f}%)")

    print("\nMissing-Value Statistics:")
    print(
        f"  - Address missing:           {stats['missing_address']:5d} ({(stats['missing_address']/total)*100:5.2f}%)"
    )
    print(
        f"  - Description missing:       {stats['missing_description']:5d} ({(stats['missing_description']/total)*100:5.2f}%)"
    )
    print(
        f"  - Phone missing:             {stats['missing_phone']:5d} ({(stats['missing_phone']/total)*100:5.2f}%)"
    )
    print(
        f"  - Website missing:           {stats['missing_website']:5d} ({(stats['missing_website']/total)*100:5.2f}%)"
    )
    print(
        f"  - Opening hours missing:     {stats['missing_hours']:5d} ({(stats['missing_hours']/total)*100:5.2f}%)"
    )
    print(
        f"  - Cuisine missing:           {stats['missing_cuisine']:5d} ({(stats['missing_cuisine']/total)*100:5.2f}%)"
    )
    print(
        f"  - Estimated cost empty:      {stats['missing_cost']:5d} (100.00% - uninvented)"
    )
    print(
        f"  - Average visit min empty:   {stats['missing_visit_minutes']:5d} (100.00% - uninvented)"
    )
    print(
        f"  - Satisfaction score empty:  {stats['missing_satisfaction']:5d} (100.00% - uninvented)"
    )
    print(
        f"  - Popularity score empty:    {stats['missing_popularity']:5d} (100.00% - uninvented)"
    )
    print("--------------------------------------------------\n")


if __name__ == "__main__":
    main()
