from pathlib import Path
import sys
from unittest.mock import MagicMock

import jwt
import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth.password import hash_password
from app.auth import service as auth_service
from app.config import get_settings
from app.main import app


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("JWT_SECRET_KEY", "unit-test-secret-not-for-production")
    monkeypatch.setenv("JWT_ALGORITHM", "HS256")
    monkeypatch.setenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30")
    get_settings.cache_clear()
    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()


def mock_database_user(user: tuple[str, str] | None) -> MagicMock:
    connection = MagicMock()
    connection.__enter__.return_value = connection
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = user
    return connection


def test_login_returns_jwt_with_required_claims(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    password_hash = hash_password("password123")
    connection = mock_database_user(("user-123", password_hash))
    monkeypatch.setattr(auth_service, "get_connection", lambda: connection)

    response = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "password123"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["access_token"]
    assert data["token_type"] == "bearer"
    claims = jwt.decode(
        data["access_token"],
        "unit-test-secret-not-for-production",
        algorithms=["HS256"],
    )
    assert set(claims) == {"sub", "exp"}
    assert claims["sub"] == "user-123"
    assert isinstance(claims["exp"], int)
    assert "password" not in data
    assert "password_hash" not in data
    assert "password123" not in response.text
    assert password_hash not in response.text
    assert password_hash not in data["access_token"]


def test_login_rejects_incorrect_password(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    connection = mock_database_user(("user-123", hash_password("password123")))
    monkeypatch.setattr(auth_service, "get_connection", lambda: connection)

    response = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "incorrect-password"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password"}


def test_login_rejects_unknown_email(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    connection = mock_database_user(None)
    monkeypatch.setattr(auth_service, "get_connection", lambda: connection)

    response = client.post(
        "/auth/login",
        json={"email": "unknown@example.com", "password": "password123"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password"}


def test_login_rejects_invalid_request_body(client: TestClient) -> None:
    response = client.post("/auth/login", json={"email": "user@example.com"})

    assert response.status_code == 422


def test_login_is_in_openapi(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "post" in response.json()["paths"]["/auth/login"]