"""Decision policy for routing requests between RAG, Tool Calling, or direct dialogue."""

from __future__ import annotations

import re
from typing import Any, Literal
from pydantic import BaseModel, Field

from app.trips.schemas import TripContextPayload
from app.trips.text_utils import strip_vietnamese_accents


class OrchestrationPlan(BaseModel):
    """Execution plan determined by the Orchestrator for a single user turn."""

    case_type: Literal[
        "knowledge_rag",
        "recommendation",
        "explanation",
        "itinerary_cost_route",
        "poi_details_price",
        "multi_turn_itinerary_mutation",
        "general_dialogue",
    ]
    needs_rag: bool = False
    rag_query: str | None = None
    rag_city: str | None = None
    tools_to_call: list[tuple[str, dict[str, Any]]] = Field(default_factory=list)
    resolved_city: str = "Đà Nẵng"
    context_notes: list[str] = Field(default_factory=list)


def decide_orchestration_plan(
    message: str,
    context: TripContextPayload,
) -> OrchestrationPlan:
    """
    Evaluate user message and active trip context to decide optimal strategy:
    RAG, Tool Calling, both, or conversational fallback.
    """
    clean_msg = message.strip()
    norm_msg = strip_vietnamese_accents(clean_msg.lower())

    # 1. Resolve effective destination
    effective_city = context.destination or "Đà Nẵng"
    if ("hue" in norm_msg and ("da nang" in norm_msg or "dn" in norm_msg)) or "da nang - hue" in norm_msg or "da nang hue" in norm_msg:
        effective_city = "Đà Nẵng - Huế"
    elif "hue" in norm_msg:
        effective_city = "Huế"
    elif "da nang" in norm_msg or "dn" in norm_msg:
        effective_city = "Đà Nẵng"

    city_code = "Hue" if "huế" in effective_city.lower() or "hue" in effective_city.lower() else "Danang"

    # Context analysis: check multi-turn references
    context_notes: list[str] = []
    if context.conversation_history:
        context_notes.append(f"Có {len(context.conversation_history)} tin nhắn trước đó trong phiên")

    # Check for obvious out-of-scope regions (Foreign cities or outside Central Vietnam)
    foreign_locations = ["paris", "tokyo", "london", "new york", "bangkok", "seoul", "ha noi", "sai gon", "hcm", "nha trang", "da lat"]
    if any(re.search(rf"\b{fl}\b", norm_msg) for fl in foreign_locations) and not any(
        re.search(rf"\b{cv}\b", norm_msg) for cv in ["da nang", "hue", "hoi an"]
    ):
        return OrchestrationPlan(
            case_type="general_dialogue",
            needs_rag=False,
            rag_query=None,
            rag_city=city_code,
            tools_to_call=[],
            resolved_city=effective_city,
            context_notes=["Câu hỏi nằm ngoài phạm vi địa bàn Đà Nẵng - Huế."],
        )

    # Check for non-tourism / out-of-domain requests (coding, currency/finance, private PII)
    out_of_domain_patterns = [
        r"\b(?:doan ma|viet code|lap trinh|python|javascript|sql|viet giup minh code)\b",
        r"\b(?:ty gia|dong yen|ngoai te|chung khoan|tien ao|bitcoin|gia vang)\b",
        r"\b(?:so dien thoai ca nhan|thong tin rieng tu|so cccd|mat khau)\b",
    ]
    if any(re.search(pat, norm_msg) for pat in out_of_domain_patterns):
        return OrchestrationPlan(
            case_type="general_dialogue",
            needs_rag=False,
            rag_query=None,
            rag_city=city_code,
            tools_to_call=[],
            resolved_city=effective_city,
            context_notes=["Câu hỏi ngoài phạm vi nghiệp vụ du lịch xanh."],
        )

    # Check social gratitude ("Cảm ơn bạn", "Thank you")
    gratitude_patterns = [
        r"^(?:cam on|cam on ban|cam on tro ly|thank you|thanks|thank|ok cam on|tuyet voi|da cam on|cam on nha|minh cam on|em cam on)\b",
    ]
    if any(re.search(pat, norm_msg) for pat in gratitude_patterns):
        return OrchestrationPlan(
            case_type="general_dialogue",
            needs_rag=False,
            rag_query=None,
            rag_city=city_code,
            tools_to_call=[],
            resolved_city=effective_city,
            context_notes=["social_gratitude"],
        )

    # Check social greeting ("Xin chào", "Hello")
    greeting_patterns = [
        r"^(?:xin chao|chao ban|chao tro ly|hello|hi|helo|alo)\b",
    ]
    if any(re.search(pat, norm_msg) for pat in greeting_patterns) and not any(k in norm_msg for k in ["lich trinh", "ngay", "hue", "da nang", "chi phi", "ngan sach"]):
        return OrchestrationPlan(
            case_type="general_dialogue",
            needs_rag=False,
            rag_query=None,
            rag_city=city_code,
            tools_to_call=[],
            resolved_city=effective_city,
            context_notes=["social_greeting"],
        )

    # -------------------------------------------------------------
    # CASE 3: Knowledge Graph Explanation ("Tại sao", "Vì sao", "Lý do")
    # -------------------------------------------------------------
    explanation_keywords = ["tai sao", "vi sao", "ly do", "sao lai goi y", "sao lai de xuat", "giai thich"]
    if any(k in norm_msg for k in explanation_keywords):
        target_poi = context.current_stop_name or ""
        # Check if user explicitly names a place instead of referring to "địa điểm này"
        for kw in ["tại sao lại đề xuất", "tại sao đề xuất", "vì sao gợi ý", "tại sao", "vì sao"]:
            if kw in clean_msg.lower():
                extracted = clean_msg.lower().replace(kw, "").strip(" ?:.,")
                if extracted and not any(generic in extracted for generic in ["địa điểm này", "nơi này", "quán này", "hệ thống"]):
                    target_poi = extracted
                break

        if not target_poi:
            target_poi = context.current_stop_name or "Bảo tàng Cổ vật Cung đình Huế"

        return OrchestrationPlan(
            case_type="explanation",
            needs_rag=False,
            tools_to_call=[("get_poi_explanation", {"poi_id": target_poi})],
            resolved_city=effective_city,
            context_notes=context_notes,
        )

    # -------------------------------------------------------------
    # CASE 5: Specific structured data (Price, Ticket, Opening hours)
    # -------------------------------------------------------------
    price_keywords = ["gia ve", "ve vao cong", "gia bao nhieu", "ton bao nhieu tien", "gio mo cua"]
    if any(k in norm_msg for k in price_keywords):
        # Extract potential POI name from message or current stop
        target_poi = context.current_stop_name or clean_msg
        for kw in ["giá vé của", "giá vé", "vé vào cổng", "giờ mở cửa"]:
            if kw in clean_msg.lower():
                target_poi = clean_msg.lower().replace(kw, "").strip(" ?:.,")
                break

        return OrchestrationPlan(
            case_type="poi_details_price",
            needs_rag=False,
            tools_to_call=[
                ("search_pois", {"query": target_poi or clean_msg, "city": city_code, "limit": 2}),
                ("get_poi_details", {"poi_id": target_poi or clean_msg}),
            ],
            resolved_city=effective_city,
            context_notes=context_notes,
        )

    # -------------------------------------------------------------
    # CASE 6: Multi-turn contextual mutation ("ngày thứ hai ít địa điểm hơn", "chuyển sang xe máy", "ngân sách", "thêm món chay")
    # -------------------------------------------------------------
    mutation_refs = [
        "ngay thu hai", "ngay 2", "ngay thu 2", "ngay mai", "doi diem", "doi mon",
        "it diem hon", "it dia diem hon", "it dia diem", "giam diem", "bo dia diem",
        "bo lang", "xoa diem", "them quan an", "them am thuc", "giam chi phi",
        "doi phuong tien", "nhe nhang hon", "thong tha hon", "giam bot",
        "chuyen sang xe may", "doi sang xe may", "di xe may", "chuyen sang o to",
        "chuyen sang xe buyt", "di buyt", "ngan sach chi con", "ngan sach con",
        "them cac dia diem an chay", "an chay", "mon chay", "quan chay", "co so kinh doanh dia phuong",
    ]
    if any(k in norm_msg for k in mutation_refs) and (
        context.current_itinerary_state or context.conversation_history or "ngay" in norm_msg or "bo" in norm_msg or "them" in norm_msg or "xe" in norm_msg or "ngan sach" in norm_msg
    ):
        target_day = 2 if any(k in norm_msg for k in ["ngay thu hai", "ngay 2", "ngay thu 2"]) else context.current_day

        new_mode = None
        if "xe may" in norm_msg:
            new_mode = "motorcycle"
        elif "o to" in norm_msg or "xe hoi" in norm_msg:
            new_mode = "driving"
        elif "buyt" in norm_msg or "xe dien" in norm_msg:
            new_mode = "transit"
        elif "di bo" in norm_msg:
            new_mode = "walking"

        new_b = None
        b_match = re.search(r"ngan sach\s*(?:chi con|con|la|giam xuong)?\s*(\d+(?:[\.,]\d+)?)\s*(?:trieu|tr|m)", norm_msg)
        if b_match:
            new_b = float(b_match.group(1).replace(",", ".")) * 1_000_000.0
        elif "1 trieu ruoi" in norm_msg or "1.5 trieu" in norm_msg:
            new_b = 1_500_000.0

        update_args: dict[str, Any] = {
            "current_itinerary": context.current_itinerary_state or [],
            "instruction": clean_msg,
            "target_day": target_day,
        }
        if new_mode:
            update_args["new_transport_mode"] = new_mode
        if new_b:
            update_args["new_budget"] = new_b

        return OrchestrationPlan(
            case_type="multi_turn_itinerary_mutation",
            needs_rag=False,
            tools_to_call=[
                ("update_itinerary", update_args),
                ("recommend_pois", {"interests": ["thư thái", "sinh thái"], "city": city_code, "limit": 2}),
            ],
            resolved_city=effective_city,
            context_notes=[f"Giữ nguyên các ngày khác, chỉ điều chỉnh theo yêu cầu: {clean_msg}"],
        )

    # -------------------------------------------------------------
    # CASE 4: Itinerary generation & Budget / Transit estimation
    # -------------------------------------------------------------
    itinerary_gen_keywords = [
        "tao lich trinh", "lap lich trinh", "len lich trinh", "thiet ke lich trinh",
        "chuyen di", "ngan sach", "chi phi", "ke hoach du lich", "lich trinh du lich",
    ]
    is_budget_query = any(k in norm_msg for k in ["trieu", "vnd", "dong", "ngan sach", "chi phi"])
    is_duration_query = bool(re.search(r"\b(\d+)\s*(?:ngay|d|day)\b", norm_msg))
    is_traveler_query = bool(re.search(r"\b(\d+)\s*(?:nguoi|pax|khach)\b", norm_msg))
    is_greeting = any(k in norm_msg for k in ["xin chao", "chao ban", "chao tro ly", "hello", "hi "])

    if not is_greeting and (
        any(k in norm_msg for k in itinerary_gen_keywords)
        or (is_duration_query and (is_budget_query or "hue" in norm_msg or "da nang" in norm_msg or "xanh" in norm_msg))
        or (is_budget_query and is_duration_query)
    ):
        days_match = re.search(r"\b(\d+)\s*(?:ngay|d|day)\b", norm_msg)
        days = int(days_match.group(1)) if days_match else context.days_count or 2

        # Extract budget amount if explicit
        budget_amt = None
        budget_match = re.search(r"\b(\d+(?:[\.,]\d+)?)\s*(?:trieu|tr|m)\b", norm_msg)
        if budget_match:
            budget_amt = float(budget_match.group(1).replace(",", ".")) * 1_000_000.0

        # Extract budget tier or people
        tier = "standard"
        if "tiet kiem" in norm_msg or "re" in norm_msg:
            tier = "budget"
        elif "sang" in norm_msg or "luxury" in norm_msg:
            tier = "luxury"

        people_match = re.search(r"\b(\d+)\s*(?:nguoi|pax|khach)\b", norm_msg)
        num_people = int(people_match.group(1)) if people_match else context.num_people or 2

        # Extract interests
        interests: list[str] = []
        if any(k in norm_msg for k in ["thien nhien", "sinh thai", "bien", "son tra"]):
            interests.append("nature")
        if any(k in norm_msg for k in ["van hoa", "lich su", "di san", "lang tam", "dai noi"]):
            interests.append("culture")
        if any(k in norm_msg for k in ["am thuc", "an uong", "dac san", "chay"]):
            interests.append("food")
        if any(k in norm_msg for k in ["xanh", "ben vung", "eco"]):
            interests.append("eco")
        if not interests:
            interests = ["nature", "culture", "food"]

        # Extract transport
        trans_mode = "motorcycle"
        if "o to" in norm_msg or "xe hoi" in norm_msg:
            trans_mode = "driving"
        elif "buyt" in norm_msg or "xe dien" in norm_msg:
            trans_mode = "transit"
        elif "di bo" in norm_msg:
            trans_mode = "walking"

        tools: list[tuple[str, dict[str, Any]]] = [
            (
                "generate_itinerary",
                {
                    "destination": effective_city,
                    "duration_days": days,
                    "travelers": num_people,
                    "budget": budget_amt,
                    "interests": interests,
                    "transport_mode": trans_mode,
                    "sustainability_preferences": ["green_certified", "local_authentic"],
                },
            ),
            ("calculate_trip_cost", {"num_days": days, "num_people": num_people, "budget_tier": tier}),
            ("recommend_pois", {"interests": interests, "city": city_code, "limit": 4}),
        ]

        # If user asks about distance or route
        if any(k in norm_msg for k in ["khoang cach", "di tu", "den", "bao xa"]):
            tools.append((
                "get_route_information",
                {"origin_lat": 16.07, "origin_lng": 108.22, "dest_lat": 16.08, "dest_lng": 108.23},
            ))
            tools.append(("get_carbon_estimate", {"distance_km": 15.0, "transport_mode": "car"}))

        return OrchestrationPlan(
            case_type="itinerary_cost_route",
            needs_rag=True,
            rag_query=f"lịch trình tham quan xanh {effective_city} {days} ngày",
            rag_city=city_code,
            tools_to_call=tools,
            resolved_city=effective_city,
            context_notes=context_notes,
        )

    # -------------------------------------------------------------
    # CASE 2: Recommendation inquiry ("thích thiên nhiên", "chay", "quán cafe")
    # -------------------------------------------------------------
    rec_keywords = ["phu hop", "goi y", "thich thien nhien", "thich chay", "an chay", "quan cafe", "tre em", "nguoi gia"]
    if any(k in norm_msg for k in rec_keywords):
        detected_interests: list[str] = []
        if "chay" in norm_msg:
            detected_interests.append("chay")
        if "thien nhien" in norm_msg or "sinh thai" in norm_msg:
            detected_interests.append("sinh thái")
        if "van hoa" in norm_msg or "di san" in norm_msg or "lich su" in norm_msg:
            detected_interests.append("di sản")
        if "bien" in norm_msg:
            detected_interests.append("biển")
        if not detected_interests:
            detected_interests = ["sinh thái", "ẩm thực"]

        return OrchestrationPlan(
            case_type="recommendation",
            needs_rag=True,
            rag_query=f"địa điểm du lịch {', '.join(detected_interests)} {effective_city}",
            rag_city=city_code,
            tools_to_call=[
                ("recommend_pois", {"interests": detected_interests, "city": city_code, "budget_band": 2, "limit": 4}),
            ],
            resolved_city=effective_city,
            context_notes=context_notes,
        )

    # -------------------------------------------------------------
    # CASE 1: Cultural / Descriptive travel knowledge (RAG + POI search)
    # -------------------------------------------------------------
    knowledge_keywords = [
        "van hoa", "lich su", "mon an", "dac san", "mi quang", "banh beo", "bun bo", "che",
        "bao tang", "chua", "lang tam", "mua mua", "thoi tiet", "diem den", "dia diem",
    ]
    if any(k in norm_msg for k in knowledge_keywords):
        return OrchestrationPlan(
            case_type="knowledge_rag",
            needs_rag=True,
            rag_query=clean_msg,
            rag_city=city_code,
            tools_to_call=[
                ("search_pois", {"query": clean_msg, "city": city_code, "limit": 3}),
            ],
            resolved_city=effective_city,
            context_notes=context_notes,
        )

    # Default: General conversational QA
    return OrchestrationPlan(
        case_type="general_dialogue",
        needs_rag=True,
        rag_query=clean_msg,
        rag_city=city_code,
        tools_to_call=[],
        resolved_city=effective_city,
        context_notes=context_notes,
    )
