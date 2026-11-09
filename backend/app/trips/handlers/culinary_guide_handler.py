"""
Handler for Culinary & Local Dining Guide (PB14 - Travel Copilot).
Generates comprehensive, empathetic local food advice inspired by Mindtrip.ai
for inquiries like 'hãy gợi ý cho tôi các quán ăn ngon ở Đà Nẵng'.
"""
from __future__ import annotations

import logging
from typing import Any
from psycopg import Connection
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload
from app.trips.handlers.swap_meal_handler import normalize_city_query, format_green_score

logger = logging.getLogger(__name__)


def handle_culinary_guide(
    message: str,
    trip_context: TripContextPayload,
    connection: Connection,
) -> tuple[str, list[CopilotSuggestedPoiItem], str, list[str], str | None, str | None, str | None]:
    """
    Generate expert culinary guide with authentic local POIs from Da Nang & Hue.
    Returns:
        (reply_text, suggested_pois, action_type, next_prompts, avoid_notice, green_impact, budget_impact)
    """
    msg = message.strip().lower()
    city_pattern, is_both = normalize_city_query(trip_context.destination)
    is_hue = "hue" in trip_context.destination.lower() or "huế" in trip_context.destination.lower()

    # Detect culinary sub-intents
    is_seafood = any(k in msg for k in ["hải sản", "seafood", "tôm", "cua", "ghẹ", "mực", "ốc"])
    is_noodle = any(k in msg for k in ["mì quảng", "bún chả cá", "bún bò", "bánh canh", "noodle"])
    is_snack = any(k in msg for k in ["ăn vặt", "bánh tráng", "bánh xèo", "nem lụi", "chè"])

    suggested_pois: list[CopilotSuggestedPoiItem] = []

    # Query matching POIs from public.pois with category 'Ẩm thực và quán ăn'
    try:
        with connection.cursor() as cur:
            if is_seafood:
                sub_filter = "AND (p.sub_category = 'coastal_seafood' OR p.name ILIKE '%%hải sản%%' OR p.name ILIKE '%%ốc%%')"
            elif is_noodle:
                sub_filter = "AND (p.sub_category IN ('traditional_noodles', 'local_specialty') OR p.name ILIKE '%%mì%%' OR p.name ILIKE '%%bún%%')"
            elif is_snack:
                sub_filter = "AND (p.sub_category IN ('street_bites_rolls', 'dessert', 'traditional_night_markets') OR p.name ILIKE '%%bánh%%' OR p.name ILIKE '%%chè%%')"
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
                  AND c.name ILIKE '%%ẩm thực%%'
                  {sub_filter}
                ORDER BY p.satisfaction_score DESC NULLS LAST, p.green_score DESC NULLS LAST
                LIMIT 4;
            """
            cur.execute(query, (city_pattern, is_both))
            rows = cur.fetchall()

            for r in rows:
                poi_id = r[0]
                name = r[1]
                category = r[2]
                sub_cat = r[3] or "ẩm thực"
                image_url = r[4] or "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80"
                green_score = format_green_score(r[5])
                rating = float(r[6]) if r[6] is not None else 4.7
                address = r[7] or "Đang cập nhật địa chỉ"
                cost = float(r[8]) if r[8] is not None else None
                meta = r[9] if isinstance(r[9], dict) else {}
                gallery = r[11] if r[11] else None

                price_display = meta.get("price_range_display") if isinstance(meta, dict) else None
                if not price_display and cost:
                    price_display = f"Khoảng {int(cost):,} ₫/người"

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
                        swap_reason="Địa điểm ẩm thực tiêu biểu chuẩn vị bản xứ, đạt đánh giá cao từ thực khách",
                        distance_info="Khu vực trung tâm ẩm thực sầm uất",
                        estimated_cost=cost,
                        price_range_display=price_display,
                        budget_delta="Giá bình dân niêm yết rõ ràng",
                        carbon_saved="Nguyên liệu tươi sạch địa phương",
                        gallery_urls=gallery,
                    )
                )
    except Exception as e:
        logger.error("Failed to query culinary POIs: %s", e)

    # Build rich, thoughtful, Mindtrip-level response text
    if is_hue:
        headline = "Cố đô Huế là cái nôi của ẩm thực cung đình lẫn dân dã, nổi bật với sự hài hòa giữa ngũ vị, màu sắc và sự tinh tế trong cách nêm nếm. Dưới đây là những trải nghiệm ẩm thực bạn không thể bỏ qua:"
        sections = (
            "**1. Bún bò Huế & Cơm Hến Cồn Hến (Món nước & thanh đạm)**\n"
            "- **Bún bò Mụ Kéo / Bún bò chuẩn Huế**: Nước dùng ninh từ xương bò và giò heo thơm lừng mùi sả, ruốc Huế nguyên chất, sợi bún to ăn kèm chả cua béo ngậy và tiết luộc mềm mọng.\n"
            "- **Cơm hến / Bún hến Bà Cam**: Hến xào đậm đà, tóp mỡ giòn rụm, bắp chuối thái mỏng chan nước hến ngọt thanh nghi ngút khói, chỉ khoảng 20.000 – 35.000 ₫/tô.\n\n"
            "**2. Bộ tứ bánh Huế cung đình (Bánh bèo, Nậm, Lọc, Ram ít)**\n"
            "- Ghé quán Bà Đỏ hoặc các gánh bánh vỉa hè đường Chi Lăng: Thưởng thức bánh nậm bọc lá dong mịn màng, bánh bột lọc bọc tôm sông giòn sần sật chấm nước mắm ớt cay xè đúng gu Huế.\n\n"
            "**3. Không gian ẩm thực xanh & Cơm chay thực dưỡng**\n"
            "- Huế nổi tiếng với truyền thống ăn chay thanh tịnh. Các nhà hàng như An Nhiên Garden Vegetarian hay Sân Mây mang đến bữa ăn trong không gian nhà rường cổ kính, vừa an lành vừa bảo vệ sức khỏe."
        )
        tips = (
            "- **Khung giờ vàng**: Ăn sáng từ 06:30 – 08:30 (bún bò, cơm hến ngon nhất khi nước dùng mới nấu); ăn vặt chiều từ 15:30 – 17:30.\n"
            "- **Mẹo thưởng thức**: Hãy nhắc người bán giảm ớt nếu bạn không quen ăn cay xé lưỡi đặc trưng của người miền Trung.\n"
            "- **Chuẩn xanh**: Ưu tiên di chuyển giữa các quán ăn trong thành phố bằng xe đạp hoặc taxi điện Xanh SM."
        )
        prompts = [
            "Quán cafe muối ngon chuẩn gốc ở Huế?",
            "Đặc sản Huế nên mua về làm quà?",
            "Lên lịch trình khám phá ẩm thực Huế nửa ngày",
        ]
        budget_impact = "Chi phí ăn uống tại Huế rất tiết kiệm, dao động từ 30.000 – 120.000 ₫/người/bữa."
        green_impact = "Khuyến khích dùng nông sản bản địa và trải nghiệm các món ăn thực dưỡng hữu cơ."
    else:
        # Da Nang
        headline = "Đà Nẵng là thiên đường ẩm thực giao thoa của miền Trung với nguồn hải sản tươi rói từ biển và những món mì sợi đậm đà khó quên. Dưới đây là những tọa độ quán ngon chuẩn vị bản xứ, giá cả minh bạch và được đánh giá cao nhất:"
        sections = (
            "**1. Mì Quảng & Bún Chả Cá (Hương vị di sản)**\n"
            "- **Mì Quảng (Bà Mua / Bếp Trang / 1A)**: Sợi mì gạo dẻo mềm, nước nhưn tôm thịt hoặc ếch xâm xấp đậm đà, rắc đậu phộng rang giòn. Khi ăn nhớ bẻ bánh tráng mè nướng và vắt chút chanh ớt tươi.\n"
            "- **Bún Chả Cá Hớn (Đạt giải MICHELIN Bib Gourmand)**: Nước dùng ngọt thanh tự nhiên hầm từ bí đỏ, bắp cải, dứa và cà chua; chả cá hấp và chiên dai giòn nguyên chất không pha bột.\n\n"
            "**2. Bánh tráng cuốn thịt heo hai đầu da & Bò thui Cầu Mống**\n"
            "- **Đặc Sản Trần / Bếp Cuốn (MICHELIN Bib Gourmand)**: Miếng thịt heo luộc khéo léo với hai đầu mỡ giòn trong veo, cuốn cùng bánh tráng phơi sương và đĩa rau rừng tươi mơn mởn, chấm mắm nêm cá cơm dậy vị nồng nàn.\n"
            "- **Bò thui Cầu Mống Rô**: Thịt bê thui tái hồng ngọt lịm, bì giòn sần sật cuốn rau thơm và chuối chát.\n\n"
            "**3. Hải sản tươi sống & Thiên đường ăn vặt đường phố**\n"
            "- **Hải Sản Mộc Quán (MICHELIN Selected) / Hải sản Thời Cổ**: Hải sản tươi bơi tại bể, chế biến sốt trứng muối, hấp sả ớt hoặc nướng mọi với mức giá niêm yết rõ ràng.\n"
            "- **Bánh tráng kẹp Dì Hoa / Chợ đêm Sơn Trà**: Bánh tráng nướng pate bò ướt át, nem chua nướng, chè sầu Liên thanh mát trứ danh."
        )
        tips = (
            "- **Mẹo tránh đông**: Đến ăn trưa trước 11:30 hoặc tối trước 18:30 để có chỗ ngồi thoáng đãng, phục vụ nhanh nhất.\n"
            "- **Tiêu chí Xanh**: Hãy chủ động mang theo túi vải eco khi đi ăn vặt chợ đêm và từ chối các loại khăn ướt nilon dùng 1 lần.\n"
            "- **Di chuyển**: Các quán ăn tập trung nhiều ở quận Hải Châu và Sơn Trà, rất thuận tiện đi bộ hoặc gọi xe buýt Danabus / taxi điện."
        )
        prompts = [
            "Quán cafe view biển hoặc sông Hàn gần đây?",
            "Gợi ý quán ăn chay ngon thanh đạm ở Đà Nẵng",
            "Món tráng miệng và chè sầu nổi tiếng nhất?",
        ]
        budget_impact = "Mức giá bình dân dao động từ 35.000 – 150.000 ₫/người tùy món ăn vặt hay hải sản tươi sống."
        green_impact = "Ưu tiên chuỗi cung ứng nông sản bản địa và các quán ăn cam kết vệ sinh thực phẩm xanh."

    reply_text = f"{headline}\n\n{sections}\n\n**Mẹo thưởng thức chuẩn người bản địa & Tiêu chí Xanh:**\n{tips}"

    return (
        reply_text,
        suggested_pois,
        "view_on_map",
        prompts,
        None,
        green_impact,
        budget_impact,
    )
