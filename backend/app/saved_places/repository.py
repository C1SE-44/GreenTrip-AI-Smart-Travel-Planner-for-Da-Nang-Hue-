from dataclasses import asdict
from uuid import UUID

from app.db.postgres import get_connection
from app.pois.model import POI
from app.saved_places.schemas import SavedPlaceItem


class POINotFoundError(Exception):
    """Raised when a requested POI does not exist."""


def list_saved_places(
    user_id: UUID, collection_id: UUID | None = None
) -> list[SavedPlaceItem]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH saved AS (
                    SELECT
                        user_id,
                        poi_id,
                        MIN(COALESCE((to_jsonb(i) ->> 'saved_at')::timestamptz, i.created_at)) AS saved_at
                    FROM public.saved_place_collection_items AS i
                    WHERE i.user_id = %s
                      AND (%s::uuid IS NULL OR i.collection_id = %s)
                    GROUP BY i.user_id, i.poi_id
                ), saved_counts AS (
                    SELECT
                        i.poi_id,
                        COUNT(DISTINCT c.user_id)::int AS saved_count
                    FROM public.saved_place_collection_items AS i
                    JOIN public.saved_place_collections AS c
                      ON c.collection_id = i.collection_id
                     AND c.user_id = i.user_id
                    GROUP BY i.poi_id
                )
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
                    p.email AS email,
                    COALESCE(saved_counts.saved_count, 0) AS saved_count,
                    saved.saved_at
                FROM saved
                JOIN public.pois p ON p.poi_id = saved.poi_id
                JOIN public.poi_categories c ON c.category_id = p.category_id
                JOIN public.cities ci ON ci.city_id = p.city_id
                LEFT JOIN saved_counts ON saved_counts.poi_id = p.poi_id
                ORDER BY saved.saved_at DESC, p.name ASC
                """,
                (user_id, collection_id, collection_id),
            )
            rows = cursor.fetchall()

    items: list[SavedPlaceItem] = []
    for row in rows:
        poi = POI(*row[:-1])
        items.append(SavedPlaceItem(**asdict(poi), saved_at=row[-1]))
    return items


def save_place(user_id: UUID, poi_id: UUID) -> bool:
    """Save a POI by attaching it to the account's default collection."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT poi_id FROM public.pois WHERE poi_id = %s FOR UPDATE",
                (poi_id,),
            )
            if cursor.fetchone() is None:
                raise POINotFoundError

            cursor.execute(
                """
                INSERT INTO public.saved_place_collections (user_id, name, is_default)
                VALUES (%s, 'Địa điểm của tôi', TRUE)
                ON CONFLICT (user_id) WHERE is_default
                DO NOTHING
                RETURNING collection_id
                """,
                (user_id,),
            )
            default_collection = cursor.fetchone()
            if default_collection:
                default_collection_id = default_collection[0]
            else:
                cursor.execute(
                    """
                    SELECT collection_id
                    FROM public.saved_place_collections
                    WHERE user_id = %s AND is_default
                    FOR UPDATE
                    """,
                    (user_id,),
                )
                default_collection = cursor.fetchone()
                if default_collection is None:
                    raise RuntimeError("Default saved-place collection could not be created")
                default_collection_id = default_collection[0]

            cursor.execute(
                """
                INSERT INTO public.saved_place_collection_items (user_id, collection_id, poi_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (collection_id, poi_id) DO NOTHING
                RETURNING poi_id
                """,
                (user_id, default_collection_id, poi_id),
            )
            changed = cursor.fetchone() is not None
            connection.commit()
            return changed


def remove_place(user_id: UUID, poi_id: UUID) -> bool:
    """Remove a POI from every collection owned by the caller."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT poi_id FROM public.pois WHERE poi_id = %s FOR UPDATE",
                (poi_id,),
            )
            cursor.execute(
                """
                DELETE FROM public.saved_place_collection_items
                WHERE user_id = %s AND poi_id = %s
                RETURNING poi_id
                """,
                (user_id, poi_id),
            )
            removed = cursor.fetchone() is not None
            connection.commit()
            return removed
