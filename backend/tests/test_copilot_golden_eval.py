"""Automated pytest gate for the 45-case GreenTrip Copilot Golden Eval Set."""
from pathlib import Path
import sys

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.run_copilot_eval import run_golden_eval  # noqa: E402


def test_copilot_golden_eval_meets_quality_and_grounding_gates(monkeypatch: pytest.MonkeyPatch) -> None:
    # Force offline deterministic mode even when local .env contains GEMINI_API_KEY
    monkeypatch.setenv("DATABASE_URL", " ")
    monkeypatch.setenv("GEMINI_API_KEY", " ")

    summary = run_golden_eval(live_gemini=False)
    failed_details = [
        f"{item['id']} ({item['group']}): {item['failures']}"
        for item in summary["results"]
        if not item["passed"]
    ]

    assert summary["total"] >= 45
    assert summary["hallucination_count"] == 0, f"Detected ungrounded POIs: {failed_details}"
    assert summary["pass_rate"] >= 85.0, (
        f"Pass rate {summary['pass_rate']}% < 85%. Failures: {failed_details}"
    )

    # Verify 100% pass on Out-of-Scope protection
    oos_stats = summary["by_group"]["out_of_scope_protection"]
    assert oos_stats["passed"] == oos_stats["total"], f"OOS failures: {failed_details}"
