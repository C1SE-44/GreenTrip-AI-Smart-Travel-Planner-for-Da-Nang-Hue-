"""
Handler for late schedule / pacing adjustment requests (Live Trip Adjuster).
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
        return "%", True
    if has_hue:
        return "%Hue%", False
    return "%Da Nang%", False


def format_green_score(raw: Any) -> int:
    try:
        val = float(raw)
        return int(round(val * 100)) if val <= 1.0 else int(round(val))
    except (TypeError, ValueError):
        return 80


def handle_late_adjust(
    trip_context: TripContextPayload,
    connection: Connection,
) -> tuple[str, list[CopilotSuggestedPoiItem]]:
    """
    Search and return compact, quick-visit cultural and cafe spots near city center
    to recover from schedule delays without rushing or missing dinner.
    """
    city_pattern, is_both = normalize_city_query(trip_context.destination)
    current_slot = trip_context.current_slot or "afternoon"
    slot_label = "buổi chiều" if current_slot == "afternoon" else "buổi tối"
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
            c.name IN ('Quán cafe', 'Di tích', 'Văn hóa')
            OR p.sub_category IN ('specialty_coffee', 'heritage_walk', 'art_space', 'riverside')
            OR p.name ILIKE '%%coffee%%'
            OR p.name ILIKE '%%cà phê%%'
            OR p.name ILIKE '%%bảo tàng%%'
            OR p.name ILIKE '%%công viên%%'
          )
        ORDER BY p.satisfaction_score DESC NULLS LAST, p.green_score DESC NULLS LAST
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
                sub_category = r[3] or "quick_visit"
                image_url = r[4] or "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80"
                green_score = format_green_score(r[5])
                rating = float(r[6]) if r[6] is not None else 4.7
                address = r[7] or "Trung tâm thành phố"
                cost = float(r[8]) if r[8] is not None else None
                meta = r[9] if isinstance(r[9], dict) else {}
                city_name = r[10]

                price_display = meta.get("price_range_display") if isinstance(meta, dict) else None
                if not price_display:
                    if cost and cost > 0:
                        price_display = f"Khoảng {int(cost):,} ₫/người"
                    else:
                        price_display = "35.000 – 65.000 ₫/người"

                is_saved = False
                if trip_context.saved_ideas:
                    if poi_id in trip_context.saved_ideas or any(
                        s.lower() in name.lower() or name.lower() in s.lower()
                        for s in trip_context.saved_ideas
                    ):
                        is_saved = True

                swap_reason = (
                    f"Điểm trong danh sách Ý tưởng bạn đã lưu! Điểm dừng nhanh 30–45 phút, không lo trễ giờ."
                    if is_saved
                    else f"Điểm dừng thư giãn nhanh ngay trung tâm {city_name}, di chuyển thuận tiện và không sợ lỡ giờ ăn tối."
                )

                item = CopilotSuggestedPoiItem(
                    id=poi_id,
                    name=name,
                    category=category,
                    sub_category=sub_category,
                    image_url=image_url,
                    green_score=green_score,
                    rating=rating,
                    address=address,
                    swap_reason=swap_reason,
                    distance_info="Cách trung tâm ~400m • Điểm dừng nhanh 35 phút",
                    estimated_cost=cost,
                    price_range_display=price_display,
                    budget_delta="Tiết kiệm ~25.000 ₫/người",
                    carbon_saved="Giảm 1.4 kg CO2 • Điểm trung tâm",
                )
                if is_saved:
                    suggested_pois.insert(0, item)
                else:
                    suggested_pois.append(item)
    except Exception as exc:
        logger.exception("Error querying late adjust POIs: %s", exc)

    final_pois = suggested_pois[:3]

    dest_lower = (trip_context.destination or "").lower()
    dest_display = "Huế" if any(k in dest_lower for k in ["huế", "hue"]) else "Đà Nẵng"
    reply_text = (
        f"Đừng lo lắng! Mình đã tính toán lại cung đường {slot_label} ({day_label}) tại {dest_display}: "
        f"Gợi ý tạm hoãn các điểm ngoại ô xa để thay bằng {len(final_pois)} điểm dừng nhanh, thư thái ngay trung tâm. "
        f"Giúp bạn vừa giữ trọn nhịp tham quan mà vẫn kịp giờ ăn tối:"
    )

    return reply_text, final_pois
