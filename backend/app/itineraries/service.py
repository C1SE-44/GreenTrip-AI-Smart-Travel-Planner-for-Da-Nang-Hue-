import logging
from app.itineraries.schemas import DayRouteResponse, RouteStop
from app.itineraries import repository
from app.itineraries import routing_service

logger = logging.getLogger(__name__)


class ItineraryNotFoundError(Exception):
    """Raised when the specified itinerary does not exist."""


class DayNotFoundError(Exception):
    """Raised when the requested day number does not exist for the itinerary."""


class InvalidPoiCoordinatesError(Exception):
    """Raised when a POI has missing or out-of-range coordinates."""


def get_itinerary_day_route(
    itinerary_id: str,
    day_number: int,
) -> DayRouteResponse:
    """
    Retrieve ordered route geometry and sequential POI stops for a specific day of an itinerary.

    Steps:
    1. Verify itinerary existence.
    2. Verify day existence in the itinerary.
    3. Retrieve all assigned POI stops preserved in exact sequence order.
    4. Validate latitude and longitude coordinates for each POI.
    5. Compute GeoJSON route geometry (via OSRM or graceful fallback).
    6. Return DayRouteResponse.
    """
    # 1. Retrieve the specified itinerary
    itinerary = repository.get_itinerary(itinerary_id)
    if not itinerary:
        raise ItineraryNotFoundError(f"Itinerary '{itinerary_id}' not found")

    # 2. Retrieve the requested day
    day = repository.get_itinerary_day(itinerary_id, day_number)
    if not day:
        raise DayNotFoundError(f"Day {day_number} not found for itinerary '{itinerary_id}'")

    # 3. Retrieve stops in visiting sequence
    raw_stops = repository.get_itinerary_day_stops(day["itinerary_day_id"])
    ordered_route_stops: list[RouteStop] = []

    for index, stop_item in enumerate(raw_stops, start=1):
        poi_id = stop_item["poi_id"]
        poi_info = repository.get_poi_by_id(poi_id)

        if not poi_info:
            raise InvalidPoiCoordinatesError(
                f"POI '{poi_id}' not found in database or has no metadata"
            )

        lat = poi_info.get("latitude")
        lng = poi_info.get("longitude")

        # 4. Validate coordinates
        if lat is None or lng is None:
            raise InvalidPoiCoordinatesError(
                f"POI '{poi_info.get('name', poi_id)}' (ID: {poi_id}) is missing latitude/longitude coordinates"
            )

        try:
            lat_f = float(lat)
            lng_f = float(lng)
        except (ValueError, TypeError):
            raise InvalidPoiCoordinatesError(
                f"POI '{poi_info.get('name', poi_id)}' (ID: {poi_id}) has invalid non-numeric coordinates"
            )

        if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lng_f <= 180.0):
            raise InvalidPoiCoordinatesError(
                f"POI '{poi_info.get('name', poi_id)}' (ID: {poi_id}) has out-of-range coordinates: lat={lat_f}, lng={lng_f}"
            )

        ordered_route_stops.append(
            RouteStop(
                order=index,
                poi_id=str(poi_id),
                name=poi_info.get("name") or str(poi_id),
                latitude=lat_f,
                longitude=lng_f,
            )
        )

    # 5. Compute route geometry
    route_geom, distance_m, duration_s, is_fallback, provider = routing_service.compute_route_geometry(
        ordered_route_stops
    )

    return DayRouteResponse(
        itinerary_id=itinerary["itinerary_id"],
        day_number=day["day_number"],
        total_days=itinerary.get("total_days"),
        total_stops=len(ordered_route_stops),
        stops=ordered_route_stops,
        route=route_geom,
        distance_meters=distance_m,
        duration_seconds=duration_s,
        is_fallback=is_fallback,
        routing_provider=provider,
    )
