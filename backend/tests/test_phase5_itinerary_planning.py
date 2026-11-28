from datetime import datetime

import pytest
from pydantic import ValidationError

from app.assistant import planning
from app.assistant.schemas import Context


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(
        planning,
        "now_vn",
        lambda: datetime(2026, 11, 16, 8, tzinfo=planning.VN),
    )


def point(poi_id, *, city="Huế", city_id="hue", lat=16.46, lng=107.58, duration=45, hours=None, active=True):
    return {
        "id": poi_id,
        "name": f"POI {poi_id}",
        "city": city,
        "city_id": city_id,
        "latitude": lat,
        "longitude": lng,
        "average_visit_minutes": duration,
        "opening_hours": hours or {},
        "is_active": active,
        "status": "ACTIVE" if active else "INACTIVE",
        "estimated_cost": None,
        "ai_metadata": {},
    }


def itinerary(days=1, start_date="2026-11-20", destination="Huế"):
    return planning.empty_itinerary(
        "phase5-test",
        Context(days_count=days, start_date=start_date, destination=destination),
    )


def scheduled_ids(plan):
    return [
        str(stop["poi_id"])
        for day in plan["days"]
        for stop in day["stops"]
        if stop.get("poi_id")
    ]


def test_four_nearby_pois_fit_one_day_without_a_fixed_five_stop_limit():
    places = [point(str(index), lat=16.46 + index * 0.0001) for index in range(4)]
    plan, _ = planning.create_plan(itinerary(), places)
    assert set(scheduled_ids(plan)) == {str(index) for index in range(4)}


def test_duplicate_and_empty_selected_id_sets_are_safe():
    place = point("same")
    plan, _ = planning.create_plan(itinerary(), [place, dict(place)])
    assert scheduled_ids(plan) == ["same"]
    empty, _ = planning.create_plan(itinerary(), [])
    assert not scheduled_ids(empty)


@pytest.mark.parametrize("count,days,duration", [(8, 2, 45), (12, 2, 60), (20, 4, 45)])
def test_multi_day_scheduler_preserves_every_selected_id(count, days, duration):
    places = [point(str(index), lat=16.46 + index * 0.0001, duration=duration) for index in range(count)]
    details = {}
    plan, _ = planning.create_plan(itinerary(days=days), places, details=details)
    placed = scheduled_ids(plan)
    unscheduled = {item["poi_id"] for item in details["unscheduled"]}
    assert len(placed) == len(set(placed))
    assert set(placed).issubset({str(index) for index in range(count)})
    assert set(placed).isdisjoint(unscheduled)
    assert set(placed) | unscheduled == {str(index) for index in range(count)}


def test_over_capacity_pois_are_returned_as_unscheduled_with_reasons():
    places = [point(str(index), duration=120, lat=16.46 + index * 0.005) for index in range(12)]
    details = {}
    plan, warnings = planning.create_plan(itinerary(days=2), places, details=details)
    placed = set(scheduled_ids(plan))
    unscheduled = {item["poi_id"]: item for item in details["unscheduled"]}
    assert placed.isdisjoint(unscheduled)
    assert placed | set(unscheduled) == {str(index) for index in range(12)}
    assert all(item["reasons"] and isinstance(item["attempted_days"], list) for item in unscheduled.values())
    assert any("POI đã chọn chưa xếp được" in warning for warning in warnings)


def test_in_trip_rescheduling_uses_explicit_progress_and_keeps_visited_stops():
    before = itinerary(days=1, start_date="2026-11-16")
    before["days"][0]["stops"] = [
        {"stop_id": "visited-stop", "poi_id": "visited", "title": "Visited", "city": "Huế", "stop_type": "poi", "source": "assistant", "sequence": 0, "duration_minutes": 60, "start_time": "07:00", "end_time": "08:00"},
        {"stop_id": "pending-stop", "poi_id": "pending", "title": "Pending", "city": "Huế", "stop_type": "poi", "source": "assistant", "sequence": 1, "duration_minutes": 45, "start_time": "07:15", "end_time": "08:00"},
    ]
    details = {}
    plan, _ = planning.create_plan(
        before,
        [point("pending")],
        ignore_elapsed_clock=True,
        protected_stop_ids={"visited-stop"},
        details=details,
    )
    stops = plan["days"][0]["stops"]
    visited = next(stop for stop in stops if stop.get("poi_id") == "visited")
    pending = [stop for stop in stops if stop.get("poi_id") == "pending"]
    assert visited["stop_id"] == "visited-stop"
    assert visited["start_time"] == "07:00" and visited["end_time"] == "08:00"
    assert len(pending) == 1
    assert pending[0]["start_time"] >= "09:00"
    assert set(details["scheduled_ids"]) == {"pending", "visited"}


def test_in_trip_postpone_respects_requested_minimum_day_without_duplicate_stop():
    before = itinerary(days=2, start_date="2026-11-16")
    before["days"][0]["stops"] = [
        {"stop_id": "to-move", "poi_id": "target", "title": "Target", "city": "Huế", "stop_type": "poi", "source": "assistant", "sequence": 0, "duration_minutes": 45, "start_time": "09:00", "end_time": "09:45"},
    ]
    details = {}
    plan, _ = planning.create_plan(
        before,
        [point("target")],
        ignore_elapsed_clock=True,
        minimum_day_by_poi={"target": 2},
        details=details,
    )
    scheduled = [(day["day_number"], stop) for day in plan["days"] for stop in day["stops"] if stop.get("poi_id") == "target"]
    assert len(scheduled) == 1
    assert scheduled[0][0] == 2
    assert details["scheduled_ids"] == ["target"]


def test_city_groups_stay_contiguous_and_intercity_time_is_not_invented():
    places = [
        point("h1", city="Huế", city_id="hue", lat=16.46),
        point("d1", city="Đà Nẵng", city_id="danang", lat=16.05),
        point("h2", city="Huế", city_id="hue", lat=16.461),
        point("d2", city="Đà Nẵng", city_id="danang", lat=16.051),
    ]
    plan, warnings = planning.create_plan(
        itinerary(days=2, destination="Đà Nẵng & Huế"), places
    )
    city_groups = []
    for day in plan["days"]:
        cities = {stop["city"] for stop in day["stops"] if stop.get("poi_id")}
        assert len(cities) <= 1
        city_groups.extend(cities)
    assert len(city_groups) <= 2
    assert any("chuyển thành phố" in warning for warning in warnings)
    seen = set()
    previous = None
    for city in city_groups:
        if city != previous:
            assert city not in seen
            seen.add(city)
        previous = city


def test_missing_coordinates_and_duration_are_labeled_assumptions():
    places = [point("a", lat=None, lng=None, duration=None), point("b", lat=None, lng=None)]
    details = {}
    plan, warnings = planning.create_plan(itinerary(), places, details=details)
    stops = [stop for day in plan["days"] for stop in day["stops"] if stop.get("poi_id")]
    assert len(stops) == 2
    assert any("Chưa có số liệu" in stop["comment"] or "tạm tính 60 phút" in stop["comment"] for stop in stops)
    assert details["unknown_route_legs"] >= 1
    assert any("ESTIMATED_HEURISTIC" in warning for warning in warnings)


def test_opening_hours_can_defer_a_closed_weekday_to_the_next_day():
    hours = {"weekday_text": ["Monday: Closed", "Tuesday: 09:00–12:00"]}
    plan, _ = planning.create_plan(
        itinerary(days=2, start_date="2026-11-23"),
        [point("limited", duration=90, hours=hours)],
    )
    day_numbers = [day["day_number"] for day in plan["days"] if any(stop.get("poi_id") for stop in day["stops"])]
    assert day_numbers == [2]


def test_google_periods_open_time_is_matched_to_local_weekday():
    hours = {
        "periods": [
            {"open": {"day": 5, "time": "0800"}, "close": {"day": 5, "time": "1100"}}
        ]
    }
    plan, _ = planning.create_plan(
        itinerary(days=1, start_date="2026-11-20"),
        [point("morning", duration=120, hours=hours)],
    )
    stop = next(stop for day in plan["days"] for stop in day["stops"] if stop.get("poi_id"))
    assert stop["start_time"] == "09:00" and stop["end_time"] == "11:00"


def test_malformed_opening_hours_remain_unknown_and_flexible_dates_work():
    flexible = itinerary(days=1, start_date=None)
    plan, warnings = planning.create_plan(
        flexible,
        [point("unknown", hours={"weekday_text": ["Monday: maybe open"]})],
    )
    assert plan["days"][0]["date"] is None
    assert scheduled_ids(plan) == ["unknown"]
    assert any("flexible" in warning.lower() or "ngày linh hoạt" in warning.lower() for warning in warnings)


def test_custom_activity_window_and_breaks_are_reflected_as_stops():
    places = [point(str(index), duration=60, lat=16.46 + index * 0.0001) for index in range(4)]
    plan, _ = planning.create_plan(
        itinerary(), places, day_start="13:00", day_end="20:00"
    )
    poi_stops = [stop for day in plan["days"] for stop in day["stops"] if stop.get("poi_id")]
    assert all(stop["start_time"] >= "13:00" for stop in poi_stops)
    assert any(stop.get("title") == "Nghỉ ngắn" for day in plan["days"] for stop in day["stops"])


def test_flexible_date_mode_ignores_stale_exact_dates_and_validates_window():
    flexible = Context(
        destination="Huế", days_count=2, date_mode="flex",
        start_date="2026-11-20", end_date="2026-11-21",
        activity_start_time="08:30", activity_end_time="18:00",
    )
    assert flexible.start_date is None and flexible.end_date is None
    with pytest.raises(ValidationError):
        Context(
            destination="Huế", days_count=2, start_date="2026-11-20",
            end_date="2026-11-23", date_mode="dates",
        )
    with pytest.raises(ValidationError):
        Context(destination="Huế", activity_start_time="18:00", activity_end_time="08:00")


def test_inactive_poi_is_retained_as_unscheduled_not_silently_dropped():
    details = {}
    plan, _ = planning.create_plan(itinerary(), [point("closed", active=False)], details=details)
    assert not scheduled_ids(plan)
    assert details["unscheduled"] == [{
        "poi_id": "closed",
        "name": "POI closed",
        "reasons": ["POI_INACTIVE"],
        "attempted_days": [],
    }]


def test_alternatives_are_limited_to_two_and_require_real_opening_tradeoff():
    no_windows = [point("a"), point("b", lat=16.461)]
    assert len(planning.build_alternatives(itinerary(), no_windows)) == 1

    restricted = {"weekday_text": ["Friday: 09:00–11:00"]}
    flexible = {"weekday_text": ["Friday: 09:00–17:00"]}
    places = [
        point("wide", hours=flexible, lat=16.46),
        point("narrow", hours=restricted, lat=16.47),
    ]
    alternatives = planning.build_alternatives(itinerary(), places)
    assert 1 <= len(alternatives) <= 2
    assert all(set(alt["selected_poi_ids"]) == {"wide", "narrow"} for alt in alternatives)
    if len(alternatives) == 2:
        assert alternatives[0]["id"] != alternatives[1]["id"]
        assert alternatives[0]["scheduled_poi_ids"] == alternatives[1]["scheduled_poi_ids"]
        schedules = {
            alternative["id"]: [
                stop["poi_id"]
                for day in alternative["itinerary"]["days"]
                for stop in day["stops"]
                if stop.get("poi_id")
            ]
            for alternative in alternatives
        }
        assert schedules["nearby"] != schedules["opening_hours"]

