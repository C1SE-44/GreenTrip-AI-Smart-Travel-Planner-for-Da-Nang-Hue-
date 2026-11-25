"""
Pytest integration wrapper for Sprint 2.7 UAT scenarios (UAT-01 to UAT-20).
"""

import json
from pathlib import Path
import pytest

def test_uat_20_scenarios_all_pass():
    """Verify that all 20 UAT scenarios executed and passed with 100% pass rate."""
    uat_file = Path(__file__).resolve().parents[1] / "data" / "uat_20_results.json"
    assert uat_file.exists(), "UAT results file does not exist!"
    
    with open(uat_file, encoding="utf-8") as f:
        results = json.load(f)
        
    assert len(results) == 20, f"Expected 20 UAT scenarios, found {len(results)}"
    
    failed = [r for r in results if r["status"] != "PASS"]
    assert not failed, f"Found failed UAT scenarios: {failed}"
