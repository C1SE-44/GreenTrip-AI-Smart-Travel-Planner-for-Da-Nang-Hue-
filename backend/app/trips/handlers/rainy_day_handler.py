"""
Handler for rainy day alternatives (Task 3.33).
"""
from __future__ import annotations

import logging
from typing import Any
from psycopg import Connection
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload
from app.trips.handlers.swap_meal_handler import format_green_score, normalize_city_query

logger = logging.getLogger(__name__)

INDOOR_SUB_CATEGORIES = [
    "museums_galleries",
    "museum",
    "art_space",
    "performance",
    "performing_arts_heritage",
    "workspace_study_cafe",
    "tea_herbal",
    "royal_herbal_tea",
    "cathedrals_heritage_churches",
    "historic_zen_temples",
    "pagoda",
    "market",
    "wellness",
    "royal_mausoleums",
]

OUTDOOR_EXCLUSIONS = [
    "beach",
    "beach_coastline",
    "mountain_pass_peninsula",
    "mountain",
    "waterfall",
    "waterfalls_hotsprings",
    "stream",
    "camping",
    "adventure",
    "snorkeling",
    "bay",
    "peninsula",
]


def handle_rainy_day(
    trip_context: TripContextPayload,
    connection: Connection,
) -> tuple[str, list[CopilotSuggestedPoiItem]]:
    """
    Search and return top indoor, sheltered cultural, heritage or cafe experiences.
    """
    city_pattern, is_both = normalize_city_query(trip_context.destination)
    current_stop_name = trip_context.current_stop_name or "các điểm ngoài trời"
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
        WHERE p.is_active IS NOT FALSE
          AND (ci.name ILIKE %s OR %s = TRUE)
          AND (
            (p.ai_metadata->>'rainy_day_friendly') = 'true'
            OR p.sub_category = ANY(%s)
          )
          AND (p.sub_category IS NULL OR NOT (p.sub_category = ANY(%s)))
        ORDER BY p.satisfaction_score DESC NULLS LAST, p.green_score DESC NULLS LAST
        LIMIT 3;
    """

    suggested_pois: list[CopilotSuggestedPoiItem] = []

    try:
        with connection.cursor() as cur:
            cur.execute(query, (city_pattern, is_both, INDOOR_SUB_CATEGORIES, OUTDOOR_EXCLUSIONS))
            rows = cur.fetchall()

            for r in rows:
                poi_id = r[0]
                name = r[1]
                category = r[2]
                sub_category = r[3] or "indoor_heritage"
                image_url = r[4] or "https://upload.wikimedia.org/wikipedia/commons/1/14/Ngu_Hanh_Son_Da_Nang.jpg"
                green_score = format_green_score(r[5])
                rating = float(r[6]) if r[6] is not None else 4.7
                address = r[7] or "Đang cập nhật địa chỉ"
                cost = float(r[8]) if r[8] is not None else None
                meta = r[9] if isinstance(r[9], dict) else {}
                city_name = r[10]

                price_display = meta.get("price_range_display") if isinstance(meta, dict) else None
                if not price_display and cost is not None:
                    price_display = "Miễn phí tham quan" if cost == 0 else f"Vé tham quan khoảng {int(cost):,} ₫/người"

                swap_reason = (
                    f"Không gian trong nhà / có mái che kiên cố tại {city_name}, hoàn hảo khi trời mưa. "
                    f"Giúp bạn vừa giữ ấm, vừa thưởng ngoạn văn hóa nghệ thuật trọn vẹn mà không lo thời tiết gián đoạn {current_stop_name}."
                )

                suggested_pois.append(
                    CopilotSuggestedPoiItem(
                        id=poi_id,
                        name=name,
                        category="Điểm tham quan trong nhà",
                        sub_category=sub_category,
                        image_url=image_url,
                        green_score=green_score,
                        rating=rating,
                        address=address,
                        swap_reason=swap_reason,
                        distance_info="Điểm đến trong nhà có mái che • An toàn khi trời mưa",
                        estimated_cost=cost,
                        price_range_display=price_display or "Miễn phí hoặc theo giá vé tại cửa",
                        budget_delta="Vé vào cổng ~30.000 ₫",
                        carbon_saved="Điểm tham quan sinh thái",
                    )
                )
    except Exception as exc:
        logger.exception("Error querying indoor rainy day POIs: %s", exc)

    dest_lower = (trip_context.destination or "").lower()
    dest_display = "Huế" if any(k in dest_lower for k in ["huế", "hue"]) else "Đà Nẵng"
    reply_text = (
        f"Dự báo thời tiết có thể có mưa tại {dest_display}! Mình đã tìm thấy {len(suggested_pois)} không gian văn hóa, "
        f"bảo tàng và quán trà/cafe ấm cúng có mái che lý tưởng để thay thế cho {day_label}:"
    )

    return reply_text, suggested_pois
