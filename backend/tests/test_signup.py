from datetime import datetime, timezone
from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient
from psycopg.errors import UniqueViolation

from app.main import app

client = TestClient(app)


def test_signup_success() -> None:
    now = datetime.now(timezone.utc)
    mock_user_row = (
        "550e8400-e29b-41d4-a716-446655440000",
        "Nguyen Van A",
        "nguyenvana@example.com",
        "0901234567",
        "USER",
        "ACTIVE",
        now,
        now,
    )

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    # First fetchone checks existing user (returns None), second returns created user
    mock_cursor.fetchone.side_effect = [None, mock_user_row]

    with (
        patch("app.auth.router.get_connection") as mock_get_conn,
        patch("app.auth.router.send_verification_email") as mock_send_email,
    ):
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/signup",
            json={
                "full_name": "Nguyen Van A",
                "email": "nguyenvana@example.com",
                "phone": "0901234567",
                "password": "SecurePassword123!",
            },
        )

    assert response.status_code == 201
    data = response.json()
    assert data["message"] == "User registered successfully."
    assert data["user"]["user_id"] == "550e8400-e29b-41d4-a716-446655440000"
    assert data["user"]["full_name"] == "Nguyen Van A"
    assert data["user"]["email"] == "nguyenvana@example.com"
    assert data["user"]["phone"] == "0901234567"
    assert data["user"]["role"] == "USER"
    assert data["user"]["status"] == "ACTIVE"
    assert "password" not in data
    assert "password" not in data["user"]
    assert "password_hash" not in data
    assert "password_hash" not in data["user"]


def test_signup_invalid_email() -> None:
    response = client.post(
        "/auth/signup",
        json={
            "full_name": "Nguyen Van A",
            "email": "invalid-email-format",
            "password": "SecurePassword123!",
        },
    )

    assert response.status_code == 422
    errors = response.json().get("detail", [])
    assert any("email" in err["loc"] for err in errors)


def test_signup_short_password() -> None:
    response = client.post(
        "/auth/signup",
        json={
            "full_name": "Nguyen Van A",
            "email": "valid@example.com",
            "password": "short",
        },
    )

    assert response.status_code == 422
    errors = response.json().get("detail", [])
    assert any("password" in err["loc"] for err in errors)


def test_signup_empty_full_name() -> None:
    response = client.post(
        "/auth/signup",
        json={
            "full_name": "   ",
            "email": "valid@example.com",
            "password": "SecurePassword123!",
        },
    )

    assert response.status_code == 422
    errors = response.json().get("detail", [])
    assert any("full_name" in err["loc"] for err in errors)


def test_signup_duplicate_email() -> None:
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = ("existing-uuid",)

    with patch("app.auth.router.get_connection") as mock_get_conn:
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/signup",
            json={
                "full_name": "Nguyen Van A",
                "email": "duplicate@example.com",
                "password": "SecurePassword123!",
            },
        )

    assert response.status_code == 409
    data = response.json()
    assert data["detail"] == "Email is already registered."


def test_signup_duplicate_email_on_race_condition() -> None:
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    # First query finds nothing, but insert hits unique violation
    mock_cursor.fetchone.return_value = None
    mock_cursor.execute.side_effect = [None, UniqueViolation("duplicate key")]

    with patch("app.auth.router.get_connection") as mock_get_conn:
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/signup",
            json={
                "full_name": "Nguyen Van A",
                "email": "race_duplicate@example.com",
                "password": "SecurePassword123!",
            },
        )

    assert response.status_code == 409
    data = response.json()
    assert data["detail"] == "Email is already registered."


def test_signup_cors_preflight() -> None:
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    response = client.options("/auth/signup", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "POST" in response.headers.get("access-control-allow-methods", "")

