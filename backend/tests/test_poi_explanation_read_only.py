import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.pois import explanation_repository as repository


POI_ID = "084a4f33-2af6-44cf-83ad-88ceaaac1092"


class FakeCursor:
    def __init__(self, row: tuple[Any, ...] | None) -> None:
        self.row = row
        self.query = ""
        self.parameters: tuple[Any, ...] = ()

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, query: str, parameters: tuple[Any, ...]) -> None:
        self.query = query
        self.parameters = parameters

    def fetchone(self) -> tuple[Any, ...] | None:
        return self.row


class FakeConnection:
    def __init__(self, row: tuple[Any, ...] | None) -> None:
        self.fake_cursor = FakeCursor(row)
        self.closed = False

    def cursor(self) -> FakeCursor:
        return self.fake_cursor

    def close(self) -> None:
        self.closed = True

    def commit(self) -> None:
        raise AssertionError("The explanation fallback must never commit PostgreSQL.")


def test_postgres_fallback_uses_read_only_connection_and_exact_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = (POI_ID, "Sample POI", True, False, None, "nature_landscape", "Nature", "Da Nang", "DANANG")
    connection = FakeConnection(row)
    connect_arguments: dict[str, Any] = {}

    def fake_connect(database_url: str, **kwargs: Any) -> FakeConnection:
        connect_arguments.update({"database_url": database_url, **kwargs})
        return connection

    monkeypatch.setattr(repository, "get_settings", lambda: SimpleNamespace(DATABASE_URL="postgresql://test"))
    monkeypatch.setattr(repository, "connect", fake_connect)

    result = repository._fetch_from_relational_db(POI_ID)

    assert result.status == "found"
    assert result.payload is not None
    assert result.payload["fact_source"] == "POSTGRESQL_FALLBACK"
    assert result.payload["poi"]["source"] is None
    assert connect_arguments["options"] == "-c default_transaction_read_only=on"
    assert connect_arguments["connect_timeout"] == 3
    assert connection.closed
    assert connection.fake_cursor.query.lstrip().startswith("SELECT")
    assert connection.fake_cursor.parameters == (POI_ID,)


@pytest.mark.parametrize(
    "row",
    [
        None,
        (POI_ID, "Inactive POI", False, False, None, None, None, None, None),
    ],
)
def test_postgres_authoritatively_confirms_missing_or_inactive(
    monkeypatch: pytest.MonkeyPatch,
    row: tuple[Any, ...] | None,
) -> None:
    monkeypatch.setattr(repository, "get_settings", lambda: SimpleNamespace(DATABASE_URL="postgresql://test"))
    monkeypatch.setattr(repository, "connect", lambda *_args, **_kwargs: FakeConnection(row))

    assert repository._fetch_from_relational_db(POI_ID).status == "not_found"


def test_postgres_unavailable_is_not_reported_as_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(repository, "get_settings", lambda: SimpleNamespace(DATABASE_URL="postgresql://test"))

    def fail_connect(*_args: object, **_kwargs: object) -> None:
        raise OSError("connection failure")

    monkeypatch.setattr(repository, "connect", fail_connect)

    assert repository._fetch_from_relational_db(POI_ID).status == "unavailable"


def test_neo4j_failure_uses_verified_postgres_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = repository._build_facts_payload(
        poi_id=POI_ID,
        name="Sample POI",
        is_local=False,
        btype=None,
        category_key="nature_landscape",
        cat_name="Nature",
        city_name="Da Nang",
        city_code="DANANG",
        fact_source="POSTGRESQL_FALLBACK",
    )
    monkeypatch.setattr(repository, "_fetch_from_relational_db", lambda _poi_id: repository._RelationalLookup("found", payload))

    def fail_driver() -> None:
        raise OSError("Neo4j unavailable")

    monkeypatch.setattr(repository, "get_driver", fail_driver)

    assert repository.fetch_poi_explanation_facts(POI_ID) == payload


def test_absence_is_404_only_after_postgres_confirmation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(repository, "_fetch_from_relational_db", lambda _poi_id: repository._RelationalLookup("not_found"))
    monkeypatch.setattr(repository, "get_driver", lambda: None)

    assert repository.fetch_poi_explanation_facts(POI_ID) is None


def test_unavailable_sources_raise_instead_of_claiming_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(repository, "_fetch_from_relational_db", lambda _poi_id: repository._RelationalLookup("unavailable"))
    monkeypatch.setattr(repository, "get_driver", lambda: None)
    monkeypatch.setattr(repository, "_fetch_from_csv_fallback", lambda _poi_id: None)

    with pytest.raises(repository.ExplanationRepositoryUnavailable):
        repository.fetch_poi_explanation_facts(POI_ID)


def test_csv_fallback_is_explicitly_labeled_and_not_authoritative_for_absence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = repository._build_facts_payload(
        poi_id=POI_ID,
        name="Sample POI",
        is_local=False,
        btype=None,
        category_key="nature_landscape",
        cat_name="Nature",
        city_name="Da Nang",
        city_code="DANANG",
        fact_source="CSV_FALLBACK",
    )
    monkeypatch.setattr(repository, "_fetch_from_relational_db", lambda _poi_id: repository._RelationalLookup("unavailable"))
    monkeypatch.setattr(repository, "get_driver", lambda: None)
    monkeypatch.setattr(repository, "_fetch_from_csv_fallback", lambda _poi_id: payload)

    assert repository.fetch_poi_explanation_facts(POI_ID) == payload
    assert payload["fact_source"] == "CSV_FALLBACK"


def test_query_does_not_read_unavailable_poi_source_property() -> None:
    query = repository.EXPLANATION_QUERY

    assert "source: p.source" not in query
    assert "local_business_type: p.local_business_type" in query
