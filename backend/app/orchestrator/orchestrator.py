"""Chatbot Conversation Orchestrator integrating RAG, Tool Calling, and Knowledge Graph."""

from __future__ import annotations

import datetime
import logging
from typing import Any
import httpx
from psycopg import Connection

from app.config import get_settings
from app.orchestrator.policy import OrchestrationPlan, decide_orchestration_plan
from app.rag.service import get_rag_service
from app.tools.registry import get_default_tool_registry
from app.trips.schemas import (
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotSuggestedPoiItem,
    TripContextPayload,
)

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 3


class ChatbotOrchestrator:
    """Coordinates NLU, RAG Retrieval, Tool Calling, and Response Synthesis."""

    def __init__(self) -> None:
        self.rag_service = get_rag_service()
        self.tool_registry = get_default_tool_registry()

    def orchestrate(
        self,
        request: CopilotChatRequest,
        connection: Connection | None = None,
        user_id: str | None = None,
    ) -> CopilotChatResponse:
        """
        Execute end-to-end conversation turn:
        1. Context & Plan analysis
        2. RAG Retrieval (with citations)
        3. Bounded Tool Calling loop
        4. Structured Output assembly & LLM synthesis
        """
        message = request.message.strip()
        context = request.trip_context

        # Step 1: Decision Policy
        plan: OrchestrationPlan = decide_orchestration_plan(message, context)
        tools_used: list[str] = []
        sources: list[dict[str, Any]] = []
        tool_results: dict[str, Any] = {}
        suggested_pois: list[CopilotSuggestedPoiItem] = []

        # Step 2: RAG Retrieval if required
        rag_snippets: list[str] = []
        if plan.needs_rag and plan.rag_query:
            rag_res = self.rag_service.search(
                query=plan.rag_query,
                city=plan.rag_city,
                top_k=3,
            )
            for chunk in rag_res.chunks:
                sources.append({
                    "title": chunk.title,
                    "city": chunk.city,
                    "category": chunk.category,
                    "snippet": chunk.snippet,
                    "source": chunk.source,
                    "score": chunk.score,
                })
                rag_snippets.append(f"[{chunk.title} - {chunk.source}]: {chunk.snippet}")

        # Step 3: Bounded Tool Calling
        iterations = 0
        for tool_name, tool_args in plan.tools_to_call:
            if iterations >= MAX_TOOL_ITERATIONS:
                logger.warning("Reached maximum tool iterations (%d), halting tool loop", MAX_TOOL_ITERATIONS)
                break
            iterations += 1

            t_res = self.tool_registry.execute_tool(tool_name, tool_args, user_id=user_id)
            if t_res.get("success"):
                tools_used.append(tool_name)
                tool_results[tool_name] = t_res.get("data", {})

                # Extract POIs if returned by search or recommendation
                if tool_name == "search_pois":
                    for p in t_res["data"].get("pois", []):
                        suggested_pois.append(self._to_suggested_poi(p))
                elif tool_name == "recommend_pois":
                    for rec in t_res["data"].get("recommendations", []):
                        suggested_pois.append(self._rec_to_suggested_poi(rec))
                elif tool_name == "generate_itinerary":
                    dest_name = t_res["data"].get("destination", plan.resolved_city)
                    for day in t_res["data"].get("days", []):
                        for st in day.get("stops", []):
                            suggested_pois.append(self._itinerary_stop_to_suggested_poi(st, dest_name))
                elif tool_name == "update_itinerary":
                    for day in t_res["data"].get("updated_itinerary", []):
                        for st in day.get("stops", []):
                            suggested_pois.append(self._itinerary_stop_to_suggested_poi(st, plan.resolved_city))
            else:
                logger.warning("Tool %s execution returned error: %s", tool_name, t_res.get("error"))

        # Extract itinerary mutation / state fields if present
        updated_itinerary_state: list[dict[str, Any]] | None = None
        updated_days_count: int | None = None
        updated_destination: str | None = None
        mutation_summary: list[str] = []
        green_impact_summary: str | None = None
        budget_impact_summary: str | None = None
        route_metrics: dict[str, Any] | None = None
        action_type = "view_on_map" if suggested_pois else "none"

        if "generate_itinerary" in tool_results:
            gen_data = tool_results["generate_itinerary"]
            updated_itinerary_state = gen_data.get("days", [])
            updated_days_count = gen_data.get("duration_days")
            updated_destination = gen_data.get("destination")
            green_impact_summary = (
                f"Ước tính phát thải: {gen_data.get('total_carbon_kg', 0):.2f} kg CO2e "
                f"({gen_data.get('transport_mode', 'xe máy')})"
            )
            budget_impact_summary = (
                f"Dự toán chi phí: {gen_data.get('total_cost_vnd', 0):,.0f} ₫ "
                f"cho {gen_data.get('travelers', 1)} khách"
            )
            route_metrics = {"total_distance_km": gen_data.get("total_distance_km", 0.0)}
            action_type = "mutate_itinerary"

        elif "update_itinerary" in tool_results:
            upd_data = tool_results["update_itinerary"]
            updated_itinerary_state = upd_data.get("updated_itinerary", [])
            mutation_summary = upd_data.get("mutation_summary", [])
            updated_days_count = len(updated_itinerary_state) if updated_itinerary_state else None
            updated_destination = plan.resolved_city
            if upd_data.get("carbon_delta_kg") is not None:
                green_impact_summary = f"Chênh lệch phát thải: {upd_data.get('carbon_delta_kg', 0):+.2f} kg CO2e"
            if upd_data.get("cost_delta_vnd") is not None:
                budget_impact_summary = f"Chênh lệch chi phí: {upd_data.get('cost_delta_vnd', 0):+,.0f} ₫"
            action_type = "mutate_itinerary"

        # Step 4: Synthesize Response
        reply_text = self._synthesize_response(
            message=message,
            plan=plan,
            context=context,
            rag_snippets=rag_snippets,
            tool_results=tool_results,
            sources=sources,
        )

        # Step 5: Format next prompts based on context
        next_prompts = self._build_next_suggested_prompts(plan, context)

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return CopilotChatResponse(
            reply_text=reply_text,
            intent=plan.case_type,
            intent_category="QA_AND_COMPARE" if action_type != "mutate_itinerary" else "ITINERARY_MUTATION",
            reasoning_trace=f"Plan: {plan.case_type} | Tools: {', '.join(tools_used)} | RAG: {len(sources)} sources",
            suggested_pois=suggested_pois[:8],
            tools_used=tools_used,
            sources=sources,
            data=tool_results,
            created_at=now_iso,
            next_suggested_prompts=next_prompts,
            action_type=action_type,
            updated_itinerary_state=updated_itinerary_state,
            updated_days_count=updated_days_count,
            updated_destination=updated_destination,
            mutation_summary=mutation_summary,
            green_impact_summary=green_impact_summary,
            budget_impact_summary=budget_impact_summary,
            route_metrics=route_metrics,
        )

    def _to_suggested_poi(self, p: dict[str, Any]) -> CopilotSuggestedPoiItem:
        raw_gs = float(p.get("green_score") or 75.0)
        gs_int = int(raw_gs * 100) if raw_gs <= 1.0 else int(raw_gs)
        return CopilotSuggestedPoiItem(
            id=str(p.get("poi_id") or p.get("id", "")),
            name=p.get("name", ""),
            category=p.get("category", ""),
            city=p.get("city", ""),
            lat=p.get("lat"),
            lng=p.get("lng"),
            image_url="",
            green_score=gs_int,
            rating=4.5,
            address=p.get("address", ""),
            swap_reason="Địa điểm phù hợp với tìm kiếm của bạn",
        )

    def _rec_to_suggested_poi(self, rec: dict[str, Any]) -> CopilotSuggestedPoiItem:
        raw_gs = float(rec.get("green_score") or 75.0)
        gs_int = int(raw_gs * 100) if raw_gs <= 1.0 else int(raw_gs)
        return CopilotSuggestedPoiItem(
            id=str(rec.get("poi_id", "")),
            name=rec.get("name", ""),
            category=rec.get("category", ""),
            city=rec.get("city", ""),
            image_url="",
            green_score=gs_int,
            rating=4.7,
            address="",
            swap_reason=rec.get("reason", "Đề xuất theo sở thích xanh"),
        )

    def _itinerary_stop_to_suggested_poi(self, st: dict[str, Any], city: str) -> CopilotSuggestedPoiItem:
        raw_gs = float(st.get("green_score") or 80.0)
        gs_int = int(raw_gs * 100) if raw_gs <= 1.0 else int(raw_gs)
        return CopilotSuggestedPoiItem(
            id=str(st.get("poi_id", "")),
            name=st.get("name", ""),
            category=st.get("category", ""),
            city=city,
            lat=st.get("lat"),
            lng=st.get("lng"),
            image_url="",
            green_score=gs_int,
            rating=4.8,
            address=st.get("address", ""),
            swap_reason=st.get("selection_reason", "Điểm đến trong hành trình xanh"),
            kg_explanation=st.get("kg_explanation"),
            estimated_cost=st.get("cost_vnd"),
            open_range_label=st.get("opening_hours"),
            opening_hours_status="ok",
        )

    def _synthesize_response(
        self,
        message: str,
        plan: OrchestrationPlan,
        context: TripContextPayload,
        rag_snippets: list[str],
        tool_results: dict[str, Any],
        sources: list[dict[str, Any]],
    ) -> str:
        """Combine tool outputs and RAG citations into grounded Vietnamese prose."""
        settings = get_settings()

        # Try Gemini API if configured
        if settings.gemini_configured:
            try:
                gemini_text = self._call_gemini_synthesis(
                    message=message,
                    plan=plan,
                    rag_snippets=rag_snippets,
                    tool_results=tool_results,
                    sources=sources,
                )
                if gemini_text:
                    return gemini_text
            except Exception as e:
                logger.warning("Gemini synthesis error, using deterministic response: %s", e)

        # Deterministic Grounded Synthesis Fallback
        lines: list[str] = []

        if plan.case_type == "explanation":
            exp_data = tool_results.get("get_poi_explanation", {})
            explanation_text = exp_data.get("explanation_text")
            if explanation_text:
                lines.append(explanation_text)
            else:
                lines.append(f"Địa điểm này được đề xuất dựa trên điểm đánh giá du lịch bền vững và tiêu chí văn hóa tại {plan.resolved_city}.")

        elif plan.case_type == "poi_details_price":
            det_data = tool_results.get("get_poi_details", {})
            if det_data.get("found"):
                poi = det_data.get("poi", {})
                price_tier = poi.get("price_tier") or poi.get("price_band") or "2"
                tier_desc = {
                    "1": "Miễn phí hoặc dưới 50.000 ₫",
                    "2": "50.000 ₫ – 150.000 ₫ (Tiêu chuẩn)",
                    "3": "150.000 ₫ – 350.000 ₫ (Cao cấp)",
                    "4": "Trên 350.000 ₫ (Trọn gói)",
                }.get(str(price_tier), "Khoảng 50.000 ₫ – 100.000 ₫")
                lines.append(f"Về thông tin vé tham quan và chi phí tại **{poi.get('name')}**:")
                lines.append(f"- **Mức giá vé tham khảo**: {tier_desc}.")
                lines.append(f"- **Địa chỉ**: {poi.get('address', 'Trung tâm thành phố')}.")
                lines.append(f"- **Điểm chuẩn xanh**: {poi.get('green_score', 80)}/100.")
            else:
                lines.append(f"Rất tiếc, hiện tại hệ thống chưa có dữ liệu giá vé chính thức được xác thực cho địa điểm bạn hỏi. Bạn nên liên hệ trước ban quản lý hoặc trang chính thức.")

        elif plan.case_type == "itinerary_cost_route":
            gen_data = tool_results.get("generate_itinerary")
            if gen_data:
                dest = gen_data.get("destination", plan.resolved_city)
                days = gen_data.get("duration_days", 1)
                travelers = gen_data.get("travelers", 1)
                transport = gen_data.get("transport_mode", "xe máy")
                cost = gen_data.get("total_cost_vnd", 0)
                dist = gen_data.get("total_distance_km", 0)
                co2 = gen_data.get("total_carbon_kg", 0)

                lines.append(f"Em đã thiết kế hành trình du lịch xanh tối ưu tại **{dest}** ({days} ngày, {travelers} người, phương tiện: {transport}):")
                lines.append(f"- **Dự toán chi phí & ngân sách**: **{cost:,.0f} ₫** ({cost / max(1, travelers):,.0f} ₫/người).")
                lines.append(f"- **Tổng quãng đường di chuyển**: **{dist:.1f} km** | **Phát thải ước tính**: **{co2:.2f} kg CO2e**.")

                lines.append("\n### 📅 Chi tiết lịch trình từng ngày:")
                for d in gen_data.get("days", []):
                    day_num = d.get("day_number", 1)
                    d_dist = d.get("day_distance_km", 0)
                    d_cost = d.get("day_cost_vnd", 0)
                    d_co2 = d.get("day_carbon_kg", 0)
                    lines.append(f"\n#### Ngày {day_num} ({d_dist:.1f} km • {d_cost:,.0f} ₫ • {d_co2:.2f} kg CO2e):")
                    for st in d.get("stops", []):
                        time_slot = st.get("time_slot", "08:30 - 10:30")
                        name = st.get("name", "")
                        cat = st.get("category", "")
                        gs = st.get("green_score", 80)
                        reason = st.get("selection_reason", "")
                        kg_exp = st.get("kg_explanation")
                        lines.append(f"- **[{time_slot}] {name}** ({cat} • Điểm xanh: {gs}/100)")
                        if reason:
                            lines.append(f"  + *Lý do*: {reason}")
                        if kg_exp:
                            lines.append(f"  + *Đồ thị tri thức (KG)*: {kg_exp}")

                warnings = gen_data.get("warnings", [])
                if warnings:
                    lines.append("\n⚠️ **Lưu ý tối ưu:**")
                    for w in warnings:
                        lines.append(f"- {w}")

                highlights = gen_data.get("selection_highlights", [])
                if highlights:
                    lines.append("\n🌿 **Điểm nhấn du lịch bền vững:**")
                    for h in highlights[:2]:
                        lines.append(f"- {h}")
            else:
                cost_data = tool_results.get("calculate_trip_cost", {})
                rec_data = tool_results.get("recommend_pois", {})
                recs = rec_data.get("recommendations", [])

                lines.append(f"Em đã tính toán kế hoạch và dự toán chi phí cho chuyến du lịch xanh {plan.resolved_city}:")
                if cost_data:
                    lines.append(f"- **Tổng ngân sách ước tính**: **{cost_data.get('formatted_vnd', '2.300.000 VND')}** ({cost_data.get('cost_per_person_per_day_vnd', 1150000):,.0f} ₫/người/ngày).")
                    b = cost_data.get("budget_breakdown", {})
                    lines.append(f"  + Lưu trú xanh: {b.get('accommodation_vnd', 0):,.0f} ₫ | Ẩm thực: {b.get('food_and_beverage_vnd', 0):,.0f} ₫.")
                    lines.append(f"  + Di chuyển xanh: {b.get('green_transit_vnd', 0):,.0f} ₫ | Vé tham quan: {b.get('tickets_and_activities_vnd', 0):,.0f} ₫.")

                if recs:
                    lines.append("\n**Các điểm dừng tiêu biểu gợi ý theo sở thích:**")
                    for r in recs[:3]:
                        lines.append(f"- **{r.get('name')}**: {r.get('reason')} (Điểm xanh: {r.get('green_score')}/100)")

            if rag_snippets:
                lines.append(f"\n*Lưu ý từ cẩm nang*: {sources[0]['snippet'][:150]}...")

        elif plan.case_type == "multi_turn_itinerary_mutation":
            upd_data = tool_results.get("update_itinerary")
            if upd_data:
                mutations = upd_data.get("mutation_summary", [])
                cost_delta = upd_data.get("cost_delta_vnd", 0)
                co2_delta = upd_data.get("carbon_delta_kg", 0)
                lines.append("Em đã điều chỉnh lại lịch trình theo yêu cầu của bạn:")
                if mutations:
                    for m in mutations:
                        lines.append(f"- {m}")
                if cost_delta != 0 or co2_delta != 0:
                    lines.append(f"- **Biến động**: Chi phí thay đổi {cost_delta:+,.0f} ₫ | Phát thải thay đổi {co2_delta:+.2f} kg CO2e")

                updated_days = upd_data.get("updated_itinerary", [])
                if updated_days:
                    lines.append("\n### 📅 Lịch trình sau khi điều chỉnh:")
                    for d in updated_days:
                        lines.append(f"\n#### Ngày {d.get('day_number', 1)}:")
                        for st in d.get("stops", []):
                            lines.append(f"- **[{st.get('time_slot', '08:30 - 10:30')}] {st.get('name')}** (Điểm xanh: {st.get('green_score', 80)}/100)")

                warnings = upd_data.get("warnings", [])
                if warnings:
                    lines.append("\n⚠️ **Lưu ý:**")
                    for w in warnings:
                        lines.append(f"- {w}")
            else:
                lines.append(f"Dạ vâng! Em sẽ giữ nguyên lịch trình ngày 1 và tiến hành điều chỉnh lại ngày thứ hai cho thư thái, giãn cách các điểm dừng hơn.")
                rec_data = tool_results.get("recommend_pois", {})
                recs = rec_data.get("recommendations", [])
                if recs:
                    lines.append("Em gợi ý thay thế bằng điểm đến nhẹ nhàng hơn:")
                    for r in recs[:2]:
                        lines.append(f"- **{r.get('name')}**: {r.get('reason')}.")

        elif plan.case_type == "recommendation":
            rec_data = tool_results.get("recommend_pois", {})
            recs = rec_data.get("recommendations", [])
            lines.append(f"Dưới đây là các địa điểm phù hợp nhất với sở thích của bạn tại {plan.resolved_city}:")
            for r in recs[:4]:
                lines.append(f"- **{r.get('name')}** ({r.get('category')}): {r.get('reason')} (Điểm xanh: {r.get('green_score')}/100).")

            if rag_snippets:
                lines.append(f"\n*Gợi ý từ cẩm nang địa phương*: {sources[0]['snippet'][:140]}...")

        else:
            # Check social gratitude or greeting
            if any("social_gratitude" in note for note in plan.context_notes):
                lines.append("Rất vui được hỗ trợ bạn! Chúc bạn có một chuyến du lịch xanh thật nhiều trải nghiệm ý nghĩa tại Đà Nẵng – Huế. Nếu cần thêm thông tin hoặc điều chỉnh bất kỳ điểm dừng nào, bạn cứ nhắn cho em nhé!")
            elif any("social_greeting" in note for note in plan.context_notes):
                lines.append("Xin chào bạn! Em là GreenTrip Copilot – trợ lý thiết kế hành trình du lịch xanh tại Đà Nẵng và Huế. Em có thể hỗ trợ bạn lên lịch trình, dự toán ngân sách, gợi ý điểm đến sinh thái và tối ưu phát thải. Bạn đang dự định khám phá Đà Nẵng hay cố đô Huế ạ?")
            # Check if out-of-scope city was detected in context notes
            elif any("ngoài phạm vi địa bàn" in note for note in plan.context_notes):
                lines.append("GreenTrip hiện chuyên sâu hỗ trợ thiết kế hành trình du lịch xanh tại khu vực **Đà Nẵng – Huế**. Yêu cầu của bạn về địa danh này hiện nằm ngoài phạm vi phủ sóng của hệ thống. Bạn có muốn em hỗ trợ lên kế hoạch khám phá vẻ đẹp xanh của Đà Nẵng hoặc cố đô Huế không?")
            elif any("ngoài phạm vi nghiệp vụ" in note for note in plan.context_notes):
                lines.append("GreenTrip là trợ lý chuyên sâu về du lịch xanh tại Đà Nẵng và Huế. Em chỉ có thể hỗ trợ các thông tin về điểm đến, hành trình, ngân sách và phương tiện du lịch bền vững. Bạn có cần em tư vấn chuyến đi nào tại miền Trung không ạ?")
            elif sources:
                lines.append(f"Thông tin xác thực từ cẩm nang du lịch {plan.resolved_city}:")
                for s in sources[:2]:
                    lines.append(f"- **{s['title']}**: {s['snippet']}")
                search_data = tool_results.get("search_pois", {})
                pois = search_data.get("pois", [])
                if pois:
                    lines.append(f"\nMột số địa điểm thực tế bạn có thể ghé thăm:")
                    for p in pois[:3]:
                        lines.append(f"- **{p['name']}**: {p['address']}")
            else:
                lines.append(f"Hiện tại trong nguồn dữ liệu du lịch đã kiểm duyệt của GreenTrip chưa có tài liệu cụ thể về câu hỏi này. Bạn có thể cho em biết cụ thể địa danh bạn muốn tìm kiếm không?")

        # Add citation footnote if RAG sources were utilized
        if sources:
            source_names = list(dict.fromkeys([s["source"] for s in sources]))
            lines.append(f"\n*(Nguồn tham khảo đã kiểm chứng: {', '.join(source_names)})*")

        return "\n".join(lines)

    def _call_gemini_synthesis(
        self,
        message: str,
        plan: OrchestrationPlan,
        rag_snippets: list[str],
        tool_results: dict[str, Any],
        sources: list[dict[str, Any]],
    ) -> str | None:
        """Call Gemini to synthesize a natural answer incorporating verified tools and RAG."""
        settings = get_settings()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"

        system_instruction = (
            "Bạn là GreenTrip AI Assistant, trợ lý du lịch xanh chuyên nghiệp cho Đà Nẵng và Huế.\n"
            "Chỉ sử dụng dữ liệu thực tế được cung cấp trong [TÀI LIỆU RAG] và [KẾT QUẢ TOOL].\n"
            "Tuyệt đối không bịa đặt địa danh, giá vé hay thông tin sai sự thật.\n"
            "Trả lời bằng tiếng Việt tự nhiên, ấm áp, súc tích và có dẫn nguồn."
        )

        context_prompt = (
            f"CÂU HỎI CỦA KHÁCH: {message}\n\n"
            f"[KẾT QUẢ TOOL]: {tool_results}\n\n"
            f"[TÀI LIỆU RAG KIỂM CHỨNG]:\n" + "\n".join(rag_snippets) + "\n\n"
            "Hãy trả lời câu hỏi của khách dựa trên dữ liệu trên:"
        )

        payload = {
            "system_instruction": {"parts": [{"text": system_instruction}]},
            "contents": [{"parts": [{"text": context_prompt}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 600},
        }

        with httpx.Client(timeout=4.0) as client:
            resp = client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "").strip()

        return None

    def _build_next_suggested_prompts(
        self,
        plan: OrchestrationPlan,
        context: TripContextPayload,
    ) -> list[str]:
        city = plan.resolved_city
        if plan.case_type == "itinerary_cost_route":
            return [
                "Phương tiện di chuyển xanh tiết kiệm nhất?",
                "Gợi ý các quán chay ngon trong lịch trình này?",
                "Nếu ngày thứ hai mình muốn đi ít điểm hơn thì sao?",
            ]
        elif plan.case_type == "explanation":
            return [
                "Thời gian mở cửa và giá vé điểm này?",
                "Điểm đến sinh thái nào gần đây nhất?",
                "Có tuyến xe buýt công cộng đến đây không?",
            ]
        elif plan.case_type == "recommendation":
            return [
                f"Giá vé của các địa điểm này tại {city}?",
                f"Tạo lịch trình 2 ngày kết hợp các điểm trên?",
                "Quán ăn thuần chay gần các điểm này?",
            ]
        return [
            f"Gợi ý địa điểm du lịch xanh tại {city}?",
            "Ước tính chi phí chuyến đi 2 người?",
            "Lịch trình tham quan văn hóa Huế 2 ngày?",
        ]


_orchestrator_instance: ChatbotOrchestrator | None = None


def get_chatbot_orchestrator() -> ChatbotOrchestrator:
    """Singleton getter for the conversation orchestrator."""
    global _orchestrator_instance
    if _orchestrator_instance is None:
        _orchestrator_instance = ChatbotOrchestrator()
    return _orchestrator_instance
