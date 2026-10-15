from pathlib import Path
from typing import Any

from neo4j import READ_ACCESS

from app.config import get_settings
from app.db.neo4j import get_driver


QUERY_PATH = (
    Path(__file__).resolve().parents[2]
    / "neo4j"
    / "queries"
    / "get_poi_explanation_facts.cypher"
)
EXPLANATION_QUERY = QUERY_PATH.read_text(encoding="utf-8")


def fetch_poi_explanation_facts(poi_id: str) -> dict[str, Any] | None:
    driver = get_driver()
    if driver is None:
        raise RuntimeError("Neo4j is not configured.")

    settings = get_settings()
    with driver.session(
        database=settings.NEO4J_DATABASE,
        default_access_mode=READ_ACCESS,
    ) as session:
        record = session.run(EXPLANATION_QUERY, poi_id=poi_id).single()

    if record is None:
        return None

    return {
        "poi": dict(record["poi"]),
        "facts": [dict(fact) for fact in record["facts"]],
    }
