from datetime import datetime, timezone
from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

from app.auth.service import create_verification_token
from app.config import get_settings
from app.main import app

client = TestClient(app)


def test_signup_dispatches_verification_email() -> None:
    now = datetime.now(timezone.utc)
    mock_user_row = (
        "550e8400-e29b-41d4-a716-446655440000",
        "Minh Nguyen",
        "hasagi1706@gmail.com",
        "0901234567",
        "USER",
        "INACTIVE",
        now,
        now,
    )

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.side_effect = [None, mock_user_row]

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.auth.router.send_verification_email") as mock_send_email,
        patch("app.config.get_settings") as mock_get_settings,
    ):
        settings = get_settings()
        settings.JWT_SECRET_KEY = "test-secret-key-123"
        mock_get_settings.return_value = settings
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/signup",
            json={
                "full_name": "Minh Nguyen",
                "email": "hasagi1706@gmail.com",
                "password": "Password123!",
            },
        )

    assert response.status_code == 201
    data = response.json()
    assert data["user"]["email"] == "hasagi1706@gmail.com"
    assert data["user"]["status"] == "INACTIVE"
    mock_send_email.assert_called_once()
    call_args = mock_send_email.call_args[0]
    assert call_args[0] == "hasagi1706@gmail.com"
    assert call_args[1] == "Minh Nguyen"
    assert len(call_args[2]) > 10  # token exists


def test_verify_email_success() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"
    token = create_verification_token("hasagi1706@gmail.com")

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    # User exists with status INACTIVE
    mock_cursor.fetchone.return_value = ("user-uuid-123", "INACTIVE")

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.config.get_settings") as mock_get_settings,
    ):
        mock_get_settings.return_value = settings
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/verify-email",
            json={"token": token},
        )

    assert response.status_code == 200
    data = response.json()
    assert "thành công" in data["message"].lower() or "success" in data["message"].lower()
    assert data["email"] == "hasagi1706@gmail.com"
    # Verify DB update was executed
    assert mock_cursor.execute.call_count >= 2
    mock_conn.commit.assert_called_once()


def test_verify_email_already_active() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"
    token = create_verification_token("hasagi1706@gmail.com")

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    # User is already ACTIVE
    mock_cursor.fetchone.return_value = ("user-uuid-123", "ACTIVE")

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.config.get_settings") as mock_get_settings,
    ):
        mock_get_settings.return_value = settings
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/verify-email",
            json={"token": token},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "hasagi1706@gmail.com"


def test_verify_email_invalid_token() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"

    with patch("app.config.get_settings") as mock_get_settings:
        mock_get_settings.return_value = settings
        response = client.post(
            "/auth/verify-email",
            json={"token": "invalid.corrupted.token"},
        )

    assert response.status_code == 400
    assert "hết hạn" in response.json()["detail"].lower() or "invalid" in response.json()["detail"].lower()


def test_verify_email_user_not_found() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"
    token = create_verification_token("notfound@example.com")

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = None

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.config.get_settings") as mock_get_settings,
    ):
        mock_get_settings.return_value = settings
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/verify-email",
            json={"token": token},
        )

    assert response.status_code == 404


def test_login_rejects_inactive_account() -> None:
    from app.auth.password import hash_password

    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    password_hash = hash_password("ValidPassword123!")
    # User exists but status is INACTIVE
    mock_cursor.fetchone.return_value = ("user-uuid-123", password_hash, "INACTIVE")

    with (
        patch("app.auth.service.get_connection") as mock_get_conn,
        patch("app.config.get_settings") as mock_get_settings,
    ):
        mock_get_settings.return_value = settings
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/login",
            json={
                "email": "hasagi1706@gmail.com",
                "password": "ValidPassword123!",
            },
        )

    assert response.status_code == 403
    assert "chưa được kích hoạt" in response.json()["detail"].lower()


def test_google_login_success() -> None:
    settings = get_settings()
    settings.JWT_SECRET_KEY = "test-secret-key-123"

    mock_google_profile = {
        "email": "hasagi1706@gmail.com",
        "full_name": "Minh Nguyen Google",
        "google_id": "google-sub-12345",
        "picture": "https://example.com/photo.jpg",
    }

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    # User does not exist, then inserted
    mock_cursor.fetchone.side_effect = [None, ("new-user-uuid-999",)]

    with (
        patch("app.auth.router.verify_google_token") as mock_verify_google,
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.auth.router.send_otp_email") as mock_send_otp,
        patch("app.config.get_settings") as mock_get_settings,
    ):
        mock_verify_google.return_value = mock_google_profile
        mock_get_settings.return_value = settings
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/google",
            json={"credential": "mock_google_id_token_string"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["require_otp"] is False
    assert data["email"] == "hasagi1706@gmail.com"
    assert "access_token" in data
    assert data["token_type"] == "bearer"

