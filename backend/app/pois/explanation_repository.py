import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from neo4j import READ_ACCESS
from psycopg import connect

from app.cache import poi_cache
from app.config import get_settings
from app.db.neo4j import get_driver
from app.db.neo4j import get_driver, is_neo4j_in_cooldown, mark_neo4j_unavailable
from app.db.postgres import get_connection

logger = logging.getLogger(__name__)

QUERY_PATH = (
    Path(__file__).resolve().parents[2]
    / "neo4j"
    / "queries"
    / "get_poi_explanation_facts.cypher"
)
LOCAL_AUTHENTIC_QUERY_PATH = (
    Path(__file__).resolve().parents[2]
    / "neo4j"
    / "queries"
    / "get_local_authentic_pois.cypher"
)
try:
    EXPLANATION_QUERY = QUERY_PATH.read_text(encoding="utf-8")
except Exception:
    EXPLANATION_QUERY = ""
try:
    LOCAL_AUTHENTIC_QUERY = LOCAL_AUTHENTIC_QUERY_PATH.read_text(encoding="utf-8")
except Exception:
    LOCAL_AUTHENTIC_QUERY = ""


@dataclass(frozen=True)
class _RelationalLookup:
    status: Literal["found", "not_found", "unavailable"]
    payload: dict[str, Any] | None = None


class ExplanationRepositoryUnavailable(Exception):
    """Raised when no source can verify or provide explanation facts."""


def _fetch_from_relational_db(poi_id: str) -> _RelationalLookup:
    """Read current POI status and observed fields in a read-only transaction."""
    clean_id = str(poi_id).strip()
    database_url = get_settings().DATABASE_URL.strip()
    if not database_url:
        return _RelationalLookup("unavailable")

    conn = None
    try:
        conn = connect(
            database_url,
            connect_timeout=3,
            options="-c default_transaction_read_only=on",
        )
        with conn.cursor() as cur:
            cur.execute("""
                SELECT p.poi_id, p.name, p.is_active, p.is_local_business, p.local_business_type,
                       pc.category_id::text as category_key, pc.name as category_name,
                       c.name as city_name, c.code as city_code
                FROM public.pois p
                LEFT JOIN public.poi_categories pc ON pc.category_id = p.category_id
                LEFT JOIN public.cities c ON c.city_id = p.city_id
                WHERE p.poi_id::text = %s
                LIMIT 1
            """, (clean_id,))
            row = cur.fetchone()
    except Exception:
        logger.warning("PostgreSQL read-only explanation lookup failed.")
        return _RelationalLookup("unavailable")
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                logger.warning("PostgreSQL explanation connection could not be closed cleanly.")

    if row is None:
        return _RelationalLookup("not_found")

    db_poi_id, name, is_active, is_local, btype, category_key, cat_name, city_name, city_code = row
    if is_active is False:
        return _RelationalLookup("not_found")

    return _RelationalLookup(
        "found",
        _build_facts_payload(
            poi_id=str(db_poi_id or clean_id),
            name=name,
            is_local=is_local,
            btype=btype,
            category_key=category_key,
            cat_name=cat_name,
            city_name=city_name,
            city_code=city_code,
            fact_source="POSTGRESQL_FALLBACK",
        ),
    )


def _fetch_from_csv_fallback(poi_id: str) -> dict[str, Any] | None:
    """Return exact-ID facts from a local snapshot without treating it as authoritative."""
    try:
        from app.recommendations.repository import _load_pois_from_csv

        csv_pois = _load_pois_from_csv()
        found = next(
            (
                p for p in csv_pois
                if str(p.get("poi_id")) == poi_id
                and str(p.get("is_active", True)).strip().casefold() not in {"false", "0", "no"}
            ),
            None,
        )
        if found:
            return _build_facts_payload(
                poi_id=poi_id,
                name=found.get("name"),
                is_local=found.get("is_local_business"),
                btype=found.get("local_business_type"),
                category_key=found.get("category_id"),
                cat_name=found.get("category_name"),
                city_name=found.get("city_name"),
                city_code=found.get("city_code"),
                fact_source="CSV_FALLBACK",
            )
    except Exception:
        logger.warning("CSV explanation fallback lookup failed.")

    return None


def compute_green_score_pillars(
    name: str,
    cat_name: str | None,
    is_local: Any,
    green: Any,
    eco_features: list[str] | None = None,
    popularity_score: float | None = None,
) -> list[dict[str, Any]]:
    """Compute 4-pillar MCDA Green Score breakdown consistent with enrich_poi_scores.py."""
    raw_green = float(green) if green is not None else 0.8
    total_100 = int(round(raw_green * 100 if raw_green <= 1.0 else raw_green))
    total_100 = max(40, min(98, total_100))

    text = f"{(name or '').lower()} {(cat_name or '').lower()}"
    feats = [str(f).lower() for f in (eco_features or [])]

    nature = min(98, max(50, total_100 + (6 if any(k in text for k in ("cảnh quan", "biển", "rừng", "sơn trà", "đầm", "vườn", "sinh thái")) else -4)))
    community = min(98, max(55, (90 if is_local else 68) + (6 if any(k in text for k in ("làng", "di tích", "chùa", "cố đô", "bản địa")) else 0)))
    ops = min(98, max(55, total_100 + (8 if ("chay" in text or "vegan" in text or len(feats) > 0) else -3)))
    low_crowd_bonus = 6 if (popularity_score is not None and float(popularity_score) <= 3.65) else 0
    transit = min(98, max(55, total_100 + low_crowd_bonus - 2))

    return [
        {"key": "nature_env", "label": "Môi trường & Sinh thái", "weight_pct": 40, "score": nature},
        {"key": "heritage_community", "label": "Cộng đồng & Di sản bản địa", "weight_pct": 25, "score": community},
        {"key": "green_ops", "label": "Vận hành xanh & Ít rác thải", "weight_pct": 20, "score": ops},
        {"key": "green_transit", "label": "Dễ đi bộ & Giao thông xanh", "weight_pct": 15, "score": transit},
    ]


def _build_facts_payload(
    poi_id: str,
    name: str | None,
    is_local: Any,
    btype: Any,
    category_key: Any,
    cat_name: Any,
    city_name: Any,
    city_code: Any,
    fact_source: str,
) -> dict[str, Any]:
    facts: list[dict[str, Any]] = []
    if cat_name:
        facts.append({
            "relationship": "IN_CATEGORY",
            "target_type": "Category",
            "target_key": str(category_key or cat_name),
            "target_name": str(cat_name),
        })
    if city_name:
        facts.append({
            "relationship": "LOCATED_IN",
            "target_type": "Location",
            "target_key": str(city_code or city_name),
            "target_name": str(city_name),
        })

    return {
        "poi": {
            "id": poi_id,
            "name": name,
            "is_local_business": is_local,
            "local_business_type": btype,
            "source": None,
        },
        "facts": facts,
        "fact_source": fact_source,
    }


def fetch_local_authentic_poi_ids() -> set[str]:
    """Lấy danh sách POI bản địa từ Neo4j Knowledge Graph (tự fallback set rỗng khi offline)."""
    cache_key = "pois:neo4j:local_authentic_ids"
    cached = poi_cache.get_json(cache_key)
    if isinstance(cached, list):
        return {str(item) for item in cached if item is not None}

    if is_neo4j_in_cooldown():
        return set()

    driver = None if is_neo4j_in_cooldown() else get_driver()
    if driver is None or not LOCAL_AUTHENTIC_QUERY:
        return set()

    try:
        settings = get_settings()
        with driver.session(
            database=settings.NEO4J_DATABASE,
            default_access_mode=READ_ACCESS,
        ) as session:
            records = session.run(LOCAL_AUTHENTIC_QUERY)
            poi_ids = {str(rec["id"]) for rec in records if rec.get("id") is not None}
        poi_cache.set_json(cache_key, sorted(poi_ids), ttl_seconds=300)
        return poi_ids
    except Exception as exc:
        mark_neo4j_unavailable()
        logger.warning("Neo4j local authentic lookup failed, activating cooldown fallback: %s", exc)
        return set()


def fetch_poi_explanation_facts(poi_id: str) -> dict[str, Any] | None:
    clean_id = str(poi_id).strip()
    try:
        driver = get_driver()
        if driver is not None and EXPLANATION_QUERY:
            settings = get_settings()
            with driver.session(
                database=settings.NEO4J_DATABASE,
                default_access_mode=READ_ACCESS,
            ) as session:
                record = session.run(EXPLANATION_QUERY, poi_id=clean_id).single()
            if record is not None:
                return {
                    "poi": dict(record["poi"]),
                    "facts": [dict(fact) for fact in record["facts"]],
                    "fact_source": "NEO4J",
                }
    except Exception:
         mark_neo4j_unavailable()
         logger.warning(
             "Neo4j explanation lookup failed; "
              "trying available read-only fallbacks."
        )
    relational = _fetch_from_relational_db(clean_id)
    # A missing graph row is not proof of absence; only PostgreSQL can confirm 404.
    if relational.status == "not_found":
        return None
    if relational.status == "found":
        return relational.payload

    csv_payload = _fetch_from_csv_fallback(clean_id)
    if csv_payload is not None:
        return csv_payload

    raise ExplanationRepositoryUnavailable
