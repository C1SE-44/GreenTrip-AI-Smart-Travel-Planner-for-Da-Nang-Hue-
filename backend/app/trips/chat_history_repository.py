from __future__ import annotations

from datetime import datetime
import json
import logging
import time
from typing import Any
import uuid

from fastapi import HTTPException

from app.db.postgres import SQLiteConnectionWrapper, get_connection
from app.trips.itinerary_repository import _ensure_local_tables, get_itinerary

logger = logging.getLogger(__name__)

_PG_CHAT_TABLES_ENSURED = False


def _ensure_chat_tables(connection: Any, cursor: Any) -> None:
    """Bootstrap copilot chat tables for SQLite fallback and ensure tables exist on PostgreSQL."""
    global _PG_CHAT_TABLES_ENSURED

    if isinstance(connection, SQLiteConnectionWrapper):
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS copilot_conversations (
                conversation_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                trip_id TEXT NOT NULL DEFAULT 'ideation',
                title TEXT NOT NULL DEFAULT '',
                trip_memory TEXT NOT NULL DEFAULT '{}',
                active_constraints TEXT NOT NULL DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (user_id, trip_id)
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS copilot_messages (
                message_id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES copilot_conversations(conversation_id) ON DELETE CASCADE,
                user_id TEXT NOT NULL,
                sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
                content TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_copilot_conversations_user_trip ON copilot_conversations(user_id, trip_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_copilot_messages_conversation_created ON copilot_messages(conversation_id, created_at)"
        )
        return

    if _PG_CHAT_TABLES_ENSURED:
        return

    try:
        cursor.execute(
            "SELECT to_regclass('public.copilot_conversations'), to_regclass('public.copilot_messages')"
        )
        reg = cursor.fetchone()
        if reg and reg[0] is not None and reg[1] is not None:
            _PG_CHAT_TABLES_ENSURED = True
            return

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS public.copilot_conversations (
                conversation_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                trip_id TEXT NOT NULL DEFAULT 'ideation',
                title TEXT NOT NULL DEFAULT '',
                trip_memory JSONB NOT NULL DEFAULT '{}'::jsonb,
                active_constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_copilot_conversations_user_trip UNIQUE (user_id, trip_id),
                CONSTRAINT uq_copilot_conversations_user_conv UNIQUE (user_id, conversation_id)
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS public.copilot_messages (
                message_id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES public.copilot_conversations(conversation_id) ON DELETE CASCADE,
                user_id TEXT NOT NULL,
                sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
                content TEXT NOT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_copilot_conversations_user_trip ON public.copilot_conversations(user_id, trip_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_copilot_messages_conversation_created ON public.copilot_messages(conversation_id, created_at)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_copilot_messages_user_id ON public.copilot_messages(user_id)"
        )
        connection.commit()
        _PG_CHAT_TABLES_ENSURED = True
    except Exception as exc:
        logger.warning("Could not auto-ensure copilot chat tables on PostgreSQL: %s", exc)
        try:
            connection.rollback()
        except Exception:
            pass


def _parse_json(raw: Any, default: Any) -> Any:
    if raw is None:
        return default
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(str(raw))
    except Exception:
        return default


def normalize_trip_id(trip_id: str | None) -> str:
    cleaned = (trip_id or "").strip()
    return cleaned if cleaned else "ideation"


def verify_trip_access(trip_id: str | None, user_id: str) -> dict[str, Any] | None:
    """
    Verify that the authenticated user is allowed to access `trip_id`.
    Raises 403 if the trip exists and belongs to a different user (or has no owner and is not a shared sample).
    Raises 503 if DB verification fails (fail-closed).
    Returns serialized itinerary dict when found in DB, else None.
    """
    cleaned_id = (trip_id or "").strip()
    if not cleaned_id or cleaned_id in {"ideation", "draft"}:
        return None

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_local_tables(connection, cursor)
                cursor.execute(
                    "SELECT user_id FROM public.itineraries WHERE trip_id = %s",
                    (cleaned_id,),
                )
                row = cursor.fetchone()
                if not row:
                    return None
                owner_id = row[0]
                is_shared_sample = cleaned_id.startswith("sample-") and owner_id == "demo-user"
                if (not owner_id or owner_id != user_id) and not is_shared_sample:
                    raise HTTPException(
                        status_code=403,
                        detail="Bạn không có quyền truy cập lịch trình của người dùng khác.",
                    )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("verify_trip_access failed due to DB error: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Không thể xác minh quyền truy cập chuyến đi lúc này.",
        ) from exc

    itinerary = get_itinerary(cleaned_id, user_id)
    if itinerary is None:
        return None
    return itinerary.model_dump()


def load_conversation_history(
    user_id: str,
    trip_id: str | None = None,
    limit: int = 50,
    strict: bool = False,
) -> dict[str, Any]:
    """Load the latest `limit` persisted messages scoped strictly to (user_id, trip_id)."""
    norm_trip_id = normalize_trip_id(trip_id)
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_chat_tables(connection, cursor)
                cursor.execute(
                    """
                    SELECT conversation_id, title, trip_memory, active_constraints, updated_at
                    FROM public.copilot_conversations
                    WHERE user_id = %s AND trip_id = %s
                    """,
                    (user_id, norm_trip_id),
                )
                conv = cursor.fetchone()
                if not conv:
                    return {
                        "conversation_id": None,
                        "trip_id": norm_trip_id,
                        "title": "",
                        "trip_memory": {},
                        "active_constraints": [],
                        "messages": [],
                    }

                conv_id, title, raw_memory, raw_constraints, _updated_at = conv
                cursor.execute(
                    """
                    SELECT message_id, sender, content, metadata, created_at
                    FROM public.copilot_messages
                    WHERE conversation_id = %s AND user_id = %s
                    ORDER BY created_at DESC, message_id DESC
                    LIMIT %s
                    """,
                    (conv_id, user_id, limit),
                )
                rows = list(reversed(cursor.fetchall()))
                messages = []
                for msg_id, sender, content, raw_meta, created_at in rows:
                    meta = _parse_json(raw_meta, {})
                    ts_str = (
                        created_at.isoformat()
                        if isinstance(created_at, datetime)
                        else str(created_at or "")
                    )
                    messages.append(
                        {
                            "message_id": msg_id,
                            "sender": sender,
                            "content": content,
                            "metadata": meta if isinstance(meta, dict) else {},
                            "created_at": ts_str,
                        }
                    )

                return {
                    "conversation_id": conv_id,
                    "trip_id": norm_trip_id,
                    "title": title or "",
                    "trip_memory": _parse_json(raw_memory, {}),
                    "active_constraints": _parse_json(raw_constraints, []),
                    "messages": messages,
                }
    except Exception as exc:
        logger.warning("Failed to load copilot conversation history: %s", exc)
        if strict:
            raise HTTPException(
                status_code=503,
                detail="Không thể tải lịch sử hội thoại lúc này.",
            ) from exc
        return {
            "conversation_id": None,
            "trip_id": norm_trip_id,
            "title": "",
            "trip_memory": {},
            "active_constraints": [],
            "messages": [],
        }


def _supersede_prior_proposals(cursor: Any, conv_id: str, user_id: str, exclude_message_id: str | None = None) -> None:
    """Mark all prior unapplied proposal messages in the conversation as superseded."""
    cursor.execute(
        """
        SELECT message_id, metadata
        FROM public.copilot_messages
        WHERE conversation_id = %s AND user_id = %s AND sender = 'assistant'
        """,
        (conv_id, user_id),
    )
    for row_id, raw_meta in cursor.fetchall():
        if exclude_message_id and row_id == exclude_message_id:
            continue
        meta = _parse_json(raw_meta, {})
        if not isinstance(meta, dict):
            continue
        has_proposal = bool(meta.get("requires_confirmation") or meta.get("proposed_itinerary_state"))
        if has_proposal and not meta.get("applied") and not meta.get("superseded"):
            meta["superseded"] = True
            cursor.execute(
                "UPDATE public.copilot_messages SET metadata = %s WHERE message_id = %s AND user_id = %s",
                (json.dumps(meta, ensure_ascii=False), row_id, user_id),
            )


def append_chat_messages(
    user_id: str,
    trip_id: str | None,
    messages: list[dict[str, Any]],
    title: str = "",
    trip_memory: dict[str, Any] | None = None,
    active_constraints: list[str] | None = None,
) -> list[str]:
    """Persist new chat messages under (user_id, trip_id) and update conversation memory."""
    norm_trip_id = normalize_trip_id(trip_id)
    inserted_ids: list[str] = []
    if not messages:
        return inserted_ids

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_chat_tables(connection, cursor)
                cursor.execute(
                    """
                    SELECT conversation_id
                    FROM public.copilot_conversations
                    WHERE user_id = %s AND trip_id = %s
                    """,
                    (user_id, norm_trip_id),
                )
                existing = cursor.fetchone()
                memory_json = json.dumps(trip_memory or {}, ensure_ascii=False)
                constraints_json = json.dumps(active_constraints or [], ensure_ascii=False)

                if existing:
                    conv_id = existing[0]
                    cursor.execute(
                        """
                        UPDATE public.copilot_conversations
                        SET trip_memory = %s,
                            active_constraints = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE conversation_id = %s AND user_id = %s
                        """,
                        (memory_json, constraints_json, conv_id, user_id),
                    )
                else:
                    conv_id = f"conv_{uuid.uuid4().hex[:16]}"
                    cursor.execute(
                        """
                        INSERT INTO public.copilot_conversations (
                            conversation_id, user_id, trip_id, title, trip_memory, active_constraints
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (conv_id, user_id, norm_trip_id, title[:200], memory_json, constraints_json),
                    )

                has_new_proposal = any(
                    msg.get("sender") == "assistant"
                    and isinstance(msg.get("metadata"), dict)
                    and (
                        msg["metadata"].get("requires_confirmation")
                        or msg["metadata"].get("proposed_itinerary_state")
                    )
                    for msg in messages
                )
                if has_new_proposal:
                    _supersede_prior_proposals(cursor, conv_id, user_id)

                base_ts = int(time.time() * 1_000_000)
                for idx, msg in enumerate(messages):
                    msg_id = str(msg.get("message_id") or f"msg_{base_ts}_{idx:02d}_{uuid.uuid4().hex[:6]}")
                    sender = "user" if msg.get("sender") == "user" else "assistant"
                    content = str(msg.get("content") or "")
                    meta_json = json.dumps(msg.get("metadata") or {}, ensure_ascii=False)
                    cursor.execute(
                        """
                        INSERT INTO public.copilot_messages (
                            message_id, conversation_id, user_id, sender, content, metadata
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (msg_id, conv_id, user_id, sender, content, meta_json),
                    )
                    inserted_ids.append(msg_id)

                connection.commit()
    except Exception as exc:
        logger.warning("Failed to append copilot messages: %s", exc)
    return inserted_ids


def mark_proposal_applied(user_id: str, trip_id: str | None, message_id: str) -> str:
    """
    Mark an assistant itinerary proposal message as applied by the owning user.
    Returns one of: 'ok', 'not_found', 'already_applied', 'stale_or_dismissed'.
    """
    norm_trip_id = normalize_trip_id(trip_id)
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_chat_tables(connection, cursor)
                lock_clause = "" if isinstance(connection, SQLiteConnectionWrapper) else " FOR UPDATE OF m"
                cursor.execute(
                    f"""
                    SELECT m.metadata, m.conversation_id
                    FROM public.copilot_messages m
                    JOIN public.copilot_conversations c ON m.conversation_id = c.conversation_id
                    WHERE m.message_id = %s AND m.user_id = %s AND c.trip_id = %s{lock_clause}
                    """,
                    (message_id, user_id, norm_trip_id),
                )
                row = cursor.fetchone()
                if not row:
                    return "not_found"
                meta = _parse_json(row[0], {})
                conv_id = row[1]
                if not isinstance(meta, dict):
                    meta = {}
                if meta.get("applied") is True:
                    return "already_applied"
                if meta.get("dismissed") is True or meta.get("superseded") is True:
                    return "stale_or_dismissed"

                meta["applied"] = True
                cursor.execute(
                    "UPDATE public.copilot_messages SET metadata = %s WHERE message_id = %s AND user_id = %s",
                    (json.dumps(meta, ensure_ascii=False), message_id, user_id),
                )
                _supersede_prior_proposals(cursor, conv_id, user_id, exclude_message_id=message_id)
                connection.commit()
                return "ok"
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to mark proposal applied: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Không thể cập nhật trạng thái đề xuất lúc này.",
        ) from exc


def mark_proposal_dismissed(user_id: str, trip_id: str | None, message_id: str) -> str:
    """
    Mark an assistant itinerary proposal message as dismissed by the owning user.
    Returns one of: 'ok', 'not_found', 'already_applied'.
    """
    norm_trip_id = normalize_trip_id(trip_id)
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_chat_tables(connection, cursor)
                lock_clause = "" if isinstance(connection, SQLiteConnectionWrapper) else " FOR UPDATE OF m"
                cursor.execute(
                    f"""
                    SELECT m.metadata
                    FROM public.copilot_messages m
                    JOIN public.copilot_conversations c ON m.conversation_id = c.conversation_id
                    WHERE m.message_id = %s AND m.user_id = %s AND c.trip_id = %s{lock_clause}
                    """,
                    (message_id, user_id, norm_trip_id),
                )
                row = cursor.fetchone()
                if not row:
                    return "not_found"
                meta = _parse_json(row[0], {})
                if not isinstance(meta, dict):
                    meta = {}
                if meta.get("applied") is True:
                    return "already_applied"
                meta["dismissed"] = True
                cursor.execute(
                    "UPDATE public.copilot_messages SET metadata = %s WHERE message_id = %s AND user_id = %s",
                    (json.dumps(meta, ensure_ascii=False), message_id, user_id),
                )
                connection.commit()
                return "ok"
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to mark proposal dismissed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Không thể cập nhật trạng thái đề xuất lúc này.",
        ) from exc


def clear_conversation_history(user_id: str, trip_id: str | None = None) -> None:
    """Delete persisted conversation history for (user_id, trip_id)."""
    norm_trip_id = normalize_trip_id(trip_id)
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_chat_tables(connection, cursor)
                cursor.execute(
                    "DELETE FROM public.copilot_conversations WHERE user_id = %s AND trip_id = %s",
                    (user_id, norm_trip_id),
                )
                connection.commit()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to clear copilot conversation history: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Không thể xóa lịch sử hội thoại lúc này.",
        ) from exc
