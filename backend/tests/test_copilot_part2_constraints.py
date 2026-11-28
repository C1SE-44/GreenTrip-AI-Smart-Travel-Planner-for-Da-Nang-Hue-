"""Tests for AI 6-Layer Architecture Part 2: Backend Copilot quantitative constraints."""
import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app
from app.trips.itinerary_constraints import (
    check_opening_hours,
    enforce_budget_constraint,
    optimize_outline_routes_and_co2,
)
from app.trips.schemas import TripContextPayload


def test_check_opening_hours_variants() -> None:
    assert check_opening_hours({"is_temporarily_closed": True}, (540, 660), "2026-11-16")["status"] == "closed"

    weekday_oh = {
        "weekday_text": [
            "Thứ Hai: Đóng cửa",
            "Thứ Tư: 08:00 – 17:00",
        ]
    }
    # 2026-11-16 is Monday; 2026-11-18 is Wednesday
    assert check_opening_hours(weekday_oh, (540, 660), "2026-11-16")["status"] == "closed"
    assert check_opening_hours(weekday_oh, (540, 660), "2026-11-18")["status"] == "ok"
    assert check_opening_hours(weekday_oh, (1140, 1260), "2026-11-18")["status"] == "outside_hours"

    assert check_opening_hours({"status_text": "Mở cửa cả ngày"}, (480, 600), "2026-11-16")["status"] == "ok"


def test_anti_zigzag_and_co2_modes() -> None:
    outline = [
        {
            "day": 1,
            "focus_city": "Đà Nẵng",
            "stops": [
                {"id": "s1", "title": "Bảo tàng Điêu khắc Chăm", "timeSlot": "08:00 - 09:30", "latitude": 16.0604, "longitude": 108.2233},
                {"id": "s2", "title": "Danh thắng Ngũ Hành Sơn", "timeSlot": "10:00 - 11:30", "latitude": 16.0038, "longitude": 108.2631},
                {"id": "rest1", "title": "Nghỉ trưa", "stop_type": "rest", "timeSlot": "12:00 - 13:30"},
                {"id": "s3", "title": "Chùa Linh Ứng Sơn Trà", "timeSlot": "14:00 - 15:30", "latitude": 16.0996, "longitude": 108.2775},
                {"id": "s4", "title": "Cầu Rồng", "timeSlot": "16:00 - 17:00", "latitude": 16.0611, "longitude": 108.2275},
            ],
        }
    ]
    ctx_transit = TripContextPayload(destination="Đà Nẵng", days_count=1, transport_mode="transit")
    metrics = optimize_outline_routes_and_co2([dict(outline[0], stops=[dict(s) for s in outline[0]["stops"]])], ctx_transit)

    assert metrics["saved_km"] > 0
    assert metrics["after_km"] < metrics["before_km"]
    assert metrics["reordered_days"] == [1]
    assert metrics["co2_grams"] == round(metrics["after_km"] * 42)  # Updated: transit 42 g/km (BUG-01)
    assert metrics["saved_vs_car_percent"] > 70

    ctx_walk = TripContextPayload(destination="Đà Nẵng", days_count=1, transport_mode="walking")
    walk_metrics = optimize_outline_routes_and_co2([dict(outline[0], stops=[dict(s) for s in outline[0]["stops"]])], ctx_walk)
    assert walk_metrics["co2_grams"] == 0


def test_enforce_budget_constraint_auto_substitutes_to_fit_b_max() -> None:
    outline = [
        {
            "day": 1,
            "focus_city": "Đà Nẵng",
            "stops": [
                {"id": "a1", "title": "Điểm tham quan cao cấp", "category": "Di tích lịch sử và văn hóa", "city": "Đà Nẵng", "estimated_cost": 900_000},
                {"id": "a2", "title": "Bữa trưa đặc sản", "category": "Ẩm thực và quán ăn", "city": "Đà Nẵng", "estimated_cost": 450_000},
            ],
        }
    ]
    ctx = TripContextPayload(destination="Đà Nẵng", days_count=1, num_people=2, total_budget=600_000)
    status = enforce_budget_constraint(outline, ctx, constraints=[])

    assert status["max_budget"] == 600_000
    assert len(status["adjusted_stops"]) >= 1
    assert status["total_estimated_cost"] <= 600_000
    assert status["within_budget"] is True


def test_copilot_chat_endpoint_returns_part2_quantitative_fields() -> None:
    with TestClient(app) as client:
        resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Chia 2 đêm Đà Nẵng, 1 đêm Huế nhé",
                "trip_context": {
                    "destination": "Đà Nẵng & Huế",
                    "days_count": 3,
                    "current_day": 1,
                    "start_date": "2026-11-16",
                    "total_budget": 1_500_000,
                    "num_people": 2,
                    "transport_mode": "transit",
                },
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["budget_status"] is not None
        assert data["route_metrics"] is not None
        assert data["route_metrics"]["transport_mode"] == "transit"
        assert data["budget_impact_summary"]
        assert data["green_impact_summary"]
        assert "Quantitative Solver (Part 2)" in (data["reasoning_trace"] or "")

        # Verify suggested_pois carry opening_hours_status when querying POI recommendations
        poi_resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": "gợi ý quán cafe yên tĩnh ở Đà Nẵng",
                "trip_context": {
                    "destination": "Đà Nẵng",
                    "days_count": 2,
                    "current_day": 1,
                    "current_slot": "afternoon",
                    "start_date": "2026-11-16",
                },
            },
        )
        assert poi_resp.status_code == 200, poi_resp.text
        pois = poi_resp.json()["suggested_pois"]
        assert len(pois) > 0
        assert all("opening_hours_status" in p for p in pois)


def test_compute_fatigue_score_formula_and_edge_cases() -> None:
    from app.trips.itinerary_constraints import compute_fatigue_score

    # Empty and rest-only days should never trigger fatigue
    empty_res = compute_fatigue_score([])
    assert empty_res["active_count"] == 0
    assert empty_res["duration_hours"] == 0.0
    assert empty_res["outdoor_count"] == 0
    assert empty_res["fatigue_score"] == 0.0
    assert empty_res["needs_rest"] is False

    rest_only_res = compute_fatigue_score([
        {"id": "r1", "title": "Nghỉ trưa", "stop_type": "rest", "duration_minutes": 90},
    ])
    assert rest_only_res["active_count"] == 0
    assert rest_only_res["duration_hours"] == 0.0
    assert rest_only_res["outdoor_count"] == 0
    assert rest_only_res["fatigue_score"] == 0.0
    assert rest_only_res["needs_rest"] is False

    # Light indoor day: 2 indoor stops * 90 mins = 3.0h, 0 outdoor -> 3.0
    light_res = compute_fatigue_score([
        {"id": "i1", "title": "Bảo tàng Điêu khắc Chăm", "category": "Di tích lịch sử và văn hóa", "duration_minutes": 90},
        {"id": "i2", "title": "Quán cà phê yên tĩnh", "category": "Quán cafe", "duration_minutes": 90},
    ])
    assert light_res["active_count"] == 2
    assert light_res["duration_hours"] == 3.0
    assert light_res["outdoor_count"] == 0
    assert light_res["fatigue_score"] == 3.0
    assert light_res["needs_rest"] is False

    # Trigger via active_count >= 4 even when fatigue_score < 6.0
    many_stops_res = compute_fatigue_score([
        {"id": "m1", "title": "Bảo tàng A", "category": "Di tích lịch sử và văn hóa", "duration_minutes": 60},
        {"id": "m2", "title": "Quán ăn B", "category": "Ẩm thực và quán ăn", "duration_minutes": 60},
        {"id": "m3", "title": "Quán cafe C", "category": "Quán cafe", "duration_minutes": 60},
        {"id": "m4", "title": "Bảo tàng D", "category": "Di tích lịch sử và văn hóa", "duration_minutes": 60},
    ])
    assert many_stops_res["active_count"] == 4
    assert many_stops_res["duration_hours"] == 4.0
    assert many_stops_res["fatigue_score"] == 4.0
    assert many_stops_res["needs_rest"] is True

    # Trigger via fatigue_score >= 6.0 with fewer than 4 stops (5.0h + 0.5 * 3 outdoor = 6.5)
    outdoor_heavy_res = compute_fatigue_score([
        {"id": "o1", "title": "Bãi biển Mỹ Khê", "category": "Thiên nhiên và cảnh quan", "duration_minutes": 100},
        {"id": "o2", "title": "Danh thắng Ngũ Hành Sơn", "category": "Thiên nhiên và cảnh quan", "duration_minutes": 100},
        {"id": "o3", "title": "Bán đảo Sơn Trà", "category": "Thiên nhiên và cảnh quan", "duration_minutes": 100},
    ])
    assert outdoor_heavy_res["active_count"] == 3
    assert outdoor_heavy_res["duration_hours"] == 5.0
    assert outdoor_heavy_res["outdoor_count"] == 3
    assert outdoor_heavy_res["fatigue_score"] == 6.5
    assert outdoor_heavy_res["needs_rest"] is True

    # Below boundary: 4.5h + 0.5 * 2 outdoor = 5.5 < 6.0 and active_count == 3 < 4
    boundary_res = compute_fatigue_score([
        {"id": "b1", "title": "Bãi biển Non Nước", "category": "Thiên nhiên và cảnh quan", "timeSlot": "08:00 - 09:30"},
        {"id": "b2", "title": "Công viên Châu Á", "category": "Thiên nhiên và cảnh quan", "timeSlot": "10:00 - 11:30"},
        {"id": "b3", "title": "Bảo tàng Đà Nẵng", "category": "Di tích lịch sử và văn hóa", "timeSlot": "14:00 - 15:30"},
    ])
    assert boundary_res["active_count"] == 3
    assert boundary_res["outdoor_count"] == 2
    assert boundary_res["fatigue_score"] == 5.5
    assert boundary_res["needs_rest"] is False


def test_enforce_fatigue_rest_blocks_inserts_rest_and_is_idempotent() -> None:
    from app.trips.itinerary_constraints import enforce_fatigue_rest_blocks

    outline = [
        {
            "day": 1,
            "focus_city": "Đà Nẵng",
            "stops": [
                {"id": "s1", "title": "Bãi biển Mỹ Khê", "category": "Thiên nhiên và cảnh quan", "timeSlot": "08:00 - 09:30", "duration_minutes": 90},
                {"id": "s2", "title": "Danh thắng Ngũ Hành Sơn", "category": "Thiên nhiên và cảnh quan", "timeSlot": "09:45 - 11:15", "duration_minutes": 90},
                {"id": "s3", "title": "Bảo tàng Điêu khắc Chăm", "category": "Di tích lịch sử và văn hóa", "timeSlot": "13:30 - 15:00", "duration_minutes": 90},
                {"id": "s4", "title": "Cầu Rồng", "category": "Thiên nhiên và cảnh quan", "timeSlot": "15:15 - 16:45", "duration_minutes": 90},
            ],
        },
        {
            "day": 2,
            "focus_city": "Đà Nẵng",
            "stops": [
                {"id": "s5", "title": "Bảo tàng Đà Nẵng", "category": "Di tích lịch sử và văn hóa", "timeSlot": "09:00 - 10:30", "duration_minutes": 90},
                {"id": "s6", "title": "Quán cà phê yên tĩnh", "category": "Quán cafe", "timeSlot": "14:00 - 15:30", "duration_minutes": 90},
            ],
        },
    ]

    metrics = enforce_fatigue_rest_blocks(outline)
    assert isinstance(metrics, list)
    assert len(metrics) == 2

    day1_metric = metrics[0]
    assert day1_metric["active_count"] == 4
    assert day1_metric["needs_rest"] is True
    assert any(s.get("stop_type") == "rest" for s in outline[0]["stops"])

    day2_metric = metrics[1]
    assert day2_metric["active_count"] == 2
    assert day2_metric["needs_rest"] is False
    assert not any(s.get("stop_type") == "rest" for s in outline[1]["stops"])

    # Idempotency: re-running must not duplicate rest blocks on day 1
    rest_count_after_first = sum(1 for s in outline[0]["stops"] if s.get("stop_type") == "rest")
    enforce_fatigue_rest_blocks(outline)
    rest_count_after_second = sum(1 for s in outline[0]["stops"] if s.get("stop_type") == "rest")
    assert rest_count_after_first == 1
    assert rest_count_after_second == 1


def test_copilot_chat_endpoint_populates_fatigue_metrics() -> None:
    with TestClient(app) as client:
        mutate_resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Chia 2 đêm Đà Nẵng, 1 đêm Huế nhé",
                "trip_context": {
                    "destination": "Đà Nẵng & Huế",
                    "days_count": 3,
                    "current_day": 1,
                    "start_date": "2026-11-16",
                    "total_budget": 1_500_000,
                    "num_people": 2,
                    "transport_mode": "transit",
                },
            },
        )
        assert mutate_resp.status_code == 200, mutate_resp.text
        mutate_data = mutate_resp.json()
        assert mutate_data["updated_itinerary_state"] is not None
        assert isinstance(mutate_data["fatigue_metrics"], list)
        assert len(mutate_data["fatigue_metrics"]) == len(mutate_data["updated_itinerary_state"])
        for m in mutate_data["fatigue_metrics"]:
            for key in ("active_count", "duration_hours", "outdoor_count", "fatigue_score", "needs_rest"):
                assert key in m

        poi_resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": "gợi ý quán cafe yên tĩnh ở Đà Nẵng",
                "trip_context": {
                    "destination": "Đà Nẵng",
                    "days_count": 2,
                    "current_day": 1,
                    "current_slot": "afternoon",
                    "start_date": "2026-11-16",
                },
            },
        )
        assert poi_resp.status_code == 200, poi_resp.text
        poi_data = poi_resp.json()
        assert poi_data["updated_itinerary_state"] is None
        assert poi_data["fatigue_metrics"] is None


def test_sync_stop_times_after_reorder_dense_day_no_collisions() -> None:
    from app.trips.itinerary_constraints import _extract_time_window_from_stop

    # Dense 6-stop day with 180-min visits & zig-zag coords that trigger reorder
    outline = [
        {
            "day": 1,
            "focus_city": "Đà Nẵng",
            "stops": [
                {"id": "d1", "title": "Điểm 1", "timeSlot": "08:00 - 11:00", "duration_minutes": 180, "latitude": 16.0604, "longitude": 108.2233},
                {"id": "d2", "title": "Điểm 2", "timeSlot": "11:15 - 14:15", "duration_minutes": 180, "latitude": 16.0038, "longitude": 108.2631},
                {"id": "d3", "title": "Điểm 3", "timeSlot": "14:30 - 17:30", "duration_minutes": 180, "latitude": 16.0996, "longitude": 108.2775},
                {"id": "d4", "title": "Điểm 4", "timeSlot": "17:45 - 20:45", "duration_minutes": 180, "latitude": 16.0611, "longitude": 108.2275},
                {"id": "d5", "title": "Điểm 5", "timeSlot": "20:50 - 21:50", "duration_minutes": 180, "latitude": 16.0678, "longitude": 108.2208},
                {"id": "d6", "title": "Điểm 6", "timeSlot": "21:55 - 22:55", "duration_minutes": 180, "latitude": 16.0772, "longitude": 108.2225},
            ],
        }
    ]
    ctx = TripContextPayload(destination="Đà Nẵng", days_count=1, transport_mode="motorcycle")
    metrics = optimize_outline_routes_and_co2(outline, ctx)
    assert metrics["reordered_days"] == [1]

    timed = [w for w in (_extract_time_window_from_stop(s) for s in outline[0]["stops"]) if w is not None]
    assert len(timed) >= 4
    for prev_w, next_w in zip(timed, timed[1:]):
        assert next_w[0] >= prev_w[1], f"Time collision after reorder: {prev_w} vs {next_w}"
    # Overflow stops beyond 22:00 must have cleared times instead of clamping onto 21:30 - 23:00
    assert len(timed) < len(outline[0]["stops"])


def test_copilot_eco_uncrowded_query_avoids_generic_greeting() -> None:
    with TestClient(app) as client:
        resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Gợi ý trải nghiệm du lịch xanh ít đông đúc ở miền Trung?",
                "trip_context": {
                    "mode": "ideation",
                    "destination": "Đà Nẵng & Huế",
                    "days_count": 3,
                },
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "mình đã sẵn sàng hỗ trợ điều chỉnh lịch trình" not in data["reply_text"].lower()
        assert "du lịch xanh" in data["reply_text"].lower() or "sinh thái" in data["reply_text"].lower()
        assert len(data["suggested_pois"]) >= 1


def test_bana_wax_museum_coords_and_rainy_day_urban_guard() -> None:
    from app.trips.itinerary_constraints import _load_poi_reference_index, _lookup_poi_reference

    _load_poi_reference_index.cache_clear()
    wax = _lookup_poi_reference(name="Bảo Tàng Tượng Sáp Bà Nà Hills")
    assert wax is not None
    assert wax["lat"] < 16.01 and wax["lng"] < 108.02

    with TestClient(app) as client:
        resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Trời mưa rồi gợi ý điểm trong nhà ở Đà Nẵng",
                "trip_context": {
                    "destination": "Đà Nẵng",
                    "current_day": 1,
                    "current_stop_name": "Cầu Rồng",
                },
            },
        )
        assert resp.status_code == 200, resp.text
        names_addrs = " ".join(
            f"{p.get('name', '')} {p.get('address', '')}".lower()
            for p in resp.json().get("suggested_pois", [])
        )
        assert "bà nà" not in names_addrs and "hòa vang" not in names_addrs


def test_vegetarian_outline_uses_real_vegan_restaurants() -> None:
    from app.trips.copilot_consultant import _ensure_editable_outline

    ctx = TripContextPayload(destination="Đà Nẵng & Huế", days_count=3)
    outline = _ensure_editable_outline(ctx, constraints=["vegetarian"])
    meal_names = [
        stop["name"].lower()
        for day in outline
        for stop in day["stops"]
        if stop.get("category") == "quan-an"
    ]
    assert len(meal_names) == 3
    assert all(any(k in n for k in ("vegetarian", "vegan", "chay")) for n in meal_names)
