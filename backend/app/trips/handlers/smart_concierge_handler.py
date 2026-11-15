"""
Universal Smart Concierge Handler (PB14 - Travel Copilot).
Replaces rigid boilerplate greeting with empathetic, deeply inspiring travel guidance
and top-rated green recommendations from the database.
"""
from __future__ import annotations

import logging
import re
from psycopg import Connection
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload
from app.trips.handlers.swap_meal_handler import normalize_city_query, format_green_score
from app.trips.text_utils import strip_vietnamese_accents

logger = logging.getLogger(__name__)

_GREETING_WORDS = (
    r"xin|ch[aà]o|b[aạ]n|tr[oợ]|l[yý]|ai|copilot|hello|hi|hey|alo|ad|admin|"
    r"shop|bot|[oơ]i|nh[eéa]|v[oớ]i|m[iì]nh|em|anh|ch[iị]|t[oô]i|"
    r"bu[oổ]i|s[aá]ng|tr[uư]a|chi[eề]u|t[oố]i|good|morning|afternoon|evening"
)
_GREETING_RE = re.compile(
    rf"^(?=.*\b(?:xin ch[aà]o|ch[aà]o|hello|hi|hey|alo|good (?:morning|afternoon|evening))\b)"
    rf"(?:{_GREETING_WORDS})(?:\s+(?:{_GREETING_WORDS})){{0,7}}$"
)


def is_simple_social_greeting(message: str) -> bool:
    """Return True only for short, pure social greetings with no travel request."""
    norm = " ".join(re.sub(r"[^\w\s]|_", " ", strip_vietnamese_accents((message or "").lower())).split())
    return not norm or bool(_GREETING_RE.fullmatch(norm))


def handle_smart_concierge(
    message: str,
    trip_context: TripContextPayload,
    connection: Connection,
) -> tuple[str, list[CopilotSuggestedPoiItem], str, list[str], str | None, str | None, str | None]:
    """
    Generate an inspiring, empathetic concierge response with top local recommendations.
    Returns:
        (reply_text, suggested_pois, action_type, next_prompts, avoid_notice, green_impact, budget_impact)
    """
    dest = trip_context.destination or "Đà Nẵng"
    days = trip_context.days_count or 3
    is_hue = "hue" in dest.lower() or "huế" in dest.lower()
    city_pattern, is_both = normalize_city_query(dest)
    caller = (
        trip_context.traveler_name.strip().split()[-1]
        if trip_context.traveler_name and trip_context.traveler_name.strip()
        else "bạn"
    )

    if is_hue:
        prompts = [
            "Gợi ý các quán ăn ngon nhất ở Huế",
            "Quán cafe muối ngon chuẩn gốc ở đâu?",
            "Lịch trình tham quan lăng tẩm và Đại Nội",
            "Đặc sản Huế nên mua về làm quà?",
        ]
    else:
        prompts = [
            "Gợi ý các quán ăn ngon nhất ở Đà Nẵng",
            "Có nên đi Bán Đảo Sơn Trà không?",
            "Quán cafe view biển hoặc sông Hàn đẹp?",
            "Trời mưa thì đi đâu chơi?",
        ]

    # Pure social greeting ('xin chào', 'hello', 'hi'): short 2-sentence reply, no unsolicited POIs/map pins
    if is_simple_social_greeting(message):
        if getattr(trip_context, "mode", "trip") == "ideation":
            ideation_prompts = [
                "Tháng 11 đi Đà Nẵng – Huế thời tiết thế nào, có hay mưa không?",
                "Đặc sản nhất định phải thử ở Đà Nẵng và Huế là gì?",
                "Nên đi Đà Nẵng – Huế mấy ngày thì vừa đẹp?",
                "Gợi ý trải nghiệm du lịch xanh ít đông đúc ở miền Trung?",
            ]
            reply_text = (
                f"Chào {caller}! Mình là trợ lý GreenTrip — bạn cứ hỏi tự do về **thời tiết, đặc sản, chi phí hay nên đi Đà Nẵng – Huế mấy ngày**.\n"
                "Khi nào có ý tưởng ưng ý, bấm **\"Tạo lịch trình từ ý tưởng này\"** để mình dựng ngay kế hoạch chi tiết cho bạn nhé!"
            )
            return (
                reply_text,
                [],
                "none",
                ideation_prompts,
                None,
                None,
                None,
            )
        reply_text = (
            f"Chào {caller}! Mình là GreenTrip Copilot đồng hành cùng bạn trong chuyến đi **{dest} ({days} ngày)**.\n"
            "Bạn muốn mình gợi ý quán ăn bản địa, điểm tham quan xanh hay tinh chỉnh lại lịch trình ngày nào trước?"
        )
        return (
            reply_text,
            [],
            "none",
            prompts,
            None,
            None,
            None,
        )

    suggested_pois: list[CopilotSuggestedPoiItem] = []

    # Query 3 balanced top-tier POIs: 1 nature/heritage, 1 cuisine, 1 cafe
    try:
        with connection.cursor() as cur:
            query = """
                (
                    SELECT 
                        p.poi_id::text, p.name, c.name, p.sub_category, p.image_url, 
                        p.green_score, p.satisfaction_score, p.address, p.estimated_cost, 
                        p.ai_metadata, ci.name, p.gallery_urls
                    FROM public.pois p
                    JOIN public.poi_categories c ON p.category_id = c.category_id
                    JOIN public.cities ci ON p.city_id = ci.city_id
                    WHERE p.is_active IS NOT FALSE AND (ci.name ILIKE %s OR %s = TRUE)
                      AND (c.name ILIKE '%%cảnh quan%%' OR c.name ILIKE '%%di tích%%')
                    ORDER BY p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
                    LIMIT 1
                )
                UNION ALL
                (
                    SELECT 
                        p.poi_id::text, p.name, c.name, p.sub_category, p.image_url, 
                        p.green_score, p.satisfaction_score, p.address, p.estimated_cost, 
                        p.ai_metadata, ci.name, p.gallery_urls
                    FROM public.pois p
                    JOIN public.poi_categories c ON p.category_id = c.category_id
                    JOIN public.cities ci ON p.city_id = ci.city_id
                    WHERE p.is_active IS NOT FALSE AND (ci.name ILIKE %s OR %s = TRUE)
                      AND c.name ILIKE '%%ẩm thực%%'
                    ORDER BY p.satisfaction_score DESC NULLS LAST, p.green_score DESC NULLS LAST
                    LIMIT 1
                )
                UNION ALL
                (
                    SELECT 
                        p.poi_id::text, p.name, c.name, p.sub_category, p.image_url, 
                        p.green_score, p.satisfaction_score, p.address, p.estimated_cost, 
                        p.ai_metadata, ci.name, p.gallery_urls
                    FROM public.pois p
                    JOIN public.poi_categories c ON p.category_id = c.category_id
                    JOIN public.cities ci ON p.city_id = ci.city_id
                    WHERE p.is_active IS NOT FALSE AND (ci.name ILIKE %s OR %s = TRUE)
                      AND c.name ILIKE '%%cafe%%'
                    ORDER BY p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
                    LIMIT 1
                );
            """
            cur.execute(query, (city_pattern, is_both, city_pattern, is_both, city_pattern, is_both))
            rows = cur.fetchall()

            for r in rows:
                poi_id = r[0]
                name = r[1]
                category = r[2]
                sub_cat = r[3] or "điểm đến"
                image_url = r[4] or "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=900&q=80"
                green_score = format_green_score(r[5])
                rating = float(r[6]) if r[6] is not None else 4.8
                address = r[7] or "Đang cập nhật địa chỉ"
                cost = float(r[8]) if r[8] is not None else None
                meta = r[9] if isinstance(r[9], dict) else {}
                gallery = r[11] if r[11] else None

                price_display = meta.get("price_range_display") if isinstance(meta, dict) else None

                suggested_pois.append(
                    CopilotSuggestedPoiItem(
                        id=poi_id,
                        name=name,
                        category=category,
                        sub_category=sub_cat,
                        image_url=image_url,
                        green_score=green_score,
                        rating=rating,
                        address=address,
                        swap_reason="Điểm đến tiêu biểu đạt đánh giá cao trong mạng lưới du lịch xanh",
                        distance_info="Điểm dừng gợi ý trong hành trình",
                        estimated_cost=cost,
                        price_range_display=price_display,
                        budget_delta="Trải nghiệm chất lượng",
                        carbon_saved="Chuẩn du lịch sinh thái",
                        gallery_urls=gallery,
                    )
                )
    except Exception as e:
        logger.error("Failed to query concierge POIs: %s", e)

    reply_text = (
        f"Chào {caller}! Mình đã sẵn sàng hỗ trợ điều chỉnh lịch trình và gợi ý địa điểm xanh cho chuyến đi **{dest} ({days} ngày)**.\n"
        "Bạn muốn mình tập trung tìm quán ăn bản địa, lọc điểm tham quan theo sở thích, hay sắp xếp lại lịch từng ngày?"
    )

    return (
        reply_text,
        suggested_pois,
        "view_on_map",
        prompts,
        None,
        None,
        None,
    )
