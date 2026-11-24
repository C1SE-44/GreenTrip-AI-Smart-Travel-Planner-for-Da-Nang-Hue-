"""Regression tests for Phase 1: province lock, Linh Ung disambiguation, 0 VND pricing, and dynamic transport."""
from app.pois.price_normalizer import normalize_poi_price_display
from app.recommendations.service import _resolved_cost_vnd
from app.trips.copilot_enrichment import (
    enrich_pois_with_kg_and_filter_city,
    recommend_transport_for_leg,
    resolve_poi_coordinates,
)
from app.trips.schemas import CopilotSuggestedPoiItem


def test_free_markets_and_zero_cost_pois_stay_free():
    assert normalize_poi_price_display("Chợ Cồn", category="Di tích lịch sử và văn hóa", estimated_cost=0) == "Miễn phí tham quan"
    assert normalize_poi_price_display("Chợ Đông Ba", category="Di tích lịch sử và văn hóa", estimated_cost=0) == "Miễn phí tham quan"
    assert normalize_poi_price_display("Chợ Hàn", category="Di tích lịch sử và văn hóa", raw_price_display=None, estimated_cost=0) == "Miễn phí tham quan"
    assert _resolved_cost_vnd({"estimated_cost": 0}, default=50000.0) == 0.0
    assert _resolved_cost_vnd({"effective_estimated_cost": 0, "estimated_cost": 0}, default=50000.0) == 0.0
    assert _resolved_cost_vnd({"estimated_cost": None}, default=50000.0) == 50000.0


def test_linh_ung_pagodas_resolve_distinct_coordinates():
    bn_lat, bn_lng = resolve_poi_coordinates("Chùa Linh Ứng Bà Nà", "Đà Nẵng")
    st_lat, st_lng = resolve_poi_coordinates("Chùa Linh Ứng Bãi Bụt (Sơn Trà)", "Đà Nẵng")
    nn_lat, nn_lng = resolve_poi_coordinates("Chùa Linh Ứng Non Nước", "Đà Nẵng")

    assert abs(bn_lat - 15.9989) < 0.01 and abs(bn_lng - 107.9946) < 0.01
    assert abs(st_lat - 16.1046) < 0.01 and abs(st_lng - 108.2789) < 0.01
    assert abs(nn_lat - 16.0076) < 0.01 and abs(nn_lng - 108.2674) < 0.01


def test_hue_query_blocks_danang_and_hoian_pois():
    pois = [
        CopilotSuggestedPoiItem(
            id="hue-1", name="Làng sinh thái Thủy Biều", category="Cảnh quan", city="Huế",
            image_url="x", green_score=95, rating=4.8, address="Thủy Biều, TP. Huế", swap_reason="ok",
        ),
        CopilotSuggestedPoiItem(
            id="ha-1", name="Phố cổ Hội An", category="Di tích", city="",
            image_url="x", green_score=90, rating=4.8, address="Hội An, Quảng Nam", swap_reason="ok",
        ),
        CopilotSuggestedPoiItem(
            id="dn-1", name="Chùa Linh Ứng Bà Nà", category="Tâm linh", city="",
            image_url="x", green_score=85, rating=4.7, address="Hòa Ninh, Hòa Vang", swap_reason="ok",
        ),
    ]
    filtered = enrich_pois_with_kg_and_filter_city(pois, "Huế", False, [])
    assert [p.id for p in filtered] == ["hue-1"]


def test_recommend_transport_for_leg_varies_by_distance_and_group():
    short_couple = recommend_transport_for_leg(1.0, num_people=2, constraints=[])
    assert "đi bộ" in short_couple.lower()

    family_mid = recommend_transport_for_leg(4.0, num_people=5, constraints=["elderly_friendly"])
    assert "taxi điện" in family_mid.lower() or "ô tô điện" in family_mid.lower()

    intercity = recommend_transport_for_leg(95.0, num_people=2, constraints=[], is_intercity=True)
    assert "tàu hỏa" in intercity.lower()


def test_neo4j_cooldown_triggers_fast_relational_fallback_with_pillars(monkeypatch):
    from app.db import neo4j as neo4j_mod
    from app.pois import explanation_repository

    neo4j_mod.reset_neo4j_cooldown()
    call_count = 0

    class FailingDriver:
        def session(self, **_kwargs):
            nonlocal call_count
            call_count += 1
            raise RuntimeError("Neo4j Aura sleeping")

    monkeypatch.setattr(explanation_repository, "get_driver", lambda: FailingDriver())
    res1 = explanation_repository.fetch_poi_explanation_facts("Chợ Cồn")
    res2 = explanation_repository.fetch_poi_explanation_facts("Chợ Cồn")

    assert call_count == 1  # Second call skipped Neo4j immediately due to circuit-breaker cooldown
    assert res1 is not None and res2 is not None
    assert res1["explanation_source"] == "relational_fallback"
    assert len(res1["green_score_breakdown"]) == 4
    assert sum(p["weight_pct"] for p in res1["green_score_breakdown"]) == 100
    neo4j_mod.reset_neo4j_cooldown()


def test_pasted_tiktok_link_is_handled_gracefully_not_as_math():
    from app.trips.copilot_intent import classify_copilot_request
    from app.trips.schemas import TripContextPayload

    ctx = TripContextPayload(destination="Huế", days_count=2, current_day=1)
    cat, sub_intent, meta = classify_copilot_request(
        "https://www.tiktok.com/@huefood/video/7412345678901234567?is_from_webapp=1",
        ctx,
    )
    assert cat == "QA_AND_COMPARE"
    assert sub_intent == "external_link_guidance"
    assert meta is not None and meta["platform"] == "TikTok"
