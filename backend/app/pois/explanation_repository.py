import logging
from pathlib import Path
from typing import Any

from neo4j import READ_ACCESS

from app.cache import poi_cache
from app.config import get_settings
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
                       p.sub_category, p.green_score,
                       ST_X(p.geom::geometry) as lng, p.popularity_score::float as popularity_score,
                       p.eco_features, p.best_time
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
            db_poi_id, name, is_local, btype, cat_name, city_name, city_code, sub_cat, green, lng, popularity, eco_feats, best_t = row
            return _build_facts_payload(
                poi_id=str(db_poi_id or clean_id),
                name=name,
                is_local=is_local,
                btype=btype,
                cat_name=cat_name,
                city_name=city_name,
                city_code=city_code,
                green=green,
                longitude=float(lng) if lng is not None else None,
                popularity_score=float(popularity) if popularity is not None else None,
                eco_features=list(eco_feats) if isinstance(eco_feats, (list, tuple)) else None,
                best_time=list(best_t) if isinstance(best_t, (list, tuple)) else None,
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
    name: str,
    is_local: Any,
    btype: Any,
    cat_name: Any,
    city_name: Any,
    city_code: Any,
    green: Any,
    longitude: float | None = None,
    popularity_score: float | None = None,
    eco_features: list[str] | None = None,
    best_time: list[str] | None = None,
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
    if str(btype or "").strip().lower() == "craft_workshop":
        facts.append({
            "relationship": "HAS_FEATURE",
            "target_type": "Feature",
            "target_key": "craft_workshop",
            "target_name": "Làng nghề & xưởng thủ công bản địa",
        })
    if loc_key == "DANANG" and longitude is not None and float(longitude) < 108.224:
        facts.append({
            "relationship": "HAS_FEATURE",
            "target_type": "Feature",
            "target_key": "west_han_river",
            "target_name": "Khu vực bản địa phía Tây sông Hàn",
        })
    if popularity_score is not None and float(popularity_score) <= 3.65:
        facts.append({
            "relationship": "HAS_FEATURE",
            "target_type": "Feature",
            "target_key": "low_crowd_authentic",
            "target_name": "Điểm đến ít đông, tránh quá tải",
        })
    for idx, eco_item in enumerate((eco_features or [])[:3]):
        label = str(eco_item).strip()
        if label:
            facts.append({
                "relationship": "HAS_ECO_PRACTICE",
                "target_type": "EcoPractice",
                "target_key": f"eco_{idx}",
                "target_name": label,
            })
    if best_time:
        bt_label = ", ".join(str(x).strip() for x in best_time if str(x).strip())
        if bt_label:
            facts.append({
                "relationship": "BEST_TIME",
                "target_type": "TimeWindow",
                "target_key": "best_time",
                "target_name": f"Khung giờ đẹp & đỡ đông: {bt_label}",
            })

    pillars = compute_green_score_pillars(
        name=name,
        cat_name=cat_display,
        is_local=is_local,
        green=green,
        eco_features=eco_features,
        popularity_score=popularity_score,
    )

    return {
        "poi": {
            "id": poi_id,
            "name": name,
            "is_local_business": bool(is_local),
            "local_business_type": btype,
            "source": "GreenTrip Knowledge Graph (Dự phòng dữ liệu kiểm định)",
        },
        "facts": facts,
        "explanation_source": "relational_fallback",
        "green_score_breakdown": pillars,
    }


def fetch_local_authentic_poi_ids() -> set[str]:
    """Lấy danh sách POI bản địa từ Neo4j Knowledge Graph (tự fallback set rỗng khi offline)."""
    cache_key = "pois:neo4j:local_authentic_ids"
    cached = poi_cache.get_json(cache_key)
    if isinstance(cached, list):
        return {str(item) for item in cached if item is not None}

    if is_neo4j_in_cooldown():
        return set()

    driver = get_driver()
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
    if not is_neo4j_in_cooldown():
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
                    poi_dict = dict(record["poi"])
                    facts_list = [dict(fact) for fact in record["facts"]]
                    return {
                        "poi": poi_dict,
                        "facts": facts_list,
                        "explanation_source": "neo4j",
                        "green_score_breakdown": compute_green_score_pillars(
                            name=str(poi_dict.get("name") or ""),
                            cat_name=next((f.get("target_name") for f in facts_list if f.get("relationship") == "IN_CATEGORY"), None),
                            is_local=poi_dict.get("is_local_business"),
                            green=0.88 if poi_dict.get("is_local_business") else 0.80,
                        ),
                    }
            except Exception as exc:
                mark_neo4j_unavailable()
                logger.warning("Neo4j query failed, activating cooldown & relational projection: %s", exc)

    return _fetch_from_relational_db(poi_id)
