from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import certifi
import pytest
from neo4j import TrustCustomCAs

from app.db import neo4j


def make_settings(app_env: str, uri: str) -> SimpleNamespace:
    return SimpleNamespace(
        APP_ENV=app_env,
        NEO4J_URI=uri,
        NEO4J_USERNAME="test-user",
        NEO4J_PASSWORD="test-password",
        NEO4J_DATABASE="neo4j",
        neo4j_configured=True,
    )


def capture_driver_options(
    monkeypatch: Any,
    *,
    app_env: str,
    platform: str,
    uri: str,
) -> tuple[str, dict[str, Any]]:
    calls: list[tuple[str, dict[str, Any]]] = []
    driver = object()

    monkeypatch.setattr(neo4j, "_driver", None)
    monkeypatch.setattr(neo4j.sys, "platform", platform)
    monkeypatch.setattr(neo4j, "get_settings", lambda: make_settings(app_env, uri))
    monkeypatch.setattr(
        neo4j.GraphDatabase,
        "driver",
        lambda driver_uri, **options: calls.append((driver_uri, options)) or driver,
    )

    assert neo4j.initialize_driver() is driver
    assert len(calls) == 1
    return calls[0]


def test_windows_development_uses_certifi_bundle_with_verified_tls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SSL_CERT_FILE", raising=False)
    driver_uri, options = capture_driver_options(
        monkeypatch,
        app_env="development",
        platform="win32",
        uri="neo4j+s://aura.example:7687?policy=default",
    )

    assert driver_uri == "neo4j://aura.example:7687?policy=default"
    assert options["encrypted"] is True
    certificates = options["trusted_certificates"]
    assert isinstance(certificates, TrustCustomCAs)
    assert certificates.certs == (certifi.where(),)
    assert options["connection_timeout"] == 2.0


@pytest.mark.parametrize("app_env", ["staging", "production"])
def test_deployed_environments_keep_original_secure_aura_uri_and_driver_defaults(
    monkeypatch: pytest.MonkeyPatch,
    app_env: str,
) -> None:
    uri = "neo4j+s://aura.example:7687"
    driver_uri, options = capture_driver_options(
        monkeypatch,
        app_env=app_env,
        platform="win32",
        uri=uri,
    )

    assert driver_uri == uri
    assert "encrypted" not in options
    assert "trusted_certificates" not in options


def test_non_windows_development_keeps_original_aura_uri(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uri = "neo4j+s://aura.example:7687"
    driver_uri, options = capture_driver_options(
        monkeypatch,
        app_env="development",
        platform="linux",
        uri=uri,
    )

    assert driver_uri == uri
    assert "encrypted" not in options
    assert "trusted_certificates" not in options


def test_windows_development_does_not_rewrite_non_aura_uri(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uri = "bolt+s://localhost:7687"
    driver_uri, options = capture_driver_options(
        monkeypatch,
        app_env="development",
        platform="win32",
        uri=uri,
    )

    assert driver_uri == uri
    assert "encrypted" not in options
    assert "trusted_certificates" not in options
