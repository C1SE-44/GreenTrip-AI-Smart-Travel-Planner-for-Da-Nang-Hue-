from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ============================================================
# Configuration
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

OUTPUT_DIR = PROJECT_ROOT / "data" / "raw"
OUTPUT_FILE = OUTPUT_DIR / "osm_pois.json"

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

USER_AGENT = (
    "GreenTrip-AI/1.0 "
    "(C1SE.44 educational capstone; "
    "contact: greentrip-ai-team)"
)

REQUEST_TIMEOUT_SECONDS = 180
MAX_RETRIES = 3
RETRY_WAIT_SECONDS = 15


# These bounding boxes cover the main urban travel areas used by the
# Da Nang-Hue corridor MVP. They are intentionally kept explicit so
# the team can review/refine the scope during Task 1.21.
CITY_BBOXES = {
    "DANANG": {
        "name": "Da Nang",
        "south": 15.95,
        "west": 108.08,
        "north": 16.15,
        "east": 108.35,
    },
    "HUE": {
        "name": "Hue",
        "south": 16.35,
        "west": 107.45,
        "north": 16.55,
        "east": 107.75,
    },
}


# ============================================================
# Overpass query
# ============================================================

def build_overpass_query(
    south: float,
    west: float,
    north: float,
    east: float,
) -> str:
    """
    Build an Overpass QL query for tourism-related POIs.

    The scraper intentionally keeps the raw OSM tags instead of
    converting them into GreenTrip categories. That normalization
    belongs to Task 1.21.
    """

    bbox = f"{south},{west},{north},{east}"

    return f"""
[out:json][timeout:120];

(
    nwr["name"]["tourism"]({bbox});

    nwr["name"]["historic"]({bbox});

    nwr["name"]["leisure"]({bbox});

    nwr["name"]["amenity"~"restaurant|cafe|marketplace|museum|theatre|cinema|arts_centre"]({bbox});

    nwr["name"]["shop"~"mall|supermarket|department_store|gift|craft"]({bbox});
);

out center;
""".strip()


# ============================================================
# HTTP request
# ============================================================

def post_overpass_query(query: str) -> dict[str, Any]:
    """
    Send one query to Overpass API and return parsed JSON.

    Tries endpoints and retries HTTP 429/406/5xx errors.
    """

    encoded_data = urllib.parse.urlencode(
        {"data": query}
    ).encode("utf-8")

    last_error: Exception | None = None

    for endpoint in OVERPASS_ENDPOINTS:
        request = urllib.request.Request(
            endpoint,
            data=encoded_data,
            method="POST",
            headers={
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
        )

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                with urllib.request.urlopen(
                    request,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                ) as response:
                    payload = response.read().decode("utf-8")

                return json.loads(payload)

            except urllib.error.HTTPError as exc:
                last_error = exc

                if exc.code in {429, 406, 502, 503, 504}:
                    print(
                        f"[WARN] Endpoint {endpoint} returned HTTP {exc.code}. "
                        f"Waiting {RETRY_WAIT_SECONDS}s before retry "
                        f"{attempt}/{MAX_RETRIES}..."
                    )

                    if attempt < MAX_RETRIES:
                        time.sleep(RETRY_WAIT_SECONDS)
                        continue

                break

            except (
                urllib.error.URLError,
                TimeoutError,
                json.JSONDecodeError,
            ) as exc:
                last_error = exc

                print(
                    f"[WARN] Endpoint {endpoint} request failed: {type(exc).__name__}. "
                    f"Retry {attempt}/{MAX_RETRIES}..."
                )

                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_WAIT_SECONDS)

    raise RuntimeError(
        f"Overpass request failed after trying all endpoints."
    ) from last_error


# ============================================================
# POI extraction
# ============================================================

def extract_pois(
    city_code: str,
    city_name: str,
    payload: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Convert raw Overpass elements into a consistent raw POI structure.

    No GreenTrip category mapping is performed here.
    """

    pois: list[dict[str, Any]] = []

    for element in payload.get("elements", []):
        tags = element.get("tags", {})

        name = tags.get("name")

        if not name:
            continue

        latitude: float | None = None
        longitude: float | None = None

        # Node
        if element.get("type") == "node":
            latitude = element.get("lat")
            longitude = element.get("lon")

        # Way / relation
        else:
            center = element.get("center", {})
            latitude = center.get("lat")
            longitude = center.get("lon")

        if latitude is None or longitude is None:
            continue

        pois.append(
            {
                "city_code": city_code,
                "city_name": city_name,
                "osm_type": element.get("type"),
                "osm_id": element.get("id"),
                "name": name,
                "latitude": latitude,
                "longitude": longitude,
                "tags": tags,
            }
        )

    return pois


def deduplicate_pois(
    pois: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Remove duplicate OSM elements using (osm_type, osm_id).
    """

    unique: dict[tuple[Any, Any], dict[str, Any]] = {}

    for poi in pois:
        key = (
            poi.get("osm_type"),
            poi.get("osm_id"),
        )

        unique[key] = poi

    return list(unique.values())


# ============================================================
# Main scraping flow
# ============================================================

def scrape_city(
    city_code: str,
    city_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Scrape POIs for one city.
    """

    city_name = city_config["name"]

    print(f"\n[INFO] Scraping {city_name}...")

    query = build_overpass_query(
        south=city_config["south"],
        west=city_config["west"],
        north=city_config["north"],
        east=city_config["east"],
    )

    payload = post_overpass_query(query)

    pois = extract_pois(
        city_code=city_code,
        city_name=city_name,
        payload=payload,
    )

    pois = deduplicate_pois(pois)

    print(
        f"[INFO] {city_name}: "
        f"{len(pois)} unique named POIs found."
    )

    return pois


def save_result(
    pois: list[dict[str, Any]],
) -> None:
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    result = {
        "source": {
            "provider": "OpenStreetMap",
            "license": "ODbL-1.0",
            "retrieved_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "overpass_endpoints": OVERPASS_ENDPOINTS,
            "user_agent": USER_AGENT,
        },
        "scope": {
            "cities": list(CITY_BBOXES.keys()),
            "purpose": (
                "GreenTrip AI Sprint 1 PB05 "
                "raw POI collection"
            ),
        },
        "count": len(pois),
        "pois": pois,
    }

    OUTPUT_FILE.write_text(
        json.dumps(
            result,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        f"\n[SUCCESS] Saved {len(pois)} POIs to:"
        f"\n{OUTPUT_FILE}"
    )


def main() -> None:
    print("==============================================")
    print(" GreenTrip AI - OSM POI Scraper")
    print(" Sprint 1 - PB05 - Task 1.20")
    print("==============================================")

    all_pois: list[dict[str, Any]] = []

    for city_code, city_config in CITY_BBOXES.items():
        city_pois = scrape_city(
            city_code,
            city_config,
        )

        all_pois.extend(city_pois)

    all_pois = deduplicate_pois(all_pois)

    save_result(all_pois)

    print(
        f"\n[INFO] Total unique POIs: {len(all_pois)}"
    )


if __name__ == "__main__":
    main()
