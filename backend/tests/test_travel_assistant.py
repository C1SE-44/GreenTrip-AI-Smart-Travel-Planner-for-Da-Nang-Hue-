from copy import deepcopy
from datetime import datetime
from pathlib import Path
import sqlite3
import sys
from unittest.mock import Mock
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.assistant import service, store, search, planning, nlu
from app.assistant.schemas import ChatRequest, Context, ApplyRequest
from app.assistant.router import router
from app.auth.dependencies import get_current_user_id


def point(
    id,
    name,
    city="Hue",
    category="Quán cafe giải khát",
    lat=16.46,
    lng=107.58,
    price="30.000–60.000 ₫ / ly",
    duration=60,
):
    return {
        "id": id,
        "name": name,
        "city": city,
        "category": category,
        "latitude": lat,
        "longitude": lng,
        "description": "Không gian yên tĩnh gần gũi văn hóa địa phương.",
        "estimated_cost": 40000,
        "green_score": 0.8,
        "satisfaction_score": 4.5,
        "is_active": True,
        "is_local_business": True,
        "popularity_score": 1,
        "average_visit_minutes": duration,
        "opening_hours": {},
        "budget_tier": "$",
        "vibes": ["quiet"],
        "ai_metadata": {"price_range_display": price},
        "image_url": "/test.jpg",
    }


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setattr(store, "PATH", tmp_path / "sessions.db")
    points = [
        point("a", "Cà phê A"),
        point("b", "Cà phê B", lat=16.465),
        point("c", "Bảo tàng C", category="Di tích lịch sử và văn hóa"),
        point("d", "Cà phê Đà Nẵng", "Da Nang", lat=16.05, lng=108.2),
        point("e", "Cà phê chưa rõ giá", price="Từ 40.000 ₫ / ly"),
        point("anchor", "Chùa Báo Quốc", category="Tâm linh & Tôn giáo"),
    ]

    def catalog(city=None, ids=None):
        return deepcopy(
            [
                p
                for p in points
                if (ids is None or p["id"] in ids)
                and (
                    not city
                    or search.fold(city).replace(" ", "")
                    == search.fold(p["city"]).replace(" ", "")
                )
            ]
        )

    monkeypatch.setattr(search, "catalogue", catalog)
    monkeypatch.setattr(service, "catalogue", catalog)
    monkeypatch.setattr(service, "owned_itinerary", lambda trip, user: None)
    monkeypatch.setattr(service, "extract", lambda message, **kwargs: {})
    monkeypatch.setattr(
        planning, "now_vn", lambda: datetime(2026, 11, 16, 8, tzinfo=planning.VN)
    )
    return points


def req(message, mode="planner", trip="own-trip", **context):
    return ChatRequest(
        message=message,
        mode=mode,
        trip_id=trip,
        context=Context(
            destination="Huế", start_date="2026-11-20", title="Huế của tôi", **context
        ),
    )


def test_greeting_is_short_and_never_fetches_places(env, monkeypatch):
    fetch = Mock(side_effect=AssertionError("Greeting must not query catalogue"))
    monkeypatch.setattr(service, "catalogue", fetch)
    response = service.process(req("helo"), "alice")
    assert (
        len(response["text"]) < 230
        and not response["pois"]
        and len(response["prompts"]) == 3
    )
    fetch.assert_not_called()


def test_greeting_with_request_searches_explicit_city_even_if_trip_differs(env):
    response = service.process(req("Hi, tìm cà phê Đà Nẵng dưới 100k"), "alice")
    assert response["pois"] and all(p["city"] == "Đà Nẵng" for p in response["pois"])
    assert "Cà phê Đà Nẵng" in response["text"]


def test_city_and_category_are_hard_filters_before_ranking(env):
    response = service.process(req("cà phê ở Huế dưới 100k"), "alice")
    assert all(p["city"] == "Huế" and "Cà phê" in p["name"] for p in response["pois"])
    assert "e" not in [p["id"] for p in response["pois"]]
    assert any(p["id"] == "e" for p in response["unknown_price_pois"])
    museums = service.process(req("bảo tàng ở Huế"), "alice")
    assert [p["id"] for p in museums["pois"]] == ["c"]


def test_ordinal_survives_history_reload_and_reports_saved_only_after_persist(env):
    response = service.process(req("cà phê ở Huế"), "alice")
    second = response["pois"][1]["id"]
    history = service.history("alice", "own-trip", "planner")
    assert history["messages"][-1]["pois"][1]["id"] == second
    saved = service.process(req("lưu chỗ thứ hai vào Ý tưởng"), "alice")
    assert saved["idea_ids"] == [second] and saved["action"] == "ideas_saved"
    assert service.history("alice", "own-trip", "planner")["context"]["idea_ids"] == [
        second
    ]


def test_histories_are_partitioned_by_account_trip_and_mode(env):
    service.process(req("cà phê ở Huế"), "alice")
    assert not service.history("bob", "own-trip", "planner")["messages"]
    assert not service.history("alice", "different-trip", "planner")["messages"]
    assert not service.history("alice", "own-trip", "discover")["messages"]


def test_ambiguous_add_asks_destination_and_does_not_save(env):
    service.process(req("cà phê ở Huế"), "alice")
    response = service.process(req("thêm chỗ thứ hai"), "alice")
    assert "Ý tưởng hay" in response["text"] and not response.get("action")


def test_card_action_is_grounded_in_shown_ids(env):
    forged = req("lưu chỗ thứ hai vào Ý tưởng")
    forged.selected_poi_id = "unknown"
    with pytest.raises(HTTPException) as caught:
        service.process(forged, "alice")
    assert caught.value.status_code == 422


def test_cross_city_save_does_not_change_trip(env):
    service.process(req("cà phê Đà Nẵng"), "alice")
    response = service.process(req("lưu chỗ thứ nhất vào Ý tưởng"), "alice")
    assert not response.get("action") and "thành" not in response.get("action", "")
    assert "chọn đúng chuyến" in response["text"]


def test_plan_uses_saved_points_no_write_before_apply(env, monkeypatch):
    save = Mock()
    monkeypatch.setattr(service, "save_itinerary", save)
    response = service.process(
        req("Xếp lịch từ Ý tưởng", idea_ids=["a", "b", "c"]), "alice"
    )
    assert response["draft"] and response["draft"]["kind"] == "itinerary"
    ids = {
        s["poi_id"]
        for d in response["draft"]["itinerary"]["days"]
        for s in d["stops"]
        if s.get("poi_id")
    }
    assert ids == {"a", "b", "c"}
    save.assert_not_called()
    for day in response["draft"]["itinerary"]["days"]:
        for stop in day["stops"]:
            assert stop["end_time"] > stop["start_time"]


def test_apply_detects_concurrent_edits(env, monkeypatch):
    response = service.process(req("Xếp lịch từ Ý tưởng", idea_ids=["a"]), "alice")
    monkeypatch.setattr(
        service, "owned_itinerary", lambda trip, user: {"updated_at": "changed"}
    )
    with pytest.raises(HTTPException) as caught:
        service.apply(
            "alice", ApplyRequest(trip_id="own-trip", draft_id=response["draft"]["id"])
        )
    assert caught.value.status_code == 409


def test_apply_requires_current_draft_and_is_single_use(env, monkeypatch):
    response = service.process(req("Xếp lịch từ Ý tưởng", idea_ids=["a"]), "alice")
    save = Mock(side_effect=lambda payload, user, **kw: payload)
    monkeypatch.setattr(service, "save_itinerary", save)
    apply = ApplyRequest(trip_id="own-trip", draft_id=response["draft"]["id"])
    assert service.apply("alice", apply)["action"] == "itinerary_saved"
    save.assert_called_once()
    assert save.call_args.kwargs["expected_updated_at"] == "__missing__"
    assert (
        service.history("alice", "own-trip", "planner")["messages"][-1]["action"]
        == "itinerary_saved"
    )
    with pytest.raises(HTTPException):
        service.apply("alice", apply)


def test_lightening_day_two_preserves_day_one(env, monkeypatch):
    before = planning.empty_itinerary("own-trip", req("x").context)
    before["days"][0]["stops"] = [
        {
            "stop_id": "keep",
            "poi_id": "c",
            "title": "Giữ nguyên",
            "stop_type": "poi",
            "source": "manual",
            "sequence": 0,
            "start_time": "09:00",
            "end_time": "10:00",
        }
    ]
    before["days"][1]["stops"] = [
        {"stop_id": "a", "poi_id": "a"},
        {"stop_id": "b", "poi_id": "b"},
        {"stop_id": "c", "poi_id": "c"},
    ]
    monkeypatch.setattr(service, "owned_itinerary", lambda trip, user: deepcopy(before))
    response = service.process(req("Ngày 2 nhẹ hơn", idea_ids=["a", "b", "c"]), "alice")
    plan = response["draft"]["itinerary"]
    assert plan["days"][0] == before["days"][0]
    assert len([s for s in plan["days"][1]["stops"] if s.get("poi_id")]) <= 2
    assert any("chưa xếp" in warning for warning in response["draft"]["warnings"])


def test_past_days_and_already_started_stops_are_immutable(env):
    before = planning.empty_itinerary(
        "own-trip", Context(destination="Huế", start_date="2026-11-15")
    )
    after = deepcopy(before)
    after["days"][0]["title"] = "Sửa quá khứ"
    with pytest.raises(HTTPException):
        planning.validate_past(before, after)


def test_missing_date_asks_before_planning(env):
    response = service.process(
        ChatRequest(
            message="Xếp lịch từ Ý tưởng",
            trip_id="own-trip",
            context=Context(destination="Huế", idea_ids=["a"]),
        ),
        "alice",
    )
    assert not response["draft"] and "ngày khởi hành" in response["text"]


def test_radius_strict_does_not_relax_and_unknown_anchor_asks(env):
    unknown = service.process(req("cà phê gần đây chỉ trong 1 km"), "alice")
    assert "một mốc" in unknown["text"] and not unknown["pois"]
    env[-1]["latitude"] = 16.47
    result = service.process(req("cà phê gần Chùa Báo Quốc chỉ trong 0.1 km"), "alice")
    assert not result["pois"] and not result["text"].startswith("**Gợi ý trong 3")


@pytest.mark.parametrize(
    "message,category",
    [
        ("cf hue", "cafe"),
        ("đi lễ Huế", "spiritual"),
        ("nhà thờ Đà Nẵng", "church"),
        ("bảo tàng Huế", "museum"),
    ],
)
def test_category_aliases(message, category):
    assert search.criteria(message)["category"] == category


def test_uncertain_and_per_item_prices_do_not_become_per_person_guarantees():
    assert search.upper_price(point("a", "Cafe"), unit="person") is None
    assert search.upper_price(point("a", "Cafe", price="Từ 40.000 ₫ / ly")) is None
    assert search.upper_price(point("a", "Cafe", price="Miễn phí")) is None
    assert search.upper_price(point("a", "Cafe")) == 60000


def test_budget_change_requires_apply(env):
    response = service.process(
        req("Lần này dùng ngân sách 3 triệu", budget=2_000_000), "alice"
    )
    assert response["draft"]["kind"] == "budget"
    assert (
        service.history("alice", "own-trip", "planner")["context"]["budget"]
        == 2_000_000
    )
    result = service.apply(
        "alice", ApplyRequest(trip_id="own-trip", draft_id=response["draft"]["id"])
    )
    assert result["budget"] == 3_000_000


def test_unknown_model_is_not_called_when_disabled(monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setattr(
        nlu, "get_settings", lambda: SimpleNamespace(ASSISTANT_AI_ENABLED=False)
    )
    post = Mock(side_effect=AssertionError("Unexpected paid/network call"))
    monkeypatch.setattr(nlu.httpx, "post", post)
    assert nlu.extract("tìm nơi yên tĩnh") == {}
    post.assert_not_called()


def test_api_requires_login_before_database_dependency():
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    for path in ["/assistant/chat", "/assistant/apply"]:
        assert (
            client.post(
                path, json={"message": "helo", "trip_id": "t", "draft_id": "d"}
            ).status_code
            == 401
        )
    assert client.get("/assistant/history").status_code == 401


def test_api_context_cannot_access_another_users_trip(env, monkeypatch):
    def denied(trip, user):
        raise HTTPException(403, "Not owned")

    monkeypatch.setattr(service, "owned_itinerary", denied)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user_id] = lambda: "alice"
    response = TestClient(app).post(
        "/assistant/chat", json=req("helo", trip="bob-trip").model_dump()
    )
    assert response.status_code == 403


def test_replan_keeps_meal_and_never_duplicates_started_or_other_days(env, monkeypatch):
    before = planning.empty_itinerary(
        "own-trip", Context(destination="Huế", start_date="2026-11-16")
    )
    locked = {
        "stop_id": "started",
        "poi_id": "a",
        "title": "Đã ghé",
        "stop_type": "poi",
        "source": "manual",
        "sequence": 0,
        "start_time": "09:00",
        "end_time": "10:00",
    }
    lunch = {
        "stop_id": "booked-lunch",
        "title": "Ăn trưa đã hẹn",
        "stop_type": "rest",
        "source": "manual",
        "sequence": 1,
        "start_time": "12:00",
        "end_time": "13:00",
    }
    before["days"][0]["stops"] = [locked, lunch]
    before["days"][1]["stops"] = [{"stop_id": "other-day", "poi_id": "c"}]
    monkeypatch.setattr(
        planning, "now_vn", lambda: datetime(2026, 11, 16, 10, 15, tzinfo=planning.VN)
    )
    plan, _ = planning.create_plan(before, env[:2], target_day=1)
    assert plan["days"][1] == before["days"][1]
    stops = plan["days"][0]["stops"]
    assert stops[0] == locked and any(s["stop_id"] == "booked-lunch" for s in stops)
    assert [s.get("poi_id") for s in stops].count("a") == 1
    assert not any(s.get("poi_id") == "c" for s in stops)
    for first, second in zip(stops, stops[1:]):
        assert first["end_time"] <= second["start_time"]


def test_dense_plan_reports_overflow_and_fast_mode_is_explicit(env):
    before = planning.empty_itinerary(
        "own-trip", Context(destination="Huế", start_date="2026-11-20", days_count=1)
    )
    points = [point(str(i), f"Điểm {i}", duration=180) for i in range(5)]
    normal, warnings = planning.create_plan(before, points)
    fast, _ = planning.create_plan(before, points, fast=True)
    normal_stops = [s for s in normal["days"][0]["stops"] if s.get("poi_id")]
    fast_stops = [s for s in fast["days"][0]["stops"] if s.get("poi_id")]
    assert normal_stops[0]["duration_minutes"] == 180
    assert fast_stops[0]["duration_minutes"] == 90 and len(fast_stops) > len(
        normal_stops
    )
    assert any("chưa xếp vừa" in warning for warning in warnings)


def test_actual_repository_compare_and_save_with_private_sqlite(
    env, monkeypatch, tmp_path
):
    from contextlib import contextmanager
    from app.db.postgres import SQLiteConnectionWrapper
    from app.trips import itinerary_repository as repository
    from app.trips.schemas import TripItinerarySyncRequest

    @contextmanager
    def connection():
        with SQLiteConnectionWrapper(sqlite3.connect(tmp_path / "itinerary.db")) as db:
            yield db

    monkeypatch.setattr(repository, "get_connection", connection)
    payload = TripItinerarySyncRequest.model_validate(
        planning.empty_itinerary("own-trip", req("x").context)
    )
    first = repository.save_itinerary(
        payload, "alice", expected_updated_at="__missing__"
    )
    revision = first.model_dump(mode="json")["updated_at"]
    second = repository.save_itinerary(
        payload.model_copy(update={"title": "Sửa ở tab khác"}),
        "alice",
        expected_updated_at=revision,
    )
    assert second.updated_at != first.updated_at
    with pytest.raises(HTTPException) as caught:
        repository.save_itinerary(payload, "alice", expected_updated_at=revision)
    assert caught.value.status_code == 409
    assert repository.get_itinerary("own-trip", "alice").title == "Sửa ở tab khác"
    with pytest.raises(HTTPException) as caught:
        repository.save_itinerary(
            payload,
            "bob",
            expected_updated_at=second.model_dump(mode="json")["updated_at"],
        )
    assert caught.value.status_code == 403


def test_explicit_city_fuzzy_anchor_and_followup_radius(env):
    response = service.process(req("cà phê gần chùa Báo Quấc chỉ trong 1 km"), "alice")
    assert response["pois"]
    followup = service.process(req("Xem trong 3 km"), "alice")
    assert followup["pois"] and all(p["city"] == "Huế" for p in followup["pois"])


def test_selected_card_from_older_message_does_not_use_new_ordinal(env):
    old = service.process(req("cà phê ở Huế"), "alice")["pois"][0]["id"]
    service.process(req("bảo tàng ở Huế"), "alice")
    request = req("Lưu chỗ thứ nhất vào Ý tưởng")
    request.selected_poi_id = old
    assert service.process(request, "alice")["idea_ids"] == [old]


def test_invalid_calendar_date_is_rejected_at_api_boundary():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Context(start_date="2026-02-30")


def test_unavailable_model_does_not_invent_places(env, monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setattr(
        nlu,
        "get_settings",
        lambda: SimpleNamespace(
            ASSISTANT_AI_ENABLED=True,
            ASSISTANT_AI_FREE_TIER_CONFIRMED=True,
            gemini_configured=True,
            ASSISTANT_AI_DAILY_LIMIT=1,
            GEMINI_API_KEY="test-only",
        ),
    )
    post = Mock(side_effect=nlu.httpx.ConnectError("offline"))
    monkeypatch.setattr(nlu.httpx, "post", post)
    assert nlu.extract("Gợi ý điểm vui") == {
        "_model_status": "unavailable",
        "_model_calls": 1,
    }
    assert (
        nlu.extract("Gợi ý điểm vui") == {"_model_status": "quota", "_model_calls": 0}
        and post.call_count == 1
    )


def test_upper_prices_handle_abbreviated_millions_without_understating():
    assert (
        search.upper_price(point("a", "Điểm A", price="1–1,5 triệu ₫/người"), "person")
        == 1_500_000
    )
    assert search.upper_price(point("a", "Điểm A", price="45–95k ₫/ly")) == 95_000


def test_budget_is_used_conservatively_before_proposing(env):
    env[0]["ai_metadata"]["price_range_display"] = "50.000–80.000 ₫/người"
    result = service.process(
        req("Xếp lịch từ Ý tưởng", idea_ids=["a"], budget=100_000, people_count=2),
        "alice",
    )
    assert result["draft"] is None and "160,000" in result["text"]
    assert "ưu tiên" in result["text"]


def test_online_apply_refuses_publicly_exposed_itinerary_tables(env, monkeypatch):
    from unittest.mock import MagicMock
    from app.trips import itinerary_repository as repository
    from app.trips.schemas import TripItinerarySyncRequest

    connection = MagicMock()
    connection.__enter__.return_value = connection
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = (False,)
    monkeypatch.setattr(repository, "get_connection", lambda: connection)
    payload = TripItinerarySyncRequest.model_validate(
        planning.empty_itinerary("own-trip", req("x").context)
    )
    with pytest.raises(HTTPException) as caught:
        repository.save_itinerary(payload, "alice", expected_updated_at="__missing__")
    assert caught.value.status_code == 503
    assert not any("INSERT INTO" in str(call) for call in cursor.execute.call_args_list)


def test_revision_compares_json_z_and_postgres_timezone_equally():
    from app.trips.itinerary_repository import _itinerary_revision

    assert _itinerary_revision("2026-11-16T01:02:03Z") == _itinerary_revision(
        "2026-11-16 01:02:03+00:00"
    )
    assert _itinerary_revision("2026-11-16T08:02:03+07:00") == _itinerary_revision(
        "2026-11-16 01:02:03"
    )


def test_missing_day_dates_and_untimed_manual_appointments_are_preserved(env):
    before = planning.empty_itinerary("own-trip", req("x").context)
    before["days"][0]["date"] = None
    old = {
        "stop_id": "manual",
        "title": "Hẹn gặp bạn",
        "stop_type": "custom",
        "source": "manual",
        "sequence": 0,
    }
    before["days"][0]["stops"] = [old]
    result, warnings = planning.create_plan(before, env[:1], target_day=1)
    assert result["days"][0]["date"] == "2026-11-20"
    assert any(s["stop_id"] == "manual" for s in result["days"][0]["stops"])
    assert result["days"][1] == before["days"][1]
    assert any("hoạt động cũ" in warning for warning in warnings)


def test_started_stop_without_end_time_gets_conservative_buffer(env, monkeypatch):
    before = planning.empty_itinerary(
        "own-trip", Context(destination="Huế", start_date="2026-11-16")
    )
    old = {
        "stop_id": "running",
        "poi_id": "a",
        "title": "Đang ghé",
        "sequence": 0,
        "start_time": "09:00",
        "duration_minutes": 120,
    }
    before["days"][0]["stops"] = [old]
    monkeypatch.setattr(
        planning, "now_vn", lambda: datetime(2026, 11, 16, 9, 10, tzinfo=planning.VN)
    )
    result, _ = planning.create_plan(before, env[:2], target_day=1)
    assert result["days"][0]["stops"][0] == old
    next_poi = next(s for s in result["days"][0]["stops"] if s.get("poi_id") == "b")
    assert next_poi["start_time"] >= "11:00"
