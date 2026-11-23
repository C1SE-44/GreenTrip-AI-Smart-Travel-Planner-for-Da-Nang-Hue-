from typing import Any

from app.db.postgres import get_connection
from app.pois.model import POI
from app.pois.price_normalizer import normalize_poi_price_display
from app.pois.weights import ParsedSliderWeights


CITY_ALIAS_MAP: dict[str, str] = {
    "da nang": "DANANG",
    "danang": "DANANG",
    "đà nẵng": "DANANG",
    "hue": "HUE",
    "huế": "HUE",
}

SPIRITUAL_CATEGORY_NAMES = ["Tâm linh & Tôn giáo", "Tâm linh và chùa thiền"]


CATEGORY_ALIAS_MAP: dict[str, list[str]] = {
    "di-tich": ["Di tích lịch sử và văn hóa", "Tâm linh và chùa thiền"],
    "di tích": ["Di tích lịch sử và văn hóa", "Tâm linh và chùa thiền"],
    "canh-quan": ["Cảnh quan và thiên nhiên"],
    "cảnh quan": ["Cảnh quan và thiên nhiên"],
    "chua": SPIRITUAL_CATEGORY_NAMES,
    "chùa": SPIRITUAL_CATEGORY_NAMES,
    "tam-linh": SPIRITUAL_CATEGORY_NAMES,
    "tâm linh": SPIRITUAL_CATEGORY_NAMES,
    "quan-an": ["Ẩm thực và quán ăn", "Quán cafe giải khát"],
    "quán ăn": ["Ẩm thực và quán ăn", "Quán cafe giải khát"],
    "am-thuc": ["Ẩm thực và quán ăn"],
    "ẩm thực": ["Ẩm thực và quán ăn"],
    "cafe": ["Quán cafe giải khát"],
    "cà phê": ["Quán cafe giải khát"],
    "giai-tri": ["Cảnh quan và thiên nhiên"],
    "bao-tang": ["Di tích lịch sử và văn hóa"],
}


GREEN_TRANSIT_SQL_PATTERN: str = (
    r"(transit|bus|bike|bicycle|walk|pedestrian|electric|\yev\y|"
    r"xe buýt|xe đạp|đi bộ|xe điện|giao thông xanh)"
)


def list_pois(
    limit: int,
    offset: int,
    category: str | None = None,
    city: str | None = None,
    sub_category: str | None = None,
    cuisine: str | None = None,
    budget_tier: str | None = None,
    weights: ParsedSliderWeights | None = None,
    q: str | None = None,
    ids: list[str] | None = None,
    view: str = "full",
    sort: str = "name",
) -> tuple[list[POI], int]:
    with get_connection() as connection:
        where_clauses: list[str] = ["p.is_active = TRUE"]
        params: list[Any] = []

        if ids is not None:
            where_clauses.append("p.poi_id::text = ANY(%s)")
            params.append(ids)
        if q and q.strip():
            escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            where_clauses.append("(p.name ILIKE %s OR p.description ILIKE %s OR p.address ILIKE %s)")
            params.extend([f"%{escaped}%"] * 3)

        if category and category.strip().casefold() not in {"all", ""}:
            cat_norm = category.strip().casefold()
            if cat_norm in CATEGORY_ALIAS_MAP:
                where_clauses.append("c.name = ANY(%s)")
                params.append(CATEGORY_ALIAS_MAP[cat_norm])
            else:
                where_clauses.append("c.name ILIKE %s")
                params.append(f"%{category.strip()}%")

            # Match the FE's separate Heritage/Spiritual tabs on summary pages.
            # Full view retains the legacy alias for existing consumers.
            if view == "summary" and cat_norm == "di-tich":
                where_clauses.append("NOT (c.name = ANY(%s))")
                params.append(SPIRITUAL_CATEGORY_NAMES)

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

        if weights is not None and weights.is_filtering_active:
            if weights.min_eco_score > 0:
                where_clauses.append(
                    "(CASE WHEN p.green_score IS NULL THEN 0.0 "
                    "WHEN p.green_score <= 1.0 THEN p.green_score::float * 100.0 "
                    "ELSE p.green_score::float END) >= %s"
                )
                params.append(float(weights.min_eco_score))

            if weights.max_budget is not None and not (
                budget_tier and budget_tier.strip().casefold() not in {"all", ""}
            ):
                where_clauses.append(
                    "("
                    "CASE "
                    "WHEN p.estimated_cost IS NOT NULL THEN p.estimated_cost::float "
                    "WHEN LOWER(TRIM(COALESCE(p.budget_tier, ''))) = 'free' THEN 0.0 "
                    "WHEN TRIM(COALESCE(p.budget_tier, '')) = '$' THEN 100000.0 "
                    "WHEN TRIM(COALESCE(p.budget_tier, '')) = '$$' THEN 400000.0 "
                    "WHEN TRIM(COALESCE(p.budget_tier, '')) = '$$$' THEN 1000000.0 "
                    "WHEN TRIM(COALESCE(p.budget_tier, '')) = '$$$$' THEN 1500000.0 "
                    "ELSE NULL END"
                    ") <= %s"
                )
                params.append(float(weights.max_budget))

            if weights.eco_certified_only:
                where_clauses.append(
                    "((CASE WHEN p.green_score IS NULL THEN 0.0 "
                    "WHEN p.green_score <= 1.0 THEN p.green_score::float * 100.0 "
                    "ELSE p.green_score::float END) >= 75.0 "
                    "OR COALESCE(array_length(p.eco_features, 1), 0) > 0)"
                )

            if weights.green_transit_only:
                where_clauses.append(
                    "("
                    "array_to_string(COALESCE(p.eco_features, ARRAY[]::text[]), ' ') ~* %s "
                    "OR (p.ai_metadata->>'green_transit') = 'true' "
                    "OR ("
                    "jsonb_typeof(p.ai_metadata->'carbon_footprint_score') = 'number' "
                    "AND (p.ai_metadata->>'carbon_footprint_score')::float >= 75.0"
                    ")"
                    ")"
                )
                params.append(GREEN_TRANSIT_SQL_PATTERN)

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        if sort == "curated":
            green_sql = "(CASE WHEN p.green_score <= 1 THEN p.green_score * 100 ELSE COALESCE(p.green_score, 50) END >= 75)"
            rating_sql = "COALESCE(CASE WHEN jsonb_typeof(p.ai_metadata->'raw_rating') = 'number' THEN (p.ai_metadata->>'raw_rating')::float END, NULLIF(p.satisfaction_score, 0), 4.6)"
            order_by_sql = f"ORDER BY ({green_sql} OR POSITION('michelin' IN LOWER(COALESCE(p.name, '') || ' ' || COALESCE(p.description, ''))) > 0) DESC, {green_sql} DESC, {rating_sql} DESC, p.name ASC, p.poi_id ASC"
        elif weights is not None and weights.is_ranking_active:
            green_norm_sql = (
                "(CASE WHEN p.green_score IS NULL THEN 0.5 "
                "WHEN p.green_score < 0 THEN 0.0 "
                "WHEN p.green_score <= 1.0 THEN p.green_score::float "
                "ELSE LEAST(1.0, p.green_score::float / 100.0) END)"
            )
            budget_norm_sql = (
                "(CASE WHEN p.estimated_cost IS NOT NULL THEN "
                "GREATEST(0.0, 1.0 - LEAST(GREATEST(0.0, p.estimated_cost::float), 1000000.0) / 1000000.0) "
                "WHEN LOWER(TRIM(COALESCE(p.budget_tier, ''))) = 'free' THEN 1.0 "
                "WHEN TRIM(COALESCE(p.budget_tier, '')) = '$' THEN 0.9 "
                "WHEN TRIM(COALESCE(p.budget_tier, '')) = '$$' THEN 0.65 "
                "WHEN TRIM(COALESCE(p.budget_tier, '')) = '$$$' THEN 0.3 "
                "WHEN TRIM(COALESCE(p.budget_tier, '')) = '$$$$' THEN 0.0 "
                "ELSE 0.5 END)"
            )
            w_g = float(weights.normalized_green_weight)
            w_b = float(weights.normalized_budget_weight)
            order_by_sql = (
                f"ORDER BY ({w_g} * {green_norm_sql} + {w_b} * {budget_norm_sql}) DESC, p.name ASC, p.poi_id ASC"
            )
        else:
            order_by_sql = "ORDER BY p.name ASC, p.poi_id ASC"

        metadata_sql = "p.ai_metadata"
        if view == "summary":
            metadata_sql = "(p.ai_metadata - ARRAY['featured_reviews', 'sample_reviews', 'menu_items', 'menu_image_url', 'cleaning_rules_applied', 'dedup_key'])"
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
                    {metadata_sql} AS ai_metadata,
                    {'NULL' if view == 'summary' else 'p.phone_number'} AS phone_number,
                    {'NULL' if view == 'summary' else 'p.website_url'} AS website_url,
                    {'NULL' if view == 'summary' else 'p.social_links'} AS social_links,
                    p.opening_hours AS opening_hours,
                    {'NULL' if view == 'summary' else 'p.email'} AS email,
                    COALESCE(saved_counts.saved_count, 0) AS saved_count
                FROM public.pois p
                JOIN public.poi_categories c ON p.category_id = c.category_id
                JOIN public.cities ci ON p.city_id = ci.city_id
                LEFT JOIN (
                    SELECT
                        i.poi_id,
                        COUNT(DISTINCT c.user_id)::int AS saved_count
                    FROM public.saved_place_collection_items AS i
                    JOIN public.saved_place_collections AS c
                      ON c.collection_id = i.collection_id
                     AND c.user_id = i.user_id
                    GROUP BY i.poi_id
                ) AS saved_counts ON saved_counts.poi_id = p.poi_id
                {where_sql}
                {order_by_sql}
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

    items: list[POI] = []
    for row in rows:
        poi = POI(*row)
        raw_meta = poi.ai_metadata
        if isinstance(raw_meta, dict) and raw_meta.get("price_range_display"):
            normalized_price = normalize_poi_price_display(
                poi_name=poi.name,
                category=poi.category,
                sub_category=poi.sub_category,
                raw_price_display=str(raw_meta["price_range_display"]),
                estimated_cost=poi.estimated_cost,
            )
            if normalized_price != raw_meta.get("price_range_display"):
                poi = POI(
                    **{
                        **poi.__dict__,
                        "ai_metadata": {**raw_meta, "price_range_display": normalized_price},
                    }
                )
        items.append(poi)
    return items, int(count_row[0])
