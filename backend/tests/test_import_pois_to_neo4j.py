import sys
import re
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts import import_pois_to_neo4j as importer
from scripts.import_pois_to_neo4j import (
    MANAGED_BY,
    POI_UPSERT_QUERY,
    RECONCILE_MANAGED_RELATIONSHIPS_QUERY,
    SourcePOI,
    LegacyPOINodeConflict,
    LegacySemanticNodeConflict,
    LegacyRelationshipConflict,
    _write_batch,
    expected_relationships,
    import_batches,
    normalize_activities,
    normalize_category,
    prepare_import,
    preflight_legacy_relationships,
    preflight_legacy_poi_nodes,
    read_schema_statements,
    transform_poi,
)


def source_poi(**overrides: object) -> SourcePOI:
    values: dict[str, object] = {
        "id": "46aa7aee-c255-4f1b-9cc2-5aaf72575a65",
        "name": "Đại Nội Huế",
        "category_name": "Di tích lịch sử và văn hóa",
        "location_key": "HUE",
        "location_name": "Huế",
        "is_local_business": False,
        "local_business_type": None,
        "is_active": True,
        "updated_at": datetime(2026, 1, 2, tzinfo=timezone.utc),
        "sub_category": None,
        "vibes": (),
        "ai_metadata": {},
    }
    values.update(overrides)
    return SourcePOI(**values)


@pytest.mark.parametrize(
    ("value", "expected_key"),
    [
        ("Ẩm thực và quán ăn", "food_dining"),
        ("Quán cafe giải khát", "cafe_refreshment"),
        ("Di tích lịch sử và văn hóa", "historical_culture"),
        ("Cảnh quan và thiên nhiên", "nature_landscape"),
        ("Lưu trú và nghỉ dưỡng", "lodging_stay"),
        ("Tâm linh & Tôn giáo", "spiritual_religion"),
        ("Tâm linh và chùa thiền", "spiritual_religion"),
        (None, None),
        ("unknown category", None),
    ],
)
def test_all_six_current_categories_map_to_controlled_keys(
    value: object, expected_key: str | None
) -> None:
    category = normalize_category(value)
    assert (category.key if category else None) == expected_key


def test_poi_uuid_mapping_and_timestamp_are_preserved() -> None:
    poi_id = UUID("46aa7aee-c255-4f1b-9cc2-5aaf72575a65")

    transformed = transform_poi(source_poi(id=poi_id))

    assert transformed is not None
    assert transformed.id == str(poi_id)
    assert transformed.source_updated_at == "2026-01-02T00:00:00+00:00"


def test_evidenced_activity_values_map_and_deduplicate() -> None:
    plan = prepare_import(
        [
            source_poi(
                sub_category="coastal_seafood",
                vibes=["culinary", "gần biển", "yên bình"],
                ai_metadata={
                    "dna_tags": ["swimming", "swimming", "made_up_tag"],
                    "activity_tags": ["photography"],
                    "experience_tags": ["nature exploration"],
                },
            )
        ]
    )

    record = plan.records[0]
    assert {activity.key for activity in record.activities} == {
        "food_experience",
        "water_recreation",
        "photography",
        "nature_exploration",
    }
    assert plan.unmapped_activities["vibes:gan_bien"] == 1
    assert plan.unmapped_activities["vibes:yen_binh"] == 1
    assert plan.unmapped_activities["dna_tags:made_up_tag"] == 1


@pytest.mark.parametrize(
    ("category_name", "sub_category", "expected_activity"),
    [
        ("Di tích lịch sử và văn hóa", "heritage", "cultural_sightseeing"),
        ("Di tích lịch sử và văn hóa", "museum", "cultural_sightseeing"),
        ("Di tích lịch sử và văn hóa", "market", None),
        ("Tâm linh & Tôn giáo", "pagoda", "spiritual_visit"),
    ],
)
def test_broad_nature_vibes_do_not_map_outside_nature_category(
    category_name: str,
    sub_category: str,
    expected_activity: str | None,
) -> None:
    record = transform_poi(
        source_poi(
            category_name=category_name,
            sub_category=sub_category,
            vibes=["ecotourism", "nature_explore"],
        )
    )

    assert record is not None
    activity_keys = {activity.key for activity in record.activities}
    assert "nature_exploration" not in activity_keys
    if expected_activity:
        assert expected_activity in activity_keys


def test_da_noi_projection_uses_heritage_evidence_without_nature_vibes() -> None:
    poi_id = "084a4f33-2af6-44cf-83ad-88ceaaac1092"
    record = transform_poi(
        source_poi(
            id=poi_id,
            name="Đại Nội Huế (Hoàng Thành & Tử Cấm Thành)",
            category_name="Di tích lịch sử và văn hóa",
            location_key="HUE",
            location_name="Huế",
            sub_category="heritage",
            vibes=["sightseeing", "ecotourism", "heritage", "nature_explore"],
            ai_metadata={
                "dna_tags": ["unesco_world_heritage", "dynasty_history"],
            },
        )
    )

    assert record is not None
    assert record.id == poi_id
    assert record.category is not None and record.category.key == "historical_culture"
    assert record.location is not None and record.location.key == "HUE"
    assert {activity.key for activity in record.activities} == {"cultural_sightseeing"}


@pytest.mark.parametrize(
    ("sub_category", "expected_activity"),
    [
        ("beach_coastline", "nature_exploration"),
        ("waterfall", "nature_exploration"),
        ("forest", "nature_exploration"),
    ],
)
def test_specific_nature_subcategories_keep_supported_activity(
    sub_category: str,
    expected_activity: str,
) -> None:
    record = transform_poi(
        source_poi(
            category_name="Cảnh quan và thiên nhiên",
            sub_category=sub_category,
            vibes=["ecotourism", "nature_explore"],
        )
    )

    assert record is not None
    assert expected_activity in {activity.key for activity in record.activities}


def test_activity_mapping_is_deterministic_and_idempotent() -> None:
    source = source_poi(
        category_name="Cảnh quan và thiên nhiên",
        sub_category="beach_coastline",
        vibes=["ecotourism", "nature_explore", "swimming", "swimming"],
    )

    first = transform_poi(source)
    second = transform_poi(source)
    first_plan = prepare_import([source])
    second_plan = prepare_import([source])

    assert first == second
    assert first_plan == second_plan
    assert first is not None
    activity_keys = [activity.key for activity in first.activities]
    assert activity_keys == ["nature_exploration", "water_recreation"]


def test_no_activity_or_invalid_values_create_no_activity_facts() -> None:
    activities = normalize_activities(
        "hotel", ["nghỉ dưỡng", "near the beach"], {"not": "a tag list"}, {"dna_tags": []}
    )
    assert activities == ()

    plan = prepare_import(
        [source_poi(sub_category="unmapped_value", vibes=None, ai_metadata={"dna_tags": [None, 7]})]
    )
    assert plan.records[0].activities == ()
    assert plan.unmapped_activities["sub_category:unmapped_value"] == 1


def test_dry_run_plan_counts_only_active_semantic_nodes_and_relationships() -> None:
    plan = prepare_import(
        [
            source_poi(sub_category="beach_coastline"),
            source_poi(
                id="inactive-poi",
                is_active=False,
                location_key="DANANG",
                location_name="Da Nang",
                sub_category="swimming",
            ),
        ]
    )

    assert plan.planned_node_counts_by_label == {
        "POI": 2,
        "Category": 1,
        "Activity": 1,
        "Location": 1,
    }
    assert plan.planned_relationship_counts_by_type == {
        "IN_CATEGORY": 1,
        "OFFERS_ACTIVITY": 1,
        "LOCATED_IN": 1,
    }


def test_activity_metadata_accepts_only_explicit_whitelisted_keys() -> None:
    valid = normalize_activities(
        None,
        None,
        None,
        {"activity_tags": ["cultural_sightseeing", "not_an_activity"]},
    )
    assert [activity.key for activity in valid] == ["cultural_sightseeing"]


def test_unmapped_categories_and_activity_values_are_reported() -> None:
    plan = prepare_import(
        [source_poi(category_name="A new category", sub_category="unknown_activity")]
    )
    assert plan.unmapped_categories == {"A new category": 1}
    assert plan.unmapped_activities == {"sub_category:unknown_activity": 1}


def test_inactive_poi_is_retained_but_has_no_expected_relationships() -> None:
    record = transform_poi(
        source_poi(is_active=False, ai_metadata={"activity_tags": ["food_experience"]})
    )
    assert record is not None
    assert record.is_active is False
    assert expected_relationships(record) == set()


@pytest.mark.parametrize(
    ("active", "expected_relationship_count"),
    [(False, 0), (True, 3)],
)
def test_active_state_transitions_set_current_relationship_projection(
    active: bool,
    expected_relationship_count: int,
) -> None:
    record = transform_poi(source_poi(is_active=active, sub_category="beach_coastline"))

    assert record is not None
    payload = importer._relationship_params(record, "sync-transition", set())

    assert payload["is_active"] is active
    assert len(payload["expected_relationships"]) == expected_relationship_count
    assert len(expected_relationships(record)) == expected_relationship_count
    assert "p.is_active = row.is_active" in POI_UPSERT_QUERY
    assert "p.sync_status = CASE WHEN row.is_active" in POI_UPSERT_QUERY


def test_category_activity_and_location_changes_project_new_managed_facts() -> None:
    nature_category = next(
        label for label, (key, _name) in importer.CATEGORY_KEYS.items()
        if key == "nature_landscape"
    )
    culture_category = next(
        label for label, (key, _name) in importer.CATEGORY_KEYS.items()
        if key == "historical_culture"
    )
    old_record = transform_poi(
        source_poi(
            category_name=nature_category,
            location_key="DANANG",
            sub_category="beach_coastline",
            vibes=["swimming"],
        )
    )
    new_record = transform_poi(
        source_poi(
            category_name=culture_category,
            location_key="HUE",
            sub_category="museum",
            vibes=["museum"],
        )
    )

    assert old_record is not None and new_record is not None
    old_facts = expected_relationships(old_record)
    new_payload = importer._relationship_params(new_record, "sync-updated", set())
    new_facts = expected_relationships(new_record)

    assert old_facts != new_facts
    assert new_record.category is not None and new_record.category.key == "historical_culture"
    assert new_record.location is not None and new_record.location.key == "HUE"
    assert {activity.key for activity in new_record.activities} == {"cultural_sightseeing"}
    assert {
        (fact["type"], fact["target_key"])
        for fact in new_payload["expected_relationships"]
    } == new_facts
    assert "r.managed_by = $managed_by" in RECONCILE_MANAGED_RELATIONSHIPS_QUERY
    assert "NOT any(expected IN row.expected_relationships" in RECONCILE_MANAGED_RELATIONSHIPS_QUERY


def test_physically_missing_source_pois_are_marked_inactive_without_deletion() -> None:
    query = importer.MARK_MISSING_MANAGED_POIS_INACTIVE_QUERY

    assert "p.managed_by = $managed_by" in query
    assert "p.sync_status = 'missing_from_source'" in query
    assert "DELETE" not in query.upper()
    assert "DETACH" not in query.upper()


def test_pb10_graph_reads_exclude_inactive_and_preserve_legacy_nodes() -> None:
    neo4j_dir = BACKEND_DIR / "neo4j"
    explanation_query = (neo4j_dir / "queries" / "get_poi_explanation_facts.cypher").read_text(
        encoding="utf-8"
    )
    local_query = (neo4j_dir / "queries" / "get_local_authentic_pois.cypher").read_text(
        encoding="utf-8"
    )
    explanation_fallback = (BACKEND_DIR / "app" / "pois" / "explanation_repository.py").read_text(
        encoding="utf-8"
    )

    assert "p.is_active IS NULL OR p.is_active = true" in explanation_query
    assert "COALESCE(p.is_active, true) = true" in local_query
    assert "if is_active is False:" in explanation_fallback


def test_write_query_marks_only_new_importer_relationships() -> None:
    assert "MERGE (p:POI {id: row.id, managed_by: $managed_by})" in POI_UPSERT_QUERY
    assert "MERGE (c:Category {key: category.key, managed_by: $managed_by})" in importer.UPSERT_CATEGORY_RELATIONSHIPS_QUERY
    assert "MERGE (a:Activity {key: activity.key, managed_by: $managed_by})" in importer.UPSERT_ACTIVITY_RELATIONSHIPS_QUERY
    assert "MERGE (l:Location {key: location.key, managed_by: $managed_by})" in importer.UPSERT_LOCATION_RELATIONSHIPS_QUERY
    assert "WHERE p.managed_by = $managed_by" in importer.UPSERT_CATEGORY_RELATIONSHIPS_QUERY
    assert "[:IN_CATEGORY {managed_by: $managed_by}]" in importer.UPSERT_CATEGORY_RELATIONSHIPS_QUERY
    assert "[:OFFERS_ACTIVITY {managed_by: $managed_by}]" in importer.UPSERT_ACTIVITY_RELATIONSHIPS_QUERY
    assert "[:LOCATED_IN {managed_by: $managed_by}]" in importer.UPSERT_LOCATION_RELATIONSHIPS_QUERY
    assert "r.managed_by = $managed_by" in RECONCILE_MANAGED_RELATIONSHIPS_QUERY
    assert "DELETE r" in RECONCILE_MANAGED_RELATIONSHIPS_QUERY
    assert "DETACH DELETE" not in RECONCILE_MANAGED_RELATIONSHIPS_QUERY.upper()


class FakeResult:
    def __init__(self, rows: list[dict[str, object]] | None = None) -> None:
        self.rows = rows or []

    def consume(self) -> None:
        return None

    def single(self) -> dict[str, object] | None:
        return self.rows[0] if self.rows else None

    def __iter__(self):
        return iter(self.rows)


class FakeTransaction:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, object]]] = []

    def run(self, query: str, **parameters: object) -> FakeResult:
        self.calls.append((query, parameters))
        if query == importer.READ_SYNC_LEASE_QUERY:
            return FakeResult([{"key": importer.SYNC_STATE_KEY}])
        if query in {
            importer.READ_EXISTING_POI_OWNERSHIP_QUERY,
            importer.READ_EXISTING_RELATIONSHIPS_QUERY,
        }:
            return FakeResult()
        if query == importer.RENEW_LEASE_QUERY:
            return FakeResult([{"key": importer.SYNC_STATE_KEY}])
        if query == importer.POI_UPSERT_QUERY:
            return FakeResult([{"id": row["id"]} for row in parameters["rows"]])
        if query == importer.MARK_MISSING_MANAGED_POIS_INACTIVE_QUERY:
            return FakeResult([{"marked_inactive": 0}])
        if query == importer.COMPLETE_SYNC_QUERY:
            return FakeResult([{"key": importer.SYNC_STATE_KEY}])
        return FakeResult()


def test_write_batch_uses_parameterized_idempotent_upserts() -> None:
    transaction = FakeTransaction()
    rows = [
        {
            "id": "poi-1",
            "is_active": True,
            "category": None,
            "activities": [],
            "location": None,
            "expected_relationships": [],
        }
    ]

    written = _write_batch(transaction, rows, "lease-1")
    repeated = _write_batch(transaction, rows, "lease-1")

    assert written == 1
    assert repeated == 1
    queries = [query for query, _parameters in transaction.calls]
    expected_batch_order = [
        importer.READ_EXISTING_POI_OWNERSHIP_QUERY,
        importer.READ_EXISTING_RELATIONSHIPS_QUERY,
        importer.READ_SYNC_LEASE_QUERY,
        importer.RENEW_LEASE_QUERY,
        POI_UPSERT_QUERY,
        RECONCILE_MANAGED_RELATIONSHIPS_QUERY,
        importer.UPSERT_CATEGORY_RELATIONSHIPS_QUERY,
        importer.UPSERT_ACTIVITY_RELATIONSHIPS_QUERY,
        importer.UPSERT_LOCATION_RELATIONSHIPS_QUERY,
    ]
    assert queries == expected_batch_order * 2
    assert transaction.calls[4][1]["rows"] == rows
    assert transaction.calls[4][1]["managed_by"] == MANAGED_BY
    assert transaction.calls[13][1]["rows"] == rows
    assert all(
        "MERGE " in query
        for query, _parameters in transaction.calls
        if query
        not in {
            importer.READ_EXISTING_POI_OWNERSHIP_QUERY,
            importer.READ_EXISTING_RELATIONSHIPS_QUERY,
            importer.READ_SYNC_LEASE_QUERY,
            RECONCILE_MANAGED_RELATIONSHIPS_QUERY,
            importer.RENEW_LEASE_QUERY,
        }
    )
    assert all("CREATE (" not in query.upper() for query, _parameters in transaction.calls)


def test_write_batch_rejects_new_legacy_node_before_any_write() -> None:
    class LegacyNodeTransaction(FakeTransaction):
        def run(self, query: str, **parameters: object) -> FakeResult:
            if query == importer.READ_EXISTING_POI_OWNERSHIP_QUERY:
                self.calls.append((query, parameters))
                return FakeResult([{"poi_id": "poi-1", "managed_by": None}])
            return super().run(query, **parameters)

    transaction = LegacyNodeTransaction()
    row = {
        "id": "poi-1",
        "is_active": True,
        "category": None,
        "activities": [],
        "location": None,
        "expected_relationships": [],
    }

    with pytest.raises(LegacyPOINodeConflict):
        _write_batch(transaction, [row], "lease-1")

    assert [query for query, _parameters in transaction.calls] == [
        importer.READ_EXISTING_POI_OWNERSHIP_QUERY
    ]


def test_write_batch_rejects_legacy_semantic_node_before_any_write() -> None:
    class LegacyCategoryTransaction(FakeTransaction):
        def run(self, query: str, **parameters: object) -> FakeResult:
            if query == importer.READ_EXISTING_CATEGORY_OWNERSHIP_QUERY:
                self.calls.append((query, parameters))
                return FakeResult([{"key": "food_dining", "managed_by": None}])
            return super().run(query, **parameters)

    transaction = LegacyCategoryTransaction()
    row = {
        "id": "poi-1",
        "is_active": True,
        "category": {"key": "food_dining", "name": "Food"},
        "activities": [],
        "location": None,
        "expected_relationships": [
            {"type": "IN_CATEGORY", "target_key": "food_dining"}
        ],
    }

    with pytest.raises(LegacySemanticNodeConflict):
        _write_batch(transaction, [row], "lease-1")

    assert [query for query, _parameters in transaction.calls] == [
        importer.READ_EXISTING_POI_OWNERSHIP_QUERY,
        importer.READ_EXISTING_CATEGORY_OWNERSHIP_QUERY,
    ]


def test_write_batch_rechecks_relationships_before_lease_renewal() -> None:
    class ChangedLegacyRelationshipTransaction(FakeTransaction):
        def run(self, query: str, **parameters: object) -> FakeResult:
            if query == importer.READ_EXISTING_RELATIONSHIPS_QUERY:
                self.calls.append((query, parameters))
                return FakeResult(
                    [
                        {
                            "poi_id": "poi-1",
                            "relationship_type": "IN_CATEGORY",
                            "managed_by": None,
                            "target_key": "food_dining",
                            "target_labels": ["Category"],
                        }
                    ]
                )
            return super().run(query, **parameters)

    transaction = ChangedLegacyRelationshipTransaction()
    row = {
        "id": "poi-1",
        "is_active": True,
        "category": {"key": "food_dining", "name": "Food"},
        "activities": [],
        "location": None,
        "unmanaged_exact_relationships": [],
        "expected_relationships": [
            {"type": "IN_CATEGORY", "target_key": "food_dining"}
        ],
    }

    with pytest.raises(LegacyRelationshipConflict):
        _write_batch(transaction, [row], "lease-1")

    assert [query for query, _parameters in transaction.calls] == [
        importer.READ_EXISTING_POI_OWNERSHIP_QUERY,
        importer.READ_EXISTING_CATEGORY_OWNERSHIP_QUERY,
        importer.READ_EXISTING_RELATIONSHIPS_QUERY,
    ]


class FakeReadSession:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def execute_read(self, callback, *args):
        return callback(self, *args)

    def run(self, _query: str, **_parameters: object) -> FakeResult:
        return FakeResult(self.rows)


def test_preflight_rejects_unmanaged_poi_nodes_without_adopting_them() -> None:
    record = transform_poi(source_poi())
    assert record is not None

    class OwnerSession:
        def __init__(self, managed_by: str | None) -> None:
            self.managed_by = managed_by
            self.queries: list[str] = []

        def execute_read(self, callback, *args):
            return callback(self, *args)

        def run(self, query: str, **_parameters: object) -> FakeResult:
            self.queries.append(query)
            return FakeResult([{"poi_id": record.id, "managed_by": self.managed_by}])

    unmanaged_session = OwnerSession(None)
    with pytest.raises(LegacyPOINodeConflict, match="unmanaged POI node"):
        preflight_legacy_poi_nodes(unmanaged_session, [record])
    assert unmanaged_session.queries == [importer.READ_EXISTING_POI_OWNERSHIP_QUERY]

    managed_session = OwnerSession(MANAGED_BY)
    assert preflight_legacy_poi_nodes(managed_session, [record]) is None


def test_preflight_rejects_unmanaged_category_activity_and_location_nodes() -> None:
    record = transform_poi(source_poi(sub_category="beach_coastline"))
    assert record is not None

    class SemanticOwnerSession:
        def execute_read(self, callback, *args):
            return callback(self, *args)

        def run(self, query: str, **_parameters: object) -> FakeResult:
            if query == importer.READ_EXISTING_ACTIVITY_OWNERSHIP_QUERY:
                return FakeResult([{"key": "nature_exploration", "managed_by": None}])
            return FakeResult()

    with pytest.raises(LegacySemanticNodeConflict):
        importer.preflight_legacy_semantic_nodes(SemanticOwnerSession(), [record], {})


def test_matching_unmanaged_legacy_fact_is_preserved_without_duplicate() -> None:
    record = transform_poi(source_poi())
    assert record is not None
    session = FakeReadSession(
        [
            {
                "poi_id": record.id,
                "relationship_type": "IN_CATEGORY",
                "managed_by": None,
                "target_key": "historical_culture",
                "target_labels": ["Category"],
            }
        ]
    )

    unmanaged = preflight_legacy_relationships(session, [record])
    payload = importer._relationship_params(record, "sync-1", unmanaged[record.id])

    assert unmanaged[record.id] == {("IN_CATEGORY", "historical_culture")}
    assert payload["category"] is None
    assert payload["expected_relationships"] == [
        {"type": "IN_CATEGORY", "target_key": "historical_culture"},
        {"type": "LOCATED_IN", "target_key": "HUE"},
    ]


def test_conflicting_unmanaged_relationship_aborts_preflight() -> None:
    record = transform_poi(source_poi())
    assert record is not None
    session = FakeReadSession(
        [
            {
                "poi_id": record.id,
                "relationship_type": "IN_CATEGORY",
                "managed_by": None,
                "target_key": "food_dining",
                "target_labels": ["Category"],
            }
        ]
    )

    with pytest.raises(LegacyRelationshipConflict, match="unmanaged graph relationship"):
        preflight_legacy_relationships(session, [record])


def test_legacy_relationship_with_wrong_target_label_is_a_conflict() -> None:
    record = transform_poi(source_poi())
    assert record is not None
    session = FakeReadSession(
        [
            {
                "poi_id": record.id,
                "relationship_type": "IN_CATEGORY",
                "managed_by": None,
                "target_key": "historical_culture",
                "target_labels": ["Activity"],
            }
        ]
    )
    with pytest.raises(LegacyRelationshipConflict):
        preflight_legacy_relationships(session, [record])


def test_prior_importer_relationship_is_reconciled_without_legacy_adoption() -> None:
    record = transform_poi(source_poi(category_name="Ẩm thực và quán ăn"))
    assert record is not None
    old_managed_edge = {
        "poi_id": record.id,
        "relationship_type": "IN_CATEGORY",
        "managed_by": MANAGED_BY,
        "target_key": "historical_culture",
        "target_labels": ["Category"],
    }
    session = FakeReadSession([old_managed_edge])

    unmanaged = preflight_legacy_relationships(session, [record])
    params = importer._relationship_params(record, "sync-3", unmanaged.get(record.id, set()))

    assert unmanaged == {}
    assert params["category"] == {"key": "food_dining", "name": "Ẩm thực và quán ăn"}
    assert params["expected_relationships"] == [
        {"type": "IN_CATEGORY", "target_key": "food_dining"},
        {"type": "LOCATED_IN", "target_key": "HUE"},
    ]
    assert "r.managed_by = $managed_by" in RECONCILE_MANAGED_RELATIONSHIPS_QUERY


def test_inactive_poi_legacy_relationship_is_not_reconciled_or_conflicted() -> None:
    record = transform_poi(source_poi(is_active=False))
    assert record is not None
    session = FakeReadSession(
        [
            {
                "poi_id": record.id,
                "relationship_type": "IN_CATEGORY",
                "managed_by": None,
                "target_key": "legacy_category",
                "target_labels": ["Category"],
            }
        ]
    )
    assert preflight_legacy_relationships(session, [record]) == {}
    payload = importer._relationship_params(record, "sync-2", set())
    assert payload["is_active"] is False
    assert payload["category"] is None
    assert payload["activities"] == []
    assert payload["location"] is None


def test_stale_reconciliation_does_not_touch_unmanaged_edges() -> None:
    assert "r.managed_by = $managed_by" in RECONCILE_MANAGED_RELATIONSHIPS_QUERY
    assert "WHERE row.is_active = true" in RECONCILE_MANAGED_RELATIONSHIPS_QUERY
    assert "DELETE r" in RECONCILE_MANAGED_RELATIONSHIPS_QUERY
    assert "DELETE target" not in RECONCILE_MANAGED_RELATIONSHIPS_QUERY
    assert "p.managed_by = $managed_by" in importer.MARK_MISSING_MANAGED_POIS_INACTIVE_QUERY
    assert "SET p.is_active = false" in importer.MARK_MISSING_MANAGED_POIS_INACTIVE_QUERY
    assert "DELETE" not in importer.MARK_MISSING_MANAGED_POIS_INACTIVE_QUERY.upper()


def test_failed_batch_propagates_and_is_not_counted_as_success() -> None:
    record = transform_poi(source_poi())
    assert record is not None

    class FailedSession:
        def execute_write(self, _callback, *_args):
            raise RuntimeError("batch failed")

    with pytest.raises(importer.BatchImportError, match="batch 1 failed") as error:
        import_batches(FailedSession(), [record], 1, "sync", "lease", {})
    assert error.value.completed_count == 0
    assert error.value.failed_count == 1
    assert error.value.batch_number == 1


def test_batch_preflight_conflict_is_reported_as_a_conflict() -> None:
    record = transform_poi(source_poi())
    assert record is not None

    class ConflictSession:
        def execute_write(self, _callback, *_args):
            raise LegacySemanticNodeConflict(["legacy category collision"])

    with pytest.raises(LegacySemanticNodeConflict, match="unmanaged semantic node"):
        import_batches(ConflictSession(), [record], 1, "sync", "lease", {})


def test_schema_loader_rejects_destructive_statements(tmp_path: Path) -> None:
    schema = tmp_path / "schema.cypher"
    schema.write_text("DROP CONSTRAINT example;", encoding="utf-8")
    with pytest.raises(RuntimeError, match="destructive"):
        read_schema_statements(schema)


def test_schema_declares_unique_sync_state_key() -> None:
    statements = read_schema_statements()
    assert any(
        "FOR (s:GraphSyncState) REQUIRE s.key IS UNIQUE" in " ".join(item.split())
        for item in statements
    )


def test_read_only_loader_sets_transaction_read_only_and_never_commits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeCursor:
        def __init__(self) -> None:
            self.query = ""
            self.params = ()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, query: str, params: tuple[object, ...]) -> None:
            self.query = query
            self.params = params

        def fetchall(self):
            return []

    class FakeConnection:
        def __init__(self) -> None:
            self.commands: list[str] = []
            self.cursor_value = FakeCursor()
            self.rolled_back = False
            self.closed = False

        def execute(self, command: str) -> None:
            self.commands.append(command)

        def cursor(self) -> FakeCursor:
            return self.cursor_value

        def rollback(self) -> None:
            self.rolled_back = True

        def close(self) -> None:
            self.closed = True

    connection = FakeConnection()
    monkeypatch.setattr(importer, "get_settings", lambda: SimpleNamespace(DATABASE_URL="read-only-test"))
    monkeypatch.setattr(importer.psycopg, "connect", lambda *_args, **_kwargs: connection)

    assert importer.load_source_pois(updated_after=("2026-01-01T00:00:00+00:00", "poi-0")) == []

    assert connection.commands == ["SET TRANSACTION READ ONLY"]
    assert "SELECT" in connection.cursor_value.query.upper()
    assert not re.search(
        r"\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|MERGE\s+INTO|COMMIT)\b",
        connection.cursor_value.query,
        flags=re.IGNORECASE,
    )
    assert connection.cursor_value.params[0] == "2026-01-01T00:00:00+00:00"
    assert "p.updated_at IS NULL OR p.updated_at >=" in connection.cursor_value.query
    assert "p.poi_id::text" not in connection.cursor_value.query.split("WHERE", 1)[1]
    assert connection.rolled_back is True
    assert connection.closed is True


def test_cursor_breaks_equal_updated_at_ties_by_poi_id() -> None:
    timestamp = datetime(2026, 1, 2, tzinfo=timezone.utc)
    plan = prepare_import(
        [
            source_poi(id="poi-b", updated_at=timestamp),
            source_poi(id="poi-a", updated_at=timestamp),
        ]
    )

    assert plan.max_cursor == ("2026-01-02T00:00:00+00:00", "poi-b")


def test_full_guard_rejects_empty_and_invalid_projections() -> None:
    guardrails = importer.FullSyncGuardrails()

    with pytest.raises(importer.UnsafeFullSnapshot, match="contains no rows"):
        importer.validate_full_snapshot(prepare_import([]), guardrails)

    invalid_plan = prepare_import([source_poi(id=None)])
    with pytest.raises(importer.UnsafeFullSnapshot, match="no valid POI"):
        importer.validate_full_snapshot(invalid_plan, guardrails)


def test_full_guard_rejects_abnormal_skip_category_location_and_drop_ratios() -> None:
    guardrails = importer.FullSyncGuardrails()
    mixed = prepare_import(
        [
            source_poi(id="valid-poi"),
            source_poi(id=None),
        ]
    )
    with pytest.raises(importer.UnsafeFullSnapshot, match="Skipped source rows"):
        importer.validate_full_snapshot(mixed, guardrails)

    unmapped_category = prepare_import([source_poi(category_name="unknown category")])
    with pytest.raises(importer.UnsafeFullSnapshot, match="categories"):
        importer.validate_full_snapshot(unmapped_category, guardrails)

    missing_location = prepare_import([source_poi(location_key=None)])
    with pytest.raises(importer.UnsafeFullSnapshot, match="locations"):
        importer.validate_full_snapshot(missing_location, guardrails)

    source_drop = prepare_import(
        [source_poi(id=f"poi-{index}") for index in range(90)]
    )
    with pytest.raises(importer.UnsafeFullSnapshot, match="count dropped"):
        importer.validate_full_snapshot(
            source_drop,
            guardrails,
            previous_managed_poi_count=100,
        )


def test_full_guard_accepts_small_changes_using_ratios_not_fixed_poi_totals() -> None:
    plan = prepare_import([source_poi(id=f"poi-{index}") for index in range(99)])

    importer.validate_full_snapshot(
        plan,
        importer.FullSyncGuardrails(max_poi_drop_ratio=0.02),
        previous_managed_poi_count=100,
    )


def test_full_sync_count_review_warns_for_decrease_below_hard_stop_limit() -> None:
    message = importer.full_sync_count_review_message(99, 100, 0.05)

    assert message is not None
    assert message.startswith("[REVIEW]")
    assert "1.0%" in message
    assert "hard-stop" in message


def test_full_sync_count_review_stops_for_decrease_above_hard_limit() -> None:
    message = importer.full_sync_count_review_message(94, 100, 0.05)

    assert message is not None
    assert message.startswith("[STOP]")
    assert "6.0%" in message


def test_consistency_report_prints_review_for_small_count_decrease(
    capsys: pytest.CaptureFixture[str],
) -> None:
    plan = prepare_import([source_poi(id=f"poi-{index}") for index in range(99)])
    graph_pois = [
        {
            "id": record.id,
            "name": record.name,
            "is_active": record.is_active,
            "is_local_business": record.is_local_business,
            "local_business_type": record.local_business_type,
            "source_updated_at": "2026-01-02T00:00:00+00:00",
            "managed_by": importer.MANAGED_BY,
            "relationships": [],
        }
        for record in plan.records
    ]
    graph_pois.append(
        {
            "id": "previous-extra-poi",
            "name": "Previous POI",
            "is_active": True,
            "managed_by": importer.MANAGED_BY,
            "relationships": [],
        }
    )
    report = importer.build_consistency_report(
        plan,
        {
            "pois": graph_pois,
            "node_counts": {"POI": 100},
            "relationship_counts": {},
            "duplicate_relationships": [],
            "orphan_semantic_nodes": {},
            "sync_state": {},
        },
    )

    importer.print_consistency_report(report)

    assert "[REVIEW] Source POI count decreased by 1 (1.0%)" in capsys.readouterr().out


def test_apply_rejects_explicit_since_before_connecting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        importer,
        "get_driver",
        lambda: pytest.fail("--since with apply must be rejected before Neo4j access"),
    )

    with pytest.raises(SystemExit) as error:
        importer.main(
            [
                "--apply",
                "--mode",
                "incremental",
                "--since",
                "2026-01-01T00:00:00Z",
            ]
        )

    assert error.value.code == 2


def test_incremental_apply_uses_persisted_checkpoint_and_does_not_complete_after_batch_error(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    checkpoint = ("2026-01-02T00:00:00+00:00", "poi-checkpoint")
    source_cursors: list[tuple[str, str] | None] = []
    events: list[str] = []

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

    class FakeDriver:
        def verify_connectivity(self) -> None:
            events.append("connect")

        def session(self, **_kwargs: object) -> FakeSession:
            return FakeSession()

    monkeypatch.setattr(importer, "get_driver", lambda: FakeDriver())
    monkeypatch.setattr(
        importer,
        "get_settings",
        lambda: SimpleNamespace(NEO4J_DATABASE="dev"),
    )
    monkeypatch.setattr(importer, "close_driver", lambda: events.append("close"))
    monkeypatch.setattr(importer, "verify_required_constraints", lambda *_args: None)
    monkeypatch.setattr(importer, "read_sync_checkpoint", lambda *_args: checkpoint)
    monkeypatch.setattr(
        importer,
        "load_source_pois",
        lambda **kwargs: source_cursors.append(kwargs.get("updated_after"))
        or [source_poi(id="new-poi", updated_at=datetime(2026, 1, 3, tzinfo=timezone.utc))],
    )
    monkeypatch.setattr(importer, "preflight_legacy_poi_nodes", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(importer, "preflight_legacy_semantic_nodes", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(importer, "preflight_legacy_relationships", lambda *_args, **_kwargs: {})
    monkeypatch.setattr(
        importer,
        "acquire_sync_lease",
        lambda *_args: checkpoint,
    )
    monkeypatch.setattr(
        importer,
        "import_batches",
        lambda *_args: (_ for _ in ()).throw(importer.BatchImportError(0, 1, 1)),
    )
    monkeypatch.setattr(
        importer,
        "complete_sync",
        lambda *_args: pytest.fail("failed incremental batch must not advance checkpoint"),
    )
    monkeypatch.setattr(
        importer,
        "release_sync_lease",
        lambda *_args: events.append("lease_release"),
    )

    exit_code = importer.main(["--apply", "--mode", "incremental"])
    capsys.readouterr()

    assert exit_code == 1
    assert source_cursors == [checkpoint]
    assert "lease_release" in events
    assert "close" in events


def test_consistency_report_detects_semantic_drift_with_unchanged_timestamp() -> None:
    source = source_poi(vibes=["unsupported_audit_tag"])
    plan = prepare_import([source])
    graph_snapshot = {
        "pois": [
            {
                "id": source.id,
                "name": "stale graph name",
                "is_active": True,
                "source_updated_at": source.updated_at,
                "managed_by": importer.MANAGED_BY,
                "relationships": [],
            }
        ],
        "node_counts": {"POI": 1},
        "relationship_counts": {},
        "duplicate_relationships": [],
        "orphan_semantic_nodes": {},
        "sync_state": {},
    }

    report = importer.build_consistency_report(plan, graph_snapshot)

    assert report["field_drift_ids"] == [source.id]
    assert report["same_timestamp_semantic_drift_ids"] == [source.id]
    assert report["source_unmapped_activities"] == {
        "vibes:unsupported_audit_tag": 1
    }
    assert len(report["missing_relationships"]) == 2


def test_consistency_report_detects_updated_at_regression_and_null_source_time() -> None:
    old_source = source_poi(id="old-source", updated_at=datetime(2025, 12, 1, tzinfo=timezone.utc))
    null_source = source_poi(id="null-source", updated_at=None)
    plan = prepare_import([old_source, null_source])
    graph_snapshot = {
        "pois": [
            {
                "id": old_source.id,
                "name": old_source.name,
                "is_active": True,
                "source_updated_at": "2026-01-02T00:00:00+00:00",
                "managed_by": importer.MANAGED_BY,
                "relationships": [],
            },
            {
                "id": null_source.id,
                "name": null_source.name,
                "is_active": False,
                "source_updated_at": None,
                "managed_by": importer.MANAGED_BY,
                "relationships": [
                    {"type": "IN_CATEGORY", "target_key": "historical_culture", "managed_by": importer.MANAGED_BY}
                ],
            },
        ],
        "node_counts": {"POI": 2},
        "relationship_counts": {"IN_CATEGORY": 1},
        "duplicate_relationships": [],
        "orphan_semantic_nodes": {},
        "sync_state": {},
    }

    report = importer.build_consistency_report(plan, graph_snapshot)

    assert report["source_updated_at_null_count"] == 1
    assert report["source_updated_at_regression_ids"] == [old_source.id]
    assert report["inactive_poi_managed_relationship_count"] == 1


def test_consistency_audit_queries_are_read_only_and_detect_cross_owner_duplicates() -> None:
    audit_queries = (
        importer.READ_AUDIT_POIS_QUERY,
        importer.READ_AUDIT_NODE_COUNTS_QUERY,
        importer.READ_AUDIT_RELATIONSHIP_COUNTS_QUERY,
        importer.READ_AUDIT_DUPLICATE_RELATIONSHIPS_QUERY,
        importer.READ_AUDIT_ORPHAN_SEMANTIC_NODES_QUERY,
        importer.READ_AUDIT_SYNC_STATE_QUERY,
    )
    for query in audit_queries:
        assert not re.search(r"\b(?:CREATE|MERGE|SET|DELETE|REMOVE)\b", query, re.IGNORECASE)
    assert "r.managed_by AS managed_by" not in importer.READ_AUDIT_DUPLICATE_RELATIONSHIPS_QUERY
    assert "collect(r.managed_by) AS owners" in importer.READ_AUDIT_DUPLICATE_RELATIONSHIPS_QUERY


def test_audit_mode_uses_read_transactions_only(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    events: list[str] = []

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def execute_write(self, *_args: object) -> None:
            pytest.fail("read-only audit must not open a write transaction")

    class FakeDriver:
        def verify_connectivity(self) -> None:
            events.append("connect")

        def session(self, **_kwargs: object) -> FakeSession:
            return FakeSession()

    empty_snapshot = {
        "pois": [],
        "node_counts": {},
        "relationship_counts": {},
        "duplicate_relationships": [],
        "orphan_semantic_nodes": {},
        "sync_state": {},
    }
    monkeypatch.setattr(importer, "load_source_pois", lambda *_args, **_kwargs: [source_poi()])
    monkeypatch.setattr(importer, "get_driver", lambda: FakeDriver())
    monkeypatch.setattr(
        importer,
        "get_settings",
        lambda: SimpleNamespace(NEO4J_DATABASE="dev"),
    )
    monkeypatch.setattr(importer, "close_driver", lambda: events.append("close"))
    monkeypatch.setattr(
        importer,
        "read_consistency_snapshot",
        lambda _session: events.append("read_snapshot") or empty_snapshot,
    )

    exit_code = importer.main(["--audit"])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert events == ["connect", "read_snapshot", "close"]
    assert "READ ONLY" in captured.out
    assert "no Neo4j writes" not in captured.out.lower()


def test_default_invocation_is_dry_run_and_never_connects_neo4j(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(importer, "load_source_pois", lambda *_args: [source_poi()])
    monkeypatch.setattr(importer, "get_driver", lambda: pytest.fail("dry-run connected Neo4j"))

    exit_code = importer.main([])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert "DRY RUN - NO DATABASE WRITES" in captured.out
    assert "POIs prepared: 1" in captured.out


def test_dry_run_summary_reports_expected_graph_counts_and_preflight_scope(
    capsys: pytest.CaptureFixture[str],
) -> None:
    plan = prepare_import([source_poi(sub_category="beach_coastline")])

    importer.print_summary(plan, imported_count=0, status="DRY RUN - NO DATABASE WRITES")

    output = capsys.readouterr().out
    assert "Planned node counts by label: {'POI': 1, 'Category': 1, 'Activity': 1, 'Location': 1}" in output
    assert "Planned relationship counts by type: {'IN_CATEGORY': 1, 'OFFERS_ACTIVITY': 1, 'LOCATED_IN': 1}" in output
    assert "Neo4j legacy-conflict preflight: not run by PostgreSQL-only dry-run." in output


def test_apply_preflights_before_schema_and_lease_then_rechecks(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    events: list[str] = []

    class FakeDriver:
        def verify_connectivity(self) -> None:
            events.append("connect")

        def session(self, **_kwargs: object):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

    monkeypatch.setattr(importer, "get_driver", lambda: FakeDriver())
    monkeypatch.setattr(
        importer,
        "get_settings",
        lambda: SimpleNamespace(NEO4J_DATABASE="dev"),
    )
    monkeypatch.setattr(importer, "close_driver", lambda: events.append("close"))
    monkeypatch.setattr(
        importer,
        "read_schema_statements",
        lambda: events.append("schema_validate") or ["CREATE CONSTRAINT example"],
    )
    monkeypatch.setattr(
        importer,
        "require_empty_graph",
        lambda *_args: events.append("empty_target_check"),
    )
    monkeypatch.setattr(importer, "load_source_pois", lambda **_kwargs: events.append("source") or [source_poi()])
    monkeypatch.setattr(
        importer,
        "preflight_legacy_poi_nodes",
        lambda *_args, **_kwargs: events.append("node_preflight"),
    )
    monkeypatch.setattr(
        importer,
        "preflight_legacy_semantic_nodes",
        lambda *_args, **_kwargs: events.append("semantic_preflight"),
    )
    monkeypatch.setattr(
        importer,
        "preflight_legacy_relationships",
        lambda *_args, **_kwargs: events.append("relationship_preflight") or {},
    )
    monkeypatch.setattr(importer, "apply_schema", lambda *_args: events.append("schema_apply"))
    monkeypatch.setattr(importer, "read_managed_poi_count", lambda *_args: events.append("graph_baseline") or 0)
    monkeypatch.setattr(
        importer,
        "verify_required_constraints",
        lambda *_args: events.append("constraints_check"),
    )
    monkeypatch.setattr(
        importer,
        "acquire_sync_lease",
        lambda *_args: events.append("lease_acquire") or None,
    )
    monkeypatch.setattr(
        importer,
        "import_batches",
        lambda _session, records, *_args: events.append("batch_import") or len(records),
    )
    monkeypatch.setattr(
        importer,
        "complete_sync",
        lambda *_args: events.append("checkpoint_complete") or 0,
    )

    exit_code = importer.main(["--apply", "--apply-schema", "--mode", "full"])
    capsys.readouterr()

    assert exit_code == 0
    assert events.index("source") < events.index("node_preflight")
    assert events.index("node_preflight") < events.index("relationship_preflight")
    assert events.index("relationship_preflight") < events.index("semantic_preflight")
    assert events.index("relationship_preflight") < events.index("schema_apply")
    assert events.index("empty_target_check") < events.index("schema_apply")
    assert events.index("schema_apply") < events.index("lease_acquire")
    assert events.index("lease_acquire") < events.index("batch_import")
    assert events.count("node_preflight") == 2
    assert events.count("semantic_preflight") == 2
    assert events.count("relationship_preflight") == 2
    assert any(
        index > events.index("lease_acquire")
        for index, event in enumerate(events)
        if event == "constraints_check"
    )


def test_failed_apply_batch_does_not_advance_checkpoint(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    events: list[str] = []

    class FakeDriver:
        def verify_connectivity(self) -> None:
            events.append("connect")

        def session(self, **_kwargs: object):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

    monkeypatch.setattr(importer, "get_driver", lambda: FakeDriver())
    monkeypatch.setattr(
        importer,
        "get_settings",
        lambda: SimpleNamespace(NEO4J_DATABASE="dev"),
    )
    monkeypatch.setattr(importer, "close_driver", lambda: events.append("close"))
    monkeypatch.setattr(importer, "load_source_pois", lambda **_kwargs: [source_poi()])
    monkeypatch.setattr(importer, "verify_required_constraints", lambda *_args: None)
    monkeypatch.setattr(importer, "read_managed_poi_count", lambda *_args: 0)
    monkeypatch.setattr(importer, "preflight_legacy_poi_nodes", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(importer, "preflight_legacy_semantic_nodes", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(importer, "preflight_legacy_relationships", lambda *_args, **_kwargs: {})
    monkeypatch.setattr(importer, "acquire_sync_lease", lambda *_args: None)

    def fail_batch(*_args: object) -> int:
        raise importer.BatchImportError(0, 1, 1)

    monkeypatch.setattr(importer, "import_batches", fail_batch)
    monkeypatch.setattr(
        importer,
        "complete_sync",
        lambda *_args: pytest.fail("failed batch must not advance the checkpoint"),
    )
    monkeypatch.setattr(
        importer,
        "release_sync_lease",
        lambda *_args: events.append("lease_release"),
    )

    exit_code = importer.main(["--apply", "--mode", "full"])
    capsys.readouterr()

    assert exit_code == 1
    assert "lease_release" in events
    assert "checkpoint_complete" not in events


def test_schema_apply_requires_explicit_apply_flag() -> None:
    with pytest.raises(SystemExit) as error:
        importer.main(["--apply-schema"])
    assert error.value.code == 2


def test_schema_only_mode_is_explicit_and_does_not_import_pois(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(importer, "apply_schema_only", lambda: 6)
    monkeypatch.setattr(
        importer,
        "load_source_pois",
        lambda *_args, **_kwargs: pytest.fail("schema-only must not read PostgreSQL"),
    )
    monkeypatch.setattr(
        importer,
        "import_batches",
        lambda *_args, **_kwargs: pytest.fail("schema-only must not import POIs"),
    )

    exit_code = importer.main(["--apply-schema-only"])
    output = capsys.readouterr().out

    assert exit_code == 0
    assert "Neo4j schema statements applied: 6" in output
    assert "POIs imported/merged: 0" in output


def test_schema_only_requires_empty_database_before_schema_writes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def execute_read(self, _callback):
            return 1, 0

    class FakeDriver:
        def verify_connectivity(self) -> None:
            events.append("connect")

        def session(self, **_kwargs: object) -> FakeSession:
            return FakeSession()

    monkeypatch.setattr(importer, "get_driver", lambda: FakeDriver())
    monkeypatch.setattr(
        importer,
        "get_settings",
        lambda: SimpleNamespace(NEO4J_DATABASE="dev"),
    )
    monkeypatch.setattr(importer, "close_driver", lambda: events.append("close"))
    monkeypatch.setattr(
        importer,
        "apply_schema",
        lambda *_args: pytest.fail("schema must not be applied to a non-empty target"),
    )

    with pytest.raises(RuntimeError, match="requires an empty graph"):
        importer.apply_schema_only()

    assert events == ["connect", "close"]


def test_schema_only_applies_schema_after_read_only_empty_check(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []

    class EmptySession:
        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def execute_read(self, callback):
            events.append("empty_check")
            return callback(FakeTransaction())

    class FakeDriver:
        def verify_connectivity(self) -> None:
            events.append("connect")

        def session(self, **_kwargs: object) -> EmptySession:
            return EmptySession()

    monkeypatch.setattr(importer, "get_driver", lambda: FakeDriver())
    monkeypatch.setattr(
        importer,
        "get_settings",
        lambda: SimpleNamespace(NEO4J_DATABASE="dev"),
    )
    monkeypatch.setattr(importer, "close_driver", lambda: events.append("close"))
    monkeypatch.setattr(
        importer,
        "apply_schema",
        lambda *_args: events.append("schema_apply") or 6,
    )
    monkeypatch.setattr(
        importer,
        "verify_required_constraints",
        lambda *_args: events.append("constraints_check"),
    )

    assert importer.apply_schema_only() == 6
    assert events == ["connect", "empty_check", "schema_apply", "constraints_check", "close"]


def test_full_reconcile_and_incremental_checkpoint_are_non_destructive() -> None:
    assert "p.managed_by = $managed_by" in importer.MARK_MISSING_MANAGED_POIS_INACTIVE_QUERY
    assert "last_updated_at" in importer.COMPLETE_SYNC_QUERY
    assert "last_poi_id" in importer.COMPLETE_SYNC_QUERY
    assert "lease_id" in importer.ACQUIRE_LEASE_QUERY
    assert "lease_until" in importer.ACQUIRE_LEASE_QUERY
    assert "lease_until" in importer.RENEW_LEASE_QUERY
    assert "DELETE" not in importer.COMPLETE_SYNC_QUERY.upper()


def test_second_sync_cannot_acquire_an_active_lease() -> None:
    class LeaseHeldTransaction:
        def run(self, query: str, **_parameters: object) -> FakeResult:
            assert query == importer.ACQUIRE_LEASE_QUERY
            return FakeResult()

    class LeaseHeldSession:
        def execute_write(self, callback, *args):
            return callback(LeaseHeldTransaction(), *args)

    with pytest.raises(RuntimeError, match="Another graph sync is already running"):
        importer.acquire_sync_lease(LeaseHeldSession(), "second-process")


def test_lost_lease_aborts_completion_before_marking_missing_pois() -> None:
    class LostLeaseTransaction(FakeTransaction):
        def run(self, query: str, **parameters: object) -> FakeResult:
            self.calls.append((query, parameters))
            if query == importer.RENEW_LEASE_QUERY:
                return FakeResult()
            return super().run(query, **parameters)

    transaction = LostLeaseTransaction()

    with pytest.raises(RuntimeError, match="lease was lost"):
        importer._complete_sync(transaction, "lease-1", "sync-1", "full", None)

    assert all(query != importer.MARK_MISSING_MANAGED_POIS_INACTIVE_QUERY for query, _ in transaction.calls)


def test_full_sync_marks_missing_then_commits_checkpoint_under_renewed_lease() -> None:
    transaction = FakeTransaction()

    marked_inactive = importer._complete_sync(
        transaction,
        "lease-1",
        "sync-1",
        "full",
        ("2026-01-02T00:00:00+00:00", "poi-1"),
    )

    assert marked_inactive == 0
    assert [query for query, _ in transaction.calls] == [
        importer.RENEW_LEASE_QUERY,
        importer.MARK_MISSING_MANAGED_POIS_INACTIVE_QUERY,
        importer.COMPLETE_SYNC_QUERY,
    ]
