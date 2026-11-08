"""Import the PostgreSQL POI semantic projection into Neo4j Aura.

Run from the repository root:
    python backend/scripts/import_pois_to_neo4j.py --dry-run
    python backend/scripts/import_pois_to_neo4j.py --limit 3 --apply-schema
    python backend/scripts/import_pois_to_neo4j.py --apply-schema
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import psycopg

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
SCHEMA_PATH = BACKEND_ROOT / "neo4j" / "schema.cypher"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings
from app.db.neo4j import close_driver, get_driver
from app.db.postgres import get_connection

BATCH_SIZE = 250

CATEGORY_KEYS: dict[str, tuple[str, str]] = {
    "ẩm thực và quán ăn".casefold(): ("food_dining", "Ẩm thực và quán ăn"),
    "quán cafe giải khát".casefold(): ("cafe_refreshment", "Quán cafe giải khát"),
    "di tích lịch sử và văn hóa".casefold(): (
        "historical_culture",
        "Di tích lịch sử và văn hóa",
    ),
    "cảnh quan và thiên nhiên".casefold(): (
        "nature_landscape",
        "Cảnh quan và thiên nhiên",
    ),
    "tâm linh và chùa thiền".casefold(): (
        "spiritual_temple",
        "Tâm linh và chùa thiền",
    ),
}

LOCATION_KEYS: dict[str, str] = {
    "DANANG": "Da Nang",
    "HUE": "Hue",
}

# These keys are documented by the approved graph design. PostgreSQL currently
# has no activity field, so the database reader supplies no activity facts.
ACTIVITY_NAMES: dict[str, str] = {
    "food_experience": "Food experience",
    "cafe_experience": "Cafe experience",
    "cultural_sightseeing": "Cultural sightseeing",
    "nature_exploration": "Nature exploration",
    "spiritual_visit": "Spiritual visit",
    "photography": "Photography",
}

REQUIRED_CONSTRAINTS: set[tuple[str, str]] = {
    ("POI", "id"),
    ("Category", "key"),
    ("Activity", "key"),
    ("Location", "key"),
}

IMPORT_QUERY = """
UNWIND $rows AS row
MERGE (p:POI {id: row.id})
SET p.is_local_business = row.is_local_business,
    p.local_business_type = row.local_business_type
FOREACH (_ IN CASE WHEN row.name IS NULL THEN [] ELSE [1] END |
    SET p.name = row.name
)
FOREACH (category IN CASE
    WHEN row.category IS NULL THEN [] ELSE [row.category] END |
    MERGE (c:Category {key: category.key})
    SET c.name = category.name
    MERGE (p)-[:IN_CATEGORY]->(c)
)
FOREACH (activity IN row.activities |
    MERGE (a:Activity {key: activity.key})
    SET a.name = activity.name
    MERGE (p)-[:OFFERS_ACTIVITY]->(a)
)
FOREACH (location IN CASE
    WHEN row.location IS NULL THEN [] ELSE [row.location] END |
    MERGE (l:Location {key: location.key})
    SET l.name = location.name,
        l.level = 'city'
    MERGE (p)-[:LOCATED_IN]->(l)
)
"""


@dataclass(frozen=True)
class SemanticValue:
    key: str
    name: str

    def as_params(self) -> dict[str, str]:
        return {"key": self.key, "name": self.name}


@dataclass(frozen=True)
class SourcePOI:
    id: Any
    name: Any
    category_name: Any
    location_key: Any
    location_name: Any
    is_local_business: Any
    local_business_type: Any
    activities: Any = ()


@dataclass(frozen=True)
class GraphPOI:
    id: str
    name: str | None
    category: SemanticValue | None
    activities: tuple[SemanticValue, ...]
    location: SemanticValue | None
    is_local_business: bool
    local_business_type: str | None

    def as_params(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category.as_params() if self.category else None,
            "activities": [activity.as_params() for activity in self.activities],
            "location": self.location.as_params() if self.location else None,
            "is_local_business": self.is_local_business,
            "local_business_type": self.local_business_type,
        }


@dataclass(frozen=True)
class ImportPlan:
    records: tuple[GraphPOI, ...]
    read_count: int
    skipped_count: int

    @property
    def category_count(self) -> int:
        return len({record.category.key for record in self.records if record.category})

    @property
    def activity_count(self) -> int:
        return len(
            {
                activity.key
                for record in self.records
                for activity in record.activities
            }
        )

    @property
    def location_count(self) -> int:
        return len({record.location.key for record in self.records if record.location})

    @property
    def relationship_count(self) -> int:
        return sum(
            (1 if record.category else 0)
            + len(record.activities)
            + (1 if record.location else 0)
            for record in self.records
        )


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    normalized = " ".join(str(value).split())
    return normalized or None


def normalize_key(value: Any) -> str | None:
    text = normalize_text(value)
    if text is None:
        return None
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    key = re.sub(r"[^a-z0-9]+", "_", ascii_text.casefold()).strip("_")
    return key or None


def normalize_category(value: Any) -> SemanticValue | None:
    text = normalize_text(value)
    if text is None:
        return None
    category = CATEGORY_KEYS.get(text.casefold())
    return SemanticValue(*category) if category else None


def normalize_location(key: Any, _name: Any = None) -> SemanticValue | None:
    normalized_key = normalize_text(key)
    if normalized_key is None:
        return None
    normalized_key = normalized_key.upper()
    name = LOCATION_KEYS.get(normalized_key)
    return SemanticValue(normalized_key, name) if name else None


def normalize_activities(values: Any) -> tuple[SemanticValue, ...]:
    if values is None:
        return ()
    if isinstance(values, str):
        candidates: Iterable[Any] = (values,)
    elif isinstance(values, Iterable) and not isinstance(values, (bytes, Mapping)):
        candidates = values
    else:
        return ()

    activities: dict[str, SemanticValue] = {}
    for value in candidates:
        key = normalize_key(value)
        if key in ACTIVITY_NAMES:
            activities[key] = SemanticValue(key, ACTIVITY_NAMES[key])
    return tuple(activities.values())


def normalize_boolean(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().casefold() in {"true", "1", "yes"}
    return bool(value)


def transform_poi(source: SourcePOI) -> GraphPOI | None:
    poi_id = normalize_text(source.id)
    if poi_id is None:
        return None
    return GraphPOI(
        id=poi_id,
        name=normalize_text(source.name),
        category=normalize_category(source.category_name),
        activities=normalize_activities(source.activities),
        location=normalize_location(source.location_key, source.location_name),
        is_local_business=normalize_boolean(source.is_local_business),
        local_business_type=normalize_text(source.local_business_type),
    )


def prepare_import(source_records: Sequence[SourcePOI]) -> ImportPlan:
    records: list[GraphPOI] = []
    skipped_count = 0
    for source in source_records:
        record = transform_poi(source)
        if record is None:
            skipped_count += 1
        else:
            records.append(record)
    return ImportPlan(tuple(records), len(source_records), skipped_count)


def load_source_pois(limit: int | None = None) -> list[SourcePOI]:
    query = """
        SELECT
            p.poi_id::text,
            p.name,
            c.name AS category_name,
            ci.code AS location_key,
            ci.name AS location_name,
            p.is_local_business,
            p.local_business_type
        FROM public.pois p
        JOIN public.poi_categories c ON p.category_id = c.category_id
        JOIN public.cities ci ON p.city_id = ci.city_id
        ORDER BY p.poi_id
    """
    params: tuple[int, ...] = ()
    if limit is not None:
        query += " LIMIT %s"
        params = (limit,)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            return [SourcePOI(*row) for row in cursor.fetchall()]


def read_schema_statements(path: Path = SCHEMA_PATH) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    schema = "\n".join(line for line in lines if not line.lstrip().startswith("//"))
    statements = [statement.strip() for statement in schema.split(";") if statement.strip()]
    forbidden = re.compile(r"\b(?:DROP|DELETE|DETACH|REMOVE)\b", re.IGNORECASE)
    if any(forbidden.search(statement) for statement in statements):
        raise RuntimeError("Neo4j schema contains a destructive statement.")
    return statements


def apply_schema(session: Any, path: Path = SCHEMA_PATH) -> int:
    statements = read_schema_statements(path)
    for statement in statements:
        session.run(statement).consume()
    return len(statements)


def _read_constraint_keys(transaction: Any) -> set[tuple[str, str]]:
    result = transaction.run(
        "SHOW CONSTRAINTS YIELD labelsOrTypes, properties "
        "RETURN labelsOrTypes, properties"
    )
    keys: set[tuple[str, str]] = set()
    for row in result:
        labels = row["labelsOrTypes"] or []
        properties = row["properties"] or []
        if len(labels) == 1 and len(properties) == 1:
            keys.add((labels[0], properties[0]))
    return keys


def verify_required_constraints(session: Any) -> None:
    existing = session.execute_read(_read_constraint_keys)
    missing = REQUIRED_CONSTRAINTS - existing
    if missing:
        formatted = ", ".join(f"{label}.{prop}" for label, prop in sorted(missing))
        raise RuntimeError(
            f"Required Neo4j uniqueness constraints are missing: {formatted}. "
            "Run again with --apply-schema."
        )


def _write_batch(transaction: Any, rows: list[dict[str, Any]]) -> int:
    transaction.run(IMPORT_QUERY, rows=rows).consume()
    return len(rows)


def import_batches(session: Any, records: Sequence[GraphPOI], batch_size: int) -> int:
    imported = 0
    for start in range(0, len(records), batch_size):
        batch = [record.as_params() for record in records[start : start + batch_size]]
        imported += session.execute_write(_write_batch, batch)
    return imported


def print_summary(plan: ImportPlan, imported_count: int, status: str) -> None:
    print("GreenTrip Neo4j POI Import")
    print(f"POIs read: {plan.read_count}")
    print(f"POIs ready: {len(plan.records)}")
    print(f"POIs imported/merged: {imported_count}")
    print(f"POIs skipped: {plan.skipped_count}")
    print(f"Categories processed: {plan.category_count}")
    print(f"Activities processed: {plan.activity_count}")
    print(f"Locations processed: {plan.location_count}")
    print(f"Relationships processed/merged: {plan.relationship_count}")
    print(f"Import status: {status}")


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("value must be at least 1")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Import PostgreSQL POI semantic facts into Neo4j Aura."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read and validate the source without connecting to or writing Neo4j.",
    )
    parser.add_argument(
        "--limit",
        type=positive_int,
        help="Read at most this many POIs for safe development validation.",
    )
    parser.add_argument(
        "--batch-size",
        type=positive_int,
        default=BATCH_SIZE,
        help=f"Neo4j write batch size (default: {BATCH_SIZE}).",
    )
    parser.add_argument(
        "--apply-schema",
        action="store_true",
        help="Safely apply backend/neo4j/schema.cypher before importing.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        plan = prepare_import(load_source_pois(args.limit))
    except (OSError, RuntimeError, psycopg.Error):
        print("[ERROR] Unable to read POIs from PostgreSQL.", file=sys.stderr)
        return 1

    if args.dry_run:
        print_summary(plan, imported_count=0, status="DRY RUN - NO NEO4J WRITES")
        return 0

    driver = None
    try:
        driver = get_driver()
        if driver is None:
            print("[ERROR] Neo4j is not configured.", file=sys.stderr)
            return 1

        settings = get_settings()
        driver.verify_connectivity()
        with driver.session(database=settings.NEO4J_DATABASE) as session:
            if args.apply_schema:
                apply_schema(session)
            verify_required_constraints(session)
            imported_count = import_batches(session, plan.records, args.batch_size)
    except Exception:
        print("[ERROR] Neo4j import failed; no credentials were logged.", file=sys.stderr)
        return 1
    finally:
        if driver is not None:
            close_driver()

    print_summary(plan, imported_count=imported_count, status="SUCCESS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
