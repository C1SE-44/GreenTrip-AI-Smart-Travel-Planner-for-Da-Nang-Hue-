"""Server-Sent Events (SSE) progressive streaming support for GreenTrip Copilot."""
from __future__ import annotations

from collections.abc import Iterator
import json
import logging
import re
import time
from typing import Any

from app.db.postgres import get_connection
from app.trips.schemas import CopilotChatRequest
from app.trips.service import process_copilot_chat

logger = logging.getLogger(__name__)

_WORD_WITH_TRAILING_WS_RE = re.compile(r"\S+\s*")
_LEADING_WS_RE = re.compile(r"^\s+")


def format_sse_event(event: str, payload: dict[str, Any]) -> str:
    """Serialize one SSE frame cleanly in UTF-8 JSON without ASCII escaping."""
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def chunk_reply_text(text: str, words_per_chunk: int = 5) -> list[str]:
    """Split text into N-word chunks while preserving exact whitespace and line breaks."""
    if not text:
        return []
    step = max(1, words_per_chunk)
    leading_match = _LEADING_WS_RE.match(text)
    leading_ws = leading_match.group(0) if leading_match else ""
    tokens = _WORD_WITH_TRAILING_WS_RE.findall(text, len(leading_ws))
    if not tokens:
        return [text]

    chunks = ["".join(tokens[idx : idx + step]) for idx in range(0, len(tokens), step)]
    if leading_ws:
        chunks[0] = f"{leading_ws}{chunks[0]}"
    return chunks


def stream_copilot_chat_events(
    payload: CopilotChatRequest,
    chunk_delay_seconds: float = 0.015,
) -> Iterator[str]:
    """Yield multi-stage progress statuses, delta chunks, and full structured Copilot payload over SSE."""
    yield format_sse_event(
        "status",
        {
            "stage": "analyzing",
            "message": "Đang phân tích nhu cầu & khóa phạm vi địa lý...",
        },
    )
    try:
        yield format_sse_event(
            "status",
            {
                "stage": "knowledge_graph",
                "message": "Đang truy xuất điểm cộng đồng & Đồ thị Tri thức...",
            },
        )
        # Open DB connection inside generator so FastAPI dependency teardown never closes it early.
        with get_connection() as conn:
            response = process_copilot_chat(payload, conn)

        yield format_sse_event(
            "status",
            {
                "stage": "optimizing_route",
                "message": "Đang tối ưu tuyến đường ít phát thải & tổng hợp gợi ý...",
            },
        )

        for chunk in chunk_reply_text(response.reply_text):
            yield format_sse_event("delta", {"text": chunk})
            if chunk_delay_seconds > 0:
                time.sleep(chunk_delay_seconds)

        yield format_sse_event("done", response.model_dump(mode="json"))
    except Exception:
        logger.exception("Failed to stream Copilot chat response")
        yield format_sse_event(
            "error",
            {"detail": "Không thể xử lý yêu cầu Copilot lúc này."},
        )
