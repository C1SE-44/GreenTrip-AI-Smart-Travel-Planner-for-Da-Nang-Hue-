"""Dedicated tests verifying fixes for the 8 reported bugs in Route & Transport Recommendation."""

from pathlib import Path

import pytest
from app.emission_factors import (
    calculate_carbon_footprint,
    get_emission_factor_g_pkm,
    get_emission_factor_kg_pkm,
    normalize_mode_key,
)
from app.itineraries.schemas import RouteStop
from app.itineraries.routing_service import (
    INTERCITY_DISTANCE_THRESHOLD_METERS,
    compute_route_geometry,
)
from app.itineraries.service import build_day_segments
from app.itineraries.transport_service import (
    check_feasibility,
    evaluate_segment_transport_options,
)
from app.tools.implementations import (
    GetCarbonEstimateInput,
    UpdateItineraryInput,
    get_carbon_estimate,
    update_itinerary,
)


# ------------------------------------------------------------------------------
# 1. BUG-01 Tests: Carbon Consistency
# ------------------------------------------------------------------------------
def test_bug01_carbon_emission_factor_unification():
    """Verify that chatbot tool, transport service, and constraints use identical factors."""
    # Motorcycle baseline across all modules must be 72 g/p-km
    assert get_emission_factor_g_pkm("motorcycle") == 72.0
    assert get_emission_factor_g_pkm("motorbike") == 72.0
    assert get_emission_factor_kg_pkm("motorcycle") == 0.072

    # Calculate 10 km on motorcycle via chatbot tool
    out = get_carbon_estimate(GetCarbonEstimateInput(distance_km=10.0, transport_mode="motorbike"))
    assert out.co2_kg == 0.72  # 10 km * 0.072 kg/km

    # Calculate 10 km via helper
    calc = calculate_carbon_footprint(distance_km=10.0, transport_mode="motorcycle")
    assert calc["carbon_kg"] == 0.72

    # Private car carpooling factor
    assert get_emission_factor_g_pkm("private_car") == 114.0
    assert get_emission_factor_g_pkm("taxi_car") == 171.0


# ------------------------------------------------------------------------------
# 2. BUG-02 Tests: Duration Separation (Transit vs Total Trip with Buffers)
# ------------------------------------------------------------------------------
def test_bug02_duration_separation_and_buffer_sum():
    """Verify transit duration, transfer buffer, and total trip duration are well-formed."""
    options = evaluate_segment_transport_options(
        distance_meters=3000.0, is_intercity=False, profile="balanced"
    )
    for opt in options:
        assert opt.duration_seconds == opt.transit_duration_seconds + opt.transfer_duration_seconds
        if opt.mode == "public_bus" or opt.mode == "electric_bus":
            assert opt.transfer_duration_seconds == 480  # 8 min wait buffer
        elif opt.mode == "taxi_car":
            assert opt.transfer_duration_seconds == 300  # 5 min call buffer


# ------------------------------------------------------------------------------
# 3. BUG-03 Tests: Segment Distance using OSRM Legs vs Detour Factor
# ------------------------------------------------------------------------------
def test_bug03_osrm_legs_distance_used_when_available():
    """Verify that build_day_segments uses OSRM leg distance when available."""
    stops = [
        RouteStop(order=1, poi_id="p1", name="Stop 1", latitude=16.068, longitude=108.212),
        RouteStop(order=2, poi_id="p2", name="Stop 2", latitude=16.075, longitude=108.220),
    ]
    # Synthetic leg distance: 1540 meters
    mock_legs = [{"distance_meters": 1540.0, "duration_seconds": 180.0}]

    segs, cost, carb = build_day_segments(stops, profile="balanced", legs=mock_legs)
    assert len(segs) == 1
    assert segs[0].distance_meters == 1540.0


# ------------------------------------------------------------------------------
# 4. BUG-04 Tests: Custom Segment Modes DB Persistence
# ------------------------------------------------------------------------------
def test_bug04_save_and_retrieve_custom_segment_modes(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    """Verify saving custom segment modes in database table."""
    from app.config import Settings
    from app.db import postgres
    from app.itineraries import repository

    settings = Settings(APP_ENV="development", DATABASE_URL="", SQLITE_FALLBACK_ENABLED=True)
    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", tmp_path / "custom-segment-modes.sqlite3")
    monkeypatch.setattr(postgres, "get_settings", lambda: settings)
    monkeypatch.setattr(repository, "get_settings", lambda: settings)
    repository.seed_sample_itineraries()

    itin_id = "sample-danang-hue-3d"
    success = repository.save_itinerary_day_custom_segment_modes(
        itinerary_id=itin_id,
        day_number=1,
        custom_modes={0: "electric_bus", 1: "taxi_car"},
    )
    assert success is True

    day = repository.get_itinerary_day(itin_id, 1)
    assert day is not None
    assert "custom_segment_modes" in day
    assert "electric_bus" in str(day["custom_segment_modes"])


# ------------------------------------------------------------------------------
# 5. BUG-05 Tests: Chatbot Segment Transport Mode Synchronization
# ------------------------------------------------------------------------------
def test_bug05_chatbot_segment_transport_outline_sync():
    """Verify chatbot update_itinerary attaches segment transport mode to outline."""
    inp = UpdateItineraryInput(
        instruction="đổi chặng 1 sang xe buýt",
        current_itinerary=[
            {
                "day": 1,
                "stops": [
                    {"poi_id": "p1", "name": "Cầu Rồng", "lat": 16.061, "lng": 108.227},
                    {"poi_id": "p2", "name": "Chợ Hàn", "lat": 16.068, "lng": 108.224},
                ],
            }
        ],
    )
    out = update_itinerary(inp)
    assert any("chặng 1 sang" in s.lower() for s in out.mutation_summary)

    # Check that updated itinerary contains custom_segment_modes
    updated = out.updated_itinerary[0]
    assert "custom_segment_modes" in updated
    assert updated["custom_segment_modes"].get("0") == "electric_bus"
    assert updated["stops"][1].get("transport_mode") == "electric_bus"


# ------------------------------------------------------------------------------
# 6. BUG-06 Tests: Transit Fare Transparency Note
# ------------------------------------------------------------------------------
def test_bug06_fare_tier_transparency_note():
    """Verify that transport options contain fare transparency metadata."""
    options = evaluate_segment_transport_options(
        distance_meters=85000.0, is_intercity=True, profile="balanced"
    )
    train_opt = next((o for o in options if o.mode == "train"), None)
    assert train_opt is not None
    assert train_opt.is_estimated_cost is True
    assert "Giá vé tham khảo" in train_opt.fare_tier_note


# ------------------------------------------------------------------------------
# 7. BUG-07 Tests: Continuous Walking Feasibility Decay (2.5 km -> 3.5 km)
# ------------------------------------------------------------------------------
def test_bug07_walking_feasibility_smooth_decay():
    """Verify that walking does not experience an abrupt cliff at 3.0 km."""
    feasible_25, _ = check_feasibility("walking", 2500.0, is_intercity=False)
    assert feasible_25 is True

    feasible_299, _ = check_feasibility("walking", 2990.0, is_intercity=False)
    assert feasible_299 is True

    # 3.01 km should still be feasible (within 2.5 - 3.5km zone), with advisory note
    feasible_301, note_301 = check_feasibility("walking", 3010.0, is_intercity=False)
    assert feasible_301 is True
    assert "quen vận động" in note_301

    # Over 3.5 km should be rejected
    feasible_360, note_360 = check_feasibility("walking", 3600.0, is_intercity=False)
    assert feasible_360 is False
    assert "tối đa 3.5 km" in note_360


# ------------------------------------------------------------------------------
# 8. BUG-08 Tests: Unified Intercity Threshold (40,000 meters)
# ------------------------------------------------------------------------------
def test_bug08_unified_intercity_threshold():
    """Verify that 40,000m is the unified intercity boundary across all modules."""
    assert INTERCITY_DISTANCE_THRESHOLD_METERS == 40_000.0

    # 42 km should be recognized as intercity
    stops_42km = [
        RouteStop(order=1, poi_id="p1", name="P1", latitude=16.068, longitude=108.212),
        RouteStop(order=2, poi_id="p2", name="P2", latitude=16.445, longitude=108.212),
    ]
    segs, _, _ = build_day_segments(stops_42km, profile="balanced")
    assert len(segs) == 1
    assert segs[0].is_intercity is True
