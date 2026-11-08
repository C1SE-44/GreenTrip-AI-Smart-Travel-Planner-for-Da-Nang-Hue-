"""
Unit tests for In-Planner AI Travel Copilot endpoint (PB14 - Task 3.35).
"""
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_copilot_chat_swap_meal_returns_vegetarian_pois(client: TestClient) -> None:
    payload = {
        "message": "Trưa nay mình muốn đổi sang ăn đồ chay thanh đạm",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 3,
            "current_day": 1,
            "current_slot": "lunch",
            "current_stop_name": "Mì Quảng Bà Mua",
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "swap_meal_vegetarian"
    assert data["action_type"] == "replace_stop"
    assert data["target_slot"] == "lunch"
    assert "Đà Nẵng" in data["reply_text"]
    assert len(data["suggested_pois"]) > 0

    for poi in data["suggested_pois"]:
        assert poi["id"]
        assert poi["name"]
        assert poi["category"] == "Ẩm thực chay"
        assert poi["green_score"] >= 70
        assert poi["rating"] > 0
        assert poi["address"]
        assert poi["swap_reason"]
        assert poi["image_url"].startswith("http")


def test_copilot_chat_rainy_day_returns_indoor_pois(client: TestClient) -> None:
    payload = {
        "message": "Trời đang mưa to thì đi đâu chơi được?",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 3,
            "current_day": 2,
            "current_slot": "afternoon",
            "current_stop_name": "Bãi Biển Mỹ Khê",
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "rainy_day_alternatives"
    assert data["action_type"] == "replace_stop"
    assert len(data["suggested_pois"]) > 0

    for poi in data["suggested_pois"]:
        assert poi["id"]
        assert poi["name"]
        # Indoor categories must not be beach or mountain pass
        assert "beach" not in (poi["sub_category"] or "").lower()
        assert "mountain_pass" not in (poi["sub_category"] or "").lower()
        assert poi["swap_reason"]
        assert poi["image_url"].startswith("http")


def test_copilot_chat_city_isolation_hue(client: TestClient) -> None:
    payload = {
        "message": "Gợi ý đổi quán chay cho buổi tối",
        "trip_context": {
            "destination": "Huế",
            "days_count": 2,
            "current_day": 1,
            "current_slot": "dinner",
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "swap_meal_vegetarian"
    assert "Huế" in data["reply_text"]
    assert len(data["suggested_pois"]) > 0
    # Must contain Hue vegetarian places
    names = [p["name"] for p in data["suggested_pois"]]
    assert any("Huế" in n or "Bồ Đề" in n or "Thiền Tâm" in n or "An Nhiên" in n for n in names)


def test_copilot_chat_general_greeting(client: TestClient) -> None:
    payload = {
        "message": "Xin chào trợ lý, bạn có thể hỗ trợ điều chỉnh lịch trình của tôi không?",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 4,
            "current_day": 1,
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "general_chat"
    assert data["action_type"] == "none"
    assert "Đà Nẵng" in data["reply_text"]
    assert "4" in data["reply_text"]


def test_copilot_chat_validation_error(client: TestClient) -> None:
    # Empty message should fail Pydantic min_length=1
    payload = {
        "message": "",
        "trip_context": {
            "destination": "Đà Nẵng",
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 422


def test_copilot_chat_night_eco_activities(client: TestClient) -> None:
    payload = {
        "message": "Buổi tối ở Đà Nẵng có hoạt động gì ngắm cảnh về đêm và đi bộ?",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 3,
            "current_day": 1,
            "current_slot": "dinner",
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "night_eco_activities"
    assert data["action_type"] == "replace_stop"
    assert len(data["suggested_pois"]) > 0
    assert data["green_impact_summary"] is not None
    names = [p["name"] for p in data["suggested_pois"]]
    assert any("Cầu Rồng" in n or "Sơn Trà" in n or "Sông Hàn" in n or "Bạch Đằng" in n for n in names)


def test_copilot_chat_saved_ideas_prioritized(client: TestClient) -> None:
    payload = {
        "message": "Trưa nay ăn gì thanh đạm?",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 3,
            "current_day": 1,
            "current_slot": "lunch",
            "saved_ideas": ["Roots Plant-based Cafe"],
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "swap_meal_vegetarian"
    # Should mention saved idea
    assert "Roots Plant" in data["reply_text"] or "Ý tưởng" in data["reply_text"]
    assert data["suggested_pois"][0]["name"] == "Roots Plant-based Cafe"
    assert "Ý tưởng" in data["suggested_pois"][0]["swap_reason"]


def test_copilot_chat_late_schedule_adjust(client: TestClient) -> None:
    payload = {
        "message": "Tôi đang bị trễ 45 phút, gợi ý cách tối ưu lịch trình chiều nay gọn hơn?",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 3,
            "current_day": 1,
            "current_slot": "afternoon",
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "late_schedule_adjust"
    assert data["action_type"] == "replace_stop"
    assert len(data["suggested_pois"]) > 0
    assert data["budget_impact_summary"] is not None
    assert data["green_impact_summary"] is not None

    for poi in data["suggested_pois"]:
        assert poi["id"]
        assert poi["name"]
        assert poi["budget_delta"] is not None
        assert poi["carbon_saved"] is not None
