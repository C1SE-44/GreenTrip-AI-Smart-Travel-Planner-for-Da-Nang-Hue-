"""
Handler for night eco experiences & evening culture exploration (Task PB14 expansion).
"""
from __future__ import annotations

import logging
from typing import Any
from psycopg import Connection
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload
from app.trips.handlers.swap_meal_handler import format_green_score, normalize_city_query

logger = logging.getLogger(__name__)

NIGHT_ECO_SUB_CATEGORIES = [
    "bridge",
    "scenic_bridge",
    "traditional_night_markets",
    "night_market",
    "performance",
    "performing_arts_heritage",
    "scenic_view_cafe",
    "pedestrian_street",
    "walking_street",
]


def handle_night_eco(
    trip_context: TripContextPayload,
    connection: Connection,
) -> tuple[str, list[CopilotSuggestedPoiItem]]:
    """
    Search and return top sustainable night & cultural evening experiences.
    """
    city_pattern, is_both = normalize_city_query(trip_context.destination)
    day_label = f"Ngày {trip_context.current_day}" if trip_context.current_day else "chuyến đi"

    query = """
        SELECT 
            p.poi_id::text,
            p.name,
            c.name AS category_name,
            p.sub_category,
            p.image_url,
            p.green_score,
            p.satisfaction_score,
            p.address,
            p.estimated_cost,
            p.ai_metadata,
            ci.name AS city_name
        FROM public.pois p
        JOIN public.poi_categories c ON p.category_id = c.category_id
        JOIN public.cities ci ON p.city_id = ci.city_id
        WHERE p.is_active = TRUE
          AND (
              ci.name ILIKE %s 
              OR %s = TRUE
          )
          AND (
              p.sub_category = ANY(%s)
              OR (
                  p.name ILIKE '%%Cầu Rồng%%' OR p.name ILIKE '%%Bạch Đằng%%' OR
                  p.name ILIKE '%%Sông Hàn%%' OR p.name ILIKE '%%Ca Huế%%' OR
                  p.name ILIKE '%%Trường Tiền%%' OR p.name ILIKE '%%Tràng Tiền%%' OR
                  p.name ILIKE '%%Chợ đêm%%' OR p.name ILIKE '%%Gỗ Lim%%'
              )
          )
        ORDER BY p.green_score DESC, p.satisfaction_score DESC
        LIMIT 10;
    """

    items: list[CopilotSuggestedPoiItem] = []
    saved_matches: list[str] = []

    try:
        with connection.cursor() as cur:
            cur.execute(
                query,
                (city_pattern, is_both, NIGHT_ECO_SUB_CATEGORIES),
            )
            rows = cur.fetchall()

            for row in rows:
                poi_id = row[0]
                name = row[1]
                category_name = row[2]
                sub_category = row[3]
                image_url = row[4] or "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=600&auto=format&fit=crop&q=80"
                green_score = format_green_score(row[5])
                rating = float(row[6]) if row[6] is not None else 4.7
                address = row[7] or f"{row[10]}, Việt Nam"
                estimated_cost = float(row[8]) if row[8] is not None else 0.0

                price_display = "Miễn phí"
                if estimated_cost and estimated_cost > 0:
                    price_display = f"Từ {int(estimated_cost):,}₫".replace(",", ".")

                # Check if this POI is already in user's saved ideas
                is_saved = False
                if trip_context.saved_ideas:
                    if poi_id in trip_context.saved_ideas or any(
                        s.lower() in name.lower() or name.lower() in s.lower()
                        for s in trip_context.saved_ideas
                    ):
                        is_saved = True
                        saved_matches.append(name)

                swap_reason = (
                    "Địa điểm trong danh sách Ý tưởng bạn đã lưu, hoàn hảo cho trải nghiệm đêm."
                    if is_saved
                    else f"Trải nghiệm đêm chuẩn xanh tại {row[10]}, thuận tiện đi bộ và thưởng ngoạn văn hóa buổi tối."
                )

                item = CopilotSuggestedPoiItem(
                    id=poi_id,
                    name=name,
                    category="Trải nghiệm đêm chuẩn xanh",
                    sub_category=sub_category or category_name,
                    image_url=image_url,
                    green_score=green_score,
                    rating=round(rating, 1),
                    address=address,
                    swap_reason=swap_reason,
                    distance_info="Đi bộ hoặc xe bus điện thuận tiện",
                    estimated_cost=estimated_cost,
                    price_range_display=price_display,
                    budget_delta="Miễn phí trải nghiệm",
                    carbon_saved="0 phát thải (Tuyến đi bộ)",
                )

                # Prioritize saved ideas at top of list
                if is_saved:
                    items.insert(0, item)
                else:
                    items.append(item)

    except Exception as exc:
        logger.error("Failed to query night eco POIs: %s", exc)

    final_items = items[:3]

    saved_intro = ""
    if saved_matches:
        saved_intro = f"Mình nhận thấy bạn đã lưu '{saved_matches[0]}' trong danh sách Ý tưởng! "

    reply_text = (
        f"{saved_intro}Buổi tối tại {trip_context.destination} có rất nhiều trải nghiệm đêm văn hóa thanh bình, "
        f"thuận tiện đi bộ hoặc xe bus công cộng mà không tạo phát thải lớn. Dưới đây là 3 gợi ý lý tưởng cho buổi tối {day_label}:"
    )

    return reply_text, final_items
