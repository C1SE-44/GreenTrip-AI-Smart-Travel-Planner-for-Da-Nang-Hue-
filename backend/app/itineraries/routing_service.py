import logging
import math
from typing import Any
import httpx

from app.itineraries.schemas import RouteGeometry, RouteStop

logger = logging.getLogger(__name__)

# Default public OSRM router endpoint (can be overridden via environment or configuration)
OSRM_ROUTE_BASE_URL = "https://router.project-osrm.org/route/v1/driving"
OSRM_TIMEOUT_SECONDS = 5.0

# Road detour factor to approximate driving distance when straight-line fallback is necessary
FALLBACK_DETOUR_FACTOR = 1.25
# Estimated average vehicle speed in urban/coastal Da Nang - Hue corridor: ~35 km/h (9.72 m/s)
FALLBACK_SPEED_MPS = 9.72


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two geographic points in meters."""
    radius_earth_meters = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return radius_earth_meters * c


def build_fallback_route(
    stops: list[RouteStop],
) -> tuple[RouteGeometry, float, float, bool, str]:
    """
    Generate fallback route geometry by connecting stops sequentially.
    Preserves GeoJSON [longitude, latitude] format and clearly marks the route as fallback.
    """
    if not stops:
        return RouteGeometry(type="LineString", coordinates=[]), 0.0, 0.0, False, "fallback"

    if len(stops) == 1:
        single_coord = [[stops[0].longitude, stops[0].latitude]]
        return RouteGeometry(type="LineString", coordinates=single_coord), 0.0, 0.0, False, "direct"

    coordinates: list[list[float]] = []
    total_distance = 0.0

    for i, stop in enumerate(stops):
        # GeoJSON strictly requires [longitude, latitude]
        coordinates.append([round(stop.longitude, 6), round(stop.latitude, 6)])
        if i > 0:
            prev = stops[i - 1]
            seg_dist = haversine_distance_meters(prev.latitude, prev.longitude, stop.latitude, stop.longitude)
            total_distance += seg_dist * FALLBACK_DETOUR_FACTOR

    estimated_duration = total_distance / FALLBACK_SPEED_MPS if FALLBACK_SPEED_MPS > 0 else 0.0

    return (
        RouteGeometry(type="LineString", coordinates=coordinates),
        round(total_distance, 1),
        round(estimated_duration, 1),
        True,
        "fallback",
    )


def fetch_osrm_json(request_url: str, client: httpx.Client | None = None) -> dict[str, Any] | None:
    """Fetch JSON route from OSRM service."""
    should_close_client = False
    if client is None:
        client = httpx.Client(timeout=OSRM_TIMEOUT_SECONDS)
        should_close_client = True

    try:
        response = client.get(request_url)
        if response.status_code == 200:
            return response.json()
        logger.warning("OSRM request failed with HTTP %s: %s", response.status_code, response.text[:200])
        return None
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        logger.warning("OSRM request exception (%s). Activating route geometry fallback.", exc)
        return None
    except Exception as exc:
        logger.exception("Unexpected error communicating with OSRM (%s). Activating fallback.", exc)
        return None
    finally:
        if should_close_client:
            client.close()


def compute_route_geometry(
    stops: list[RouteStop],
    osrm_url: str = OSRM_ROUTE_BASE_URL,
    client: httpx.Client | None = None,
) -> tuple[RouteGeometry, float, float, bool, str]:
    """
    Generate ordered route geometry for a list of sequential stops.

    - 0 stops: returns empty route.
    - 1 stop: returns single stop coordinate without requesting OSRM road routing.
    - 2+ stops: requests full GeoJSON geometry from OSRM in visiting order.
      Falls back gracefully to straight-line connection if OSRM fails or times out.
    """
    total_stops = len(stops)

    if total_stops == 0:
        return RouteGeometry(type="LineString", coordinates=[]), 0.0, 0.0, False, "none"

    if total_stops == 1:
        # 1 stop: Return the stop coordinate directly without road routing
        coords = [[round(stops[0].longitude, 6), round(stops[0].latitude, 6)]]
        return RouteGeometry(type="LineString", coordinates=coords), 0.0, 0.0, False, "direct"

    # Format OSRM coordinate string: {lon1},{lat1};{lon2},{lat2};...
    coord_string = ";".join(f"{stop.longitude:.6f},{stop.latitude:.6f}" for stop in stops)
    request_url = f"{osrm_url}/{coord_string}?overview=full&geometries=geojson"

    payload = fetch_osrm_json(request_url, client)
    if payload and payload.get("code") == "Ok" and payload.get("routes"):
        best_route = payload["routes"][0]
        geometry_data = best_route.get("geometry", {})
        raw_coords = geometry_data.get("coordinates", [])

        # Validate coordinates structure
        if isinstance(raw_coords, list) and len(raw_coords) >= 2:
            clean_coords = [
                [float(pt[0]), float(pt[1])]
                for pt in raw_coords
                if isinstance(pt, (list, tuple)) and len(pt) >= 2
            ]
            distance_m = float(best_route.get("distance", 0.0))
            duration_s = float(best_route.get("duration", 0.0))

            return (
                RouteGeometry(type="LineString", coordinates=clean_coords),
                round(distance_m, 1),
                round(duration_s, 1),
                False,
                "osrm",
            )
        else:
            logger.warning("OSRM returned invalid geometry coordinates format: %s", raw_coords)
    elif payload:
        logger.warning("OSRM response code not Ok: %s", payload.get("code"))

    # Graceful fallback when OSRM routing is unavailable
    return build_fallback_route(stops)
