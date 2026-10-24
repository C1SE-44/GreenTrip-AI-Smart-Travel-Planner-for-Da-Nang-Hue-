"""Unit tests for seed_curated_339_pois.py."""

from pathlib import Path
import sys

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.seed_curated_339_pois import seed_curated_339, check_backup_exists


def test_backup_exists_guard_passes():
    assert check_backup_exists() is True


def test_seed_curated_339_dry_run_executes_and_rolls_back():
    res = seed_curated_339(live_commit=False)
    assert res["status"] == "DRY-RUN (ROLLED BACK — NO LIVE DB CHANGES)"
    assert res["live_commit"] is False
    assert res["count_after"] == 339
    assert res["has_desc"] == 339
    assert res["has_addr"] == 339
    assert res["has_geom"] == 339
    assert res["has_cost"] == 339
