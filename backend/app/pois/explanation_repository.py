import logging
from pathlib import Path
from typing import Any

from neo4j import READ_ACCESS

from app.config import get_settings
from app.db.neo4j import get_driver
from app.db.postgres import get_connection

logger = logging.getLogger(__name__)

QUERY_PATH = (
    Path(__file__).resolve().parents[2]
    / "neo4j"
    / "queries"
    / "get_poi_explanation_facts.cypher"
)
try:
    EXPLANATION_QUERY = QUERY_PATH.read_text(encoding="utf-8")
except Exception:
    EXPLANATION_QUERY = ""


def _fetch_from_relational_db(poi_id: str) -> dict[str, Any] | None:
    """Project Knowledge Graph explanation facts from PostgreSQL / Supabase or CSV."""
    # 1. Try relational database query
    clean_id = str(poi_id).strip()
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT p.poi_id, p.name, p.is_local_business, p.local_business_type,
                       pc.name as category_name, c.name as city_name, c.code as city_code,
                       p.sub_category, p.green_score
                FROM public.pois p
                LEFT JOIN public.poi_categories pc ON pc.category_id = p.category_id
                LEFT JOIN public.cities c ON c.city_id = p.city_id
                WHERE p.poi_id::text = %s 
                   OR p.name = %s
                   OR p.name ILIKE %s || '%%'
                   OR %s ILIKE p.name || '%%'
                   OR p.name ILIKE '%%' || %s || '%%'
                ORDER BY
                  CASE
                    WHEN p.poi_id::text = %s THEN 1
                    WHEN p.name = %s THEN 2
                    WHEN p.name ILIKE %s || '%%' THEN 3
                    ELSE 4
                  END
                LIMIT 1
            """, (clean_id, clean_id, clean_id, clean_id, clean_id, clean_id, clean_id, clean_id))
            row = cur.fetchone()
        if hasattr(conn, "close"):
            conn.close()

        if row:
            db_poi_id, name, is_local, btype, cat_name, city_name, city_code, sub_cat, green = row
            return _build_facts_payload(
                poi_id=str(db_poi_id or clean_id),
                name=name,
                is_local=is_local,
                btype=btype,
                cat_name=cat_name,
                city_name=city_name,
                city_code=city_code,
                green=green,
            )
    except Exception as exc:
        logger.warning("Relational database explanation lookup failed: %s", exc)

    # 2. Try CSV fallback
    try:
        from app.recommendations.repository import _load_pois_from_csv
        csv_pois = _load_pois_from_csv()
        clean_lower = clean_id.lower()
        found = next(
            (
                p for p in csv_pois
                if str(p.get("poi_id")) == clean_id
                or str(p.get("name", "")).strip().lower() == clean_lower
                or clean_lower in str(p.get("name", "")).strip().lower()
                or str(p.get("name", "")).strip().lower() in clean_lower
            ),
            None,
        )
        if found:
            return _build_facts_payload(
                poi_id=clean_id,
                name=found.get("name", "Địa điểm"),
                is_local=found.get("is_local_business", True),
                btype=found.get("local_business_type"),
                cat_name=found.get("category_name", "Điểm tham quan"),
                city_name=found.get("city_name", "Đà Nẵng"),
                city_code="HUE" if "huế" in str(found.get("city_name", "")).lower() else "DANANG",
                green=found.get("green_score", 0.85),
            )
    except Exception as exc:
        logger.warning("CSV explanation lookup failed: %s", exc)

    return None


def _build_facts_payload(
    poi_id: str,
    name: str,
    is_local: Any,
    btype: Any,
    cat_name: Any,
    city_name: Any,
    city_code: Any,
    green: Any,
) -> dict[str, Any]:
    cat_display = str(cat_name or "Điểm tham quan")
    cat_lower = cat_display.lower()
    
    if "cảnh quan" in cat_lower or "thiên nhiên" in cat_lower:
        cat_key = "nature_landscape"
    elif "ẩm thực" in cat_lower or "quán ăn" in cat_lower:
        cat_key = "food_dining"
    elif "di tích" in cat_lower or "lịch sử" in cat_lower or "văn hóa" in cat_lower:
        cat_key = "historical_culture"
    elif "cafe" in cat_lower or "giải khát" in cat_lower:
        cat_key = "cafe_refreshment"
    else:
        cat_key = "spiritual_temple"

    loc_key = str(city_code or ("HUE" if "hue" in str(city_name).lower() or "huế" in str(city_name).lower() else "DANANG")).upper()
    loc_name = str(city_name or ("Huế" if "HUE" in loc_key else "Đà Nẵng"))

    facts: list[dict[str, Any]] = [
        {
            "relationship": "IN_CATEGORY",
            "target_type": "Category",
            "target_key": cat_key,
            "target_name": cat_display,
        },
        {
            "relationship": "LOCATED_IN",
            "target_type": "Location",
            "target_key": loc_key,
            "target_name": loc_name,
        },
    ]

    # Activities based on semantic category
    if cat_key == "nature_landscape":
        facts.append({
            "relationship": "OFFERS_ACTIVITY",
            "target_type": "Activity",
            "target_key": "nature_exploration",
            "target_name": "Ngắm cảnh & khám phá thiên nhiên sinh thái",
        })
        facts.append({
            "relationship": "OFFERS_ACTIVITY",
            "target_type": "Activity",
            "target_key": "photography",
            "target_name": "Chụp ảnh check-in & dã ngoại ngoài trời",
        })
    elif cat_key == "historical_culture":
        facts.append({
            "relationship": "OFFERS_ACTIVITY",
            "target_type": "Activity",
            "target_key": "cultural_sightseeing",
            "target_name": "Tham quan di tích lịch sử cố đô",
        })
        facts.append({
            "relationship": "OFFERS_ACTIVITY",
            "target_type": "Activity",
            "target_key": "heritage_tour",
            "target_name": "Tìm hiểu di sản triều Nguyễn",
        })
    elif cat_key == "food_dining":
        facts.append({
            "relationship": "OFFERS_ACTIVITY",
            "target_type": "Activity",
            "target_key": "food_experience",
            "target_name": "Thưởng thức ẩm thực đặc sản địa phương",
        })
    elif cat_key == "cafe_refreshment":
        facts.append({
            "relationship": "OFFERS_ACTIVITY",
            "target_type": "Activity",
            "target_key": "cafe_experience",
            "target_name": "Thư giãn, thưởng thức đồ uống & trò chuyện",
        })
    else:
        facts.append({
            "relationship": "OFFERS_ACTIVITY",
            "target_type": "Activity",
            "target_key": "spiritual_visit",
            "target_name": "Chiêm bái & hành hương tĩnh tâm",
        })

    # Features
    if is_local:
        facts.append({
            "relationship": "HAS_FEATURE",
            "target_type": "Feature",
            "target_key": "local_business",
            "target_name": "Doanh nghiệp & cơ sở bản địa",
        })

    return {
        "poi": {
            "id": poi_id,
            "name": name,
            "is_local_business": bool(is_local),
            "local_business_type": btype,
            "source": "GreenTrip Knowledge Graph",
        },
        "facts": facts,
    }


def fetch_poi_explanation_facts(poi_id: str) -> dict[str, Any] | None:
    driver = get_driver()
    if driver is not None:
        try:
            settings = get_settings()
            with driver.session(
                database=settings.NEO4J_DATABASE,
                default_access_mode=READ_ACCESS,
            ) as session:
                record = session.run(EXPLANATION_QUERY, poi_id=poi_id).single()
            if record is not None:
                return {
                    "poi": dict(record["poi"]),
                    "facts": [dict(fact) for fact in record["facts"]],
                }
        except Exception as exc:
            logger.warning("Neo4j query failed, using relational projection: %s", exc)

    return _fetch_from_relational_db(poi_id)
