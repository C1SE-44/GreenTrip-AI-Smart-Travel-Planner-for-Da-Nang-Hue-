"""
Deep QA & Fault Injection Test Suite for Transport Mode Recommendation Engine.
Tests all 22 failure modes, abnormal inputs, edge boundaries, and multi-day scenarios.
"""

import math
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.itineraries.schemas import RouteStop, ComputeRouteRequest, UpdateSegmentTransportRequest
from app.itineraries.transport_service import (
    evaluate_segment_transport_options,
    compute_estimated_cost_vnd,
    check_feasibility,
    WEIGHTS_BY_PROFILE,
    EMISSION_FACTORS_G_PER_PKM,
)
from app.itineraries.service import build_day_segments, get_itinerary_day_route, InvalidPoiCoordinatesError, ItineraryNotFoundError, DayNotFoundError
from app.tools.schemas import RecommendTransportModeInput
from app.tools.implementations import recommend_transport_mode

client = TestClient(app)


# ------------------------------------------------------------------------------
# 1. Abnormal & Injected Distance/Coordinate Edge Cases
# ------------------------------------------------------------------------------

def test_negative_distance_sanitization():
    # Negative distance must be clamped safely to 0.0 without crashing
    opts = evaluate_segment_transport_options(
        distance_meters=-500.0,
        is_intercity=False,
    )
    for opt in opts:
        assert opt.distance_meters == 0.0
        assert opt.estimated_cost_vnd >= 0.0
        assert opt.carbon_g >= 0.0
        assert opt.duration_seconds >= 0


def test_nan_and_infinity_distance_sanitization():
    # NaN and Infinity must be clamped to 0.0
    opts_nan = evaluate_segment_transport_options(
        distance_meters=float("nan"),
        is_intercity=False,
    )
    assert opts_nan[0].distance_meters == 0.0

    opts_inf = evaluate_segment_transport_options(
        distance_meters=float("inf"),
        is_intercity=False,
    )
    assert opts_inf[0].distance_meters == 0.0


def test_zero_distance_co_located_stops():
    # Co-located stops (0 meters)
    opts = evaluate_segment_transport_options(
        distance_meters=0.0,
        is_intercity=False,
    )
    walking_opt = next(o for o in opts if o.mode == "walking")
    assert walking_opt.is_feasible is True
    assert walking_opt.estimated_cost_vnd == 0.0
    assert walking_opt.carbon_g == 0.0

    taxi_opt = next(o for o in opts if o.mode == "taxi_car")
    assert taxi_opt.is_feasible is False
    assert "quá ngắn" in taxi_opt.feasibility_note


def test_duplicate_consecutive_stops_in_itinerary():
    stops = [
        RouteStop(order=1, poi_id="p1", name="Cầu Rồng", latitude=16.0611, longitude=108.2270),
        RouteStop(order=2, poi_id="p1", name="Cầu Rồng (Duplicate)", latitude=16.0611, longitude=108.2270),
    ]
    segs, cost, carb = build_day_segments(stops)
    assert len(segs) == 1
    assert segs[0].distance_meters == 0.0
    assert segs[0].recommended_mode in ("walking", "bicycle")


# ------------------------------------------------------------------------------
# 2. OSRM Fault Injections & Resilience
# ------------------------------------------------------------------------------

def test_osrm_http_error_simulation():
    # Simulate OSRM returning HTTP 500
    mock_error_resp = {"code": "InternalError", "message": "OSRM server failure"}
    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=mock_error_resp):
        resp = client.get("/itineraries/sample-danang-hue-3d/days/1/route")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_fallback"] is True
        assert data["routing_provider"] == "fallback"
        assert len(data["segments"]) == 2


def test_osrm_empty_routes_simulation():
    # Simulate OSRM returning empty routes
    mock_empty_resp = {"code": "Ok", "routes": []}
    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=mock_empty_resp):
        resp = client.get("/itineraries/sample-danang-hue-3d/days/1/route")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_fallback"] is True


def test_osrm_timeout_simulation():
    # Simulate OSRM throwing timeout/connection exception
    with patch("app.itineraries.routing_service.fetch_osrm_json", side_effect=TimeoutError("Connection timed out")):
        resp = client.get("/itineraries/sample-danang-hue-3d/days/1/route")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_fallback"] is True


# ------------------------------------------------------------------------------
# 3. Profile Sensitivity & Mathematical Consistency
# ------------------------------------------------------------------------------

def test_weights_sum_to_one():
    for profile, weights in WEIGHTS_BY_PROFILE.items():
        total = sum(weights.values())
        assert abs(total - 1.0) < 1e-6
        for w in weights.values():
            assert w >= 0.0


def test_eco_priority_carbon_monotonicity():
    # On an urban segment, eco_priority must produce equal or less carbon than balanced
    dist = 4000.0
    opts_bal = evaluate_segment_transport_options(dist, False, "balanced")
    opts_eco = evaluate_segment_transport_options(dist, False, "eco_priority")

    best_bal = next(o for o in opts_bal if o.recommendation_type == "best_match")
    best_eco = next(o for o in opts_eco if o.recommendation_type == "best_match")

    assert best_eco.carbon_kg <= best_bal.carbon_kg


def test_budget_constrained_cost_monotonicity():
    # On an urban segment, budget_constrained must cost equal or less than balanced
    dist = 5000.0
    opts_bal = evaluate_segment_transport_options(dist, False, "balanced")
    opts_bud = evaluate_segment_transport_options(dist, False, "budget_constrained")

    best_bal = next(o for o in opts_bal if o.recommendation_type == "best_match")
    best_bud = next(o for o in opts_bud if o.recommendation_type == "best_match")

    assert best_bud.estimated_cost_vnd <= best_bal.estimated_cost_vnd


# ------------------------------------------------------------------------------
# 4. Multi-Day Itinerary Integrations
# ------------------------------------------------------------------------------

def test_multiday_itinerary_day1_danang():
    resp = client.get("/itineraries/sample-danang-hue-3d/days/1/route")
    assert resp.status_code == 200
    data = resp.json()
    assert data["day_number"] == 1
    assert data["total_stops"] == 3
    assert len(data["segments"]) == 2
    # Intra-city Da Nang should not recommend train
    for seg in data["segments"]:
        assert seg["is_intercity"] is False
        assert seg["recommended_mode"] != "train"


def test_multiday_itinerary_day2_intercity_danang_hue():
    resp = client.get("/itineraries/sample-danang-hue-3d/days/2/route")
    assert resp.status_code == 200
    data = resp.json()
    assert data["day_number"] == 2
    assert len(data["segments"]) >= 1


def test_multiday_itinerary_day3_single_stop():
    # Day 3 of sample-danang-hue-3d has 1 stop (beach rest), which must safely return 0 segments and 0 cost/carbon
    resp = client.get("/itineraries/sample-danang-hue-3d/days/3/route")
    assert resp.status_code == 200
    data = resp.json()
    assert data["day_number"] == 3
    assert data["total_stops"] == 1
    assert len(data["segments"]) == 0
    assert data["day_total_cost_vnd"] == 0.0
    assert data["day_total_carbon_kg"] == 0.0



# ------------------------------------------------------------------------------
# 5. Invalid Payloads & HTTP Error Handling
# ------------------------------------------------------------------------------

def test_nonexistent_itinerary_returns_404():
    resp = client.get("/itineraries/non_existent_itin_999/days/1/route")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_nonexistent_day_returns_404():
    resp = client.get("/itineraries/sample-danang-hue-3d/days/99/route")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_negative_day_returns_422():
    resp = client.get("/itineraries/sample-danang-hue-3d/days/-1/route")
    assert resp.status_code == 422


def test_compute_missing_stops_returns_422():
    resp = client.post("/itineraries/compute", json={})
    assert resp.status_code == 422


def test_compute_invalid_coordinates_returns_422():
    payload = {
        "stops": [
            {"order": 1, "poi_id": "p1", "name": "Invalid Lat", "latitude": 999.0, "longitude": 108.2270},
            {"order": 2, "poi_id": "p2", "name": "Valid", "latitude": 16.0678, "longitude": 108.2208},
        ]
    }
    resp = client.post("/itineraries/compute", json=payload)
    assert resp.status_code == 422


def test_segment_transport_invalid_segment_index():
    # Segment index 99 does not exist (day 1 only has 2 segments)
    payload = {"segment_index": 99, "selected_mode": "taxi_car", "priority_profile": "balanced"}
    resp = client.post("/itineraries/sample-danang-hue-3d/days/1/segment-transport", json=payload)
    # The API should gracefully complete without crashing, leaving existing segments untouched
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["segments"]) == 2


# ------------------------------------------------------------------------------
# 6. Emission Factor Units & Cross-Module Consistency
# ------------------------------------------------------------------------------

def test_emission_factors_consistency():
    # Walking is 0 across all definitions
    assert EMISSION_FACTORS_G_PER_PKM["walking"] == 0.0

    # Driving/taxi is ~171 g/km
    assert EMISSION_FACTORS_G_PER_PKM["taxi_car"] == 171.0

    # Motorcycle is ~72 g/km
    assert EMISSION_FACTORS_G_PER_PKM["motorcycle"] == 72.0

    # Electric bus is ~25 g/km
    assert EMISSION_FACTORS_G_PER_PKM["electric_bus"] == 25.0

    # Train is ~35 g/km (more efficient than car/motorcycle)
    assert EMISSION_FACTORS_G_PER_PKM["train"] < EMISSION_FACTORS_G_PER_PKM["motorcycle"]
    assert EMISSION_FACTORS_G_PER_PKM["train"] < EMISSION_FACTORS_G_PER_PKM["taxi_car"]
