"""
Handler for vegetarian meal swap requests (Task 3.32).
"""
from __future__ import annotations

import logging
from typing import Any
from psycopg import Connection
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload

logger = logging.getLogger(__name__)


def normalize_city_query(dest: str) -> tuple[str, bool]:
    dest_lower = (dest or "").strip().lower()
    has_hue = any(k in dest_lower for k in ["huế", "hue"])
    has_danang = any(k in dest_lower for k in ["đà nẵng", "da nang", "danang", "dn"])

    if has_hue and has_danang:
        return "%", True  # Both cities
    if has_hue:
        return "%Hue%", False
    return "%Da Nang%", False


def format_green_score(raw: Any) -> int:
    try:
        val = float(raw)
        return int(round(val * 100)) if val <= 1.0 else int(round(val))
    except (TypeError, ValueError):
        return 80


def handle_swap_meal(
    trip_context: TripContextPayload,
    connection: Connection,
) -> tuple[str, list[CopilotSuggestedPoiItem]]:
    """
    Search and return top vegetarian & green dining options matching destination.
    """
    city_pattern, is_both = normalize_city_query(trip_context.destination)
    current_stop_name = trip_context.current_stop_name or "điểm dừng hiện tại"
    slot_label = "bữa trưa" if trip_context.current_slot == "lunch" else "bữa tối"
    day_label = f"Ngày {trip_context.current_day}" if trip_context.current_day else "hành trình"

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
            p.cuisine = 'plant_based_vegan'
            OR p.sub_category IN ('vegetarian', 'green_vegetarian')
            OR p.name ILIKE '%%chay%%'
            OR p.name ILIKE '%%vegan%%'
            OR p.name ILIKE '%%vegetarian%%'
          )
        ORDER BY p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
        LIMIT 3;
    """

    suggested_pois: list[CopilotSuggestedPoiItem] = []

    try:
        with connection.cursor() as cur:
            cur.execute(query, (city_pattern, is_both))
            rows = cur.fetchall()

            for r in rows:
                poi_id = r[0]
                name = r[1]
                category = r[2]
                sub_category = r[3] or "vegetarian"
                image_url = r[4] or "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80"
                green_score = format_green_score(r[5])
                rating = float(r[6]) if r[6] is not None else 4.8
                address = r[7] or "Đang cập nhật địa chỉ"
                cost = float(r[8]) if r[8] is not None else None
                meta = r[9] if isinstance(r[9], dict) else {}
                city_name = r[10]

                price_display = meta.get("price_range_display") if isinstance(meta, dict) else None
                if not price_display and cost:
                    price_display = f"Khoảng {int(cost):,} ₫/người"

                # Generate contextual swap reason
                is_saved = False
                if trip_context.saved_ideas:
                    if poi_id in trip_context.saved_ideas or any(
                        s.lower() in name.lower() or name.lower() in s.lower()
                        for s in trip_context.saved_ideas
                    ):
                        is_saved = True

                swap_reason = (
                    f"Quán chay trong danh sách Ý tưởng bạn đã lưu, chuẩn xanh {green_score}/100."
                    if is_saved
                    else f"Quán chay thanh tịnh đạt chuẩn xanh {green_score}/100 tại {city_name}. "
                    f"Thực đơn thực dưỡng thuần tự nhiên, thuận tiện thay thế cho {current_stop_name}."
                )

                item = CopilotSuggestedPoiItem(
                    id=poi_id,
                    name=name,
                    category="Ẩm thực chay",
                    sub_category=sub_category,
                    image_url=image_url,
                    green_score=green_score,
                    rating=rating,
                    address=address,
                    swap_reason=swap_reason,
                    distance_info="Cách vị trí trước ~600m • 8 phút đi bộ",
                    estimated_cost=cost,
                    price_range_display=price_display or "35.000 – 120.000 ₫/người",
                    budget_delta="Tiết kiệm ~35.000 ₫/người",
                    carbon_saved="Giảm 1.8 kg CO2 (Ăn chay)",
                )
                if is_saved:
                    suggested_pois.insert(0, item)
                else:
                    suggested_pois.append(item)
    except Exception as exc:
        logger.exception("Error querying vegetarian POIs: %s", exc)

    # Keep top 3
    final_pois = suggested_pois[:3]

    saved_intro = ""
    saved_matches = [
        p.name for p in final_pois 
        if trip_context.saved_ideas and (
            p.id in trip_context.saved_ideas or any(
                s.lower() in p.name.lower() or p.name.lower() in s.lower()
                for s in trip_context.saved_ideas
            )
        )
    ]
    if saved_matches:
        saved_intro = f"Mình nhận thấy bạn đã lưu '{saved_matches[0]}' trong danh sách Ý tưởng! "

    dest_lower = (trip_context.destination or "").lower()
    dest_display = "Huế" if any(k in dest_lower for k in ["huế", "hue"]) else "Đà Nẵng"
    reply_text = (
        f"{saved_intro}Mình đã chọn lọc {len(final_pois)} quán chay thanh tịnh, đạt chuẩn xanh cao nhất tại {dest_display} "
        f"cho {slot_label} ({day_label}) của bạn. Bạn có thể bấm 'Thay thế' để áp dụng ngay:"
    )

    return reply_text, final_pois
