"""
Safe, Non-Destructive Ingestion Script for Supabase PostgreSQL.

SAFETY GUARANTEES:
1. NEVER executes TRUNCATE TABLE.
2. Backs up affected POI rows to data/backup/ BEFORE any write operation.
3. Runs inside an atomic transaction (ROLLBACK on error).
4. Defaults to --dry-run mode (simulates changes, validates data, then rolls back).
5. Only applies changes when --live-commit is explicitly provided.

Run via:
    # Dry run (safe preview, no DB changes committed):
    python backend/scripts/safe_import_pois.py --dry-run

    # Live run (creates backup, applies updates in transaction, commits):
    python backend/scripts/safe_import_pois.py --live-commit
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.postgres import get_connection

PREVIEW_JSON_PATH = PROJECT_ROOT / "data" / "processed" / "curated_62_enrichment_preview.json"
MATCH_REPORT_PATH = PROJECT_ROOT / "data" / "processed" / "curated_339_match_report.json"
BACKUP_DIR = PROJECT_ROOT / "data" / "backup"


def backup_existing_rows(cursor: Any, poi_ids: list[str]) -> Path:
    """Export current state of rows to be updated into a backup JSON file."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"pois_backup_before_curated62_{timestamp}.json"

    cursor.execute(
        """
        SELECT
            poi_id::text,
            city_id::text,
            category_id::text,
            name,
            description,
            address,
            estimated_cost,
            average_visit_minutes,
            satisfaction_score,
            popularity_score,
            is_local_business,
            local_business_type,
            status,
            created_at,
            updated_at
        FROM public.pois
        WHERE poi_id = ANY(%s::uuid[]);
        """,
        (poi_ids,),
    )
    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]

    backup_data: list[dict[str, Any]] = []
    for row in rows:
        record: dict[str, Any] = {}
        for col, val in zip(columns, row):
            if isinstance(val, (datetime, Decimal)):
                record[col] = str(val)
            else:
                record[col] = val
        backup_data.append(record)

    with backup_file.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "backup_timestamp": timestamp,
                "total_rows_backed_up": len(backup_data),
                "rows": backup_data,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    return backup_file


def run_safe_import(
    preview_json_path: Path = PREVIEW_JSON_PATH,
    match_report_path: Path = MATCH_REPORT_PATH,
    live_commit: bool = False,
) -> dict[str, Any]:
    with preview_json_path.open("r", encoding="utf-8") as f:
        preview_data = json.load(f)

    with match_report_path.open("r", encoding="utf-8") as f:
        match_report = json.load(f)

    # Build lookup of existing_name and city_code for each of the 62 records
    curated_updates: dict[str, dict[str, Any]] = {}
    for r in match_report["records"]:
        if r["status"] == "UPDATE_CANDIDATE":
            curated_updates[r["record_id"]] = {
                "place_name": r["place_name"],
                "existing_name": r["match_details"]["existing_name"],
                "city_code": r["city_code"],
            }

    diffs = preview_data["enrichment_diffs"]

    with get_connection() as conn:
        with conn.cursor() as cur:
            # 1. Pre-flight check: Row count before
            cur.execute("SELECT count(*) FROM public.pois;")
            count_before = cur.fetchone()[0]

            cur.execute("SELECT city_id, code FROM public.cities;")
            city_ids = {row[1]: row[0] for row in cur.fetchall()}

            # 2. Resolve POI IDs in database
            updates_to_apply: list[dict[str, Any]] = []
            poi_ids_to_backup: list[str] = []

            for d in diffs:
                rec_id = d["record_id"]
                info = curated_updates.get(rec_id)
                if not info:
                    continue

                c_id = city_ids[info["city_code"]]
                ex_name = info["existing_name"]

                cur.execute(
                    """
                    SELECT poi_id, name, description, address, estimated_cost, is_local_business
                    FROM public.pois
                    WHERE city_id = %s AND (name = %s OR name = %s OR name ILIKE %s OR name ILIKE %s)
                    LIMIT 1;
                    """,
                    (c_id, ex_name, info["place_name"], f"%{ex_name}%", f"%{info['place_name']}%"),
                )
                matched_row = cur.fetchone()
                if not matched_row:
                    raise RuntimeError(
                        f"Target POI not found in database: {ex_name} ({info['city_code']})"
                    )

                db_poi_id = str(matched_row[0])
                poi_ids_to_backup.append(db_poi_id)

                changes = d["field_changes"]
                new_desc = changes.get("description", {}).get("new", matched_row[2])
                new_addr = changes.get("address", {}).get("new", matched_row[3])
                cost_str = changes.get("estimated_cost", {}).get("new")
                new_cost = Decimal(cost_str) if cost_str else matched_row[4]

                updates_to_apply.append({
                    "poi_id": db_poi_id,
                    "record_id": rec_id,
                    "name": matched_row[1],
                    "new_description": new_desc,
                    "new_address": new_addr,
                    "new_cost": new_cost,
                    "is_local_business": True,
                })

            if len(updates_to_apply) != len(diffs):
                raise RuntimeError(
                    f"Mismatch in resolved updates: expected {len(diffs)}, got {len(updates_to_apply)}"
                )

            # 3. Create Backup of rows before updating
            backup_file_path = backup_existing_rows(cur, poi_ids_to_backup)

            # 4. Apply Updates safely in transaction
            updated_count = 0
            for u in updates_to_apply:
                cur.execute(
                    """
                    UPDATE public.pois
                    SET
                        description = %s,
                        address = %s,
                        estimated_cost = %s,
                        is_local_business = %s,
                        updated_at = NOW()
                    WHERE poi_id = %s::uuid;
                    """,
                    (
                        u["new_description"],
                        u["new_address"],
                        u["new_cost"],
                        u["is_local_business"],
                        u["poi_id"],
                    ),
                )
                updated_count += cur.rowcount

            # 5. Post-flight verification: Total rows must remain EXACTLY identical
            cur.execute("SELECT count(*) FROM public.pois;")
            count_after = cur.fetchone()[0]

            if count_after != count_before:
                raise RuntimeError(
                    f"Safety Violation! Row count changed: before={count_before}, after={count_after}. "
                    "Rolling back transaction immediately."
                )

            if live_commit:
                conn.commit()
                status_msg = "COMMITTED TO DATABASE"
            else:
                conn.rollback()
                status_msg = "DRY-RUN (ROLLED BACK — NO DB CHANGES)"

    return {
        "status": status_msg,
        "live_commit": live_commit,
        "count_before": count_before,
        "count_after": count_after,
        "updated_rows_count": updated_count,
        "backup_file": str(backup_file_path),
        "target_update_candidates": len(diffs),
    }


def print_summary(result: dict[str, Any]) -> None:
    print("=" * 70)
    print("  GREEN TRIP — SAFE POI STAGING INGESTION")
    print("=" * 70)
    print(f"Status:               {result['status']}")
    print(f"Total POIs in DB:     {result['count_before']} (verified unchanged: {result['count_after']})")
    print(f"Rows Updated:         {result['updated_rows_count']}/{result['target_update_candidates']}")
    print(f"Pre-Update Backup:    {result['backup_file']}")
    print("-" * 70)
    if result["live_commit"]:
        print("✅ SUCCESS: 62 POI records successfully enriched in live Supabase DB.")
    else:
        print("🛡️  DRY-RUN COMPLETE: Verified safe execution. Transaction was rolled back.")
        print("   To apply live updates, re-run with: --live-commit")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Safely update POIs in Supabase without TRUNCATE.")
    parser.add_argument("--live-commit", action="store_true", help="Commit changes to Supabase DB.")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Dry run only (default).")
    args = parser.parse_args()

    commit_flag = args.live_commit
    res = run_safe_import(live_commit=commit_flag)
    print_summary(res)
