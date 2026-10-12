from typing import Any

from app.db.postgres import get_connection
from app.pois.model import POI


def list_pois(
    limit: int,
    offset: int,
    category: str | None = None,
    city: str | None = None,
) -> tuple[list[POI], int]:
    with get_connection() as connection:
        where_clauses: list[str] = []
        params: list[Any] = []

        if category:
            where_clauses.append("c.name = %s")
            params.append(category)

        if city:
            where_clauses.append("ci.name ILIKE %s")
            params.append(f"%{city}%")

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
                    ci.name AS city
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