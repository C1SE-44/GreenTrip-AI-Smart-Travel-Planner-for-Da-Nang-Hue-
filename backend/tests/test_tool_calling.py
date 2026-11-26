"""Unit tests for GreenTrip Tool Calling Architecture."""

from __future__ import annotations

import pytest
from app.tools.registry import get_default_tool_registry


@pytest.fixture
def registry():
    return get_default_tool_registry()


def test_registry_contains_all_sprint2_tools(registry):
    tools = registry.list_tools()
    expected = [
        "search_pois",
        "get_poi_details",
        "recommend_pois",
        "get_poi_explanation",
        "calculate_trip_cost",
        "get_route_information",
        "get_carbon_estimate",
        "rag_travel_knowledge",
    ]
    for t in expected:
        assert t in tools


def test_execute_unregistered_tool(registry):
    res = registry.execute_tool("nonexistent_hack_tool", {"arg": "val"})
    assert res["success"] is False
    assert "not registered" in res["error"]


def test_search_pois_valid_and_limit(registry):
    res = registry.execute_tool("search_pois", {"query": "Bảo tàng", "city": "Danang", "limit": 3})
    assert res["success"] is True
    data = res["data"]
    assert 0 <= data["total_found"] <= 3
    for p in data["pois"]:
        assert p["name"]
        assert p["city"]


def test_search_pois_input_validation(registry):
    # limit must be between 1 and 20
    res = registry.execute_tool("search_pois", {"query": "Bảo tàng", "limit": 999})
    assert res["success"] is False
    assert "Invalid arguments" in res["error"]


def test_get_poi_details(registry):
    # Lookup existing POI by name or ID
    res = registry.execute_tool("get_poi_details", {"poi_id": "Bảo Tàng Điêu Khắc Chăm Đà Nẵng"})
    assert res["success"] is True
    assert res["data"]["found"] is True
    assert res["data"]["poi"]["name"]


def test_get_poi_details_nonexistent(registry):
    res = registry.execute_tool("get_poi_details", {"poi_id": "nonexistent_fake_poi_12345"})
    assert res["success"] is True
    assert res["data"]["found"] is False


def test_recommend_pois(registry):
    res = registry.execute_tool(
        "recommend_pois",
        {"interests": ["chay", "di sản"], "city": "Hue", "budget_band": 2, "limit": 3},
    )
    assert res["success"] is True
    assert res["data"]["total_found"] > 0
    for rec in res["data"]["recommendations"]:
        assert "hue" in rec["city"].lower()


def test_get_poi_explanation_knowledge_graph(registry):
    # Uses Neo4j or safe relational fallback, returning structured facts and natural justification
    res = registry.execute_tool("get_poi_explanation", {"poi_id": "Bảo tàng Cổ vật Cung đình Huế"})
    assert res["success"] is True
    data = res["data"]
    assert data["poi_name"]
    assert isinstance(data["facts"], list)
    assert "GreenTrip đề xuất" in data["explanation_text"]


def test_calculate_trip_cost(registry):
    res = registry.execute_tool(
        "calculate_trip_cost",
        {"num_days": 3, "num_people": 2, "budget_tier": "standard"},
    )
    assert res["success"] is True
    data = res["data"]
    assert data["total_estimated_cost_vnd"] == 1_150_000 * 3 * 2
    assert "accommodation_vnd" in data["budget_breakdown"]


def test_calculate_trip_cost_validation(registry):
    # num_days cannot exceed 14
    res = registry.execute_tool(
        "calculate_trip_cost",
        {"num_days": 20, "num_people": 2, "budget_tier": "standard"},
    )
    assert res["success"] is False
    assert "Invalid arguments" in res["error"]


def test_get_route_information(registry):
    res = registry.execute_tool(
        "get_route_information",
        {"origin_lat": 16.07, "origin_lng": 108.22, "dest_lat": 16.08, "dest_lng": 108.23},
    )
    assert res["success"] is True
    data = res["data"]
    assert data["distance_km"] > 0
    assert data["duration_seconds"] > 0


def test_get_carbon_estimate(registry):
    res = registry.execute_tool(
        "get_carbon_estimate",
        {"distance_km": 20.0, "transport_mode": "car"},
    )
    assert res["success"] is True
    data = res["data"]
    assert data["co2_kg"] == 3.42  # Updated: hệ số xe hơi 171 g/km → 20 km × 0.171 = 3.42 kg (BUG-01)
    assert data["potential_savings_co2_kg"] > 0


def test_rag_travel_knowledge_tool(registry):
    res = registry.execute_tool(
        "rag_travel_knowledge",
        {"query": "ẩm thực chay", "city": "Hue", "top_k": 2},
    )
    assert res["success"] is True
    assert res["data"]["total_found"] > 0
    for item in res["data"]["knowledge_items"]:
        assert item["source"]
        assert item["snippet"]


def test_gemini_tool_declarations_schema(registry):
    declarations = registry.get_gemini_tool_declarations()
    assert len(declarations) >= 8
    names = [d["name"] for d in declarations]
    assert "search_pois" in names
    assert "rag_travel_knowledge" in names
    for d in declarations:
        assert "description" in d
        assert "parameters" in d
        assert d["parameters"]["type"] == "OBJECT"
