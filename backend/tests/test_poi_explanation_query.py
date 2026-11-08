import re
from pathlib import Path


QUERY_PATH = (
    Path(__file__).resolve().parents[1]
    / "neo4j"
    / "queries"
    / "get_poi_explanation_facts.cypher"
)
QUERY = QUERY_PATH.read_text(encoding="utf-8")
NORMALIZED_QUERY = " ".join(QUERY.split())


def test_query_starts_with_parameterized_stable_poi_lookup() -> None:
    assert NORMALIZED_QUERY.startswith("MATCH (p:POI {id: $poi_id})")
    assert QUERY.count("$poi_id") == 1


def test_query_is_read_only() -> None:
    forbidden_operations = (
        "CREATE",
        "MERGE",
        "SET",
        "DELETE",
        "REMOVE",
        "DROP",
        "LOAD CSV",
    )

    for operation in forbidden_operations:
        pattern = re.escape(operation).replace(r"\ ", r"\s+")
        assert re.search(rf"\b{pattern}\b", QUERY, re.I) is None


def test_query_uses_only_approved_direct_relationships() -> None:
    assert "[r:IN_CATEGORY|OFFERS_ACTIVITY|LOCATED_IN]" in QUERY
    assert "OPTIONAL MATCH (p)-[r:" in QUERY
    assert "*" not in QUERY
    assert "apoc." not in QUERY.lower()


def test_query_maps_each_semantic_target_type() -> None:
    expected_mappings = {
        "WHEN 'IN_CATEGORY' THEN 'Category'",
        "WHEN 'OFFERS_ACTIVITY' THEN 'Activity'",
        "WHEN 'LOCATED_IN' THEN 'Location'",
    }

    assert all(mapping in QUERY for mapping in expected_mappings)
    assert "target_key: target.key" in QUERY
    assert "target_name: target.name" in QUERY


def test_query_returns_local_business_and_provenance_properties() -> None:
    assert "is_local_business: p.is_local_business" in QUERY
    assert "local_business_type: p.local_business_type" in QUERY
    assert "source: p.source" in QUERY


def test_query_deduplicates_and_orders_facts() -> None:
    assert "collect(DISTINCT CASE" in QUERY
    assert "ORDER BY type(r), target.key, target.name" in QUERY


def test_query_handles_missing_optional_facts_without_placeholder_entries() -> None:
    assert "OPTIONAL MATCH" in QUERY
    assert "WHEN r IS NULL THEN null" in QUERY
    assert "[fact IN raw_facts WHERE fact IS NOT NULL] AS facts" in QUERY


def test_missing_poi_contract_is_no_rows() -> None:
    assert NORMALIZED_QUERY.startswith("MATCH (p:POI {id: $poi_id})")
    assert not NORMALIZED_QUERY.startswith("OPTIONAL MATCH (p:POI")


def test_query_exposes_no_internal_ids_credentials_or_explanation_prose() -> None:
    lowered = QUERY.lower()
    forbidden_fragments = (
        "elementid(",
        "id(p)",
        "neo4j_uri",
        "neo4j_password",
        "bolt://",
        "neo4j+s://",
        "recommended because",
    )

    assert all(fragment not in lowered for fragment in forbidden_fragments)
