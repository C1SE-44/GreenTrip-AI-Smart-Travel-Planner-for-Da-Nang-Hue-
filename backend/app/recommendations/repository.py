"""Database access for recommendation POIs."""

from __future__ import annotations

from typing import Any

from psycopg import Connection

from app.trips.schemas import DestinationType, normalize_destination


class RecommendationRepositoryError(RuntimeError):
    """Raised when recommendation POIs cannot be read from the database."""


class DestinationResolutionError(RecommendationRepositoryError):
    """Raised when a PB07 destination cannot be mapped to city records."""


def _table_columns(connection: Connection, table_name: str) -> set[str]:
    """Return visible columns for a trusted table name in the public schema."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            """,
            (table_name,),
        )
        return {row[0] for row in cursor.fetchall()}


def resolve_destination_city_ids(
    connection: Connection | None,
    destination: str,
) -> list[Any]:
    """Resolve a PB07 destination to exact ``cities.city_id`` values by code."""
    if connection is None:
        raise RecommendationRepositoryError("PostgreSQL connection is unavailable")

    try:
        canonical_destination = normalize_destination(destination)
    except (AttributeError, TypeError, ValueError) as exc:
        raise DestinationResolutionError(
            f"Unsupported destination: {destination!r}"
        ) from exc

    city_codes_by_destination = {
        DestinationType.DA_NANG.value: ("DANANG",),
        DestinationType.HUE.value: ("HUE",),
        DestinationType.BOTH.value: ("DANANG", "HUE"),
    }
    required_codes = city_codes_by_destination.get(canonical_destination)
    if required_codes is None:
        raise DestinationResolutionError(
            f"Unsupported destination: {destination!r}"
        )

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT city_id, UPPER(code) AS code
                FROM public.cities
                WHERE UPPER(code) = ANY(%s)
                """,
                (list(required_codes),),
            )
            rows = cursor.fetchall()
    except Exception as exc:
        raise RecommendationRepositoryError(
            "Failed to resolve PB07 destination in public.cities"
        ) from exc

    ids_by_code: dict[str, Any] = {}
    for city_id, code in rows:
        normalized_code = str(code).upper()
        if normalized_code in required_codes:
            ids_by_code[normalized_code] = city_id

    missing_codes = [code for code in required_codes if code not in ids_by_code]
    if missing_codes:
        raise DestinationResolutionError(
            "No public.cities record found for destination code(s): "
            + ", ".join(missing_codes)
        )
    return [ids_by_code[code] for code in required_codes]


def list_recommendation_pois(
    connection: Connection | None,
    destination: str | None = None,
) -> list[dict[str, Any]]:
    """Load active POIs and normalize the current Supabase schema.

    Supports the project's ``poi_id/category_id/geom`` schema as well as
    ``id`` or direct category/coordinate variants. Missing recommendation
    columns or database failures raise repository errors; no mock data is used.
    """
    if connection is None:
        raise RecommendationRepositoryError("PostgreSQL connection is unavailable")

    city_ids = (
        resolve_destination_city_ids(connection, destination)
        if destination is not None
        else None
    )

    try:
        poi_columns = _table_columns(connection, "pois")
        category_columns = _table_columns(connection, "poi_categories")
        city_columns = _table_columns(connection, "cities")

        required_columns = {
            "name",
            "description",
            "local_business_type",
            "estimated_cost",
            "satisfaction_score",
            "is_local_business",
            "green_score",
            "is_active",
        }
        missing = sorted(required_columns - poi_columns)
        if missing:
            raise RecommendationRepositoryError(
                "public.pois is missing recommendation columns: " + ", ".join(missing)
            )

        if "poi_id" in poi_columns:
            id_expression = "p.poi_id::text"
        elif "id" in poi_columns:
            id_expression = "p.id::text"
        else:
            raise RecommendationRepositoryError(
                "public.pois must contain poi_id or id"
            )

        joins: list[str] = []
        if "category_id" in poi_columns and "category_id" in category_columns:
            if "name" in category_columns:
                category_column = "name"
            elif "category_name" in category_columns:
                category_column = "category_name"
            else:
                raise RecommendationRepositoryError(
                    "public.poi_categories needs a name or category_name column"
                )
            # Match the Supabase relationship: pois.category_id ->
            # poi_categories.category_id. Alias its name for the feature extractor.
            category_expression = f"pc.{category_column}"
            joins.append(
                "LEFT JOIN public.poi_categories AS pc "
                "ON pc.category_id = p.category_id"
            )
        elif "category_name" in poi_columns:
            category_expression = "p.category_name"
        elif "category" in poi_columns:
            category_expression = "p.category"
        else:
            raise RecommendationRepositoryError(
                "POI schema has no category field or category relation"
            )

        if {"latitude", "longitude"}.issubset(poi_columns):
            latitude_expression = "p.latitude"
            longitude_expression = "p.longitude"
        elif {"lat", "lng"}.issubset(poi_columns):
            latitude_expression = "p.lat"
            longitude_expression = "p.lng"
        elif "geom" in poi_columns:
            latitude_expression = "ST_Y(p.geom::geometry)"
            longitude_expression = "ST_X(p.geom::geometry)"
        else:
            raise RecommendationRepositoryError(
                "POI schema has no supported coordinate fields"
            )

        city_joins: list[str] = []
        if city_ids is not None:
            missing_city_fields = {
                "city_id"
            } - poi_columns | ({"city_id", "name", "code"} - city_columns)
            if missing_city_fields:
                raise RecommendationRepositoryError(
                    "Destination filtering requires pois.city_id and "
                    "cities.city_id/code/name; missing: "
                    + ", ".join(sorted(missing_city_fields))
                )
            city_expression = "ci.name"
            city_joins.append(
                "JOIN public.cities AS ci ON ci.city_id = p.city_id"
            )
        elif "city_id" in poi_columns and "city_id" in city_columns:
            city_column = "name" if "name" in city_columns else "city_name"
            if city_column not in city_columns:
                city_expression = "NULL::text"
            else:
                city_expression = f"ci.{city_column}"
                city_joins.append(
                    "LEFT JOIN public.cities AS ci ON ci.city_id = p.city_id"
                )
        elif "city_name" in poi_columns:
            city_expression = "p.city_name"
        elif "city" in poi_columns:
            city_expression = "p.city"
        else:
            city_expression = "NULL::text"

        optional_columns = {
            "sub_category": "NULL::text",
            "budget_tier": "NULL::text",
            "vibes": "NULL::text[]",
            "ai_metadata": "NULL::jsonb",
            "average_visit_minutes": "NULL",
            "popularity_score": "NULL",
        }
        optional_expressions = {
            name: f"p.{name}" if name in poi_columns else fallback
            for name, fallback in optional_columns.items()
        }

        where_clauses = ["p.is_active IS TRUE"]
        query_params: list[Any] = []
        if city_ids is not None:
            where_clauses.append("p.city_id = ANY(%s)")
            query_params.append(city_ids)

        query = f"""
            SELECT
                {id_expression} AS poi_id,
                p.name,
                p.description,
                -- Normalize the relationship value for POIFeatureExtractor.
                {category_expression} AS category_name,
                {city_expression} AS city,
                {optional_expressions['sub_category']} AS sub_category,
                {optional_expressions['budget_tier']} AS budget_tier,
                {optional_expressions['vibes']} AS vibes,
                {optional_expressions['ai_metadata']} AS ai_metadata,
                p.local_business_type,
                p.estimated_cost AS estimated_cost,
                p.satisfaction_score::double precision AS satisfaction_score,
                {optional_expressions['popularity_score']}::double precision AS popularity_score,
                {optional_expressions['average_visit_minutes']}::double precision AS average_visit_minutes,
                COALESCE(p.is_local_business, FALSE) AS is_local_business,
                p.green_score::double precision AS green_score,
                p.is_active,
                {latitude_expression} AS lat,
                {longitude_expression} AS lng
            FROM public.pois AS p
            {' '.join(joins)}
            {' '.join(city_joins)}
            WHERE {' AND '.join(where_clauses)}
            ORDER BY p.name ASC
        """
        with connection.cursor() as cursor:
            cursor.execute(query, tuple(query_params))
            if cursor.description is None:
                raise RecommendationRepositoryError(
                    "POI query returned no column metadata"
                )
            column_names = [column.name for column in cursor.description]
            return [dict(zip(column_names, row)) for row in cursor.fetchall()]
    except RecommendationRepositoryError:
        raise
    except Exception as exc:
        raise RecommendationRepositoryError(
            f"Failed to query public.pois: {exc}"
        ) from exc
