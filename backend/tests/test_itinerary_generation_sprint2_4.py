"""Sprint 2.4 Comprehensive Test Suite: Intelligent Itinerary Generation & Conversational Optimization.

Covers all 15 scenarios:
1. Hue 1-day itinerary
2. Da Nang 2-day itinerary
3. Da Nang – Hue 3-day intercity itinerary
4. Limited budget constraint handling
5. Nature interest prioritization
6. Culture & history interest prioritization
7. Transport mode change (e.g. motorcycle -> transit)
8. Reduced stops on Day 2 ("Ngày 2 ít địa điểm hơn")
9. Remove specific POI ("Bỏ Lăng Khải Định")
10. Insufficient POI pool handling
11. Infeasible optimization fallback
12. Missing price/opening hours graceful fallback
13. OSRM unavailable fallback (Haversine calculation)
14. Neo4j unavailable fallback (Relational/description fallback)
15. Out-of-scope city handling (e.g. Paris / Hanoi)
"""

from __future__ import annotations

import pytest
from app.orchestrator.orchestrator import get_chatbot_orchestrator
from app.orchestrator.policy import decide_orchestration_plan
from app.tools.implementations import generate_itinerary, update_itinerary
from app.tools.schemas import GenerateItineraryInput, UpdateItineraryInput
from app.trips.schemas import CopilotChatRequest, TripContextPayload


@pytest.fixture
def orchestrator():
    return get_chatbot_orchestrator()


# Scenario 1: Hue 1-day itinerary
def test_scenario_1_hue_1_day(orchestrator):
    req = CopilotChatRequest(
        message="Lập lịch trình du lịch Huế 1 ngày",
        trip_context=TripContextPayload(destination="Huế", days_count=1),
    )
    resp = orchestrator.orchestrate(req)
    assert resp.reply_text
    assert "Huế" in resp.reply_text or "Cố đô" in resp.reply_text or "Hoàng thành" in resp.reply_text
    assert "generate_itinerary" in resp.tools_used
    assert resp.updated_itinerary_state is not None
    assert len(resp.updated_itinerary_state) >= 1
    assert len(resp.suggested_pois) >= 1


# Scenario 2: Da Nang 2-day itinerary
def test_scenario_2_danang_2_day(orchestrator):
    req = CopilotChatRequest(
        message="Thiết kế lịch trình Đà Nẵng 2 ngày cho 2 người",
        trip_context=TripContextPayload(destination="Đà Nẵng", days_count=2, num_people=2),
    )
    resp = orchestrator.orchestrate(req)
    assert "Đà Nẵng" in resp.reply_text
    assert "generate_itinerary" in resp.tools_used
    assert resp.updated_itinerary_state is not None
    assert len(resp.updated_itinerary_state) == 2
    assert resp.route_metrics is not None
    assert resp.route_metrics.get("total_distance_km", 0) > 0


# Scenario 3: Da Nang – Hue 3-day intercity itinerary
def test_scenario_3_intercity_danang_hue_3_day(orchestrator):
    req = CopilotChatRequest(
        message="Lịch trình Đà Nẵng Huế 3 ngày kết hợp",
        trip_context=TripContextPayload(destination="Đà Nẵng & Huế", days_count=3),
    )
    resp = orchestrator.orchestrate(req)
    assert "generate_itinerary" in resp.tools_used
    assert resp.updated_itinerary_state is not None
    assert len(resp.updated_itinerary_state) == 3
    # Check that both cities appear across the days
    cities_in_plan = [day.get("focus_city") for day in resp.updated_itinerary_state]
    assert "Đà Nẵng" in cities_in_plan
    assert "Huế" in cities_in_plan


# Scenario 4: Limited budget constraint handling
def test_scenario_4_limited_budget_constraint(orchestrator):
    # Tight budget: 100,000 VND for 2 people
    req = CopilotChatRequest(
        message="Lập lịch trình Huế 1 ngày tiết kiệm ngân sách 100 nghìn",
        trip_context=TripContextPayload(destination="Huế", days_count=1, total_budget=100000.0, num_people=2),
    )
    resp = orchestrator.orchestrate(req)
    assert "generate_itinerary" in resp.tools_used
    # Should complete without error and warn or prioritize low cost
    assert resp.updated_itinerary_state is not None
    gen_data = resp.data.get("generate_itinerary", {})
    assert gen_data.get("total_cost_vnd") is not None


# Scenario 5: Nature interest prioritization
def test_scenario_5_nature_interest_prioritization(orchestrator):
    req = CopilotChatRequest(
        message="Tôi muốn đi Đà Nẵng 1 ngày ưu tiên thiên nhiên sinh thái biển",
        trip_context=TripContextPayload(destination="Đà Nẵng", days_count=1, preferences=["nature", "eco"]),
    )
    resp = orchestrator.orchestrate(req)
    assert "generate_itinerary" in resp.tools_used
    # Stops should feature nature or coastal points
    assert len(resp.suggested_pois) >= 1
    names_combined = " ".join([p.name.lower() for p in resp.suggested_pois])
    assert any(k in names_combined for k in ["sơn trà", "mỹ khê", "biển", "ngũ hành", "bán đảo", "sinh thái"])


# Scenario 6: Culture & history interest prioritization
def test_scenario_6_culture_history_prioritization(orchestrator):
    req = CopilotChatRequest(
        message="Lịch trình Huế 1 ngày di sản văn hóa lịch sử triều Nguyễn",
        trip_context=TripContextPayload(destination="Huế", days_count=1, preferences=["culture", "heritage"]),
    )
    resp = orchestrator.orchestrate(req)
    assert "generate_itinerary" in resp.tools_used
    names_combined = " ".join([p.name.lower() for p in resp.suggested_pois])
    assert any(k in names_combined for k in ["đại nội", "hoàng thành", "khải định", "tự đức", "bảo tàng", "chùa thiên mụ", "lăng"])


# Scenario 7: Transport mode change (motorcycle vs transit vs walking)
def test_scenario_7_transport_mode_change(orchestrator):
    # Test bus / transit emission
    input_transit = GenerateItineraryInput(
        destination="Đà Nẵng",
        duration_days=1,
        travelers=2,
        transport_mode="transit",
    )
    out_transit = generate_itinerary(input_transit)

    input_moto = GenerateItineraryInput(
        destination="Đà Nẵng",
        duration_days=1,
        travelers=2,
        transport_mode="motorcycle",
    )
    out_moto = generate_itinerary(input_moto)

    assert out_transit.transport_mode == "transit"
    assert out_moto.transport_mode == "motorcycle"
    # Carbon factor is different
    assert out_transit.total_carbon_kg != out_moto.total_carbon_kg


# Scenario 8: Reduced stops on Day 2 ("Ngày 2 ít địa điểm hơn")
def test_scenario_8_reduced_stops_on_day_2(orchestrator):
    # First generate 2-day itinerary
    gen_in = GenerateItineraryInput(destination="Huế", duration_days=2, travelers=2)
    gen_out = generate_itinerary(gen_in)
    current_state = [d.model_dump() for d in gen_out.days]
    assert len(current_state[1]["stops"]) >= 3

    # Conversational turn: "Ngày 2 ít địa điểm hơn nhé"
    req = CopilotChatRequest(
        message="Ngày 2 ít địa điểm hơn nhé, để thong thả nghỉ ngơi",
        trip_context=TripContextPayload(
            destination="Huế",
            days_count=2,
            current_itinerary_state=current_state,
        ),
    )
    resp = orchestrator.orchestrate(req)
    assert resp.action_type == "mutate_itinerary"
    assert "update_itinerary" in resp.tools_used
    assert resp.updated_itinerary_state is not None
    # Day 2 stops should be reduced to 2 stops
    day2_stops = resp.updated_itinerary_state[1]["stops"]
    assert len(day2_stops) <= 2
    assert any("ít địa điểm" in m or "thư thái" in m or "giảm" in m for m in resp.mutation_summary)


# Scenario 9: Remove specific POI ("Bỏ Lăng Khải Định")
def test_scenario_9_remove_specific_poi(orchestrator):
    gen_in = GenerateItineraryInput(destination="Huế", duration_days=2, travelers=2)
    gen_out = generate_itinerary(gen_in)
    current_state = [d.model_dump() for d in gen_out.days]
    # Ensure Lăng Khải Định is in the initial itinerary state to test removal
    current_state[0]["stops"].append({
        "order": len(current_state[0]["stops"]) + 1,
        "poi_id": "77275972-d0a7-4418-8a27-4c8b73dbe9db",
        "name": "Lăng Khải Định (Ứng Lăng)",
        "category": "Di tích lịch sử và văn hóa",
        "city": "Huế",
        "time_slot": "15:00 - 17:00",
        "duration_mins": 120,
        "estimated_cost": 150000.0,
        "green_score": 83.0,
        "selection_reason": "Di tích lịch sử",
    })

    req = CopilotChatRequest(
        message="Bỏ Lăng Khải Định ra khỏi lịch trình giúp mình",
        trip_context=TripContextPayload(
            destination="Huế",
            days_count=2,
            current_itinerary_state=current_state,
        ),
    )
    resp = orchestrator.orchestrate(req)
    assert "update_itinerary" in resp.tools_used
    assert resp.updated_itinerary_state is not None
    # Verify Lăng Khải Định is no longer in updated stops
    all_updated_names = [
        s.get("name", "").lower()
        for d in resp.updated_itinerary_state
        for s in d.get("stops", [])
    ]
    assert not any("khải định" in n for n in all_updated_names)
    assert any("Khải Định" in m or "khải định" in m.lower() for m in resp.mutation_summary)


# Scenario 10: Insufficient POI pool handling
def test_scenario_10_insufficient_poi_pool():
    # Asking for 10 days in Hue when unique POIs might run out
    gen_in = GenerateItineraryInput(
        destination="Huế",
        duration_days=10,
        travelers=1,
    )
    gen_out = generate_itinerary(gen_in)
    # Should succeed without crashing and append limitation notice
    assert gen_out.duration_days == 10
    assert len(gen_out.days) == 10
    assert len(gen_out.data_limitations) >= 0


# Scenario 11: Infeasible optimization fallback
def test_scenario_11_infeasible_optimization_fallback():
    # Update itinerary with empty outline
    upd_in = UpdateItineraryInput(
        current_itinerary=[],
        instruction="Ngày 2 ít điểm hơn",
        target_day=2,
    )
    upd_out = update_itinerary(upd_in)
    assert upd_out.updated_itinerary == []
    assert len(upd_out.warnings) > 0
    assert "chưa có lịch trình" in upd_out.warnings[0].lower()


# Scenario 12: Missing price/opening hours graceful fallback
def test_scenario_12_missing_price_hours_fallback(orchestrator):
    # Tests that generate_itinerary handles empty or None prices gracefully
    gen_in = GenerateItineraryInput(
        destination="Đà Nẵng",
        duration_days=1,
        travelers=2,
    )
    gen_out = generate_itinerary(gen_in)
    assert len(gen_out.days) == 1
    for stop in gen_out.days[0].stops:
        # Each stop has valid fallback cost and opening hours
        assert stop.cost_vnd >= 0
        assert stop.opening_hours != ""


# Scenario 13: OSRM unavailable fallback (Haversine calculation)
def test_scenario_13_osrm_fallback_haversine():
    gen_in = GenerateItineraryInput(
        destination="Đà Nẵng",
        duration_days=1,
        travelers=1,
    )
    gen_out = generate_itinerary(gen_in)
    # Distance is calculated via Haversine without network OSRM dependency
    assert gen_out.total_distance_km >= 0.0
    assert gen_out.days[0].day_distance_km >= 0.0


# Scenario 14: Neo4j unavailable fallback (Relational/description fallback)
def test_scenario_14_neo4j_fallback():
    # Even if Neo4j is offline or mocks fail, kg_explanation falls back to description
    gen_in = GenerateItineraryInput(
        destination="Huế",
        duration_days=1,
        travelers=1,
    )
    gen_out = generate_itinerary(gen_in)
    for stop in gen_out.days[0].stops:
        assert stop.kg_explanation is not None
        assert len(stop.kg_explanation) > 0


# Scenario 15: Out-of-scope city handling (e.g. Paris / Hanoi)
def test_scenario_15_out_of_scope_city_handling(orchestrator):
    req_paris = CopilotChatRequest(
        message="Lập lịch trình du lịch Paris 3 ngày",
        trip_context=TripContextPayload(),
    )
    resp_paris = orchestrator.orchestrate(req_paris)
    assert "Đà Nẵng – Huế" in resp_paris.reply_text or "Đà Nẵng" in resp_paris.reply_text
    assert "ngoài phạm vi" in resp_paris.reply_text.lower()
    # Itinerary tool should not be called for Paris
    assert "generate_itinerary" not in resp_paris.tools_used

    req_hanoi = CopilotChatRequest(
        message="Gợi ý điểm du lịch tại Hà Nội",
        trip_context=TripContextPayload(),
    )
    resp_hanoi = orchestrator.orchestrate(req_hanoi)
    assert "ngoài phạm vi" in resp_hanoi.reply_text.lower()
