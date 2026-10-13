from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

from app.auth.service import create_otp_session_token
from app.config import get_settings
from app.main import app

client = TestClient(app)


def test_google_login_dispatches_otp() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"

    mock_google_user = {
        "email": "hasagi1706@gmail.com",
        "full_name": "Minh Nguyen",
        "google_id": "google-sub-123",
    }

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = ("user-uuid-123", "ACTIVE")

    with (
        patch("app.auth.router.verify_google_token", return_value=mock_google_user),
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.auth.router.send_otp_email") as mock_send_otp,
        patch("app.config.get_settings", return_value=settings),
    ):
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/google",
            json={"credential": "valid.google.idtoken"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["require_otp"] is True
    assert data["email"] == "hasagi1706@gmail.com"
    assert "otp_session_token" in data
    mock_send_otp.assert_called_once()
    args = mock_send_otp.call_args[0]
    assert args[0] == "hasagi1706@gmail.com"
    assert len(args[2]) == 6  # 6-digit OTP


def test_verify_otp_success() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"
    token = create_otp_session_token("hasagi1706@gmail.com", "user-uuid-123")

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    # (id, expected_code, attempts, expires_at, is_used)
    mock_cursor.fetchone.return_value = ("otp-uuid-1", "654321", 0, expires_at, False)

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.config.get_settings", return_value=settings),
    ):
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/verify-otp",
            json={
                "email": "hasagi1706@gmail.com",
                "otp_code": "654321",
                "otp_session_token": token,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    # Ensure OTP marked as used
    assert mock_cursor.execute.call_count >= 2


def test_verify_otp_wrong_code() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"
    token = create_otp_session_token("hasagi1706@gmail.com", "user-uuid-123")

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    mock_cursor.fetchone.return_value = ("otp-uuid-1", "999999", 1, expires_at, False)

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.config.get_settings", return_value=settings),
    ):
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/verify-otp",
            json={
                "email": "hasagi1706@gmail.com",
                "otp_code": "111111",
                "otp_session_token": token,
            },
        )

    assert response.status_code == 400
    assert "không chính xác" in response.json()["detail"].lower()


def test_verify_otp_expired() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"
    token = create_otp_session_token("hasagi1706@gmail.com", "user-uuid-123")

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    expired_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    mock_cursor.fetchone.return_value = ("otp-uuid-1", "123456", 0, expired_at, False)

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.config.get_settings", return_value=settings),
    ):
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/verify-otp",
            json={
                "email": "hasagi1706@gmail.com",
                "otp_code": "123456",
                "otp_session_token": token,
            },
        )

    assert response.status_code == 400
    assert "hết hạn" in response.json()["detail"].lower()


def test_resend_otp_success() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"
    token = create_otp_session_token("hasagi1706@gmail.com", "user-uuid-123")

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    # Last OTP was created 90 seconds ago
    old_created = datetime.now(timezone.utc) - timedelta(seconds=90)
    mock_cursor.fetchone.side_effect = [(old_created,), ("Minh Nguyen",)]

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.auth.router.send_otp_email") as mock_send_otp,
        patch("app.config.get_settings", return_value=settings),
    ):
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/resend-otp",
            json={
                "email": "hasagi1706@gmail.com",
                "otp_session_token": token,
            },
        )

    assert response.status_code == 200
    assert response.json()["email"] == "hasagi1706@gmail.com"
    mock_send_otp.assert_called_once()


def test_resend_otp_rate_limited() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"
    token = create_otp_session_token("hasagi1706@gmail.com", "user-uuid-123")

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    # Last OTP was created 20 seconds ago (< 60s)
    recent_created = datetime.now(timezone.utc) - timedelta(seconds=20)
    mock_cursor.fetchone.return_value = (recent_created,)

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.config.get_settings", return_value=settings),
    ):
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/resend-otp",
            json={
                "email": "hasagi1706@gmail.com",
                "otp_session_token": token,
            },
        )

    assert response.status_code == 429
    assert "đợi thêm" in response.json()["detail"].lower()
