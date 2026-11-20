from datetime import date, timedelta
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app


def test_itinerary_days_and_stops_persist_and_can_be_reordered(tmp_path, monkeypatch) -> None:
    from app.db import postgres

    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", tmp_path / "itinerary.sqlite")
    monkeypatch.setattr(postgres, "get_settings", lambda: Settings(DATABASE_URL=""))
    day1 = (date.today() + timedelta(days=5)).isoformat()
    day2 = (date.today() + timedelta(days=6)).isoformat()
    payload = {
        "trip_id": "pb11-trip-roundtrip",
        "title": "Đà Nẵng & Huế cuối tuần",
        "destination": "Đà Nẵng & Huế",
        "start_date": day1,
        "days_count": 2,
        "days": [
            {
                "day_id": "pb11-day-1",
                "day_number": 1,
                "date": day1,
                "title": "Đà Nẵng",
                "note": "Đi chậm, dành thời gian nghỉ trưa.",
                "stops": [
                    {
                        "stop_id": "pb11-stop-1",
                        "poi_id": "poi-1",
                        "title": "Bãi biển Mỹ Khê",
                        "city": "Đà Nẵng",
                        "address": "Võ Nguyên Giáp, Sơn Trà, Đà Nẵng",
                        "category": "canh-quan",
                        "stop_type": "poi",
                        "source": "idea",
                        "sequence": 0,
                        "duration_minutes": 90,
                        "start_time": "08:30",
                        "end_time": "10:00",
                        "comment": "Đi buổi sáng",
                        "latitude": 16.0544,
                        "longitude": 108.2022,
                    },
                    {
                        "stop_id": "pb11-stop-2",
                        "poi_id": "poi-2",
                        "title": "Cầu Rồng",
                        "city": "Đà Nẵng",
                        "category": "di-tich",
                        "stop_type": "poi",
                        "source": "idea",
                        "sequence": 1,
                        "duration_minutes": 60,
                        "start_time": None,
                        "end_time": None,
                        "comment": None,
                        "latitude": 16.0611,
                        "longitude": 108.2275,
                    },
                ],
            },
            {"day_id": "pb11-day-2", "day_number": 2, "date": day2, "title": "Huế", "note": "", "stops": []},
        ],
    }

    with TestClient(app) as client:
        saved = client.put(f"/trips/{payload['trip_id']}/itinerary", json=payload)
        assert saved.status_code == 200
        assert saved.json()["days"][0]["stops"][0]["comment"] == "Đi buổi sáng"

        payload["days"][0]["stops"][0]["comment"] = "Đổi sang buổi chiều"
        payload["days"][0]["stops"][0]["sequence"] = 1
        payload["days"][0]["stops"][1]["sequence"] = 0
        updated = client.put(f"/trips/{payload['trip_id']}/itinerary", json=payload)
        assert updated.status_code == 200
        loaded = client.get(f"/trips/{payload['trip_id']}/itinerary")
        assert loaded.status_code == 200
        assert loaded.json()["days"][0]["stops"][0]["title"] == "Cầu Rồng"
        assert loaded.json()["days"][0]["note"] == "Đi chậm, dành thời gian nghỉ trưa."
        assert loaded.json()["days"][0]["stops"][1]["comment"] == "Đổi sang buổi chiều"
        assert loaded.json()["days"][0]["stops"][0]["address"] is None
        assert loaded.json()["days"][0]["stops"][1]["address"] == "Võ Nguyên Giáp, Sơn Trà, Đà Nẵng"
        assert loaded.json()["days"][1]["day_number"] == 2


def test_itinerary_rest_period_persists_as_a_timed_non_poi_stop(tmp_path, monkeypatch) -> None:
    from app.db import postgres

    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", tmp_path / "rest-period.sqlite")
    monkeypatch.setattr(postgres, "get_settings", lambda: Settings(DATABASE_URL=""))
    payload = {
        "trip_id": "pb11-rest-roundtrip",
        "title": "Đà Nẵng nghỉ trưa",
        "destination": "Đà Nẵng",
        "days_count": 1,
        "days": [{
            "day_id": "pb11-rest-day-1",
            "day_number": 1,
            "date": None,
            "title": "Đà Nẵng",
            "stops": [{
                "stop_id": "pb11-lunch-break",
                "poi_id": None,
                "title": "Nghỉ trưa & phục hồi",
                "city": "Đà Nẵng",
                "category": None,
                "stop_type": "rest",
                "source": "assistant",
                "sequence": 0,
                "duration_minutes": 90,
                "start_time": "12:00",
                "end_time": "13:30",
                "comment": None,
                "latitude": None,
                "longitude": None,
            }],
        }],
    }

    with TestClient(app) as client:
        saved = client.put(f"/trips/{payload['trip_id']}/itinerary", json=payload)
        loaded = client.get(f"/trips/{payload['trip_id']}/itinerary")

    assert saved.status_code == 200
    assert loaded.status_code == 200
    rest = loaded.json()["days"][0]["stops"][0]
    assert rest["stop_type"] == "rest"
    assert rest["poi_id"] is None
    assert rest["source"] == "assistant"
    assert rest["start_time"] == "12:00"
    assert rest["end_time"] == "13:30"
    assert rest["duration_minutes"] == 90


def test_itinerary_route_rejects_mismatched_trip_id() -> None:
    with TestClient(app) as client:
        response = client.put(
            "/trips/path-trip/itinerary",
            json={
                "trip_id": "body-trip",
                "title": "Chuyến đi",
                "destination": "Huế",
                "days_count": 1,
                "days": [{"day_id": "path-day-1", "day_number": 1, "date": None, "title": "", "stops": []}],
            },
        )
    assert response.status_code == 422


def test_itinerary_rejects_invalid_dates_and_duplicate_stop_order() -> None:
    with TestClient(app) as client:
        invalid_date = client.put(
            "/trips/date-trip/itinerary",
            json={
                "trip_id": "date-trip",
                "title": "Chuyến đi",
                "destination": "Huế",
                "start_date": "2026-13-45",
                "days_count": 1,
                "days": [{"day_id": "day-1", "day_number": 1, "date": None, "title": "", "stops": []}],
            },
        )
        duplicate_sequence = client.put(
            "/trips/sequence-trip/itinerary",
            json={
                "trip_id": "sequence-trip",
                "title": "Chuyến đi",
                "destination": "Huế",
                "days_count": 1,
                "days": [{
                    "day_id": "day-1",
                    "day_number": 1,
                    "date": None,
                    "title": "",
                    "stops": [
                        {"stop_id": "stop-1", "title": "Điểm 1", "sequence": 0},
                        {"stop_id": "stop-2", "title": "Điểm 2", "sequence": 0},
                    ],
                }],
            },
        )
    assert invalid_date.status_code == 422
    assert duplicate_sequence.status_code == 422


def test_itinerary_rejects_unknown_stop_type() -> None:
    with TestClient(app) as client:
        response = client.put(
            "/trips/type-trip/itinerary",
            json={
                "trip_id": "type-trip",
                "title": "Chuyến đi",
                "destination": "Huế",
                "days_count": 1,
                "days": [{
                    "day_id": "day-1",
                    "day_number": 1,
                    "date": None,
                    "title": "",
                    "stops": [{"stop_id": "stop-1", "title": "Điểm 1", "sequence": 0, "stop_type": "flight"}],
                }],
            },
        )
    assert response.status_code == 422


def test_itinerary_requires_zero_padded_stop_times() -> None:
    with TestClient(app) as client:
        response = client.put(
            "/trips/time-trip/itinerary",
            json={
                "trip_id": "time-trip",
                "title": "Chuyến đi",
                "destination": "Huế",
                "days_count": 1,
                "days": [{
                    "day_id": "day-1",
                    "day_number": 1,
                    "date": None,
                    "title": "",
                    "stops": [{"stop_id": "stop-1", "title": "Điểm 1", "sequence": 0, "start_time": "8:30"}],
                }],
            },
        )
    assert response.status_code == 422


def test_itinerary_rejects_overlapping_activity_times() -> None:
    with TestClient(app) as client:
        response = client.put(
            "/trips/overlap-trip/itinerary",
            json={
                "trip_id": "overlap-trip",
                "title": "Chuyến đi trùng giờ",
                "destination": "Đà Nẵng",
                "days_count": 1,
                "days": [{
                    "day_id": "overlap-day-1",
                    "day_number": 1,
                    "date": None,
                    "title": "Đà Nẵng",
                    "stops": [
                        {"stop_id": "stop-a", "title": "Bãi biển", "sequence": 0, "start_time": "09:00", "end_time": "10:30"},
                        {"stop_id": "stop-b", "title": "Bảo tàng", "sequence": 1, "start_time": "10:00", "end_time": "11:00"},
                    ],
                }],
            },
        )

    assert response.status_code == 422
    assert "khung giờ bị trùng" in response.json()["detail"][0]["msg"].lower()


def test_sample_trip_is_read_only_for_put_and_can_be_cloned_by_authenticated_user(tmp_path, monkeypatch) -> None:
    from datetime import datetime, timezone
    from app.auth.service import create_access_token
    from app.config import get_settings
    from app.db import postgres

    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", tmp_path / "sample_access.sqlite")
    monkeypatch.setattr(postgres, "get_settings", lambda: Settings(DATABASE_URL=""))
    monkeypatch.setenv("JWT_SECRET_KEY", "phase1-sample-secret")
    monkeypatch.setenv("JWT_ALGORITHM", "HS256")
    get_settings.cache_clear()

    with postgres.get_connection() as conn:
        cur = conn.cursor()
        from app.trips.itinerary_repository import _ensure_local_tables

        _ensure_local_tables(conn, cur)
        cur.execute(
            "INSERT INTO public.itineraries (trip_id, user_id, title, destination, days_count) VALUES (?, ?, ?, ?, ?)",
            ("sample-demo-3d", "demo-user", "Demo 3N", "Đà Nẵng", 1),
        )
        cur.execute(
            "INSERT INTO public.itinerary_days (day_id, trip_id, day_number, title) VALUES (?, ?, ?, ?)",
            ("sample-demo-3d-d1", "sample-demo-3d", 1, "Ngày 1"),
        )
        cur.execute(
            """
            INSERT INTO public.itinerary_stops
                (stop_id, day_id, poi_id, title, sequence, start_time, end_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("sample-demo-3d-d1-s1", "sample-demo-3d-d1", "poi_cau_rong", "Cầu Rồng", 1, "09:00", None),
        )
        cur.execute(
            "INSERT INTO public.itineraries (trip_id, user_id, title, destination, days_count) VALUES (?, ?, ?, ?, ?)",
            ("private-user-trip", "other-user", "Private", "Huế", 1),
        )
        conn.commit()

    try:
        user_a_token = create_access_token("user-a")
        user_b_token = create_access_token("user-b")
        today_vn = datetime.now(timezone(timedelta(hours=7))).date().isoformat()

        with TestClient(app) as client:
            guest_get = client.get("/trips/sample-demo-3d/itinerary")
            assert guest_get.status_code == 200
            body = guest_get.json()
            assert body["days"][0]["stops"][0]["sequence"] == 0
            assert body["days"][0]["stops"][0]["stop_type"] == "poi"
            assert body["days"][0]["stops"][0]["source"] == "idea"

            put_payload = {
                "trip_id": "sample-demo-3d",
                "title": "Demo 3N Updated",
                "destination": "Đà Nẵng & Huế",
                "days_count": 1,
                "days": [
                    {
                        "day_id": "sample-demo-3d-d1",
                        "day_number": 1,
                        "date": None,
                        "title": "Ngày 1",
                        "stops": [
                            {
                                "stop_id": "sample-demo-3d-d1-s1",
                                "poi_id": "poi_cau_rong",
                                "title": "Cầu Rồng",
                                "sequence": 0,
                                "start_time": "09:00",
                                "end_time": "10:00",
                                "stop_type": "poi",
                                "source": "assistant",
                            }
                        ],
                    }
                ],
            }
            guest_put = client.put("/trips/sample-demo-3d/itinerary", json=put_payload)
            assert guest_put.status_code == 403

            auth_put = client.put(
                "/trips/sample-demo-3d/itinerary",
                json=put_payload,
                headers={"Authorization": f"Bearer {user_a_token}"},
            )
            assert auth_put.status_code == 403

            unauth_clone = client.post("/my-trips/clone-sample/sample-demo-3d")
            assert unauth_clone.status_code == 401

            cloned_res = client.post(
                "/my-trips/clone-sample/sample-demo-3d",
                headers={"Authorization": f"Bearer {user_a_token}"},
            )
            assert cloned_res.status_code == 201
            cloned_body = cloned_res.json()
            cloned_id = cloned_body["trip_id"]
            assert cloned_id.startswith("trip-")
            assert cloned_body["start_date"] == today_vn
            assert cloned_body["days"][0]["day_id"] != "sample-demo-3d-d1"
            assert cloned_body["days"][0]["stops"][0]["title"] == "Cầu Rồng"
            assert cloned_body["days"][0]["stops"][0]["stop_id"] != "sample-demo-3d-d1-s1"

            owner_get = client.get(
                f"/my-trips/{cloned_id}",
                headers={"Authorization": f"Bearer {user_a_token}"},
            )
            assert owner_get.status_code == 200

            forbidden_get = client.get(
                f"/my-trips/{cloned_id}",
                headers={"Authorization": f"Bearer {user_b_token}"},
            )
            assert forbidden_get.status_code in (403, 404)

            missing_clone = client.post(
                "/my-trips/clone-sample/nonexistent",
                headers={"Authorization": f"Bearer {user_a_token}"},
            )
            assert missing_clone.status_code == 404

            private_get = client.get("/trips/private-user-trip/itinerary")
            assert private_get.status_code == 404
    finally:
        get_settings.cache_clear()


def test_save_itinerary_sql_has_no_unescaped_psycopg_percent_placeholders(tmp_path, monkeypatch) -> None:
    import inspect
    import re
    from app.db import postgres
    from app.trips.itinerary_repository import save_itinerary
    from app.trips.schemas import TripItinerarySyncRequest

    source = inspect.getsource(save_itinerary)
    assert "LIKE 'sample-%'" not in source
    assert re.findall(r"%(?![sbt%])", source) == []

    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", tmp_path / "psycopg-check.sqlite")
    monkeypatch.setattr(postgres, "get_settings", lambda: Settings(DATABASE_URL=""))

    orig_execute = postgres.SQLiteCursorWrapper.execute

    def strict_execute(self, sql, params=None):
        bad_tokens = re.findall(r"%(?![sbt%])", sql)
        assert bad_tokens == [], f"Invalid psycopg placeholder(s): {bad_tokens} in SQL: {sql}"
        return orig_execute(self, sql, params)

    monkeypatch.setattr(postgres.SQLiteCursorWrapper, "execute", strict_execute)
    day1 = (date.today() + timedelta(days=5)).isoformat()
    payload = TripItinerarySyncRequest(
        trip_id="sample-strict-check",
        title="Sample Strict Check",
        destination="Đà Nẵng",
        start_date=day1,
        days_count=1,
        days=[{"day_id": "sample-strict-d1", "day_number": 1, "date": day1, "title": "Ngày 1", "note": "", "stops": []}],
    )
    saved = save_itinerary(payload, user_id=None)
    assert saved.trip_id == "sample-strict-check"
    # Second save hits ON CONFLICT DO UPDATE (where LIKE 'sample-%' previously crashed psycopg)
    saved_again = save_itinerary(payload, user_id=None)
    assert saved_again.trip_id == "sample-strict-check"


