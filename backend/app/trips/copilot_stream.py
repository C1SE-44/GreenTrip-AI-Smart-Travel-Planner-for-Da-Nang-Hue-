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
    """
    Progressive SSE event stream for GreenTrip Copilot.
    Emits events: start -> status -> sources (if RAG used) -> tool_result (if tools used) -> token / delta -> complete / done.
    """
    # 1. Status event
    yield format_sse_event(
        "status",
        {
            "stage": "analyzing",
            "message": "Đang phân tích nhu cầu & kiểm tra dữ liệu du lịch xanh...",
        },
    )

    # 2. Start event
    yield format_sse_event(
        "start",
        {
            "status": "started",
            "message": "Bắt đầu điều phối yêu cầu...",
        },
    )

    try:
        # Open DB connection inside generator so FastAPI dependency teardown never closes it early.
        with get_connection() as conn:
            response = process_copilot_chat(payload, conn)

        # 3. Sources event (if RAG was used)
        if response.sources:
            yield format_sse_event(
                "sources",
                {
                    "count": len(response.sources),
                    "sources": response.sources,
                },
            )

        # 4. Tool result event (if tools were executed)
        if response.tools_used:
            yield format_sse_event(
                "tool_result",
                {
                    "tools_used": response.tools_used,
                    "data": response.data or {},
                },
            )

        # 5. Token & Delta events
        # Note: If real provider stream is active, tokens stream live.
        # For deterministic fallback, chunks are emitted progressively for UI typewriter effect.
        for chunk in chunk_reply_text(response.reply_text):
            yield format_sse_event("token", {"text": chunk})
            yield format_sse_event("delta", {"text": chunk})
            if chunk_delay_seconds > 0:
                time.sleep(chunk_delay_seconds)

        # 6. Complete and Done events
        payload_dict = response.model_dump(mode="json")
        yield format_sse_event("complete", payload_dict)
        yield format_sse_event("done", payload_dict)

    except Exception as exc:
        logger.exception("Failed to stream Copilot chat response")
        yield format_sse_event(
            "error",
            {"detail": "Không thể xử lý yêu cầu Copilot lúc này. Vui lòng thử lại."},
        )

