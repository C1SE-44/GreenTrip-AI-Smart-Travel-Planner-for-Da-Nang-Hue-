"""Read-only provider for accommodation records in the existing POI catalogue."""

from __future__ import annotations

import json
import math
import unicodedata
from typing import Any, Protocol

from psycopg import Connection

from app.recommendations.repository import (
    DestinationResolutionError,
    RecommendationRepositoryError,
    _table_columns,
    resolve_destination_city_ids,
)
from app.trips.schemas import DestinationType, normalize_destination


class AccommodationProvider(Protocol):
    def list_stays(self, destination: str) -> list[dict[str, Any]]: ...


def _fold(value: Any) -> str:
    raw = unicodedata.normalize("NFKD", str(value or ""))
    return " ".join(
        "".join(char for char in raw if not unicodedata.combining(char))
        .casefold()
        .replace("đ", "d")
        .replace("_", " ")
        .replace("-", " ")
        .split()
    )


def is_lodging_category(category: Any, sub_category: Any = None) -> bool:
    text = f"{_fold(category)} {_fold(sub_category)}"
    terms = (
        "hotel", "accommodation", "lodging", "homestay", "hostel", "motel",
        "resort", "guest house", "guesthouse", "serviced apartment", "villa",
        "bungalow", "eco stay", "khach san", "luu tru",
    )
    return any(term in text for term in terms)


def _metadata_int(metadata: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        value = metadata.get(key)
        if isinstance(value, int) and not isinstance(value, bool) and value > 0:
            return value
    return None


def _positive_int(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    if isinstance(value, float) and not value.is_integer():
        return None
    if isinstance(value, str) and str(number) != value.strip():
        return None
    return number if number > 0 else None


def _nightly_room_price(row: dict[str, Any], metadata: dict[str, Any]) -> tuple[float | None, str | None, str | None]:
    unit = row.get("price_unit") or metadata.get("price_unit")
    normalized = _fold(unit).replace(" ", "")
    recognized = {
        "vnd/room/night", "vnd/room/pernight", "vnd/phong/dem", "vnd/phong/1dem",
        "room/night", "room/pernight", "phong/dem", "perroompernight",
    }
    amount = row.get("estimated_cost")
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        amount = None
    if normalized not in recognized or amount is None or not math.isfinite(amount) or amount <= 0 or amount > 1_000_000_000:
        return None, None, str(unit).strip() if unit else None
    raw_currency = row.get("currency") or metadata.get("currency")
    currency = str(raw_currency).upper() if raw_currency else (
        "VND" if normalized.startswith("vnd/") else None
    )
    if currency not in {"VND", "USD", "EUR"}:
        return None, None, str(unit).strip() if unit else None
    return amount, currency, str(unit).strip()


def normalize_stay(row: dict[str, Any]) -> dict[str, Any] | None:
    """Normalize only fields present in the source; never infer property features."""
    if row.get("repository_source") == "offline_csv":
        return None
    if row.get("is_active") is False or str(row.get("status") or "").upper() in {
        "INACTIVE", "CLOSED", "CLOSED_PERMANENTLY", "DELETED", "ARCHIVED", "DISABLED",
        "UNPUBLISHED", "DRAFT", "PENDING", "SUSPENDED", "REMOVED",
    }:
        return None
    category = row.get("category_name") or row.get("category")
    sub_category = row.get("sub_category")
    if not is_lodging_category(category, sub_category):
        return None
    metadata = row.get("ai_metadata") if isinstance(row.get("ai_metadata"), dict) else {}
    price, currency, unit = _nightly_room_price(row, metadata)
    lat, lng = row.get("lat", row.get("latitude")), row.get("lng", row.get("longitude"))
    try:
        lat = float(lat) if lat is not None else None
        lng = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat, lng = None, None
    if lat is not None and not -90 <= lat <= 90:
        lat = None
    if lng is not None and not -180 <= lng <= 180:
        lng = None

    rating = row.get("satisfaction_score")
    try:
        rating = float(rating) if rating is not None else None
    except (TypeError, ValueError):
        rating = None
    if rating is not None and not 0 <= rating <= 5:
        rating = None

    amenities = metadata.get("amenities")
    room_types = metadata.get("room_types")
    capacity = _positive_int(row.get("max_guests_per_room")) or _metadata_int(metadata, "max_guests_per_room")
    sustainability = metadata.get("sustainability_evidence")
    sustainability_evidence = None
    if isinstance(sustainability, dict) and sustainability.get("verified") is True:
        certificate = sustainability.get("certificate") or sustainability.get("evidence")
        if isinstance(certificate, str) and certificate.strip():
            sustainability_evidence = certificate.strip()[:300]

    return {
        "stay_id": str(row.get("poi_id") or row.get("id") or ""),
        "name": str(row.get("name") or "").strip(),
        "category": str(category).strip() if category else None,
        "city": row.get("city_name") or row.get("city"),
        "address": row.get("address"),
        "latitude": lat,
        "longitude": lng,
        "image_url": row.get("image_url") or row.get("image"),
        "website_url": row.get("website_url") if isinstance(row.get("website_url"), str) else None,
        "nightly_room_price": price,
        "currency": currency,
        "price_unit": unit,
        "budget_tier": row.get("budget_tier"),
        "max_guests_per_room": capacity,
        "room_types": [str(item) for item in room_types if isinstance(item, str)][:20]
        if isinstance(room_types, list) else [],
        "amenities": [str(item) for item in amenities if isinstance(item, str)][:30]
        if isinstance(amenities, list) else [],
        "rating": rating,
        "review_count": _positive_int(row.get("review_count")) or _metadata_int(metadata, "review_count", "reviews_count"),
        "check_in": str(row.get("check_in") or metadata.get("check_in"))[:20]
        if row.get("check_in") or isinstance(metadata.get("check_in"), str) else None,
        "check_out": str(row.get("check_out") or metadata.get("check_out"))[:20]
        if row.get("check_out") or isinstance(metadata.get("check_out"), str) else None,
        "sustainability_evidence": sustainability_evidence,
        "data_source": "public.pois",
        "updated_at": str(row.get("updated_at") or metadata.get("updated_at"))[:40]
        if row.get("updated_at") or isinstance(metadata.get("updated_at"), str) else None,
    }


class PoiCatalogueAccommodationProvider:
    """Adapts current DB-first POIs; returns no inventory when no lodging rows exist."""

    def __init__(self, connection: Connection | None):
        self.connection = connection

    def list_stays(self, destination: str) -> list[dict[str, Any]]:
        if self.connection is None:
            raise RuntimeError("Accommodation catalogue database is unavailable.")
        if hasattr(self.connection, "_conn") or type(self.connection).__name__ == "SQLiteConnectionWrapper":
            return []
        try:
            rows = _query_lodging_pois(self.connection, destination)
        except DestinationResolutionError:
            raise
        except Exception as error:
            raise RecommendationRepositoryError("Could not read lodging POIs from public.pois") from error
        stays = [candidate for row in rows if (candidate := normalize_stay(row))]
        seen: set[str] = set()
        unique = []
        for stay in stays:
            if stay["stay_id"] and stay["name"] and stay["stay_id"] not in seen:
                seen.add(stay["stay_id"])
                unique.append(stay)
        return unique[:300]


def _query_lodging_pois(connection: Connection, destination: str) -> list[dict[str, Any]]:
    """Select a compact set of actual active POI rows with lodging taxonomy."""
    poi_columns = _table_columns(connection, "pois")
    category_columns = _table_columns(connection, "poi_categories")
    city_columns = _table_columns(connection, "cities")
    required = {"name", "is_active"}
    missing = sorted(required - poi_columns)
    if missing:
        raise RecommendationRepositoryError("public.pois missing columns: " + ", ".join(missing))

    id_expression = "p.poi_id::text" if "poi_id" in poi_columns else "p.id::text" if "id" in poi_columns else None
    if id_expression is None:
        raise RecommendationRepositoryError("public.pois requires poi_id or id")

    joins: list[str] = []
    if (
        "category_id" in poi_columns
        and "category_id" in category_columns
        and ("name" in category_columns or "category_name" in category_columns)
    ):
        category_label = "name" if "name" in category_columns else "category_name"
        category_expression = f"c.{category_label}"
        joins.append("JOIN public.poi_categories c ON c.category_id = p.category_id")
    elif "category_name" in poi_columns:
        category_expression = "p.category_name"
    elif "category" in poi_columns:
        category_expression = "p.category"
    else:
        raise RecommendationRepositoryError("public.pois has no category field or category relation")

    city_filter: str
    city_params: list[Any]
    if (
        "city_id" in poi_columns
        and {"city_id", "code"}.issubset(city_columns)
        and ("name" in city_columns or "city_name" in city_columns)
    ):
        city_ids = resolve_destination_city_ids(connection, destination)
        city_label = "name" if "name" in city_columns else "city_name"
        city_expression = f"ci.{city_label}"
        joins.append("JOIN public.cities ci ON ci.city_id = p.city_id")
        city_filter = "p.city_id = ANY(%s)"
        city_params = [city_ids]
    else:
        city_column = "city_name" if "city_name" in poi_columns else "city" if "city" in poi_columns else None
        if city_column is None:
            raise RecommendationRepositoryError("Destination filtering requires a city relation or a direct city field")
        try:
            canonical_destination = normalize_destination(destination)
        except (AttributeError, TypeError, ValueError) as error:
            raise DestinationResolutionError("Unsupported accommodation destination") from error
        city_names = {
            DestinationType.DA_NANG.value: [DestinationType.DA_NANG.value, "Da Nang", "Danang", "Da Nang City", "Thành phố Đà Nẵng"],
            DestinationType.HUE.value: [DestinationType.HUE.value, "Hue", "Thừa Thiên Huế", "Hue City", "Thành phố Huế"],
            DestinationType.BOTH.value: [DestinationType.DA_NANG.value, "Da Nang", "Danang", "Da Nang City", "Thành phố Đà Nẵng", DestinationType.HUE.value, "Hue", "Thừa Thiên Huế", "Hue City", "Thành phố Huế"],
        }.get(canonical_destination)
        if not city_names:
            raise DestinationResolutionError("Unsupported accommodation destination")
        city_expression = f"p.{city_column}"
        city_filter = f"LOWER(TRIM(p.{city_column}::text)) = ANY(%s)"
        city_params = [[name.lower() for name in city_names]]

    if "geom" in poi_columns:
        latitude_expression, longitude_expression = "ST_Y(p.geom::geometry)", "ST_X(p.geom::geometry)"
    elif {"latitude", "longitude"}.issubset(poi_columns):
        latitude_expression, longitude_expression = "p.latitude", "p.longitude"
    elif {"lat", "lng"}.issubset(poi_columns):
        latitude_expression, longitude_expression = "p.lat", "p.lng"
    else:
        latitude_expression = longitude_expression = "NULL"

    optional = {
        "address": "NULL::text",
        "estimated_cost": "NULL::double precision",
        "budget_tier": "NULL::text",
        "satisfaction_score": "NULL::double precision",
        "image_url": "NULL::text",
        "website_url": "NULL::text",
        "status": "NULL::text",
        "sub_category": "NULL::text",
        "price_unit": "NULL::text",
        "currency": "NULL::text",
        "max_guests_per_room": "NULL::text",
        "review_count": "NULL::text",
        "check_in": "NULL::text",
        "check_out": "NULL::text",
        "updated_at": "NULL::text",
        "ai_metadata": "'{}'::jsonb",
    }
    expressions = {
        name: (f"p.{name}::text" if name in poi_columns else fallback)
        for name, fallback in optional.items()
    }
    if "ai_metadata" in poi_columns:
        stay_metadata_keys = (
            "price_unit", "currency", "amenities", "room_types", "max_guests_per_room",
            "review_count", "check_in", "check_out", "sustainability_evidence", "updated_at",
        )
        pairs = ", ".join(f"'{key}', p.ai_metadata->'{key}'" for key in stay_metadata_keys)
        expressions["ai_metadata"] = f"jsonb_strip_nulls(jsonb_build_object({pairs}))"
    category_terms = [
        "%hotel%", "%accommodation%", "%lodging%", "%homestay%", "%hostel%", "%motel%",
        "%resort%", "%guest house%", "%guesthouse%", "%serviced apartment%", "%villa%",
        "%bungalow%", "%eco stay%", "%eco_stay%", "%khách sạn%", "%lưu trú%",
    ]
    category_clause = f"LOWER(COALESCE({category_expression}, '')) LIKE ANY(%s)"
    subcategory_clause = "LOWER(COALESCE(p.sub_category, '')) LIKE ANY(%s)" if "sub_category" in poi_columns else None
    active_clause = "p.is_active IS TRUE"
    if "status" in poi_columns:
        active_clause += " AND COALESCE(UPPER(p.status::text), '') NOT IN " \
            "('INACTIVE','CLOSED','CLOSED_PERMANENTLY','DELETED','ARCHIVED','DISABLED','UNPUBLISHED','DRAFT','PENDING','SUSPENDED','REMOVED')"

    category_filter = f"({category_clause} OR {subcategory_clause})" if subcategory_clause else category_clause
    params: list[Any] = [*city_params, category_terms]
    if subcategory_clause:
        params.append(category_terms)
    params.append(300)
    query = f"""
        SELECT {id_expression} AS poi_id, p.name, {category_expression} AS category_name,
               {"p.city_id::text" if "city_id" in poi_columns else "NULL::text"} AS city_id,
               {city_expression} AS city_name,
               {latitude_expression} AS latitude, {longitude_expression} AS longitude,
               {expressions['address']} AS address,
               {expressions['estimated_cost']} AS estimated_cost,
               {expressions['budget_tier']} AS budget_tier,
               {expressions['satisfaction_score']} AS satisfaction_score,
               {expressions['image_url']} AS image_url,
               {expressions['website_url']} AS website_url,
                {expressions['status']} AS status,
               p.is_active AS is_active,
               {expressions['sub_category']} AS sub_category,
                {expressions['price_unit']} AS price_unit,
                {expressions['currency']} AS currency,
                {expressions['max_guests_per_room']} AS max_guests_per_room,
                {expressions['review_count']} AS review_count,
                {expressions['check_in']} AS check_in,
                {expressions['check_out']} AS check_out,
                {expressions['updated_at']} AS updated_at,
               {expressions['ai_metadata']} AS ai_metadata
         FROM public.pois p
         {' '.join(joins)}
        WHERE {active_clause}
           AND {city_filter}
          AND {category_filter}
        ORDER BY p.name ASC, {id_expression} ASC
        LIMIT %s
    """
    with connection.cursor() as cursor:
        cursor.execute(query, tuple(params))
        columns = [column.name for column in cursor.description]
        rows = cursor.fetchall()
    result = []
    for row in rows:
        item = dict(zip(columns, row))
        metadata = item.get("ai_metadata")
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except (ValueError, TypeError):
                metadata = {}
        item["ai_metadata"] = metadata if isinstance(metadata, dict) else {}
        item["repository_source"] = "postgres"
        result.append(item)
    return result

