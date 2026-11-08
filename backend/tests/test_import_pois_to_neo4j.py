import sys
from pathlib import Path
from uuid import UUID

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts import import_pois_to_neo4j as importer
from scripts.import_pois_to_neo4j import (
    IMPORT_QUERY,
    SourcePOI,
    _write_batch,
    normalize_activities,
    normalize_boolean,
    normalize_category,
    prepare_import,
    read_schema_statements,
    transform_poi,
)


def source_poi(**overrides: object) -> SourcePOI:
    values: dict[str, object] = {
        "id": "46aa7aee-c255-4f1b-9cc2-5aaf72575a65",
        "name": "Đại Nội Huế",
        "category_name": "Di tích lịch sử và văn hóa",
        "location_key": "HUE",
        "location_name": "Hue",
        "is_local_business": False,
        "local_business_type": None,
        "activities": (),
    }
    values.update(overrides)
    return SourcePOI(**values)


def test_poi_uuid_mapping_is_preserved() -> None:
    poi_id = UUID("46aa7aee-c255-4f1b-9cc2-5aaf72575a65")

    transformed = transform_poi(source_poi(id=poi_id))

    assert transformed is not None
    assert transformed.id == str(poi_id)


@pytest.mark.parametrize(
    ("value", "expected_key"),
    [
        ("  Di tích lịch sử và văn hóa ", "historical_culture"),
        ("CẢNH QUAN VÀ THIÊN NHIÊN", "nature_landscape"),
        (None, None),
        ("unknown", None),
    ],
)
def test_category_normalization(value: object, expected_key: str | None) -> None:
    category = normalize_category(value)

    assert (category.key if category else None) == expected_key


def test_repeated_category_values_reuse_one_semantic_key() -> None:
    plan = prepare_import(
        [
            source_poi(id="first"),
            source_poi(id="second", name="Bảo tàng mẫu"),
        ]
    )

    assert plan.category_count == 1
    assert {record.category.key for record in plan.records if record.category} == {
        "historical_culture"
    }


def test_missing_category_is_safe() -> None:
    transformed = transform_poi(source_poi(category_name=None))

    assert transformed is not None
    assert transformed.category is None


def test_missing_name_is_preserved_as_optional_payload_value() -> None:
    transformed = transform_poi(source_poi(name=None))

    assert transformed is not None
    assert transformed.name is None
    assert "WHEN row.name IS NULL THEN []" in IMPORT_QUERY


def test_activity_normalization_deduplicates_and_ignores_unknown_values() -> None:
    activities = normalize_activities(
        ["Cultural Sightseeing", " cultural_sightseeing ", "unknown", None]
    )

    assert [(activity.key, activity.name) for activity in activities] == [
        ("cultural_sightseeing", "Cultural sightseeing")
    ]


@pytest.mark.parametrize(
    ("value", "expected"),
    [(True, True), (False, False), (" true ", True), ("False", False), (None, False)],
)
def test_local_business_boolean_normalization(value: object, expected: bool) -> None:
    assert normalize_boolean(value) is expected


def test_missing_location_is_safe() -> None:
    transformed = transform_poi(source_poi(location_key=None, location_name=None))

    assert transformed is not None
    assert transformed.location is None


@pytest.mark.parametrize("invalid_id", [None, "", "   "])
def test_poi_without_stable_id_is_skipped(invalid_id: object) -> None:
    plan = prepare_import([source_poi(id=invalid_id)])

    assert plan.records == ()
    assert plan.skipped_count == 1


def test_generated_payload_matches_approved_graph_model() -> None:
    transformed = transform_poi(
        source_poi(
            activities=["cultural_sightseeing", "photography"],
            is_local_business=True,
            local_business_type="museum",
        )
    )

    assert transformed is not None
    assert transformed.as_params() == {
        "id": "46aa7aee-c255-4f1b-9cc2-5aaf72575a65",
        "name": "Đại Nội Huế",
        "category": {
            "key": "historical_culture",
            "name": "Di tích lịch sử và văn hóa",
        },
        "activities": [
            {"key": "cultural_sightseeing", "name": "Cultural sightseeing"},
            {"key": "photography", "name": "Photography"},
        ],
        "location": {"key": "HUE", "name": "Hue"},
        "is_local_business": True,
        "local_business_type": "museum",
    }


class FakeResult:
    def consume(self) -> None:
        return None


class FakeTransaction:
    def __init__(self) -> None:
        self.query = ""
        self.parameters: dict[str, object] = {}

    def run(self, query: str, **parameters: object) -> FakeResult:
        self.query = query
        self.parameters = parameters
        return FakeResult()


def test_write_boundary_uses_parameterized_merge_cypher() -> None:
    transaction = FakeTransaction()
    rows = [{"id": "poi-1"}]

    written = _write_batch(transaction, rows)

    assert written == 1
    assert transaction.parameters == {"rows": rows}
    assert "UNWIND $rows AS row" in transaction.query
    assert "MERGE (p:POI" in transaction.query
    assert "MERGE (c:Category" in transaction.query
    assert "MERGE (a:Activity" in transaction.query
    assert "MERGE (l:Location" in transaction.query
    assert "CREATE " not in transaction.query.upper()


def test_import_query_has_only_approved_relationships() -> None:
    assert "[:IN_CATEGORY]" in IMPORT_QUERY
    assert "[:OFFERS_ACTIVITY]" in IMPORT_QUERY
    assert "[:LOCATED_IN]" in IMPORT_QUERY
    assert "DELETE" not in IMPORT_QUERY.upper()
    assert "DROP" not in IMPORT_QUERY.upper()


def test_schema_loader_reuses_safe_existing_schema(tmp_path: Path) -> None:
    schema = tmp_path / "schema.cypher"
    schema.write_text(
        "// comment\n"
        "CREATE CONSTRAINT sample IF NOT EXISTS\n"
        "FOR (p:POI) REQUIRE p.id IS UNIQUE;\n",
        encoding="utf-8",
    )

    assert read_schema_statements(schema) == [
        "CREATE CONSTRAINT sample IF NOT EXISTS\n"
        "FOR (p:POI) REQUIRE p.id IS UNIQUE"
    ]


def test_schema_loader_rejects_destructive_statements(tmp_path: Path) -> None:
    schema = tmp_path / "schema.cypher"
    schema.write_text("DROP CONSTRAINT example;", encoding="utf-8")

    with pytest.raises(RuntimeError, match="destructive"):
        read_schema_statements(schema)


def test_connectivity_failure_returns_safe_nonzero_exit(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    class BrokenDriver:
        def verify_connectivity(self) -> None:
            raise RuntimeError("sensitive connection details")

    monkeypatch.setattr(importer, "load_source_pois", lambda _limit: [source_poi()])
    monkeypatch.setattr(importer, "get_driver", lambda: BrokenDriver())
    monkeypatch.setattr(importer, "close_driver", lambda: None)

    exit_code = importer.main([])
    captured = capsys.readouterr()

    assert exit_code == 1
    assert "Neo4j import failed" in captured.err
    assert "sensitive connection details" not in captured.err
