import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth import avatar_storage, router as auth_router
from app.auth.password import hash_password, verify_password
from app.auth.service import create_access_token
from app.config import get_settings
from app.db.postgres import SQLiteConnectionWrapper, _ensure_sqlite_tables


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("JWT_SECRET_KEY", "pb18-test-secret")
    monkeypatch.setenv("JWT_ALGORITHM", "HS256")
    get_settings.cache_clear()
    app = FastAPI()
    app.include_router(auth_router.router)
    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()


def authorization(user_id: str = "user-a") -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def user_row(
    user_id: str = "user-a",
    full_name: str = "Green Traveler",
    phone: str | None = None,
    password_hash: str | None = None,
) -> tuple:
    now = datetime.now(timezone.utc)
    return (user_id, full_name, "traveler@example.com", phone, "USER", "ACTIVE", now, now, password_hash)


def mock_connection(fetch_rows: list[tuple | None]) -> MagicMock:
    connection = MagicMock()
    connection.__enter__.return_value = connection
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.side_effect = fetch_rows
    return connection


def test_get_me_returns_authenticated_profile_without_password_hash(client, monkeypatch) -> None:
    secret_hash = hash_password("long-test-password")
    connection = mock_connection([user_row(password_hash=secret_hash), (None,)])
    monkeypatch.setattr(auth_router, "get_connection", lambda: connection)

    response = client.get("/auth/me", headers=authorization())

    assert response.status_code == 200
    assert response.json()["full_name"] == "Green Traveler"
    assert response.json()["has_password"] is True
    assert "password_hash" not in response.json()
    assert secret_hash not in response.text


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer invalid.token"}])
def test_profile_patch_rejects_unauthenticated_or_invalid_jwt(client, headers) -> None:
    response = client.patch("/auth/me", headers=headers, json={"full_name": "Updated Name"})

    assert response.status_code == 401


def test_profile_patch_updates_name_and_phone(client, monkeypatch) -> None:
    connection = mock_connection([user_row(full_name="Updated Name", phone="+84901234567"), (None,)])
    monkeypatch.setattr(auth_router, "get_connection", lambda: connection)

    response = client.patch(
        "/auth/me",
        headers=authorization(),
        json={"full_name": "Updated Name", "phone": "+84901234567"},
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "Updated Name"
    assert response.json()["phone"] == "+84901234567"
    assert connection.commit.called
    update_query, values = connection.cursor.return_value.__enter__.return_value.execute.call_args_list[0].args
    assert "WHERE user_id = %s" in update_query
    assert values[-1] == "user-a"


def test_profile_patch_normalizes_empty_phone_and_trims_name(client, monkeypatch) -> None:
    connection = mock_connection([user_row(full_name="Linh", phone=None), (None,)])
    monkeypatch.setattr(auth_router, "get_connection", lambda: connection)

    response = client.patch(
        "/auth/me", headers=authorization(), json={"full_name": " Linh ", "phone": "  "}
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "Linh"
    assert response.json()["phone"] is None
    update_query, values = connection.cursor.return_value.__enter__.return_value.execute.call_args_list[0].args
    assert "updated_at = CURRENT_TIMESTAMP" in update_query
    assert values == ("Linh", None, "user-a")


@pytest.mark.parametrize(
    "payload",
    [
        {"full_name": "   "},
        {"full_name": "x" * 101},
        {"phone": "not-a-phone"},
        {"email": "attacker@example.com"},
        {"role": "ADMIN"},
        {"status": "ACTIVE"},
        {"password_hash": "forged"},
        {"user_id": "user-b", "full_name": "Other account"},
        {},
    ],
)
def test_profile_patch_rejects_invalid_or_forbidden_fields(client, payload) -> None:
    response = client.patch("/auth/me", headers=authorization(), json=payload)

    assert response.status_code in {400, 422}


def test_profile_patch_uses_jwt_identity_even_if_other_user_exists(client, monkeypatch) -> None:
    connection = mock_connection([user_row(full_name="Own account"), (None,)])
    monkeypatch.setattr(auth_router, "get_connection", lambda: connection)

    response = client.patch(
        "/auth/me", headers=authorization("user-a"), json={"full_name": "Own account"}
    )

    assert response.status_code == 200
    query, values = connection.cursor.return_value.__enter__.return_value.execute.call_args_list[0].args
    assert "WHERE user_id = %s" in query
    assert values == ("Own account", "user-a")


def test_profile_patch_works_with_sqlite_fallback(tmp_path, client, monkeypatch) -> None:
    database_path = tmp_path / "profile.sqlite"
    connection = sqlite3.connect(database_path)
    _ensure_sqlite_tables(connection)
    connection.execute(
        "INSERT INTO users (user_id, full_name, email, phone) VALUES (?, ?, ?, ?)",
        ("user-a", "Before", "traveler@example.com", None),
    )
    connection.commit()
    connection.close()

    monkeypatch.setattr(
        auth_router,
        "get_connection",
        lambda: SQLiteConnectionWrapper(sqlite3.connect(database_path)),
    )
    response = client.patch(
        "/auth/me", headers=authorization(), json={"full_name": "After", "phone": "09012345678"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["full_name"] == "After"
    assert response.json()["phone"] == "09012345678"


def test_change_password_hashes_new_password(client, monkeypatch) -> None:
    old_hash = hash_password("old-password-123")
    connection = mock_connection([(old_hash,)])
    monkeypatch.setattr(auth_router, "get_connection", lambda: connection)
    response = client.post(
        "/auth/change-password",
        headers=authorization(),
        json={
            "current_password": "old-password-123",
            "new_password": "new-password-456",
            "confirm_password": "new-password-456",
        },
    )

    assert response.status_code == 204
    query, values = connection.cursor.return_value.__enter__.return_value.execute.call_args_list[1].args
    assert "password_hash = %s" in query
    assert values[1] == "user-a"
    assert verify_password("new-password-456", values[0])
    assert values[0] != old_hash


def test_change_password_rejects_wrong_current_password_and_google_accounts(client, monkeypatch) -> None:
    wrong_password_connection = mock_connection([(hash_password("correct-password"),)])
    monkeypatch.setattr(auth_router, "get_connection", lambda: wrong_password_connection)
    payload = {
        "current_password": "wrong-password",
        "new_password": "new-password-456",
        "confirm_password": "new-password-456",
    }
    assert client.post("/auth/change-password", headers=authorization(), json=payload).status_code == 400

    google_connection = mock_connection([(None,)])
    monkeypatch.setattr(auth_router, "get_connection", lambda: google_connection)
    payload["current_password"] = "anything"
    response = client.post("/auth/change-password", headers=authorization(), json=payload)
    assert response.status_code == 409


def test_avatar_upload_uses_authenticated_user_and_private_signed_url(client, monkeypatch) -> None:
    connection = mock_connection([(None,), user_row()])
    monkeypatch.setattr(auth_router, "get_connection", lambda: connection)
    uploaded: dict[str, object] = {}

    def fake_upload(path: str, content: bytes, content_type: str) -> None:
        uploaded.update(path=path, content=content, content_type=content_type)

    monkeypatch.setattr(auth_router, "upload_avatar", fake_upload)
    monkeypatch.setattr(auth_router, "get_signed_avatar_url", lambda path: f"https://storage.test/{path}")

    response = client.put(
        "/auth/me/avatar",
        headers={**authorization("user-a"), "Content-Type": "image/jpeg"},
        content=b"\xff\xd8\xffimage-content",
    )

    assert response.status_code == 200, response.text
    assert uploaded["path"].startswith("user-a/")
    assert uploaded["content_type"] == "image/jpeg"
    assert response.json()["avatar_url"].startswith("https://storage.test/user-a/")


@pytest.mark.parametrize(
    "content_type,content,expected_status",
    [
        ("text/plain", b"not-image", 415),
        ("image/png", b"not-a-png", 400),
        ("image/png", b"\x89PNG\r\n\x1a\n" + b"0" * (5 * 1024 * 1024), 413),
    ],
    ids=["unsupported-type", "mime-content-mismatch", "oversized-image"],
)
def test_avatar_upload_rejects_invalid_type_content_and_size(client, content_type, content, expected_status) -> None:
    response = client.put(
        "/auth/me/avatar",
        headers={**authorization(), "Content-Type": content_type},
        content=content,
    )
    assert response.status_code == expected_status


def test_avatar_upload_requires_valid_jwt(client) -> None:
    response = client.put(
        "/auth/me/avatar", headers={"Content-Type": "image/png"}, content=b"\x89PNG\r\n\x1a\n"
    )
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("storage_error", "expected_status", "expected_detail"),
    [
        (
            avatar_storage.AvatarStorageForbidden,
            403,
            "Avatar storage denied access. Check the backend key and bucket configuration.",
        ),
        (
            avatar_storage.AvatarStoragePayloadTooLarge,
            413,
            "Avatar image exceeds the storage upload limit.",
        ),
        (
            avatar_storage.AvatarStorageUnavailable,
            503,
            "Avatar storage is not configured or is unavailable.",
        ),
    ],
)
def test_avatar_upload_maps_storage_failures_to_safe_responses(
    client, monkeypatch, storage_error, expected_status: int, expected_detail: str
) -> None:
    connection = mock_connection([(None,)])
    monkeypatch.setattr(auth_router, "get_connection", lambda: connection)

    def fail_upload(*_args) -> None:
        raise storage_error("private upstream details")

    monkeypatch.setattr(auth_router, "upload_avatar", fail_upload)
    response = client.put(
        "/auth/me/avatar",
        headers={**authorization(), "Content-Type": "image/jpeg"},
        content=b"\xff\xd8\xffimage-content",
    )

    assert response.status_code == expected_status
    assert response.json()["detail"] == expected_detail
    assert "private upstream details" not in response.text


def test_avatar_upload_returns_503_when_private_signed_url_fails(client, monkeypatch) -> None:
    connection = mock_connection([(None,)])
    monkeypatch.setattr(auth_router, "get_connection", lambda: connection)
    monkeypatch.setattr(auth_router, "upload_avatar", lambda *_args: None)

    def fail_signed_url(_path: str) -> str:
        raise avatar_storage.AvatarStorageUnavailable

    monkeypatch.setattr(auth_router, "get_signed_avatar_url", fail_signed_url)
    monkeypatch.setattr(auth_router, "delete_avatar", lambda _path: None)

    response = client.put(
        "/auth/me/avatar",
        headers={**authorization(), "Content-Type": "image/jpeg"},
        content=b"\xff\xd8\xffimage-content",
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Avatar storage is not configured or is unavailable."
