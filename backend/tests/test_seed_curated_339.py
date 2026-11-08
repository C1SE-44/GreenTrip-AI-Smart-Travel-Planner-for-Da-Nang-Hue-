"""Unit tests for seed_curated_339_pois.py."""

import os
from pathlib import Path
import sys

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.seed_curated_339_pois import seed_curated_339, check_backup_exists


def test_backup_exists_guard_passes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("scripts.seed_curated_339_pois.BACKUP_DIR", tmp_path)
    assert check_backup_exists() is False
    (tmp_path / "full_pois_backup_2426_dummy.json").write_text("{}", encoding="utf-8")
    assert check_backup_exists() is True


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="Requires live PostgreSQL connection (DATABASE_URL)",
)
def test_seed_curated_339_dry_run_executes_and_rolls_back():
    res = seed_curated_339(live_commit=False)
    assert res["status"] == "DRY-RUN (ROLLED BACK — NO LIVE DB CHANGES)"
    assert res["live_commit"] is False
    assert res["count_after"] == 339
    assert res["has_desc"] == 339
    assert res["has_addr"] == 339
    assert res["has_geom"] == 339
    assert res["has_cost"] == 339
