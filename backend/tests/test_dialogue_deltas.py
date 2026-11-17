"""Multi-turn service tests with model deltas mocked, isolated DB and real search/planner."""

from copy import deepcopy
import json
import logging
from unittest.mock import Mock
import pytest
from fastapi import HTTPException
from test_travel_assistant import env, req, point
from app.assistant import dialogue, service, store, planning, search


def delta(field, op="set", value=None):
    return dict(field=field, op=op, value=value)


def model(monkeypatch, intent, *changes):
    call = Mock(return_value={"intent": intent, "changes": list(changes)})
    monkeypatch.setattr(service, "extract", call)
    return call


def memory(user="alice", trip="own-trip", mode="planner"):
    with store.session(user, trip, mode) as state:
        return deepcopy(state)


@pytest.mark.parametrize(
    "opening,followup",
    [
        (
            "tôi cần 3 địa điểm must try ở huế thôi, 1 địa điểm là đi chùa",
            "còn 2 địa điểm còn lại khác chùa đi",
        ),
        (
            "Chọn ba nơi đáng ghé ở cố đô, chỉ một ngôi chùa trong số đó nhé",
            "hai suất kia cho trải nghiệm khác, đừng chọn tự viện",
        ),
    ],
)
def test_mixed_request_then_non_temple_followup(env, monkeypatch, opening, followup):
    env.extend(
        [
            point("n", "Vườn N", category="Cảnh quan thiên nhiên"),
            point("t", "Chùa T", category="Tâm linh & Tôn giáo"),
        ]
    )
    model(
        monkeypatch,
        "search",
        delta("city", value="Huế"),
        delta("count", value=3),
        delta("mix", value={"temple": 1, "other": 2}),
        delta("must_try", "prefer", True),
    )
    first = service.process(req(opening), "alice")
    assert first["trace"]["route"] == "gemini" and len(first["pois"]) == 3
    assert sum(search.category_match(p, "temple") for p in first["pois"]) == 1
    assert len({p["category"] for p in first["pois"]}) == 3
    model(
        monkeypatch,
        "search",
        delta("count", value=2),
        delta("category", "exclude", "temple"),
    )
    second = service.process(req(followup), "alice")
    assert len(second["pois"]) == 2 and all(
        not search.category_match(p, "temple") for p in second["pois"]
    )
    assert memory()["criteria"]["city"] == "Huế"
    assert second["trace"]["changes"]["excluded"] == ["category"]


@pytest.mark.parametrize(
    "message", ["không cần gần chùa nữa", "bỏ giới hạn khoảng cách tới ngôi chùa đi"]
)
def test_clear_nearby_after_reopen_keeps_city_category_and_price(
    env, monkeypatch, message
):
    model(
        monkeypatch,
        "search",
        delta("city", value="Huế"),
        delta("category", value="cafe"),
        delta("max_price", value=100000),
        delta(
            "nearby", value={"name": "Chùa Báo Quốc", "radius_km": 1, "strict": True}
        ),
    )
    service.process(req("cà phê Huế giá trần 100k sát chùa Báo Quốc"), "alice")
    assert memory()["anchor_id"] == "anchor"
    service.history("alice", "own-trip", "planner")
    captured = model(monkeypatch, "search", delta("nearby", "clear"))
    answer = service.process(req(message), "alice")
    filters = memory()["criteria"]
    assert (
        filters["city"] == "Huế"
        and filters["category"] == "cafe"
        and filters["max_price"] == 100000
    )
    assert not {"anchor_name", "radius_km", "strict_radius"} & filters.keys()
    assert "anchor_id" not in memory() and answer["pois"]
    assert answer["trace"]["changes"]["cleared"] == ["nearby"]
    data = json.dumps(captured.call_args.kwargs["context"], ensure_ascii=False)
    assert "Chùa Báo Quốc" in data and "history" not in captured.call_args.kwargs
    assert all(
        x not in data
        for x in ("alice", "own-trip", "Huế của tôi", "anchor_id", "stop_id", "poi_id")
    )


@pytest.mark.parametrize(
    "message", ["cái nào yên hơn?", "trong mấy quán đó, chỗ nào có vẻ ít ồn hơn nhỉ?"]
)
def test_compare_known_evidence_without_inventing_noise(env, monkeypatch, message):
    env[0]["vibes"] = []
    service.process(req("cà phê Huế"), "alice")
    original = set(memory()["last_ids"])
    model(monkeypatch, "compare", delta("quiet", "prefer", True))
    result = service.process(req(message), "alice")
    assert set(p["id"] for p in result["pois"]) == original
    assert result["pois"][0]["evidence"]["quiet"]
    assert "đo đạc" in result["text"]
    assert "quiet" not in memory()["criteria"] or not memory()["criteria"]["quiet"]


@pytest.mark.parametrize(
    "message",
    [
        "đừng gợi ý lại quán đầu",
        "loại chỗ ở vị trí số một khỏi các gợi ý tiếp theo nhé",
    ],
)
def test_exclusion_uses_shown_order_and_persists(env, monkeypatch, message):
    shown = service.process(req("cà phê Huế"), "alice")["pois"]
    first = shown[0]["id"]
    model(monkeypatch, "search", delta("places", "exclude", [1]))
    result = service.process(req(message), "alice")
    assert first not in [p["id"] for p in result["pois"]]
    model(monkeypatch, "search", delta("quiet", "prefer", True))
    assert first not in [
        p["id"] for p in service.process(req("vẫn muốn chỗ yên nhé"), "alice")["pois"]
    ]
    assert first in memory()["criteria"]["omit_ids"]


def plan_fixture():
    before = planning.empty_itinerary("own-trip", req("x", days_count=2).context)

    def stop(id, poi, title, start, end, index, kind="poi"):
        return dict(
            stop_id=id,
            poi_id=poi,
            title=title,
            city="Huế",
            sequence=index,
            start_time=start,
            end_time=end,
            stop_type=kind,
        )

    before["days"][0]["stops"] = [
        stop("unchanged", "anchor", "Chùa Báo Quốc", "09:00", "10:00", 0)
    ]
    before["days"][1]["stops"] = [
        stop("morning", "a", "Cà phê A", "09:00", "10:00", 0),
        stop("lunch", None, "Chỗ ăn trưa đã đặt", "12:00", "13:00", 1, "custom"),
        stop("afternoon", "c", "Bảo tàng C", "14:00", "15:00", 2),
        stop("last", "e", "Quán cuối", "15:30", "16:30", 3),
    ]
    return before


@pytest.mark.parametrize(
    "message,answer",
    [
        ("ngày 2 sáng đi trễ, giữ chỗ ăn trưa, đổi điểm cuối thôi", "tầm mười giờ"),
        (
            "Bữa thứ hai cho xuất phát muộn hơn; quán ăn giữa ngày giữ y vậy, chỉ thay nơi ghé chót",
            "10:00 nhé",
        ),
    ],
)
def test_compound_plan_waits_for_time_then_changes_only_requested_parts(
    env, monkeypatch, message, answer
):
    before = plan_fixture()
    monkeypatch.setattr(service, "owned_itinerary", lambda *args: deepcopy(before))
    write = Mock()
    monkeypatch.setattr(service, "save_itinerary", write)
    model(
        monkeypatch,
        "plan",
        delta("day", value=2),
        delta("start_after", "prefer", "later"),
        delta("meal", "keep", "lunch"),
        delta("replace_stop", value="last"),
    )
    first = service.process(
        req(message, days_count=2, idea_ids=["a", "b", "c", "e"]), "alice"
    )
    assert first["draft"] is None and first["text"].count("?") == 1
    assert memory()["plan_edits"]["2"]["replace_stop"] == "last"
    service.history("alice", "own-trip", "planner")
    captured = model(monkeypatch, "plan", delta("start_after", value="10:00"))
    result = service.process(
        req(answer, days_count=2, idea_ids=["a", "b", "c", "e"]), "alice"
    )
    assert result["trace"]["route"] == "gemini" and result["draft"], result["text"]
    after = result["draft"]["itinerary"]
    assert after["days"][0] == before["days"][0]
    stops = after["days"][1]["stops"]
    assert stops[0]["start_time"] == "10:00" and stops[0]["end_time"] == "11:00"
    assert stops[1:3] == before["days"][1]["stops"][1:3]
    assert stops[-1]["poi_id"] == "b" and stops[-1]["start_time"] == "15:30"
    assert before == plan_fixture()
    assert captured.call_args.kwargs["context"]["pending_plan"]["meal"] == "lunch"
    assert len(captured.call_args.kwargs["context"]["day_stops"]) == 4
    write.assert_not_called()


def test_second_edit_uses_same_draft_and_clear_restores_original_time(env, monkeypatch):
    before = plan_fixture()
    monkeypatch.setattr(service, "owned_itinerary", lambda *args: deepcopy(before))
    model(
        monkeypatch,
        "plan",
        delta("day", value=2),
        delta("start_after", value="10:00"),
        delta("replace_stop", value="last"),
    )
    first = service.process(
        req(
            "sáng ngày hai bắt đầu 10 giờ, thay điểm cuối", days_count=2, idea_ids=["b"]
        ),
        "alice",
    )
    assert first["draft"]
    model(monkeypatch, "plan", delta("start_after", "clear"))
    second = service.process(
        req("giờ sáng giữ như ban đầu", days_count=2, idea_ids=["b"]), "alice"
    )
    assert (
        second["draft"]["itinerary"]["days"][1]["stops"][0]
        == before["days"][1]["stops"][0]
    )
    assert second["draft"]["itinerary"]["days"][1]["stops"][-1]["poi_id"] == "b"


def test_trip_account_mode_are_isolated(env, monkeypatch):
    service.process(req("cà phê Huế dưới 100k"), "alice")
    for user, trip, mode in [
        ("alice", "other-trip", "planner"),
        ("bob", "own-trip", "planner"),
        ("alice", "own-trip", "discover"),
    ]:
        assert not memory(user, trip, mode)["last_ids"]
        assert not memory(user, trip, mode)["criteria"]


def test_clear_only_plan_edit_restores_base_instead_of_rebuilding_day(env, monkeypatch):
    before = plan_fixture()
    monkeypatch.setattr(service, "owned_itinerary", lambda *args: deepcopy(before))
    model(
        monkeypatch, "plan", delta("day", value=2), delta("start_after", value="10:00")
    )
    assert service.process(req("sáng ngày 2 đi 10 giờ", days_count=2), "alice")["draft"]
    model(monkeypatch, "plan", delta("start_after", "clear"))
    result = service.process(
        req("bỏ chỉnh giờ sáng, giữ như lúc đầu", days_count=2), "alice"
    )
    assert result["draft"]["itinerary"] == before


def test_model_failure_still_allows_simple_search_and_button(env, monkeypatch):
    monkeypatch.setattr(
        service, "extract", Mock(return_value={"_model_status": "unavailable"})
    )
    result = service.process(req("tìm cà phê Huế dưới 100k"), "alice")
    assert result["trace"]["route"] == "fallback" and result["pois"]
    selected = req("Lưu vào Ý tưởng").model_copy(
        update={"selected_poi_id": result["pois"][0]["id"]}
    )
    assert service.process(selected, "alice")["action"] == "ideas_saved"
    assert service.extract.call_count == 1


def test_greeting_and_canonical_button_skip_provider_but_partial_free_text_does_not(
    env, monkeypatch
):
    call = model(monkeypatch, "search", delta("category", value="cafe"))
    service.process(req("xin chào"), "alice")
    service.process(req("Xếp lịch từ Ý tưởng"), "alice")
    call.assert_not_called()
    service.process(req("tìm cà phê, nhưng ưu tiên ngồi trò chuyện thoải mái"), "alice")
    call.assert_called_once()


def test_dev_log_has_route_reason_not_raw_chat_or_identity(env, monkeypatch, caplog):
    model(monkeypatch, "search", delta("category", value="cafe"))
    with caplog.at_level(logging.DEBUG, logger="greentrip.assistant.route"):
        service.process(req("mật khẩu riêng tư không được log"), "alice")
    records = " ".join(
        r.getMessage() for r in caplog.records if r.name == "greentrip.assistant.route"
    )
    assert "route=gemini" in records and "reason=structured_turn" in records
    assert (
        "mật khẩu" not in records
        and "alice" not in records
        and "own-trip" not in records
    )


def test_bad_reference_cannot_partially_mutate_state(env, monkeypatch):
    service.process(req("cà phê Huế"), "alice")
    before = memory()["criteria"]
    model(
        monkeypatch,
        "search",
        delta("max_price", value=5000),
        delta("places", "exclude", [5]),
    )
    result = service.process(req("đừng hiện quán số năm"), "alice")
    assert result["trace"]["route"] == "fallback"
    assert memory()["criteria"] == before


def test_stale_draft_and_past_day_cannot_be_modified(env, monkeypatch):
    before = plan_fixture()
    before["days"][1]["date"] = "2026-11-15"
    monkeypatch.setattr(service, "owned_itinerary", lambda *args: deepcopy(before))
    model(
        monkeypatch, "plan", delta("day", value=2), delta("start_after", value="10:00")
    )
    result = service.process(req("ngày 2 đi lúc 10 giờ", days_count=2), "alice")
    assert not result["draft"] and "đã qua" in result["text"]


@pytest.mark.parametrize(
    "change",
    [
        delta("category", "set", "SQL"),
        delta("places", "exclude", [0]),
        delta("count", value=200),
        delta("nearby", value={"latitude": 1}),
        delta("max_price", value=-1),
        delta("start_after", value="25:00"),
    ],
)
def test_invalid_model_values_rejected(change):
    with pytest.raises(ValueError):
        dialogue.Change.model_validate(change)
