"""
Handler for Cafe & Chill Spaces Guide (PB14 - Travel Copilot).
Generates expert coffee culture advice for inquiries like 'gợi ý quán cafe view đẹp ở Đà Nẵng'.
"""
from __future__ import annotations

import logging
from psycopg import Connection
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload
from app.trips.handlers.swap_meal_handler import normalize_city_query, format_green_score

logger = logging.getLogger(__name__)


def handle_cafe_culture(
    message: str,
    trip_context: TripContextPayload,
    connection: Connection,
) -> tuple[str, list[CopilotSuggestedPoiItem], str, list[str], str | None, str | None, str | None]:
    """
    Generate expert coffee guide with curated cafes from Da Nang & Hue.
    Returns:
        (reply_text, suggested_pois, action_type, next_prompts, avoid_notice, green_impact, budget_impact)
    """
    msg = message.strip().lower()
    city_pattern, is_both = normalize_city_query(trip_context.destination)
    is_hue = "hue" in trip_context.destination.lower() or "huế" in trip_context.destination.lower()

    # Detect sub-vibes
    is_work = any(k in msg for k in ["làm việc", "work", "yên tĩnh", "học bài", "wifi"])
    is_view = any(k in msg for k in ["view biển", "sông hàn", "ngắm cảnh", "hoàng hôn", "sống ảo", "checkin", "đẹp"])
    is_specialty = any(k in msg for k in ["specialty", "pha máy", "pha phin", "cà phê muối", "pha thủ công"])

    suggested_pois: list[CopilotSuggestedPoiItem] = []

    try:
        with connection.cursor() as cur:
            if is_work:
                sub_filter = "AND (p.sub_category IN ('workspace_study_cafe', 'cafe') OR p.name ILIKE '%%workspace%%' OR p.name ILIKE '%%beans%%')"
            elif is_view:
                sub_filter = "AND (p.sub_category IN ('scenic_view_cafe', 'cafe', 'nightlife_bars_pubs') OR p.name ILIKE '%%marina%%' OR p.name ILIKE '%%view%%')"
            elif is_specialty:
                sub_filter = "AND (p.sub_category = 'specialty_coffee' OR p.name ILIKE '%%specialty%%' OR p.name ILIKE '%%roastery%%' OR p.name ILIKE '%%xliii%%')"
            else:
                sub_filter = ""

            query = f"""
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
                    ci.name AS city_name,
                    p.gallery_urls
                FROM public.pois p
                JOIN public.poi_categories c ON p.category_id = c.category_id
                JOIN public.cities ci ON p.city_id = ci.city_id
                WHERE p.is_active IS NOT FALSE
                  AND (ci.name ILIKE %s OR %s = TRUE)
                  AND c.name ILIKE '%%cafe%%'
                  {sub_filter}
                ORDER BY p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
                LIMIT 4;
            """
            cur.execute(query, (city_pattern, is_both))
            rows = cur.fetchall()

            for r in rows:
                poi_id = r[0]
                name = r[1]
                category = r[2]
                sub_cat = r[3] or "quán cafe"
                image_url = r[4] or "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80"
                green_score = format_green_score(r[5])
                rating = float(r[6]) if r[6] is not None else 4.8
                address = r[7] or "Đang cập nhật địa chỉ"
                cost = float(r[8]) if r[8] is not None else None
                meta = r[9] if isinstance(r[9], dict) else {}
                gallery = r[11] if r[11] else None

                price_display = meta.get("price_range_display") if isinstance(meta, dict) else None
                if not price_display and cost:
                    price_display = f"Khoảng {int(cost):,} ₫/ly"

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
                        swap_reason="Không gian cafe sinh thái thư thái, nguồn hạt tuyển chọn bền vững",
                        distance_info="Dễ dàng kết hợp trong lịch trình trong ngày",
                        estimated_cost=cost,
                        price_range_display=price_display,
                        budget_delta="Giá đồ uống hợp lý",
                        carbon_saved="Không gian xanh nhiều cây",
                        gallery_urls=gallery,
                    )
                )
    except Exception as e:
        logger.error("Failed to query cafe POIs: %s", e)

    if is_hue:
        headline = "Văn hóa cà phê Huế mang nét trầm tư, hoài niệm đặc trưng bên dòng sông Hương thơ mộng. Dưới đây là những phong cách quán cafe bạn nhất định nên trải nghiệm:"
        sections = (
            "**1. Cà phê muối nguyên bản (Hương vị độc bản xứ Huế)**\n"
            "- **Cà phê muối Đinh Tiên Hoàng / Nguyễn Huệ**: Lớp kem sữa béo ngậy được đánh bông cùng muối biển tinh khiết phủ lên trên nền cà phê phin đậm đà. Vị mặn nhẹ khéo léo tôn vinh vị ngọt béo và hương thơm cà phê nồng nàn, chỉ từ 25.000 – 35.000 ₫/ly.\n\n"
            "**2. Không gian nhà vườn cổ kính & Trà cung đình**\n"
            "- Thưởng thức trà thảo mộc tại Mộc Trà Cung Đình hoặc các quán cafe sân vườn rợp bóng cây xanh ven sông Hương, giúp lắng đọng tâm hồn và tái tạo năng lượng sau một ngày tham quan lăng tẩm.\n\n"
            "**3. Specialty Coffee hiện đại cho người yêu cà phê**\n"
            "- **VOU Roastery / T.Roaster**: Những hạt Arabica Cầu Đất hay Khe Sanh được rang xay mộc thủ công, chiết xuất chuẩn xác trong không gian tối giản hiện đại."
        )
        prompts = [
            "Quán cafe ngắm hoàng hôn sông Hương?",
            "Gợi ý quán ăn tối chuẩn vị Huế gần đây",
            "Trải nghiệm ca Huế trên sông Hương vào buổi tối",
        ]
        budget_impact = "Giá cà phê tại Huế rất dễ chịu, chỉ từ 20.000 – 50.000 ₫/ly."
        green_impact = "Hầu hết quán cafe sân vườn tận dụng ánh sáng và gió tự nhiên, hạn chế máy lạnh và đồ nhựa."
    else:
        # Da Nang
        headline = "Đà Nẵng sở hữu cộng đồng cà phê phát triển hàng đầu miền Trung, từ các quán Specialty coffee đạt chuẩn quốc tế đến những góc ban công lộng gió ngắm biển và cầu Rồng:"
        sections = (
            "**1. Cà phê đặc sản Specialty & Không gian xanh chuẩn Eco**\n"
            "- **Brewman Coffee Concept / XLIII Coffee (43 Factory)**: Thiết kế mở ngập tràn kính và cây xanh, phục vụ các dòng hạt Single Origin được chứng nhận thương mại công bằng (Fair Trade), mang đến trải nghiệm thưởng thức cà phê đỉnh cao.\n"
            "- **The Local Beans**: Chuỗi cafe mộc mạc, yên tĩnh, là điểm hẹn lý tưởng để đọc sách, làm việc từ xa hoặc trò chuyện nhẹ nhàng.\n\n"
            "**2. Cafe ngắm trọn biển Mỹ Khê & Vịnh Sơn Trà**\n"
            "- **Sơn Trà Marina**: Quán cafe mang phong cách Địa Trung Hải trắng xanh độc đáo tọa lạc ngay triền núi Sơn Trà, nơi ngắm bình minh và toàn cảnh vịnh biển Đà Nẵng ngoạn mục nhất.\n"
            "- **Esco Beach Bar Lounge**: Tọa lạc sát mép sóng biển Mỹ Khê, lý tưởng để nhâm nhi dừa tươi mát rượi ban ngày hoặc cocktail ngắm sóng vỗ về đêm.\n\n"
            "**3. Cà phê mộc ngắm sông Hàn và Cầu Rồng**\n"
            "- **Trình Cà Phê / Dãy cafe đường Bạch Đằng**: Ngồi nhâm nhi cà phê bơ hoặc trà thảo mộc bên bờ sông Hàn mát rượi, ngắm nhịp sống êm ả của thành phố."
        )
        prompts = [
            "Quán cafe có view ngắm cầu Rồng phun lửa?",
            "Quán cafe mở 24/7 yên tĩnh làm việc?",
            "Gợi ý quán ăn trưa ngon gần các quán cafe này",
        ]
        budget_impact = "Chi phí dao động từ 35.000 – 75.000 ₫/ly (riêng specialty cao cấp ~80.000 – 120.000 ₫)."
        green_impact = "Ưu tiên các quán dùng ống hút gạo/cỏ bàng, ly thủy tinh và ủng hộ nguồn hạt trồng hữu cơ bền vững."

    reply_text = f"{headline}\n\n{sections}"

    return (
        reply_text,
        suggested_pois,
        "view_on_map",
        prompts,
        None,
        green_impact,
        budget_impact,
    )
