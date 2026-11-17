"""Tests for GreenTrip Copilot upgrade: auth, ownership, chat history, grounded POI search, confirmation, and OSRM."""
import sys
from pathlib import Path
from unittest.mock import patch
import uuid

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth.service import create_access_token
from app.config import Settings
from app.itineraries.schemas import RouteGeometry
from app.main import app
from app.trips.itinerary_constraints import optimize_outline_routes_and_co2
from app.trips.schemas import TripContextPayload


def _auth_headers(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def test_copilot_endpoints_require_authentication() -> None:
    with TestClient(app) as client:
        r1 = client.post("/trips/copilot/chat", json={"message": "Xin chào", "trip_context": {"destination": "Đà Nẵng"}})
        assert r1.status_code == 401

        r2 = client.get("/trips/copilot/history?trip_id=ideation")
        assert r2.status_code == 401

        r3 = client.delete("/trips/copilot/history?trip_id=ideation")
        assert r3.status_code == 401


def test_copilot_ownership_and_history_isolation(tmp_path, monkeypatch) -> None:
    from app.db import postgres

    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", tmp_path / "copilot_test.sqlite")
    monkeypatch.setattr(postgres, "get_settings", lambda: Settings(DATABASE_URL=""))

    user_a = f"user-a-{uuid.uuid4().hex[:8]}"
    user_b = f"user-b-{uuid.uuid4().hex[:8]}"
    trip_id = f"trip-own-{uuid.uuid4().hex[:8]}"

    with TestClient(app) as client:
        # User A saves an itinerary
        itinerary_payload = {
            "trip_id": trip_id,
            "title": "Chuyến đi Đà Nẵng của A",
            "destination": "Đà Nẵng",
            "start_date": "2026-12-01",
            "days_count": 1,
            "days": [
                {
                    "day_id": f"{trip_id}-d1",
                    "day_number": 1,
                    "date": "2026-12-01",
                    "title": "Ngày 1",
                    "note": "",
                    "stops": [],
                }
            ],
        }
        save_resp = client.put(f"/trips/{trip_id}/itinerary", json=itinerary_payload, headers=_auth_headers(user_a))
        assert save_resp.status_code == 200, save_resp.text

        # User B is forbidden from chatting on or reading User A's trip
        b_chat = client.post(
            "/trips/copilot/chat",
            json={"message": "Gợi ý quán ăn", "trip_context": {"trip_id": trip_id, "destination": "Đà Nẵng"}},
            headers=_auth_headers(user_b),
        )
        assert b_chat.status_code == 403

        b_hist = client.get(f"/trips/copilot/history?trip_id={trip_id}", headers=_auth_headers(user_b))
        assert b_hist.status_code == 403

        # User A chats and persists history
        a_chat = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Chia 2 đêm Đà Nẵng, 1 đêm Huế nhé",
                "trip_context": {"trip_id": trip_id, "destination": "Đà Nẵng & Huế", "days_count": 3},
            },
            headers=_auth_headers(user_a),
        )
        assert a_chat.status_code == 200, a_chat.text
        chat_data = a_chat.json()
        assert chat_data["requires_confirmation"] is True
        assert chat_data["message_id"]

        # Saved itinerary in DB must NOT be mutated until user confirms
        loaded_itin = client.get(f"/trips/{trip_id}/itinerary", headers=_auth_headers(user_a))
        assert loaded_itin.status_code == 200
        assert loaded_itin.json()["days_count"] == 1

        # User A can load persisted history and mark proposal applied
        a_hist = client.get(f"/trips/copilot/history?trip_id={trip_id}", headers=_auth_headers(user_a))
        assert a_hist.status_code == 200
        hist_data = a_hist.json()
        assert len(hist_data["messages"]) == 2
        assert hist_data["messages"][0]["sender"] == "user"
        assert hist_data["messages"][1]["sender"] == "assistant"
        assert hist_data["messages"][1]["metadata"]["applied"] is False

        applied_resp = client.post(
            f"/trips/copilot/history/{chat_data['message_id']}/applied?trip_id={trip_id}",
            headers=_auth_headers(user_a),
        )
        assert applied_resp.status_code == 200
        assert applied_resp.json()["success"] is True

        # Duplicate apply must be rejected with 409 Conflict
        dup_applied = client.post(
            f"/trips/copilot/history/{chat_data['message_id']}/applied?trip_id={trip_id}",
            headers=_auth_headers(user_a),
        )
        assert dup_applied.status_code == 409

        a_hist_after = client.get(f"/trips/copilot/history?trip_id={trip_id}", headers=_auth_headers(user_a))
        assert a_hist_after.json()["messages"][1]["metadata"]["applied"] is True

        # Second proposal + third proposal -> second becomes superseded and cannot be applied (409)
        p2 = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Chia 1 đêm Đà Nẵng, 2 đêm Huế nhé",
                "trip_context": {"trip_id": trip_id, "destination": "Đà Nẵng & Huế", "days_count": 3},
            },
            headers=_auth_headers(user_a),
        )
        assert p2.status_code == 200
        p2_id = p2.json()["message_id"]

        p3 = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Chia 2 đêm Đà Nẵng, 2 đêm Huế nhé",
                "trip_context": {"trip_id": trip_id, "destination": "Đà Nẵng & Huế", "days_count": 4},
            },
            headers=_auth_headers(user_a),
        )
        assert p3.status_code == 200
        p3_id = p3.json()["message_id"]

        stale_apply = client.post(
            f"/trips/copilot/history/{p2_id}/applied?trip_id={trip_id}",
            headers=_auth_headers(user_a),
        )
        assert stale_apply.status_code == 409

        # Dismiss p3 and verify dismissed state persists & prevents applying p3
        dismiss_resp = client.post(
            f"/trips/copilot/history/{p3_id}/dismissed?trip_id={trip_id}",
            headers=_auth_headers(user_a),
        )
        assert dismiss_resp.status_code == 200
        apply_dismissed = client.post(
            f"/trips/copilot/history/{p3_id}/applied?trip_id={trip_id}",
            headers=_auth_headers(user_a),
        )
        assert apply_dismissed.status_code == 409

        hist_after_dismiss = client.get(f"/trips/copilot/history?trip_id={trip_id}", headers=_auth_headers(user_a))
        msgs = hist_after_dismiss.json()["messages"]
        p2_msg = next(m for m in msgs if m["message_id"] == p2_id)
        p3_msg = next(m for m in msgs if m["message_id"] == p3_id)
        assert p2_msg["metadata"].get("superseded") is True
        assert p3_msg["metadata"].get("dismissed") is True

        # Context enrichment from DB when destination/days_count omitted
        ctx_chat = client.post(
            "/trips/copilot/chat",
            json={"message": "Xin chào trợ lý", "trip_context": {"trip_id": trip_id}},
            headers=_auth_headers(user_a),
        )
        assert ctx_chat.status_code == 200
        assert "1 ngày" in ctx_chat.json()["reply_text"] or "Đà Nẵng" in ctx_chat.json()["reply_text"]

        # Clear history
        del_resp = client.delete(f"/trips/copilot/history?trip_id={trip_id}", headers=_auth_headers(user_a))
        assert del_resp.status_code == 200
        a_hist_cleared = client.get(f"/trips/copilot/history?trip_id={trip_id}", headers=_auth_headers(user_a))
        assert a_hist_cleared.json()["messages"] == []


def test_load_conversation_history_returns_latest_n_in_order(tmp_path, monkeypatch) -> None:
    from app.db import postgres
    from app.trips.chat_history_repository import append_chat_messages, load_conversation_history

    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", tmp_path / "latest_hist.sqlite")
    monkeypatch.setattr(postgres, "get_settings", lambda: Settings(DATABASE_URL=""))

    user_id = f"user-latest-{uuid.uuid4().hex[:8]}"
    trip_id = f"trip-latest-{uuid.uuid4().hex[:8]}"

    append_chat_messages(
        user_id=user_id,
        trip_id=trip_id,
        messages=[
            {"sender": "user", "content": "msg-1", "metadata": {}},
            {"sender": "assistant", "content": "msg-2", "metadata": {}},
        ],
    )
    append_chat_messages(
        user_id=user_id,
        trip_id=trip_id,
        messages=[
            {"sender": "user", "content": "msg-3", "metadata": {}},
            {"sender": "assistant", "content": "msg-4", "metadata": {}},
        ],
    )

    latest = load_conversation_history(user_id=user_id, trip_id=trip_id, limit=2)
    assert [m["content"] for m in latest["messages"]] == ["msg-3", "msg-4"]


def test_migration_015_defines_supabase_rls_and_policies() -> None:
    sql_path = BACKEND_ROOT / "migrations" / "015_create_copilot_chat_history.sql"
    sql = sql_path.read_text(encoding="utf-8")
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL PRIVILEGES ON TABLE public.copilot_conversations" in sql
    assert "REVOKE ALL PRIVILEGES ON TABLE public.copilot_messages" in sql
    assert "GRANT SELECT, INSERT, UPDATE, DELETE" in sql
    assert "TO service_role" in sql
    assert "auth.uid()::text = user_id" in sql
    assert "fk_copilot_messages_user_conversation" in sql


def test_copilot_poi_search_respects_price_and_no_fabrication() -> None:
    user_id = f"user-search-{uuid.uuid4().hex[:8]}"
    with TestClient(app) as client:
        resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Tìm quán ăn dưới 100k ở Đà Nẵng",
                "trip_context": {"destination": "Đà Nẵng", "days_count": 2},
            },
            headers=_auth_headers(user_id),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["intent"] == "poi_search"
        assert len(data["suggested_pois"]) > 0
        for poi in data["suggested_pois"]:
            if poi["estimated_cost"] is not None:
                assert poi["estimated_cost"] <= 100_000

        # Spiritual category ("Tâm linh & Tôn giáo") + free filter
        temple_resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Tìm chùa miễn phí ở Đà Nẵng",
                "trip_context": {"destination": "Đà Nẵng", "days_count": 2},
            },
            headers=_auth_headers(user_id),
        )
        assert temple_resp.status_code == 200, temple_resp.text
        temple_data = temple_resp.json()
        assert temple_data["intent"] == "poi_search"
        assert len(temple_data["suggested_pois"]) > 0

        # Trailing landmark anchor ("gần Cầu Rồng" at end of sentence)
        anchor_resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Tìm quán ăn dưới 100k gần Cầu Rồng",
                "trip_context": {"destination": "Đà Nẵng", "days_count": 2},
            },
            headers=_auth_headers(user_id),
        )
        assert anchor_resp.status_code == 200, anchor_resp.text
        anchor_data = anchor_resp.json()
        assert anchor_data["intent"] == "poi_search"
        assert len(anchor_data["suggested_pois"]) > 0
        assert any("Cầu Rồng" in (p.get("distance_info") or "") for p in anchor_data["suggested_pois"])


def test_optimize_outline_routes_uses_osrm_service() -> None:
    outline = [
        {
            "day": 1,
            "focus_city": "Đà Nẵng",
            "stops": [
                {"id": "s1", "title": "Cầu Rồng", "latitude": 16.0611, "longitude": 108.2275},
                {"id": "s2", "title": "Chùa Linh Ứng", "latitude": 16.0996, "longitude": 108.2775},
            ],
        }
    ]
    ctx = TripContextPayload(destination="Đà Nẵng", days_count=1, transport_mode="transit")
    mock_geom = RouteGeometry(type="LineString", coordinates=[[108.2275, 16.0611], [108.2775, 16.0996]])
    with patch(
        "app.trips.itinerary_constraints.compute_route_geometry",
        return_value=(mock_geom, 11400.0, 1200.0, False, "osrm"),
    ) as mock_osrm:
        metrics = optimize_outline_routes_and_co2(outline, ctx)
        assert mock_osrm.called
        assert metrics["route_source"] == "osrm"
        assert metrics["after_km"] == 11.4
        assert metrics["duration_minutes"] == 20
        assert len(metrics["day_routes"]) == 1
        assert metrics["day_routes"][0]["route_source"] == "osrm"
