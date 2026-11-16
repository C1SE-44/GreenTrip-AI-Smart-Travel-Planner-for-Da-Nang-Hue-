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
    assert "Đà Nẵng" in data["reply_text"]
    assert "4" in data["reply_text"]
    assert len(data["suggested_pois"]) > 0
    assert len(data["next_suggested_prompts"]) > 0


def test_copilot_chat_culinary_guide_danang(client: TestClient) -> None:
    payload = {
        "message": "hãy gợi ý cho tôi các quán ăn ngon ở Đà Nẵng",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 8,
            "current_day": 1,
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "culinary_guide"
    assert data["action_type"] == "view_on_map"
    assert "Mì Quảng" in data["reply_text"] or "Bún Chả Cá" in data["reply_text"]
    assert "Mẹo thưởng thức" in data["reply_text"]
    assert len(data["suggested_pois"]) > 0
    assert len(data["next_suggested_prompts"]) >= 3


def test_copilot_chat_cafe_culture(client: TestClient) -> None:
    payload = {
        "message": "quán cafe view đẹp ngắm cảnh ở Đà Nẵng",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 3,
            "current_day": 2,
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "cafe_culture"
    assert data["action_type"] == "view_on_map"
    assert len(data["suggested_pois"]) > 0
    assert len(data["next_suggested_prompts"]) > 0


def test_copilot_chat_travel_tips_budget(client: TestClient) -> None:
    payload = {
        "message": "kinh nghiệm chi phí du lịch và phương tiện xe buýt",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 3,
            "current_day": 1,
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "travel_tips_budget"
    assert data["action_type"] == "view_on_map"
    assert len(data["suggested_pois"]) > 0
    assert "ngân sách" in data["reply_text"].lower() or "tiết kiệm" in data["reply_text"].lower()


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


def test_copilot_chat_poi_advice_son_tra(client: TestClient) -> None:
    payload = {
        "message": "tôi có nên đi bán đảo sơn trà không",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 3,
            "current_day": 1,
            "current_slot": "morning",
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "poi_advice"
    assert data["action_type"] == "view_on_map"
    assert "Sơn Trà" in data["reply_text"]
    assert "Điểm mạnh" in data["reply_text"]
    assert "cân nhắc" in data["reply_text"].lower() or "không nên" in data["reply_text"].lower()
    assert len(data["suggested_pois"]) == 1
    poi = data["suggested_pois"][0]
    assert "Sơn Trà" in poi["name"]
    assert poi["gallery_urls"] is not None
    assert len(poi["gallery_urls"]) == 5
    assert len(set(poi["gallery_urls"])) == 5
    assert len(data["next_suggested_prompts"]) > 0




def test_copilot_fact_check_golden_bridge_in_hue(client: TestClient) -> None:
    payload = {
        "message": "Thêm Cầu Vàng ở Huế vào lịch",
        "trip_context": {
            "destination": "Đà Nẵng & Huế",
            "days_count": 4,
            "current_day": 3,
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent_category"] == "ITINERARY_MUTATION"
    assert data["fact_check_warning"] is not None
    first_para = data["reply_text"].split("\n\n")[0]
    assert "Bà Nà" in first_para and "Đà Nẵng" in first_para and "Huế" in first_para
    assert "Chào bạn! Mình là GreenTrip Copilot" not in data["reply_text"]
    assert data["updated_itinerary_state"] is not None
    assert data["reasoning_trace"]
    assert data["reply_text"].strip().endswith("?")


def test_copilot_slang_quiet_cafe_danang_strict_city_isolation(client: TestClient) -> None:
    payload = {
        "message": "rcm quán cf nào chill chill ở đn đi bro, ko ồn ào nha",
        "trip_context": {
            "destination": "Đà Nẵng & Huế",
            "days_count": 4,
            "current_day": 2,
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "cafe_culture"
    assert data["intent_category"] == "POI_RECOMMENDATION"
    assert "quiet_vibe" in data["detected_constraints"]
    assert "Cà phê muối" not in data["reply_text"]
    assert "Đà Nẵng" in data["reply_text"]
    assert len(data["suggested_pois"]) > 0
    assert data["recommended_poi_ids"] == [p["id"] for p in data["suggested_pois"]]

    for poi in data["suggested_pois"]:
        assert poi["city"] == "Đà Nẵng"
        assert "huế" not in poi["name"].lower()
        assert poi["kg_explanation"]


def test_copilot_consultative_comparison_danang_vs_hue(client: TestClient) -> None:
    payload = {
        "message": "Mình có 5 ngày nghỉ tháng 12, thích biển và đồ ăn ngon thì nên đi Đà Nẵng hay Huế?",
        "trip_context": {
            "destination": "Đà Nẵng & Huế",
            "days_count": 5,
            "current_day": 1,
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "qa_compare"
    assert data["intent_category"] == "QA_AND_COMPARE"
    first_para = data["reply_text"].split("\n\n")[0]
    assert "nghiêng rõ về Đà Nẵng" in first_para
    assert "Mỹ Khê" in data["reply_text"]
    assert "Khi nào bạn nên chọn Huế" in data["reply_text"]
    assert data["reply_text"].strip().endswith("?")


def test_copilot_persistent_constraints_elderly_parents(client: TestClient) -> None:
    payload = {
        "message": "Mình đi cùng bố mẹ lớn tuổi vào tháng 12 thì nên lưu ý và chọn điểm nào ở Đà Nẵng & Huế?",
        "trip_context": {
            "destination": "Đà Nẵng & Huế",
            "days_count": 4,
            "current_day": 1,
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent_category"] == "QA_AND_COMPARE"
    assert "elderly_friendly" in data["detected_constraints"]
    assert "rainy_season" in data["detected_constraints"]
    assert "Lăng Tự Đức" in data["reply_text"]
    assert "Lăng Khải Định" in data["reply_text"]
    assert "Sơn Trà" in data["reply_text"]
    assert "Green Score" in data["reply_text"]


def test_copilot_itinerary_mutation_split_nights_and_remove_stop(client: TestClient) -> None:
    # 1. Split 4 nights Da Nang, 3 nights Hue (math check against 6 days)
    split_payload = {
        "message": "Chia 4 đêm Đà Nẵng, 3 đêm Huế nhé",
        "trip_context": {
            "destination": "Đà Nẵng & Huế",
            "days_count": 6,
            "current_day": 1,
            "start_date": "2026-12-10",
        },
    }
    split_resp = client.post("/trips/copilot/chat", json=split_payload)
    assert split_resp.status_code == 200, split_resp.text
    split_data = split_resp.json()

    assert split_data["intent_category"] == "ITINERARY_MUTATION"
    assert split_data["updated_days_count"] == 7
    assert split_data["updated_itinerary_state"] is not None
    assert len(split_data["updated_itinerary_state"]) == 7
    assert "7 ngày" in split_data["reply_text"]

    # 2. Remove Lang Khai Dinh from Day 6
    remove_payload = {
        "message": "Bỏ Lăng Khải Định ra khỏi ngày 6",
        "trip_context": {
            "destination": "Đà Nẵng & Huế",
            "days_count": 7,
            "current_day": 6,
        },
    }
    rem_resp = client.post("/trips/copilot/chat", json=remove_payload)
    assert rem_resp.status_code == 200, rem_resp.text
    rem_data = rem_resp.json()

    assert rem_data["intent_category"] == "ITINERARY_MUTATION"
    assert "Lăng Khải Định" in rem_data["reply_text"]
    assert "Ngày 6" in rem_data["reply_text"]
    assert rem_data["updated_itinerary_state"] is not None

    # 3. Move Hoi An from Day 3 to Day 2
    swap_payload = {
        "message": "Đổi lịch đi Hội An từ ngày 3 sang ngày 2",
        "trip_context": {
            "destination": "Đà Nẵng & Huế",
            "days_count": 4,
            "current_day": 2,
        },
    }
    swap_resp = client.post("/trips/copilot/chat", json=swap_payload)
    assert swap_resp.status_code == 200, swap_resp.text
    swap_data = swap_resp.json()

    assert swap_data["intent_category"] == "ITINERARY_MUTATION"
    assert "Hội An" in swap_data["reply_text"]
    assert "Ngày 2" in swap_data["reply_text"]
    assert swap_data["updated_itinerary_state"] is not None


def test_copilot_out_of_scope_refusal_zero_pois(client: TestClient) -> None:
    for msg in ["Thời tiết Hà Nội hôm nay thế nào?", "Viết code Python crawl dữ liệu giúp mình"]:
        payload = {
            "message": msg,
            "trip_context": {
                "destination": "Đà Nẵng & Huế",
                "days_count": 4,
                "current_day": 1,
            },
        }
        response = client.post("/trips/copilot/chat", json=payload)
        assert response.status_code == 200, response.text
        data = response.json()

        assert data["intent_category"] == "OUT_OF_SCOPE"
        assert data["intent"] == "out_of_scope"
        assert data["suggested_pois"] == []
        assert data["recommended_poi_ids"] == []
        assert data["reply_text"].strip().endswith("?")


def test_copilot_over_scheduling_guardrail(client: TestClient) -> None:
    payload = {
        "message": "Sáng đi Bà Nà Hills, trưa Ngũ Hành Sơn, chiều Hội An, tối Đại Nội Huế trong 1 ngày được không?",
        "trip_context": {
            "destination": "Đà Nẵng & Huế",
            "days_count": 3,
            "current_day": 1,
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent_category"] == "QA_AND_COMPARE"
    assert data["fact_check_warning"] is not None
    assert "bất khả thi" in data["reply_text"].lower()


def test_copilot_green_train_hai_van_and_thuy_bieu_mutation(client: TestClient) -> None:
    payload = {
        "message": (
            "Chuyến đi từ Đà Nẵng ra Huế mình muốn ưu tiên phương tiện giao thông xanh hoặc "
            "trải nghiệm bền vững (ví dụ đi tàu hoả ngắm đèo Hải Vân thay vì đi ô tô). "
            "Bạn có thể cập nhật lại chặng di chuyển này và gợi ý thêm 1 trải nghiệm du lịch sinh thái/xanh ở Huế không?"
        ),
        "trip_context": {
            "destination": "Đà Nẵng & Huế",
            "days_count": 4,
            "current_day": 3,
            "traveler_name": "Minh Nguyên",
            "active_constraints": ["elderly_friendly"],
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent_category"] == "ITINERARY_MUTATION"
    assert data["action_type"] == "mutate_itinerary"
    assert "Nguyên ơi" in data["reply_text"]
    assert "Đèo Hải Vân" in data["reply_text"]
    assert "Thủy Biều" in data["reply_text"]
    assert data["reply_text"].strip().endswith("?")
    assert data["updated_itinerary_state"] is not None
    assert len(data["suggested_pois"]) == 2
    for poi in data["suggested_pois"]:
        assert poi["lat"] is not None and poi["lng"] is not None
        assert poi["kg_explanation"]
    names = " ".join(p["name"] for p in data["suggested_pois"])
    assert "Tàu hỏa" in names
    assert "Thủy Biều" in names


def test_copilot_chat_simple_xin_chao_is_concise(client: TestClient) -> None:
    payload = {
        "message": "xin chào",
        "trip_context": {
            "destination": "Đà Nẵng & Huế",
            "days_count": 7,
            "current_day": 1,
            "traveler_name": "Nguyên",
        },
    }
    response = client.post("/trips/copilot/chat", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["intent"] == "general_chat"
    assert data["suggested_pois"] == []
    assert data["reasoning_trace"] is None
    assert "Chào Nguyên" in data["reply_text"]
    assert "Gợi ý 3 trải nghiệm vàng" not in data["reply_text"]
    assert len(data["reply_text"]) < 260


def test_copilot_ideation_mode_handles_greeting_weather_and_duration_advice(client: TestClient) -> None:
    greet = client.post(
        "/trips/copilot/chat",
        json={
            "message": "xin chào",
            "trip_context": {"mode": "ideation", "destination": "Đà Nẵng & Huế", "days_count": 4, "current_day": 1},
        },
    )
    assert greet.status_code == 200, greet.text
    assert "Tạo lịch trình từ ý tưởng này" in greet.json()["reply_text"]

    weather = client.post(
        "/trips/copilot/chat",
        json={
            "message": "Tháng 11 đi Đà Nẵng Huế thời tiết thế nào, có hay mưa không?",
            "trip_context": {"mode": "ideation", "destination": "Đà Nẵng & Huế", "days_count": 4, "current_day": 1},
        },
    )
    assert weather.status_code == 200, weather.text
    assert weather.json()["intent"] == "travel_tips_budget"

    duration = client.post(
        "/trips/copilot/chat",
        json={
            "message": "Nên đi Đà Nẵng Huế mấy ngày thì vừa đẹp?",
            "trip_context": {"mode": "ideation", "destination": "Đà Nẵng & Huế", "days_count": 4, "current_day": 1},
        },
    )
    assert duration.status_code == 200, duration.text
    assert duration.json()["intent"] == "qa_compare"
    assert "4 đến 5 ngày" in duration.json()["reply_text"]


def test_copilot_unaccented_vietnamese_queries_and_homographs(client: TestClient) -> None:
    cases = [
        ("an gi o da nang", "POI_RECOMMENDATION", "culinary_guide"),
        ("quan cafe yen tinh", "POI_RECOMMENDATION", "cafe_culture"),
        ("troi mua to di dau", "POI_RECOMMENDATION", "rainy_day_alternatives"),
        ("co nen di ban dao son tra khong", "QA_AND_COMPARE", "poi_advice"),
        ("nen di da nang hay hue", "QA_AND_COMPARE", "qa_compare"),
        ("mua qua o cho han", "QA_AND_COMPARE", "travel_tips_budget"),
        ("thue xe may di ba na het bao nhieu", "QA_AND_COMPARE", "travel_tips_budget"),
        ("xin chao", "QA_AND_COMPARE", "general_chat"),
    ]
    for msg, expected_category, expected_intent in cases:
        resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": msg,
                "trip_context": {"destination": "Đà Nẵng", "days_count": 3, "current_day": 1},
            },
        )
        assert resp.status_code == 200, f"{msg}: {resp.text}"
        data = resp.json()
        assert data["intent_category"] == expected_category, f"{msg}: {data}"
        assert data["intent"] == expected_intent, f"{msg}: {data}"


def test_copilot_expanded_out_of_scope_and_date_range_safety(client: TestClient) -> None:
    for msg in [
        "2 + 2 bằng mấy",
        "tìm x biết 2x + 3 = 7",
        "debug react giúp mình",
        "viet code python giup minh",
        "ha noi an gi ngon",
    ]:
        resp = client.post(
            "/trips/copilot/chat",
            json={
                "message": msg,
                "trip_context": {"destination": "Đà Nẵng", "days_count": 3, "current_day": 1},
            },
        )
        assert resp.status_code == 200, f"{msg}: {resp.text}"
        data = resp.json()
        assert data["intent_category"] == "OUT_OF_SCOPE", f"{msg}: {data}"
        assert data["intent"] == "out_of_scope", f"{msg}: {data}"

    # Date range with hyphen must NEVER be treated as math OUT_OF_SCOPE
    date_resp = client.post(
        "/trips/copilot/chat",
        json={
            "message": "Lịch đi 10 - 12 tháng 11 ở Đà Nẵng nên chuẩn bị gì?",
            "trip_context": {"destination": "Đà Nẵng", "days_count": 3, "current_day": 1},
        },
    )
    assert date_resp.status_code == 200, date_resp.text
    assert date_resp.json()["intent_category"] != "OUT_OF_SCOPE"


def test_normalize_poi_price_display_units() -> None:
    from app.pois.price_normalizer import normalize_poi_price_display

    bep_cuon = normalize_poi_price_display(
        "Nhà Hàng Bếp Cuốn Đà Nẵng (Đạt giải MICHELIN Bib Gourmand)",
        "Ẩm thực và quán ăn",
        "street_bites_rolls",
        "20.000₫ – 45.000₫ / ly",
        35000,
    )
    assert "/ người" in bep_cuon
    assert "/ ly" not in bep_cuon

    com_hen = normalize_poi_price_display(
        "Cơm Hến Bà Cam", "Ẩm thực và quán ăn", "traditional_noodles", "20.000₫ – 45.000₫ / ly", 30000
    )
    assert "/ phần" in com_hen

    bun_mam = normalize_poi_price_display(
        "Bún Mắm Vân", "Ẩm thực và quán ăn", "traditional_noodles", "20.000₫ – 45.000₫ / ly", 40000
    )
    assert "/ tô" in bun_mam

    che_chuoi = normalize_poi_price_display(
        "Chè Chuối Nướng Ông Ích Khiêm", "Ẩm thực và quán ăn", "street_bites_rolls", "18.000₫ – 35.000₫ / ly", 25000
    )
    assert "/ ly" in che_chuoi

    ca_phe_muoi = normalize_poi_price_display(
        "Cà Phê Muối 10 Nguyễn Lương Bằng (Quán Gốc)",
        "Quán cafe giải khát",
        "retro_street_cafe",
        "20.000₫ – 45.000₫ / ly",
        30000,
    )
    assert "/ ly" in ca_phe_muoi

    son_tra_beach = normalize_poi_price_display(
        "Bãi Bụt Sơn Trà",
        "Cảnh quan và thiên nhiên",
        None,
        "Khoảng 135.000 ₫ / ly",
        135000,
    )
    assert "/ vé" in son_tra_beach
    assert "/ ly" not in son_tra_beach

    thanh_tra = normalize_poi_price_display(
        "Thanh Trà Vegetarian",
        "Ẩm thực và quán ăn",
        "green_vegetarian",
        "40.000₫ – 85.000₫ / ly",
        60000,
    )
    assert "/ phần" in thanh_tra

    cho_dem_son_tra = normalize_poi_price_display(
        "Chợ Đêm Sơn Trà",
        "Ẩm thực và quán ăn",
        "traditional_night_markets",
        "35.000₫ – 75.000₫ / ấm / ly",
        50000,
    )
    assert cho_dem_son_tra == "35.000₫ – 75.000₫ / phần"



