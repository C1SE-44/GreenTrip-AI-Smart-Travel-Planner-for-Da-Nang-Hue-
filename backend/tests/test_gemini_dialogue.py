"""Model boundaries with synthetic responses; no key or external model calls in pytest."""

import json
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from fastapi import HTTPException
from test_travel_assistant import env, req
from app.assistant import nlu, service, store, planning


@pytest.mark.parametrize("message", ["heloo bạn", "hello bạn ơi", "chàooo", "hi there"])
def test_model_greeting_never_spills_old_search_results(env, monkeypatch, message):
    service.process(req("cà phê ở Huế"), "alice")
    monkeypatch.setattr(
        service,
        "extract",
        lambda *args, **kwargs: {
            "intent": "greeting",
            "reply": "Chào bạn! Bạn muốn tìm địa điểm hay sắp xếp chuyến đi?",
        },
    )
    forbidden = Mock(side_effect=AssertionError("Greeting must not search"))
    monkeypatch.setattr(service, "catalogue", forbidden)
    response = service.process(req(message), "alice")
    assert response["trace"]["route"] == "rules" and not response["pois"]
    assert response["text"].startswith("Chào bạn!")
    assert (
        service.history("alice", "own-trip", "planner")["messages"][-2]["text"]
        == message
    )
    forbidden.assert_not_called()


def test_city_only_request_asks_natural_question_using_current_trip(env, monkeypatch):
    captured = {}

    def model(message, **kwargs):
        captured.update(kwargs)
        return {
            "intent": "clarify",
            "city": "Huế",
            "reply": "Bạn muốn tìm điểm ở Huế hay xếp phần Huế trong chuyến 4 ngày này?",
        }

    monkeypatch.setattr(service, "extract", model)
    response = service.process(
        req("tôi muốn đi Huế", days_count=4, idea_ids=["a", "b"]), "alice"
    )
    assert (
        "4 ngày" in response["text"] and not response["pois"] and not response["draft"]
    )
    assert captured["context"]["saved_ideas_count"] == 2
    assert not any(
        key in captured["context"]
        for key in ("user_id", "title", "idea_ids", "start_date", "trip_id")
    )


def test_natural_study_request_is_search_not_programming_scope_error(env, monkeypatch):
    monkeypatch.setattr(
        service,
        "extract",
        lambda *args, **kwargs: {
            "intent": "search",
            "city": "Huế",
            "category": "cafe",
            "quiet": True,
            "max_price": 100000,
        },
    )
    result = service.process(
        req("một chỗ làm bài tập yên tĩnh ở Huế dưới 100k"), "alice"
    )
    assert result["pois"] and all(p["city"] == "Huế" for p in result["pois"])
    assert all("Cà phê" in p["name"] for p in result["pois"])
    assert "e" not in [p["id"] for p in result["pois"]]


def test_successful_model_city_delta_is_not_overwritten_by_legacy_parser(
    env, monkeypatch
):
    monkeypatch.setattr(
        service,
        "extract",
        lambda *args, **kwargs: {
            "intent": "search",
            "city": "Đà Nẵng",
            "category": "cafe",
        },
    )
    result = service.process(
        req("đừng giới hạn ở Huế nữa, chuyển sang tìm cà phê Đà Nẵng"), "alice"
    )
    assert result["pois"] and all(p["city"] == "Đà Nẵng" for p in result["pois"])


def test_model_reference_uses_actual_shown_order_and_preserves_user_text(
    env, monkeypatch
):
    shown = service.process(req("cà phê Huế"), "alice")["pois"]
    monkeypatch.setattr(
        service,
        "extract",
        lambda *args, **kwargs: {"intent": "save_idea", "reference_index": 2},
    )
    result = service.process(req("cất giúp tôi quán thứ hai nhé"), "alice")
    assert result["action"] == "ideas_saved" and result["idea_ids"] == [shown[1]["id"]]
    assert (
        service.history("alice", "own-trip", "planner")["messages"][-2]["text"]
        == "cất giúp tôi quán thứ hai nhé"
    )


def test_natural_lightening_is_still_a_day_scoped_preview(env, monkeypatch):
    before = planning.empty_itinerary("own-trip", req("x").context)
    before["days"][0]["stops"] = [
        {
            "stop_id": "keep",
            "poi_id": "c",
            "sequence": 0,
            "start_time": "09:00",
            "end_time": "10:00",
        }
    ]
    before["days"][1]["stops"] = [
        {"stop_id": "a", "poi_id": "a"},
        {"stop_id": "b", "poi_id": "b"},
    ]
    monkeypatch.setattr(service, "owned_itinerary", lambda *args: deepcopy(before))
    monkeypatch.setattr(
        service,
        "extract",
        lambda *args, **kwargs: {"intent": "plan", "day": 2, "pace": "light"},
    )
    write = Mock()
    monkeypatch.setattr(service, "save_itinerary", write)
    result = service.process(
        req("mai thứ hai trong chuyến bớt chạy nhiều giúp tôi", idea_ids=["a", "b"]),
        "alice",
    )
    assert result["draft"]["itinerary"]["days"][0] == before["days"][0]
    write.assert_not_called()


def test_model_budget_request_cannot_apply_itself(env, monkeypatch):
    monkeypatch.setattr(
        service,
        "extract",
        lambda *args, **kwargs: {
            "intent": "change_budget",
            "budget": 3_000_000,
            "reply": "Đã đổi ngân sách!",
        },
    )
    result = service.process(
        req("cho chuyến này thoải mái hơn tầm ba triệu", budget=2_000_000), "alice"
    )
    assert result["draft"]["kind"] == "budget"
    assert (
        service.history("alice", "own-trip", "planner")["context"]["budget"]
        == 2_000_000
    )


def test_unavailable_model_is_visible_and_never_searches_or_writes(env, monkeypatch):
    monkeypatch.setattr(
        service, "extract", lambda *args, **kwargs: {"_model_status": "quota"}
    )
    result = service.process(
        req("đừng đổi chỗ ăn trưa, đổi điểm cuối giúp tôi"), "alice"
    )
    assert result["trace"]["route"] == "fallback" and "gián đoạn" in result["text"]
    assert not result["pois"] and not result["draft"]


def test_model_cannot_claim_a_successful_write_in_free_text(env, monkeypatch):
    monkeypatch.setattr(
        service,
        "extract",
        lambda *args, **kwargs: {
            "intent": "clarify",
            "reply": "Đã áp dụng lịch cho bạn.",
        },
    )
    result = service.process(req("xin chào"), "alice")
    assert "Đã áp dụng" not in result["text"] and not result.get("action")


def test_changed_card_order_during_model_call_requires_reselection(env, monkeypatch):
    service.process(req("cà phê Huế"), "alice")

    def model(*args, **kwargs):
        with store.session("alice", "own-trip", "planner") as state:
            state["last_ids"] = ["c"]
        return {"intent": "save_idea", "reference_index": 2}

    monkeypatch.setattr(service, "extract", model)
    with pytest.raises(HTTPException) as caught:
        service.process(req("lưu quán số hai"), "alice")
    assert caught.value.status_code == 409


def test_request_for_other_places_does_not_repeat_shown_cards(env, monkeypatch):
    shown = service.process(req("cà phê Huế"), "alice")["pois"]
    monkeypatch.setattr(
        service,
        "extract",
        lambda *args, **kwargs: {
            "intent": "search",
            "category": "cafe",
            "city": "Huế",
            "exclude_previous": True,
        },
    )
    result = service.process(req("có chỗ khác không"), "alice")
    assert not set(p["id"] for p in shown) & set(p["id"] for p in result["pois"])


def test_model_request_is_bounded_uses_configured_model_and_omits_internal_ids(
    env, monkeypatch
):
    settings = SimpleNamespace(
        ASSISTANT_AI_ENABLED=True,
        ASSISTANT_AI_FREE_TIER_CONFIRMED=True,
        gemini_configured=True,
        ASSISTANT_AI_DAILY_LIMIT=5,
        GEMINI_API_KEY="unit-test-key",
        GEMINI_MODEL="gemini-3.5-flash-lite",
    )
    monkeypatch.setattr(nlu, "get_settings", lambda: settings)
    captured = {}

    def post(url, **kwargs):
        captured.update({"url": url, **kwargs})
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {"intent": "greeting", "reply": "Chào bạn!"}
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(nlu.httpx, "post", post)
    result = nlu.extract(
        "heloo bạn",
        context={"destination": "Huế"},
        history=[
            {
                "role": "assistant",
                "text": "Một gợi ý",
                "draft": {"user_id": "do-not-send"},
                "pois": [{"id": "private-id", "name": "Cà phê A", "city": "Huế"}],
            }
        ],
    )
    assert result["intent"] == "greeting"
    assert "gemini-3.5-flash-lite:generateContent" in captured["url"]
    data = json.loads(captured["json"]["contents"][0]["parts"][0]["text"])
    assert "private-id" not in json.dumps(data) and "do-not-send" not in json.dumps(
        data
    )
    assert captured["json"]["generationConfig"]["maxOutputTokens"] == 1200
    grammar = captured["json"]["generationConfig"]["responseJsonSchema"]
    assert grammar["properties"]["changes"]["items"]["required"] == [
        "field",
        "op",
        "value",
    ]
    assert "tools" not in captured["json"]


def test_zero_quota_and_disallowed_model_never_call_provider(env, monkeypatch):
    settings = SimpleNamespace(
        ASSISTANT_AI_ENABLED=True,
        ASSISTANT_AI_FREE_TIER_CONFIRMED=True,
        gemini_configured=True,
        ASSISTANT_AI_DAILY_LIMIT=0,
        GEMINI_API_KEY="unit-test-key",
        GEMINI_MODEL="gemini-3.5-flash-lite",
    )
    monkeypatch.setattr(nlu, "get_settings", lambda: settings)
    call = Mock()
    monkeypatch.setattr(nlu.httpx, "post", call)
    assert nlu.extract("hi")["_model_status"] == "quota"
    settings.ASSISTANT_AI_DAILY_LIMIT = 5
    settings.GEMINI_MODEL = "unapproved-paid-model"
    assert nlu.extract("hi")["_model_status"] == "unsupported_model"
    call.assert_not_called()
