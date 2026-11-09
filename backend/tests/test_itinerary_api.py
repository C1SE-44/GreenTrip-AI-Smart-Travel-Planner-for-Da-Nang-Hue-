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
    payload = {
        "trip_id": "pb11-trip-roundtrip",
        "title": "Đà Nẵng & Huế cuối tuần",
        "destination": "Đà Nẵng & Huế",
        "start_date": "2026-11-15",
        "days_count": 2,
        "days": [
            {
                "day_id": "pb11-day-1",
                "day_number": 1,
                "date": "2026-11-15",
                "title": "Đà Nẵng",
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
            {"day_id": "pb11-day-2", "day_number": 2, "date": "2026-11-16", "title": "Huế", "stops": []},
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
