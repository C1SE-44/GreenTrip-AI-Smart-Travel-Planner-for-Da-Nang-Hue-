from __future__ import annotations

import hashlib
import json
import unicodedata
from collections.abc import Callable
from typing import Any

from app.itineraries.routing_service import compute_route_leg_metrics
from app.itineraries.schemas import RouteStop
from app.transport.estimation import (
    EmissionFactorProvider,
    FareRateProvider,
    NoEmissionFactorProvider,
    NoFareRateProvider,
    TravelerCounts,
    estimate_emissions,
    estimate_fare,
)
from app.transport.railway import (
    build_train_options,
    NoRailwayScheduleProvider,
    RailwayScheduleProvider,
    is_da_nang_hue_pair,
)
from app.transport.schemas import (
    AccommodationGroupInput,
    TransportDayInput,
    TransportLeg,
    TransportPoint,
    TransportPreviewRequest,
    TransportPreviewResponse,
    TransportProviderCapabilities,
    TransportRouteOption,
    UncomputedTransportEndpoint,
)

RouteMetricsProvider = Callable[[list[RouteStop]], tuple[list[dict[str, float] | None], str]]
SELECTED_STAY_STATUSES = {"SELECTED", "BOOKED_BY_USER"}
MAX_ROUTED_LEGS_PER_PREVIEW = 100


def _fold_city(value: str | None) -> str:
    folded = unicodedata.normalize("NFKD", value or "")
    return " ".join(
        "".join(char for char in folded if not unicodedata.combining(char))
        .casefold()
        .replace("đ", "d")
        .split()
    )


def _fingerprint(request: TransportPreviewRequest) -> str:
    serialized = json.dumps(
        request.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _stay_for_city(
    groups: list[AccommodationGroupInput], day_number: int, city: str | None
) -> tuple[AccommodationGroupInput | None, str | None]:
    active = [
        group
        for group in groups
        if group.status in SELECTED_STAY_STATUSES and day_number in group.day_numbers
    ]
    city_key = _fold_city(city)
    matching = [group for group in active if city_key and _fold_city(group.city) == city_key]
    candidates = matching if city_key else active
    if len(candidates) == 1:
        return candidates[0], None
    if len(candidates) > 1:
        return None, "Có nhiều nơi lưu trú được chọn cho cùng thành phố/ngày; cần xác định đúng nơi xuất phát."
    return None, None


def _stop_point(day: TransportDayInput, index: int) -> TransportPoint:
    stop = day.stops[index]
    return TransportPoint(
        point_id=stop.stop_id or stop.poi_id or f"day-{day.day_number}-stop-{index + 1}",
        point_type="POI",
        poi_id=stop.poi_id,
        name=stop.title,
        city=stop.city,
        latitude=stop.latitude,
        longitude=stop.longitude,
    )


def _stay_point(group: AccommodationGroupInput) -> TransportPoint:
    return TransportPoint(
        point_id=group.stay_id or group.group_id,
        point_type="ACCOMMODATION",
        name=group.name or "Nơi lưu trú đã chọn",
        city=group.city,
        latitude=group.latitude,
        longitude=group.longitude,
    )


def _scope(origin: TransportPoint, destination: TransportPoint) -> str:
    origin_city = _fold_city(origin.city)
    destination_city = _fold_city(destination.city)
    if origin_city and destination_city:
        return "INTRACITY" if origin_city == destination_city else "INTERCITY"
    return "UNKNOWN"


def _leg_id(alternative_id: str, day_number: int, index: int, origin: TransportPoint, destination: TransportPoint) -> str:
    identity = f"{alternative_id}|{day_number}|{index}|{origin.point_id}|{destination.point_id}"
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]


def _unknown_leg(
    request: TransportPreviewRequest,
    day: TransportDayInput,
    index: int,
    origin: TransportPoint,
    destination: TransportPoint,
    reason: str,
) -> TransportLeg:
    return TransportLeg(
        leg_id=_leg_id(request.alternative_id, day.day_number, index, origin, destination),
        alternative_id=request.alternative_id,
        day_number=day.day_number,
        sequence=index,
        date=day.date,
        scope=_scope(origin, destination),
        origin=origin,
        destination=destination,
        warnings=[reason],
    )


def _route_run(
    request: TransportPreviewRequest,
    day: TransportDayInput,
    run: list[tuple[int, TransportPoint]],
    route_metrics: RouteMetricsProvider,
    fare_provider: FareRateProvider,
    emissions_provider: EmissionFactorProvider,
    railway_provider: RailwayScheduleProvider,
    travelers: TravelerCounts,
) -> list[TransportLeg]:
    if len(run) < 2:
        return []
    route_stops = [
        RouteStop(
            order=order,
            poi_id=point.poi_id or point.point_id,
            name=point.name,
            latitude=point.latitude,
            longitude=point.longitude,
        )
        for order, (_, point) in enumerate(run, start=1)
    ]
    try:
        segment_metrics, provider = route_metrics(route_stops)
    except Exception:
        segment_metrics, provider = [None] * (len(run) - 1), "unavailable"

    legs: list[TransportLeg] = []
    for position, ((sequence_index, origin), (_, destination)) in enumerate(zip(run, run[1:])):
        metric = segment_metrics[position] if position < len(segment_metrics) else None
        scope = _scope(origin, destination)
        mode = "PRIVATE_CAR" if scope == "INTERCITY" else "CAR"
        warnings: list[str] = []
        if provider == "osrm" and metric is not None:
            route_status = "ROUTED"
            availability = "AVAILABLE"
            distance = metric.get("distance_meters")
            duration = metric.get("duration_seconds")
            data_source = "OSRM driving profile"
        elif provider == "fallback" and metric is not None:
            route_status = "HEURISTIC"
            availability = "ESTIMATE_UNVERIFIED"
            distance = metric.get("distance_meters")
            duration = None
            data_source = "Existing coordinate fallback"
            warnings.append("Quãng đường chỉ là ước tính tọa độ; không có ETA tuyến đường xác minh.")
        else:
            route_status = "UNKNOWN"
            availability = "ESTIMATE_UNVERIFIED"
            distance = None
            duration = None
            data_source = "OSRM driving profile"
            warnings.append("Provider không trả dữ liệu riêng cho chặng này.")

        if provider == "osrm":
            warnings.append("OSRM profile driving; không xét giao thông thời gian thực hoặc giờ khởi hành.")
        if scope == "UNKNOWN":
            warnings.append("Không đủ thông tin thành phố để phân loại chặng nội thành/liên tỉnh.")
        if scope == "INTERCITY":
            warnings.append("Đây là tuyến đường bộ; không đại diện cho thời gian hoặc tuyến tàu hỏa.")

        travel_date = None
        if day.date:
            from datetime import date
            travel_date = date.fromisoformat(day.date)
        try:
            fare_rate = fare_provider.get_rate(mode, "VN", travel_date)
        except Exception:
            fare_rate = None
        try:
            emission_factor = emissions_provider.get_factor(mode, "VN", travel_date)
        except Exception:
            emission_factor = None
        fare = estimate_fare(
            mode=mode,
            route_status=route_status,
            distance_meters=distance,
            duration_seconds=duration,
            travelers=travelers,
            vehicle_count=None,
            travel_date=travel_date,
            rate=fare_rate,
        )
        emissions = estimate_emissions(
            mode=mode,
            route_status=route_status,
            distance_meters=distance,
            travelers=travelers,
            vehicle_count=None,
            travel_date=travel_date,
            factor=emission_factor,
        )
        warnings.extend(fare.warnings)
        warnings.extend(emissions.warnings)

        option = TransportRouteOption(
            mode=mode,
            availability=availability,
            route_status=route_status,
            provider="OSRM" if provider == "osrm" else provider.upper(),
            route_profile="driving",
            distance_meters=distance,
            duration_seconds=duration,
            traffic_aware=False,
            departure_time_supported=False,
            fare_status=fare.status,
            estimated_fare=fare.amount,
            fare_currency=fare.currency,
            fare_unit=fare.unit,
            fare_source=fare.source_name,
            fare_source_url=fare.source_url,
            fare_region=fare.region,
            emissions_status=emissions.status,
            estimated_co2e_kg=emissions.amount,
            emissions_unit=emissions.unit,
            emissions_source=emissions.source_name,
            emissions_source_url=emissions.source_url,
            emissions_region=emissions.region,
            emissions_scope=emissions.calculation_boundary,
            data_source=data_source,
            warnings=warnings,
        )
        options = [option]
        if scope == "INTERCITY" and is_da_nang_hue_pair(origin.city, destination.city):
            options.extend(build_train_options(
                origin=origin,
                destination=destination,
                travel_date=day.date,
                provider=railway_provider,
                route_metrics=route_metrics,
            ))
        legs.append(
            TransportLeg(
                leg_id=_leg_id(request.alternative_id, day.day_number, sequence_index, origin, destination),
                alternative_id=request.alternative_id,
                day_number=day.day_number,
                sequence=sequence_index,
                date=day.date,
                scope=scope,
                origin=origin,
                destination=destination,
                options=options,
                warnings=warnings.copy(),
            )
        )
    return legs


def _build_day_points(
    day: TransportDayInput,
    accommodation_groups: list[AccommodationGroupInput],
) -> tuple[list[TransportPoint], list[UncomputedTransportEndpoint], list[str]]:
    stops = [_stop_point(day, index) for index in range(len(day.stops))]
    if not stops:
        return [], [], []

    endpoints: list[UncomputedTransportEndpoint] = []
    warnings: list[str] = []
    first_stay, first_error = _stay_for_city(accommodation_groups, day.day_number, stops[0].city)
    last_stay, last_error = _stay_for_city(accommodation_groups, day.day_number, stops[-1].city)
    if first_error:
        warnings.append(first_error)
    if last_error and last_error not in warnings:
        warnings.append(last_error)

    points: list[TransportPoint] = []
    if first_stay:
        points.append(_stay_point(first_stay))
    else:
        endpoints.append(
            UncomputedTransportEndpoint(
                day_number=day.day_number,
                endpoint="FIRST_MILE",
                city=stops[0].city,
                reason=first_error or "Chưa chọn nơi lưu trú có tọa độ cho điểm đầu ngày.",
            )
        )
    points.extend(stops)
    if last_stay:
        points.append(_stay_point(last_stay))
    else:
        endpoints.append(
            UncomputedTransportEndpoint(
                day_number=day.day_number,
                endpoint="LAST_MILE",
                city=stops[-1].city,
                reason=last_error or "Chưa chọn nơi lưu trú có tọa độ cho điểm cuối ngày.",
            )
        )
    return points, endpoints, warnings


def build_transport_preview(
    request: TransportPreviewRequest,
    route_metrics: RouteMetricsProvider = compute_route_leg_metrics,
    fare_provider: FareRateProvider | None = None,
    emissions_provider: EmissionFactorProvider | None = None,
    railway_provider: RailwayScheduleProvider | None = None,
) -> TransportPreviewResponse:
    """Build road-routing legs without mutating itinerary or accommodation state."""
    legs: list[TransportLeg] = []
    endpoints: list[UncomputedTransportEndpoint] = []
    limitations = [
        "Chỉ OSRM profile driving có định tuyến đường bộ; không có route matrix, lịch khởi hành hoặc dữ liệu giao thông thời gian thực.",
        "Giá vé/xe và hệ số CO₂e chưa có nguồn dữ liệu được xác minh nên được để trống.",
        "Đi bộ, xe đạp, xe máy, xe buýt, xe khách, taxi/xe công nghệ và tàu hỏa chưa có provider phù hợp trong luồng này.",
        "Khi chưa chọn nơi lưu trú, first-mile và last-mile không được tạo bằng vị trí giả.",
    ]
    routed_leg_count = 0
    fare_provider = fare_provider or NoFareRateProvider()
    emissions_provider = emissions_provider or NoEmissionFactorProvider()
    railway_provider = railway_provider or NoRailwayScheduleProvider()
    traveler_input = request.travelers
    travelers = TravelerCounts(
        adults=traveler_input.adult_count if traveler_input else None,
        children=traveler_input.child_count if traveler_input else None,
        infants=traveler_input.infant_count if traveler_input else None,
        pets=traveler_input.pet_count if traveler_input else None,
    )

    for day in sorted(request.itinerary.days, key=lambda item: item.day_number):
        points, day_endpoints, day_warnings = _build_day_points(day, request.accommodation_groups)
        endpoints.extend(day_endpoints)
        if day_warnings:
            limitations.extend(day_warnings)

        if len(points) < 2:
            continue

        # Preserve missing-coordinate stops as leg boundaries; never bridge across them.
        pending_run: list[tuple[int, TransportPoint]] = []
        day_legs: list[TransportLeg] = []
        for index, point in enumerate(points):
            if point.latitude is not None and point.longitude is not None:
                pending_run.append((index + 1, point))
            else:
                if len(pending_run) >= 2:
                    day_legs.extend(_route_run(
                        request, day, pending_run, route_metrics,
                        fare_provider, emissions_provider, railway_provider, travelers,
                    ))
                pending_run = []
        if len(pending_run) >= 2:
            day_legs.extend(_route_run(
                request, day, pending_run, route_metrics,
                fare_provider, emissions_provider, railway_provider, travelers,
            ))

        # Add explicit UNKNOWN records at every edge with missing coordinates.
        for index, (origin, destination) in enumerate(zip(points, points[1:]), start=1):
            if origin.latitude is None or origin.longitude is None or destination.latitude is None or destination.longitude is None:
                day_legs.append(
                    _unknown_leg(
                        request,
                        day,
                        index,
                        origin,
                        destination,
                        "Thiếu tọa độ origin hoặc destination; không thể tính tuyến.",
                    )
                )

        if routed_leg_count + len(day_legs) > MAX_ROUTED_LEGS_PER_PREVIEW:
            remaining = max(0, MAX_ROUTED_LEGS_PER_PREVIEW - routed_leg_count)
            day_legs = day_legs[:remaining]
            limitations.append("Đã chạm giới hạn 100 transport legs cho một lần preview.")
        routed_leg_count += len(day_legs)
        legs.extend(sorted(day_legs, key=lambda item: item.sequence))

    route_count = sum(
        1
        for leg in legs
        for option in leg.options
        if option.route_status == "ROUTED"
    )
    unknown_count = sum(1 for leg in legs if not leg.options)
    heuristic_count = sum(
        1
        for leg in legs
        for option in leg.options
        if option.route_status != "ROUTED"
    )
    if route_count and not unknown_count and not heuristic_count and not endpoints:
        status = "success"
    elif legs or endpoints:
        status = "partial"
    else:
        status = "unavailable"

    return TransportPreviewResponse(
        status=status,
        trip_id=request.trip_id,
        alternative_id=request.alternative_id,
        itinerary_fingerprint=_fingerprint(request),
        provider_capabilities=TransportProviderCapabilities(
            provider="OSRM",
            route_profile="driving",
            supported_modes=["CAR", "PRIVATE_CAR"],
            route_matrix=False,
            departure_time_supported=False,
            traffic_aware=False,
        ),
        legs=legs,
        uncomputed_endpoints=endpoints,
        limitations=list(dict.fromkeys(limitations)),
    )
