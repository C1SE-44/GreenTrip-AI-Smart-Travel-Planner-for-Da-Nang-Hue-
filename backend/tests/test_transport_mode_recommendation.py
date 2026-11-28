"""
Comprehensive Test Suite for GreenTrip Multi-Criteria Transport Mode Recommendation Engine.
Tests all 20 business, mathematical, algorithmic, and integration criteria.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import Settings
from app.db import postgres
from app.itineraries import repository as itinerary_repository
from app.itineraries.schemas import RouteStop
from app.itineraries.transport_service import (
    evaluate_segment_transport_options,
    compute_estimated_cost_vnd,
    check_feasibility,
    EMISSION_FACTORS_G_PER_PKM,
    TRANSPORT_DYNAMICS,
)
from app.tools.registry import get_default_tool_registry
from app.tools.schemas import (
    GetRouteInformationInput,
    RecommendTransportModeInput,
    UpdateItineraryInput,
)
from app.tools.implementations import (
    get_route_information,
    recommend_transport_mode,
    update_itinerary,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def seeded_itinerary_database(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    settings = Settings(APP_ENV="development", DATABASE_URL="", SQLITE_FALLBACK_ENABLED=True)
    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", tmp_path / "transport-mode.sqlite3")
    monkeypatch.setattr(postgres, "get_settings", lambda: settings)
    monkeypatch.setattr(itinerary_repository, "get_settings", lambda: settings)
    itinerary_repository.seed_sample_itineraries()


# 1. Short urban segment walking / bicycle
def test_short_urban_segment_walking():
    # 800 meters in Da Nang center (e.g. Cầu Rồng -> Chợ Hàn)
    opts = evaluate_segment_transport_options(
        distance_meters=800.0,
        is_intercity=False,
        profile="balanced",
    )
    walking_opt = next((o for o in opts if o.mode == "walking"), None)
    assert walking_opt is not None
    assert walking_opt.is_feasible is True
    assert walking_opt.carbon_g == 0.0
    assert walking_opt.estimated_cost_vnd == 0.0


# 2. Medium urban segment (3-8 km)
def test_medium_urban_segment_motorcycle_bus():
    # 5.5 km (e.g. Chợ Hàn -> Chùa Linh Ứng)
    opts = evaluate_segment_transport_options(
        distance_meters=5500.0,
        is_intercity=False,
        profile="balanced",
    )
    walking_opt = next((o for o in opts if o.mode == "walking"), None)
    moto_opt = next((o for o in opts if o.mode == "motorcycle"), None)
    bus_opt = next((o for o in opts if o.mode == "electric_bus"), None)

    assert walking_opt is not None and walking_opt.is_feasible is False
    assert moto_opt is not None and moto_opt.is_feasible is True
    assert bus_opt is not None and bus_opt.is_feasible is True
    # Motorcycle or electric bus should have higher scores than walking
    assert moto_opt.score > walking_opt.score


# 3. Inter-city corridor (Da Nang <-> Hue, ~100 km)
def test_intercity_danang_hue_corridor():
    opts = evaluate_segment_transport_options(
        distance_meters=95000.0,
        is_intercity=True,
        profile="balanced",
    )
    modes = [o.mode for o in opts if o.is_feasible]
    assert "train" in modes
    assert "tourist_coach" in modes
    assert "taxi_car" in modes
    assert "walking" not in modes
    assert "bicycle" not in modes


# 4. Feasibility boundary: walking rejected for > 3.0 km or intercity
def test_feasibility_boundary_walking_rejected():
    feasible_short, _ = check_feasibility("walking", 2000.0, is_intercity=False)
    assert feasible_short is True

    feasible_long, note_long = check_feasibility("walking", 4500.0, is_intercity=False)
    assert feasible_long is False
    assert "vượt quá ngưỡng" in note_long

    feasible_intercity, note_ic = check_feasibility("walking", 60000.0, is_intercity=True)
    assert feasible_intercity is False
    assert "Không khả thi" in note_ic


# 5. Feasibility boundary: train only feasible for inter-city
def test_feasibility_boundary_train_only_intercity():
    feasible_intra, note_intra = check_feasibility("train", 5000.0, is_intercity=False)
    assert feasible_intra is False
    assert "chỉ khai thác cho chặng kết nối liên tỉnh" in note_intra

    feasible_inter, _ = check_feasibility("train", 95000.0, is_intercity=True)
    assert feasible_inter is True


# 6. Profile: eco_priority favors zero/low carbon
def test_profile_eco_priority():
    opts = evaluate_segment_transport_options(
        distance_meters=1500.0,
        is_intercity=False,
        profile="eco_priority",
    )
    best_opt = next((o for o in opts if o.recommendation_type == "best_match"), opts[0])
    # Under eco priority for 1.5 km, walking or bicycle should be best match
    assert best_opt.mode in ("walking", "bicycle", "electric_bus")
    assert best_opt.carbon_kg <= 0.05


# 7. Profile: budget_constrained favors low cost
def test_profile_budget_constrained():
    opts = evaluate_segment_transport_options(
        distance_meters=6000.0,
        is_intercity=False,
        profile="budget_constrained",
    )
    best_opt = next((o for o in opts if o.recommendation_type == "best_match"), opts[0])
    # Motorcycle or electric bus has lowest cost for 6km
    assert best_opt.mode in ("motorcycle", "electric_bus")
    assert best_opt.estimated_cost_vnd < 20000.0


# 8. Profile: balanced balances time, cost, carbon
def test_profile_balanced():
    opts = evaluate_segment_transport_options(
        distance_meters=4000.0,
        is_intercity=False,
        profile="balanced",
    )
    best_opt = next((o for o in opts if o.recommendation_type == "best_match"), opts[0])
    assert best_opt is not None
    assert best_opt.is_feasible is True


# 9. Multi-criteria score normalization
def test_multi_criteria_scoring_normalization():
    opts = evaluate_segment_transport_options(
        distance_meters=5000.0,
        is_intercity=False,
        profile="balanced",
    )
    for opt in opts:
        assert 0.0 <= opt.score <= 110.0  # max 100 + optional bonus
        assert isinstance(opt.score, float)


# 10. Day route endpoint with segments
def test_day_route_endpoint_with_segments():
    # Use existing sample itinerary
    resp = client.get("/itineraries/sample-danang-hue-3d/days/1/route")
    assert resp.status_code == 200
    data = resp.json()
    assert "segments" in data
    assert isinstance(data["segments"], list)
    assert len(data["segments"]) == len(data["stops"]) - 1
    assert "day_total_cost_vnd" in data
    assert "day_total_carbon_kg" in data
    if data["segments"]:
        first_seg = data["segments"][0]
        assert "options" in first_seg
        assert "recommended_mode" in first_seg
        assert "selected_mode" in first_seg


# 11. Segment transport switch endpoint recalculation
def test_segment_transport_switch_recalculation():
    resp_init = client.get("/itineraries/sample-danang-hue-3d/days/1/route")
    assert resp_init.status_code == 200
    init_data = resp_init.json()
    init_cost = init_data["day_total_cost_vnd"]

    # Switch segment 0 to taxi_car
    resp_switch = client.post(
        "/itineraries/sample-danang-hue-3d/days/1/segment-transport",
        json={"segment_index": 0, "selected_mode": "taxi_car", "priority_profile": "balanced"},
    )
    assert resp_switch.status_code == 200
    switch_data = resp_switch.json()
    assert switch_data["segments"][0]["selected_mode"] == "taxi_car"
    # POI stops count and order must remain unchanged
    assert len(switch_data["stops"]) == len(init_data["stops"])
    for idx, stop in enumerate(switch_data["stops"]):
        assert stop["poi_id"] == init_data["stops"][idx]["poi_id"]


# 12. Compute route endpoint with transport recommendations
def test_compute_route_with_transport_recommendations():
    payload = {
        "stops": [
            {"order": 1, "poi_id": "p1", "name": "Cầu Rồng", "latitude": 16.0611, "longitude": 108.2270},
            {"order": 2, "poi_id": "p2", "name": "Chợ Hàn", "latitude": 16.0678, "longitude": 108.2208},
        ],
        "priority_profile": "balanced",
    }
    resp = client.post("/itineraries/compute", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["segments"]) == 1
    assert data["segments"][0]["recommended_mode"] is not None
    assert len(data["segments"][0]["options"]) > 0


# 13. OSRM active vs Haversine fallback behavior
def test_osrm_active_vs_haversine_fallback():
    from app.itineraries.routing_service import build_fallback_route, haversine_distance_meters
    stops = [
        RouteStop(order=1, poi_id="p1", name="A", latitude=16.0611, longitude=108.2270),
        RouteStop(order=2, poi_id="p2", name="B", latitude=16.4699, longitude=107.5779),
    ]
    # Fallback route must produce geometry, distance, and duration
    geom, dist_m, dur_s, is_fb, provider = build_fallback_route(stops)
    assert geom.type == "LineString"
    assert len(geom.coordinates) >= 2
    assert dist_m > 70000.0  # Da Nang to Hue corridor distance > 70km
    assert dur_s > 3600.0
    assert is_fb is True
    assert provider == "fallback"


# 14. Tool get_route_information enhancement
def test_tool_get_route_information_enhancement():
    inp = GetRouteInformationInput(
        origin_lat=16.0611,
        origin_lng=108.2270,
        dest_lat=16.0678,
        dest_lng=108.2208,
        profile="driving",
    )
    out = get_route_information(inp)
    assert out.distance_meters > 0
    assert out.distance_km > 0
    assert out.recommended_mode in ("walking", "bicycle", "motorcycle", "electric_bus", "taxi_car")
    assert len(out.transport_options) > 0
    assert out.recommendation_summary != ""


# 15. Dedicated tool recommend_transport_mode
def test_tool_recommend_transport_mode():
    inp = RecommendTransportModeInput(
        origin_lat=16.0611,
        origin_lng=108.2270,
        dest_lat=16.4699,
        dest_lng=107.5779,
        priority_profile="eco_priority",
    )
    out = recommend_transport_mode(inp)
    assert out.is_intercity is True
    assert out.distance_km > 50.0
    assert out.recommended_mode in ("train", "tourist_coach", "private_car", "taxi_car", "motorcycle")
    assert len(out.options) >= 3


# 16. Tool update_itinerary segment mode change
def test_tool_update_itinerary_segment_mode():
    mock_itinerary = [
        {
            "day": 1,
            "title": "Khám phá Đà Nẵng",
            "stops": [
                {"name": "Cầu Rồng", "cost_vnd": 0, "lat": 16.0611, "lng": 108.2270},
                {"name": "Chợ Hàn", "cost_vnd": 50000, "lat": 16.0678, "lng": 108.2208},
            ],
        }
    ]
    inp = UpdateItineraryInput(
        current_itinerary=mock_itinerary,
        instruction="Chặng 1 chuyển sang đi bộ",
        target_segment_index=0,
        segment_transport_mode="walking",
    )
    out = update_itinerary(inp)
    assert any("chặng 1 sang walking" in s.lower() or "cập nhật phương tiện" in s.lower() for s in out.mutation_summary)


# 17. Unverified schedule and estimated cost flags
def test_unverified_schedule_and_estimated_cost_flags():
    opts = evaluate_segment_transport_options(
        distance_meters=95000.0,
        is_intercity=True,
    )
    train_opt = next((o for o in opts if o.mode == "train"), None)
    coach_opt = next((o for o in opts if o.mode == "tourist_coach"), None)

    assert train_opt is not None
    assert train_opt.is_verified_schedule is True  # Fixed Vietnam Railways schedule

    assert coach_opt is not None
    assert coach_opt.is_verified_schedule is False  # Variable private coach schedule


# 18. Single stop or empty stops day
def test_single_stop_or_empty_stops_day():
    from app.itineraries.service import build_day_segments
    # 0 stops
    segs_0, cost_0, carb_0 = build_day_segments([])
    assert segs_0 == []
    assert cost_0 == 0.0
    assert carb_0 == 0.0

    # 1 stop
    single_stop = [RouteStop(order=1, poi_id="p1", name="Only Stop", latitude=16.0611, longitude=108.2270)]
    segs_1, cost_1, carb_1 = build_day_segments(single_stop)
    assert segs_1 == []
    assert cost_1 == 0.0
    assert carb_1 == 0.0


# 19. Speed and fixed buffer calculations
def test_speed_and_fixed_buffer_calculations():
    # Electric bus has 480s (8 min) waiting buffer
    bus_dyn = TRANSPORT_DYNAMICS["electric_bus"]
    dist_m = 5000.0
    expected_dur = int(dist_m / bus_dyn["speed_mps"]) + bus_dyn["fixed_buffer_sec"]

    opts = evaluate_segment_transport_options(
        distance_meters=dist_m,
        is_intercity=False,
    )
    bus_opt = next(o for o in opts if o.mode == "electric_bus")
    assert bus_opt.duration_seconds == expected_dur


# 20. Tool registry integrity & no hallucinated booking claims
def test_no_hallucinated_booking_in_tool_output():
    registry = get_default_tool_registry()
    assert "recommend_transport_mode" in registry.list_tools()
    assert "get_route_information" in registry.list_tools()

    inp = RecommendTransportModeInput(
        origin_lat=16.0611,
        origin_lng=108.2270,
        dest_lat=16.4699,
        dest_lng=107.5779,
    )
    out = recommend_transport_mode(inp)
    # The output must strictly be recommendation / estimation, not fake booking
    assert "đã thanh toán" not in out.recommendation_summary.lower()
    assert "đã đặt vé thành công" not in out.recommendation_summary.lower()
    assert "đề xuất" in out.recommendation_summary.lower() or "tối ưu" in out.recommendation_summary.lower()


# 21. Fastest priority profile & endpoint support
def test_fastest_priority_profile_supported():
    opts = evaluate_segment_transport_options(
        distance_meters=6000.0,
        is_intercity=False,
        profile="fastest",
    )
    best = next(o for o in opts if o.recommendation_type == "best_match")
    assert best.mode in ("motorcycle", "taxi_car")

    res = client.get("/itineraries/sample-danang-hue-3d/days/1/route?profile=fastest")
    assert res.status_code == 200
    assert res.json()["priority_profile"] == "fastest"
