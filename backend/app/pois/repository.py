from typing import Any

from app.db.postgres import get_connection
from app.pois.model import POI


CITY_ALIAS_MAP: dict[str, str] = {
    "da nang": "DANANG",
    "danang": "DANANG",
    "đà nẵng": "DANANG",
    "hue": "HUE",
    "huế": "HUE",
}

CATEGORY_ALIAS_MAP: dict[str, list[str]] = {
    "di-tich": ["Di tích lịch sử và văn hóa"],
    "di tích": ["Di tích lịch sử và văn hóa"],
    "canh-quan": ["Cảnh quan và thiên nhiên"],
    "cảnh quan": ["Cảnh quan và thiên nhiên"],
    "chua": ["Tâm linh và chùa thiền"],
    "chùa": ["Tâm linh và chùa thiền"],
    "tam-linh": ["Tâm linh và chùa thiền"],
    "tâm linh": ["Tâm linh và chùa thiền"],
    "quan-an": ["Ẩm thực và quán ăn", "Quán cafe giải khát"],
    "quán ăn": ["Ẩm thực và quán ăn", "Quán cafe giải khát"],
    "am-thuc": ["Ẩm thực và quán ăn"],
    "ẩm thực": ["Ẩm thực và quán ăn"],
    "cafe": ["Quán cafe giải khát"],
    "cà phê": ["Quán cafe giải khát"],
    "giai-tri": ["Cảnh quan và thiên nhiên"],
    "bao-tang": ["Di tích lịch sử và văn hóa"],
}


def list_pois(
    limit: int,
    offset: int,
    category: str | None = None,
    city: str | None = None,
    sub_category: str | None = None,
    cuisine: str | None = None,
    budget_tier: str | None = None,
) -> tuple[list[POI], int]:
    with get_connection() as connection:
        where_clauses: list[str] = []
        params: list[Any] = []

        if category and category.strip().casefold() not in {"all", ""}:
            cat_norm = category.strip().casefold()
            if cat_norm in CATEGORY_ALIAS_MAP:
                where_clauses.append("c.name = ANY(%s)")
                params.append(CATEGORY_ALIAS_MAP[cat_norm])
            else:
                where_clauses.append("c.name ILIKE %s")
                params.append(f"%{category.strip()}%")

        if city and city.strip().casefold() not in {"all", ""}:
            city_norm = city.strip().casefold()
            if city_norm in CITY_ALIAS_MAP:
                where_clauses.append("ci.code = %s")
                params.append(CITY_ALIAS_MAP[city_norm])
            else:
                where_clauses.append("ci.name ILIKE %s")
                params.append(f"%{city.strip()}%")

        if sub_category and sub_category.strip().casefold() not in {"all", ""}:
            where_clauses.append("p.sub_category = %s")
            params.append(sub_category.strip())

        if cuisine and cuisine.strip().casefold() not in {"all", ""}:
            where_clauses.append("p.cuisine = %s")
            params.append(cuisine.strip())

        if budget_tier and budget_tier.strip().casefold() not in {"all", ""}:
            where_clauses.append("p.budget_tier = %s")
            params.append(budget_tier.strip())

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        with connection.cursor() as cursor:
            query = f"""
                SELECT
                    p.poi_id::text AS id,
                    p.name,
                    c.name AS category,
                    p.description,
                    ST_Y(p.geom::geometry) AS latitude,
                    ST_X(p.geom::geometry) AS longitude,
                    p.address,
                    ci.name AS city,
                    p.estimated_cost::float AS estimated_cost,
                    p.average_visit_minutes AS average_visit_minutes,
                    p.satisfaction_score::float AS satisfaction_score,
                    p.green_score AS green_score,
                    p.is_local_business AS is_local_business,
                    p.local_business_type AS local_business_type,
                    p.image_url AS image_url,
                    p.gallery_urls AS gallery_urls,
                    p.sub_category AS sub_category,
                    p.cuisine AS cuisine,
                    p.budget_tier AS budget_tier,
                    p.vibes AS vibes,
                    p.best_time AS best_time,
                    p.eco_features AS eco_features,
                    p.ai_metadata AS ai_metadata,
                    p.phone_number AS phone_number,
                    p.website_url AS website_url,
                    p.social_links AS social_links,
                    p.opening_hours AS opening_hours,
                    p.email AS email
                FROM public.pois p
                JOIN public.poi_categories c ON p.category_id = c.category_id
                JOIN public.cities ci ON p.city_id = ci.city_id
                {where_sql}
                ORDER BY p.name ASC
                LIMIT %s OFFSET %s
            """
            cursor.execute(query, tuple(params + [limit, offset]))
            rows = cursor.fetchall()

        with connection.cursor() as cursor:
            count_query = f"""
                SELECT COUNT(*)
                FROM public.pois p
                JOIN public.poi_categories c ON p.category_id = c.category_id
                JOIN public.cities ci ON p.city_id = ci.city_id
                {where_sql}
            """
            cursor.execute(count_query, tuple(params))
            count_row = cursor.fetchone()

    if count_row is None:
        raise RuntimeError("POI count query returned no result.")

    items = [POI(*row) for row in rows]
    return items, int(count_row[0])
