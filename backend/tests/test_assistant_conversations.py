"""Three conversations per account/trip; all data is isolated temporary SQLite."""
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.assistant import service, store
from app.assistant.router import router
from app.assistant.schemas import ApplyRequest
from app.auth.dependencies import get_current_user_id
from test_travel_assistant import env, req
from test_assistant_acceptance import local_repository, LOCAL_OWNED


def turn(text, slot=1, trip="own-trip", **ctx):
    return req(text, trip=trip, **ctx).model_copy(update={"conversation_id": slot})


def test_histories_and_criteria_are_private_and_survive_reopen(env):
    for slot, text in [(1, "Tìm cà phê ở Huế dưới 80k"), (2, "Tìm bảo tàng ở Huế"), (3, "xin chào")]:
        service.process(turn(text, slot), "alice")
    for slot, category in [(1, "cafe"), (2, "museum")]:
        with store.session("alice", "own-trip", "planner", slot) as state:
            assert state["criteria"]["category"] == category
    original = service.history("alice", "own-trip", "planner")
    assert original == service.history("alice", "own-trip", "planner", 1)
    assert "80k" in original["messages"][0]["text"]
    assert "bảo tàng" in service.history("alice", "own-trip", "planner", 2)["messages"][0]["text"]
    for slot in (1, 2, 3):
        assert not service.history("bob", "own-trip", "planner", slot)["messages"]
        assert not service.history("alice", "another-trip", "planner", slot)["messages"]
        assert not service.history("alice", "own-trip", "discover", slot)["messages"]


@pytest.mark.parametrize("invalid", [0, 4, -1, 100])
def test_api_rejects_fourth_or_invalid_conversation(env, invalid):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user_id] = lambda: "alice"
    client = TestClient(app)
    assert client.get('/assistant/history', params={'conversation_id': invalid}).status_code == 422
    assert client.post('/assistant/chat', json={'message': 'hello', 'conversation_id': invalid}).status_code == 422
    assert client.post('/assistant/apply', json={'trip_id':'own-trip', 'draft_id':'d', 'conversation_id':invalid}).status_code == 422


def test_preview_and_apply_require_the_same_conversation(local_repository):
    draft = service.process(turn("Xếp lịch từ Ý tưởng", 2, idea_ids=["a", "c"]), "alice")["draft"]
    assert draft and LOCAL_OWNED("own-trip", "alice") is None
    wrong = ApplyRequest(trip_id="own-trip", draft_id=draft["id"], conversation_id=1)
    with pytest.raises(HTTPException) as error:
        service.apply("alice", wrong)
    assert error.value.status_code == 409
    assert LOCAL_OWNED("own-trip", "alice") is None
    service.apply("alice", wrong.model_copy(update={"conversation_id": 2}))
    assert LOCAL_OWNED("own-trip", "alice")
    assert service.history("alice", "own-trip", "planner", 2)["draft"] is None
    for slot in (1, 2, 3):
        with pytest.raises(HTTPException) as denied:
            service.history("bob", "own-trip", "planner", slot)
        assert denied.value.status_code == 403
