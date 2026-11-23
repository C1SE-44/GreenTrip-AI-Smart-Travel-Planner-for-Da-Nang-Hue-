"""Unit & API tests for Mindtrip-style '+' Multimodal Copilot Attachments (file, link, receipt)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from app.main import app
from app.trips.copilot_attachments import (
    detect_link_platform,
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
