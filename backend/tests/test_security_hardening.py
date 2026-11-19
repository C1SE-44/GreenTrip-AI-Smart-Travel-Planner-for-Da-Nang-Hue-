from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.rate_limit import rate_limiter


def test_production_rejects_default_or_short_jwt_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        Settings(_env_file=None)

    monkeypatch.setenv("JWT_SECRET_KEY", "change-me")
    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        Settings(_env_file=None)

    monkeypatch.setenv("JWT_SECRET_KEY", "too-short-secret")
    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        Settings(_env_file=None)


def test_production_accepts_strong_jwt_secret_and_dev_allows_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", "a-very-strong-production-secret-key-32chars!")
    prod_settings = Settings(_env_file=None)
    assert prod_settings.APP_ENV == "production"

    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    dev_settings = Settings(_env_file=None)
    assert dev_settings.APP_ENV == "development"


def test_login_rate_limit_blocks_excess_requests_and_isolates_ip() -> None:
    client = TestClient(app)
    with patch("app.auth.router.authenticate_user", return_value=None):
        for _ in range(10):
            resp = client.post(
                "/auth/login",
                json={"email": "user@example.com", "password": "wrong-password"},
                headers={"X-Forwarded-For": "203.0.113.10"},
            )
            assert resp.status_code == 401

        blocked = client.post(
            "/auth/login",
            json={"email": "user@example.com", "password": "wrong-password"},
            headers={"X-Forwarded-For": "203.0.113.10"},
        )
        assert blocked.status_code == 429
        assert int(blocked.headers["Retry-After"]) >= 1

        # A different client IP should remain unaffected.
        other_ip = client.post(
            "/auth/login",
            json={"email": "user@example.com", "password": "wrong-password"},
            headers={"X-Forwarded-For": "203.0.113.99"},
        )
        assert other_ip.status_code == 401


def test_rate_limit_can_be_disabled_via_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    get_settings.cache_clear()
    try:
        client = TestClient(app)
        with patch("app.auth.router.authenticate_user", return_value=None):
            for _ in range(12):
                resp = client.post(
                    "/auth/login",
                    json={"email": "user@example.com", "password": "wrong-password"},
                    headers={"X-Forwarded-For": "198.51.100.5"},
                )
                assert resp.status_code == 401
    finally:
        get_settings.cache_clear()
        rate_limiter.reset()


def test_copilot_chat_rate_limit_returns_429_after_20_requests() -> None:
    client = TestClient(app)
    payload = {
        "message": "Gợi ý quán chay",
        "trip_context": {
            "destination": "Đà Nẵng",
            "days_count": 2,
            "current_day": 1,
        },
    }
    fake_reply = {
        "reply_text": "Ok",
        "intent": "qa",
        "suggested_pois": [],
        "action_type": "none",
    }
    with patch("app.trips.router.get_connection", return_value=object()), patch(
        "app.trips.router.process_copilot_chat", return_value=fake_reply
    ):
        for _ in range(20):
            resp = client.post(
                "/trips/copilot/chat",
                json=payload,
                headers={"X-Forwarded-For": "198.51.100.77"},
            )
            assert resp.status_code == 200

        blocked = client.post(
            "/trips/copilot/chat",
            json=payload,
            headers={"X-Forwarded-For": "198.51.100.77"},
        )
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers
