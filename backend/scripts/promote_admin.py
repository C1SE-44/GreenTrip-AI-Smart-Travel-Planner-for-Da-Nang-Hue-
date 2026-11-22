"""Safely promote or demote an existing user's RBAC role in the database."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.postgres import get_connection  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Update an existing GreenTrip account RBAC role.")
    parser.add_argument("--email", required=True, help="Existing user email.")
    parser.add_argument("--role", required=True, choices=["USER", "ADMIN"], help="Target RBAC role.")
    args = parser.parse_args()

    email = args.email.strip().lower()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.users
                SET role = %s, updated_at = CURRENT_TIMESTAMP
                WHERE LOWER(email) = %s
                RETURNING user_id, email, role, status
                """,
                (args.role, email),
            )
            row = cur.fetchone()
        conn.commit()

    if not row:
        print(f"USER_NOT_FOUND={email}")
        return 1

    print(f"UPDATED_RBAC_ROLE: user_id={row[0]} email={row[1]} role={row[2]} status={row[3]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
