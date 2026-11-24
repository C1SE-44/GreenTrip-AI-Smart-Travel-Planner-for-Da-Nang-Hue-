"""
GreenTrip AI Copilot Consultant & State Orchestrator (PB14 Mindtrip-Grade Upgrade).

Facilitates consultative QA, response upgrading/finalization, and Gemini synthesis,
while delegating intent classification, KG enrichment, and itinerary mutations to focused submodules.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx
from psycopg import Connection

from app.config import get_settings
from app.pois.price_normalizer import normalize_poi_price_display
from app.trips.copilot_enrichment import (
    DEFAULT_POI_COORDS_KB,
    build_kg_explanation_for_poi,
    enrich_pois_with_kg_and_filter_city,
    ensure_closing_ab_hook,
    format_three_layer_poi_bullet,
    resolve_poi_coordinates,
)
from app.trips.copilot_grounding import verify_and_ground_reply_text
from app.trips.copilot_intent import (
    CONSTRAINT_PATTERNS,
    LANDMARK_CITY_KB,
    OUT_OF_SCOPE_PLACES,
    OUT_OF_SCOPE_TOPICS,
    UNACCENTED_CONSTRAINT_PATTERNS,
    _find_best_day_for_city,
    build_trip_memory_dict,
    check_geography_and_feasibility,
    classify_copilot_request,
    extract_persistent_constraints,
    is_out_of_scope_query,
    resolve_effective_city,
)
from app.trips.copilot_mutation import (
    _ensure_editable_outline,
    _insert_landmark_into_day,
    _lookup_poi_by_keyword,
    handle_city_mismatch_and_mutation,
    handle_itinerary_mutation_request,
)
from app.trips.handlers.smart_concierge_handler import is_simple_social_greeting
from app.trips.handlers.swap_meal_handler import format_green_score
from app.trips.itinerary_constraints import apply_quantitative_constraints_to_response
from app.trips.schemas import (
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotSuggestedPoiItem,
    IntentCategoryType,
    TripContextPayload,
)
from app.trips.text_utils import (
    contains_any_phrase,
    normalize_vietnamese_query,
    strip_vietnamese_accents,
)

logger = logging.getLogger(__name__)

GREENTRIP_COPILOT_SYSTEM_PROMPT = """# ROLE & IDENTITY
Bạn là **GreenTrip AI** — Trợ lý cố vấn du lịch xanh bản địa chuyên sâu về khu vực **Đà Nẵng và Thừa Thiên Huế**.
Phong cách giao tiếp: Tự nhiên, thân thiện như người bản địa, rõ ràng và súc tích.

# QUY TẮC CỐT LÕI (BẮT BUỘC TUÂN THỦ)
1. Trả lời trực diện ngay câu đầu tiên: KHÔNG lặp lại lời chào máy móc từ tin nhắn thứ 2 trở đi.
2. Khóa địa lý & tính khả thi: Tuyệt đối không lẫn địa điểm Đà Nẵng/Hội An vào lịch Huế và ngược lại; phân biệt rõ 3 Chùa Linh Ứng (Sơn Trà, Bà Nà, Ngũ Hành Sơn); không xếp đi Đà Nẵng và Huế trong cùng 1 ngày khi chưa tính 2–2,5 giờ qua đèo/hầm Hải Vân.
3. Ghi nhớ ràng buộc xuyên suốt: Đi cùng người lớn tuổi/trẻ nhỏ (ưu tiên đường phẳng như Lăng Tự Đức, xe điện Đại Nội), mùa mưa tháng 9–1 (kèm phương án trong nhà).
4. Giải thích Đồ thị Tri thức & Điểm xanh: Nêu rõ vì sao địa điểm phù hợp (tiện tuyến, ít phát thải, hỗ trợ cộng đồng địa phương hay hợp sở thích) kèm Điểm xanh.
5. Ưu tiên cộng đồng địa phương & tránh lặp điểm đại trà: Xen kẽ tối thiểu 40–50% làng nghề, quán ăn bản địa, cơ sở lưu trú sinh thái có trong RETRIEVED_POIS thay vì chỉ lặp lại Đại Nội, Chùa Thiên Mụ, Lăng Khải Định.
6. Cảnh báo quá tải giờ cao điểm & gợi ý phương tiện linh hoạt: Khi nhắc điểm phổ biến (Đại Nội, Cầu Rồng, Bà Nà Hills, Chùa Linh Ứng Sơn Trà, Chùa Thiên Mụ, Mỹ Khê), luôn nhắc khung giờ cao điểm và gợi ý giờ vắng hoặc điểm bản địa thay thế. Đề xuất phương tiện dựa theo quãng đường thực tế và số lượng người đi (không lặp máy móc xe đạp/xe điện ở mọi câu).
7. Bảo vệ phạm vi & trung thực dữ liệu: Từ chối ngắn gọn câu hỏi ngoài Đà Nẵng – Huế; TUYỆT ĐỐI chỉ nhắc tên địa điểm có trong RETRIEVED_POIS hoặc REFERENCE_DRAFT.
8. Câu kết gọn gàng: Kết thúc bằng đúng 1 câu hỏi ngắn tự nhiên (tối đa 25 từ) kết thúc bằng dấu `?`, không viết đoạn A/B dài dòng.
"""


def handle_external_link_guidance(
    message: str,
    fact_check: dict[str, Any],
    trip_context: TripContextPayload,
    constraints: list[str],
) -> CopilotChatResponse:
    """Politely explain that external TikTok/video links cannot be opened directly and guide the user."""
    platform = str(fact_check.get("platform") or "mạng xã hội")
    dest = trip_context.destination or "Đà Nẵng & Huế"
    reply_text = (
        f"Hiện tại mình chưa thể mở và xem trực tiếp nội dung từ liên kết **{platform}** bạn vừa dán.\n\n"
        f"Bạn chỉ cần gõ **tên địa điểm, tên quán hoặc mô tả ngắn trong video** (ví dụ: *quán cà phê sân vườn ở Huế* hay *bãi biển ít đông ở Đà Nẵng*), "
        f"mình sẽ kiểm tra ngay tọa độ thật, giá tham khảo, giờ vắng khách và xếp vào lịch trình **{dest}** cho bạn. Bạn đang quan tâm đến điểm nào trong video đó?"
    )
    return CopilotChatResponse(
        reply_text=reply_text,
        intent="external_link_guidance",
        intent_category="QA_AND_COMPARE",
        reasoning_trace=(
            f"1. Nhận diện liên kết ngoài ({platform}) trước bộ lọc toán học/out-of-scope.\n"
            "2. Hướng dẫn người dùng nhập tên địa điểm hoặc mô tả ngắn để tra cứu trên dữ liệu đã kiểm định."
        ),
        recommended_poi_ids=[],
        detected_constraints=constraints,
        suggested_pois=[],
        action_type="none",
        next_suggested_prompts=[
            f"Tìm quán ăn bản địa ít đông ở {dest}",
            f"Gợi ý điểm xanh & làng nghề tại {dest}",
            "Lên lịch trình 2 ngày tránh giờ cao điểm",
        ],
    )


def handle_out_of_scope_request(
    message: str,
    oos_target: str | None,
    trip_context: TripContextPayload,
    constraints: list[str],
) -> CopilotChatResponse:
    """Rule 5: Strict Out-of-Scope refusal with friendly pivot and zero POI leakage."""
    dest = trip_context.destination or "Đà Nẵng & Huế"
    days = trip_context.days_count or 4
    topic_label = oos_target or "chủ đề này"

    reasoning_trace = (
        f"1. Phân tích ý định: Câu hỏi đề cập đến '{topic_label}', nằm ngoài phạm vi tư vấn du lịch xanh miền Trung (Đà Nẵng – Huế – Hội An).\n"
        f"2. Kiểm tra quy tắc bảo vệ phạm vi (Rule 5): Từ chối lịch sự trong 1 câu, tuyệt đối không trả về thẻ POI Đà Nẵng/Huế (recommended_poi_ids = []).\n"
        f"3. Điều hướng hội thoại (Rule 6): Đưa ra câu hỏi lựa chọn A/B quay lại hành trình {dest} {days} ngày."
    )

    reply_text = (
        f"Mình là chuyên gia bản địa chuyên sâu về du lịch xanh khu vực **Đà Nẵng – Huế – Hội An** nên xin phép không trả lời về **{topic_label}** nha! 🌱\n\n"
        f"Quay lại hành trình **{dest} ({days} ngày)** của bạn: hiện tại bạn muốn mình ưu tiên **A — Tinh chỉnh lại các điểm tham quan & quán ăn bản địa theo từng ngày**, hay **B — Gợi ý các quán cà phê/điểm trú mưa chuẩn xanh** cho chuyến đi?"
    )

    return CopilotChatResponse(
        reply_text=reply_text,
        intent="out_of_scope",
        intent_category="OUT_OF_SCOPE",
        reasoning_trace=reasoning_trace,
        recommended_poi_ids=[],
        detected_constraints=constraints,
        suggested_pois=[],
        action_type="none",
        next_suggested_prompts=[
            f"Tối ưu lịch trình {dest} theo cụm gần nhau",
            "Gợi ý quán cafe yên tĩnh nhiều cây xanh ở Đà Nẵng",
            "Phương án dự phòng khi trời mưa ở Đà Nẵng & Huế",
        ],
    )


def handle_city_comparison_consultative(
    message: str,
    trip_context: TripContextPayload,
    connection: Connection,
    constraints: list[str],
) -> CopilotChatResponse:
    """
    Rule 1, 2, 4, 6: Consultative comparison ('Mình có 5 ngày nghỉ tháng 12, thích biển và đồ ăn ngon thì nên đi Đà Nẵng hay Huế?').
    Gives a direct verdict in sentence 1, grounds reasoning in user criteria + weather, and attaches verified POIs.
    """
    norm_msg = normalize_vietnamese_query(message)
    folded_msg = strip_vietnamese_accents(norm_msg)
    wants_beach = contains_any_phrase(norm_msg, folded_msg, ["biển"], ["bien"]) or "beach_lover" in constraints
    wants_heritage = contains_any_phrase(
        norm_msg,
        folded_msg,
        ["di tích", "lịch sử", "cổ kính", "lăng tẩm", "trầm mặc"],
        ["di tich", "lich su", "co kinh", "lang tam", "tram mac"],
    )
    is_december_or_rain = contains_any_phrase(
        norm_msg,
        folded_msg,
        ["tháng 10", "tháng 11", "tháng 12"],
        ["thang 10", "thang 11", "thang 12"],
    ) or "rainy_season" in constraints

    days_match = re.search(r"(\d+)\s*ngay", folded_msg)
    is_duration_advice = (
        getattr(trip_context, "mode", "trip") == "ideation"
        and not days_match
        and contains_any_phrase(
            norm_msg,
            folded_msg,
            ["mấy ngày", "bao nhiêu ngày", "nên đi đâu", "đi bao lâu"],
            ["may ngay", "bao nhieu ngay", "nen di dau", "di bao lau"],
        )
    )
    days_num = int(days_match.group(1)) if days_match else (5 if is_duration_advice else (trip_context.days_count or 5))

    # Verdict selection
    if is_duration_advice:
        verdict_city = "Đà Nẵng & Huế"
        verdict_opening = (
            "Để đi trọn cả **Đà Nẵng – Hội An – Cố đô Huế** mà không bị chạy sô, "
            "thời lượng đẹp nhất là **4 đến 5 ngày** (chia **3 ngày Đà Nẵng – Hội An + 1–2 ngày Tàu Di sản ra Huế**); "
            "nếu chỉ có **3 ngày**, bạn nên tập trung trọn vẹn một đầu thành phố để tận hưởng sâu hơn!"
        )
    elif wants_heritage and not wants_beach:
        verdict_city = "Huế"
        verdict_opening = (
            f"Với {days_num} ngày nghỉ và niềm đam mê chiều sâu di sản văn hóa – ẩm thực cung đình, "
            f"mình khuyên bạn **nghiêng rõ về Cố đô Huế** (kết hợp 1–2 ngày ở Đà Nẵng nếu muốn đổi gió)!"
        )
    else:
        verdict_city = "Đà Nẵng"
        verdict_opening = (
            f"Với {days_num} ngày nghỉ{' vào tháng 12' if is_december_or_rain else ''} cùng 2 tiêu chí **thích biển** và **đồ ăn ngon**, "
            f"mình khuyên bạn **nghiêng rõ về Đà Nẵng** (kết hợp đi Phố cổ Hội An trong ngày)!"
        )

    # Query curated real POIs for comparison
    pois: list[CopilotSuggestedPoiItem] = _query_curated_comparison_pois(connection, verdict_city, constraints)
    rec_ids = [p.id for p in pois]

    poi_bullets = "\n".join(format_three_layer_poi_bullet(p) for p in pois)

    weather_note = (
        "- **Lợi thế thời tiết tháng 12 & Biển ngay trong phố**: Tháng 12 miền Trung se lạnh và có thể có mưa rào nhẹ; ở Đà Nẵng, **Bãi biển Mỹ Khê** nằm ngay trung tâm thành phố nên hễ trời hửng nắng là bạn ra dạo biển, ngắm bình minh được ngay. Ngược lại, biển ở Huế (Thuận An, Lăng Cô) cách xa trung tâm 15–60km và mùa đông xứ Huế thường mưa phùn trầm mặc hơn.\n"
        if is_december_or_rain
        else "- **Lợi thế Biển ngay trong phố & Tiện di chuyển**: **Bãi biển Mỹ Khê** và **Bán đảo Sơn Trà** nằm ngay sát trung tâm Đà Nẵng, chỉ mất 5–10 phút đi taxi điện hoặc xe đạp ven biển.\n"
    )

    body = (
        "**Vì sao Đà Nẵng khớp nhất với tiêu chí của bạn?**\n"
        f"{weather_note}"
        "- **Thiên đường ẩm thực đa tầng**: Bạn có thể thưởng thức từ các quán bản địa trứ danh như **Mì Quảng 1A**, **Bánh xèo Bà Dưỡng**, **Bún chả cá Hớn (Michelin Bib Gourmand)**, hải sản tươi sống ven biển đến các nhà hàng fine-dining và cafe specialty trong hẻm yên tĩnh.\n"
        "- **Dễ dàng mở rộng hành trình**: Từ Đà Nẵng chỉ mất ~35 phút đi xe điện vào **Phố cổ Hội An** ăn Cao lầu, Cơm gà và ngắm phố đèn lồng trong ngày mà không cần đổi khách sạn.\n\n"
        "**Tọa độ tiêu biểu từ Đồ thị Tri thức GreenTrip (Knowledge Graph):**\n"
        f"{poi_bullets}\n\n"
        "**Khi nào bạn nên chọn Huế?**\n"
        "- Chỉ nên chọn Huế làm trọng tâm nếu bạn muốn sống chậm giữa quần thể **Đại Nội Huế**, **Lăng Tự Đức** và thưởng thức ẩm thực cung đình/chay thanh tịnh. Tuy nhiên với quỹ thời gian "
        f"{days_num} ngày, bạn hoàn toàn có thể dành **{max(days_num - 2, 3)} ngày ở Đà Nẵng – Hội An** và trích **1–2 ngày đi Tàu Di sản qua đèo Hải Vân ra Huế**."
    )

    closing_hook = (
        f"Bạn muốn mình thiết kế chi tiết lịch trình {days_num} ngày theo phương án **A — Dành trọn {days_num} ngày ở Đà Nẵng & Hội An** để nghỉ dưỡng biển và khám phá ẩm thực thảnh thơi, "
        f"hay phương án **B — Chia {max(days_num - 2, 3)} ngày Đà Nẵng + {min(2, days_num - 1)} ngày Huế** (trải nghiệm tàu hỏa qua đèo Hải Vân)?"
    )

    reasoning_trace = (
        f"1. Phân tích câu hỏi: Người dùng có {days_num} ngày nghỉ{' tháng 12' if is_december_or_rain else ''}, phân vân giữa Đà Nẵng và Huế với tiêu chí: thích biển + đồ ăn ngon.\n"
        f"2. Tư duy Cố vấn (Rule 1 & 2): Đưa ra phán quyết trực diện ngay câu đầu nghiêng về {verdict_city} vì biển Mỹ Khê nằm ngay nội đô, ẩm thực phong phú và tháng 12 đỡ mưa lạnh hơn Huế.\n"
        f"3. Truy xuất Knowledge Graph (Rule 4): Chọn {len(pois)} địa điểm tiêu biểu ({', '.join(p.name for p in pois)}) kèm Green Score và lý do khớp tiêu chí.\n"
        f"4. Đồng bộ recommended_poi_ids: {rec_ids}."
    )

    return CopilotChatResponse(
        reply_text=f"{verdict_opening}\n\n{body}\n\n{closing_hook}",
        intent="qa_compare",
        intent_category="QA_AND_COMPARE",
        reasoning_trace=reasoning_trace,
        recommended_poi_ids=rec_ids,
        detected_constraints=constraints,
        target_slot="morning",
        suggested_pois=pois,
        action_type="view_on_map",
        next_suggested_prompts=[
            f"Chọn phương án A: Lên lịch {days_num} ngày Đà Nẵng & Hội An",
            f"Chọn phương án B: Chia {max(days_num - 2, 3)} ngày Đà Nẵng, {min(2, days_num - 1)} ngày Huế",
            "Gợi ý các quán ăn đặc sản ngon nhất ở Đà Nẵng",
        ],
        green_impact_summary="Tối ưu cung đường lưu trú tại Đà Nẵng kết hợp tàu hỏa di sản giúp giảm tới 65% lượng phát thải CO2 di chuyển liên tỉnh.",
        budget_impact_summary=f"Chi phí ước tính cho {days_num} ngày khoảng 4.500.000 – 6.800.000 ₫/người tùy hạng khách sạn ven biển.",
    )


def _query_curated_comparison_pois(
    connection: Connection,
    primary_city: str,
    constraints: list[str],
) -> list[CopilotSuggestedPoiItem]:
    """Fetch 3 iconic POIs matching primary_city (strict province isolation)."""
    items: list[CopilotSuggestedPoiItem] = []
    city_lower = (primary_city or "").lower()
    is_hue_only = ("huế" in city_lower or "hue" in city_lower) and "đà nẵng" not in city_lower and "da nang" not in city_lower
    is_dn_only = ("đà nẵng" in city_lower or "da nang" in city_lower) and "huế" not in city_lower and "hue" not in city_lower
    city_filter_sql = "AND ci.name ILIKE '%%Hue%%'" if is_hue_only else ("AND ci.name ILIKE '%%Da Nang%%'" if is_dn_only else "")
    name_filter_sql = (
        "(p.name ILIKE '%%Thủy Biều%%' OR p.name ILIKE '%%Tự Đức%%' OR p.name ILIKE '%%Bún Bò%%' OR p.name ILIKE '%%Đại Nội%%')"
        if is_hue_only
        else "(p.name ILIKE '%%Mỹ Khê%%' OR p.name ILIKE '%%Mì Quảng%%' OR p.name ILIKE '%%Bà Dưỡng%%' OR p.name ILIKE '%%Sơn Trà%%')"
    )
    try:
        with connection.cursor() as cur:
            cur.execute(
                f"""
                SELECT p.poi_id::text, p.name, c.name, p.sub_category, p.image_url,
                       p.green_score, p.satisfaction_score, p.address, p.estimated_cost, ci.name
                FROM public.pois p
                JOIN public.poi_categories c ON p.category_id = c.category_id
                JOIN public.cities ci ON p.city_id = ci.city_id
                WHERE p.is_active IS NOT FALSE
                  {city_filter_sql}
                  AND {name_filter_sql}
                ORDER BY p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
                LIMIT 3;
                """
            )
            rows = cur.fetchall()
            for r in rows:
                city_disp = "Đà Nẵng" if "da nang" in str(r[9]).lower() else "Huế"
                g_score = format_green_score(r[5])
                kg_exp, eco_list = build_kg_explanation_for_poi(
                    r[1], r[2], r[3], city_disp, constraints
                )
                items.append(
                    CopilotSuggestedPoiItem(
                        id=r[0],
                        name=r[1],
                        category=r[2],
                        sub_category=r[3],
                        city=city_disp,
                        image_url=r[4] or "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80",
                        green_score=g_score,
                        rating=float(r[6] or 4.8),
                        address=r[7] or f"{city_disp}, Việt Nam",
                        swap_reason=f"{kg_exp} • 🌱 Green Score {g_score}/100",
                        kg_explanation=kg_exp,
                        eco_practices=eco_list,
                        estimated_cost=float(r[8]) if r[8] else None,
                        price_range_display="Miễn phí" if not r[8] else f"~{int(float(r[8])):,} ₫",
                    )
                )
    except Exception as exc:
        logger.warning("Comparison POI DB lookup fallback: %s", exc)

    if not items:
        fallback_defs = [
            ("dn-my-khe", "Bãi biển Mỹ Khê", "Cảnh quan và thiên nhiên", "beach", "Đà Nẵng", 95, 4.9, "Đường Võ Nguyên Giáp, Sơn Trà, Đà Nẵng"),
            ("dn-mi-quang-1a", "Mì Quảng 1A Hải Phòng", "Ẩm thực và quán ăn", "local_specialty", "Đà Nẵng", 90, 4.7, "1A Hải Phòng, Hải Châu, Đà Nẵng"),
            ("dn-son-tra", "Bán đảo Sơn Trà & Chùa Linh Ứng", "Cảnh quan và thiên nhiên", "peninsula", "Đà Nẵng", 96, 4.9, "Hoàng Sa, Thọ Quang, Sơn Trà, Đà Nẵng"),
        ]
        for pid, name, cat, sub, city_disp, g_score, rating, addr in fallback_defs:
            kg_exp, eco_list = build_kg_explanation_for_poi(name, cat, sub, city_disp, constraints)
            items.append(
                CopilotSuggestedPoiItem(
                    id=pid,
                    name=name,
                    category=cat,
                    sub_category=sub,
                    city=city_disp,
                    image_url="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80",
                    green_score=g_score,
                    rating=rating,
                    address=addr,
                    swap_reason=f"{kg_exp} • 🌱 Green Score {g_score}/100",
                    kg_explanation=kg_exp,
                    eco_practices=eco_list,
                    price_range_display="Miễn phí – 65.000 ₫",
                )
            )
    return items[:3]


def handle_over_scheduling_guardrail(
    message: str,
    fact_check: dict[str, Any],
    trip_context: TripContextPayload,
    constraints: list[str],
) -> CopilotChatResponse:
    """Rule 2: Block impossible 1-day schedules and split into realistic 2-3 days."""
    reasoning_trace = (
        "1. Kiểm chứng thực tế (Feasibility Guardrail - Rule 2): Người dùng muốn gộp Bà Nà Hills + Ngũ Hành Sơn + Hội An + Đại Nội Huế trong 1 ngày.\n"
        "2. Phân tích khoảng cách & thời gian: Bà Nà Hills mất 5–6 tiếng; Hội An cách Bà Nà 55km; Đại Nội Huế cách Hội An >120km qua đèo Hải Vân -> Bất khả thi trong 1 ngày.\n"
        "3. Đề xuất giải pháp: Tách thành 3 ngày theo cụm địa lý (Cụm Tây Đà Nẵng -> Cụm Nam Đà Nẵng & Hội An -> Cụm Cố đô Huế)."
    )

    reply_text = (
        "**Lịch trình gộp các điểm này trong cùng 1 ngày là bất khả thi về mặt khoảng cách và thời gian di chuyển nha bạn!** ⚠️\n\n"
        "**Phân tích thực tế từ bản đồ địa phương:**\n"
        "- **Bà Nà Hills (Cầu Vàng)** nằm trên đỉnh núi Chúa phía Tây Đà Nẵng, chỉ riêng thời gian đi cáp treo 2 chiều và tham quan đã tốn **5 – 6 tiếng**.\n"
        "- **Ngũ Hành Sơn & Phố cổ Hội An** nằm ở phía Nam (cách Bà Nà ~50–55km), đẹp nhất là từ 15:00 chiều đến tối khi phố cổ lên đèn lồng.\n"
        "- **Đại Nội Huế** nằm ở Cố đô Huế phía Bắc, cách Hội An hơn **120 km** (phải vượt đèo Hải Vân mất ~2.5–3 tiếng di chuyển).\n\n"
        "**Đề xuất tách thành 3 ngày chuẩn nhịp độ Xanh (Không chạy sô mệt mỏi):**\n"
        "- **Ngày 1 — Cụm Núi Chúa & Biển Đà Nẵng**: Sáng đi **Bà Nà Hills & Cầu Vàng** (07:30 – 14:00) — 🌱 *Đi cáp treo điện giảm khí thải leo đèo*; chiều về nghỉ ngơi và dạo bộ **Bãi biển Mỹ Khê**.\n"
        "- **Ngày 2 — Cụm Di sản Phía Nam (Đà Nẵng → Hội An)**: Chiều mát (14:30) ghé **Danh thắng Ngũ Hành Sơn** (có thang máy kính) rồi đi thẳng xuống **Phố cổ Hội An** dạo bộ phố đèn lồng — 🌱 *Khu phố cổ không tiếng động cơ xe máy*.\n"
        "- **Ngày 3 — Chuyến tàu Di sản vượt Đèo Hải Vân ra Huế**: Sáng đi **Tàu hỏa Di sản Đà Nẵng – Huế** ngắm vịnh Lăng Cô, chiều tham quan **Đại Nội Huế** và **Chùa Thiên Mụ** — 🌱 *Tàu hỏa giảm 75% CO2 so với xe cá nhân*.\n\n"
        "Bạn muốn mình **A — Cập nhật ngay cấu trúc 3 ngày tách cụm này vào lịch trình của bạn**, hay **B — Giữ nguyên số ngày hiện tại và bỏ bớt Bà Nà Hills để ưu tiên đi sâu Đà Nẵng – Huế**?"
    )

    return CopilotChatResponse(
        reply_text=reply_text,
        intent="qa_compare",
        intent_category="QA_AND_COMPARE",
        reasoning_trace=reasoning_trace,
        recommended_poi_ids=[],
        detected_constraints=constraints,
        fact_check_warning=fact_check["warning"],
        suggested_pois=[],
        action_type="none",
        avoid_notice=fact_check["warning"],
        next_suggested_prompts=[
            "Áp dụng cấu trúc 3 ngày tách cụm hợp lý này vào lịch",
            "Bỏ Bà Nà Hills để ưu tiên khám phá Đà Nẵng và Huế thong thả",
            "Giờ chạy của Tàu hỏa Di sản Đà Nẵng – Huế?",
        ],
    )


def handle_elderly_constraints_consultation(
    message: str,
    trip_context: TripContextPayload,
    connection: Connection,
    constraints: list[str],
) -> CopilotChatResponse:
    """
    Rule 1, 3, 4, 6: Deeply personalized consultation when user specifies 'Đi cùng bố mẹ lớn tuổi'
    (Persistent Constraints + KG Flat-Path Reasoning + Rainy Season Backup).
    """
    _, is_both, city_display = resolve_effective_city(message, trip_context.destination)
    pois = _query_elderly_friendly_pois(connection, city_display, is_both, constraints)
    rec_ids = [p.id for p in pois]
    poi_bullets = "\n".join(format_three_layer_poi_bullet(p) for p in pois)

    opening = (
        "Khi đi cùng **bố mẹ lớn tuổi**, mình đã kích hoạt chế độ **Ưu tiên An dưỡng & Đường phẳng (Senior-Friendly Constraint)** xuyên suốt toàn bộ lịch trình của bạn: "
        "**tối đa 2–3 điểm/ngày, loại bỏ các điểm leo bậc dốc cao, nghỉ trưa đủ 90 phút và luôn kèm phương án Indoor phòng mưa**!"
    )

    body = (
        "**Các điều chỉnh & điểm đến được chọn lọc riêng cho bố mẹ từ Đồ thị Tri thức:**\n"
        f"{poi_bullets}\n\n"
        "**Nguyên tắc thiết kế lịch trình ngầm đã áp dụng cho đoàn có người lớn tuổi:**\n"
        "- **Tại Đà Nẵng & Hội An**: Đi **Bán đảo Sơn Trà & Chùa Linh Ứng** bằng xe ô tô/taxi điện ngắm cảnh (bỏ qua Đỉnh Bàn Cờ dốc cao); tại **Ngũ Hành Sơn** dùng thang máy kính 2 chiều; tối ở **Phố cổ Hội An** ưu tiên ngồi xích lô hoặc thuyền gỗ sông Hoài.\n"
        "- **Tại Cố đô Huế**: Chọn **Lăng Tự Đức** (đường dạo phẳng quanh hồ Lưu Khiêm & rừng thông) và **Đại Nội Huế** (có xe điện nội khu) **thay vì Lăng Khải Định** (phải leo 127 bậc thang dốc).\n"
        "- **Phương án dự phòng trời mưa (Tháng 10 – Tháng 12)**: Nếu gặp mưa rào, lập tức chuyển sang **Bảo tàng Cổ vật Cung đình Huế**, **Bảo tàng Điêu khắc Chăm** hoặc thưởng trà thảo mộc ấm áp trong nhà rường."
    )

    closing_hook = (
        "Để mình khóa phương án di chuyển êm ái nhất cho bố mẹ: bạn muốn gia đình đi lại giữa các điểm bằng "
        "**A — Taxi điện Xanh SM / Ô tô điện đưa đón tận cửa từng điểm**, "
        "hay **B — Kết hợp thêm trải nghiệm Tàu hỏa Di sản ngắm vịnh Lăng Cô (ghế mềm điều hòa)**?"
    )

    reasoning_trace = (
        f"1. Ghi nhận Ràng buộc Ngầm Xuyên suốt (Rule 3): Kích hoạt 'elderly_friendly' (và 'rainy_season' cho mùa mưa miền Trung).\n"
        f"2. Suy luận Knowledge Graph (Rule 4): Ưu tiên Lăng Tự Đức (đường phẳng) thay Lăng Khải Định (127 bậc thang), Sơn Trà ngắm cảnh bằng xe + Chùa Linh Ứng sân phẳng, Đại Nội có xe điện, kèm Bảo tàng Cổ vật Cung đình làm phương án mưa.\n"
        f"3. Đồng bộ recommended_poi_ids: {rec_ids}."
    )

    return CopilotChatResponse(
        reply_text=f"{opening}\n\n{body}\n\n{closing_hook}",
        intent="travel_tips_budget",
        intent_category="QA_AND_COMPARE",
        reasoning_trace=reasoning_trace,
        recommended_poi_ids=rec_ids,
        detected_constraints=constraints,
        target_slot="morning",
        suggested_pois=pois,
        action_type="view_on_map",
        next_suggested_prompts=[
            "Chọn A: Tối ưu toàn bộ lịch trình di chuyển bằng taxi điện tận nơi",
            "Chọn B: Kết hợp Tàu hỏa Di sản qua đèo Hải Vân cho bố mẹ",
            "Gợi ý các nhà hàng cơm nhà / thực dưỡng dễ tiêu hóa cho người lớn tuổi",
        ],
        green_impact_summary="Kết hợp xe điện nội khu, taxi điện và nhịp độ du lịch chậm giúp bảo vệ sức khỏe người lớn tuổi và giảm phát thải.",
        budget_impact_summary="Dự toán ngân sách di chuyển bằng xe điện/ô tô trọn gói khoảng 400.000 – 700.000 ₫/ngày cho cả gia đình.",
    )


def _query_elderly_friendly_pois(
    connection: Connection,
    city_display: str,
    is_both: bool,
    constraints: list[str],
) -> list[CopilotSuggestedPoiItem]:
    """Fetch senior-friendly flat-path POIs strictly filtered by target province."""
    items: list[CopilotSuggestedPoiItem] = []
    city_lower = (city_display or "").lower()
    city_filter_sql = ""
    if not is_both:
        if "huế" in city_lower or "hue" in city_lower:
            city_filter_sql = "AND ci.name ILIKE '%%Hue%%'"
        else:
            city_filter_sql = "AND ci.name ILIKE '%%Da Nang%%'"
    try:
        with connection.cursor() as cur:
            cur.execute(
                f"""
                SELECT p.poi_id::text, p.name, c.name, p.sub_category, p.image_url,
                       p.green_score, p.satisfaction_score, p.address, p.estimated_cost, ci.name
                FROM public.pois p
                JOIN public.poi_categories c ON p.category_id = c.category_id
                JOIN public.cities ci ON p.city_id = ci.city_id
                WHERE p.is_active IS NOT FALSE
                  {city_filter_sql}
                  AND (
                    p.name ILIKE '%%Tự Đức%%'
                    OR p.name ILIKE '%%Thủy Biều%%'
                    OR p.name ILIKE '%%Linh Ứng%%'
                    OR p.name ILIKE '%%Sơn Trà%%'
                    OR p.name ILIKE '%%Cổ vật%%'
                    OR p.name ILIKE '%%Điêu khắc Chăm%%'
                    OR p.name ILIKE '%%Đại Nội%%'
                  )
                ORDER BY p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
                LIMIT 4;
                """
            )
            rows = cur.fetchall()
            for r in rows:
                c_disp = "Đà Nẵng" if "da nang" in str(r[9]).lower() else "Huế"
                g_score = format_green_score(r[5])
                kg_exp, eco_list = build_kg_explanation_for_poi(
                    r[1], r[2], r[3], c_disp, constraints
                )
                items.append(
                    CopilotSuggestedPoiItem(
                        id=r[0],
                        name=r[1],
                        category=r[2],
                        sub_category=r[3],
                        city=c_disp,
                        image_url=r[4] or "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80",
                        green_score=g_score,
                        rating=float(r[6] or 4.8),
                        address=r[7] or f"{c_disp}, Việt Nam",
                        swap_reason=f"{kg_exp} • 🌱 Green Score {g_score}/100",
                        kg_explanation=kg_exp,
                        eco_practices=eco_list,
                        estimated_cost=float(r[8]) if r[8] else None,
                    )
                )
    except Exception as exc:
        logger.warning("Elderly POI lookup fallback: %s", exc)

    if not items:
        fallback_defs = [
            ("dn-son-tra-elderly", "Bán đảo Sơn Trà & Chùa Linh Ứng", "Cảnh quan và thiên nhiên", "peninsula", "Đà Nẵng", 96, 4.9, "Hoàng Sa, Thọ Quang, Sơn Trà, Đà Nẵng"),
            ("hue-lang-tu-duc", "Lăng Tự Đức (Khiêm Lăng)", "Di tích lịch sử và văn hóa", "royal_mausoleums", "Huế", 95, 4.9, "Thôn Thượng Ba, Thủy Xuân, TP. Huế"),
            ("hue-bao-tang-co-vat", "Bảo tàng Cổ vật Cung đình Huế", "Di tích lịch sử và văn hóa", "museums_galleries", "Huế", 92, 4.7, "03 Lê Trực, Phú Hậu, TP. Huế"),
        ]
        for pid, name, cat, sub, c_disp, g_score, rating, addr in fallback_defs:
            kg_exp, eco_list = build_kg_explanation_for_poi(name, cat, sub, c_disp, constraints)
            items.append(
                CopilotSuggestedPoiItem(
                    id=pid,
                    name=name,
                    category=cat,
                    sub_category=sub,
                    city=c_disp,
                    image_url="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80",
                    green_score=g_score,
                    rating=rating,
                    address=addr,
                    swap_reason=f"{kg_exp} • 🌱 Green Score {g_score}/100",
                    kg_explanation=kg_exp,
                    eco_practices=eco_list,
                )
            )
    return items[:4]


def _default_ab_hook_for_intent(sub_intent: str, city_display: str, current_day: int) -> str:
    """Return a concise, single-sentence Vietnamese follow-up question."""
    if sub_intent == "cafe_culture":
        return f"Bạn muốn mình ghim quán nào ở {city_display} vào Ngày {current_day}?"
    if sub_intent == "culinary_guide":
        return f"Bạn muốn xếp quán đặc sản {city_display} này vào bữa trưa hay bữa tối Ngày {current_day}?"
    if sub_intent == "swap_meal_vegetarian":
        return f"Bạn muốn thay ngay quán chay này vào bữa ăn Ngày {current_day} hay lưu vào Ý tưởng?"
    if sub_intent == "rainy_day_alternatives":
        return f"Bạn muốn đổi điểm ngoài trời chiều Ngày {current_day} sang điểm trong nhà nào ở trên?"
    if sub_intent == "night_eco_activities":
        return f"Buổi tối Ngày {current_day} bạn muốn tản bộ ven sông hay đi chợ đêm?"
    if sub_intent == "late_schedule_adjust":
        return f"Bạn muốn rút gọn còn 1 điểm gần trung tâm hay dời phần còn lại sang sáng mai?"
    if sub_intent == "poi_advice":
        return f"Bạn muốn chèn điểm này vào sáng sớm Ngày {current_day} để tránh đông không?"
    return f"Bạn muốn mình thêm điểm nào vào lịch Ngày {current_day} tại {city_display}?"


def upgrade_handler_response_to_mindtrip_standard(
    request: CopilotChatRequest,
    raw_response: CopilotChatResponse,
    intent_category: IntentCategoryType,
    constraints: list[str],
    connection: Connection | None = None,
) -> CopilotChatResponse:
    """
    Upgrade any handler output so it strictly satisfies all 6 Core Rules:
    1. Direct opening (strips repeated 'Chào bạn! Mình là GreenTrip Copilot...' when not a pure greeting)
    2. Strict city isolation on suggested_pois (no Hue POIs when user asked 'ở đn')
    3. Persistent constraint notes (e.g. elderly_friendly, rainy_season, quiet_vibe)
    4. 3-Layer Knowledge Graph + Eco-Integration bullets for retrieved POIs
    5. Synchronized recommended_poi_ids & reasoning_trace
    6. Concrete A/B closing hook
    """
    norm_msg = normalize_vietnamese_query(request.message)
    _, is_both, city_display = resolve_effective_city(request.message, request.trip_context.destination)
    current_day = request.trip_context.current_day or 1

    # Short pure social greeting: keep 2-sentence reply untouched, no POI dump or thinking trace
    if raw_response.intent == "general_chat" and is_simple_social_greeting(request.message):
        raw_response.reply_text = raw_response.reply_text.strip()
        raw_response.intent_category = intent_category
        raw_response.reasoning_trace = None
        raw_response.recommended_poi_ids = []
        raw_response.suggested_pois = []
        raw_response.detected_constraints = constraints
        raw_response.trip_memory = build_trip_memory_dict(constraints, request.trip_context)
        return raw_response

    # 1. Strictly filter and enrich POIs with Knowledge Graph explanations
    query_vibe = "quiet" if "quiet_vibe" in constraints else ""
    filtered_pois = enrich_pois_with_kg_and_filter_city(
        pois=list(raw_response.suggested_pois or []),
        target_city_display=city_display,
        is_both_cities=is_both,
        constraints=constraints,
        query_vibe=query_vibe,
    )

    # Guarantee fallback quiet Da Nang cafes if DB is empty/offline during slang cafe query
    if raw_response.intent == "cafe_culture" and not filtered_pois and "đà nẵng" in city_display.lower():
        quiet_dn_fallbacks = [
            ("dn-local-beans", "The Local Beans - Phan Châu Trinh", "Quán cafe giải khát", "workspace_study_cafe", "Đà Nẵng", 91, 4.8, "56A Lê Hồng Phong / 84 Phan Châu Trinh, Hải Châu, Đà Nẵng"),
            ("dn-nia-coffee", "Nia Coffee (Hẻm Phan Thành Tài)", "Quán cafe giải khát", "garden_eco_cafe", "Đà Nẵng", 93, 4.8, "K3/14 Phan Thành Tài, Hải Châu, Đà Nẵng"),
            ("dn-ala-cafe", "Àla Cafe (Hẻm K113 Nguyễn Chí Thanh)", "Quán cafe giải khát", "quiet_alley_cafe", "Đà Nẵng", 90, 4.7, "K113/27 Nguyễn Chí Thanh, Hải Châu, Đà Nẵng"),
            ("dn-reu-cafe", "Rêu Cafe & Chill", "Quán cafe giải khát", "garden_eco_cafe", "Đà Nẵng", 92, 4.8, "K47/18 Lý Thái Tổ, Hải Châu, Đà Nẵng"),
        ]
        for pid, name, cat, sub, c_disp, g_score, rating, addr in quiet_dn_fallbacks:
            kg_exp, eco_list = build_kg_explanation_for_poi(name, cat, sub, c_disp, constraints, query_vibe="quiet")
            filtered_pois.append(
                CopilotSuggestedPoiItem(
                    id=pid,
                    name=name,
                    category=cat,
                    sub_category=sub,
                    city=c_disp,
                    image_url="https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80",
                    green_score=g_score,
                    rating=rating,
                    address=addr,
                    swap_reason=f"{kg_exp} • 🌱 Green Score {g_score}/100",
                    kg_explanation=kg_exp,
                    eco_practices=eco_list,
                    price_range_display="35.000 – 65.000 ₫/ly",
                )
            )

    reply_text = raw_response.reply_text.strip()

    # 2. Special handling for quiet/chill cafe queries ("rcm quán cf nào chill chill ở đn đi bro, ko ồn ào nha")
    if raw_response.intent == "cafe_culture" and "quiet_vibe" in constraints:
        poi_bullets = "\n".join(format_three_layer_poi_bullet(p) for p in filtered_pois[:4])
        reply_text = (
            f"Với tiêu chí **quán cà phê chill, yên tĩnh, tách biệt tiếng ồn xe cộ tại {city_display}**, "
            f"mình lọc ngay cho bạn các quán ẩn mình trong hẻm và không gian vườn xanh mát chuẩn gu dưới đây:\n\n"
            f"**Danh sách quán cà phê yên tĩnh tại {city_display} (kèm lý giải Đồ thị Tri thức & Điểm Xanh):**\n"
            f"{poi_bullets}"
        )
    else:
        # Append 3-layer KG + Green Score summary bullets for retrieved POIs if not already present
        if raw_response.intent != "general_chat" and filtered_pois and "Green Score" not in reply_text:
            kg_section = "\n".join(format_three_layer_poi_bullet(p) for p in filtered_pois[:3])
            reply_text = (
                f"{reply_text}\n\n**Gợi ý chọn lọc từ Đồ thị Tri thức GreenTrip (Knowledge Graph):**\n{kg_section}"
            )

    # 3. Persistent Constraint Reminder (Rule 3) if elderly_friendly is active across turns
    if "elderly_friendly" in constraints and "người lớn tuổi" not in reply_text.lower() and "bố mẹ" not in reply_text.lower():
        reply_text += (
            "\n\n*(💡 **Ghi nhớ ràng buộc gia đình**: Vì bạn đi cùng **bố mẹ lớn tuổi**, các địa điểm mình chọn ở trên đều ưu tiên lối đi bằng phẳng, không gian thoáng mát có ghế tựa nghỉ chân và thuận tiện đón taxi điện tận cửa)*."
        )

    # 4. Ensure 100% responses end with a concrete A/B Conversational Hook (Rule 6)
    ab_hook = _default_ab_hook_for_intent(raw_response.intent, city_display, current_day)
    reply_text = ensure_closing_ab_hook(reply_text, ab_hook)

    rec_ids = [p.id for p in filtered_pois]
    reasoning_trace = (
        f"1. Chuẩn hóa truy vấn & Thành phố mục tiêu: '{norm_msg}' -> Lọc địa điểm tại '{city_display}' (is_both={is_both}).\n"
        f"2. Phân nhánh Intent: {intent_category} ({raw_response.intent}).\n"
        f"3. Ràng buộc ngầm đang duy trì (Persistent Constraints): {constraints or ['eco_standard']}.\n"
        f"4. Đồng bộ Knowledge Graph & Thẻ POI (recommended_poi_ids): {rec_ids} ({len(filtered_pois)} địa điểm khớp nội dung)."
    )

    raw_response.suggested_pois = filtered_pois
    raw_response.recommended_poi_ids = rec_ids
    raw_response.detected_constraints = constraints
    raw_response.reasoning_trace = reasoning_trace
    apply_quantitative_constraints_to_response(
        raw_response,
        request.trip_context,
        connection=connection,
        constraints=constraints,
        coords_resolver=resolve_poi_coordinates,
    )
    filtered_pois = raw_response.suggested_pois
    rec_ids = [p.id for p in filtered_pois]
    reasoning_trace = raw_response.reasoning_trace or reasoning_trace

    # 5. Optional Gemini API synthesis with Corrective Grounding
    settings = get_settings()
    if settings.gemini_configured:
        gemini_reply = _try_gemini_synthesis(
            user_message=request.message,
            trip_context=request.trip_context,
            intent_category=intent_category,
            constraints=constraints,
            pois=filtered_pois,
            fallback_reply=reply_text,
            settings=settings,
        )
        if gemini_reply:
            candidate_reply = ensure_closing_ab_hook(gemini_reply, ab_hook)
            verified_reply, ungrounded_mentions = verify_and_ground_reply_text(
                candidate_reply=candidate_reply,
                fallback_reply=reply_text,
                suggested_pois=filtered_pois,
                trip_context=request.trip_context,
                connection=connection,
            )
            reply_text = verified_reply
            if ungrounded_mentions:
                reasoning_trace = (
                    f"{reasoning_trace}\n"
                    f"5. Corrective Grounding: Chặn {len(ungrounded_mentions)} tên ngoài DB "
                    f"({', '.join(ungrounded_mentions)}), giữ nguyên bản thảo xác thực."
                )
            else:
                reasoning_trace = (
                    f"{reasoning_trace}\n"
                    "5. Corrective Grounding: Đã xác thực toàn bộ địa điểm trong câu trả lời khớp DB."
                )

    raw_response.reply_text = reply_text
    raw_response.intent_category = intent_category
    raw_response.reasoning_trace = reasoning_trace
    raw_response.recommended_poi_ids = rec_ids
    raw_response.detected_constraints = constraints
    raw_response.trip_memory = build_trip_memory_dict(constraints, request.trip_context)
    raw_response.suggested_pois = filtered_pois
    return raw_response


def finalize_copilot_response(
    response: CopilotChatResponse,
    trip_context: TripContextPayload,
    constraints: list[str],
    connection: Connection | None = None,
    protected_keywords: list[str] | None = None,
) -> CopilotChatResponse:
    """Ensure every CopilotChatResponse carries trip_memory, normalized prices, coordinates, and Part-2 constraints."""
    response.detected_constraints = constraints
    response.trip_memory = build_trip_memory_dict(constraints, trip_context)
    for idx, p in enumerate(response.suggested_pois or []):
        p.price_range_display = normalize_poi_price_display(
            poi_name=p.name,
            category=p.category,
            sub_category=p.sub_category,
            raw_price_display=p.price_range_display,
            estimated_cost=p.estimated_cost,
        )
        lat_val, lng_val = resolve_poi_coordinates(p.name, p.city or "Đà Nẵng", p.lat, p.lng, idx)
        p.lat = lat_val
        p.lng = lng_val
    return apply_quantitative_constraints_to_response(
        response,
        trip_context,
        connection=connection,
        constraints=constraints,
        coords_resolver=resolve_poi_coordinates,
        protected_keywords=protected_keywords,
    )


def _try_gemini_synthesis(
    user_message: str,
    trip_context: TripContextPayload,
    intent_category: IntentCategoryType,
    constraints: list[str],
    pois: list[CopilotSuggestedPoiItem],
    fallback_reply: str,
    settings: Any,
) -> str | None:
    """
    Call Gemini API with GREENTRIP_COPILOT_SYSTEM_PROMPT and retrieved KG POIs
    if GEMINI_API_KEY is present. Falls back cleanly on timeout or error.
    """
    try:
        pois_context = [
            {
                "id": p.id,
                "name": p.name,
                "city": p.city,
                "category": p.category,
                "address": p.address,
                "green_score": p.green_score,
                "estimated_cost": p.estimated_cost,
                "opening_hours_status": p.opening_hours_status,
                "open_range_label": p.open_range_label,
                "opening_hours_warning": p.opening_hours_warning,
                "kg_explanation": p.kg_explanation,
                "eco_practices": p.eco_practices,
            }
            for p in pois
        ]
        history_snippet = [
            f"{m.get('role', 'user')}: {str(m.get('content', ''))[:250]}"
            for m in (trip_context.conversation_history or [])[-4:]
        ]
        prompt_payload = (
            f"MODE: {getattr(trip_context, 'mode', 'trip')} | "
            f"USER_PROFILE & CONSTRAINTS: destination={trip_context.destination}, days={trip_context.days_count}, "
            f"current_day={trip_context.current_day}, total_budget={trip_context.total_budget}, "
            f"num_people={trip_context.num_people}, transport_mode={trip_context.transport_mode}, "
            f"active_constraints={constraints}\n"
            f"RECENT_HISTORY: {json.dumps(history_snippet, ensure_ascii=False)}\n"
            f"RETRIEVED_POIS & KG_PATHS: {json.dumps(pois_context, ensure_ascii=False)}\n"
            f"STRICT_GROUNDING: Tuyệt đối chỉ nhắc tên địa điểm có trong RETRIEVED_POIS & KG_PATHS hoặc REFERENCE_DRAFT; cấm tự bịa thêm địa điểm mới. Nếu REFERENCE_DRAFT có mục Điểm mạnh / Cần cân nhắc thì giữ nguyên cấu trúc đó.\n"
            f"REFERENCE_DRAFT (giữ nguyên các dữ kiện thực tế và tên địa điểm): {fallback_reply}\n"
            f"USER_MESSAGE: {user_message}"
        )
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
        )
        resp = httpx.post(
            url,
            json={
                "system_instruction": {"parts": [{"text": GREENTRIP_COPILOT_SYSTEM_PROMPT}]},
                "contents": [{"role": "user", "parts": [{"text": prompt_payload}]}],
                "generationConfig": {"temperature": 0.35, "maxOutputTokens": 900},
            },
            timeout=6.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates") or []
            if candidates:
                parts = candidates[0].get("content", {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts).strip()
                if text:
                    return text
    except Exception as exc:
        logger.warning("Gemini synthesis skipped, using deterministic consultant output: %s", exc)
    return None
