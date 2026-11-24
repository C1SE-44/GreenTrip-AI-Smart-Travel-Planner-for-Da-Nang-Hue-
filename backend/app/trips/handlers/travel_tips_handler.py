"""
Handler for Travel Tips, Budget, Transport & Souvenirs Guide (PB14 - Travel Copilot).
Generates thoughtful concierge advice for inquiries about costs, gifts, packing, transport, and family travel.
"""
from __future__ import annotations

import logging
from psycopg import Connection
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload
from app.trips.handlers.swap_meal_handler import normalize_city_query, format_green_score
from app.trips.text_utils import contains_any_phrase, normalize_vietnamese_query, strip_vietnamese_accents

logger = logging.getLogger(__name__)


def handle_travel_tips(
    message: str,
    trip_context: TripContextPayload,
    connection: Connection,
) -> tuple[str, list[CopilotSuggestedPoiItem], str, list[str], str | None, str | None, str | None]:
    """
    Generate practical, eco-conscious travel tips, budget estimates, and transport advice.
    Returns:
        (reply_text, suggested_pois, action_type, next_prompts, avoid_notice, green_impact, budget_impact)
    """
    msg = normalize_vietnamese_query(message)
    folded_msg = strip_vietnamese_accents(msg)
    from app.trips.copilot_intent import resolve_effective_city
    city_pattern, is_both, city_display = resolve_effective_city(message, trip_context.destination)
    is_hue = city_display == "Huế"

    is_souvenir = contains_any_phrase(
        msg,
        folded_msg,
        ["mua quà", "làm quà", "quà lưu niệm", "mua gì", "chợ hàn", "chợ cồn", "chợ đông ba", "chả bò", "mè xửng"],
        ["mua qua", "lam qua", "qua luu niem", "mua gi", "cho han", "cho con", "cho dong ba", "cha bo", "me xung"],
    )
    is_budget = contains_any_phrase(
        msg,
        folded_msg,
        ["chi phí", "ngân sách", "tiết kiệm", "hết bao nhiêu", "giá cả", "budget"],
        ["chi phi", "ngan sach", "tiet kiem", "het bao nhieu", "gia ca", "budget"],
    )
    is_transport = contains_any_phrase(
        msg,
        folded_msg,
        ["phương tiện", "di chuyển", "xe buýt", "taxi", "thuê xe", "xe máy", "đi lại"],
        ["phuong tien", "di chuyen", "xe buyt", "taxi", "thue xe", "xe may", "di lai"],
    )
    is_family = contains_any_phrase(
        msg,
        folded_msg,
        ["gia đình", "trẻ em", "em bé", "người lớn tuổi", "người già", "bố mẹ"],
        ["gia dinh", "tre em", "em be", "nguoi lon tuoi", "nguoi gia", "bo me"],
    )

    suggested_pois: list[CopilotSuggestedPoiItem] = []

    # Query 2-3 relevant iconic POIs
    try:
        with connection.cursor() as cur:
            if is_souvenir:
                sub_filter = "AND (p.sub_category IN ('traditional_night_markets', 'local_specialty') OR p.name ILIKE '%%chợ%%')"
            else:
                sub_filter = "AND p.green_score >= 0.8"

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
                  {sub_filter}
                ORDER BY p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
                LIMIT 3;
            """
            cur.execute(query, (city_pattern, is_both))
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
                row_city_raw = str(r[10] or "")
                row_city = "Huế" if "hue" in row_city_raw.lower() else "Đà Nẵng"
                gallery = r[11] if r[11] else None

                price_display = meta.get("price_range_display") if isinstance(meta, dict) else None
                if cost is not None and cost == 0:
                    price_display = "Miễn phí tham quan"

                suggested_pois.append(
                    CopilotSuggestedPoiItem(
                        id=poi_id,
                        name=name,
                        category=category,
                        sub_category=sub_cat,
                        city=row_city,
                        image_url=image_url,
                        green_score=green_score,
                        rating=rating,
                        address=address,
                        swap_reason=f"Địa điểm văn hóa – bản địa tiêu biểu tại {row_city} đạt chuẩn xanh",
                        distance_info=f"Thuận tiện di chuyển trong khu vực {row_city}",
                        estimated_cost=cost,
                        price_range_display=price_display,
                        budget_delta="Phù hợp chi tiêu thông minh",
                        carbon_saved="Trải nghiệm thân thiện môi trường",
                        gallery_urls=gallery,
                    )
                )
    except Exception as e:
        logger.error("Failed to query tips POIs: %s", e)

    # Content generation based on specific inquiry
    if is_souvenir:
        headline = f"Mua sắm đặc sản và quà lưu niệm chuẩn gốc tại {'Huế' if is_hue else 'Đà Nẵng'} không chỉ là món quà ý nghĩa cho người thân mà còn hỗ trợ kinh tế nghệ nhân bản địa:"
        if is_hue:
            sections = (
                "**1. Mè xửng Cố Đô & Kẹo cau truyền thống**\n"
                "- Thức quà gắn liền với văn hóa trà Huế, ngọt bùi vị mè vừng và mạch nha dẻo quánh. Các thương hiệu uy tín: Thiên Hương, Nam Thuận.\n\n"
                "**2. Trà Cung Đình Huế (Thảo mộc thanh nhiệt)**\n"
                "- Kết hợp từ 16 vị thảo dược quý (atiso, cúc hoa, hoài sơn, cỏ ngọt...), giúp thanh lọc cơ thể và ngủ ngon.\n\n"
                "**3. Tinh dầu tràm gió Huế & Nón bài thơ**\n"
                "- Tinh dầu tràm nguyên chất vùng Lộc Thủy rất tốt cho trẻ nhỏ và người già; Nón lá bài thơ thêu phong cảnh sông Hương tại làng nón Tây Hồ."
            )
        else:
            sections = (
                "**1. Chả bò Đà Nẵng loại 1 (Hương vị trứ danh)**\n"
                "- Làm từ 100% thịt bò đùi tươi, ướp tiêu đen cay nồng, gói lá chuối xanh hấp chín tự nhiên, không hàn the. Các tiệm nổi tiếng: Chả bò Bà Hường, Cô Huệ.\n\n"
                "**2. Hải sản khô một nắng & Mực rim me**\n"
                "- Mực một nắng dày thịt nướng thơm lừng, cá thu một nắng, mực rim sa tế chua ngọt đậm đà.\n\n"
                "**3. Tré Bà Đệ & Bánh khô mè Cẩm Lệ**\n"
                "- Tré lên men chua thanh từ tai heo và riềng tỏi; Bánh khô mè giòn xốp là di sản bánh truyền thống lâu đời của xứ Quảng."
            )
        tips = (
            "- **Địa chỉ mua sắm**: Chợ Hàn / Chợ Cồn (Đà Nẵng) hoặc Chợ Đông Ba (Huế). Nhớ hỏi giá trước khi mua và mang theo túi vải để hạn chế túi nilon."
        )
        prompts = [
            "Cách phân biệt chả bò Đà Nẵng chuẩn loại 1?",
            "Giờ mở cửa của Chợ Hàn / Chợ Đông Ba?",
            "Gợi ý quán cafe đẹp gần khu chợ mua sắm",
        ]
        budget_impact = "Ngân sách mua quà tham khảo: 300.000 – 700.000 ₫ tùy số lượng."
        green_impact = "Ưu tiên bao bì giấy mộc, lá chuối tự nhiên và nói không với túi nilon một lần."

    elif is_budget or is_transport:
        from app.trips.copilot_enrichment import estimate_trip_budget_summary, recommend_transport_for_leg

        budget_calc = estimate_trip_budget_summary(
            days_count=trip_context.days_count,
            num_people=trip_context.num_people,
            budget_tier=trip_context.budget_tier,
            total_budget=trip_context.total_budget,
        )
        short_leg_tip = recommend_transport_for_leg(3.5, trip_context.num_people, trip_context.active_constraints)
        long_leg_tip = recommend_transport_for_leg(12.0, trip_context.num_people, trip_context.active_constraints)
        bus_note = (
            "Xe buýt nội đô Huế và tuyến đi làng nghề/đầm phá (giá vé 7.000 – 15.000 ₫/lượt)."
            if is_hue
            else "Xe buýt công cộng Danabus (R16A, R6A) kết nối trung tâm với mức vé 5.000 – 10.000 ₫/lượt."
        )
        headline = f"Dự toán ngân sách và gợi ý phương tiện xanh thực tế cho chuyến đi **{city_display}** ({budget_calc['days']} ngày · {budget_calc['num_people']} người):"
        sections = (
            f"**1. Dự toán ngân sách theo ngữ cảnh đã chọn**\n"
            f"- {budget_calc['summary_text']}\n"
            f"- *Ghi chú*: Chi phí vé vào cửa các điểm cộng đồng/chợ truyền thống (Chợ Cồn, Chợ Đông Ba, bãi biển) là **0 ₫**, riêng nhóm di tích Huế có thể mua vé tuyến để tiết kiệm.\n\n"
            f"**2. Phương tiện khuyến nghị theo cự ly & nhóm {budget_calc['num_people']} người**\n"
            f"- **Chặng ngắn trong cụm (≤ 4 km)**: {short_leg_tip}.\n"
            f"- **Chặng xa ngoại ô (8 – 20 km)**: {long_leg_tip}.\n"
            f"- **Giao thông công cộng**: {bus_note}"
        )
        tips = (
            "- **Mẹo tiết kiệm vé**: Mua vé tham quan theo combo tuyến lăng tẩm (ở Huế) hoặc gom điểm theo cùng cụm địa lý để giảm 25–35% quãng đường di chuyển."
        )
        prompts = [
            f"Lên lịch {budget_calc['days']} ngày ở {city_display} sát ngân sách này",
            f"Gợi ý điểm cộng đồng miễn phí hoặc giá rẻ ở {city_display}",
            "So sánh chi phí đi taxi điện và xe buýt cho cả nhóm",
        ]
        budget_impact = budget_calc["summary_text"]
        green_impact = "Chọn phương tiện đúng cự ly giúp giảm 30–60% phát thải CO₂ so với đi xe riêng phân tán."

    elif is_family:
        headline = f"Kinh nghiệm du lịch thảnh thơi dành cho gia đình có trẻ em và người lớn tuổi tại {city_display}:"
        if is_hue:
            sections = (
                "**1. Chọn lọc điểm đến bằng phẳng, dễ tiếp cận tại Huế**\n"
                "- **Làng sinh thái Thủy Biều**: Đường làng phẳng rợp bóng vườn bưởi Thanh Trà, có thể đi xe điện nội làng và ngâm chân thảo mộc.\n"
                "- **Lăng Tự Đức & Đại Nội Huế**: Có lối đi phẳng và xe điện hỗ trợ (nên tránh Lăng Khải Định có 127 bậc dốc).\n"
                "- **Bảo tàng Cổ vật Cung đình Huế**: Không gian mát mẻ trong nhà, phù hợp nghỉ chân giữa trưa.\n\n"
                "**2. Nhịp độ lịch trình (Pacing)**\n"
                "- Chỉ nên sắp xếp tối đa 2–3 điểm dừng/ngày, dành 12:00 – 14:30 nghỉ trưa tại khách sạn để giữ sức khỏe cho cả nhà."
            )
        else:
            sections = (
                "**1. Chọn lọc điểm đến bằng phẳng, dễ tiếp cận tại Đà Nẵng**\n"
                "- **Ngũ Hành Sơn**: Nên sử dụng hệ thống thang máy kính lên Chùa Linh Ứng Non Nước, tránh leo bậc dốc cao.\n"
                "- **Bảo tàng Điêu khắc Chăm / Bảo tàng Mỹ thuật**: Không gian trưng bày râm mát, có ghế nghỉ chân, giàu kiến thức giáo dục cho trẻ nhỏ.\n"
                "- **Công viên APEC / Bờ sông Hàn**: Không gian mở an toàn, thoáng đãng để bé chạy nhảy và người lớn hóng gió.\n\n"
                "**2. Nhịp độ lịch trình (Pacing)**\n"
                "- Chỉ nên sắp xếp tối đa 2–3 điểm dừng/ngày, dành 12:00 – 14:30 nghỉ trưa tại khách sạn để giữ sức khỏe cho cả nhà."
            )
        tips = (
            "- Chuẩn bị sẵn bình nước giữ nhiệt, quạt cầm tay và mũ rộng vành chống nắng cho bé và ông bà."
        )
        prompts = [
            "Quán ăn gia đình có không gian rộng rãi mát mẻ?",
            "Điểm vui chơi trong nhà cho trẻ em khi nắng gắt?",
            "Khách sạn có hồ bơi an toàn cho bé?",
        ]
        budget_impact = "Nên ưu tiên thuê xe ô tô đưa đón trọn gói để cả nhà không bị mệt vì đổi nhiều chặng xe."
        green_impact = "Bảo vệ sức khỏe gia đình với nhịp độ du lịch thong thả và ẩm thực sạch."
    else:
        headline = f"Những kinh nghiệm vàng từ chuyên gia địa phương giúp bạn có chuyến đi {'Huế' if is_hue else 'Đà Nẵng'} trọn vẹn và thư thái nhất:"
        sections = (
            "**1. Thời điểm du lịch lý tưởng**\n"
            "- Tháng 3 đến tháng 8: Trời nắng ráo, biển êm, hoàn hảo cho hoạt động tắm biển và khám phá thiên nhiên.\n"
            "- Tháng 9 đến tháng 12: Mùa mưa nhẹ miền Trung, thích hợp du lịch nghỉ dưỡng, ngắm cảnh hoài niệm và thưởng thức ẩm thực nóng hổi.\n\n"
            "**2. Chuẩn bị hành lý chuẩn xanh**\n"
            "- Mang theo bình nước cá nhân, túi vải tote, ô dù nhỏ gọn và kem chống nắng thân thiện với rạn san hô (reef-safe)."
        )
        tips = "- Luôn cài sẵn ứng dụng chỉ đường và lưu sẵn hotline hỗ trợ du khách của thành phố (0236 3550 111)."
        prompts = [
            "Gợi ý các quán ăn ngon nhất ở đây",
            "Quán cafe view đẹp ngắm hoàng hôn",
            "Lịch trình tham quan văn hóa 1 ngày",
        ]
        budget_impact = "Lập kế hoạch trước giúp tránh phát sinh chi phí vào giờ cao điểm."
        green_impact = "Hành trình xanh giảm thiểu rác thải nhựa và tôn trọng môi trường sống tự nhiên."

    reply_text = f"{headline}\n\n{sections}\n\n**Lời khuyên hữu ích:**\n{tips}"

    return (
        reply_text,
        suggested_pois,
        "view_on_map",
        prompts,
        None,
        green_impact,
        budget_impact,
    )
