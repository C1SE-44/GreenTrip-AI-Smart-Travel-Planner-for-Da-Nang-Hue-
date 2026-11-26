"""Build a safe semantic POI projection from PostgreSQL for Neo4j.

The default command is read-only and produces a dry-run report. Neo4j writes
require the explicit ``--apply`` flag; this script never writes to PostgreSQL.
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

import psycopg

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
SCHEMA_PATH = BACKEND_ROOT / "neo4j" / "schema.cypher"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings
from app.db.neo4j import close_driver, get_driver

BATCH_SIZE = 250
MANAGED_BY = "greentrip_graph_builder_phase2"
SYNC_STATE_KEY = "postgres_poi_projection"
LEASE_SECONDS = 1800
DEFAULT_MAX_SKIPPED_RATIO = 0.01
DEFAULT_MAX_POI_DROP_RATIO = 0.05
DEFAULT_MAX_UNMAPPED_CATEGORY_RATIO = 0.01
DEFAULT_MAX_MISSING_LOCATION_RATIO = 0.01
EXPECTED_TARGET_LABELS = {
    "IN_CATEGORY": "Category",
    "OFFERS_ACTIVITY": "Activity",
    "LOCATED_IN": "Location",
}

CATEGORY_KEYS: dict[str, tuple[str, str]] = {
    "ẩm thực và quán ăn": ("food_dining", "Ẩm thực và quán ăn"),
    "quán cafe giải khát": ("cafe_refreshment", "Quán cafe giải khát"),
    "di tích lịch sử và văn hóa": ("historical_culture", "Di tích lịch sử và văn hóa"),
    "cảnh quan và thiên nhiên": ("nature_landscape", "Cảnh quan và thiên nhiên"),
    "lưu trú và nghỉ dưỡng": ("lodging_stay", "Lưu trú và nghỉ dưỡng"),
    "tâm linh & tôn giáo": ("spiritual_religion", "Tâm linh & Tôn giáo"),
    # Keep the previous taxonomy label as an input alias, but emit the actual
    # current category key above.
    "tâm linh và chùa thiền": ("spiritual_religion", "Tâm linh & Tôn giáo"),
}

LOCATION_KEYS: dict[str, str] = {"DANANG": "Da Nang", "HUE": "Hue"}

ACTIVITY_NAMES: dict[str, str] = {
    "food_experience": "Food experience",
    "cafe_experience": "Cafe experience",
    "cultural_sightseeing": "Cultural sightseeing",
    "nature_exploration": "Nature exploration",
    "spiritual_visit": "Spiritual visit",
    "photography": "Photography",
    "water_recreation": "Water recreation",
    "local_experience": "Local experience",
    "wellness_relaxation": "Wellness and relaxation",
    "nightlife_entertainment": "Nightlife and entertainment",
}

# Exact, field-specific source values only. In particular, proximity labels
# such as "gần biển" and atmosphere tags such as "yên bình" do not assert an
# activity and are intentionally left unmapped.
ACTIVITY_SOURCE_VALUES: dict[str, dict[str, tuple[str, ...]]] = {
    "sub_category": {
        "coastal_seafood": ("food_experience",),
        "green_vegetarian": ("food_experience",),
        "local_specialty": ("food_experience",),
        "seafood": ("food_experience",),
        "street_bites_rolls": ("food_experience",),
        "traditional_noodles": ("food_experience",),
        "heritage_fine_dining": ("food_experience",),
        "heritage_dining": ("food_experience",),
        "vegetarian": ("food_experience",),
        "asian": ("food_experience",),
        "cafe": ("cafe_experience",),
        "scenic_view_cafe": ("cafe_experience",),
        "workspace_study_cafe": ("cafe_experience",),
        "retro_street_cafe": ("cafe_experience",),
        "historic_zen_temples": ("cultural_sightseeing", "spiritual_visit"),
        "cathedrals_heritage_churches": ("cultural_sightseeing",),
        "museums_galleries": ("cultural_sightseeing",),
        "museum": ("cultural_sightseeing",),
        "historic_memorials": ("cultural_sightseeing",),
        "urban_landmarks": ("cultural_sightseeing",),
        "craft_village": ("cultural_sightseeing",),
        "craft_villages": ("cultural_sightseeing",),
        "heritage": ("cultural_sightseeing",),
        "art_space": ("cultural_sightseeing",),
        "performing_arts_heritage": ("cultural_sightseeing",),
        "grand_mountain_ocean_temples": ("cultural_sightseeing", "spiritual_visit"),
        "beach_coastline": ("nature_exploration",),
        "pine_hills_parks": ("nature_exploration",),
        "mountain_pass_peninsula": ("nature_exploration",),
        "waterfalls_hotsprings": ("nature_exploration",),
        "wetland_lagoon_rivers": ("nature_exploration",),
        "waterfall": ("nature_exploration",),
        "forest": ("nature_exploration",),
        "river_ecotourism": ("nature_exploration",),
        "mangrove_forest": ("nature_exploration",),
        "mountain": ("nature_exploration",),
        "snorkeling": ("water_recreation",),
        "adventure": ("nature_exploration",),
        "nightlife_bars_pubs": ("nightlife_entertainment",),
        "pagoda": ("spiritual_visit",),
        "wellness": ("wellness_relaxation",),
        "spa": ("wellness_relaxation",),
    },
    "vibes": {
        "culinary": ("food_experience",),
        "am_thuc": ("food_experience",),
        "local_specialty": ("food_experience",),
        "seafood": ("food_experience",),
        "vegetarian": ("food_experience",),
        "heritage_dining": ("food_experience",),
        "local_cuisine": ("food_experience",),
        "healthy_food": ("food_experience",),
        "local_food": ("food_experience",),
        "local_vegan": ("food_experience",),
        "lagoon_seafood": ("food_experience",),
        "cafe": ("cafe_experience",),
        "garden_cafe": ("cafe_experience",),
        "tropical_cafe": ("cafe_experience",),
        "latte_art": ("cafe_experience",),
        "sightseeing": ("cultural_sightseeing",),
        "lich_su": ("cultural_sightseeing",),
        "heritage": ("cultural_sightseeing",),
        "craft_village": ("cultural_sightseeing",),
        "museum": ("cultural_sightseeing",),
        "art_space": ("cultural_sightseeing",),
        "art": ("cultural_sightseeing",),
        "cotu_culture": ("cultural_sightseeing",),
        "eco_farm": ("nature_exploration", "local_experience"),
        "forest_walk": ("nature_exploration",),
        "pine_forest": ("nature_exploration",),
        "nature_walk": ("nature_exploration",),
        "nature_relax": ("nature_exploration",),
        "hiking": ("nature_exploration",),
        "trekking": ("nature_exploration",),
        "cloud_hunting": ("nature_exploration",),
        "river_ecotourism": ("nature_exploration",),
        "mountain": ("nature_exploration",),
        "forest": ("nature_exploration",),
        "waterfall": ("nature_exploration",),
        "wooden_boat": ("water_recreation",),
        "fishing_experience": ("water_recreation", "local_experience"),
        "beach_stroll": ("water_recreation",),
        "snorkeling": ("water_recreation",),
        "swimming": ("water_recreation",),
        "nightlife": ("nightlife_entertainment",),
        "relaxation": ("wellness_relaxation",),
        "wellness": ("wellness_relaxation",),
        "spa": ("wellness_relaxation",),
        "pagoda": ("spiritual_visit",),
        "photography": ("photography",),
        "village_tour": ("local_experience",),
        "handicraft": ("local_experience",),
        "bamboo_craft": ("local_experience",),
        "farming_experience": ("local_experience",),
        "organic_farming": ("local_experience",),
        "eco_cleanup": ("local_experience",),
    },
    "dna_tags": {
        "fresh_sashimi": ("food_experience",),
        "fresh_catch": ("food_experience",),
        "heritage_recipe": ("food_experience",),
        "cheap_eats": ("food_experience",),
        "quick_dining": ("food_experience",),
        "finger_food": ("food_experience",),
        "buddhist_vegan": ("food_experience",),
        "signature_local": ("food_experience",),
        "craft_burger": ("food_experience",),
        "craft_beer": ("food_experience",),
        "mam_nem_dna": ("food_experience",),
        "artisan_barista": ("cafe_experience",),
        "ancient_artifacts": ("cultural_sightseeing",),
        "champa_sculptures": ("cultural_sightseeing",),
        "curated_art": ("cultural_sightseeing",),
        "cultural_architecture": ("cultural_sightseeing",),
        "french_architecture": ("cultural_sightseeing",),
        "unesco_world_heritage": ("cultural_sightseeing",),
        "unesco_intangible_heritage": ("cultural_sightseeing",),
        "dynasty_history": ("cultural_sightseeing",),
        "court_music": ("cultural_sightseeing",),
        "artisan_craft": ("local_experience",),
        "local_trade": ("local_experience",),
        "fisherman_culture": ("local_experience",),
        "organic_farm": ("nature_exploration", "local_experience"),
        "zero_waste_farming": ("nature_exploration", "local_experience"),
        "waterfall_adventure": ("nature_exploration",),
        "natural_stream": ("nature_exploration",),
        "pine_trees": ("nature_exploration",),
        "cloud_hunting": ("nature_exploration",),
        "zen_buddhism": ("spiritual_visit",),
        "temple_bell": ("spiritual_visit",),
        "mindfulness": ("spiritual_visit",),
        "thich_nhat_hanh_root": ("spiritual_visit",),
        "instagrammable": ("photography",),
        "photography": ("photography",),
        "swimming": ("water_recreation",),
        "water_sports": ("water_recreation",),
        "dragon_boat": ("water_recreation",),
        "fire_breathing_show": ("nightlife_entertainment",),
        "nightlife": ("nightlife_entertainment",),
        "late_night": ("nightlife_entertainment",),
        "eco_wellness": ("wellness_relaxation",),
        "herbal_wellness": ("wellness_relaxation",),
        "detox": ("wellness_relaxation",),
        "digital_detox": ("wellness_relaxation",),
    },
}

# These broad vibes are only a nature activity signal when the controlled POI
# category independently confirms a nature/landscape destination.
CATEGORY_GATED_VIBE_ACTIVITY_VALUES: dict[str, dict[str, tuple[str, ...]]] = {
    "nature_landscape": {
        "nature_explore": ("nature_exploration",),
        "ecotourism": ("nature_exploration",),
    }
}

REQUIRED_CONSTRAINTS: set[tuple[str, str]] = {
    ("POI", "id"),
    ("Category", "key"),
    ("Activity", "key"),
    ("Location", "key"),
    ("GraphSyncState", "key"),
}

READ_ONLY_SOURCE_QUERY = """
SELECT
    p.poi_id::text,
    p.name,
    c.name AS category_name,
    ci.code AS location_key,
    ci.name AS location_name,
    p.is_local_business,
    p.local_business_type,
    p.is_active,
    p.updated_at,
    p.sub_category,
    p.vibes,
    p.ai_metadata
FROM public.pois p
LEFT JOIN public.poi_categories c ON p.category_id = c.category_id
LEFT JOIN public.cities ci ON p.city_id = ci.city_id
"""

POI_UPSERT_QUERY = """
UNWIND $rows AS row
MERGE (p:POI {id: row.id, managed_by: $managed_by})
SET p.name = row.name,
    p.is_local_business = row.is_local_business,
    p.local_business_type = row.local_business_type,
    p.is_active = row.is_active,
    p.source_updated_at = row.source_updated_at,
    p.sync_status = CASE WHEN row.is_active THEN 'active' ELSE 'inactive' END
FOREACH (_ IN CASE WHEN p.managed_by = $managed_by THEN [1] ELSE [] END |
    SET p.last_seen_sync_id = row.sync_id
)
RETURN row.id AS id
"""

RECONCILE_MANAGED_RELATIONSHIPS_QUERY = """
UNWIND $rows AS row
MATCH (p:POI {id: row.id})
WHERE p.managed_by = $managed_by
OPTIONAL MATCH (p)-[r:IN_CATEGORY|OFFERS_ACTIVITY|LOCATED_IN]->(target)
WITH row, r, target
WHERE row.is_active = true
  AND r IS NOT NULL
  AND r.managed_by = $managed_by
  AND NOT any(expected IN row.expected_relationships
      WHERE expected.type = type(r) AND expected.target_key = target.key)
DELETE r
"""

UPSERT_CATEGORY_RELATIONSHIPS_QUERY = """
UNWIND $rows AS row
MATCH (p:POI {id: row.id})
WHERE p.managed_by = $managed_by
FOREACH (category IN CASE
    WHEN row.category IS NULL THEN [] ELSE [row.category] END |
    MERGE (c:Category {key: category.key, managed_by: $managed_by})
    SET c.name = category.name
    MERGE (p)-[:IN_CATEGORY {managed_by: $managed_by}]->(c)
)
"""

UPSERT_ACTIVITY_RELATIONSHIPS_QUERY = """
UNWIND $rows AS row
MATCH (p:POI {id: row.id})
WHERE p.managed_by = $managed_by
FOREACH (activity IN row.activities |
    MERGE (a:Activity {key: activity.key, managed_by: $managed_by})
    SET a.name = activity.name
    MERGE (p)-[:OFFERS_ACTIVITY {managed_by: $managed_by}]->(a)
)
"""

UPSERT_LOCATION_RELATIONSHIPS_QUERY = """
UNWIND $rows AS row
MATCH (p:POI {id: row.id})
WHERE p.managed_by = $managed_by
FOREACH (location IN CASE
    WHEN row.location IS NULL THEN [] ELSE [row.location] END |
    MERGE (l:Location {key: location.key, managed_by: $managed_by})
    SET l.name = location.name,
        l.level = 'city'
    MERGE (p)-[:LOCATED_IN {managed_by: $managed_by}]->(l)
)
"""

READ_EXISTING_RELATIONSHIPS_QUERY = """
UNWIND $poi_ids AS poi_id
MATCH (p:POI {id: poi_id})
OPTIONAL MATCH (p)-[r:IN_CATEGORY|OFFERS_ACTIVITY|LOCATED_IN]->(target)
RETURN p.id AS poi_id,
       type(r) AS relationship_type,
       r.managed_by AS managed_by,
       target.key AS target_key,
       labels(target) AS target_labels
"""

READ_EXISTING_POI_OWNERSHIP_QUERY = """
UNWIND $poi_ids AS poi_id
MATCH (p:POI {id: poi_id})
RETURN p.id AS poi_id, p.managed_by AS managed_by
"""

READ_EXISTING_CATEGORY_OWNERSHIP_QUERY = """
UNWIND $keys AS key
MATCH (n:Category {key: key})
RETURN n.key AS key, n.managed_by AS managed_by
"""

READ_EXISTING_ACTIVITY_OWNERSHIP_QUERY = """
UNWIND $keys AS key
MATCH (n:Activity {key: key})
RETURN n.key AS key, n.managed_by AS managed_by
"""

READ_EXISTING_LOCATION_OWNERSHIP_QUERY = """
UNWIND $keys AS key
MATCH (n:Location {key: key})
RETURN n.key AS key, n.managed_by AS managed_by
"""

READ_SYNC_CHECKPOINT_QUERY = """
OPTIONAL MATCH (s:GraphSyncState {key: $sync_key})
RETURN s.last_updated_at AS last_updated_at,
       s.last_poi_id AS last_poi_id
"""

READ_MANAGED_POI_COUNT_QUERY = """
MATCH (p:POI)
WHERE p.managed_by = $managed_by
RETURN count(p) AS poi_count
"""

READ_AUDIT_POIS_QUERY = """
MATCH (p:POI)
OPTIONAL MATCH (p)-[r:IN_CATEGORY|OFFERS_ACTIVITY|LOCATED_IN]->(target)
RETURN p.id AS id,
       p.name AS name,
       p.is_active AS is_active,
       p.is_local_business AS is_local_business,
       p.local_business_type AS local_business_type,
       p.source_updated_at AS source_updated_at,
       p.managed_by AS managed_by,
       collect(CASE WHEN r IS NULL THEN null ELSE {
           type: type(r),
           target_key: target.key,
           target_name: target.name,
           target_labels: labels(target),
           target_managed_by: target.managed_by,
           managed_by: r.managed_by
       } END) AS relationships
"""

READ_AUDIT_NODE_COUNTS_QUERY = """
MATCH (n)
UNWIND labels(n) AS label
RETURN label, count(*) AS node_count
"""

READ_AUDIT_RELATIONSHIP_COUNTS_QUERY = """
MATCH ()-[r]->()
RETURN type(r) AS relationship_type, count(*) AS relationship_count
"""

READ_AUDIT_DUPLICATE_RELATIONSHIPS_QUERY = """
MATCH (p:POI)-[r:IN_CATEGORY|OFFERS_ACTIVITY|LOCATED_IN]->(target)
WITH p.id AS poi_id,
     type(r) AS relationship_type,
     target.key AS target_key,
     collect(r.managed_by) AS owners,
     count(r) AS copies
WHERE copies > 1
RETURN poi_id, relationship_type, target_key, owners, copies
ORDER BY copies DESC, poi_id
"""

READ_AUDIT_ORPHAN_SEMANTIC_NODES_QUERY = """
MATCH (n)
WHERE (n:Category OR n:Activity OR n:Location)
  AND NOT (n)--()
RETURN CASE
         WHEN n:Category THEN 'Category'
         WHEN n:Activity THEN 'Activity'
         WHEN n:Location THEN 'Location'
       END AS label,
       count(n) AS node_count
"""

READ_AUDIT_SYNC_STATE_QUERY = """
OPTIONAL MATCH (s:GraphSyncState {key: $sync_key})
RETURN s.last_updated_at AS last_updated_at,
       s.last_poi_id AS last_poi_id,
       s.last_completed_sync_id AS last_completed_sync_id,
       s.last_completed_at AS last_completed_at,
       s.lease_id AS lease_id,
       s.lease_until AS lease_until
"""

READ_SYNC_LEASE_QUERY = """
MATCH (s:GraphSyncState {key: $sync_key, lease_id: $lease_id})
WHERE s.lease_until > datetime()
RETURN s.key AS key
"""

ACQUIRE_LEASE_QUERY = """
MERGE (s:GraphSyncState {key: $sync_key})
ON CREATE SET s.lease_until = datetime({epochMillis: 0})
WITH s, datetime() AS now
WHERE s.lease_until IS NULL OR s.lease_until < now
SET s.lease_id = $lease_id,
    s.lease_until = now + duration({seconds: $lease_seconds})
RETURN s.last_updated_at AS last_updated_at,
       s.last_poi_id AS last_poi_id
"""

MARK_MISSING_MANAGED_POIS_INACTIVE_QUERY = """
MATCH (p:POI)
WHERE p.managed_by = $managed_by
  AND coalesce(p.last_seen_sync_id, '') <> $sync_id
SET p.is_active = false,
    p.sync_status = 'missing_from_source'
RETURN count(p) AS marked_inactive
"""

COMPLETE_SYNC_QUERY = """
MATCH (s:GraphSyncState {key: $sync_key, lease_id: $lease_id})
SET s.last_updated_at = $last_updated_at,
    s.last_poi_id = $last_poi_id,
    s.last_completed_sync_id = $sync_id,
    s.last_completed_at = datetime()
REMOVE s.lease_id, s.lease_until
RETURN s.key AS key
"""

RELEASE_LEASE_QUERY = """
MATCH (s:GraphSyncState {key: $sync_key, lease_id: $lease_id})
REMOVE s.lease_id, s.lease_until
RETURN s.key AS key
"""

RENEW_LEASE_QUERY = """
MATCH (s:GraphSyncState {key: $sync_key, lease_id: $lease_id})
SET s.lease_until = datetime() + duration({seconds: $lease_seconds})
RETURN s.key AS key
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
    is_active: Any = True
    updated_at: Any = None
    sub_category: Any = None
    vibes: Any = ()
    ai_metadata: Any = None


@dataclass(frozen=True)
class GraphPOI:
    id: str
    name: str | None
    category: SemanticValue | None
    activities: tuple[SemanticValue, ...]
    location: SemanticValue | None
    is_local_business: bool
    local_business_type: str | None
    is_active: bool
    source_updated_at: str | None


@dataclass(frozen=True)
class ImportPlan:
    records: tuple[GraphPOI, ...]
    read_count: int
    skipped_count: int
    unmapped_categories: Mapping[str, int]
    unmapped_activities: Mapping[str, int]
    max_cursor: tuple[str, str] | None

    @property
    def active_count(self) -> int:
        return sum(record.is_active for record in self.records)

    @property
    def inactive_count(self) -> int:
        return len(self.records) - self.active_count

    @property
    def category_count(self) -> int:
        return len(
            {
                record.category.key
                for record in self.records
                if record.is_active and record.category
            }
        )

    @property
    def activity_count(self) -> int:
        return len(
            {
                activity.key
                for record in self.records
                if record.is_active
                for activity in record.activities
            }
        )

    @property
    def activity_relationship_count(self) -> int:
        return sum(len(record.activities) for record in self.records if record.is_active)

    @property
    def poi_activity_count(self) -> int:
        return sum(bool(record.activities) for record in self.records if record.is_active)

    @property
    def location_count(self) -> int:
        return len(
            {
                record.location.key
                for record in self.records
                if record.is_active and record.location
            }
        )

    @property
    def relationship_count(self) -> int:
        return sum(
            ((1 if record.category else 0) + len(record.activities) + (1 if record.location else 0))
            for record in self.records
            if record.is_active
        )

    @property
    def planned_node_counts_by_label(self) -> dict[str, int]:
        return {
            "POI": len(self.records),
            "Category": self.category_count,
            "Activity": self.activity_count,
            "Location": self.location_count,
        }

    @property
    def planned_relationship_counts_by_type(self) -> dict[str, int]:
        return {
            "IN_CATEGORY": sum(
                record.is_active and record.category is not None for record in self.records
            ),
            "OFFERS_ACTIVITY": self.activity_relationship_count,
            "LOCATED_IN": sum(
                record.is_active and record.location is not None for record in self.records
            ),
        }


@dataclass(frozen=True)
class FullSyncGuardrails:
    max_skipped_ratio: float = DEFAULT_MAX_SKIPPED_RATIO
    max_poi_drop_ratio: float = DEFAULT_MAX_POI_DROP_RATIO
    max_unmapped_category_ratio: float = DEFAULT_MAX_UNMAPPED_CATEGORY_RATIO
    max_missing_location_ratio: float = DEFAULT_MAX_MISSING_LOCATION_RATIO


class UnsafeFullSnapshot(RuntimeError):
    """Raised when a full source projection could mark too much graph data inactive."""


@dataclass(frozen=True)
class ExistingRelationship:
    poi_id: str
    relationship_type: str
    managed_by: str | None
    target_key: str | None
    target_labels: tuple[str, ...]


@dataclass(frozen=True)
class ExistingPOI:
    poi_id: str
    managed_by: str | None


@dataclass(frozen=True)
class ExistingSemanticNode:
    label: str
    key: str
    managed_by: str | None


class LegacyRelationshipConflict(RuntimeError):
    def __init__(self, conflicts: Sequence[str]):
        self.conflicts = tuple(conflicts)
        super().__init__(f"Found {len(conflicts)} unmanaged graph relationship conflict(s).")


class LegacyPOINodeConflict(RuntimeError):
    def __init__(self, conflicts: Sequence[str]):
        self.conflicts = tuple(conflicts)
        super().__init__(f"Found {len(conflicts)} unmanaged POI node conflict(s).")


class LegacySemanticNodeConflict(RuntimeError):
    def __init__(self, conflicts: Sequence[str]):
        self.conflicts = tuple(conflicts)
        super().__init__(f"Found {len(conflicts)} unmanaged semantic node conflict(s).")


class BatchImportError(RuntimeError):
    def __init__(self, completed_count: int, failed_count: int, batch_number: int):
        self.completed_count = completed_count
        self.failed_count = failed_count
        self.batch_number = batch_number
        super().__init__(f"Neo4j batch {batch_number} failed.")


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


def normalize_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        timestamp = value
    else:
        text = normalize_text(value)
        if text is None:
            return None
        try:
            timestamp = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc).isoformat()


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


def normalize_boolean(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().casefold() in {"true", "1", "yes"}
    return bool(value)


def normalize_active(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().casefold() in {"true", "1", "yes"}
    return value == 1


def _values(value: Any) -> tuple[Any, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return (value,)
    if isinstance(value, Iterable) and not isinstance(value, (bytes, Mapping)):
        return tuple(value)
    return ()


def normalize_activities(
    sub_category: Any,
    vibes: Any,
    dna_tags: Any,
    metadata: Any,
    unmapped: Counter[str] | None = None,
    category_key: str | None = None,
) -> tuple[SemanticValue, ...]:
    if not isinstance(metadata, Mapping):
        metadata = {}
    sources: tuple[tuple[str, tuple[Any, ...]], ...] = (
        ("sub_category", _values(sub_category)),
        ("vibes", _values(vibes)),
        ("dna_tags", _values(dna_tags)),
        (
            "activity_metadata",
            tuple(
                value
                for field in ("activity_tags", "experience_tags", "activities")
                for value in _values(metadata.get(field))
            ),
        ),
    )
    keys: dict[str, None] = {}
    for source_name, values in sources:
        for value in values:
            normalized = normalize_key(value)
            if normalized is None:
                continue
            if source_name == "activity_metadata" and normalized in ACTIVITY_NAMES:
                keys[normalized] = None
                continue
            mapped = None
            if source_name == "vibes":
                mapped = CATEGORY_GATED_VIBE_ACTIVITY_VALUES.get(
                    category_key or "", {}
                ).get(normalized)
            if mapped is None:
                mapped = ACTIVITY_SOURCE_VALUES.get(source_name, {}).get(normalized)
            if mapped:
                for activity_key in mapped:
                    keys[activity_key] = None
            elif unmapped is not None:
                unmapped[f"{source_name}:{normalized}"] += 1
    return tuple(SemanticValue(key, ACTIVITY_NAMES[key]) for key in keys if key in ACTIVITY_NAMES)


def transform_poi(
    source: SourcePOI,
    unmapped_categories: Counter[str] | None = None,
    unmapped_activities: Counter[str] | None = None,
) -> GraphPOI | None:
    poi_id = normalize_text(source.id)
    if poi_id is None:
        return None
    category = normalize_category(source.category_name)
    if category is None and unmapped_categories is not None:
        unmapped_categories[normalize_text(source.category_name) or "<missing>"] += 1
    metadata = source.ai_metadata if isinstance(source.ai_metadata, Mapping) else {}
    activities = normalize_activities(
        source.sub_category,
        source.vibes,
        metadata.get("dna_tags"),
        metadata,
        unmapped_activities,
        category.key if category else None,
    )
    return GraphPOI(
        id=poi_id,
        name=normalize_text(source.name),
        category=category,
        activities=activities,
        location=normalize_location(source.location_key, source.location_name),
        is_local_business=normalize_boolean(source.is_local_business),
        local_business_type=normalize_text(source.local_business_type),
        is_active=normalize_active(source.is_active),
        source_updated_at=normalize_timestamp(source.updated_at),
    )


def _cursor_sort_key(cursor: tuple[str, str]) -> tuple[datetime, str]:
    timestamp = datetime.fromisoformat(cursor[0].replace("Z", "+00:00"))
    return timestamp, cursor[1]


def prepare_import(source_records: Sequence[SourcePOI]) -> ImportPlan:
    records: list[GraphPOI] = []
    skipped_count = 0
    unmapped_categories: Counter[str] = Counter()
    unmapped_activities: Counter[str] = Counter()
    for source in source_records:
        record = transform_poi(source, unmapped_categories, unmapped_activities)
        if record is None:
            skipped_count += 1
        else:
            records.append(record)
    cursors = [(record.source_updated_at, record.id) for record in records if record.source_updated_at]
    max_cursor = max(cursors, key=_cursor_sort_key) if cursors else None
    return ImportPlan(
        records=tuple(records),
        read_count=len(source_records),
        skipped_count=skipped_count,
        unmapped_categories=dict(sorted(unmapped_categories.items())),
        unmapped_activities=dict(sorted(unmapped_activities.items())),
        max_cursor=max_cursor,
    )


@contextmanager
def postgres_read_only_connection() -> Iterator[Any]:
    """Open PostgreSQL directly in a read-only transaction; never use app provider."""
    settings = get_settings()
    if not settings.DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured; a read-only PostgreSQL source is required.")
    connection = psycopg.connect(settings.DATABASE_URL, connect_timeout=10)
    try:
        connection.execute("SET TRANSACTION READ ONLY")
        yield connection
    finally:
        connection.rollback()
        connection.close()


def load_source_pois(
    limit: int | None = None,
    updated_after: tuple[str, str] | None = None,
) -> list[SourcePOI]:
    query = READ_ONLY_SOURCE_QUERY
    params: list[Any] = []
    if updated_after is not None:
        # Re-read the complete boundary timestamp group. This intentionally
        # replays equal-timestamp POIs so a tied row is not skipped by its ID.
        query += " WHERE p.updated_at IS NULL OR p.updated_at >= %s::timestamptz"
        params.append(updated_after[0])
    query += " ORDER BY p.updated_at NULLS FIRST, p.poi_id"
    if limit is not None:
        query += " LIMIT %s"
        params.append(limit)
    with postgres_read_only_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, tuple(params))
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


def _read_graph_counts(transaction: Any) -> tuple[int, int]:
    node_record = transaction.run("MATCH (n) RETURN count(n) AS total").single()
    relationship_record = transaction.run(
        "MATCH ()-[r]->() RETURN count(r) AS total"
    ).single()
    return (
        int(node_record["total"]) if node_record else 0,
        int(relationship_record["total"]) if relationship_record else 0,
    )


def verify_required_constraints(session: Any) -> None:
    existing = session.execute_read(_read_constraint_keys)
    missing = REQUIRED_CONSTRAINTS - existing
    if missing:
        formatted = ", ".join(f"{label}.{prop}" for label, prop in sorted(missing))
        raise RuntimeError(
            f"Required Neo4j uniqueness constraints are missing: {formatted}. "
            "A schema update must be explicitly approved before apply."
        )


def require_empty_graph(session: Any) -> None:
    node_count, relationship_count = session.execute_read(_read_graph_counts)
    if node_count or relationship_count:
        raise RuntimeError(
            "Schema setup requires an empty graph; "
            f"found {node_count} nodes and {relationship_count} relationships."
        )


def apply_schema_only() -> int:
    """Apply schema to an empty target without reading or importing POIs."""
    driver = get_driver()
    if driver is None:
        raise RuntimeError("Neo4j is not configured.")
    try:
        driver.verify_connectivity()
        settings = get_settings()
        with driver.session(database=settings.NEO4J_DATABASE) as session:
            require_empty_graph(session)
            statement_count = apply_schema(session)
            verify_required_constraints(session)
        return statement_count
    finally:
        close_driver()


def _read_sync_checkpoint(transaction: Any) -> dict[str, Any] | None:
    record = transaction.run(
        READ_SYNC_CHECKPOINT_QUERY,
        sync_key=SYNC_STATE_KEY,
    ).single()
    return dict(record) if record else None


def read_sync_checkpoint(session: Any) -> tuple[str, str] | None:
    state = session.execute_read(_read_sync_checkpoint)
    if state is None:
        return None
    updated_at = normalize_timestamp(state.get("last_updated_at"))
    poi_id = normalize_text(state.get("last_poi_id"))
    return (updated_at, poi_id) if updated_at and poi_id else None


def _read_managed_poi_count(transaction: Any) -> int:
    record = transaction.run(
        READ_MANAGED_POI_COUNT_QUERY,
        managed_by=MANAGED_BY,
    ).single()
    return int(record["poi_count"]) if record else 0


def read_managed_poi_count(session: Any) -> int:
    return session.execute_read(_read_managed_poi_count)


def validate_full_snapshot(
    plan: ImportPlan,
    guardrails: FullSyncGuardrails,
    previous_managed_poi_count: int | None = None,
) -> None:
    if plan.read_count == 0:
        raise UnsafeFullSnapshot("The PostgreSQL full snapshot contains no rows.")
    if not plan.records:
        raise UnsafeFullSnapshot(
            "The full snapshot contains no valid POI projection rows."
        )

    skipped_ratio = plan.skipped_count / plan.read_count
    if skipped_ratio > guardrails.max_skipped_ratio:
        raise UnsafeFullSnapshot(
            "Skipped source rows exceed the configured limit "
            f"({skipped_ratio:.1%} > {guardrails.max_skipped_ratio:.1%})."
        )

    unmapped_category_count = sum(plan.unmapped_categories.values())
    unmapped_category_ratio = unmapped_category_count / len(plan.records)
    if unmapped_category_ratio > guardrails.max_unmapped_category_ratio:
        raise UnsafeFullSnapshot(
            "Unmapped or missing categories exceed the configured limit "
            f"({unmapped_category_ratio:.1%} > "
            f"{guardrails.max_unmapped_category_ratio:.1%})."
        )

    missing_location_count = sum(record.location is None for record in plan.records)
    missing_location_ratio = missing_location_count / len(plan.records)
    if missing_location_ratio > guardrails.max_missing_location_ratio:
        raise UnsafeFullSnapshot(
            "Missing or unmapped locations exceed the configured limit "
            f"({missing_location_ratio:.1%} > "
            f"{guardrails.max_missing_location_ratio:.1%})."
        )

    if previous_managed_poi_count:
        drop_count = max(0, previous_managed_poi_count - plan.read_count)
        drop_ratio = drop_count / previous_managed_poi_count
        if drop_ratio > guardrails.max_poi_drop_ratio:
            raise UnsafeFullSnapshot(
                "The source POI count dropped beyond the configured limit "
                f"({drop_ratio:.1%} > {guardrails.max_poi_drop_ratio:.1%}; "
                f"previous={previous_managed_poi_count}, current={plan.read_count})."
            )


def full_sync_count_review_message(
    source_count: int,
    managed_poi_count: int,
    max_poi_drop_ratio: float,
) -> str | None:
    """Explain count drift even when it remains below the hard-stop guard."""
    difference = source_count - managed_poi_count
    if difference == 0:
        return None
    if managed_poi_count <= 0:
        return (
            f"[REVIEW] Source has {source_count} POI rows while the graph has no "
            "managed POI baseline; verify the expected full-sync target."
        )

    ratio = abs(difference) / managed_poi_count
    if difference < 0:
        if ratio > max_poi_drop_ratio:
            return (
                f"[STOP] Source POI count decreased by {-difference} ({ratio:.1%}), "
                f"above the {max_poi_drop_ratio:.1%} full-sync hard-stop guard."
            )
        return (
            f"[REVIEW] Source POI count decreased by {-difference} ({ratio:.1%}), "
            f"within the {max_poi_drop_ratio:.1%} hard-stop limit; explain the "
            "missing IDs before approving full reconciliation."
        )

    return (
        f"[REVIEW] Source has {difference} more POI rows ({ratio:.1%}) than the "
        "managed graph; verify the additions in the audit before full reconciliation."
    )


def expected_relationships(record: GraphPOI) -> set[tuple[str, str]]:
    if not record.is_active:
        return set()
    expected: set[tuple[str, str]] = set()
    if record.category:
        expected.add(("IN_CATEGORY", record.category.key))
    expected.update(("OFFERS_ACTIVITY", activity.key) for activity in record.activities)
    if record.location:
        expected.add(("LOCATED_IN", record.location.key))
    return expected


def _read_existing_relationships(transaction: Any, poi_ids: list[str]) -> list[ExistingRelationship]:
    result = transaction.run(READ_EXISTING_RELATIONSHIPS_QUERY, poi_ids=poi_ids)
    relationships: list[ExistingRelationship] = []
    for row in result:
        relationship_type = row["relationship_type"]
        if relationship_type is None:
            continue
        relationships.append(
            ExistingRelationship(
                poi_id=row["poi_id"],
                relationship_type=relationship_type,
                managed_by=row["managed_by"],
                target_key=row["target_key"],
                target_labels=tuple(row["target_labels"] or []),
            )
        )
    return relationships


def _read_existing_poi_owners(transaction: Any, poi_ids: list[str]) -> list[ExistingPOI]:
    result = transaction.run(READ_EXISTING_POI_OWNERSHIP_QUERY, poi_ids=poi_ids)
    return [
        ExistingPOI(poi_id=row["poi_id"], managed_by=row["managed_by"])
        for row in result
    ]


def _semantic_node_keys(
    records: Sequence[GraphPOI],
    unmanaged_exact: Mapping[str, set[tuple[str, str]]],
) -> dict[str, set[str]]:
    keys: dict[str, set[str]] = {
        "Category": set(),
        "Activity": set(),
        "Location": set(),
    }
    for record in records:
        if not record.is_active:
            continue
        preserved = unmanaged_exact.get(record.id, set())
        if record.category and ("IN_CATEGORY", record.category.key) not in preserved:
            keys["Category"].add(record.category.key)
        keys["Activity"].update(
            activity.key
            for activity in record.activities
            if ("OFFERS_ACTIVITY", activity.key) not in preserved
        )
        if record.location and ("LOCATED_IN", record.location.key) not in preserved:
            keys["Location"].add(record.location.key)
    return keys


def _semantic_node_keys_from_rows(rows: Sequence[Mapping[str, Any]]) -> dict[str, set[str]]:
    keys: dict[str, set[str]] = {
        "Category": set(),
        "Activity": set(),
        "Location": set(),
    }
    for row in rows:
        if not row["is_active"]:
            continue
        category = row.get("category")
        if category:
            keys["Category"].add(category["key"])
        keys["Activity"].update(activity["key"] for activity in row["activities"])
        location = row.get("location")
        if location:
            keys["Location"].add(location["key"])
    return keys


def _read_existing_semantic_owners(
    transaction: Any,
    keys_by_label: Mapping[str, set[str]],
) -> list[ExistingSemanticNode]:
    queries = {
        "Category": READ_EXISTING_CATEGORY_OWNERSHIP_QUERY,
        "Activity": READ_EXISTING_ACTIVITY_OWNERSHIP_QUERY,
        "Location": READ_EXISTING_LOCATION_OWNERSHIP_QUERY,
    }
    existing: list[ExistingSemanticNode] = []
    for label, query in queries.items():
        keys = sorted(keys_by_label.get(label, set()))
        if not keys:
            continue
        for row in transaction.run(query, keys=keys):
            existing.append(
                ExistingSemanticNode(
                    label=label,
                    key=row["key"],
                    managed_by=row["managed_by"],
                )
            )
    return existing


def _validate_semantic_node_owners(existing: Sequence[ExistingSemanticNode]) -> None:
    conflicts = [
        f"{node.label} {node.key}: existing node is managed by {node.managed_by or '<unmanaged>'}."
        for node in existing
        if node.managed_by != MANAGED_BY
    ]
    if conflicts:
        raise LegacySemanticNodeConflict(conflicts)


def preflight_legacy_semantic_nodes(
    session: Any,
    records: Sequence[GraphPOI],
    unmanaged_exact: Mapping[str, set[tuple[str, str]]],
) -> None:
    """Reject category, activity, or location nodes the importer does not own."""
    keys_by_label = _semantic_node_keys(records, unmanaged_exact)
    existing = session.execute_read(_read_existing_semantic_owners, keys_by_label)
    _validate_semantic_node_owners(existing)


def preflight_legacy_poi_nodes(
    session: Any,
    records: Sequence[GraphPOI],
    batch_size: int = BATCH_SIZE,
) -> None:
    """Reject matching POI nodes that this importer does not own."""
    poi_ids = [record.id for record in records]
    existing: list[ExistingPOI] = []
    for start in range(0, len(poi_ids), batch_size):
        existing.extend(
            session.execute_read(
                _read_existing_poi_owners,
                poi_ids[start : start + batch_size],
            )
        )
    conflicts = [
        f"POI {poi.poi_id}: existing node is managed by {poi.managed_by or '<unmanaged>'}."
        for poi in existing
        if poi.managed_by != MANAGED_BY
    ]
    if conflicts:
        raise LegacyPOINodeConflict(conflicts)


def _classify_unmanaged_relationships(
    existing: Sequence[ExistingRelationship],
    expected_by_id: Mapping[str, set[tuple[str, str]]],
) -> dict[str, set[tuple[str, str]]]:
    unmanaged_exact: dict[str, set[tuple[str, str]]] = {}
    conflicts: list[str] = []
    for relationship in existing:
        if relationship.poi_id not in expected_by_id:
            # Inactive POIs keep their existing graph history untouched.
            continue
        if relationship.managed_by == MANAGED_BY:
            continue
        fact = (relationship.relationship_type, relationship.target_key or "")
        expected = expected_by_id[relationship.poi_id]
        expected_label = EXPECTED_TARGET_LABELS[relationship.relationship_type]
        if fact in expected and expected_label in relationship.target_labels:
            unmanaged_exact.setdefault(relationship.poi_id, set()).add(fact)
        else:
            conflicts.append(
                f"POI {relationship.poi_id}: unmanaged {relationship.relationship_type} "
                f"to {relationship.target_key or '<missing key>'} conflicts with the source projection."
            )
    if conflicts:
        raise LegacyRelationshipConflict(conflicts)
    return unmanaged_exact


def preflight_legacy_relationships(
    session: Any,
    records: Sequence[GraphPOI],
    batch_size: int = BATCH_SIZE,
) -> dict[str, set[tuple[str, str]]]:
    """Preserve exact unmanaged facts; reject conflicts without writing."""
    expected_by_id = {record.id: expected_relationships(record) for record in records if record.is_active}
    poi_ids = [record.id for record in records]
    existing: list[ExistingRelationship] = []
    for start in range(0, len(poi_ids), batch_size):
        chunk = poi_ids[start : start + batch_size]
        existing.extend(session.execute_read(_read_existing_relationships, chunk))
    return _classify_unmanaged_relationships(existing, expected_by_id)


def _relationship_params(
    record: GraphPOI,
    sync_id: str,
    unmanaged_exact: set[tuple[str, str]],
) -> dict[str, Any]:
    active = record.is_active
    expected = expected_relationships(record)
    category = record.category.as_params() if active and record.category else None
    if category and ("IN_CATEGORY", category["key"]) in unmanaged_exact:
        category = None
    activities = [activity.as_params() for activity in record.activities] if active else []
    activities = [item for item in activities if ("OFFERS_ACTIVITY", item["key"]) not in unmanaged_exact]
    location = record.location.as_params() if active and record.location else None
    if location and ("LOCATED_IN", location["key"]) in unmanaged_exact:
        location = None
    return {
        "id": record.id,
        "name": record.name,
        "is_local_business": record.is_local_business,
        "local_business_type": record.local_business_type,
        "is_active": active,
        "source_updated_at": record.source_updated_at,
        "sync_id": sync_id,
        "category": category,
        "activities": activities,
        "location": location,
        "unmanaged_exact_relationships": [
            list(fact) for fact in sorted(unmanaged_exact)
        ],
        "expected_relationships": [
            {"type": relationship_type, "target_key": target_key}
            for relationship_type, target_key in sorted(expected)
        ],
    }


def _write_batch(transaction: Any, rows: list[dict[str, Any]], lease_id: str) -> int:
    poi_ids = [row["id"] for row in rows]
    existing_pois = _read_existing_poi_owners(transaction, poi_ids)
    node_conflicts = [
        f"POI {poi.poi_id}: existing node is managed by {poi.managed_by or '<unmanaged>'}."
        for poi in existing_pois
        if poi.managed_by != MANAGED_BY
    ]
    if node_conflicts:
        raise LegacyPOINodeConflict(node_conflicts)

    _validate_semantic_node_owners(
        _read_existing_semantic_owners(
            transaction,
            _semantic_node_keys_from_rows(rows),
        )
    )

    existing_relationships = _read_existing_relationships(transaction, poi_ids)
    expected_by_id = {
        row["id"]: {
            (fact["type"], fact["target_key"])
            for fact in row["expected_relationships"]
        }
        for row in rows
        if row["is_active"]
    }
    current_unmanaged_exact = _classify_unmanaged_relationships(
        existing_relationships,
        expected_by_id,
    )
    baseline_unmanaged_exact = {
        row["id"]: {
            (fact[0], fact[1])
            for fact in row.get("unmanaged_exact_relationships", [])
        }
        for row in rows
    }
    if current_unmanaged_exact != {
        poi_id: facts for poi_id, facts in baseline_unmanaged_exact.items() if facts
    }:
        raise LegacyRelationshipConflict(
            ["Unmanaged relationship facts changed after preflight; rerun the import."]
        )

    active_lease = transaction.run(
        READ_SYNC_LEASE_QUERY,
        sync_key=SYNC_STATE_KEY,
        lease_id=lease_id,
    ).single()
    if active_lease is None:
        raise RuntimeError("Graph sync lease was lost; the batch was not applied.")
    lease = transaction.run(
        RENEW_LEASE_QUERY,
        sync_key=SYNC_STATE_KEY,
        lease_id=lease_id,
        lease_seconds=LEASE_SECONDS,
    ).single()
    if lease is None:
        raise RuntimeError("Graph sync lease was lost; the batch was not applied.")
    upserted = list(
        transaction.run(POI_UPSERT_QUERY, rows=rows, managed_by=MANAGED_BY)
    )
    upserted_ids = {record["id"] for record in upserted}
    if upserted_ids != set(poi_ids):
        missing_ids = sorted(set(poi_ids) - upserted_ids)
        raise LegacyPOINodeConflict(
            [f"POI {poi_id}: node ownership changed while the batch was being prepared." for poi_id in missing_ids]
        )
    active_rows = [row for row in rows if row["is_active"]]
    if active_rows:
        transaction.run(
            RECONCILE_MANAGED_RELATIONSHIPS_QUERY,
            rows=active_rows,
            managed_by=MANAGED_BY,
        ).consume()
    transaction.run(UPSERT_CATEGORY_RELATIONSHIPS_QUERY, rows=rows, managed_by=MANAGED_BY).consume()
    transaction.run(UPSERT_ACTIVITY_RELATIONSHIPS_QUERY, rows=rows, managed_by=MANAGED_BY).consume()
    transaction.run(UPSERT_LOCATION_RELATIONSHIPS_QUERY, rows=rows, managed_by=MANAGED_BY).consume()
    return len(rows)


def import_batches(
    session: Any,
    records: Sequence[GraphPOI],
    batch_size: int,
    sync_id: str,
    lease_id: str,
    unmanaged_exact: Mapping[str, set[tuple[str, str]]],
) -> int:
    imported = 0
    for batch_number, start in enumerate(range(0, len(records), batch_size), start=1):
        batch = [
            _relationship_params(record, sync_id, unmanaged_exact.get(record.id, set()))
            for record in records[start : start + batch_size]
        ]
        try:
            imported += session.execute_write(_write_batch, batch, lease_id)
        except (
            LegacyPOINodeConflict,
            LegacySemanticNodeConflict,
            LegacyRelationshipConflict,
        ):
            raise
        except Exception as error:
            raise BatchImportError(imported, len(batch), batch_number) from error
    return imported


def _acquire_lease(transaction: Any, lease_id: str) -> dict[str, Any] | None:
    record = transaction.run(
        ACQUIRE_LEASE_QUERY,
        sync_key=SYNC_STATE_KEY,
        lease_id=lease_id,
        lease_seconds=LEASE_SECONDS,
    ).single()
    return dict(record) if record else None


def acquire_sync_lease(session: Any, lease_id: str) -> tuple[str, str] | None:
    state = session.execute_write(_acquire_lease, lease_id)
    if state is None:
        raise RuntimeError("Another graph sync is already running; no changes were applied.")
    updated_at = normalize_timestamp(state.get("last_updated_at"))
    poi_id = state.get("last_poi_id")
    return (updated_at, poi_id) if updated_at and poi_id else None


def _renew_sync_lease(transaction: Any, lease_id: str) -> bool:
    record = transaction.run(
        RENEW_LEASE_QUERY,
        sync_key=SYNC_STATE_KEY,
        lease_id=lease_id,
        lease_seconds=LEASE_SECONDS,
    ).single()
    return record is not None


def renew_sync_lease(session: Any, lease_id: str) -> None:
    if not session.execute_write(_renew_sync_lease, lease_id):
        raise RuntimeError("Graph sync lease was lost; no further changes were applied.")


def _complete_sync(
    transaction: Any,
    lease_id: str,
    sync_id: str,
    mode: str,
    cursor: tuple[str, str] | None,
) -> int:
    lease = transaction.run(
        RENEW_LEASE_QUERY,
        sync_key=SYNC_STATE_KEY,
        lease_id=lease_id,
        lease_seconds=LEASE_SECONDS,
    ).single()
    if lease is None:
        raise RuntimeError("Graph sync lease was lost before completion.")
    marked_inactive = 0
    if mode == "full":
        record = transaction.run(
            MARK_MISSING_MANAGED_POIS_INACTIVE_QUERY,
            managed_by=MANAGED_BY,
            sync_id=sync_id,
        ).single()
        marked_inactive = int(record["marked_inactive"]) if record else 0
    completed = transaction.run(
        COMPLETE_SYNC_QUERY,
        sync_key=SYNC_STATE_KEY,
        lease_id=lease_id,
        last_updated_at=cursor[0] if cursor else None,
        last_poi_id=cursor[1] if cursor else None,
        sync_id=sync_id,
    ).single()
    if completed is None:
        raise RuntimeError("Graph sync checkpoint was not committed.")
    return marked_inactive


def complete_sync(
    session: Any,
    lease_id: str,
    sync_id: str,
    mode: str,
    cursor: tuple[str, str] | None,
) -> int:
    return session.execute_write(_complete_sync, lease_id, sync_id, mode, cursor)


def _release_lease(transaction: Any, lease_id: str) -> None:
    transaction.run(
        RELEASE_LEASE_QUERY,
        sync_key=SYNC_STATE_KEY,
        lease_id=lease_id,
    ).consume()


def release_sync_lease(session: Any, lease_id: str) -> None:
    session.execute_write(_release_lease, lease_id)


def _read_consistency_snapshot(
    transaction: Any,
    sync_key: str,
) -> dict[str, Any]:
    pois = [dict(record) for record in transaction.run(READ_AUDIT_POIS_QUERY)]
    node_counts = {
        record["label"]: int(record["node_count"])
        for record in transaction.run(READ_AUDIT_NODE_COUNTS_QUERY)
    }
    relationship_counts = {
        record["relationship_type"]: int(record["relationship_count"])
        for record in transaction.run(READ_AUDIT_RELATIONSHIP_COUNTS_QUERY)
    }
    duplicate_relationships = [
        dict(record)
        for record in transaction.run(READ_AUDIT_DUPLICATE_RELATIONSHIPS_QUERY)
    ]
    orphan_semantic_nodes = {
        record["label"]: int(record["node_count"])
        for record in transaction.run(READ_AUDIT_ORPHAN_SEMANTIC_NODES_QUERY)
    }
    sync_state_record = transaction.run(
        READ_AUDIT_SYNC_STATE_QUERY,
        sync_key=sync_key,
    ).single()
    return {
        "pois": pois,
        "node_counts": node_counts,
        "relationship_counts": relationship_counts,
        "duplicate_relationships": duplicate_relationships,
        "orphan_semantic_nodes": orphan_semantic_nodes,
        "sync_state": dict(sync_state_record) if sync_state_record else {},
    }


def read_consistency_snapshot(session: Any) -> dict[str, Any]:
    return session.execute_read(
        _read_consistency_snapshot,
        SYNC_STATE_KEY,
    )


def build_consistency_report(
    plan: ImportPlan,
    snapshot: Mapping[str, Any],
) -> dict[str, Any]:
    source_by_id = {record.id: record for record in plan.records}
    graph_pois = list(snapshot.get("pois", []))
    graph_by_id = {
        poi_id: row
        for row in graph_pois
        if (poi_id := normalize_text(row.get("id"))) is not None
    }
    source_ids = set(source_by_id)
    graph_ids = set(graph_by_id)
    graph_id_counts = Counter(
        normalized_id
        for row in graph_pois
        if (normalized_id := normalize_text(row.get("id"))) is not None
    )
    duplicate_graph_poi_ids = sorted(
        poi_id for poi_id, count in graph_id_counts.items() if count > 1
    )
    missing_in_graph = sorted(source_ids - graph_ids)
    graph_only_ids = sorted(graph_ids - source_ids)
    managed_graph_only_ids = sorted(
        poi_id
        for poi_id in graph_only_ids
        if graph_by_id[poi_id].get("managed_by") == MANAGED_BY
    )
    legacy_graph_only_ids = sorted(set(graph_only_ids) - set(managed_graph_only_ids))

    field_drift_ids: list[str] = []
    timestamp_mismatch_ids: list[str] = []
    timestamp_regression_ids: list[str] = []
    same_timestamp_semantic_drift_ids: list[str] = []
    missing_relationships: list[tuple[str, str, str]] = []
    stale_managed_relationships: list[tuple[str, str, str]] = []
    semantic_name_mismatches: list[tuple[str, str, str]] = []
    unmanaged_relationships: list[ExistingRelationship] = []
    source_active = sum(record.is_active for record in source_by_id.values())
    source_inactive = len(source_by_id) - source_active
    missing_category_count = sum(
        record.category is None for record in source_by_id.values()
    )
    missing_location_count = sum(
        record.location is None for record in source_by_id.values()
    )
    source_timestamp_counts = Counter(
        record.source_updated_at
        for record in source_by_id.values()
        if record.source_updated_at is not None
    )
    source_timestamp_null_count = sum(
        record.source_updated_at is None for record in source_by_id.values()
    )

    for poi_id in sorted(source_ids & graph_ids):
        source = source_by_id[poi_id]
        graph = graph_by_id[poi_id]
        field_drift = (
            graph.get("name") != source.name
            or graph.get("is_active") != source.is_active
            or graph.get("is_local_business") != source.is_local_business
            or graph.get("local_business_type") != source.local_business_type
        )
        if field_drift:
            field_drift_ids.append(poi_id)

        source_timestamp = normalize_timestamp(source.source_updated_at)
        graph_timestamp = normalize_timestamp(graph.get("source_updated_at"))
        if source_timestamp != graph_timestamp:
            timestamp_mismatch_ids.append(poi_id)
            if (
                source_timestamp is not None
                and graph_timestamp is not None
                and _cursor_sort_key((source_timestamp, poi_id))[0]
                < _cursor_sort_key((graph_timestamp, poi_id))[0]
            ):
                timestamp_regression_ids.append(poi_id)

        relationships = [
            item for item in graph.get("relationships", []) if item is not None
        ]
        existing = [
            ExistingRelationship(
                poi_id=poi_id,
                relationship_type=item["type"],
                managed_by=item.get("managed_by"),
                target_key=item.get("target_key"),
                target_labels=tuple(item.get("target_labels") or ()),
            )
            for item in relationships
            if item.get("type") in EXPECTED_TARGET_LABELS
        ]
        unmanaged_relationships.extend(
            relationship
            for relationship in existing
            if relationship.managed_by != MANAGED_BY
        )

        if not source.is_active:
            continue

        expected = expected_relationships(source)
        actual = {
            (item["type"], item.get("target_key"))
            for item in relationships
            if item.get("type") in EXPECTED_TARGET_LABELS
        }
        missing = expected - actual
        missing_relationships.extend(
            (poi_id, relationship_type, target_key)
            for relationship_type, target_key in sorted(missing)
        )
        stale = {
            (item["type"], item.get("target_key"))
            for item in relationships
            if item.get("managed_by") == MANAGED_BY
            and item.get("type") in EXPECTED_TARGET_LABELS
        } - expected
        stale_managed_relationships.extend(
            (poi_id, relationship_type, target_key or "")
            for relationship_type, target_key in sorted(stale)
        )

        expected_names: dict[tuple[str, str], str] = {}
        if source.category:
            expected_names[("IN_CATEGORY", source.category.key)] = source.category.name
        expected_names.update(
            {
                ("OFFERS_ACTIVITY", activity.key): activity.name
                for activity in source.activities
            }
        )
        if source.location:
            expected_names[("LOCATED_IN", source.location.key)] = source.location.name
        for item in relationships:
            fact = (item.get("type"), item.get("target_key"))
            expected_name = expected_names.get(fact)
            if expected_name and item.get("target_name") != expected_name:
                semantic_name_mismatches.append(
                    (poi_id, str(fact[0]), str(fact[1]))
                )

        semantic_drift = bool(
            field_drift
            or missing
            or stale
            or any(row[0] == poi_id for row in semantic_name_mismatches)
        )
        if source_timestamp == graph_timestamp and semantic_drift:
            same_timestamp_semantic_drift_ids.append(poi_id)

    expected_active_relationships = {
        record.id: expected_relationships(record)
        for record in source_by_id.values()
        if record.is_active
    }
    legacy_relationship_conflicts: list[str] = []
    try:
        _classify_unmanaged_relationships(
            unmanaged_relationships,
            expected_active_relationships,
        )
    except LegacyRelationshipConflict as error:
        legacy_relationship_conflicts = error.conflicts

    graph_active = sum(row.get("is_active") is True for row in graph_pois)
    graph_inactive = sum(row.get("is_active") is False for row in graph_pois)
    managed_poi_count = sum(
        row.get("managed_by") == MANAGED_BY for row in graph_pois
    )
    inactive_managed_relationship_count = sum(
        1
        for poi in graph_pois
        if poi.get("is_active") is False
        for relationship in poi.get("relationships", [])
        if relationship and relationship.get("managed_by") == MANAGED_BY
    )
    return {
        "source_rows": plan.read_count,
        "source_prepared": len(plan.records),
        "source_active": source_active,
        "source_inactive": source_inactive,
        "source_skipped": plan.skipped_count,
        "source_missing_category": missing_category_count,
        "source_missing_location": missing_location_count,
        "source_unmapped_categories": dict(plan.unmapped_categories),
        "source_unmapped_activities": dict(plan.unmapped_activities),
        "source_updated_at_null_count": source_timestamp_null_count,
        "source_updated_at_distinct_count": len(source_timestamp_counts),
        "source_max_same_timestamp_count": max(source_timestamp_counts.values(), default=0),
        "graph_poi_count": len(graph_pois),
        "graph_active": graph_active,
        "graph_inactive": graph_inactive,
        "graph_managed_poi_count": managed_poi_count,
        "graph_duplicate_poi_ids": duplicate_graph_poi_ids,
        "source_ids_missing_in_graph": missing_in_graph,
        "managed_graph_only_ids": managed_graph_only_ids,
        "legacy_graph_only_ids": legacy_graph_only_ids,
        "field_drift_ids": field_drift_ids,
        "source_updated_at_mismatch_ids": timestamp_mismatch_ids,
        "source_updated_at_regression_ids": timestamp_regression_ids,
        "same_timestamp_semantic_drift_ids": same_timestamp_semantic_drift_ids,
        "inactive_poi_managed_relationship_count": inactive_managed_relationship_count,
        "missing_relationships": missing_relationships,
        "stale_managed_relationships": stale_managed_relationships,
        "semantic_name_mismatches": semantic_name_mismatches,
        "legacy_relationship_conflicts": legacy_relationship_conflicts,
        "duplicate_relationships": list(snapshot.get("duplicate_relationships", [])),
        "node_counts": dict(snapshot.get("node_counts", {})),
        "relationship_counts": dict(snapshot.get("relationship_counts", {})),
        "orphan_semantic_nodes": dict(snapshot.get("orphan_semantic_nodes", {})),
        "sync_state": dict(snapshot.get("sync_state", {})),
    }


def print_consistency_report(
    report: Mapping[str, Any],
    guardrails: FullSyncGuardrails | None = None,
) -> None:
    active_guardrails = guardrails or FullSyncGuardrails()
    state = report["sync_state"]
    lease_id = state.get("lease_id")
    lease_until = normalize_timestamp(state.get("lease_until"))
    lease_status = "not held"
    if lease_id:
        lease_expiry = (
            datetime.fromisoformat(lease_until.replace("Z", "+00:00"))
            if lease_until
            else None
        )
        lease_status = (
            "active"
            if lease_expiry and lease_expiry > datetime.now(timezone.utc)
            else "expired or invalid"
        )
    print("GreenTrip Knowledge Graph Consistency Report (READ ONLY)")
    print(
        "PostgreSQL POIs: "
        f"source={report['source_rows']}, prepared={report['source_prepared']}, "
        f"active={report['source_active']}, inactive={report['source_inactive']}, "
        f"skipped={report['source_skipped']}"
    )
    print(
        "Neo4j POIs: "
        f"total={report['graph_poi_count']}, managed={report['graph_managed_poi_count']}, "
        f"active={report['graph_active']}, inactive={report['graph_inactive']}"
    )
    print(
        "ID comparison: "
        f"missing in Neo4j={len(report['source_ids_missing_in_graph'])}, "
        f"managed only in Neo4j={len(report['managed_graph_only_ids'])}, "
        f"other graph-only={len(report['legacy_graph_only_ids'])}"
    )
    count_review = full_sync_count_review_message(
        int(report["source_rows"]),
        int(report["graph_managed_poi_count"]),
        active_guardrails.max_poi_drop_ratio,
    )
    if count_review:
        print(count_review)
    print(
        "POI drift: "
        f"fields={len(report['field_drift_ids'])}, "
        f"source_updated_at={len(report['source_updated_at_mismatch_ids'])}, "
        f"timestamp regressions={len(report['source_updated_at_regression_ids'])}, "
        f"semantic drift with same timestamp="
        f"{len(report['same_timestamp_semantic_drift_ids'])}"
    )
    print(
        "Relationships: "
        f"missing active facts={len(report['missing_relationships'])}, "
        f"stale managed={len(report['stale_managed_relationships'])}, "
        f"managed facts on inactive POIs="
        f"{report['inactive_poi_managed_relationship_count']}, "
        f"legacy conflicts={len(report['legacy_relationship_conflicts'])}, "
        f"duplicate groups={len(report['duplicate_relationships'])}"
    )
    print(
        "Source mapping gaps: "
        f"missing/unmapped category={report['source_missing_category']}, "
        f"missing/unmapped location={report['source_missing_location']}, "
        f"unmapped category values={len(report['source_unmapped_categories'])}, "
        f"unmapped activity values={len(report['source_unmapped_activities'])}"
    )
    print(
        "Source timestamp profile: "
        f"null={report['source_updated_at_null_count']}, "
        f"distinct={report['source_updated_at_distinct_count']}, "
        f"largest equal-timestamp group={report['source_max_same_timestamp_count']}"
    )
    print(
        "POI ID duplicates: "
        f"Neo4j={len(report['graph_duplicate_poi_ids'])}; "
        f"sample={report['graph_duplicate_poi_ids'][:10]}"
    )
    print(f"Neo4j node counts: {report['node_counts']}")
    print(f"Neo4j relationship counts: {report['relationship_counts']}")
    print(f"Unreferenced semantic nodes: {report['orphan_semantic_nodes']}")
    print(
        "GraphSyncState: "
        f"cursor=({state.get('last_updated_at')}, {state.get('last_poi_id')}), "
        f"last_completed_sync_id={state.get('last_completed_sync_id')}, "
        f"last_completed_at={state.get('last_completed_at')}, lease={lease_status}"
    )
    consistency_drift = any(
        (
            report["source_ids_missing_in_graph"],
            report["managed_graph_only_ids"],
            report["legacy_graph_only_ids"],
            report["field_drift_ids"],
            report["source_updated_at_mismatch_ids"],
            report["source_updated_at_regression_ids"],
            report["same_timestamp_semantic_drift_ids"],
            report["missing_relationships"],
            report["stale_managed_relationships"],
            report["semantic_name_mismatches"],
            report["duplicate_relationships"],
            report["graph_duplicate_poi_ids"],
            report["orphan_semantic_nodes"],
            report["inactive_poi_managed_relationship_count"],
        )
    )
    if consistency_drift:
        print(
            "[REVIEW] Non-zero consistency differences are present; inspect the "
            "IDs and relationship details before approving full reconciliation."
        )
    if report["legacy_relationship_conflicts"]:
        print(
            "[STOP] Unmanaged legacy relationship conflicts are present; the "
            "full apply preflight will refuse to continue."
        )
    if lease_status == "active":
        print("[STOP] A graph sync lease is active; do not start another sync.")
    if report["same_timestamp_semantic_drift_ids"]:
        print(
            "WARNING: Source semantics differ while updated_at matches for "
            f"{report['same_timestamp_semantic_drift_ids'][:10]}."
        )
    if report["source_updated_at_regression_ids"]:
        print(
            "WARNING: Source updated_at is older than the imported graph value for "
            f"{report['source_updated_at_regression_ids'][:10]}. "
            "Incremental cursor sync can miss these rows; review before syncing."
        )
    if report["source_skipped"]:
        print(
            "[REVIEW] Source rows were skipped even though the skipped-row hard-stop "
            f"guard passed: {report['source_skipped']}."
        )
    if report["source_missing_category"]:
        print(
            "[REVIEW] Some prepared POIs have missing or unmapped categories: "
            f"{report['source_missing_category']}."
        )
    if report["source_missing_location"]:
        print(
            "[REVIEW] Some prepared POIs have missing or unmapped locations: "
            f"{report['source_missing_location']}."
        )
    if report["source_unmapped_categories"]:
        print(
            "Unmapped category source values: "
            f"{dict(list(report['source_unmapped_categories'].items())[:10])}"
        )
    if report["source_unmapped_activities"]:
        print(
            "Unmapped activity source values: "
            f"{dict(list(report['source_unmapped_activities'].items())[:10])}"
        )
        print(
            "[REVIEW] Unmapped activity values are outside the whitelist and do not "
            "create relationships; review them separately from the full-sync hard guards."
        )
    if report["source_ids_missing_in_graph"]:
        print(
            "Sample source IDs missing in Neo4j: "
            f"{report['source_ids_missing_in_graph'][:10]}"
        )
    if report["legacy_relationship_conflicts"]:
        print(
            "Sample unmanaged relationship conflicts: "
            f"{report['legacy_relationship_conflicts'][:10]}"
        )


def print_summary(
    plan: ImportPlan,
    imported_count: int,
    status: str,
    marked_inactive: int = 0,
) -> None:
    unmapped_sample = sorted(
        plan.unmapped_activities.items(), key=lambda item: (-item[1], item[0])
    )[:30]
    print("GreenTrip Neo4j POI Graph Builder")
    print(f"Source rows read: {plan.read_count}")
    print(f"POIs prepared: {len(plan.records)}")
    print(f"POIs active: {plan.active_count}")
    print(f"POIs inactive: {plan.inactive_count}")
    print(f"POIs skipped (missing ID): {plan.skipped_count}")
    print(f"Categories mapped: {plan.category_count}")
    print(
        "Category keys expected: "
        f"{sorted({record.category.key for record in plan.records if record.is_active and record.category})}"
    )
    print(f"Activity types mapped: {plan.activity_count}")
    print(
        "Activity keys expected: "
        f"{sorted({activity.key for record in plan.records if record.is_active for activity in record.activities})}"
    )
    print(f"POIs with mapped activities: {plan.poi_activity_count}")
    print(f"Activity relationships planned: {plan.activity_relationship_count}")
    print(f"Locations mapped: {plan.location_count}")
    print(f"Relationships planned: {plan.relationship_count}")
    print(f"Planned node counts by label: {plan.planned_node_counts_by_label}")
    print(
        "Planned relationship counts by type: "
        f"{plan.planned_relationship_counts_by_type}"
    )
    if status.startswith("DRY RUN"):
        print("Neo4j legacy-conflict preflight: not run by PostgreSQL-only dry-run.")
    print(f"POIs imported/merged: {imported_count}")
    print(f"Managed POIs marked inactive (full sync): {marked_inactive}")
    print(f"Unmapped categories: {dict(plan.unmapped_categories)}")
    print(
        "Unmapped activity candidates from source tags: "
        f"{sum(plan.unmapped_activities.values())} occurrences across "
        f"{len(plan.unmapped_activities)} distinct values; first 30: "
        f"{dict(unmapped_sample)}"
    )
    print(f"Import status: {status}")


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("value must be at least 1")
    return parsed


def ratio(value: str) -> float:
    try:
        parsed = float(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("ratio must be a number from 0 to 1") from error
    if not 0 <= parsed <= 1:
        raise argparse.ArgumentTypeError("ratio must be a number from 0 to 1")
    return parsed


def parse_since(value: str) -> tuple[str, str]:
    normalized = normalize_timestamp(value)
    if normalized is None:
        raise argparse.ArgumentTypeError("timestamp must be ISO-8601")
    return normalized, ""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Prepare a PostgreSQL POI semantic projection for Neo4j."
    )
    execution = parser.add_mutually_exclusive_group()
    execution.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyze PostgreSQL data only (the default); never connect to Neo4j.",
    )
    execution.add_argument(
        "--apply",
        action="store_true",
        help="Write the prepared projection to Neo4j. Requires separate Phase 3 approval.",
    )
    execution.add_argument(
        "--audit",
        action="store_true",
        help="Compare PostgreSQL and Neo4j using read-only queries only.",
    )
    execution.add_argument(
        "--apply-schema-only",
        action="store_true",
        help="Apply schema.cypher to an empty Neo4j database without importing POIs.",
    )
    parser.add_argument("--mode", choices=("full", "incremental"), default="full")
    parser.add_argument(
        "--since",
        type=parse_since,
        help="Incremental cursor for a dry run; ISO-8601 timestamp.",
    )
    parser.add_argument(
        "--limit",
        type=positive_int,
        help="Limit source rows for dry-run development checks; prohibited with --apply.",
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
        help="Apply schema.cypher before import; explicit --apply is also required.",
    )
    parser.add_argument(
        "--max-skipped-ratio",
        type=ratio,
        default=DEFAULT_MAX_SKIPPED_RATIO,
        help=f"Full-sync guard limit for skipped rows (default: {DEFAULT_MAX_SKIPPED_RATIO:.0%}).",
    )
    parser.add_argument(
        "--max-poi-drop-ratio",
        type=ratio,
        default=DEFAULT_MAX_POI_DROP_RATIO,
        help=(
            "Full-sync guard limit for source row loss relative to current "
            f"managed graph (default: {DEFAULT_MAX_POI_DROP_RATIO:.0%})."
        ),
    )
    parser.add_argument(
        "--max-unmapped-category-ratio",
        type=ratio,
        default=DEFAULT_MAX_UNMAPPED_CATEGORY_RATIO,
        help=(
            "Full-sync guard limit for missing/unmapped categories "
            f"(default: {DEFAULT_MAX_UNMAPPED_CATEGORY_RATIO:.0%})."
        ),
    )
    parser.add_argument(
        "--max-missing-location-ratio",
        type=ratio,
        default=DEFAULT_MAX_MISSING_LOCATION_RATIO,
        help=(
            "Full-sync guard limit for missing/unmapped locations "
            f"(default: {DEFAULT_MAX_MISSING_LOCATION_RATIO:.0%})."
        ),
    )
    return parser


def _validate_args(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    if args.apply_schema and not args.apply:
        parser.error("--apply-schema requires explicit --apply")
    if args.apply_schema_only and args.apply_schema:
        parser.error("--apply-schema-only cannot be combined with --apply-schema")
    if args.apply_schema_only and (args.limit is not None or args.since is not None or args.mode != "full"):
        parser.error("--apply-schema-only cannot be combined with source-selection options")
    if args.limit is not None and args.apply:
        parser.error("--limit is only available in dry-run mode")
    if args.mode == "full" and args.since is not None:
        parser.error("--since can only be used with --mode incremental")
    if args.apply and args.since is not None:
        parser.error("--since cannot be used with --apply; apply uses the saved checkpoint")
    if args.audit and (
        args.limit is not None or args.since is not None or args.mode != "full"
    ):
        parser.error("--audit requires a full source snapshot and accepts no --limit or --since")
    if args.apply_schema_only and args.audit:
        parser.error("--audit cannot be combined with --apply-schema-only")
    if args.mode == "incremental" and not args.apply and args.since is None:
        parser.error("incremental dry-run requires --since; it never reads the Neo4j checkpoint")


def _guardrails_from_args(args: argparse.Namespace) -> FullSyncGuardrails:
    return FullSyncGuardrails(
        max_skipped_ratio=args.max_skipped_ratio,
        max_poi_drop_ratio=args.max_poi_drop_ratio,
        max_unmapped_category_ratio=args.max_unmapped_category_ratio,
        max_missing_location_ratio=args.max_missing_location_ratio,
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    _validate_args(parser, args)
    guardrails = _guardrails_from_args(args)

    if args.apply_schema_only:
        try:
            statement_count = apply_schema_only()
        except Exception:
            print("[ERROR] Neo4j schema-only operation failed; no POI import was attempted.", file=sys.stderr)
            return 1
        print(f"Neo4j schema statements applied: {statement_count}")
        print("POIs imported/merged: 0")
        print("Import status: SCHEMA ONLY - NO POI IMPORT")
        return 0

    if args.audit:
        driver = None
        try:
            plan = prepare_import(load_source_pois())
            validate_full_snapshot(plan, guardrails)
            driver = get_driver()
            if driver is None:
                print("[ERROR] Neo4j is not configured.", file=sys.stderr)
                return 1
            driver.verify_connectivity()
            settings = get_settings()
            with driver.session(database=settings.NEO4J_DATABASE) as session:
                snapshot = read_consistency_snapshot(session)
            report = build_consistency_report(plan, snapshot)
            print_consistency_report(report, guardrails)
            return 0
        except UnsafeFullSnapshot as error:
            print(f"[ERROR] Read-only audit stopped: {error}", file=sys.stderr)
            return 1
        except (OSError, RuntimeError, psycopg.Error):
            print("[ERROR] Read-only consistency audit could not complete.", file=sys.stderr)
            return 1
        except Exception:
            print("[ERROR] Neo4j read-only consistency audit failed.", file=sys.stderr)
            return 1
        finally:
            if driver is not None:
                close_driver()

    if not args.apply:
        try:
            plan = prepare_import(load_source_pois(args.limit, args.since))
            if args.mode == "full":
                validate_full_snapshot(plan, guardrails)
        except UnsafeFullSnapshot as error:
            print(f"[ERROR] Dry-run blocked by full-sync guard: {error}", file=sys.stderr)
            return 1
        except (OSError, RuntimeError, psycopg.Error):
            print("[ERROR] Unable to read PostgreSQL in read-only mode.", file=sys.stderr)
            return 1
        print_summary(plan, imported_count=0, status="DRY RUN - NO DATABASE WRITES")
        return 0

    driver = None
    lease_id = str(uuid4())
    lease_acquired = False
    sync_id = str(uuid4())
    previous_managed_poi_count: int | None = None
    try:
        driver = get_driver()
        if driver is None:
            print("[ERROR] Neo4j is not configured.", file=sys.stderr)
            return 1
        settings = get_settings()
        driver.verify_connectivity()
        with driver.session(database=settings.NEO4J_DATABASE) as session:
            if args.apply_schema:
                read_schema_statements()
                require_empty_graph(session)
            else:
                verify_required_constraints(session)

            checkpoint_before = (
                read_sync_checkpoint(session) if args.mode == "incremental" else None
            )
            if args.mode == "incremental" and checkpoint_before is None:
                raise RuntimeError("No completed full-sync checkpoint exists; run a full sync first.")
            source_cursor = checkpoint_before
            plan = prepare_import(load_source_pois(updated_after=source_cursor))
            if args.mode == "full":
                previous_managed_poi_count = read_managed_poi_count(session)
                count_review = full_sync_count_review_message(
                    plan.read_count,
                    previous_managed_poi_count,
                    guardrails.max_poi_drop_ratio,
                )
                if count_review:
                    print(count_review, file=sys.stderr)
                validate_full_snapshot(
                    plan,
                    guardrails,
                    previous_managed_poi_count,
                )

            preflight_legacy_poi_nodes(session, plan.records)
            unmanaged_exact = preflight_legacy_relationships(session, plan.records)
            preflight_legacy_semantic_nodes(session, plan.records, unmanaged_exact)

            if args.apply_schema:
                apply_schema(session)
                verify_required_constraints(session)

            checkpoint_after = acquire_sync_lease(session, lease_id)
            lease_acquired = True
            if args.mode == "incremental" and checkpoint_after != checkpoint_before:
                raise RuntimeError("The graph checkpoint changed during preflight; rerun the sync.")
            if args.mode == "full":
                current_managed_poi_count = read_managed_poi_count(session)
                if current_managed_poi_count != previous_managed_poi_count:
                    count_review = full_sync_count_review_message(
                        plan.read_count,
                        current_managed_poi_count,
                        guardrails.max_poi_drop_ratio,
                    )
                    if count_review:
                        print(
                            "[RECHECK] " + count_review,
                            file=sys.stderr,
                        )
                validate_full_snapshot(
                    plan,
                    guardrails,
                    current_managed_poi_count,
                )

            verify_required_constraints(session)
            preflight_legacy_poi_nodes(session, plan.records)
            unmanaged_exact = preflight_legacy_relationships(session, plan.records)
            preflight_legacy_semantic_nodes(session, plan.records, unmanaged_exact)
            imported_count = import_batches(
                session,
                plan.records,
                args.batch_size,
                sync_id,
                lease_id,
                unmanaged_exact,
            )
            final_cursor = (
                plan.max_cursor
                if args.mode == "full"
                else plan.max_cursor or checkpoint_after
            )
            marked_inactive = complete_sync(session, lease_id, sync_id, args.mode, final_cursor)
            lease_acquired = False
    except (
        LegacyPOINodeConflict,
        LegacySemanticNodeConflict,
        LegacyRelationshipConflict,
    ) as error:
        print("[ERROR] Import stopped because unmanaged graph data conflicts with the source projection.", file=sys.stderr)
        for conflict in error.conflicts[:20]:
            print(f"  {conflict}", file=sys.stderr)
        return 1
    except BatchImportError as error:
        print("[ERROR] Neo4j batch failed; the completion checkpoint was not advanced.", file=sys.stderr)
        print(f"POIs in earlier successful batches: {error.completed_count}", file=sys.stderr)
        print(f"POIs in failed batch {error.batch_number}: {error.failed_count}", file=sys.stderr)
        print("Earlier batches may have committed; rerun is idempotent.", file=sys.stderr)
        return 1
    except UnsafeFullSnapshot as error:
        print(f"[ERROR] Full sync stopped by safety guard: {error}", file=sys.stderr)
        return 1
    except Exception:
        print("[ERROR] Neo4j graph sync failed; the checkpoint was not advanced.", file=sys.stderr)
        return 1
    finally:
        if driver is not None:
            if lease_acquired:
                try:
                    settings = get_settings()
                    with driver.session(database=settings.NEO4J_DATABASE) as session:
                        release_sync_lease(session, lease_id)
                except Exception:
                    pass
            close_driver()

    print_summary(plan, imported_count, status="SUCCESS", marked_inactive=marked_inactive)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
