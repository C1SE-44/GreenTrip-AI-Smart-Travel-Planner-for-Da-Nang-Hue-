"""Tests for Hallucination Benchmark Dataset and Evaluator."""

import json
from pathlib import Path
import pytest

from app.orchestrator import ChatbotOrchestrator
from app.trips.schemas import CopilotChatRequest, TripContextPayload

BENCHMARK_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "benchmarks"
    / "chatbot_hallucination_benchmark.json"
)


def test_benchmark_dataset_integrity():
    """Verify that benchmark dataset has exactly 50 categorized questions with required schema."""
    assert BENCHMARK_PATH.exists(), f"Benchmark file missing at {BENCHMARK_PATH}"

    with open(BENCHMARK_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    questions = data if isinstance(data, list) else data.get("questions", [])
    assert len(questions) == 50, f"Expected exactly 50 benchmark questions, got {len(questions)}"

    categories = {q["category"] for q in questions}
    expected_categories = {
        "danang_tourism",
        "hue_tourism",
        "food_specialties",
        "cultural_history",
        "eco_tourism",
        "prices_opening_hours",
        "out_of_scope_insufficient",
    }
    assert expected_categories.issubset(categories)

    for q in questions:
        assert "id" in q
        assert "question" in q and len(q["question"]) > 5
        assert "category" in q
        assert "critical_facts" in q
        assert isinstance(q["critical_facts"], list)


def test_orchestrator_handles_out_of_scope_safely():
    """Test that Orchestrator safely declines non-Central Vietnam or out-of-domain queries."""
    orchestrator = ChatbotOrchestrator()
    context = TripContextPayload(destination="Đà Nẵng & Huế", days_count=2, current_day=1)

    oos_questions = [
        "Gợi ý cho mình các địa điểm du lịch nổi tiếng ở Paris nước Pháp?",
        "Viết giúp mình đoạn mã Python kết nối cơ sở dữ liệu?",
        "Tỷ giá đồng Yên Nhật hôm nay đổi ra VND là bao nhiêu?",
    ]

    for q in oos_questions:
        res = orchestrator.orchestrate(CopilotChatRequest(message=q, trip_context=context))
        lower = res.reply_text.lower()
        assert any(
            phrase in lower
            for phrase in ["chưa có dữ liệu", "chưa có tài liệu", "không thuộc phạm vi", "đà nẵng", "huế", "cụ thể địa danh"]
        ), f"Failed for query: {q} with reply: {res.reply_text}"
