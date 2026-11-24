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
from app.trips.text_utils import contains_any_phrase, normalize_vietnamese_query, strip_vietnamese_accents

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
    norm_msg = normalize_vietnamese_query(message)
    folded_msg = strip_vietnamese_accents(norm_msg)
    is_eco_uncrowded = contains_any_phrase(
        norm_msg,
        folded_msg,
        [
            "du lịch xanh", "trải nghiệm xanh", "ít đông", "đông đúc",
            "sinh thái", "làng nghề", "ẩn mình", "bảo tồn", "yên bình",
            "vắng vẻ", "ít người", "eco",
        ],
        [
            "du lich xanh", "trai nghiem xanh", "it dong", "dong duc",
            "sinh thai", "lang nghe", "an minh", "bao ton", "yen binh",
            "vang ve", "it nguoi", "eco",
        ],
    )

    try:
        with connection.cursor() as cur:
            if is_eco_uncrowded:
                query = """
                    SELECT
                        p.poi_id::text, p.name, c.name, p.sub_category, p.image_url,
                        p.green_score, p.satisfaction_score, p.address, p.estimated_cost,
                        p.ai_metadata, ci.name, p.gallery_urls
                    FROM public.pois p
                    JOIN public.poi_categories c ON p.category_id = c.category_id
                    JOIN public.cities ci ON p.city_id = ci.city_id
                    WHERE p.is_active IS NOT FALSE
                      AND (ci.name ILIKE %s OR %s = TRUE)
                      AND p.green_score >= 0.80
                      AND (
                        c.name ILIKE '%%cảnh quan%%'
                        OR c.name ILIKE '%%tâm linh%%'
                        OR p.sub_category IN ('craft_village', 'lagoon_waterway', 'pine_forest_park', 'historic_zen_temples', 'eco_village')
                        OR p.name ILIKE '%%sinh thái%%'
                        OR p.name ILIKE '%%làng%%'
                        OR p.name ILIKE '%%rú chá%%'
                        OR p.name ILIKE '%%cu đê%%'
                        OR p.name ILIKE '%%huyền không%%'
                        OR p.name ILIKE '%%từ hiếu%%'
                      )
                    ORDER BY CASE WHEN p.sub_category IN ('craft_village', 'craft_villages', 'eco_village', 'eco_lodge', 'homestay', 'green_vegetarian', 'traditional_noodles') THEN 0 ELSE 1 END, p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
                    LIMIT 4;
                """
                cur.execute(query, (city_pattern, is_both))
            else:
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
                        ORDER BY CASE WHEN p.sub_category IN ('craft_village', 'craft_villages', 'eco_village', 'lagoon_waterway', 'wetland_lagoon_rivers') THEN 0 ELSE 1 END, p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
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
                        ORDER BY CASE WHEN p.sub_category IN ('green_vegetarian', 'traditional_noodles', 'street_bites_rolls') THEN 0 ELSE 1 END, p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
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
                city_raw = str(r[10] or "")
                city_label = "Huế" if "hue" in city_raw.lower() else "Đà Nẵng"
                gallery = r[11] if r[11] else None

                price_display = meta.get("price_range_display") if isinstance(meta, dict) else None

                suggested_pois.append(
                    CopilotSuggestedPoiItem(
                        id=poi_id,
                        name=name,
                        category=category,
                        sub_category=sub_cat,
                        city=city_label,
                        image_url=image_url,
                        green_score=green_score,
                        rating=rating,
                        address=address,
                        swap_reason=(
                            f"Trải nghiệm du lịch xanh ít đông đúc tại {city_label}, đạt Green Score {green_score}/100"
                            if is_eco_uncrowded
                            else "Điểm đến tiêu biểu đạt đánh giá cao trong mạng lưới du lịch xanh"
                        ),
                        distance_info="Không gian sinh thái tách biệt ồn ào" if is_eco_uncrowded else "Điểm dừng gợi ý trong hành trình",
                        estimated_cost=cost,
                        price_range_display=price_display,
                        budget_delta="Trải nghiệm chậm & tiết kiệm",
                        carbon_saved="Chuẩn du lịch sinh thái ít phát thải",
                        gallery_urls=gallery,
                    )
                )
    except Exception as e:
        logger.error("Failed to query concierge POIs: %s", e)

    if is_eco_uncrowded:
        if suggested_pois:
            bullets = "\n".join(
                f"- **{p.name}** ({p.city or dest}) — Green Score **{p.green_score}/100**: {p.address}"
                for p in suggested_pois[:4]
            )
            reply_text = (
                f"Với tiêu chí **du lịch xanh, ít đông đúc và gần gũi thiên nhiên tại {dest}**, "
                f"bạn nên ưu tiên các làng sinh thái, đầm phá và không gian thiền – rừng thông tách biệt khỏi điểm check-in đại trà:\n\n"
                f"{bullets}\n\n"
                "Kết hợp **Tàu hỏa Di sản qua đèo Hải Vân** hoặc đạp xe nội làng sẽ giúp giảm phát thải và giữ trọn nhịp nghỉ thư thái."
            )
        else:
            reply_text = (
                f"Để có trải nghiệm **du lịch xanh ít đông đúc tại {dest}**, bạn có thể chọn **Làng sinh thái Thủy Biều**, "
                "**Rừng ngập mặn Rú Chá**, **Huyền Không Sơn Thượng** (Huế) hoặc **Sông Cu Đê / Hòa Bắc** (Đà Nẵng) vào buổi sáng sớm."
            )
        eco_prompts = [
            "Lên lịch 1 ngày sống chậm ở Làng sinh thái Thủy Biều & Rú Chá",
            "Gợi ý quán ăn chay / thực dưỡng yên tĩnh gần đây",
            "Cách đi Tàu di sản Đà Nẵng – Huế qua đèo Hải Vân",
        ]
        return (
            reply_text,
            suggested_pois,
            "view_on_map",
            eco_prompts,
            None,
            "Ưu tiên điểm sinh thái mật độ thấp giúp giảm quá tải điểm đến và giảm phát thải di chuyển.",
            "Phần lớn điểm sinh thái & làng nghề miễn phí hoặc vé 20.000 – 100.000 ₫/người.",
        )

    reply_text = (
        f"Dựa trên hành trình **{dest} ({days} ngày)**, mình gợi ý trước một số điểm dừng đạt điểm xanh cao và được đánh giá tốt để bạn cân nhắc thêm vào lịch trình:"
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
