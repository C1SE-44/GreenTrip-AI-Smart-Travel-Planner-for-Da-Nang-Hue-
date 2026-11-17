from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import sys
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth import router as auth_router
from app.auth import service as auth_service
from app.config import get_settings
from app.db import postgres as pg_db
from app.main import app
from app.saved_places import router as saved_places_router
from app.saved_places.collections_repository import CollectionNotFoundError, DefaultCollectionError, InvalidCollectionNameError
from app.trips import router as trips_router

client = TestClient(app)


@pytest.fixture
def jwt_settings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "dot1-test-secret-key")
    monkeypatch.setenv("JWT_ALGORITHM", "HS256")
    get_settings.cache_clear()
    yield get_settings()
    get_settings.cache_clear()


def test_decode_access_token_rejects_verification_and_otp_tokens(jwt_settings) -> None:
    access_token = auth_service.create_access_token("user-42")
    verification_token = auth_service.create_verification_token("user@example.com")
    otp_token = auth_service.create_otp_session_token("user@example.com", "user-42")

    assert auth_service.decode_access_token(access_token) == "user-42"
    assert auth_service.decode_access_token(verification_token) is None
    assert auth_service.decode_access_token(otp_token) is None


def test_signup_rejects_inactive_account_takeover_and_normalizes_email(jwt_settings) -> None:
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = ("existing-inactive-id", "INACTIVE")

    with patch("app.auth.router.get_connection") as mock_get_conn:
        mock_get_conn.return_value.__enter__.return_value = mock_conn
        response = client.post(
            "/auth/signup",
            json={
                "full_name": "Attacker",
                "email": "Victim@Example.COM",
                "password": "AttackerPassword123!",
            },
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "Email is already registered."
    assert mock_cursor.execute.call_count == 1
    sql, params = mock_cursor.execute.call_args[0]
    assert "LOWER(email)" in sql
    assert params == ("victim@example.com",)


def test_verify_google_token_fails_closed_without_client_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "")
    get_settings.cache_clear()
    try:
        with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
            result = auth_service.verify_google_token("fake.google.token")
        assert result is None
        mock_verify.assert_not_called()
    finally:
        get_settings.cache_clear()


def test_cors_blocks_untrusted_origin_and_allows_local_dev() -> None:
    allowed = client.options(
        "/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"

    blocked = client.options(
        "/auth/login",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert blocked.headers.get("access-control-allow-origin") is None


def test_saved_places_errors_use_valid_utf8(jwt_settings, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = {"Authorization": f"Bearer {auth_service.create_access_token(str(uuid4()))}"}

    monkeypatch.setattr(
        saved_places_router,
        "create_saved_place_collection",
        lambda *_args: (_ for _ in ()).throw(InvalidCollectionNameError("bad name")),
    )
    invalid_res = client.post("/saved-places/collections", json={"name": "   "}, headers=headers)
    assert invalid_res.status_code == 422
    assert invalid_res.json()["detail"] == "Nhập tên bộ sưu tập từ 1 đến 80 ký tự."

    monkeypatch.setattr(
        saved_places_router,
        "delete_saved_place_collection",
        lambda *_args: (_ for _ in ()).throw(CollectionNotFoundError("missing")),
    )
    missing_res = client.delete(f"/saved-places/collections/{uuid4()}", headers=headers)
    assert missing_res.status_code == 404
    assert missing_res.json()["detail"] == "Không tìm thấy bộ sưu tập này."

    monkeypatch.setattr(
        saved_places_router,
        "delete_saved_place_collection",
        lambda *_args: (_ for _ in ()).throw(DefaultCollectionError("default")),
    )
    default_res = client.delete(f"/saved-places/collections/{uuid4()}", headers=headers)
    assert default_res.status_code == 409
    assert default_res.json()["detail"] == "Không thể xóa bộ sưu tập mặc định."


def test_copilot_chat_hides_raw_exception_details(monkeypatch: pytest.MonkeyPatch) -> None:
    app.dependency_overrides[trips_router.get_trips_connection] = lambda: MagicMock()
    try:
        monkeypatch.setattr(
            trips_router,
            "process_copilot_chat",
            lambda *_args: (_ for _ in ()).throw(RuntimeError("secret-db-dsn-leak")),
        )
        response = client.post("/trips/copilot/chat", json={"message": "gợi ý lịch trình"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert "secret-db-dsn-leak" not in response.text
    assert response.json()["detail"] == "Không thể xử lý yêu cầu Copilot lúc này."


def test_otp_routes_accept_sqlite_string_timestamps_and_avoid_interval_sql(jwt_settings) -> None:
    token = auth_service.create_otp_session_token("hasagi1706@gmail.com", "user-uuid-123")

    naive_future = (datetime.now(timezone.utc) + timedelta(minutes=5)).strftime("%Y-%m-%d %H:%M:%S")
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = ("otp-uuid-1", "654321", 0, naive_future, 0)

    with patch("app.auth.router.get_connection") as mock_get_conn:
        mock_get_conn.return_value.__enter__.return_value = mock_conn
        verify_res = client.post(
            "/auth/verify-otp",
            json={"email": "hasagi1706@gmail.com", "otp_code": "654321", "otp_session_token": token},
        )
    assert verify_res.status_code == 200

    old_created_str = (datetime.now(timezone.utc) - timedelta(seconds=90)).isoformat()
    mock_cursor.execute.reset_mock()
    mock_cursor.fetchone.side_effect = [(old_created_str,), ("Minh Nguyen",)]

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.auth.router.send_otp_email"),
    ):
        mock_get_conn.return_value.__enter__.return_value = mock_conn
        resend_res = client.post(
            "/auth/resend-otp",
            json={"email": "hasagi1706@gmail.com", "otp_session_token": token},
        )
    assert resend_res.status_code == 200
    insert_sql, insert_params = mock_cursor.execute.call_args_list[-1][0]
    assert "INTERVAL" not in insert_sql.upper()
    assert isinstance(insert_params[-1], datetime)
    assert insert_params[-1].tzinfo == timezone.utc


def test_sqlite_boolean_rewrite_preserves_literals_and_identifiers() -> None:
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE items (is_true_flag INTEGER, label TEXT)")
    wrapper = pg_db.SQLiteCursorWrapper(conn.cursor())
    wrapper.execute(
        "INSERT INTO items (is_true_flag, label) VALUES (TRUE, %s)",
        ("TRUE",),
    )
    wrapper.execute("SELECT is_true_flag, label FROM items WHERE label = 'TRUE' AND is_true_flag = TRUE")
    assert wrapper.fetchone() == (1, "TRUE")
    conn.close()


def test_postgres_connection_retries_after_cooldown(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/greentrip")
    get_settings.cache_clear()
    monkeypatch.setattr(pg_db, "_POSTGRES_RETRY_AFTER", 0.0)

    clock = iter([100.0, 100.0, 105.0, 131.0])
    monkeypatch.setattr(pg_db.time, "monotonic", lambda: next(clock))

    fake_pg_conn = object()
    attempts = 0

    def fake_connect(*_args, **_kwargs):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise ConnectionError("temporary outage")
        return fake_pg_conn

    monkeypatch.setattr(pg_db, "connect", fake_connect)
    try:
        fallback = pg_db.get_connection()
        assert isinstance(fallback, pg_db.SQLiteConnectionWrapper)
        fallback.close()

        # Within 30s cooldown: uses SQLite without dialing Postgres again
        during_cooldown = pg_db.get_connection()
        assert isinstance(during_cooldown, pg_db.SQLiteConnectionWrapper)
        during_cooldown.close()
        assert attempts == 1

        # After 30s cooldown expires: retries Postgres and succeeds
        recovered = pg_db.get_connection()
        assert recovered is fake_pg_conn
        assert attempts == 2
    finally:
        monkeypatch.setattr(pg_db, "_POSTGRES_RETRY_AFTER", 0.0)
        get_settings.cache_clear()
