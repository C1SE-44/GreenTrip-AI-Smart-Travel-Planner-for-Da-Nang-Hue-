from uuid import UUID

from app.db.postgres import get_connection
from app.saved_places.repository import POINotFoundError


class CollectionNotFoundError(Exception):
    """Raised when a collection is missing or is owned by another account."""


class DefaultCollectionError(Exception):
    """Raised when an operation would remove the default collection."""


class InvalidCollectionNameError(Exception):
    """Raised when a collection name is empty or too long."""


def _normalized_name(name: str) -> str:
    normalized = name.strip()
    if not normalized or len(normalized) > 80:
        raise InvalidCollectionNameError
    return normalized


def _ensure_default_collection(cursor, user_id: UUID) -> UUID:
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
    inserted = cursor.fetchone()
    if inserted:
        return inserted[0]
    cursor.execute(
        "SELECT collection_id FROM public.saved_place_collections WHERE user_id = %s AND is_default",
        (user_id,),
    )
    return cursor.fetchone()[0]


def _lock_owned_collection(cursor, user_id: UUID, collection_id: UUID):
    cursor.execute(
        """
        SELECT collection_id, is_default
        FROM public.saved_place_collections
        WHERE user_id = %s AND collection_id = %s
        FOR UPDATE
        """,
        (user_id, collection_id),
    )
    row = cursor.fetchone()
    if row is None:
        raise CollectionNotFoundError
    return row


def _lock_poi(cursor, poi_id: UUID) -> None:
    cursor.execute(
        "SELECT poi_id FROM public.pois WHERE poi_id = %s FOR UPDATE",
        (poi_id,),
    )
    if cursor.fetchone() is None:
        raise POINotFoundError


def list_collections(user_id: UUID, poi_id: UUID | None = None) -> list[dict]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_default_collection(cursor, user_id)
            cursor.execute(
                """
                SELECT
                    c.collection_id,
                    c.name,
                    c.is_default,
                    c.created_at,
                    COUNT(i.poi_id)::int AS place_count,
                    COALESCE(
                        ARRAY_AGG(p.image_url ORDER BY i.created_at)
                            FILTER (WHERE p.image_url IS NOT NULL),
                        ARRAY[]::text[]
                    ) AS cover_images,
                    COALESCE(BOOL_OR(i.poi_id = %s), FALSE) AS contains_poi
                FROM public.saved_place_collections AS c
                LEFT JOIN public.saved_place_collection_items AS i
                  ON i.user_id = c.user_id
                 AND i.collection_id = c.collection_id
                LEFT JOIN public.pois AS p ON p.poi_id = i.poi_id
                WHERE c.user_id = %s
                GROUP BY c.collection_id
                ORDER BY c.is_default DESC, c.created_at, c.name
                """,
                (poi_id, user_id),
            )
            rows = cursor.fetchall()
            connection.commit()

    return [
        {
            "collection_id": row[0],
            "name": row[1],
            "is_default": row[2],
            "created_at": row[3],
            "place_count": row[4],
            "cover_images": row[5] or [],
            "contains_poi": row[6],
        }
        for row in rows
    ]


def create_collection(user_id: UUID, name: str) -> UUID:
    normalized = _normalized_name(name)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            _ensure_default_collection(cursor, user_id)
            cursor.execute(
                """
                INSERT INTO public.saved_place_collections (user_id, name)
                VALUES (%s, %s)
                RETURNING collection_id
                """,
                (user_id, normalized),
            )
            collection_id = cursor.fetchone()[0]
            connection.commit()
            return collection_id


def rename_collection(user_id: UUID, collection_id: UUID, name: str) -> bool:
    normalized = _normalized_name(name)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            _lock_owned_collection(cursor, user_id, collection_id)
            cursor.execute(
                """
                UPDATE public.saved_place_collections
                SET name = %s, updated_at = NOW()
                WHERE user_id = %s AND collection_id = %s
                RETURNING collection_id
                """,
                (normalized, user_id, collection_id),
            )
            changed = cursor.fetchone() is not None
            connection.commit()
            return changed


def delete_collection(user_id: UUID, collection_id: UUID) -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            default_collection_id = _ensure_default_collection(cursor, user_id)
            _owned_id, is_default = _lock_owned_collection(cursor, user_id, collection_id)
            if is_default or collection_id == default_collection_id:
                raise DefaultCollectionError

            # Preserve every saved POI from the deleted collection in the default collection.
            cursor.execute(
                """
                INSERT INTO public.saved_place_collection_items
                    (user_id, collection_id, poi_id, created_at)
                SELECT user_id, %s, poi_id, created_at
                FROM public.saved_place_collection_items
                WHERE user_id = %s AND collection_id = %s
                ON CONFLICT (collection_id, poi_id) DO NOTHING
                """,
                (default_collection_id, user_id, collection_id),
            )
            cursor.execute(
                """
                DELETE FROM public.saved_place_collections
                WHERE user_id = %s AND collection_id = %s
                RETURNING collection_id
                """,
                (user_id, collection_id),
            )
            if cursor.fetchone() is None:
                raise CollectionNotFoundError
            connection.commit()


def collection_belongs_to_user(user_id: UUID, collection_id: UUID) -> bool:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1 FROM public.saved_place_collections
                WHERE user_id = %s AND collection_id = %s
                """,
                (user_id, collection_id),
            )
            return cursor.fetchone() is not None


def add_place_to_collection(user_id: UUID, collection_id: UUID, poi_id: UUID) -> bool:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            _lock_owned_collection(cursor, user_id, collection_id)
            _lock_poi(cursor, poi_id)
            cursor.execute(
                """
                INSERT INTO public.saved_place_collection_items (user_id, collection_id, poi_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (collection_id, poi_id) DO NOTHING
                RETURNING poi_id
                """,
                (user_id, collection_id, poi_id),
            )
            membership_inserted = cursor.fetchone() is not None
            connection.commit()
            return membership_inserted


def remove_place_from_collection(
    user_id: UUID, collection_id: UUID, poi_id: UUID
) -> tuple[bool, bool]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            _lock_owned_collection(cursor, user_id, collection_id)
            cursor.execute(
                "SELECT poi_id FROM public.pois WHERE poi_id = %s FOR UPDATE",
                (poi_id,),
            )
            # A missing POI can only be an orphan from before the direct POI FK was added.
            # Still allow removal so an old invalid membership can be cleaned up safely.

            cursor.execute(
                """
                DELETE FROM public.saved_place_collection_items
                WHERE user_id = %s AND collection_id = %s AND poi_id = %s
                RETURNING poi_id
                """,
                (user_id, collection_id, poi_id),
            )
            removed = cursor.fetchone() is not None
            cursor.execute(
                """
                SELECT 1
                FROM public.saved_place_collection_items
                WHERE user_id = %s AND poi_id = %s
                LIMIT 1
                """,
                (user_id, poi_id),
            )
            is_saved = cursor.fetchone() is not None
            connection.commit()
            return removed, is_saved
