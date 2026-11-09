"""
Handler for POI evaluation and travel feasibility advice (PB14 - Travel Copilot).
Generates expert travel advice inspired by Mindtrip.ai for landmark inquiries
such as 'tôi có nên đi bán đảo sơn trà không'.
"""
from __future__ import annotations

import logging
import re
from typing import Any
from psycopg import Connection
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload
from app.trips.handlers.swap_meal_handler import format_green_score

logger = logging.getLogger(__name__)

# Curated expert advice profiles for iconic landmarks in Da Nang & Hue
CURATED_POI_ADVICE: dict[str, dict[str, Any]] = {
    "bán đảo sơn trà": {
        "canonical_name": "Bán Đảo Sơn Trà",
        "search_pattern": "%bán đảo sơn trà%",
        "headline": "Có — Bán đảo Sơn Trà rất đáng đi, đặc biệt nếu bạn muốn đổi gió hòa mình vào thiên nhiên và ngắm toàn cảnh vịnh biển Đà Nẵng từ trên cao.",
        "pros": [
            "Cảnh quan biển núi ngoạn mục, cung đường ven biển nhìn xuống toàn cảnh thành phố cực đẹp.",
            "Lịch trình nửa ngày lý tưởng (sáng sớm hoặc xế chiều), chỉ cách trung tâm thành phố 15–20 phút di chuyển.",
            "Cơ hội ngắm nhìn Voọc chà vá chân nâu — 'nữ hoàng linh trưởng' quý hiếm trong tự nhiên.",
            "Nhiều điểm dừng linh hoạt: Chùa Linh Ứng (tượng Phật Bà 67m), Bãi Bụt, Đỉnh Bàn Cờ, Cây Đa ngàn năm.",
        ],
        "cons_and_warnings": [
            "Nếu đi cùng em bé, trẻ nhỏ hoặc người già: đường đèo dốc quanh co có thể khiến bé dễ mệt hoặc say xe.",
            "Quy định an toàn: Xe tay ga bị cấm lưu thông lên Đỉnh Bàn Cờ và Trạm Radar 29 từ đoạn trạm gác kiểm lâm.",
            "Tránh đi vào trưa nắng gắt hoặc ngày thời tiết xấu (mưa bão, sương mù dày đặc che khuất tầm nhìn).",
        ],
        "tips": [
            "Khung giờ lý tưởng nhất: 06:30 – 09:30 (săn mây, ngắm bình minh) hoặc 15:30 – 17:30 (ngắm hoàng hôn mát mẻ).",
            "Phương tiện khuyến nghị: Thuê xe ô tô/taxi điện trọn gói hoặc sử dụng xe số có tay lái vững.",
            "Chuẩn bị: Nón, nước uống, kem chống nắng, áo khoác mỏng cản gió; tuyệt đối không xả rác và không cho thú hoang ăn.",
        ],
        "swap_reason": "Bán đảo sinh thái tiêu biểu của Đà Nẵng, thích hợp khám phá thiên nhiên nửa ngày",
        "distance_info": "Cách trung tâm ~12km (20 phút lái xe)",
        "budget_delta": "Miễn vé tham quan",
        "carbon_saved": "Khu dự trữ sinh quyển",
        "prompts": [
            "Lên lịch trình 3 tiếng ngắm cảnh Sơn Trà",
            "Nên đi xe số hay thuê taxi điện đưa đón?",
            "Gợi ý quán ăn trưa ngon gần Bán đảo Sơn Trà",
        ],
        "budget_impact": "Điểm đến hoàn toàn miễn phí vé vào cổng, chỉ phát sinh chi phí di chuyển (~80.000 – 150.000 ₫/chiều).",
        "green_impact": "Hành trình khuyến khích bảo vệ môi trường, ngắm thú hoang dã văn minh không để lại rác thải nhựa.",
    },
    "cầu rồng": {
        "canonical_name": "Cầu Rồng",
        "search_pattern": "%cầu rồng%",
        "headline": "Rất nên đi — Cầu Rồng là biểu tượng hiện đại không thể bỏ lỡ của Đà Nẵng, đặc biệt lung linh khi thành phố lên đèn về đêm.",
        "pros": [
            "Màn trình diễn phun lửa và phun nước độc đáo vào đúng 21:00 các tối Thứ 7, Chủ Nhật và ngày lễ lớn.",
            "Vị trí trung tâm kết nối hai bờ sông Hàn, thuận tiện kết hợp phố đi bộ Bạch Đằng và Chợ đêm Sơn Trà.",
            "Không gian tản bộ thoáng mát, view ngắm toàn cảnh sông Hàn và các cây cầu lung linh ánh sáng.",
        ],
        "cons_and_warnings": [
            "Tối cuối tuần (20:30 – 21:30) lượng du khách rất đông, các tuyến đường đầu cầu sẽ cấm xe và dễ kẹt đường.",
            "Nếu đứng quá gần đầu rồng hướng đón gió, bạn có thể bị tạt nước ướt người khi cầu phun nước.",
        ],
        "tips": [
            "Thời điểm đẹp nhất: Có mặt từ 20:30 để chọn vị trí đẹp tại bờ đông (đường Trần Hưng Đạo) hoặc phố đi bộ.",
            "Kết hợp thưởng thức ẩm thực đường phố tại Chợ đêm Sơn Trà ngay dưới chân cầu sau khi xem phun lửa.",
        ],
        "swap_reason": "Kỳ quan kiến trúc biểu tượng, trình diễn phun lửa & phun nước cuối tuần",
        "distance_info": "Ngay trung tâm thành phố (5 phút đi bộ từ sông Hàn)",
        "budget_delta": "Trải nghiệm miễn phí",
        "carbon_saved": "Đi bộ & giao thông công cộng",
        "prompts": [
            "Mấy giờ Cầu Rồng phun lửa vào cuối tuần?",
            "Điểm đứng xem cầu phun lửa không bị ướt?",
            "Gợi ý quán ăn đêm gần Cầu Rồng",
        ],
        "budget_impact": "Trải nghiệm hoàn toàn miễn phí cho du khách và người dân thành phố.",
        "green_impact": "Khuyến khích đi bộ và xe đạp công cộng dọc đường Bạch Đằng - Trần Hưng Đạo.",
    },
    "chùa nam sơn": {
        "canonical_name": "Chùa Nam Sơn",
        "search_pattern": "%nam sơn%",
        "headline": "Nên đi nếu bạn yêu thích không gian thanh tịnh và kiến trúc cung đình truyền thống cổ kính giữa lòng Đà Nẵng.",
        "pros": [
            "Kiến trúc lầu son gác tía nguy nga, hồ phóng sinh hoa súng và cầu gỗ uốn lượn mang đậm phong vị Á Đông.",
            "Không gian yên bình, trong lành, tách biệt hẳn khỏi sự ồn ào náo nhiệt của phố thị.",
            "Nhiều góc chụp ảnh kiến trúc trang nhã, tôn nghiêm mà không xô bồ.",
        ],
        "cons_and_warnings": [
            "Vị trí ở Hòa Vang, cách trung tâm thành phố khoảng 10–12 km về phía Nam.",
            "Quy định trang phục nghiêm ngặt: Phải mặc trang phục lịch sự, kín đáo (chùa có cho mượn khăn quấn miễn phí tại cổng).",
            "Không được phép tạo dáng phản cảm hoặc quay phim thương mại gây ồn ào.",
        ],
        "tips": [
            "Nên ghé thăm vào buổi sáng sớm (07:30 – 09:30) hoặc xế chiều (16:00 – 17:30) khi chùa bắt đầu lên đèn lồng rất đẹp.",
            "Sau khi viếng chùa, có thể ghé thưởng thức mỳ Quảng quê tại khu vực Hòa Vang đậm đà hương vị bản xứ.",
        ],
        "swap_reason": "Kiến trúc cung đình trang nhã, hồ phóng sinh thanh tịnh tại ngoại ô Đà Nẵng",
        "distance_info": "Cách trung tâm ~10km (20 phút di chuyển)",
        "budget_delta": "Miễn phí vé vào cổng",
        "carbon_saved": "Không gian sinh thái tâm linh",
        "prompts": [
            "Quy định trang phục khi vào Chùa Nam Sơn?",
            "Từ trung tâm Đà Nẵng đi Chùa Nam Sơn bằng gì thuận tiện?",
            "Các điểm tham quan văn hóa gần Chùa Nam Sơn",
        ],
        "budget_impact": "Miễn phí vé tham quan; chùa có bãi giữ xe miễn phí tùy tâm công đức.",
        "green_impact": "Không gian cây xanh mát mẻ, hồ nước sinh thái điều hòa vi khí hậu.",
    },
}


def extract_advice_target(message: str) -> str | None:
    """Extract known place identifier from natural user query."""
    msg = message.strip().lower()
    
    # Check specific curated targets first
    if "sơn trà" in msg or "son tra" in msg:
        if "chợ đêm" in msg:
            return "chợ đêm sơn trà"
        return "bán đảo sơn trà"
    if "cầu rồng" in msg or "cau rong" in msg or "phun lửa" in msg:
        return "cầu rồng"
    if "nam sơn" in msg:
        return "chùa nam sơn"
    if "linh ứng" in msg:
        return "chùa linh ứng"
    if "ngũ hành sơn" in msg or "non nước" in msg:
        return "ngũ hành sơn"
    if "bàn cờ" in msg:
        return "đỉnh bàn cờ"
    if "bà nà" in msg:
        return "bà nà hills"
    if "đại nội" in msg or "hoàng thành" in msg:
        return "đại nội"
    if "thiên mụ" in msg:
        return "thiên mụ"
    if "khải định" in msg:
        return "khải định"
        
    return None


def handle_poi_advice(
    message: str,
    trip_context: TripContextPayload,
    connection: Connection,
) -> tuple[str, list[CopilotSuggestedPoiItem], str, list[str], str | None, str | None, str | None]:
    """
    Generate rich travel feasibility advice for a requested POI.
    Returns:
        (reply_text, suggested_pois, action_type, next_prompts, avoid_notice, green_impact, budget_impact)
    """
    target_key = extract_advice_target(message) or "bán đảo sơn trà"
    curated = CURATED_POI_ADVICE.get(target_key)
    
    # Query database for authentic POI data
    search_pattern = curated["search_pattern"] if curated else f"%{target_key}%"
    
    query = """
        SELECT 
            p.poi_id::text,
            p.name,
            c.name AS category_name,
            p.sub_category,
            p.image_url,
            p.gallery_urls,
            p.green_score,
            p.satisfaction_score,
            p.address,
            p.description,
            p.estimated_cost,
            p.ai_metadata,
            ci.name AS city_name
        FROM public.pois p
        JOIN public.poi_categories c ON p.category_id = c.category_id
        JOIN public.cities ci ON p.city_id = ci.city_id
        WHERE p.name ILIKE %s
        ORDER BY p.popularity_score DESC NULLS LAST
        LIMIT 1;
    """
    
    poi_row = None
    try:
        with connection.cursor() as cur:
            cur.execute(query, (search_pattern,))
            poi_row = cur.fetchone()
    except Exception as exc:
        logger.warning(f"Database query error in handle_poi_advice: {exc}")

    # Build response message
    if curated:
        headline = curated["headline"]
        pros_list = "\n".join(f"- {p}" for p in curated["pros"])
        cons_list = "\n".join(f"- {c}" for c in curated["cons_and_warnings"])
        tips_list = "\n".join(f"- {t}" for t in curated["tips"])
        
        reply_text = (
            f"{headline}\n\n"
            f"**Vì sao nên đi (Điểm mạnh) 🌿**\n"
            f"{pros_list}\n\n"
            f"**Khi nào “không nên” hoặc nên cân nhắc kỹ ⚠️**\n"
            f"{cons_list}\n\n"
            f"**Gợi ý cách đi thoải mái & chuẩn xanh 💡**\n"
            f"{tips_list}"
        )
        swap_reason = curated["swap_reason"]
        distance_info = curated["distance_info"]
        budget_delta = curated["budget_delta"]
        carbon_saved = curated["carbon_saved"]
        next_prompts = curated["prompts"]
        budget_impact = curated["budget_impact"]
        green_impact = curated["green_impact"]
    else:
        # Generic POI fallback
        poi_name = poi_row[1] if poi_row else target_key.title()
        reply_text = (
            f"Có — {poi_name} là điểm dừng chân rất đáng trải nghiệm trong hành trình khám phá Đà Nẵng & Huế.\n\n"
            f"**Vì sao nên đi 🌿**\n"
            f"- Cảnh quan đặc sắc và giá trị văn hóa - tự nhiên tiêu biểu của vùng đất miền Trung.\n"
            f"- Dễ dàng kết hợp cùng các điểm tham quan lân cận trong cùng buổi sáng hoặc chiều.\n\n"
            f"**Lưu ý khi tham quan ⚠️**\n"
            f"- Hãy kiểm tra trước dự báo thời tiết và chuẩn bị trang phục phù hợp với điểm đến.\n"
            f"- Ưu tiên di chuyển vào khung giờ sáng sớm hoặc xế chiều để tránh thời tiết nắng gắt."
        )
        swap_reason = "Điểm tham quan nổi tiếng tại địa phương"
        distance_info = "Khu vực trung tâm & phụ cận"
        budget_delta = "Chi phí linh hoạt"
        carbon_saved = "Thân thiện môi trường"
        next_prompts = [
            f"Thời gian lý tưởng tham quan {poi_name}?",
            "Cách di chuyển thuận tiện nhất?",
            "Điểm ăn uống ngon gần đây?",
        ]
        budget_impact = "Chi phí vé và dịch vụ theo quy định niêm yết tại điểm tham quan."
        green_impact = "Ưu tiên phương tiện xanh và giữ gìn cảnh quan tự nhiên."

    suggested_pois: list[CopilotSuggestedPoiItem] = []
    if poi_row:
        (
            poi_id,
            name,
            category_name,
            sub_cat,
            hero_img,
            gallery,
            green_score,
            sat_score,
            address,
            desc,
            cost,
            meta,
            city_name,
        ) = poi_row
        
        green_int = format_green_score(green_score)
        rating_flt = round(float(sat_score or 4.8), 1)
        fallback_hero = "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80"
        
        gallery_list = gallery if isinstance(gallery, list) and len(gallery) > 0 else None

        suggested_pois.append(
            CopilotSuggestedPoiItem(
                id=poi_id,
                name=name,
                category=category_name,
                sub_category=sub_cat,
                image_url=hero_img or fallback_hero,
                green_score=green_int,
                rating=rating_flt,
                address=address or f"{city_name}, Việt Nam",
                swap_reason=swap_reason,
                distance_info=distance_info,
                estimated_cost=float(cost) if cost else None,
                price_range_display="Miễn phí vé tham quan" if not cost or cost == 0 else f"{int(cost):,} ₫/người",
                budget_delta=budget_delta,
                carbon_saved=carbon_saved,
                gallery_urls=gallery_list,
            )
        )

    return (
        reply_text,
        suggested_pois,
        "view_on_map",
        next_prompts,
        None,
        green_impact,
        budget_impact,
    )
