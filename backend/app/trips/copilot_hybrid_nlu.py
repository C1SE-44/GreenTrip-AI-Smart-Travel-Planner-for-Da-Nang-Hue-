"""Hybrid Structured NLU Router for GreenTrip Copilot (Gemini JSON Intent + Regex Guardrail/Fallback)."""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from app.config import get_settings
from app.trips.copilot_intent import (
    classify_copilot_request,
    extract_persistent_constraints,
    resolve_effective_city,
)
from app.trips.handlers.smart_concierge_handler import is_simple_social_greeting
from app.trips.schemas import IntentCategoryType, TripContextPayload

logger = logging.getLogger(__name__)

AllowedSubIntent = Literal[
    "out_of_scope",
    "qa_compare",
    "itinerary_mutation",
    "late_schedule_adjust",
    "swap_meal_vegetarian",
    "cafe_culture",
    "culinary_guide",
    "rainy_day_alternatives",
    "poi_advice",
    "night_eco_activities",
    "travel_tips_budget",
    "general_chat",
]

AllowedConstraint = Literal[
    "elderly_friendly",
    "kid_friendly",
    "rainy_season",
    "quiet_vibe",
    "vegetarian",
    "beach_lover",
    "food_lover",
]

MutationActionType = Literal[
    "none",
    "add_stop",
    "remove_stop",
    "replace_stop",
    "swap_day",
    "split_nights",
    "adjust_late",
]

_HYBRID_NLU_SYSTEM_PROMPT = """Bạn là bộ phân tích ý định (NLU Router) cho trợ lý du lịch bền vững GreenTrip AI (khu vực Đà Nẵng, Huế, Hội An).
Hãy đọc câu hỏi của du khách và ngữ cảnh chuyến đi, trả về DUY NHẤT 1 JSON hợp lệ (không giải thích thêm) với đúng schema sau:
{
  "intent_category": "QA_AND_COMPARE | POI_RECOMMENDATION | ITINERARY_MUTATION | OUT_OF_SCOPE",
  "sub_intent": "out_of_scope | qa_compare | itinerary_mutation | late_schedule_adjust | swap_meal_vegetarian | cafe_culture | culinary_guide | rainy_day_alternatives | poi_advice | night_eco_activities | travel_tips_budget | general_chat",
  "target_city": "Đà Nẵng | Huế | Đà Nẵng & Huế | null",
  "target_day": integer (1..31) hoặc null,
  "target_slot": "morning | lunch | afternoon | dinner | null",
  "mutation_action": "none | add_stop | remove_stop | replace_stop | swap_day | split_nights | adjust_late",
  "constraints": ["elderly_friendly", "kid_friendly", "rainy_season", "quiet_vibe", "vegetarian", "beach_lover", "food_lover"],
  "confidence": float (0.0 .. 1.0)
}
Quy tắc phân loại:
- Câu hỏi không thuộc du lịch Đà Nẵng / Huế / Hội An (ví dụ: Phú Quốc, Hà Nội, giá vàng, viết code, chứng khoán, giải toán) -> OUT_OF_SCOPE / out_of_scope.
- Hỏi đổi món/quán không thịt/thuần thực vật/chay -> ITINERARY_MUTATION / swap_meal_vegetarian / constraint "vegetarian".
- Hỏi khi trời âm u/mưa/trú mưa/có mái che -> POI_RECOMMENDATION / rainy_day_alternatives / constraint "rainy_season".
- Nhắc người già, bố mẹ đau chân/đau khớp/xe lăn -> thêm constraint "elderly_friendly".
- Trễ giờ/chậm tiến độ/rút gọn lịch -> ITINERARY_MUTATION / late_schedule_adjust.
- Thêm/bỏ/đổi ngày/chia lại số đêm -> ITINERARY_MUTATION / itinerary_mutation.
- So sánh Đà Nẵng hay Huế / nên đi mấy ngày -> QA_AND_COMPARE / qa_compare.
- Hỏi có nên đi 1 điểm cụ thể không -> QA_AND_COMPARE / poi_advice."""

_CODE_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$")

_ALLOWED_CONSTRAINTS = frozenset(
    {"elderly_friendly", "kid_friendly", "rainy_season", "quiet_vibe", "vegetarian", "beach_lover", "food_lover"}
)
_ALLOWED_TARGET_CITIES = frozenset({"Đà Nẵng", "Huế", "Đà Nẵng & Huế"})
_ALLOWED_SLOTS = frozenset({"morning", "lunch", "afternoon", "dinner"})
_ALLOWED_MUTATIONS = frozenset(
    {"none", "add_stop", "remove_stop", "replace_stop", "swap_day", "split_nights", "adjust_late"}
)


class StructuredIntentResult(BaseModel):
    """Validated JSON intent representation extracted by Gemini NLU or regex fallback."""

    intent_category: IntentCategoryType
    sub_intent: AllowedSubIntent
    target_city: Literal["Đà Nẵng", "Huế", "Đà Nẵng & Huế"] | None = None
    target_day: int | None = Field(default=None, ge=1, le=31)
    target_slot: Literal["morning", "lunch", "afternoon", "dinner"] | None = None
    mutation_action: MutationActionType = "none"
    constraints: list[AllowedConstraint] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source: Literal["gemini", "regex"] = "regex"


def _extract_json_payload(raw_text: str) -> dict[str, Any]:
    cleaned = _CODE_FENCE_RE.sub("", (raw_text or "").strip()).strip()
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("NLU payload is not a JSON object.")
    for nullable_key in ("target_city", "target_day", "target_slot"):
        if parsed.get(nullable_key) in ("", "null", "None"):
            parsed[nullable_key] = None
    if parsed.get("target_city") not in _ALLOWED_TARGET_CITIES:
        parsed["target_city"] = None
    if parsed.get("target_slot") not in _ALLOWED_SLOTS:
        parsed["target_slot"] = None
    if parsed.get("mutation_action") not in _ALLOWED_MUTATIONS:
        parsed["mutation_action"] = "none"
    raw_constraints = parsed.get("constraints")
    if isinstance(raw_constraints, list):
        parsed["constraints"] = [c for c in raw_constraints if isinstance(c, str) and c in _ALLOWED_CONSTRAINTS]
    else:
        parsed["constraints"] = []
    return parsed


def classify_intent_with_gemini(
    message: str,
    trip_context: TripContextPayload,
    settings: Any,
) -> StructuredIntentResult | None:
    """Call Gemini with strict JSON mode to parse natural Vietnamese intent and constraints."""
    try:
        history_snippet = [
            f"{m.get('role', 'user')}: {str(m.get('content', ''))[:160]}"
            for m in (trip_context.conversation_history or [])[-2:]
        ]
        user_payload = (
            f"CONTEXT: mode={getattr(trip_context, 'mode', 'trip')}, "
            f"destination={trip_context.destination}, days_count={trip_context.days_count}, "
            f"current_day={trip_context.current_day}, current_slot={trip_context.current_slot}, "
            f"active_constraints={trip_context.active_constraints}, "
            f"recent_history={json.dumps(history_snippet, ensure_ascii=False)}\n"
            f"USER_MESSAGE: {message}"
        )
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
        )
        resp = httpx.post(
            url,
            json={
                "system_instruction": {"parts": [{"text": _HYBRID_NLU_SYSTEM_PROMPT}]},
                "contents": [{"role": "user", "parts": [{"text": user_payload}]}],
                "generationConfig": {
                    "temperature": 0.0,
                    "maxOutputTokens": 256,
                    "responseMimeType": "application/json",
                },
            },
            timeout=4.0,
        )
        if resp.status_code != 200:
            logger.warning("Gemini NLU returned HTTP %s, falling back to regex", resp.status_code)
            return None

        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        parts = candidates[0].get("content", {}).get("parts") or []
        raw_text = "".join(str(p.get("text", "")) for p in parts).strip()
        if not raw_text:
            return None

        parsed_dict = _extract_json_payload(raw_text)
        parsed_dict["source"] = "gemini"
        return StructuredIntentResult.model_validate(parsed_dict)
    except Exception as exc:
        logger.warning("Gemini NLU fallback to regex due to error: %s", exc)
        return None


def _merge_constraints(base: list[str], extra: list[str]) -> list[str]:
    merged: list[str] = list(base)
    for item in extra:
        if item and item not in merged:
            merged.append(item)
    return merged


def classify_copilot_request_hybrid(
    message: str,
    trip_context: TripContextPayload,
    existing_constraints: list[str] | None = None,
) -> tuple[IntentCategoryType, str, dict[str, Any] | None, list[str], TripContextPayload, dict[str, Any]]:
    """
    Hybrid intent classifier:
    1) Deterministic Regex Guardrails run first (OOS, geography/feasibility trap, social greeting).
    2) If Gemini is configured, refine natural Vietnamese paraphrases + slot/day/constraints via JSON NLU.
    3) Always fall back safely to deterministic regex on timeout, quota errors, or invalid output.
    """
    constraints = extract_persistent_constraints(message, trip_context)
    if existing_constraints:
        constraints = _merge_constraints(list(existing_constraints), constraints)

    regex_category, regex_intent, fact_check = classify_copilot_request(message, trip_context)

    if regex_category == "OUT_OF_SCOPE" or fact_check is not None or is_simple_social_greeting(message):
        return (
            regex_category,
            regex_intent,
            fact_check,
            constraints,
            trip_context,
            {"source": "regex_guardrail", "confidence": 1.0, "mutation_action": "none"},
        )

    settings = get_settings()
    _, msg_is_both, msg_display_city = resolve_effective_city(message, trip_context.destination)
    city_override_intents = {
        "rainy_day_alternatives",
        "swap_meal_vegetarian",
        "late_schedule_adjust",
        "night_eco_activities",
        "culinary_guide",
        "cafe_culture",
    }

    if settings.gemini_configured:
        gemini_res = classify_intent_with_gemini(message, trip_context, settings)
        if gemini_res is not None and gemini_res.confidence >= 0.72:
            merged_constraints = _merge_constraints(constraints, list(gemini_res.constraints))
            meta = {
                "source": "gemini",
                "confidence": gemini_res.confidence,
                "mutation_action": gemini_res.mutation_action,
            }
            if gemini_res.sub_intent == "out_of_scope":
                return (
                    "OUT_OF_SCOPE",
                    "out_of_scope",
                    {"oos_target": "chủ đề ngoài du lịch Đà Nẵng – Huế"},
                    merged_constraints,
                    trip_context,
                    meta,
                )

            final_category: IntentCategoryType = regex_category
            final_intent = regex_intent
            if regex_intent != "itinerary_mutation" and (
                regex_intent == "general_chat" or gemini_res.confidence >= 0.85
            ):
                final_category = gemini_res.intent_category
                final_intent = gemini_res.sub_intent

            updates: dict[str, Any] = {}
            if gemini_res.target_day is not None:
                updates["current_day"] = min(max(1, gemini_res.target_day), trip_context.days_count)
            if gemini_res.target_slot is not None:
                updates["current_slot"] = gemini_res.target_slot

            if not msg_is_both and msg_display_city != trip_context.destination and final_intent in city_override_intents:
                updates["destination"] = msg_display_city
            elif msg_is_both and gemini_res.target_city in ("Đà Nẵng", "Huế"):
                updates["destination"] = gemini_res.target_city

            effective_ctx = trip_context.model_copy(update=updates) if updates else trip_context
            return (
                final_category,
                final_intent,
                None,
                merged_constraints,
                effective_ctx,
                meta,
            )

    regex_ctx = trip_context
    if not msg_is_both and msg_display_city != trip_context.destination and regex_intent in city_override_intents:
        regex_ctx = trip_context.model_copy(update={"destination": msg_display_city})

    return (
        regex_category,
        regex_intent,
        fact_check,
        constraints,
        regex_ctx,
        {
            "source": "regex",
            "confidence": 0.8 if regex_intent != "general_chat" else 0.5,
            "mutation_action": "none",
        },
    )
