from types import SimpleNamespace
from typing import Any

from app.db import postgres


class _RecordingCursor:
    def __init__(self, calls: list[str]) -> None:
        self.calls = calls

    def __enter__(self) -> "_RecordingCursor":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, query: str, *_args: Any) -> None:
        self.calls.append(query)


class _RecordingConnection:
    def __init__(self) -> None:
        self.executed_queries: list[str] = []
        self.commit_calls = 0
        self.rollback_calls = 0

    def cursor(self) -> _RecordingCursor:
        return _RecordingCursor(self.executed_queries)

    def commit(self) -> None:
        self.commit_calls += 1

    def rollback(self) -> None:
        self.rollback_calls += 1


def test_get_connection_only_opens_and_returns_postgres_connection(monkeypatch: Any) -> None:
    connection = _RecordingConnection()
    connect_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []

    def fake_connect(*args: object, **kwargs: object) -> _RecordingConnection:
        connect_calls.append((args, kwargs))
        return connection

    monkeypatch.setattr(postgres, "get_settings", lambda: SimpleNamespace(DATABASE_URL="postgresql://test"))
    monkeypatch.setattr(postgres, "connect", fake_connect)
    monkeypatch.setattr(postgres, "_POSTGRES_RETRY_AFTER", 0.0)

    result = postgres.get_connection()

    assert result is connection
    assert connect_calls == [(("postgresql://test",), {"connect_timeout": 3})]
    assert connection.executed_queries == []
    assert connection.commit_calls == 0
    assert connection.rollback_calls == 0
