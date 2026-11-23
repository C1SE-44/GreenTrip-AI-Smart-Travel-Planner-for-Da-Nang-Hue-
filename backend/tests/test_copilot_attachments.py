"""Unit & API tests for Mindtrip-style '+' Multimodal Copilot Attachments (file, link, receipt)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from app.main import app
from app.trips.copilot_attachments import (
    _extract_chapter_lines,
    _extract_json_string_field,
    _parse_timedtext_xml_to_highlights,
    answer_attached_source_followup,
    detect_link_platform,
    extract_youtube_video_id,
    is_attached_source_followup,
    is_safe_public_url,
    process_copilot_attachment,
)
from app.trips.schemas import (
    CopilotAttachmentPayload,
    CopilotChatRequest,
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


SAMPLE_POI_ROWS = [
    (
        "poi-cau-rong",
        "Cầu Rồng",
        "Cảnh quan",
        "scenic_landmark",
        "Đà Nẵng",
        "Đường Nguyễn Văn Linh, Hải Châu, Đà Nẵng",
        "Biểu tượng sông Hàn Đà Nẵng",
        0,
        92,
        4.8,
        16.0611,
        108.2275,
        "https://example.com/cau-rong.jpg",
    ),
    (
        "poi-bep-cuon",
        "Nhà Hàng Bếp Cuốn Đà Nẵng",
        "Quán ăn",
        "local_food",
        "Đà Nẵng",
        "31 Trần Bạch Đằng, Sơn Trà, Đà Nẵng",
        "Ẩm thực bản địa đạt Michelin Bib Gourmand",
        120000,
        88,
        4.9,
        16.0544,
        108.2442,
        "https://example.com/bep-cuon.jpg",
    ),
    (
        "poi-dai-noi",
        "Đại Nội Huế",
        "Di tích",
        "heritage",
        "Huế",
        "Đường 23/8, Thuận Hòa, TP. Huế",
        "Hoàng thành di sản UNESCO triều Nguyễn",
        200000,
        95,
        4.9,
        16.4698,
        107.5784,
        "https://example.com/dai-noi.jpg",
    ),
]


def test_copilot_request_schema_allows_empty_message_only_with_attachment() -> None:
    with pytest.raises(ValidationError):
        CopilotChatRequest(message="   ")

    req_link = CopilotChatRequest(
        message="",
        attachment=CopilotAttachmentPayload(type="link", url="youtube.com/watch?v=danang123"),
    )
    assert req_link.attachment is not None
    assert req_link.attachment.url == "https://youtube.com/watch?v=danang123"

    req_file = CopilotChatRequest(
        message="",
        attachment=CopilotAttachmentPayload(type="file", file_name="screenshot_danang.png", mime_type="image/png"),
    )
    assert req_file.attachment is not None
    assert req_file.attachment.file_name == "screenshot_danang.png"


def test_ssrf_guard_blocks_internal_and_non_http_urls() -> None:
    assert is_safe_public_url("http://localhost:8000/auth/me") is False
    assert is_safe_public_url("http://127.0.0.1:5432/") is False
    assert is_safe_public_url("http://169.254.169.254/latest/meta-data/") is False
    assert is_safe_public_url("http://192.168.1.10/admin") is False
    assert is_safe_public_url("file:///etc/passwd") is False
    assert is_safe_public_url("ftp://example.com/file.txt") is False


def test_detect_link_platform_matches_all_five_mindtrip_socials() -> None:
    assert detect_link_platform("https://www.youtube.com/watch?v=abc") == "YouTube"
    assert detect_link_platform("https://www.tiktok.com/@danangfood/video/123") == "TikTok"
    assert detect_link_platform("https://www.instagram.com/p/xyz/") == "Instagram"
    assert detect_link_platform("https://www.facebook.com/share/v/123") == "Facebook"
    assert detect_link_platform("https://www.pinterest.com/pin/12345/") == "Pinterest"
    assert detect_link_platform("https://vnexpress.net/cam-nang-du-lich-hue") == "Bài viết du lịch"


def test_process_link_attachment_matches_real_pois_without_gemini() -> None:
    req = CopilotChatRequest(
        message="",
        trip_context=TripContextPayload(mode="ideation", destination="Đà Nẵng & Huế", days_count=3),
        attachment=CopilotAttachmentPayload(
            type="link",
            url="https://www.youtube.com/watch?v=review-cau-rong-bep-cuon",
        ),
    )
    mock_meta = {
        "platform": "YouTube",
        "url": "https://www.youtube.com/watch?v=review-cau-rong-bep-cuon",
        "title": "Review Đà Nẵng 3 ngày: Cầu Rồng và Nhà Hàng Bếp Cuốn",
        "description": "Video du lịch Đà Nẵng",
        "snippet": "Cầu Rồng, Bếp Cuốn Đà Nẵng",
    }
    with (
        patch("app.trips.copilot_attachments.fetch_link_metadata", return_value=mock_meta),
        patch("app.trips.copilot_attachments._analyze_attachment_with_gemini", return_value=None),
    ):
        resp = process_copilot_attachment(req, _DummyConn(SAMPLE_POI_ROWS))  # type: ignore[arg-type]

    assert resp.intent == "attachment_link"
    assert "YouTube" in resp.reply_text
    assert len(resp.suggested_pois) >= 1
    assert any("Cầu Rồng" in p.name or "Bếp Cuốn" in p.name for p in resp.suggested_pois)


def test_process_receipt_attachment_mutates_trip_itinerary_in_trip_mode() -> None:
    req = CopilotChatRequest(
        message="Đồng bộ vé tàu này giúp mình",
        trip_context=TripContextPayload(
            mode="trip",
            destination="Huế",
            days_count=2,
            current_day=1,
            current_itinerary_state=[
                {"day_number": 1, "title": "Ngày 1: Huế", "focus_city": "Huế", "stops": []},
            ],
        ),
        attachment=CopilotAttachmentPayload(
            type="receipt",
            file_name="ve_tau_hd1_hue_0830.png",
            mime_type="image/png",
            extracted_text="Vé tàu di sản HD1 Đà Nẵng - Huế lúc 08:30 giá 150.000 VND",
        ),
    )
    with patch("app.trips.copilot_attachments._analyze_attachment_with_gemini", return_value=None):
        resp = process_copilot_attachment(req, _DummyConn(SAMPLE_POI_ROWS))  # type: ignore[arg-type]

    assert resp.intent == "attachment_receipt"
    assert resp.action_type == "mutate_itinerary"
    assert resp.updated_itinerary_state is not None
    assert len(resp.updated_itinerary_state) >= 1
    assert "08:30" in resp.reply_text


def test_process_file_attachment_endpoint_via_fastapi() -> None:
    client = TestClient(app)
    with (
        patch("app.trips.copilot_attachments._analyze_attachment_with_gemini", return_value=None),
        patch("app.trips.router.get_connection", return_value=_DummyConn(SAMPLE_POI_ROWS)),
    ):
        response = client.post(
            "/trips/copilot/chat",
            json={
                "message": "",
                "trip_context": {"mode": "ideation", "destination": "Huế", "days_count": 2},
                "attachment": {
                    "type": "file",
                    "file_name": "dai_noi_hue_screenshot.png",
                    "mime_type": "image/png",
                    "extracted_text": "Ảnh chụp màn hình review Đại Nội Huế buổi sáng",
                },
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "attachment_file"
    assert isinstance(body["reply_text"], str) and len(body["reply_text"]) > 20


def test_youtube_video_id_and_chapters_extraction() -> None:
    assert extract_youtube_video_id("https://youtu.be/dQw4w9WgXcQ?si=abc") == "dQw4w9WgXcQ"
    assert extract_youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s") == "dQw4w9WgXcQ"
    assert extract_youtube_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_youtube_video_id("https://example.com/blog") is None

    fake_html = (
        '{"videoDetails":{"shortDescription":"Du lịch Đà Nẵng\\n'
        '00:00 Đà Nẵng\\n01:30 KDL Núi Thần Tài\\n11:03 Nhà Hàng Muối Biển\\n19:05 Cầu Rồng","isCrawlable":true}}'
    )
    desc = _extract_json_string_field(fake_html, "shortDescription")
    assert "KDL Núi Thần Tài" in desc
    chapters = _extract_chapter_lines(desc)
    assert len(chapters) == 4
    assert any("Nhà Hàng Muối Biển" in c for c in chapters)


def test_youtube_chapters_pin_geo_anchors_and_persist_source_memory() -> None:
    req = CopilotChatRequest(
        message="hãy giúp tôi liệt kê tất cả các địa điểm có trong video youtube này",
        trip_context=TripContextPayload(mode="ideation", destination="Đà Nẵng & Huế", days_count=3),
        attachment=CopilotAttachmentPayload(
            type="link",
            url="https://youtu.be/dQw4w9WgXcQ",
        ),
    )
    mock_meta = {
        "platform": "YouTube",
        "url": "https://youtu.be/dQw4w9WgXcQ",
        "title": "HƯỚNG DẪN DU LỊCH ĐÀ NẴNG TỰ TÚC",
        "author": "Toro Pan",
        "description": "00:00 Đà Nẵng\n01:30 KDL Núi Thần Tài\n11:03 Nhà Hàng Muối Biển\n19:05 Cầu Rồng\n25:00 Phố Cổ Hội An",
        "chapters": "00:00 Đà Nẵng\n01:30 KDL Núi Thần Tài\n11:03 Nhà Hàng Muối Biển\n19:05 Cầu Rồng\n25:00 Phố Cổ Hội An",
        "transcript": "",
        "snippet": "",
        "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        "metadata_source": "description_and_chapters",
    }
    with (
        patch("app.trips.copilot_attachments.fetch_link_metadata", return_value=mock_meta),
        patch("app.trips.copilot_attachments._analyze_attachment_with_gemini", return_value=None),
    ):
        resp = process_copilot_attachment(req, _DummyConn(SAMPLE_POI_ROWS))  # type: ignore[arg-type]

    assert resp.intent == "attachment_link"
    assert "KDL Núi Thần Tài" in resp.reply_text
    assert "Nhà Hàng Muối Biển" in resp.reply_text
    assert "Cầu Rồng" in resp.reply_text
    assert len(resp.suggested_pois) >= 3
    poi_names = {p.name for p in resp.suggested_pois}
    assert any("Cầu Rồng" in n for n in poi_names)
    assert any("Núi Thần Tài" in n or "Muối Biển" in n for n in poi_names)
    assert "attached_source" in resp.trip_memory
    assert resp.trip_memory.get("attached_source_title") == "HƯỚNG DẪN DU LỊCH ĐÀ NẴNG TỰ TÚC"

    # Follow-up turn without re-attaching link must recall the video's places cleanly
    followup_req = CopilotChatRequest(
        message="hãy liệt kê tất cả các địa điểm có trong video tôi đã đính kèm",
        trip_context=TripContextPayload(
            mode="ideation",
            destination="Đà Nẵng & Huế",
            days_count=3,
            trip_memory=resp.trip_memory,
        ),
    )
    assert is_attached_source_followup(followup_req) is True
    followup_resp = answer_attached_source_followup(followup_req, _DummyConn(SAMPLE_POI_ROWS))  # type: ignore[arg-type]
    assert followup_resp.intent == "attachment_followup"
    assert "Nhà Hàng Muối Biển" in followup_resp.reply_text
    assert "xe máy một mình" not in followup_resp.reply_text.lower()


def test_innertube_transcript_xml_highlights_extracts_spoken_landmarks() -> None:
    sample_xml = (
        '<timedtext><body>'
        '<p t="616000" d="3000">Trước mặt chúng ta là biển Mỹ Khê quá đẹp</p>'
        '<p t="628000" d="3000">Nhìn qua bên kia sẽ thấy chùa Linh Ứng trên bán đảo Sơn Trà</p>'
        '</body></timedtext>'
    )
    highlights = _parse_timedtext_xml_to_highlights(sample_xml)
    assert "[10:16]" in highlights
    assert "biển Mỹ Khê" in highlights
    assert "chùa Linh Ứng" in highlights


def test_receipt_deduplication_and_non_bleeding_source_title() -> None:
    req1 = CopilotChatRequest(
        message="Đọc hóa đơn khách sạn này giúp mình",
        trip_context=TripContextPayload(mode="ideation", destination="Đà Nẵng", days_count=3),
        attachment=CopilotAttachmentPayload(
            type="receipt",
            file_name="sala_danang_hotel.pdf",
            mime_type="application/pdf",
            extracted_text="Hotel: Sala Danang Beach Hotel Check-in 2026-12-18 14:00 4,800,000 VND",
        ),
    )
    with patch("app.trips.copilot_attachments._analyze_attachment_with_gemini", return_value=None):
        resp1 = process_copilot_attachment(req1, _DummyConn(SAMPLE_POI_ROWS))  # type: ignore[arg-type]

    assert resp1.receipt_booking is not None
    assert resp1.receipt_booking.is_duplicate is False
    assert "processed_receipts" in resp1.trip_memory

    # Second upload of the same booking must be caught by deduplication
    req2 = CopilotChatRequest(
        message="Đọc lại hóa đơn này",
        trip_context=TripContextPayload(
            mode="ideation",
            destination="Đà Nẵng",
            days_count=3,
            trip_memory=resp1.trip_memory,
        ),
        attachment=CopilotAttachmentPayload(
            type="receipt",
            file_name="sala_danang_hotel.png",
            mime_type="image/png",
            extracted_text="Hotel: Sala Danang Beach Hotel Check-in 2026-12-18 14:00 4,800,000 VND",
        ),
    )
    with patch("app.trips.copilot_attachments._analyze_attachment_with_gemini", return_value=None):
        resp2 = process_copilot_attachment(req2, _DummyConn(SAMPLE_POI_ROWS))  # type: ignore[arg-type]

    assert resp2.receipt_booking is not None
    assert resp2.receipt_booking.is_duplicate is True
    assert "không thêm trùng" in resp2.reply_text

    # Subsequent link with empty title must overwrite attached_source_title cleanly (no stale bleed)
    tiktok_req = CopilotChatRequest(
        message="Liệt kê địa điểm trong clip này",
        trip_context=TripContextPayload(
            mode="ideation",
            destination="Đà Nẵng",
            days_count=3,
            trip_memory={"attached_source_title": "OLD YOUTUBE TITLE"},
        ),
        attachment=CopilotAttachmentPayload(type="link", url="https://www.tiktok.com/@test/video/123"),
    )
    mock_tt = {
        "platform": "TikTok",
        "url": "https://www.tiktok.com/@test/video/123",
        "title": "",
        "description": "",
        "chapters": "",
        "transcript": "",
        "snippet": "",
        "thumbnail_url": "",
        "metadata_source": "url_only",
    }
    with (
        patch("app.trips.copilot_attachments.fetch_link_metadata", return_value=mock_tt),
        patch("app.trips.copilot_attachments._analyze_attachment_with_gemini", return_value=None),
    ):
        resp_tt = process_copilot_attachment(tiktok_req, _DummyConn(SAMPLE_POI_ROWS))  # type: ignore[arg-type]

    assert resp_tt.trip_memory.get("attached_source_title") == ""
    assert resp_tt.trip_memory.get("attached_source_url") == "https://www.tiktok.com/@test/video/123"
