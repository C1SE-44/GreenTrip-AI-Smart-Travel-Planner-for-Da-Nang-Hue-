from pathlib import Path
import sqlite3
import sys

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth.service import create_access_token
from app.config import Settings, get_settings
from app.db import postgres
from app.itineraries import repository as itin_repo
from app.main import app


def test_sqlite_unified_schema_and_seeded_itineraries_work_together(tmp_path, monkeypatch) -> None:
    sqlite_file = tmp_path / "dot2_unified.sqlite"
    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", sqlite_file)
    monkeypatch.setattr(postgres, "get_settings", lambda: Settings(DATABASE_URL=""))

    # Bootstrap via itineraries repository (which delegates SQLite DDL to _ensure_local_tables)
    itin_repo.seed_sample_itineraries()

    sample = itin_repo.get_itinerary("sample-danang-hue-3d")
    assert sample is not None
    assert sample["total_days"] == 3

    day1 = itin_repo.get_itinerary_day("sample-danang-hue-3d", 1)
    assert day1 is not None
    stops = itin_repo.get_itinerary_day_stops(day1["itinerary_day_id"])
    assert len(stops) == 3

    conn = sqlite3.connect(str(sqlite_file))
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    indexes = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()}
    conn.close()

    assert {"saved_place_collections", "saved_place_collection_items", "itineraries", "itinerary_days", "itinerary_stops"} <= tables
    assert {"idx_pois_city_active", "idx_email_otps_lookup", "idx_itineraries_user_id", "idx_itinerary_stops_poi_id"} <= indexes


def test_get_poi_by_id_queries_real_sqlite_pois_columns(tmp_path, monkeypatch) -> None:
    sqlite_file = tmp_path / "dot2_poi_lookup.sqlite"
    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", sqlite_file)
    monkeypatch.setattr(postgres, "get_settings", lambda: Settings(DATABASE_URL=""))

    with postgres.get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO pois (poi_id, name, latitude, longitude, is_active) VALUES (%s, %s, %s, %s, 1)",
            ("11111111-1111-1111-1111-111111111111", "Quán Chay Xanh", 16.06, 108.22),
        )
        conn.commit()

    by_id = itin_repo.get_poi_by_id("11111111-1111-1111-1111-111111111111")
    assert by_id == {
        "poi_id": "11111111-1111-1111-1111-111111111111",
        "name": "Quán Chay Xanh",
        "latitude": 16.06,
        "longitude": 108.22,
    }


def test_logged_in_user_cannot_hijack_existing_anonymous_trip(tmp_path, monkeypatch) -> None:
    sqlite_file = tmp_path / "dot2_ownership.sqlite"
    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", sqlite_file)
    monkeypatch.setattr(postgres, "get_settings", lambda: Settings(DATABASE_URL=""))
    monkeypatch.setenv("JWT_SECRET_KEY", "dot2-ownership-secret")
    monkeypatch.setenv("JWT_ALGORITHM", "HS256")
    get_settings.cache_clear()

    payload = {
        "trip_id": "guest-trip-1",
        "title": "Lịch trình khách",
        "destination": "Đà Nẵng",
        "days_count": 1,
        "days": [{"day_id": "guest-day-1", "day_number": 1, "date": None, "title": "Ngày 1", "stops": []}],
    }
    try:
        with TestClient(app) as client:
            created = client.put("/trips/guest-trip-1/itinerary", json=payload)
            assert created.status_code == 401
            # Seed an old anonymous row internally; the public API no longer creates these.
            from app.trips.itinerary_repository import save_itinerary
            from app.trips.schemas import TripItinerarySyncRequest
            save_itinerary(TripItinerarySyncRequest.model_validate(payload),None)
            from app.auth.dependencies import get_current_user_id
            app.dependency_overrides[get_current_user_id]=lambda:'attacker-user-99'
            try:
                payload['title']='Attacker changed title'
                assert client.put('/trips/guest-trip-1/itinerary',json=payload).status_code in (403,404)
                assert client.get('/trips/guest-trip-1/itinerary').status_code in (403,404)
            finally:
                app.dependency_overrides.pop(get_current_user_id,None)
            assert client.get('/trips/guest-trip-1/itinerary').status_code==401

        conn = sqlite3.connect(str(sqlite_file))
        stored_user_id = conn.execute("SELECT user_id FROM itineraries WHERE trip_id = 'guest-trip-1'").fetchone()[0]
        conn.close()
        assert stored_user_id is None
    finally:
        get_settings.cache_clear()
