"""Staged demo acceptance; all writes use temporary local SQLite, no cloud clients."""

from copy import deepcopy
from unittest.mock import Mock
import pytest
from test_travel_assistant import env, req, point
from test_dialogue_deltas import delta, model, memory, plan_fixture
from app.assistant import service, search, dialogue, store, planning
from fastapi import HTTPException


def test_demo_api_rules_nearby_followup_keeps_target_category_and_price(env):
    first = service.process(req("Tìm cà phê ở Huế dưới 80k", mode="discover"), "alice")
    assert first["pois"]
    second = service.process(
        req("Chỉ trong 1 km quanh Chùa Báo Quốc nhé", mode="discover"), "alice"
    )
    assert second["pois"] and all(
        search.category_match(p, "cafe") for p in second["pois"]
    )
    with store.session("alice", "own-trip", "discover") as state:
        assert (
            state["criteria"]["category"] == "cafe"
            and state["criteria"]["max_price"] == 80000
        )


@pytest.mark.parametrize("mode", ["discover", "planner"])
def test_stage0_route_latency_and_actual_model_count(env, monkeypatch, mode):
    call = model(monkeypatch, "search", delta("category", value="cafe"))
    result = service.process(req("Chào, tìm giúp quán cà phê Huế", mode=mode), "alice")
    assert result["pois"] and result["trace"]["route"] == "gemini"
    assert result["trace"]["elapsed_ms"] >= 0
    assert result["trace"]["model_calls"] == 1
    assert call.call_count == 1
    hello = service.process(req("xin chào", mode=mode), "alice")
    assert hello["trace"]["route"] == "rules" and hello["trace"]["model_calls"] == 0
    assert call.call_count == 1


@pytest.mark.parametrize(
    "text",
    [
        "Xin chào, muốn tìm chỗ ăn tối tại Huế, ưu tiên địa phương, đừng quá 150k mỗi người",
        "Giúp chọn quán bản địa ở Huế để ăn tối, chi tối đa 150 nghìn/người thôi nhé",
    ],
)
def test_stage1_person_cap_local_is_preference_not_hard_filter(env, monkeypatch, text):
    for id, local, price in [
        ("local", True, "100.000–140.000 ₫ / người"),
        ("chain", False, "100.000 ₫ / người"),
        ("expensive", True, "170.000 ₫ / người"),
        ("unknown", True, "100.000 ₫ / món"),
    ]:
        p = point(id, f"Quán {id}", category="Quán ăn", price=price)
        p["is_local_business"] = local
        env.append(p)
    model(
        monkeypatch,
        "search",
        delta("category", value="food"),
        delta("local", "prefer", True),
        delta("max_price", value=150000),
        delta("price_unit", value="person"),
    )
    result = service.process(req(text), "alice")
    assert result["trace"]["route"] == "gemini"
    assert [p["id"] for p in result["pois"]] == ["local", "chain"]
    assert [p["id"] for p in result["unknown_price_pois"]] == ["unknown"]
    assert "expensive" not in [p["id"] for p in result["pois"]]


@pytest.mark.parametrize(
    "text,city",
    [
        ("tìm bảo tàng ở Đà Nẵng", "Đà Nẵng"),
        ("cà phê ở Huế nhé", "Huế"),
        ("tìm cà phê tại Đà Nẵng chứ không ở Huế", "Đà Nẵng"),
    ],
)
def test_stage1_explicit_city_is_checked_even_when_model_gets_it_wrong(
    env, monkeypatch, text, city
):
    model(
        monkeypatch,
        "search",
        delta("city", value="Huế" if city == "Đà Nẵng" else "Đà Nẵng"),
        delta("category", value="cafe"),
    )
    result = service.process(req(text), "alice")
    assert result["pois"] and all(p["city"] == city for p in result["pois"])
    assert result["trace"]["route"] == "gemini"


def test_stage1_group_shortage_does_not_fill_with_wrong_type(env, monkeypatch):
    env.append(point("nature", "Vườn thiên nhiên", category="Cảnh quan thiên nhiên"))
    model(
        monkeypatch,
        "search",
        delta("count", value=3),
        delta("mix", value={"temple": 1, "nature": 2}),
    )
    result = service.process(req("ba điểm, hai thiên nhiên một chùa"), "alice")
    assert len(result["pois"]) == 2
    assert all(
        search.category_match(p, "temple") or search.category_match(p, "nature")
        for p in result["pois"]
    )
    assert "2 điểm" in result["text"]


def test_stage1_unknown_and_no_results_do_not_look_like_matches(env, monkeypatch):
    model(
        monkeypatch,
        "search",
        delta("category", value="cafe"),
        delta("max_price", value=1),
        delta("price_unit", value="person"),
    )
    result = service.process(req("cà phê dưới một đồng mỗi người"), "alice")
    assert not result["pois"] and result["unknown_price_pois"]
    assert "chưa xác định" in result["text"].lower()


def test_stage1_comparison_with_new_hard_price_rechecks_cards(env, monkeypatch):
    service.process(req("cà phê Huế"), "alice")
    model(
        monkeypatch,
        "compare",
        delta("quiet", "prefer", True),
        delta("max_price", value=50000),
    )
    result = service.process(
        req("trong các quán đó ưu tiên yên hơn nhưng dưới 50k"), "alice"
    )
    assert not result[
        "pois"
    ]  # Both known ranges end at 60k, the third has no upper bound.
    assert "?" in result["text"] or "khớp" in result["text"]


@pytest.mark.parametrize(
    "message",
    [
        "Giờ tôi muốn tìm bảo tàng để tham quan",
        "Bắt đầu nhu cầu khác: cho xem các bảo tàng trong thành phố",
    ],
)
def test_stage2_new_task_drops_old_price_radius_and_exclusions(
    env, monkeypatch, message
):
    model(
        monkeypatch,
        "search",
        delta("category", value="cafe"),
        delta("max_price", value=1),
        delta(
            "nearby", value={"name": "Chùa Báo Quốc", "radius_km": 0.1, "strict": True}
        ),
    )
    service.process(req("cà phê cực rẻ sát Chùa Báo Quốc"), "alice")
    monkeypatch.setattr(
        service,
        "extract",
        lambda *a, **kw: {
            "intent": "search",
            "search_scope": "new",
            "changes": [delta("category", value="museum")],
        },
    )
    result = service.process(req(message), "alice")
    assert [p["id"] for p in result["pois"]] == ["c"]
    assert (
        not {"max_price", "radius_km", "anchor_name", "omit_ids"}
        & memory()["criteria"].keys()
    )
    assert "anchor_id" not in memory()


def test_stage2_city_switch_keeps_price_category_but_drops_old_city_anchor(
    env, monkeypatch
):
    model(
        monkeypatch,
        "search",
        delta("category", value="cafe"),
        delta("max_price", value=100000),
        delta("nearby", value={"name": "Chùa Báo Quốc", "radius_km": 1}),
    )
    service.process(req("cà phê Huế dưới 100k gần chùa Báo Quốc"), "alice")
    model(monkeypatch, "search", delta("city", value="Đà Nẵng"))
    result = service.process(req("đổi sang Đà Nẵng"), "alice")
    assert [p["id"] for p in result["pois"]] == ["d"]
    assert (
        memory()["criteria"]["max_price"] == 100000
        and memory()["criteria"]["category"] == "cafe"
    )
    assert not memory().get("anchor_id") and "radius_km" not in memory()["criteria"]


def test_stage2_comparison_without_cards_asks_instead_of_guessing(env, monkeypatch):
    model(monkeypatch, "compare", delta("quiet", "prefer", True))
    result = service.process(req("chỗ nào trong đó yên hơn?"), "alice")
    assert not result["pois"] and result["text"].count("?") == 1


@pytest.fixture
def local_repository(env, monkeypatch, tmp_path):
    import sqlite3
    from contextlib import contextmanager
    from app.db.postgres import SQLiteConnectionWrapper
    from app.trips import itinerary_repository as repository

    @contextmanager
    def connection():
        with SQLiteConnectionWrapper(
            sqlite3.connect(tmp_path / "itineraries.db", timeout=10)
        ) as db:
            yield db

    monkeypatch.setattr(repository, "get_connection", connection)
    monkeypatch.setattr(service, "get_connection", connection)
    monkeypatch.setattr(service, "owned_itinerary", LOCAL_OWNED)
    return repository


# Capture production ownership function before the shared fixture replaces it.
LOCAL_OWNED = service.owned_itinerary


def test_sample_chat_history_and_apply_are_rejected_before_database(env,monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.assistant.router import router
    from app.auth.dependencies import get_current_user_id
    monkeypatch.setattr(service,'owned_itinerary',LOCAL_OWNED)
    db=Mock(side_effect=AssertionError('Sample must not access/write a database'))
    monkeypatch.setattr(service,'get_connection',db)
    app=FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user_id]=lambda:'alice'
    client=TestClient(app)
    responses=[client.get('/assistant/history',params={'mode':'planner','trip_id':'sample-shared'}),
        client.post('/assistant/chat',json=req('xin chào',trip='sample-shared').model_dump()),
        client.post('/assistant/apply',json={'mode':'planner','trip_id':'sample-shared','draft_id':'stale'})]
    assert all(r.status_code==403 and 'lịch mẫu' in r.json()['detail'] for r in responses)
    db.assert_not_called()


def test_new_private_trip_can_start_chat_without_persisting_itinerary(local_repository):
    request=req('xin chào',trip='trip-new-private')
    assert service.history('alice',request.trip_id,'planner')['messages']==[]
    result=service.process(request,'alice')
    assert result['trace']['route']=='rules' and not result['draft']
    assert LOCAL_OWNED(request.trip_id,'alice') is None


def test_stage3_end_to_end_search_save_plan_preview_apply(
    local_repository, env, monkeypatch
):
    from app.assistant.schemas import ApplyRequest

    model(
        monkeypatch,
        "search",
        delta("category", value="cafe"),
        delta("max_price", value=100000),
    )
    cards = service.process(req("cho vài quán cà phê vừa túi tiền"), "alice")["pois"]
    ids = []
    for card in cards[:2]:
        request = req("Lưu vào Ý tưởng", idea_ids=ids).model_copy(
            update={"selected_poi_id": card["id"]}
        )
        ids = service.process(request, "alice")["idea_ids"]
    assert len(ids) == 2
    preview = service.process(req("Xếp lịch từ Ý tưởng", idea_ids=ids), "alice")[
        "draft"
    ]
    assert preview and LOCAL_OWNED("own-trip", "alice") is None
    apply_request = ApplyRequest(
        trip_id="own-trip", mode="planner", draft_id=preview["id"]
    )
    result = service.apply("alice", apply_request)
    persisted = LOCAL_OWNED("own-trip", "alice")
    assert persisted and result["action"] == "itinerary_saved"
    with pytest.raises(HTTPException) as caught:
        service.apply("alice", apply_request)
    assert caught.value.status_code == 409
    with pytest.raises(HTTPException) as caught:
        service.process(req("xin chào"), "bob")
    assert caught.value.status_code == 403
    # A draft from an older tab revision must never overwrite another edit.
    model(
        monkeypatch, "plan", delta("day", value=1), delta("start_after", value="09:15")
    )
    later = service.process(
        req("ngày đầu bắt đầu lúc 9 giờ 15", idea_ids=ids), "alice"
    )["draft"]
    assert later
    from app.trips.schemas import TripItinerarySyncRequest

    payload = TripItinerarySyncRequest.model_validate(persisted).model_copy(
        update={"title": "Tab khác"}
    )
    local_repository.save_itinerary(
        payload, "alice", expected_updated_at=persisted["updated_at"]
    )
    with pytest.raises(HTTPException) as caught:
        service.apply(
            "alice", apply_request.model_copy(update={"draft_id": later["id"]})
        )
    assert caught.value.status_code == 409


@pytest.mark.parametrize(
    "message",
    [
        "Ngày 2 đi muộn hơn, giữ chỗ ăn trưa, đổi điểm cuối sang chỗ gần hơn.",
        "Ngày thứ hai bắt đầu 10h, trưa ăn nguyên chỗ cũ, nơi ghé chót chọn nơi đỡ xa điểm trước nhé",
    ],
)
def test_stage3_nearer_replacement_and_scoped_apply(
    local_repository, env, monkeypatch, message
):
    from app.trips.schemas import TripItinerarySyncRequest
    from app.assistant.schemas import ApplyRequest

    before = plan_fixture()
    next(p for p in env if p["id"] == "e")["latitude"] = 16.7
    next(p for p in env if p["id"] == "b")["latitude"] = 16.461
    env.append(point("far", "Quán xa", lat=16.9))
    local_repository.save_itinerary(
        TripItinerarySyncRequest.model_validate(before),
        "alice",
        expected_updated_at="__missing__",
    )
    baseline = LOCAL_OWNED("own-trip", "alice")
    model(
        monkeypatch,
        "plan",
        delta("day", value=2),
        delta("start_after", value="10:00"),
        delta("meal", "keep", "lunch"),
        delta("replace_stop", value="last"),
        delta("nearer", "prefer", True),
    )
    response = service.process(
        req(message, days_count=2, idea_ids=["far", "b"]), "alice"
    )
    assert response["draft"], response["text"]
    after = response["draft"]["itinerary"]
    assert after["days"][1]["stops"][-1]["poi_id"] == "b"
    assert "Giữ" in response["text"] and "đổi" in response["text"].lower()
    assert LOCAL_OWNED("own-trip", "alice") == baseline
    service.apply(
        "alice",
        ApplyRequest(
            trip_id="own-trip", mode="planner", draft_id=response["draft"]["id"]
        ),
    )
    saved = LOCAL_OWNED("own-trip", "alice")
    assert saved["days"][0] == baseline["days"][0]
    assert saved["days"][1]["stops"][1:3] == baseline["days"][1]["stops"][1:3]
    assert saved["days"][1]["stops"][0]["start_time"] == "10:00"


def test_stage3_nearer_without_coordinates_asks_and_preserves(env, monkeypatch):
    before = plan_fixture()
    monkeypatch.setattr(service, "owned_itinerary", lambda *a: deepcopy(before))
    env[1]["latitude"] = None
    model(
        monkeypatch,
        "plan",
        delta("day", value=2),
        delta("replace_stop", value="last"),
        delta("nearer", "prefer", True),
    )
    response = service.process(
        req(
            "điểm cuối ngày 2 chọn chỗ gần điểm trước hơn", days_count=2, idea_ids=["b"]
        ),
        "alice",
    )
    assert (
        not response["draft"]
        and response["text"].count("?") == 1
        and response["trace"]["route"] == "gemini"
    )


def test_stage3_nearer_followup_uses_original_point_coordinates(env, monkeypatch):
    before = plan_fixture()
    env[4]["latitude"] = 16.7
    monkeypatch.setattr(service, "owned_itinerary", lambda *a: deepcopy(before))
    model(
        monkeypatch,
        "plan",
        delta("day", value=2),
        delta("replace_stop", value="last"),
        delta("nearer", "prefer", True),
    )
    first = service.process(
        req("điểm cuối ngày 2 cho gần hơn", days_count=2, idea_ids=["b"]), "alice"
    )
    assert first["draft"]
    model(monkeypatch, "plan", delta("start_after", value="10:00"))
    second = service.process(
        req("sáng ngày đó đi 10 giờ nhé", days_count=2, idea_ids=["b"]), "alice"
    )
    assert second["draft"], second["text"]
    assert second["draft"]["itinerary"]["days"][1]["stops"][-1]["poi_id"] == "b"


def test_stage3_superseded_draft_id_is_invalidated_for_ui(env, monkeypatch):
    before = plan_fixture()
    monkeypatch.setattr(service, "owned_itinerary", lambda *a: deepcopy(before))
    model(
        monkeypatch, "plan", delta("day", value=2), delta("start_after", value="10:00")
    )
    first = service.process(req("ngày hai 10 giờ", days_count=2), "alice")
    assert first["active_draft_id"] == first["draft"]["id"]
    model(monkeypatch, "plan", delta("start_after", "prefer", "later"))
    second = service.process(req("muộn thêm chút nữa", days_count=2), "alice")
    assert second["active_draft_id"] is None and not second["draft"]


def test_stage4_reasons_are_grounded_short_and_not_duplicate_descriptions(
    env, monkeypatch
):
    env[0]["description"] = "Cà phê A tại Huế. Lời giới thiệu rất dài " * 20
    model(
        monkeypatch,
        "search",
        delta("category", value="cafe"),
        delta("max_price", value=100000),
        delta("quiet", "prefer", True),
    )
    response = service.process(req("quán nhẹ nhàng vừa túi tiền"), "alice")
    lines = [line for line in response["text"].splitlines() if line.startswith("**")]
    assert len(lines) == len(response["pois"])
    for p, line in zip(response["pois"], lines):
        assert line.count(p["name"]) == 1 and len(line) < 200
        assert "₫" in line and ("yên" in line or "thuộc tính" in line)
    assert not response["text"].rstrip().endswith("?")


@pytest.mark.parametrize("failure", ["off", "timeout", "429", "503", "invalid"])
def test_stage4_provider_failures_preserve_basic_flow_and_count_attempts(
    env, monkeypatch, failure
):
    import httpx
    from types import SimpleNamespace
    from app.assistant import nlu

    settings = SimpleNamespace(
        ASSISTANT_AI_ENABLED=failure != "off",
        ASSISTANT_AI_FREE_TIER_CONFIRMED=True,
        gemini_configured=True,
        ASSISTANT_AI_DAILY_LIMIT=10,
        GEMINI_API_KEY="synthetic-key",
        GEMINI_MODEL="gemini-3.5-flash-lite",
    )
    monkeypatch.setattr(nlu, "get_settings", lambda: settings)
    post = Mock()
    if failure == "timeout":
        post.side_effect = httpx.ReadTimeout("offline")
    elif failure in ("429", "503"):
        post.return_value = httpx.Response(
            int(failure), request=httpx.Request("POST", "https://unit.invalid")
        )
    else:
        post.return_value = httpx.Response(
            200,
            request=httpx.Request("POST", "https://unit.invalid"),
            json={
                "candidates": [
                    {"content": {"parts": [{"text": '{"intent":"invent","sql":"no"}'}]}}
                ]
            },
        )
    monkeypatch.setattr(nlu.httpx, "post", post)
    monkeypatch.setattr(service, "extract", nlu.extract)
    simple = service.process(req("tìm cà phê Huế dưới 100k"), "alice")
    assert simple["pois"] and not simple["draft"]
    assert simple["trace"]["route"] == ("rules" if failure == "off" else "fallback")
    assert simple["trace"]["model_calls"] == (0 if failure == "off" else 1)
    # Explicit mixed quotas are now supported offline; verify IDs and quotas.
    hard = service.process(req("Tìm 3 điểm ở Huế, chỉ 1 điểm là chùa"), "alice")
    assert len({p["id"] for p in hard["pois"]}) == 3 and not hard["draft"]
    assert sum(search.category_match(p, "temple") for p in hard["pois"]) == 1
    assert all(p["city"] == "Huế" for p in hard["pois"])
    assert post.call_count == (0 if failure == "off" else 2)


def test_stage4_unknown_followup_does_not_replay_old_cards_when_ai_fails(
    env, monkeypatch
):
    service.process(req("cà phê Huế"), "alice")
    monkeypatch.setattr(
        service,
        "extract",
        lambda *a, **kw: {"_model_status": "timeout", "_model_calls": 1},
    )
    result = service.process(req("ngồi rôm rả thì bên nào tiện nhỉ"), "alice")
    assert not result["pois"] and result["text"].count("?") == 1
    assert result["trace"]["route"] == "fallback"


@pytest.mark.parametrize("faults", [False, True])
def test_stage5_four_authenticated_sessions_parallel_without_locking_model_or_leaking(
    local_repository, env, monkeypatch, faults
):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier, Event
    from types import SimpleNamespace
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.auth import service as auth
    from app.assistant.router import router
    from app.trips.schemas import TripItinerarySyncRequest

    # Real JWT encode/decode; a test-only secret never shared with the running app.
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: SimpleNamespace(
            JWT_SECRET_KEY="isolated-acceptance-secret-of-at-least-32-bytes",
            JWT_ALGORITHM="HS256",
            JWT_ACCESS_TOKEN_EXPIRE_MINUTES=10,
        ),
    )
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    env.append(point("n", "Vườn xanh", category="Cảnh quan thiên nhiên"))
    cases = [
        ("u1", "t1", "cafe", "cà phê"),
        ("u2", "t2", "museum", "bảo tàng"),
        ("u3", "t3", "temple", "chùa"),
        ("u4", "t4", "nature", "thiên nhiên"),
    ]
    headers = {
        u: {"Authorization": "Bearer " + auth.create_access_token(u)} for u, *_ in cases
    }
    for u, t, _, _ in cases:
        payload = TripItinerarySyncRequest.model_validate(
            planning.empty_itinerary(t, req("x").context)
        )
        local_repository.save_itinerary(payload, u, expected_updated_at="__missing__")
    barrier = Barrier(4)
    entered = Event()
    release = Event()

    def delayed_model(message, **kw):
        assert "user_id" not in kw["context"] and "trip_id" not in kw["context"]
        category = next(c for _, _, c, label in cases if label in message)
        barrier.wait(timeout=10)
        entered.set()
        assert release.wait(timeout=10)
        if faults and category in ("temple", "nature"):
            return {
                "_model_status": "quota" if category == "temple" else "timeout",
                "_model_calls": 0 if category == "temple" else 1,
            }
        return {"intent": "search", "changes": [delta("category", value=category)]}

    monkeypatch.setattr(service, "extract", delayed_model)

    def chat(case):
        u, t, _, label = case
        return client.post(
            "/assistant/chat",
            headers=headers[u],
            json=req("Gợi ý " + label, trip=t).model_dump(),
        )

    with ThreadPoolExecutor(max_workers=4) as pool:
        pending = [pool.submit(chat, case) for case in cases]
        try:
            assert entered.wait(
                timeout=10
            ), "Four model turns should enter concurrently"
            history = client.get(
                "/assistant/history",
                headers=headers["u1"],
                params={"trip_id": "t1", "mode": "planner"},
            )
            assert history.status_code == 200 and not history.json()["messages"]
            assert all(
                not future.done() for future in pending
            ), "A slow model must not lock unrelated history requests"
        finally:
            release.set()
        responses = [future.result(timeout=15) for future in pending]
    chosen = {}
    for case, response in zip(cases, responses):
        u, t, category, _ = case
        assert response.status_code == 200, response.text
        body = response.json()
        assert (
            body["trace"]["route"]
            == ("fallback" if faults and category in ("temple", "nature") else "gemini")
            and body["pois"]
        )
        assert all(search.category_match(p, category) for p in body["pois"])
        chosen[t] = body["pois"][0]["id"]
        saved = client.post(
            "/assistant/chat",
            headers=headers[u],
            json=req("Lưu vào Ý tưởng", trip=t)
            .model_copy(update={"selected_poi_id": chosen[t]})
            .model_dump(),
        )
        assert saved.status_code == 200 and saved.json()["idea_ids"] == [chosen[t]]
    drafts = {}
    for u, t, _, _ in cases:
        response = client.post(
            "/assistant/chat",
            headers=headers[u],
            json=req("Xếp lịch từ Ý tưởng", trip=t, idea_ids=[chosen[t]]).model_dump(),
        )
        assert response.status_code == 200 and response.json()["draft"]
        drafts[t] = response.json()["draft"]["id"]
        assert all(not day["stops"] for day in LOCAL_OWNED(t, u)["days"])

    def apply_case(case):
        u, t, *_ = case
        return client.post(
            "/assistant/apply",
            headers=headers[u],
            json={"trip_id": t, "mode": "planner", "draft_id": drafts[t]},
        )

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(apply_case, cases))
    assert all(response.status_code == 200 for response in results)
    for u, t, *_ in cases:
        itinerary = LOCAL_OWNED(t, u)
        assert [
            s["poi_id"]
            for d in itinerary["days"]
            for s in d["stops"]
            if s.get("poi_id")
        ] == [chosen[t]]
    assert (
        client.get(
            "/assistant/history",
            headers=headers["u1"],
            params={"trip_id": "t2", "mode": "planner"},
        ).status_code
        == 403
    )
    assert (
        client.get(
            "/assistant/history", headers={"Authorization": "Bearer not-a-real-token"}
        ).status_code
        == 401
    )
