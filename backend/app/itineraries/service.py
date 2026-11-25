import logging
from app.itineraries.schemas import DayRouteResponse, RouteSegment, RouteStop
from app.itineraries import repository
from app.itineraries import routing_service
from app.itineraries.transport_service import PriorityProfile, evaluate_segment_transport_options

logger = logging.getLogger(__name__)


class ItineraryNotFoundError(Exception):
    """Raised when the specified itinerary does not exist."""


class DayNotFoundError(Exception):
    """Raised when the requested day number does not exist for the itinerary."""


class InvalidPoiCoordinatesError(Exception):
    """Raised when a POI has missing or out-of-range coordinates."""


def build_day_segments(
    stops: list[RouteStop],
    profile: PriorityProfile = "balanced",
    custom_modes: dict[int, str] | None = None,
    legs: list[dict[str, float]] | None = None,
) -> tuple[list[RouteSegment], float, float]:
    """Build segment-level transport evaluations and compute day totals."""
    if len(stops) < 2:
        return [], 0.0, 0.0

    segments: list[RouteSegment] = []
    total_cost_vnd = 0.0
    total_carbon_kg = 0.0

    for i in range(len(stops) - 1):
        stop_a = stops[i]
        stop_b = stops[i + 1]

        h_dist = routing_service.haversine_distance_meters(
            stop_a.latitude, stop_a.longitude, stop_b.latitude, stop_b.longitude
        )
        has_corridor = bool(
            routing_service.get_corridor_between_points(
                stop_a.latitude, stop_a.longitude, stop_b.latitude, stop_b.longitude
            )
        )
        # Unified threshold: 40 km (INTERCITY_DISTANCE_THRESHOLD_METERS)
        is_intercity = has_corridor or (h_dist >= routing_service.INTERCITY_DISTANCE_THRESHOLD_METERS)

        # BUG-03 fix: Use exact OSRM leg distance if provided and valid
        if legs and i < len(legs) and legs[i].get("distance_meters", 0.0) > 0:
            seg_dist_m = round(legs[i]["distance_meters"], 1)
        else:
            detour = 1.35 if is_intercity else 1.25
            seg_dist_m = round(h_dist * detour, 1)

        custom_mode = custom_modes.get(i) if custom_modes else None

        options = evaluate_segment_transport_options(
            distance_meters=seg_dist_m,
            is_intercity=is_intercity,
            profile=profile,
            user_preferred_mode=custom_mode,
        )

        rec_opt = next((opt for opt in options if opt.recommendation_type == "best_match"), options[0] if options else None)
        rec_mode = rec_opt.mode if rec_opt else "motorcycle"

        selected_mode = custom_mode if custom_mode else rec_mode
        selected_opt = next((opt for opt in options if opt.mode == selected_mode), rec_opt)

        duration_sec = selected_opt.duration_seconds if selected_opt else 600.0
        transit_sec = getattr(selected_opt, "transit_duration_seconds", duration_sec)
        transfer_sec = getattr(selected_opt, "transfer_duration_seconds", 0)
        cost_vnd = selected_opt.estimated_cost_vnd if selected_opt else 0.0
        carbon_kg = selected_opt.carbon_kg if selected_opt else 0.0

        total_cost_vnd += cost_vnd
        total_carbon_kg += carbon_kg

        segments.append(
            RouteSegment(
                segment_index=i,
                from_stop=stop_a,
                to_stop=stop_b,
                distance_meters=seg_dist_m,
                duration_seconds=duration_sec,
                transit_duration_seconds=transit_sec,
                transfer_duration_seconds=transfer_sec,
                is_intercity=is_intercity,
                recommended_mode=rec_mode,
                selected_mode=selected_mode,
                options=options,
            )
        )

    return segments, round(total_cost_vnd, 0), round(total_carbon_kg, 3)


def get_itinerary_day_route(
    itinerary_id: str,
    day_number: int,
    profile: PriorityProfile = "balanced",
    custom_modes: dict[int, str] | None = None,
) -> DayRouteResponse:
    """
    Retrieve ordered route geometry and sequential POI stops for a specific day of an itinerary.

    Steps:
    1. Verify itinerary existence.
    2. Verify day existence in the itinerary.
    3. Retrieve all assigned POI stops preserved in exact sequence order.
    4. Validate latitude and longitude coordinates for each POI.
    5. Compute GeoJSON route geometry (via OSRM or graceful fallback).
    6. Build segment transport options and calculate total cost and carbon.
    7. Return DayRouteResponse.
    """
    # 1. Retrieve the specified itinerary
    itinerary = repository.get_itinerary(itinerary_id)
    if not itinerary:
        raise ItineraryNotFoundError(f"Itinerary '{itinerary_id}' not found")

    # 2. Retrieve the requested day
    day = repository.get_itinerary_day(itinerary_id, day_number)
    if not day:
        raise DayNotFoundError(f"Day {day_number} not found for itinerary '{itinerary_id}'")

    # BUG-04: Restore persisted custom segment modes from DB if not explicitly passed in request
    merged_custom_modes: dict[int, str] = {}
    db_custom_raw = day.get("custom_segment_modes")
    if db_custom_raw:
        import json
        try:
            parsed = json.loads(db_custom_raw)
            if isinstance(parsed, dict):
                merged_custom_modes = {int(k): str(v) for k, v in parsed.items() if k.isdigit()}
        except Exception:
            merged_custom_modes = {}
    if custom_modes:
        merged_custom_modes.update(custom_modes)

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

    # 5. Compute route geometry with legs
    route_res = routing_service.compute_route_geometry(
        ordered_route_stops, return_legs=True
    )
    if len(route_res) == 6:
        route_geom, distance_m, duration_s, is_fallback, provider, legs = route_res
    else:
        route_geom, distance_m, duration_s, is_fallback, provider = route_res
        legs = []

    # 6. Build segments and calculate multi-criteria transport options
    segments, day_cost, day_carbon = build_day_segments(
        ordered_route_stops, profile=profile, custom_modes=merged_custom_modes, legs=legs
    )

    # BUG-02 fix: Calculate total trip duration (transit + buffers)
    total_trip_duration_s = sum(seg.duration_seconds for seg in segments) if segments else duration_s

    return DayRouteResponse(
        itinerary_id=itinerary["itinerary_id"],
        day_number=day["day_number"],
        total_days=itinerary.get("total_days"),
        total_stops=len(ordered_route_stops),
        stops=ordered_route_stops,
        route=route_geom,
        distance_meters=distance_m,
        duration_seconds=duration_s,
        total_trip_duration_seconds=round(total_trip_duration_s, 1),
        is_fallback=is_fallback,
        routing_provider=provider,
        segments=segments,
        day_total_cost_vnd=day_cost,
        day_total_carbon_kg=day_carbon,
        priority_profile=profile,
    )

