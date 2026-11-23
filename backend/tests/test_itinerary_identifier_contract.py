from contextlib import contextmanager
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.auth.dependencies import get_current_user_id
from app.db.postgres import SQLiteConnectionWrapper
from app.trips import itinerary_repository as repository
from app.trips.router import router
from app.assistant import store


def test_postgres_legacy_identifier_limits_preserve_modern_ids_and_order(tmp_path, monkeypatch):
    db_path = tmp_path / "itineraries.db"
    @contextmanager
    def connection():
        with SQLiteConnectionWrapper(sqlite3.connect(db_path)) as db:
            yield db
    monkeypatch.setattr(repository, "get_connection", connection)
    monkeypatch.setattr(store, "PATH", tmp_path / "assistant.db")
    with connection() as db:
        with db.cursor() as cursor:
            repository._ensure_local_tables(db, cursor)
        db.commit()
    # SQLite TEXT would accept the exact payload rejected by live PostgreSQL varchar(64).
    with sqlite3.connect(db_path) as db:
        for table, column in [("itineraries", "itinerary_id"), ("itinerary_days", "itinerary_day_id"), ("itinerary_days", "itinerary_id"), ("itinerary_stops", "itinerary_stop_id"), ("itinerary_stops", "itinerary_day_id")]:
            db.execute(f"CREATE TRIGGER limit_{table}_{column} BEFORE INSERT ON {table} WHEN length(NEW.{column}) > 64 BEGIN SELECT RAISE(ABORT, 'value too long for character varying(64)'); END")
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user_id] = lambda: "owner"
    trip_id = "777ce327-e280-414e-b746-2f68947a420c"
    day_id = f"{trip_id}-day-1"
    stop_id = f"{trip_id}-1-936b4a05-8051-4fda-aba1-42c28c143cb3"
    payload = {"trip_id": trip_id, "title":"Lịch đã chỉnh", "destination":"Đà Nẵng", "start_date":"2026-12-20", "days_count":1,
        "days":[{"day_id":day_id,"day_number":1,"date":"2026-12-20","title":"Ngày 1","stops":[
            {"stop_id":stop_id,"poi_id":"936b4a05-8051-4fda-aba1-42c28c143cb3","title":"Địa điểm từ DB","sequence":0,"start_time":"09:00","end_time":"10:00"},
            {"stop_id":"short-stop","poi_id":None,"title":"Nghỉ","stop_type":"rest","sequence":1}]}]}
    with TestClient(app) as client:
        saved = client.put(f"/trips/{trip_id}/itinerary",json=payload)
        assert saved.status_code == 200, saved.text
        loaded = client.get(f"/trips/{trip_id}/itinerary").json()
        assert [s["stop_id"] for s in loaded["days"][0]["stops"]] == [stop_id,"short-stop"]
        assert loaded["days"][0]["day_id"] == day_id
        assert loaded["start_date"] == "2026-12-20"
        assert client.put(f"/trips/{trip_id}/itinerary",json=payload).status_code == 200
    with sqlite3.connect(db_path) as db:
        aliases = db.execute("SELECT stop_id,itinerary_stop_id,itinerary_day_id FROM itinerary_stops ORDER BY sequence").fetchall()
        assert aliases[0][0] == stop_id and len(aliases[0][1]) <= 64
        assert aliases[1][1] == "short-stop"
        assert aliases[0][2] == day_id
