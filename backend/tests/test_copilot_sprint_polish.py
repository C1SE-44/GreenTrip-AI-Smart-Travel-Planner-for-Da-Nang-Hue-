"""Unit tests for Sprint Polish: Geographic Hard Filter, Homonym Disambiguation, Free Pricing, Anti-Repeat & Smooth TikTok UX."""
from __future__ import annotations

import csv
from pathlib import Path
from unittest.mock import patch

from app.pois.price_normalizer import normalize_poi_price_display
from app.trips.copilot_attachments import process_copilot_attachment
from app.trips.copilot_consultant import (
    GREENTRIP_COPILOT_SYSTEM_PROMPT,
    deduplicate_pois_against_session,
    finalize_copilot_response,
)
from app.trips.copilot_enrichment import (
    enrich_pois_with_kg_and_filter_city,
    ensure_closing_ab_hook,
    is_poi_allowed_in_city,
    score_homonym_disambiguation,
)
from app.trips.schemas import (
    CopilotAttachmentPayload,
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotSuggestedPoiItem,
    TripContextPayload,
)


class _DummyCursor:
    def __init__(self, rows: list[tuple]) -> None:
        self._rows = rows

    def __enter__(self) -> "_DummyCursor":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, query: str, params: tuple = ()) -> None:
        return None

    def fetchall(self) -> list[tuple]:
        return list(self._rows)


class _DummyConn:
    def __init__(self, rows: list[tuple]) -> None:
        self._rows = rows

    def cursor(self) -> _DummyCursor:
        return _DummyCursor(self._rows)


MIXED_CITY_AND_HOMONYM_ROWS = [
    (
        "poi-linh-ung-ba-na",
        "Chùa Linh Ứng Bà Nà",
        "Chùa & Tâm linh",
        "temple",
        "Đà Nẵng",
        "Khu du lịch Bà Nà Hills, Hòa Ninh, Hòa Vang, Đà Nẵng",
        "Chùa trên đỉnh Bà Nà",
        0,
        90,
        4.7,
        15.9985,
        107.9889,
        "https://example.com/linh-ung-bana.jpg",
    ),
    (
        "poi-linh-ung-bai-but",
        "Chùa Linh Ứng Bãi Bụt",
        "Chùa & Tâm linh",
        "temple",
        "Đà Nẵng",
        "Hoàng Sa, Thọ Quang, Sơn Trà, Đà Nẵng",
        "Ngôi chùa nổi tiếng trên bán đảo Sơn Trà với tượng Phật Bà Quan Âm",
        0,
        95,
        4.9,
        16.1003,
        108.2778,
        "https://example.com/linh-ung-sontra.jpg",
    ),
    (
        "poi-hoi-an",
        "Phố Cổ Hội An",
        "Di tích lịch sử và văn hóa",
        "old_town",
        "Hội An",
        "Phường Minh An, Hội An, Quảng Nam",
        "Di sản phố cổ đèn lồng",
        120000,
        96,
        4.9,
        15.8801,
        108.3380,
        "https://example.com/hoi-an.jpg",
    ),
    (
        "poi-dai-noi-hue",
        "Đại Nội Huế",
        "Di tích lịch sử và văn hóa",
        "imperial_citadel",
        "Huế",
        "Đường 23/8, Thuận Hòa, TP. Huế",
        "Quần thể di tích Cố đô Huế",
        200000,
        95,
        4.9,
        16.4698,
        107.5784,
        "https://example.com/dai-noi.jpg",
    ),
    (
        "poi-lang-huong",
        "Làng Hương Thủy Xuân",
        "Di tích lịch sử và văn hóa",
        "craft_village",
        "Huế",
        "84 Huyền Trân Công Chúa, Thủy Xuân, TP. Huế",
        "Làng nghề làm hương truyền thống bản địa xứ Huế",
        0,
        93,
        4.8,
        16.4352,
        107.5581,
        "https://example.com/lang-huong.jpg",
    ),
    (
        "poi-tam-giang",
        "Đầm Chuồn – Phá Tam Giang",
        "Cảnh quan và thiên nhiên",
        "lagoon",
        "Huế",
        "Phú An, Phú Vang, Thừa Thiên Huế",
        "Hệ đầm phá nước lợ lớn nhất Đông Nam Á",
        0,
        94,
        4.8,
        16.5123,
        107.6621,
        "https://example.com/tam-giang.jpg",
    ),
    (
        "poi-thuy-bieu",
        "Làng Sinh Thái Thủy Biều",
        "Cảnh quan và thiên nhiên",
        "eco_village",
        "Huế",
        "Phường Thủy Biều, TP. Huế",
        "Làng nhà rường vườn bưởi Thanh Trà ven sông Hương",
        0,
        96,
        4.9,
        16.4395,
        107.5378,
        "https://example.com/thuy-bieu.jpg",
    ),
]


def test_hard_province_filter_hue_never_returns_da_nang_or_hoi_an() -> None:
    """Task 1: When context location is Huế, never pin Đà Nẵng or Hội An POIs."""
    assert is_poi_allowed_in_city(
        poi_name="Đại Nội Huế",
        poi_city="Huế",
        poi_address="Thuận Hòa, TP. Huế",
        target_city_display="Huế",
        is_both_cities=False,
    ) is True
    assert is_poi_allowed_in_city(
        poi_name="Cầu Rồng",
        poi_city="Đà Nẵng",
        poi_address="Hải Châu, Đà Nẵng",
        target_city_display="Huế",
        is_both_cities=False,
    ) is False
    assert is_poi_allowed_in_city(
        poi_name="Phố cổ Hội An",
        poi_city="Đà Nẵng",  # even if mislabeled city in upstream row, address/name catches Hội An
        poi_address="Minh An, Hội An, Quảng Nam",
        target_city_display="Huế",
        is_both_cities=False,
    ) is False

    mixed_pois = [
        CopilotSuggestedPoiItem(
            id="dn-1",
            name="Bãi biển Mỹ Khê",
            category="Cảnh quan",
            city="Đà Nẵng",
            address="Phước Mỹ, Sơn Trà, Đà Nẵng",
            image_url="https://example.com/mk.jpg",
            green_score=90,
            rating=4.8,
            swap_reason="Biển đẹp",
        ),
        CopilotSuggestedPoiItem(
            id="ha-1",
            name="Phố cổ Hội An",
            category="Di tích",
            city="Hội An",
            address="Hội An, Quảng Nam",
            image_url="https://example.com/ha.jpg",
            green_score=95,
            rating=4.9,
            swap_reason="Phố cổ",
        ),
        CopilotSuggestedPoiItem(
            id="hue-1",
            name="Làng Hương Thủy Xuân",
            category="Di tích",
            city="Huế",
            address="84 Huyền Trân Công Chúa, TP. Huế",
            image_url="https://example.com/lh.jpg",
            green_score=93,
            rating=4.8,
            swap_reason="Làng nghề Huế",
        ),
    ]

    filtered = enrich_pois_with_kg_and_filter_city(
        pois=mixed_pois,
        target_city_display="Huế",
        is_both_cities=False,
        constraints=[],
    )
    assert [p.id for p in filtered] == ["hue-1"]

    # Also verify finalize_copilot_response enforces hard Huế filter
    raw_resp = CopilotChatResponse(
        reply_text="Gợi ý tại Huế cho bạn.\n\nBạn có muốn mình ghép lịch trình Huế 3 ngày không?",
        intent="poi_recommendation",
        suggested_pois=mixed_pois,
        recommended_poi_ids=[p.id for p in mixed_pois],
        action_type="add_stop",
    )
    final_resp = finalize_copilot_response(
        raw_resp,
        TripContextPayload(destination="Huế", days_count=3),
        constraints=[],
    )
    assert all(p.city == "Huế" for p in final_resp.suggested_pois)
    assert all("Đà Nẵng" not in p.name and "Hội An" not in p.name for p in final_resp.suggested_pois)


def test_homonym_disambiguation_prefers_chua_linh_ung_son_tra_over_ba_na() -> None:
    """Task 1: Disambiguate Chùa Linh Ứng Sơn Trà / bare Chùa Linh Ứng from Chùa Linh Ứng Bà Nà."""
    son_tra_score = score_homonym_disambiguation(
        "Chùa Linh Ứng Bãi Bụt",
        "Hoàng Sa, Thọ Quang, Sơn Trà, Đà Nẵng",
        "Gợi ý tham quan Chùa Linh Ứng Sơn Trà buổi chiều",
    )
    ba_na_score = score_homonym_disambiguation(
        "Chùa Linh Ứng Bà Nà",
        "Hòa Ninh, Hòa Vang, Đà Nẵng",
        "Gợi ý tham quan Chùa Linh Ứng Sơn Trà buổi chiều",
    )
    assert son_tra_score > ba_na_score

    # Verify attachment entity matching picks Bãi Bụt (Sơn Trà) even when Bà Nà appears earlier in DB rows
    req = CopilotChatRequest(
        message="Ghim Chùa Linh Ứng Sơn Trà lên bản đồ giúp mình",
        trip_context=TripContextPayload(mode="ideation", destination="Đà Nẵng", days_count=3),
        attachment=CopilotAttachmentPayload(
            type="file",
            file_name="chua_linh_ung_son_tra.jpg",
            mime_type="image/jpeg",
            extracted_text="Check-in Chùa Linh Ứng Sơn Trà Đà Nẵng",
        ),
    )
    with patch("app.trips.copilot_attachments._analyze_attachment_with_gemini", return_value=None):
        resp = process_copilot_attachment(req, _DummyConn(MIXED_CITY_AND_HOMONYM_ROWS))  # type: ignore[arg-type]

    assert len(resp.suggested_pois) >= 1
    assert resp.suggested_pois[0].name == "Chùa Linh Ứng Bãi Bụt"
    assert "Chùa Linh Ứng Bà Nà" != resp.suggested_pois[0].name


def test_free_public_pois_never_display_ticket_price_range() -> None:
    """Task 1: Free public markets & walking streets display 'Miễn phí tham quan' and CSV data is clean."""
    for name, cat, sub_cat in [
        ("Chợ Cồn", "Di tích lịch sử và văn hóa", "market"),
        ("Chợ Đông Ba", "Di tích lịch sử và văn hóa", "market"),
        ("Phố đi bộ Chu Văn An - Võ Thị Sáu", "Di tích lịch sử và văn hóa", "walking_street"),
        (
            "Phố Đêm Hoàng Thành Huế & Phố Đi Bộ Chu Văn An – Phạm Ngũ Lão – Võ Thị Sáu",
            "Di tích lịch sử và văn hóa",
            "walking_street",
        ),
        ("Công Viên APEC", "Cảnh quan và thiên nhiên", "park"),
        ("Bãi Biển Mỹ Khê", "Cảnh quan và thiên nhiên", "beach"),
    ]:
        display = normalize_poi_price_display(
            poi_name=name,
            category=cat,
            sub_category=sub_cat,
            raw_price_display=None,
            estimated_cost=0,
        )
        assert display == "Miễn phí tham quan", f"{name} returned {display}"
        assert "/ vé" not in display

    csv_path = Path(__file__).resolve().parents[2] / "data" / "processed" / "all_pois_cleaned.csv"
    if csv_path.exists():
        with csv_path.open("r", encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                r_name = (row.get("name") or "").lower()
                if "chợ cồn" in r_name or "chu văn an" in r_name or "công viên apec" in r_name:
                    assert float(row.get("estimated_cost") or 0) == 0.0, f"CSV {row.get('name')} should be free (0.0)"


def test_session_suggested_places_anti_repetition_and_prompt_contract() -> None:
    """Task 2: Never repeat POIs already in suggested_places and backfill diverse unvisited POIs."""
    assert "suggested_places" in GREENTRIP_COPILOT_SYSTEM_PROMPT
    assert "A hay B" in GREENTRIP_COPILOT_SYSTEM_PROMPT

    initial_pois = [
        CopilotSuggestedPoiItem(
            id="p-dainoi",
            name="Đại Nội Huế",
            category="Di tích lịch sử và văn hóa",
            city="Huế",
            address="TP. Huế",
            image_url="https://example.com/1.jpg",
            green_score=95,
            rating=4.9,
            swap_reason="Di sản",
        ),
        CopilotSuggestedPoiItem(
            id="p-thienmu",
            name="Chùa Thiên Mụ",
            category="Chùa & Tâm linh",
            city="Huế",
            address="TP. Huế",
            image_url="https://example.com/2.jpg",
            green_score=93,
            rating=4.9,
            swap_reason="Cổ tự",
        ),
    ]
    ctx = TripContextPayload(
        destination="Huế",
        days_count=3,
        num_people=2,
        budget_tier="standard",
        suggested_places=["Đại Nội Huế", "Chùa Thiên Mụ"],
    )

    deduped = deduplicate_pois_against_session(
        pois=initial_pois,
        trip_context=ctx,
        target_city_display="Huế",
        is_both_cities=False,
        constraints=[],
        user_message="Gợi ý thêm chỗ đi chơi mới ở Huế",
    )
    deduped_names = {p.name for p in deduped}
    assert "Đại Nội Huế" not in deduped_names
    assert "Chùa Thiên Mụ" not in deduped_names
    assert len(deduped) >= 2
    assert all(
        is_poi_allowed_in_city(p.name, p.city, p.address, "Huế", is_both_cities=False)
        for p in deduped
    )


def test_smooth_tiktok_error_handling_hides_please_wait_and_enforces_single_cta() -> None:
    """Task 3 & Task 2: Unreadable TikTok link hides 'Please wait...', invites place input, suggests 2-3 fresh POIs & 1-line CTA."""
    req = CopilotChatRequest(
        message="hãy liệt kê tất cả các địa điểm",
        trip_context=TripContextPayload(
            mode="ideation",
            destination="Huế",
            days_count=3,
            num_people=2,
            budget_tier="standard",
            suggested_places=["Đại Nội Huế"],
        ),
        attachment=CopilotAttachmentPayload(
            type="link",
            url="https://www.tiktok.com/@reviewhue/video/7671999888",
        ),
    )
    blocked_meta = {
        "platform": "TikTok",
        "url": "https://www.tiktok.com/@reviewhue/video/7671999888",
        "title": "",
        "author": "",
        "description": "",
        "chapters": "",
        "transcript": "",
        "snippet": "reviewhue video 7671999888",
        "thumbnail_url": "",
        "url_city": "Huế",
        "metadata_source": "blocked_by_platform",
    }

    with patch("app.trips.copilot_attachments.fetch_link_metadata", return_value=blocked_meta):
        resp = process_copilot_attachment(req, _DummyConn(MIXED_CITY_AND_HOMONYM_ROWS))  # type: ignore[arg-type]

    assert "please wait" not in resp.reply_text.lower()
    assert "nhập tên địa điểm" in resp.reply_text.lower()
    assert 2 <= len(resp.suggested_pois) <= 3
    suggested_names = {p.name for p in resp.suggested_pois}
    assert "Đại Nội Huế" not in suggested_names  # respected suggested_places!
    assert all(p.city == "Huế" for p in resp.suggested_pois)  # respected hard Huế filter!
    assert "A —" not in resp.reply_text and "hay **B" not in resp.reply_text
    assert resp.reply_text.strip().endswith("?")

    # Also verify ensure_closing_ab_hook strips stacked LLM "A — ... hay B — ..." tail
    double_cta = (
        "Danh sách gợi ý Huế rất hợp cho 2 người.\n\n"
        "Bạn có muốn mình xếp lịch trình 3 ngày tại Huế không?\n\n"
        "Bạn muốn mình **A — Gom lịch trình 3 ngày**, hay **B — Gợi ý thêm quán ăn**?"
    )
    cleaned = ensure_closing_ab_hook(double_cta, "Bạn muốn chốt lịch trình không?")
    assert "A —" not in cleaned
    assert cleaned.endswith("Bạn có muốn mình xếp lịch trình 3 ngày tại Huế không?")
