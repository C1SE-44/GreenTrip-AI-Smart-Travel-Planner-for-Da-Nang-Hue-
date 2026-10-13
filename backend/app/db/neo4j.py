from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from neo4j import GraphDatabase
from neo4j.exceptions import Neo4jError

from app.config import get_settings

_driver: Any = None


def initialize_driver() -> Any:
    global _driver

    settings = get_settings()

    if not settings.neo4j_configured:
        return None

    if _driver is not None:
        return _driver

    _driver = GraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
        database=settings.NEO4J_DATABASE,
    )
    return _driver


def get_driver() -> Any:
    return initialize_driver()


def _sanitize_uri(uri: str) -> str:
    parsed = urlparse(uri)
    if parsed.hostname:
        return parsed.hostname
    return "configured"


def verify_neo4j_connection() -> dict[str, str]:
    settings = get_settings()
    driver = initialize_driver()

    if driver is None:
        return {"status": "not_configured"}

    try:
        with driver.session(database=settings.NEO4J_DATABASE) as session:
            result = session.run("RETURN 'GreenTrip AI Neo4j connected' AS message")
            row = result.single()
            if row is None:
                raise RuntimeError("Neo4j query returned no result.")

        return {
            "status": "connected",
            "database": settings.NEO4J_DATABASE,
            "uri": _sanitize_uri(settings.NEO4J_URI),
        }
    except (Neo4jError, ValueError, RuntimeError) as exc:
        raise RuntimeError("Neo4j connection failed. Check Aura credentials and connectivity.") from exc


def close_driver() -> None:
    global _driver

    if _driver is not None:
        _driver.close()
        _driver = None
