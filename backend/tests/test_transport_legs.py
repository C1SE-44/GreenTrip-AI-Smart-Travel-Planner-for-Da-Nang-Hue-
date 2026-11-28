from pathlib import Path
import sys
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth.dependencies import get_current_user_id
from app.transport.estimation import (
    EmissionFactor,
    FareRate,
    NoEmissionFactorProvider,
    NoFareRateProvider,
    TravelerCounts,
    estimate_emissions,
    estimate_fare,
)
from app.transport.railway import (
    NoRailwayScheduleProvider,
    RailServiceRecord,
    build_train_options,
    door_to_door_duration_seconds,
)
from app.itineraries.routing_service import compute_route_leg_metrics
from app.itineraries.schemas import RouteStop
from app.main import app
from app.transport.schemas import TransportPoint, TransportPreviewRequest
from app.transport.service import build_transport_preview


def request_payload(days, accommodation_groups=None, travelers=None):
    return TransportPreviewRequest.model_validate({
        "trip_id": "trip-transport-test",
        "alternative_id": "alternative-one",
        "itinerary": {"days": days},
        "travelers": travelers,
        "accommodation_groups": accommodation_groups or [],
    })


def stop(poi_id, title, city="Đà Nẵng", latitude=16.06, longitude=108.22):
    return {
        "poi_id": poi_id,
        "title": title,
        "city": city,
        "latitude": latitude,
        "longitude": longitude,
    }


def selected_stay(group_id, city, latitude, longitude, day_numbers=(1,), name=None):
    return {
        "group_id": group_id,
        "city": city,
        "status": "SELECTED",
        "stay_id": f"stay-{group_id}",
        "name": name or f"Stay in {city}",
        "latitude": latitude,
        "longitude": longitude,
        "day_numbers": list(day_numbers),
    }


def test_two_pois_use_one_road_route_and_mark_unknown_hotel_endpoints():
    calls = []

    def routed(stops):
        calls.append(stops)
        return ([{"distance_meters": 1500, "duration_seconds": 420}], "osrm")

    result = build_transport_preview(
        request_payload([{"day_number": 1, "date": "2026-12-01", "stops": [stop("p1", "A"), stop("p2", "B", longitude=108.24)]}]),
        route_metrics=routed,
    )

    assert result.status == "partial"
    assert len(result.legs) == 1
    assert len(calls) == 1
    assert [item.name for item in calls[0]] == ["A", "B"]
    leg = result.legs[0]
    assert leg.sequence == 1
    assert leg.options[0].mode == "CAR"
    assert leg.options[0].route_status == "ROUTED"
    assert leg.options[0].distance_meters == 1500
    assert leg.options[0].duration_seconds == 420
    assert leg.options[0].fare_status == "UNAVAILABLE"
    assert leg.options[0].estimated_fare is None
    assert leg.options[0].emissions_status == "UNAVAILABLE"
    assert leg.options[0].estimated_co2e_kg is None
    assert [item.endpoint for item in result.uncomputed_endpoints] == ["FIRST_MILE", "LAST_MILE"]


def test_selected_accommodation_is_added_at_both_ends_of_its_city_day():
    calls = []

    def routed(stops):
        calls.append(stops)
        return ([{"distance_meters": 1000 * index, "duration_seconds": 300 * index} for index in range(len(stops) - 1)], "osrm")

    result = build_transport_preview(
        request_payload(
            [{"day_number": 1, "stops": [stop("p1", "A"), stop("p2", "B", longitude=108.24)]}],
            [selected_stay("dn", "Đà Nẵng", 16.07, 108.20)],
        ),
        route_metrics=routed,
    )

    assert len(calls) == 1
    assert [item.name for item in calls[0]] == ["Stay in Đà Nẵng", "A", "B", "Stay in Đà Nẵng"]
    assert [leg.sequence for leg in result.legs] == [1, 2, 3]
    assert [leg.origin.point_type for leg in result.legs] == ["ACCOMMODATION", "POI", "POI"]
    assert [leg.destination.point_type for leg in result.legs] == ["POI", "POI", "ACCOMMODATION"]
    assert result.uncomputed_endpoints == []
    assert result.status == "success"


def test_transfer_day_uses_different_selected_stays_for_first_and_last_city():
    calls = []

    def routed(stops):
        calls.append(stops)
        return ([{"distance_meters": 9000, "duration_seconds": 1200} for _ in range(len(stops) - 1)], "osrm")

    result = build_transport_preview(
        request_payload(
            [{"day_number": 2, "stops": [stop("dn", "Đà Nẵng A"), stop("hue", "Huế B", "Huế", 16.46, 107.59)]}],
            [
                selected_stay("dn", "Đà Nẵng", 16.07, 108.20, (2,)),
                selected_stay("hue", "Huế", 16.46, 107.59, (2,)),
            ],
        ),
        route_metrics=routed,
    )

    assert len(calls) == 1
    assert [item.name for item in calls[0]] == ["Stay in Đà Nẵng", "Đà Nẵng A", "Huế B", "Stay in Huế"]
    intercity = next(leg for leg in result.legs if leg.scope == "INTERCITY")
    assert intercity.options[0].mode == "PRIVATE_CAR"
    assert any("không đại diện cho thời gian hoặc tuyến tàu" in item for item in intercity.warnings)
    train = next(item for item in intercity.options if item.mode == "TRAIN")
    assert train.availability == "UNAVAILABLE"
    assert train.duration_seconds is None
    assert train.estimated_fare is None
    assert train.estimated_co2e_kg is None
    assert train.train_ticket_status == "NOT_CONFIRMED"


def rail_service(source_kind="USER_PROVIDED", **overrides):
    record = {
        "service_id": "fixture-service",
        "service_name": "Fixture schedule",
        "origin": {
            "station_id": "fixture-dn-station",
            "name": "Fixture Da Nang station",
            "city": "Đà Nẵng",
            "latitude": 16.07,
            "longitude": 108.21,
        },
        "destination": {
            "station_id": "fixture-hue-station",
            "name": "Fixture Hue station",
            "city": "Huế",
            "latitude": 16.46,
            "longitude": 107.59,
        },
        "departure_at": "2026-12-01T08:00:00+07:00",
        "arrival_at": "2026-12-01T10:00:00+07:00",
        "source_kind": source_kind,
        "station_buffer_minutes": 30,
        "transfer_buffer_minutes": 15,
    }
    record.update(overrides)
    return RailServiceRecord.model_validate(record)


def test_train_door_to_door_time_sums_first_station_train_transfer_and_last_mile():
    result = door_to_door_duration_seconds(
        first_mile_seconds=600,
        station_buffer_minutes=30,
        departure_at=rail_service().departure_at,
        arrival_at=rail_service().arrival_at,
        transfer_buffer_minutes=15,
        last_mile_seconds=900,
    )

    assert result == 11400
    assert door_to_door_duration_seconds(
        first_mile_seconds=600,
        station_buffer_minutes=None,
        departure_at=rail_service().departure_at,
        arrival_at=rail_service().arrival_at,
        transfer_buffer_minutes=15,
        last_mile_seconds=900,
    ) is None


def test_user_provided_train_schedule_is_unconfirmed_and_has_calculated_first_last_mile():
    service = rail_service()
    origin = TransportPoint(point_id="poi-dn", point_type="POI", poi_id="poi-dn", name="Da Nang stop", city="Đà Nẵng", latitude=16.071, longitude=108.211)
    destination = TransportPoint(point_id="poi-hue", point_type="POI", poi_id="poi-hue", name="Hue stop", city="Huế", latitude=16.461, longitude=107.591)
    calls = []

    def routed(stops):
        calls.append([item.name for item in stops])
        return ([{"distance_meters": 1200, "duration_seconds": 600}], "osrm")

    class UserSchedule:
        def get_services(self, _origin, _destination, _travel_date):
            return [service]

    options = build_train_options(
        origin=origin,
        destination=destination,
        travel_date="2026-12-01",
        provider=UserSchedule(),
        route_metrics=routed,
    )

    train = options[0]
    assert calls == [
        ["Da Nang stop", "Fixture Da Nang station"],
        ["Fixture Hue station", "Hue stop"],
    ]
    assert train.mode == "TRAIN"
    assert train.availability == "USER_PROVIDED"
    assert train.train_departure_at == "2026-12-01T08:00:00+07:00"
    assert train.train_arrival_at == "2026-12-01T10:00:00+07:00"
    assert train.duration_seconds == 11100
    assert train.train_ticket_status == "NOT_CONFIRMED"
    assert train.first_mile_distance_meters == 1200
    assert train.first_mile_duration_seconds == 600
    assert train.first_mile_route_status == "ROUTED"
    assert train.last_mile_distance_meters == 1200
    assert train.last_mile_duration_seconds == 600
    assert train.last_mile_route_status == "ROUTED"
    assert train.estimated_fare is None
    assert train.emissions_status == "UNAVAILABLE"
    assert any("chưa xác minh" in warning for warning in train.warnings)


def test_verified_train_schedule_requires_source_update_and_validity():
    with pytest.raises(ValueError, match="validity time"):
        rail_service(
            source_kind="VERIFIED_PROVIDER",
            source_name="Official source",
            source_url="https://rail.example.org/timetable",
            updated_at="2026-11-30T10:00:00+07:00",
        )


def test_train_adapter_default_returns_no_fabricated_schedule():
    assert NoRailwayScheduleProvider().get_services("Đà Nẵng", "Huế", "2026-12-01") == []


def test_missing_stop_coordinates_leave_unknown_edges_and_do_not_bridge_them():
    calls = []

    def routed(stops):
        calls.append(stops)
        return ([{"distance_meters": 700, "duration_seconds": 180}], "osrm")

    result = build_transport_preview(
        request_payload([{
            "day_number": 1,
            "stops": [
                stop("p1", "A"),
                stop("p2", "Missing", latitude=None, longitude=None),
                stop("p3", "C", longitude=108.23),
                stop("p4", "D", longitude=108.24),
            ],
        }]),
        route_metrics=routed,
    )

    assert len(calls) == 1
    assert [item.name for item in calls[0]] == ["C", "D"]
    assert len(result.legs) == 3
    assert [leg.sequence for leg in result.legs] == [1, 2, 3]
    assert [len(leg.options) for leg in result.legs] == [0, 0, 1]
    assert all("Thiếu tọa độ" in leg.warnings[0] for leg in result.legs[:2])


def test_existing_fallback_is_labeled_heuristic_without_an_eta_or_fake_costs():
    result = build_transport_preview(
        request_payload([{"day_number": 1, "stops": [stop("p1", "A"), stop("p2", "B", longitude=108.24)]}]),
        route_metrics=lambda _stops: ([{"distance_meters": 1900, "duration_seconds": 195}], "fallback"),
    )

    option = result.legs[0].options[0]
    assert option.route_status == "HEURISTIC"
    assert option.availability == "ESTIMATE_UNVERIFIED"
    assert option.distance_meters == 1900
    assert option.duration_seconds is None
    assert option.estimated_fare is None
    assert option.estimated_co2e_kg is None


def test_missing_provider_metrics_are_unknown_instead_of_splitting_route_totals():
    result = build_transport_preview(
        request_payload([{"day_number": 1, "stops": [stop("p1", "A"), stop("p2", "B", longitude=108.24)]}]),
        route_metrics=lambda _stops: ([None], "osrm"),
    )

    option = result.legs[0].options[0]
    assert option.route_status == "UNKNOWN"
    assert option.distance_meters is None
    assert option.duration_seconds is None


def test_api_requires_verified_user_and_does_not_call_route_service_without_auth():
    with TestClient(app) as client:
        response = client.post("/api/transport/preview", json={})
    assert response.status_code == 401


def test_transport_preview_endpoint_is_registered():
    assert "/api/transport/preview" in app.openapi()["paths"]


def test_transport_input_rejects_partial_coordinates():
    with pytest.raises(ValueError, match="both coordinates"):
        request_payload([{"day_number": 1, "stops": [stop("p1", "A", longitude=None)]}])


def test_transport_input_rejects_invalid_calendar_date_before_routing():
    with pytest.raises(ValueError, match="ISO calendar date"):
        request_payload([{"day_number": 1, "date": "2026-02-30", "stops": []}])


def test_osrm_via_route_exposes_per_leg_metrics_from_one_provider_request():
    route_stops = [
        RouteStop(order=1, poi_id="route-a-unique", name="A", latitude=16.10111, longitude=108.20111),
        RouteStop(order=2, poi_id="route-b-unique", name="B", latitude=16.10222, longitude=108.20222),
        RouteStop(order=3, poi_id="route-c-unique", name="C", latitude=16.10333, longitude=108.20333),
    ]
    payload = {
        "code": "Ok",
        "routes": [{
            "geometry": {"type": "LineString", "coordinates": [[108.20111, 16.10111], [108.20222, 16.10222], [108.20333, 16.10333]]},
            "distance": 3100,
            "duration": 900,
            "legs": [
                {"distance": 1200, "duration": 320},
                {"distance": 1900, "duration": 580},
            ],
        }],
    }
    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=payload) as fetch:
        metrics, provider = compute_route_leg_metrics(route_stops)

    assert provider == "osrm"
    assert metrics == [
        {"distance_meters": 1200, "duration_seconds": 320},
        {"distance_meters": 1900, "duration_seconds": 580},
    ]
    assert fetch.call_count == 1


def test_osrm_aggregate_without_leg_breakdown_does_not_split_total():
    route_stops = [
        RouteStop(order=1, poi_id="aggregate-a-unique", name="A", latitude=16.11111, longitude=108.21111),
        RouteStop(order=2, poi_id="aggregate-b-unique", name="B", latitude=16.11222, longitude=108.21222),
        RouteStop(order=3, poi_id="aggregate-c-unique", name="C", latitude=16.11333, longitude=108.21333),
    ]
    payload = {
        "code": "Ok",
        "routes": [{
            "geometry": {"type": "LineString", "coordinates": [[108.21111, 16.11111], [108.21333, 16.11333]]},
            "distance": 3000,
            "duration": 800,
        }],
    }
    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=payload):
        metrics, provider = compute_route_leg_metrics(route_stops)

    assert provider == "osrm"
    assert metrics == [None, None]


def test_emissions_uses_passenger_km_unit_and_excludes_pets_from_human_count():
    factor = EmissionFactor(
        mode="CAR",
        value=0.12,
        unit="KG_CO2E_PER_PASSENGER_KM",
        source_name="Test-only fixture",
        source_url="https://example.org/transport-factor-test",
        region="VN",
        publication="test-fixture-v1",
        valid_from=None,
        valid_until=None,
        calculation_boundary="well-to-wheel",
    )

    result = estimate_emissions(
        mode="CAR",
        route_status="ROUTED",
        distance_meters=2000,
        travelers=TravelerCounts(adults=2, children=1, infants=0, pets=1),
        vehicle_count=None,
        travel_date=None,
        factor=factor,
    )

    assert result.status == "ESTIMATED"
    assert result.amount == 0.72
    assert result.unit == "kg CO₂e (nhóm)"
    assert result.calculation_boundary == "well-to-wheel"


def test_vehicle_km_factor_requires_known_vehicle_count():
    factor = EmissionFactor(
        mode="PRIVATE_CAR",
        value=0.2,
        unit="KG_CO2E_PER_VEHICLE_KM",
        source_name="Test-only fixture",
        source_url="https://example.org/vehicle-factor-test",
        region="VN",
        publication="test-fixture-v1",
        valid_from=None,
        valid_until=None,
        calculation_boundary="operational",
    )

    missing_count = estimate_emissions(
        mode="PRIVATE_CAR",
        route_status="ROUTED",
        distance_meters=2000,
        travelers=TravelerCounts(adults=2, children=0, infants=0, pets=0),
        vehicle_count=None,
        travel_date=None,
        factor=factor,
    )
    known_count = estimate_emissions(
        mode="PRIVATE_CAR",
        route_status="ROUTED",
        distance_meters=2000,
        travelers=TravelerCounts(adults=2, children=0, infants=0, pets=0),
        vehicle_count=2,
        travel_date=None,
        factor=factor,
    )

    assert missing_count.status == "UNAVAILABLE"
    assert known_count.amount == 0.8


def test_emissions_do_not_use_factors_for_heuristic_route_or_wrong_region():
    factor = EmissionFactor(
        mode="CAR",
        value=0.12,
        unit="KG_CO2E_PER_PASSENGER_KM",
        source_name="Out-of-region test fixture",
        source_url="https://example.org/uk-only",
        region="GB",
        publication="test-fixture-v1",
        valid_from=None,
        valid_until=None,
        calculation_boundary="operational",
    )
    common = {
        "mode": "CAR",
        "distance_meters": 1000,
        "travelers": TravelerCounts(adults=1, children=0, infants=0, pets=0),
        "vehicle_count": None,
        "travel_date": None,
        "factor": factor,
    }

    wrong_region = estimate_emissions(route_status="ROUTED", **common)
    heuristic = estimate_emissions(route_status="HEURISTIC", **{**common, "factor": EmissionFactor(
        **{**factor.__dict__, "region": "VN"}
    )})

    assert wrong_region.status == "UNAVAILABLE"
    assert heuristic.status == "UNAVAILABLE"


def test_fare_requires_class_specific_rates_and_reports_only_known_subtotal():
    rate = FareRate(
        mode="TRAIN",
        currency="VND",
        unit="PER_TRAVELER_TRIP",
        source_name="Test-only fare fixture",
        source_url="https://example.org/fare-test",
        region="VN",
        publication="test-fixture-v1",
        traveler_rates={"adult": 100000, "child": 50000},
        calculation_scope="one-way per traveler",
    )

    result = estimate_fare(
        mode="TRAIN",
        route_status="ROUTED",
        distance_meters=80000,
        duration_seconds=3600,
        travelers=TravelerCounts(adults=2, children=1, infants=1, pets=0),
        vehicle_count=None,
        travel_date=None,
        rate=rate,
    )

    assert result.status == "PARTIAL"
    assert result.amount == 250000
    assert result.currency == "VND"
    assert result.unit == "PER_TRAVELER_TRIP"
    assert any("infant" in warning for warning in result.warnings)


def test_fare_vehicle_rate_needs_explicit_vehicle_count_and_valid_source():
    rate = FareRate(
        mode="CAR",
        currency="VND",
        unit="PER_VEHICLE_KM",
        source_name="Test-only fare fixture",
        source_url="https://example.org/car-fare-test",
        region="VN",
        publication="test-fixture-v1",
        amount=12000,
        calculation_scope="per vehicle kilometer",
    )
    common = {
        "mode": "CAR",
        "route_status": "ROUTED",
        "distance_meters": 5000,
        "duration_seconds": 600,
        "travelers": TravelerCounts(adults=2, children=0, infants=0, pets=0),
        "travel_date": None,
        "rate": rate,
    }

    without_vehicle_count = estimate_fare(vehicle_count=None, **common)
    with_vehicle_count = estimate_fare(vehicle_count=1, **common)

    assert without_vehicle_count.status == "UNAVAILABLE"
    assert with_vehicle_count.amount == 60000
    assert with_vehicle_count.currency == "VND"


def test_default_providers_contain_no_production_fares_or_emission_factors():
    assert NoFareRateProvider().get_rate("CAR", "VN", None) is None
    assert NoEmissionFactorProvider().get_factor("CAR", "VN", None) is None


def test_transport_preview_uses_injected_sources_and_keeps_source_units():
    class FixtureFareProvider:
        def get_rate(self, mode, region, travel_date):
            if mode != "CAR" or region != "VN":
                return None
            return FareRate(
                mode="CAR",
                currency="VND",
                unit="PER_TRAVELER_TRIP",
                source_name="Test-only fare fixture",
                source_url="https://example.org/fare-fixture",
                region="VN",
                publication="test-fixture-v1",
                traveler_rates={"adult": 30000, "child": 20000, "infant": 0},
                calculation_scope="per traveler per route leg",
            )

    class FixtureEmissionProvider:
        def get_factor(self, mode, region, travel_date):
            if mode != "CAR" or region != "VN":
                return None
            return EmissionFactor(
                mode="CAR",
                value=0.1,
                unit="KG_CO2E_PER_PASSENGER_KM",
                source_name="Test-only factor fixture",
                source_url="https://example.org/emission-fixture",
                region="VN",
                publication="test-fixture-v1",
                valid_from=None,
                valid_until=None,
                calculation_boundary="well-to-wheel",
            )

    result = build_transport_preview(
        request_payload(
            [{"day_number": 1, "stops": [stop("p1", "A"), stop("p2", "B", longitude=108.24)]}],
            travelers={"adult_count": 2, "child_count": 1, "infant_count": 0, "pet_count": 0},
        ),
        route_metrics=lambda _stops: ([{"distance_meters": 2000, "duration_seconds": 500}], "osrm"),
        fare_provider=FixtureFareProvider(),
        emissions_provider=FixtureEmissionProvider(),
    )

    option = result.legs[0].options[0]
    assert option.fare_status == "ESTIMATED"
    assert option.estimated_fare == 80000
    assert option.fare_currency == "VND"
    assert option.fare_unit == "PER_TRAVELER_TRIP"
    assert option.fare_source == "Test-only fare fixture"
    assert option.emissions_status == "ESTIMATED"
    assert option.estimated_co2e_kg == 0.6
    assert option.emissions_unit == "kg CO₂e (nhóm)"
    assert option.emissions_scope == "well-to-wheel"
