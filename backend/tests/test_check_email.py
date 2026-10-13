from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_check_email_exists() -> None:
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = ("ACTIVE",)

    with patch("app.auth.router.get_connection") as mock_get_conn:
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/check-email",
            json={"email": "existing.user@example.com"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["exists"] is True
    assert data["email"] == "existing.user@example.com"
    assert data["status"] == "ACTIVE"


def test_check_email_not_exists() -> None:
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = None

    with patch("app.auth.router.get_connection") as mock_get_conn:
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        response = client.post(
            "/auth/check-email",
            json={"email": "new.user@example.com"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["exists"] is False
    assert data["email"] == "new.user@example.com"
    assert data["status"] is None


def test_check_email_invalid_format() -> None:
    response = client.post(
        "/auth/check-email",
        json={"email": "invalid-email"},
    )
    assert response.status_code == 422
