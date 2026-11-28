from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import postgres
from app.itineraries import repository as itinerary_repository
from app import main


def test_test_client_startup_never_seeds_sample_itineraries(monkeypatch) -> None:
    calls = []
    close_calls = []
    monkeypatch.setattr(main, "seed_sample_itineraries", lambda: calls.append("seed"), raising=False)
    monkeypatch.setattr(main.neo4j, "close_driver", lambda: close_calls.append("close"))
    monkeypatch.setattr(
        postgres,
        "get_connection",
        lambda: pytest.fail("FastAPI startup must not open a database connection"),
    )

    for _ in range(2):
        with TestClient(main.app):
            pass

    assert calls == []
    assert close_calls == ["close", "close"]

    registered_paths = {route.path for route in main.app.routes}
    assert "/v1/recommendations/poi" in registered_paths
    assert "/pois/{poi_id}/explanation-facts" in registered_paths
    assert "/itineraries/compute" in registered_paths


def test_connection_in_test_mode_does_not_bootstrap_or_import_csv(monkeypatch, tmp_path: Path) -> None:
    test_database = tmp_path / "isolated.sqlite3"
    monkeypatch.setattr(
        postgres,
        "get_settings",
        lambda: Settings(APP_ENV="test", TEST_DATABASE_PATH=str(test_database)),
    )
    monkeypatch.setattr(postgres, "_ensure_sqlite_tables", lambda *_args: pytest.fail("connection must not run DDL"))
    monkeypatch.setattr(
        postgres,
        "_bootstrap_sqlite_reference_data",
        lambda *_args, **_kwargs: pytest.fail("connection must not seed or import CSV"),
    )

    connection = postgres.get_connection()
    try:
        assert connection._conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall() == []
    finally:
        connection.close()


def test_test_mode_rejects_database_path_outside_system_temp(monkeypatch) -> None:
    monkeypatch.setattr(
        postgres,
        "get_settings",
        lambda: Settings(APP_ENV="test", TEST_DATABASE_PATH=str(Path.cwd() / "must-not-create.sqlite3")),
    )

    with pytest.raises(RuntimeError, match="temporary directory"):
        postgres.get_connection()

    assert not (Path.cwd() / "must-not-create.sqlite3").exists()


def test_pytest_cannot_switch_provider_to_production(monkeypatch) -> None:
    monkeypatch.setattr(
        postgres,
        "get_settings",
        lambda: Settings(APP_ENV="production", DATABASE_URL="postgresql://test.invalid/greentrip"),
    )
    monkeypatch.setattr(postgres, "connect", lambda *_args, **_kwargs: pytest.fail("pytest must never connect to PostgreSQL"))

    with pytest.raises(RuntimeError, match="isolated test database provider"):
        postgres.get_connection()


def test_development_sqlite_requires_explicit_opt_in(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    database_path = tmp_path / "development.sqlite3"
    monkeypatch.setattr(
        postgres,
        "get_settings",
        lambda: Settings(
            APP_ENV="development",
            SQLITE_FALLBACK_ENABLED=False,
            SQLITE_DATABASE_PATH=str(database_path),
        ),
    )

    with pytest.raises(RuntimeError, match="explicitly enable development SQLite"):
        postgres.get_connection()
    assert not database_path.exists()

    monkeypatch.setattr(
        postgres,
        "get_settings",
        lambda: Settings(
            APP_ENV="development",
            SQLITE_FALLBACK_ENABLED=True,
            SQLITE_DATABASE_PATH=str(database_path),
        ),
    )
    connection = postgres.get_connection()
    connection.close()
    assert database_path.exists()


def test_production_sample_seed_is_rejected_before_opening_database(monkeypatch) -> None:
    monkeypatch.setattr(
        itinerary_repository,
        "get_settings",
        lambda: Settings(APP_ENV="production", DATABASE_URL="postgresql://test.invalid/greentrip"),
    )
    monkeypatch.setattr(
        itinerary_repository,
        "get_connection",
        lambda: pytest.fail("production seed must be rejected first"),
    )

    with pytest.raises(RuntimeError, match="available only in development"):
        itinerary_repository.seed_sample_itineraries()


def test_sample_seed_refuses_postgres_even_in_development(monkeypatch) -> None:
    monkeypatch.setattr(
        itinerary_repository,
        "get_settings",
        lambda: Settings(
            APP_ENV="development",
            DATABASE_URL="postgresql://test.invalid/greentrip",
            SQLITE_FALLBACK_ENABLED=True,
        ),
    )
    monkeypatch.setattr(
        itinerary_repository,
        "get_connection",
        lambda: pytest.fail("sample seed must refuse PostgreSQL before opening a connection"),
    )

    with pytest.raises(RuntimeError, match="refuses a configured PostgreSQL database"):
        itinerary_repository.seed_sample_itineraries()


def test_sample_seed_requires_explicit_sqlite_opt_in(monkeypatch) -> None:
    monkeypatch.setattr(
        itinerary_repository,
        "get_settings",
        lambda: Settings(APP_ENV="development", DATABASE_URL="", SQLITE_FALLBACK_ENABLED=False),
    )
    monkeypatch.setattr(
        itinerary_repository,
        "get_connection",
        lambda: pytest.fail("sample seed must require SQLite opt-in before opening a connection"),
    )

    with pytest.raises(RuntimeError, match="SQLITE_FALLBACK_ENABLED=true"):
        itinerary_repository.seed_sample_itineraries()
