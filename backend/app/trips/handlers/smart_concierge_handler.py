"""
Universal Smart Concierge Handler (PB14 - Travel Copilot).
Replaces rigid boilerplate greeting with empathetic, deeply inspiring travel guidance
and top-rated green recommendations from the database.
"""
from __future__ import annotations

import logging
from psycopg import Connection
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload
from app.trips.handlers.swap_meal_handler import normalize_city_query, format_green_score

logger = logging.getLogger(__name__)


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

    welcome_intro = (
        f"Chào bạn! Mình là GreenTrip Copilot — người bạn đồng hành địa phương cho hành trình **{dest} {days} ngày** của bạn. "
        f"Mình ở đây để giúp bạn tìm kiếm quán ăn ngon chuẩn vị, góc ngắm cảnh đẹp nhất và tối ưu lịch trình theo tiêu chí xanh thảnh thơi."
    )

    if is_hue:
        city_highlights = (
            "**Gợi ý 3 trải nghiệm vàng khi đến Cố Đô:**\n"
            "- **Di sản ngàn năm**: Thong dong dạo bước tại Đại Nội và Chùa Thiên Mụ trong làn gió sớm sông Hương.\n"
            "- **Tinh hoa ẩm thực**: Thưởng thức một tô bún bò cay nồng hay đĩa bánh bèo nậm lọc thanh tao đượm tình xứ Huế.\n"
            "- **Khoảnh khắc lắng đọng**: Thưởng thức cà phê muối hoặc trà cung đình tại những ngôi nhà rường cổ tích rợp bóng cây xanh."
        )
        prompts = [
            "Gợi ý các quán ăn ngon nhất ở Huế",
            "Quán cafe muối ngon chuẩn gốc ở đâu?",
            "Lịch trình tham quan lăng tẩm và Đại Nội",
            "Đặc sản Huế nên mua về làm quà?",
        ]
    else:
        city_highlights = (
            "**Gợi ý 3 trải nghiệm vàng khi đến Đà Nẵng:**\n"
            "- **Hòa mình vào thiên nhiên**: Đón bình minh trên đỉnh Bán đảo Sơn Trà và dạo bước dọc bãi biển Mỹ Khê cát trắng mịn.\n"
            "- **Bản đồ ẩm thực phong phú**: Nếm thử Mì Quảng đậm đà, Bánh tráng cuốn thịt heo hai đầu da và hải sản tươi sống.\n"
            "- **Thành phố của những cây cầu**: Ngắm Cầu Rồng rực sáng về đêm và thưởng thức cà phê specialty bên bờ sông Hàn lộng gió."
        )
        prompts = [
            "Gợi ý các quán ăn ngon nhất ở Đà Nẵng",
            "Có nên đi Bán Đảo Sơn Trà không?",
            "Quán cafe view biển hoặc sông Hàn đẹp?",
            "Trời mưa thì đi đâu chơi?",
        ]

    eco_advice = (
        "Bạn có thể nhắn cho mình bất kỳ câu hỏi nào về: món ăn đặc sản, quán cafe đẹp, thời tiết, kinh nghiệm chuẩn bị hoặc muốn điều chỉnh nhịp độ lịch trình nhé!"
    )

    reply_text = f"{welcome_intro}\n\n{city_highlights}\n\n{eco_advice}"

    return (
        reply_text,
        suggested_pois,
        "view_on_map",
        prompts,
        None,
        "Đồng hành cùng GreenTrip để bảo vệ môi trường và lan tỏa văn hóa du lịch văn minh.",
        "Thông tin giá cả được niêm yết rõ ràng, giúp bạn luôn chủ động ngân sách.",
    )
