"""Private server-side demo storage. Never expose this file through the Data API."""

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

PATH = Path(
    os.environ.get(
        "ASSISTANT_STORE_PATH",
        Path(__file__).resolve().parents[2] / "data" / "assistant_sessions.db",
    )
)


@contextmanager
def session(user_id, trip_id, mode, conversation_id=1):
    if conversation_id not in (1, 2, 3):
        raise ValueError("A trip supports at most three conversations")
    # Keep existing histories in slot 1 without migrating or discarding their state.
    mode = mode if conversation_id == 1 else f"{mode}:{conversation_id}"
    PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(PATH, timeout=15) as db:
        db.execute(
            "CREATE TABLE IF NOT EXISTS assistant_sessions (user_id TEXT NOT NULL, scope TEXT NOT NULL, mode TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(user_id,scope,mode))"
        )
        # Serialize simultaneous requests to the same session and preserve ordered references.
        db.execute("BEGIN IMMEDIATE")
        scope = f"trip:{trip_id}" if trip_id else "@discover"
        row = db.execute(
            "SELECT state FROM assistant_sessions WHERE user_id=? AND scope=? AND mode=?",
            (user_id, scope, mode),
        ).fetchone()
        state = (
            json.loads(row[0])
            if row
            else {"messages": [], "last_ids": [], "criteria": {}, "draft": None}
        )
        yield state
        db.execute(
            "INSERT INTO assistant_sessions VALUES (?,?,?,?) ON CONFLICT(user_id,scope,mode) DO UPDATE SET state=excluded.state",
            (user_id, scope, mode, json.dumps(state, ensure_ascii=False)),
        )
