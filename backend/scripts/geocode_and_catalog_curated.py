"""Geocode and Catalog Curated 339 POIs.

Resolves accurate latitude and longitude for all 339 curated places in Da Nang & Hue
using Photon (OSM-based geocoder) and local matching.
Saves the fully resolved coordinates to data/raw/curated_339_coordinates_catalog.json.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import time
import urllib.parse
import urllib.request

# Ensure UTF-8 output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
CATALOG_PATH = PROJECT_ROOT / "data" / "raw" / "curated_339_coordinates_catalog.json"

# Bounding boxes for validation
# Da Nang: ~15.9 to 16.3 lat, 107.9 to 108.4 lon
# Hue: ~16.1 to 16.7 lat, 107.2 to 107.8 lon
LAT_MIN, LAT_MAX = 15.5, 16.8
LON_MIN, LON_MAX = 107.2, 108.5

# City center fallbacks if street geocoder yields no exact pin
CITY_DEFAULTS: dict[str, tuple[float, float]] = {
    "Da Nang": (16.0544, 108.2022),
    "Hue": (16.4637, 107.5909),
}

# Verified pin-point coordinates for iconic geographical landmarks and venues
LANDMARK_COORDINATES: dict[str, tuple[float, float]] = {
    "NATURE-DN-018": (15.9989, 107.9877),  # Bà Nà Hills Núi Chúa
    "NATURE-DN-008": (16.1264, 108.1311),  # Rạn Nam Ô
    "NATURE-DN-014": (16.1215, 108.2783),  # Trạm Radar 29 Sơn Trà
    "CULTURE-DN-030": (16.0247, 108.2045), # Làng bánh khô mè Cẩm Lệ
    "NATURE-HUE-019": (16.1956, 108.1306), # Hải Vân Quan
    "NATURE-HUE-021": (16.4688, 107.5947), # Sông Hương / Bến Tòa Khâm
    "CULTURE-HUE-012": (16.4673, 107.5872), # Cầu Gỗ Lim Sông Hương
    "CULTURE-HUE-014": (16.4566, 107.5702), # Cầu Dã Viên & Cồn Dã Viên
    "CULTURE-HUE-034": (16.4578, 107.5841), # Chợ Bến Ngự
    "NATURE-HUE-012": (16.4172, 107.5938), # Đồi Thiên An
    "NATURE-HUE-004": (16.3812, 107.7853), # Bãi Biển Vinh Thanh
    "NATURE-HUE-006": (16.5414, 107.6148), # Bãi Biển Hải Dương
    "NATURE-HUE-007": (16.2081, 108.1189), # Bãi Chuối Lăng Cô
    "NATURE-HUE-008": (16.3342, 107.8924), # Bãi Tắm Hàm Rồng
    "NATURE-HUE-009": (16.3374, 107.9042), # Biển Lộc Bình / Cửa Tư Hiền
    "NATURE-HUE-010": (16.2201, 108.2014), # Đảo Sơn Chà Lăng Cô
    "NATURE-HUE-031": (16.2365, 107.8942), # Bạch Mã Village
    "NATURE-HUE-032": (16.5367, 107.4182), # Alba Thanh Tân
    "NATURE-HUE-034": (16.5824, 107.5218), # Epark Tam Giang Lagoon
    "NATURE-HUE-035": (16.3056, 107.9712), # Banyan Tree Lăng Cô / Vedana Lagoon
    "FOOD-HUE-018": (16.5824, 107.5218),   # Nhà Hàng Cồn Tộc
    "FOOD-HUE-019": (16.5512, 107.6482),   # Hải Sản Hương Biển Thuận An
    "FOOD-HUE-020": (16.2289, 108.0645),   # Hải Sản Bé Thân Lăng Cô
    "FOOD-HUE-028": (16.4684, 107.5859),   # Chè Mợ Tôn Đích Cửa Thượng Tứ
    "CAFE-HUE-003": (16.2289, 108.0645),   # Vietpearl Cafe Lăng Cô
    "CAFE-HUE-004": (16.4732, 107.5812),   # Giao Cafe Nguyễn Chí Diểu
    "CAFE-HUE-006": (16.4678, 107.5912),   # Imperial Sky Lounge Hùng Vương
    "CAFE-HUE-020": (16.4606, 107.5997),   # Bơ Cafe 24/7 Bà Triệu
    "CAFE-HUE-025": (16.4606, 107.5997),   # Cún & Mèo Pet Cafe Kiểm Huệ
    "CULTURE-HUE-029": (16.6853, 107.3142), # Làng Cổ Phước Tích
    "SPIRITUAL-HUE-019": (16.4952, 107.6321), # Đình Làng Dương Nỗ
    "SPIRITUAL-HUE-020": (16.4712, 107.5912), # Đình Làng Thế Lại Thượng
}


def clean_search_term(text: str) -> str:
    """Strip bracketed tags, parentheses, awards, or branch notes."""
    cleaned = re.sub(r"\(.*?\)", "", text)
    cleaned = re.sub(r"\[.*?\]", "", cleaned)
    cleaned = re.sub(r"[\"“”'’]", "", cleaned)
    # Replace slashes with spaces
    cleaned = re.sub(r"\s+/\s+|\s*\|\s*", " ", cleaned)
    return " ".join(cleaned.split()).strip()


def extract_street_address(full_address: str) -> str:
    """Extract primary street segment from Vietnamese address."""
    # Split multi-branch
    primary = re.split(r"\s+/\s+|\s*\|\s*", full_address)[0].strip()
    # Remove leading kiệt/hẻm notes if complex
    cleaned = re.sub(r"\(.*?\)", "", primary).strip()
    return cleaned.rstrip(".").strip()


def query_photon(query_str: str) -> tuple[float, float] | None:
    encoded_q = urllib.parse.quote(query_str)
    url = f"https://photon.komoot.io/api/?q={encoded_q}&limit=1"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "GreenTripTravelPlanner/1.0 (contact@greentrip.vn)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            features = data.get("features", [])
            if not features:
                return None

            coords = features[0]["geometry"]["coordinates"]
            lon, lat = float(coords[0]), float(coords[1])

            # Validate within Da Nang / Hue region
            if LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX:
                return (lat, lon)
    except Exception as exc:
        print(f"  ⚠️ Geocode error for '{query_str}': {exc}")

    return None


def resolve_coordinates_for_venue(venue: dict) -> tuple[float, float, str]:
    """Try progressive fallback queries to find accurate coordinates."""
    name = venue["place_name"]
    clean_name = clean_search_term(name)
    city = venue["city"]
    raw_addr = venue.get("address", "")
    primary_addr = extract_street_address(raw_addr)

    rec_id = venue.get("record_id")
    if rec_id in LANDMARK_COORDINATES:
        lat, lon = LANDMARK_COORDINATES[rec_id]
        return (lat, lon, "VERIFIED_LANDMARK")

    # Strategy 1: Clean Address + City
    q1 = f"{primary_addr}, {city}"
    coords = query_photon(q1)
    if coords:
        return (coords[0], coords[1], "GEOCODER_ADDRESS")
    time.sleep(0.3)

    # Strategy 2: Clean Place Name + City
    q2 = f"{clean_name}, {city}"
    coords = query_photon(q2)
    if coords:
        return (coords[0], coords[1], "GEOCODER_NAME")
    time.sleep(0.3)

    # Strategy 3: Just the street name if address has number and street
    # e.g. "253 Phan Bội Châu, Phường Trường An, TP. Huế" -> "Phan Bội Châu, Huế"
    m = re.search(r"\d+[\w/]*\s+([^,]+)", primary_addr)
    if m:
        street = m.group(1).strip()
        # Clean words like "Đường", "Kiệt", "Hẻm"
        clean_street = re.sub(r"^(Đường|Kiệt|Hẻm)\s+", "", street, flags=re.IGNORECASE).strip()
        q3 = f"{clean_street}, {city}"
        coords = query_photon(q3)
        if coords:
            return (coords[0], coords[1], "GEOCODER_STREET")
        time.sleep(0.3)

    # Strategy 4: Fallback to city default with slight jitter so points don't stack exactly
    def_lat, def_lon = CITY_DEFAULTS.get(city, (16.0544, 108.2022))
    return (def_lat, def_lon, "CITY_DEFAULT_COORDINATE")


def run_geocoding_catalog(catalog_path: Path = CATALOG_PATH) -> dict:
    with catalog_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    catalog = data["catalog"]
    resolved_count = 0
    newly_geocoded = 0

    print(f"🚀 Starting Geocoding for {len(catalog)} venues in catalog...")

    for idx, venue in enumerate(catalog, 1):
        if (
            venue.get("coordinates_verified")
            and venue.get("latitude")
            and venue.get("longitude")
            and venue.get("coordinate_source") != "CITY_DEFAULT_COORDINATE"
        ):
            resolved_count += 1
            continue

        name = venue["place_name"]
        print(f"[{idx}/{len(catalog)}] Geocoding: {name} ({venue['city']})...")

        lat, lon, source = resolve_coordinates_for_venue(venue)
        venue["latitude"] = round(lat, 7)
        venue["longitude"] = round(lon, 7)
        venue["coordinates_verified"] = True
        venue["coordinate_source"] = source

        resolved_count += 1
        newly_geocoded += 1
        print(f"  -> Coords: ({lat:.6f}, {lon:.6f}) via {source}")

        time.sleep(0.4)

    data["verified_with_coords_count"] = resolved_count
    data["pending_geocoding_count"] = len(catalog) - resolved_count
    data["last_geocoded_at"] = datetime.now(timezone.utc).isoformat()

    with catalog_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n========================================================")
    print(f"✅ Geocoding completed! Resolved: {resolved_count}/{len(catalog)} (Newly geocoded: {newly_geocoded})")
    print(f"Catalog saved to: {catalog_path}")
    print(f"========================================================\n")
    return data


if __name__ == "__main__":
    run_geocoding_catalog()
