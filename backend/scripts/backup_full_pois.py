"""Full Snapshot Backup script for public.pois.

Saves all rows and all columns from public.pois into data/backup/
before switching to the curated dataset.
"""

from datetime import datetime, timezone
from decimal import Decimal
import json
from pathlib import Path
import sys
from uuid import UUID

# Ensure UTF-8 output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.postgres import get_connection

PROJECT_ROOT = BACKEND_ROOT.parent
BACKUP_DIR = PROJECT_ROOT / "data" / "backup"


def backup_full_pois() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"full_pois_backup_2426_{timestamp}.json"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    poi_id, city_id, category_id, name, description, address,
                    ST_AsText(geom) AS geom_wkt,
                    estimated_cost, average_visit_minutes, satisfaction_score,
                    popularity_score, is_local_business, local_business_type,
                    status, green_score, is_active, created_at, updated_at
                FROM public.pois
                ORDER BY created_at ASC;
                """
            )
            cols = [desc[0] for desc in cur.description]
            rows = cur.fetchall()

            data = []
            for r in rows:
                row_dict = {}
                for col, val in zip(cols, r):
                    if isinstance(val, (datetime, Decimal, UUID)):
                        row_dict[col] = str(val)
                    else:
                        row_dict[col] = val
                data.append(row_dict)

            with backup_file.open("w", encoding="utf-8") as f:
                json.dump(
                    {
                        "backup_timestamp": timestamp,
                        "total_rows": len(data),
                        "columns": cols,
                        "rows": data,
                    },
                    f,
                    ensure_ascii=False,
                    indent=2,
                )

            print(f"✅ Successfully backed up {len(data)} rows to {backup_file}")
            return backup_file


if __name__ == "__main__":
    backup_full_pois()
