import os
from pathlib import Path
import sys

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.safe_import_pois import run_safe_import


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="Requires live PostgreSQL connection (DATABASE_URL)",
)
def test_safe_import_dry_run_executes_and_rolls_back():
    result = run_safe_import(live_commit=False)

    assert result["status"] == "DRY-RUN (ROLLED BACK — NO DB CHANGES)"
    assert result["live_commit"] is False
    assert result["count_before"] == result["count_after"]
    assert result["updated_rows_count"] == 62
    assert Path(result["backup_file"]).exists()
