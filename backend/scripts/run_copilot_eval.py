"""CLI runner & reusable evaluator for the 45-case GreenTrip Copilot Golden Eval Set."""
from __future__ import annotations

import argparse
from collections import defaultdict
import json
import os
from pathlib import Path
import sys
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.db.postgres import get_connection  # noqa: E402
from app.trips.copilot_grounding import (  # noqa: E402
    detect_ungrounded_poi_mentions,
    load_known_poi_names,
)
from app.trips.schemas import CopilotChatRequest, TripContextPayload  # noqa: E402
from app.trips.service import process_copilot_chat  # noqa: E402

DEFAULT_EVAL_PATH = BACKEND_ROOT / "tests" / "data" / "copilot_golden_eval.json"


def _city_matches(poi_city: str, expected_city: str) -> bool:
    c_low = (poi_city or "").strip().lower()
    e_low = expected_city.strip().lower()
    if "đà nẵng" in e_low or "da nang" in e_low:
        return "đà nẵng" in c_low or "da nang" in c_low or "hội an" in c_low
    if "huế" in e_low or "hue" in e_low:
        return "huế" in c_low or "hue" in c_low
    return True


def evaluate_case(
    case: dict[str, Any],
    connection: Any,
    known_poi_names: set[str],
) -> dict[str, Any]:
    """Run one Golden Eval test case and return detailed pass/fail metrics."""
    ctx_payload = TripContextPayload.model_validate(case.get("trip_context") or {})
    req = CopilotChatRequest(message=case["message"], trip_context=ctx_payload)
    resp = process_copilot_chat(req, connection)
    exp = case.get("expected") or {}

    failures: list[str] = []
    hallucinations: list[str] = []

    if "intent_category" in exp and resp.intent_category != exp["intent_category"]:
        failures.append(f"intent_category={resp.intent_category} != {exp['intent_category']}")

    if "sub_intent" in exp and resp.intent != exp["sub_intent"]:
        failures.append(f"sub_intent={resp.intent} != {exp['sub_intent']}")

    if "strict_city" in exp:
        bad_cities = [
            f"{p.name} ({p.city})"
            for p in resp.suggested_pois
            if not _city_matches(p.city or "", exp["strict_city"])
        ]
        if bad_cities:
            failures.append(f"city_leak={bad_cities}")

    for req_constraint in exp.get("constraints_include") or []:
        if req_constraint not in resp.detected_constraints:
            failures.append(f"missing_constraint={req_constraint} (got {resp.detected_constraints})")

    if "min_pois" in exp and len(resp.suggested_pois) < int(exp["min_pois"]):
        failures.append(f"suggested_pois={len(resp.suggested_pois)} < {exp['min_pois']}")

    if exp.get("exact_zero_pois") and len(resp.suggested_pois) != 0:
        failures.append(f"expected 0 POIs for OOS/greeting, got {len(resp.suggested_pois)}")

    if exp.get("require_mutation"):
        has_mut = bool(resp.mutation_summary) or resp.updated_itinerary_state is not None
        if not has_mut:
            failures.append("expected itinerary mutation summary or updated_itinerary_state")

    reply_low = (resp.reply_text or "").lower()
    any_terms = exp.get("reply_contains_any") or []
    if any_terms and not any(t.lower() in reply_low for t in any_terms):
        failures.append(f"reply missing any of {any_terms}")

    if exp.get("require_ab_hook") and not (resp.reply_text or "").strip().endswith("?"):
        failures.append("reply does not end with A/B follow-up question")

    if exp.get("zero_ungrounded_pois"):
        extra_allowed = [p.name for p in resp.suggested_pois if p.name]
        extra_allowed.extend(ctx_payload.saved_ideas or [])
        hallucinations = detect_ungrounded_poi_mentions(
            resp.reply_text,
            known_poi_names,
            extra_allowed_names=extra_allowed,
        )
        if hallucinations:
            failures.append(f"ungrounded_pois={hallucinations}")

    return {
        "id": case["id"],
        "group": case["group"],
        "passed": len(failures) == 0,
        "failures": failures,
        "hallucinations": hallucinations,
        "intent": resp.intent,
        "intent_category": resp.intent_category,
    }


def run_golden_eval(
    eval_path: Path = DEFAULT_EVAL_PATH,
    live_gemini: bool = False,
) -> dict[str, Any]:
    """Execute the full Golden Eval Set and return aggregate statistics."""
    cases = json.loads(eval_path.read_text(encoding="utf-8"))
    prev_gemini = os.environ.get("GEMINI_API_KEY")
    try:
        if not live_gemini:
            os.environ["GEMINI_API_KEY"] = " "
            get_settings.cache_clear()

        with get_connection() as conn:
            known_names = load_known_poi_names(conn)
            results = [evaluate_case(case, conn, known_names) for case in cases]
    finally:
        if not live_gemini:
            if prev_gemini is None:
                os.environ.pop("GEMINI_API_KEY", None)
            else:
                os.environ["GEMINI_API_KEY"] = prev_gemini
            get_settings.cache_clear()

    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    hallucination_count = sum(len(r["hallucinations"]) for r in results)

    by_group: dict[str, dict[str, int]] = defaultdict(lambda: {"passed": 0, "total": 0})
    for r in results:
        by_group[r["group"]]["total"] += 1
        if r["passed"]:
            by_group[r["group"]]["passed"] += 1

    return {
        "total": total,
        "passed": passed,
        "pass_rate": round((passed / total) * 100, 2) if total else 0.0,
        "hallucination_count": hallucination_count,
        "by_group": dict(by_group),
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Chạy bộ 45 câu kiểm thử vàng cho GreenTrip AI Copilot.")
    parser.add_argument("--live-gemini", action="store_true", help="Bật gọi Gemini API thật theo .env")
    parser.add_argument("--eval-file", type=Path, default=DEFAULT_EVAL_PATH)
    args = parser.parse_args()

    summary = run_golden_eval(eval_path=args.eval_file, live_gemini=args.live_gemini)
    mode_label = "LIVE GEMINI" if args.live_gemini else "OFFLINE DETERMINISTIC"
    print(f"=== GREENTRIP COPILOT GOLDEN EVAL ({mode_label}) ===")
    for group, counts in summary["by_group"].items():
        print(f"- {group}: {counts['passed']}/{counts['total']}")
    print(
        f"TONG KET: {summary['passed']}/{summary['total']} ({summary['pass_rate']}%) | "
        f"Hallucinations: {summary['hallucination_count']}"
    )
    failed = [r for r in summary["results"] if not r["passed"]]
    for item in failed:
        print(f"  [FAIL] {item['id']}: {'; '.join(item['failures'])}")
    return 0 if summary["pass_rate"] >= 85.0 and summary["hallucination_count"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
