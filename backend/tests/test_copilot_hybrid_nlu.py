"""Unit tests for Hybrid NLU Router (Gemini Structured JSON + Regex Fallback) and Corrective Grounding."""
import json
from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import httpx
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.trips.copilot_hybrid_nlu import classify_copilot_request_hybrid  # noqa: E402
from app.trips.schemas import TripContextPayload  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _mock_gemini_response(text_payload: str, status_code: int = 200) -> MagicMock:
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = {
        "candidates": [{"content": {"parts": [{"text": text_payload}]}}]
    }
    return mock_resp


def test_hybrid_nlu_gemini_classifies_paraphrase_and_extracts_constraints(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    get_settings.cache_clear()

    nlu_json = json.dumps(
        {
            "intent_category": "ITINERARY_MUTATION",
            "sub_intent": "swap_meal_vegetarian",
            "target_city": "Đà Nẵng",
            "target_day": 2,
            "target_slot": "lunch",
            "mutation_action": "replace_stop",
            "constraints": ["vegetarian", "elderly_friendly"],
            "confidence": 0.94,
        }
    )
    ctx = TripContextPayload(destination="Đà Nẵng & Huế", days_count=4, current_day=1, current_slot="morning")

    with patch("app.trips.copilot_hybrid_nlu.httpx.post", return_value=_mock_gemini_response(nlu_json)):
        category, intent, fact_check, constraints, effective_ctx, meta = classify_copilot_request_hybrid(
            "Ngày thứ hai tầm trưa đổi giùm món nhẹ bụng thanh tịnh ở miền biển cho cả nhà dễ ăn",
            ctx,
        )

    assert category == "ITINERARY_MUTATION"
    assert intent == "swap_meal_vegetarian"
    assert fact_check is None
    assert "vegetarian" in constraints
    assert "elderly_friendly" in constraints
    assert effective_ctx.current_day == 2
    assert effective_ctx.current_slot == "lunch"
    assert effective_ctx.destination == "Đà Nẵng"
    assert meta["source"] == "gemini"
    assert meta["confidence"] >= 0.9


@pytest.mark.parametrize(
    "side_effect_or_resp",
    [
        httpx.TimeoutException("timeout"),
        _mock_gemini_response("not-json-at-all", status_code=200),
        _mock_gemini_response("{}", status_code=429),
    ],
)
def test_hybrid_nlu_falls_back_cleanly_to_regex_on_gemini_failure(
    monkeypatch: pytest.MonkeyPatch,
    side_effect_or_resp: object,
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    get_settings.cache_clear()

    ctx = TripContextPayload(destination="Đà Nẵng", days_count=3, current_day=1)
    patch_kwargs = (
        {"side_effect": side_effect_or_resp}
        if isinstance(side_effect_or_resp, Exception)
        else {"return_value": side_effect_or_resp}
    )

    with patch("app.trips.copilot_hybrid_nlu.httpx.post", **patch_kwargs):
        category, intent, _, constraints, _, meta = classify_copilot_request_hybrid(
            "Gợi ý quán cafe yên tĩnh ở Đà Nẵng giúp mình",
            ctx,
        )

    assert category == "POI_RECOMMENDATION"
    assert intent == "cafe_culture"
    assert "quiet_vibe" in constraints
    assert meta["source"] == "regex"


def test_deterministic_guardrails_bypass_gemini_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    get_settings.cache_clear()

    ctx = TripContextPayload(destination="Đà Nẵng", days_count=3, current_day=1)
    with patch("app.trips.copilot_hybrid_nlu.httpx.post") as mock_post:
        cat_oos, intent_oos, _, _, _, meta_oos = classify_copilot_request_hybrid(
            "Lên lịch trình đi Phú Quốc 3 ngày", ctx
        )
        cat_geo, _, fact_geo, _, _, meta_geo = classify_copilot_request_hybrid(
            "Thêm Cầu Vàng ở Huế vào ngày 2", ctx
        )

    assert cat_oos == "OUT_OF_SCOPE"
    assert intent_oos == "out_of_scope"
    assert meta_oos["source"] == "regex_guardrail"
    assert cat_geo == "ITINERARY_MUTATION"
    assert fact_geo is not None and fact_geo["real_city"] == "Đà Nẵng"
    assert meta_geo["source"] == "regex_guardrail"
    mock_post.assert_not_called()


def test_corrective_grounding_blocks_fabricated_poi_and_restores_db_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", " ")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    get_settings.cache_clear()

    nlu_json = json.dumps(
        {
            "intent_category": "POI_RECOMMENDATION",
            "sub_intent": "culinary_guide",
            "target_city": "Đà Nẵng",
            "constraints": ["food_lover"],
            "confidence": 0.92,
        }
    )
    hallucinated_reply = (
        "Bạn nên ghé ngay:\n"
        "- **Quán Ốc Hoàng Gia Giả Tưởng 999** (123 Đường Ảo) — hải sản cực ngon.\n\n"
        "Bạn muốn chọn **A — Ăn tối nay** hay **B — Để ngày mai**?"
    )

    def fake_post(url: str, **kwargs: object) -> MagicMock:
        req_json = kwargs.get("json") or {}
        if (req_json.get("generationConfig") or {}).get("responseMimeType") == "application/json":
            return _mock_gemini_response(nlu_json)
        return _mock_gemini_response(hallucinated_reply)

    with patch("app.trips.copilot_hybrid_nlu.httpx.post", side_effect=fake_post), patch(
        "app.trips.copilot_consultant.httpx.post", side_effect=fake_post
    ):
        response = client.post(
            "/trips/copilot/chat",
            json={
                "message": "Tìm giúp vài chỗ ăn ngon đặc sản ở Đà Nẵng",
                "trip_context": {"destination": "Đà Nẵng", "days_count": 3, "current_day": 1},
            },
        )

    assert response.status_code == 200, response.text
    data = response.json()
    assert "Quán Ốc Hoàng Gia Giả Tưởng 999" not in data["reply_text"]
    assert "Corrective Grounding" in (data.get("reasoning_trace") or "")
    assert len(data["suggested_pois"]) >= 1


def test_corrective_grounding_keeps_verified_gemini_synthesis(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", " ")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    get_settings.cache_clear()

    nlu_json = json.dumps(
        {
            "intent_category": "QA_AND_COMPARE",
            "sub_intent": "poi_advice",
            "target_city": "Đà Nẵng",
            "confidence": 0.95,
        }
    )
    grounded_reply = (
        "Rất nên đi **Bán đảo Sơn Trà** vì có tầm nhìn biển đẹp và đường xanh mát.\n"
        "- **Điểm mạnh**: Không khí trong lành, ngắm được vịnh Đà Nẵng và viếng **Chùa Linh Ứng**.\n"
        "- **Cần cân nhắc**: Đường lên đỉnh Bàn Cờ dốc cao, nên đi xe số hoặc ô tô.\n\n"
        "Bạn muốn xếp vào **A — Buổi sáng sớm** hay **B — Xế chiều**?"
    )

    def fake_post(url: str, **kwargs: object) -> MagicMock:
        req_json = kwargs.get("json") or {}
        if (req_json.get("generationConfig") or {}).get("responseMimeType") == "application/json":
            return _mock_gemini_response(nlu_json)
        return _mock_gemini_response(grounded_reply)

    with patch("app.trips.copilot_hybrid_nlu.httpx.post", side_effect=fake_post), patch(
        "app.trips.copilot_consultant.httpx.post", side_effect=fake_post
    ):
        response = client.post(
            "/trips/copilot/chat",
            json={
                "message": "tôi có nên đi bán đảo sơn trà không",
                "trip_context": {"destination": "Đà Nẵng", "days_count": 3, "current_day": 1},
            },
        )

    assert response.status_code == 200, response.text
    data = response.json()
    assert "Chùa Linh Ứng" in data["reply_text"]
    assert "Điểm mạnh" in data["reply_text"]
    assert "Đã xác thực toàn bộ địa điểm" in (data.get("reasoning_trace") or "")


def test_hybrid_nlu_sanitizes_unknown_gemini_constraint_tags(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    get_settings.cache_clear()

    nlu_json = json.dumps(
        {
            "intent_category": "QA_AND_COMPARE",
            "sub_intent": "travel_tips_budget",
            "target_city": "Đà Nẵng",
            "target_slot": "unknown_slot",
            "mutation_action": "unknown_action",
            "constraints": ["elderly_friendly", "travel_tips_budget", "bad_tag"],
            "confidence": 0.91,
        }
    )
    ctx = TripContextPayload(destination="Đà Nẵng", days_count=3, current_day=1)

    with patch("app.trips.copilot_hybrid_nlu.httpx.post", return_value=_mock_gemini_response(nlu_json)):
        category, intent, _, constraints, _, meta = classify_copilot_request_hybrid(
            "Đi Đà Nẵng 3 ngày với bố mẹ hết khoảng bao nhiêu tiền?",
            ctx,
        )

    assert category == "QA_AND_COMPARE"
    assert intent == "travel_tips_budget"
    assert "elderly_friendly" in constraints
    assert "travel_tips_budget" not in constraints
    assert "bad_tag" not in constraints
    assert meta["source"] == "gemini"
    assert meta["mutation_action"] == "none"
