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


def test_neo4j_cooldown_triggers_verified_relational_fallback(monkeypatch):
    from app.db import neo4j as neo4j_mod
    from app.pois import explanation_repository

    neo4j_mod.reset_neo4j_cooldown()
    call_count = 0
    fallback_payload = explanation_repository._build_facts_payload(
        poi_id="cho-con",
        name="Cho Con market",
        is_local=True,
        btype="market",
        category_key="local_market",
        cat_name="Local market",
        city_name="Da Nang",
        city_code="DANANG",
        fact_source="POSTGRESQL_FALLBACK",
    )

    class FailingDriver:
        def session(self, **_kwargs):
            nonlocal call_count
            call_count += 1
            raise RuntimeError("Neo4j Aura sleeping")

    monkeypatch.setattr(explanation_repository, "get_driver", lambda: FailingDriver())
    monkeypatch.setattr(
        explanation_repository,
        "_fetch_from_relational_db",
        lambda _poi_id: explanation_repository._RelationalLookup("found", fallback_payload),
    )
    res1 = explanation_repository.fetch_poi_explanation_facts("cho-con")
    res2 = explanation_repository.fetch_poi_explanation_facts("cho-con")

    assert call_count == 1
    assert res1 == fallback_payload and res2 == fallback_payload
    assert res1["fact_source"] == "POSTGRESQL_FALLBACK"
    assert [fact["relationship"] for fact in res1["facts"]] == ["IN_CATEGORY", "LOCATED_IN"]
    neo4j_mod.reset_neo4j_cooldown()


def test_pasted_tiktok_link_is_handled_gracefully_not_as_math():
    from app.trips.copilot_intent import classify_copilot_request
    from app.trips.schemas import TripContextPayload

    ctx = TripContextPayload(destination="Huế", days_count=2, current_day=1)
    for url in [
        "https://www.tiktok.com/@huefood/video/7412345678901234567?is_from_webapp=1",
        "vt.tiktok.com/ZSY9abc123/",
    ]:
        cat, sub_intent, meta = classify_copilot_request(url, ctx)
        assert cat == "QA_AND_COMPARE"
        assert sub_intent == "external_link_guidance"
        assert meta is not None and meta["platform"] == "TikTok"


def test_poi_advice_disambiguates_three_linh_ung_pagodas():
    from app.trips.handlers.poi_advice_handler import extract_advice_target

    assert extract_advice_target("Đi Chùa Linh Ứng Sơn Trà có đẹp không?") == "chùa linh ứng bãi bụt"
    assert extract_advice_target("Chùa Linh Ứng Bà Nà ở đâu?") == "chùa linh ứng bà nà"
    assert extract_advice_target("Chùa Linh Ứng Non Nước Ngũ Hành Sơn") == "chùa linh ứng non nước"


def test_budget_estimate_and_concise_closing_questions():
    from app.trips.copilot_enrichment import estimate_trip_budget_summary
    from app.trips.copilot_consultant import handle_out_of_scope_request
    from app.trips.schemas import BudgetTier, TripContextPayload

    summary = estimate_trip_budget_summary(days_count=3, num_people=2, budget_tier=BudgetTier.STANDARD)
    assert summary["tier_label"] == "$$ Tiêu chuẩn"
    assert summary["group_total_min"] == 1_100_000 * 3 * 2
    assert "2 người × 3 ngày" in summary["summary_text"]

    ctx = TripContextPayload(destination="Huế", days_count=3, num_people=2, budget_tier=BudgetTier.STANDARD)
    oos = handle_out_of_scope_request("Hôm nay chứng khoán thế nào?", "chứng khoán", ctx, [])
    assert oos.reply_text.strip().endswith("?")
    assert "A —" not in oos.reply_text and "B —" not in oos.reply_text


def test_pdf_service_uses_bundled_vietnamese_unicode_ttf():
    from app.trips import pdf_service
    from app.trips.schemas import ItineraryDay, ItineraryStop, TripItineraryResponse

    assert (pdf_service._BUNDLED_FONT_DIR / "DejaVuSans.ttf").exists()
    assert (pdf_service._BUNDLED_FONT_DIR / "DejaVuSans-Bold.ttf").exists()

    reg_font, bold_font = pdf_service._ensure_unicode_fonts()
    assert reg_font == "GT-Unicode"
    assert bold_font == "GT-Unicode-Bold"
    assert pdf_service._UNICODE_FONT_REGISTERED is True
    assert pdf_service._clean_for_pdf("Đại Nội Huế · 150.000 ₫") == "Đại Nội Huế · 150.000 ₫"

    itinerary = TripItineraryResponse(
        trip_id="trip-vn-pdf",
        title="Hành trình Xanh Đà Nẵng – Huế (Ước tính 3 ngày)",
        destination="Huế",
        days_count=1,
        days=[
            ItineraryDay(
                day_id="day-1",
                day_number=1,
                title="Ngày 1: Làng sinh thái Thủy Biều & Đại Nội Huế",
                stops=[
                    ItineraryStop(
                        stop_id="s-1",
                        title="Làng sinh thái Thủy Biều (Vườn bưởi Thanh Trà)",
                        city="Huế",
                        category="Cảnh quan",
                        sequence=0,
                        duration_minutes=120,
                        start_time="08:00",
                        end_time="10:00",
                    )
                ],
            )
        ],
    )
    pdf_bytes = pdf_service.generate_itinerary_pdf(itinerary)
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 2000
