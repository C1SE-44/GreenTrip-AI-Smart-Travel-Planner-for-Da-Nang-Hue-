"""Unit tests for Copilot SSE streaming endpoint and frame serialization."""
import json
from pathlib import Path
import sys
from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.trips.copilot_stream import chunk_reply_text  # noqa: E402

client = TestClient(app)


def _parse_sse_frames(raw_body: str) -> list[tuple[str, dict[str, object]]]:
    frames: list[tuple[str, dict[str, object]]] = []
    for block in raw_body.strip().split("\n\n"):
        if not block.strip():
            continue
        event_name = "message"
        data_lines: list[str] = []
        for line in block.splitlines():
            if line.startswith("event:"):
                event_name = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
        payload = json.loads("\n".join(data_lines))
        frames.append((event_name, payload))
    return frames


def test_chunk_reply_text_preserves_exact_unicode_and_whitespace() -> None:
    sample = "  Gợi ý **Cà phê muối** ở Huế:\n\n- Ly thủy tinh\n- Ít ồn ào?"
    chunks = chunk_reply_text(sample, words_per_chunk=3)
    assert len(chunks) >= 3
    assert "".join(chunks) == sample


def test_copilot_chat_stream_emits_status_deltas_and_done(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", " ")
    monkeypatch.setenv("GEMINI_API_KEY", " ")
    get_settings.cache_clear()

    with patch("app.trips.copilot_stream.time.sleep"):
        response = client.post(
            "/trips/copilot/chat/stream",
            json={
                "message": "Gợi ý quán cafe yên tĩnh ở Đà Nẵng giúp mình",
                "trip_context": {"destination": "Đà Nẵng", "days_count": 3, "current_day": 1},
            },
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache"

    frames = _parse_sse_frames(response.text)
    assert frames[0][0] == "status"
    delta_text = "".join(str(data["text"]) for name, data in frames if name == "delta")
    done_frames = [data for name, data in frames if name == "done"]

    assert len(done_frames) == 1
    done_payload = done_frames[0]
    assert delta_text == done_payload["reply_text"]
    assert done_payload["intent"] == "cafe_culture"
    assert len(done_payload["suggested_pois"]) >= 1  # type: ignore[arg-type]


def test_copilot_chat_stream_out_of_scope_zero_pois(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", " ")
    monkeypatch.setenv("GEMINI_API_KEY", " ")
    get_settings.cache_clear()

    with patch("app.trips.copilot_stream.time.sleep"):
        response = client.post(
            "/trips/copilot/chat/stream",
            json={
                "message": "Lên lịch trình đi Phú Quốc 3 ngày",
                "trip_context": {"destination": "Đà Nẵng", "days_count": 3, "current_day": 1},
            },
        )

    assert response.status_code == 200
    frames = _parse_sse_frames(response.text)
    done_payload = [data for name, data in frames if name == "done"][0]
    assert done_payload["intent_category"] == "OUT_OF_SCOPE"
    assert done_payload["suggested_pois"] == []


def test_copilot_chat_stream_masks_internal_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", " ")
    monkeypatch.setenv("GEMINI_API_KEY", " ")
    get_settings.cache_clear()

    with patch(
        "app.trips.copilot_stream.process_copilot_chat",
        side_effect=RuntimeError("secret_internal_db_error"),
    ):
        response = client.post(
            "/trips/copilot/chat/stream",
            json={
                "message": "Gợi ý quán chay Đà Nẵng",
                "trip_context": {"destination": "Đà Nẵng", "days_count": 3, "current_day": 1},
            },
        )

    assert response.status_code == 200
    assert "secret_internal_db_error" not in response.text
    frames = _parse_sse_frames(response.text)
    error_frames = [data for name, data in frames if name == "error"]
    assert len(error_frames) == 1
    assert "Không thể xử lý yêu cầu Copilot lúc này." in str(error_frames[0]["detail"])
