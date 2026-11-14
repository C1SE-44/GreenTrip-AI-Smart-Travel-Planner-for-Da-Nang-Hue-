import sys
from pathlib import Path
import uuid
from fastapi.testclient import TestClient
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth.service import create_access_token
from app.config import Settings
from app.db import postgres
from app.main import app


@pytest.fixture(autouse=True)
def isolated_db(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """Isolate SQLite database to a temporary directory for fast, conflict-free testing."""
    test_db = tmp_path / "test_my_trips.sqlite"
    monkeypatch.setattr(postgres, "_SQLITE_DB_PATH", test_db)
    monkeypatch.setattr(postgres, "get_settings", lambda: Settings(DATABASE_URL=""))
    monkeypatch.setattr("app.main.seed_sample_itineraries", lambda: None)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def auth_header(user_id: str) -> dict[str, str]:
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_trip_payload():
    trip_id = f"trip-test-{uuid.uuid4().hex[:8]}"
    return {
        "trip_id": trip_id,
        "title": "Hành trình Xanh Khám Phá Đà Nẵng & Huế",
        "destination": "Đà Nẵng & Huế",
        "start_date": "2026-11-20",
        "days_count": 2,
        "days": [
            {
                "day_id": f"day-1-{trip_id}",
                "day_number": 1,
                "title": "Khám phá danh thắng Đà Nẵng",
                "stops": [
                    {
                        "stop_id": f"stop-1-{trip_id}",
                        "poi_id": "poi_cau_rong",
                        "title": "Cầu Rồng Đà Nẵng",
                        "city": "Đà Nẵng",
                        "address": "Đường Nguyễn Văn Linh, Phước Ninh, Hải Châu",
                        "category": "canh-quan",
                        "stop_type": "poi",
                        "source": "idea",
                        "sequence": 0,
                        "duration_minutes": 60,
                        "start_time": "08:00",
                        "end_time": "09:00",
                        "comment": "Ngắm cầu Rồng phun lửa và biểu tượng du lịch",
                        "latitude": 16.0611,
                        "longitude": 108.2270,
                    },
                    {
                        "stop_id": f"stop-2-{trip_id}",
                        "poi_id": "poi_cho_han",
                        "title": "Chợ Hàn Đà Nẵng",
                        "city": "Đà Nẵng",
                        "address": "119 Trần Phú, Hải Châu 1, Hải Châu",
                        "category": "quan-an",
                        "stop_type": "poi",
                        "source": "idea",
                        "sequence": 1,
                        "duration_minutes": 90,
                        "start_time": "09:30",
                        "end_time": "11:00",
                        "comment": "Thưởng thức ẩm thực địa phương và mua quà miền Trung",
                        "latitude": 16.0678,
                        "longitude": 108.2208,
                    },
                ],
            },
            {
                "day_id": f"day-2-{trip_id}",
                "day_number": 2,
                "title": "Di sản Cố đô Huế",
                "stops": [
                    {
                        "stop_id": f"stop-3-{trip_id}",
                        "poi_id": "poi_dai_noi",
                        "title": "Đại Nội Huế (Hoàng Thành)",
                        "city": "Huế",
                        "address": "Đường 23 Tháng 8, Thuận Hòa, TP. Huế",
                        "category": "di-tich",
                        "stop_type": "poi",
                        "source": "idea",
                        "sequence": 0,
                        "duration_minutes": 150,
                        "start_time": "08:30",
                        "end_time": "11:00",
                        "comment": "Di sản văn hóa thế giới UNESCO",
                        "latitude": 16.4699,
                        "longitude": 107.5779,
                    }
                ],
            },
        ],
    }


def test_unauthenticated_request_rejected(client: TestClient, sample_trip_payload):
    """Test 1: Requests without valid JWT Authorization header must return 401 Unauthorized."""
    trip_id = sample_trip_payload["trip_id"]

    res_list = client.get("/my-trips")
    assert res_list.status_code == 401

    res_post = client.post("/my-trips", json=sample_trip_payload)
    assert res_post.status_code == 401

    res_get = client.get(f"/my-trips/{trip_id}")
    assert res_get.status_code == 401

    res_patch = client.patch(f"/my-trips/{trip_id}", json={"title": "New Title"})
    assert res_patch.status_code == 401

    res_del = client.delete(f"/my-trips/{trip_id}")
    assert res_del.status_code == 401

    res_exp = client.get(f"/my-trips/{trip_id}/export")
    assert res_exp.status_code == 401


def test_invalid_token_rejected(client: TestClient):
    """Test 2: Requests with forged or malformed Bearer tokens must return 401."""
    res = client.get("/my-trips", headers={"Authorization": "Bearer forged.invalid.token"})
    assert res.status_code == 401


def test_save_and_retrieve_my_trip(client: TestClient, sample_trip_payload):
    """Test 3: Authenticated user saves a valid trip and retrieves it in detail."""
    user_id = "user_alpha_001"
    headers = auth_header(user_id)
    trip_id = sample_trip_payload["trip_id"]

    # 1. Save trip
    res_save = client.post("/my-trips", json=sample_trip_payload, headers=headers)
    assert res_save.status_code == 201
    saved_data = res_save.json()
    assert saved_data["trip_id"] == trip_id
    assert saved_data["title"] == sample_trip_payload["title"]
    assert len(saved_data["days"]) == 2
    assert len(saved_data["days"][0]["stops"]) == 2
    assert len(saved_data["days"][1]["stops"]) == 1

    # 2. Retrieve details
    res_detail = client.get(f"/my-trips/{trip_id}", headers=headers)
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["trip_id"] == trip_id
    assert detail["days_count"] == 2
    # Verify stops sequence preserved
    stops_d1 = detail["days"][0]["stops"]
    assert stops_d1[0]["sequence"] == 0
    assert stops_d1[0]["title"] == "Cầu Rồng Đà Nẵng"
    assert stops_d1[1]["sequence"] == 1
    assert stops_d1[1]["title"] == "Chợ Hàn Đà Nẵng"


def test_list_my_trips(client: TestClient, sample_trip_payload):
    """Test 4: User retrieves their own list of trips with accurate summaries and stop counts."""
    user_id = f"user_list_{uuid.uuid4().hex[:6]}"
    headers = auth_header(user_id)

    # Empty initially
    res_empty = client.get("/my-trips", headers=headers)
    assert res_empty.status_code == 200
    assert res_empty.json() == []

    # Save first trip (3 stops)
    client.post("/my-trips", json=sample_trip_payload, headers=headers)

    # Save second trip with unique IDs
    new_trip_id = f"trip-2-{uuid.uuid4().hex[:6]}"
    payload_2 = {
        "trip_id": new_trip_id,
        "title": "Chuyến đi Thứ Hai",
        "destination": "Huế",
        "start_date": "2026-11-25",
        "days_count": 1,
        "days": [
            {
                "day_id": f"day-1-{new_trip_id}",
                "day_number": 1,
                "title": "Ngày 1 Cố Đô",
                "stops": [
                    {
                        "stop_id": f"stop-1-{new_trip_id}",
                        "poi_id": "poi_dai_noi",
                        "title": "Đại Nội Huế",
                        "city": "Huế",
                        "sequence": 0,
                        "stop_type": "poi",
                        "source": "idea",
                    }
                ],
            }
        ],
    }
    client.post("/my-trips", json=payload_2, headers=headers)

    # List trips
    res_list = client.get("/my-trips", headers=headers)
    assert res_list.status_code == 200
    trips = res_list.json()
    assert len(trips) == 2
    trip_ids = [t["trip_id"] for t in trips]
    assert sample_trip_payload["trip_id"] in trip_ids
    assert payload_2["trip_id"] in trip_ids

    # Find trip 1 and verify stop count
    t1 = next(t for t in trips if t["trip_id"] == sample_trip_payload["trip_id"])
    assert t1["total_stops"] == 3
    assert t1["days_count"] == 2


def test_patch_my_trip_metadata(client: TestClient, sample_trip_payload):
    """Test 5: User can update title, start_date and destination without disturbing itinerary days/stops."""
    user_id = "user_patch_001"
    headers = auth_header(user_id)
    trip_id = sample_trip_payload["trip_id"]

    client.post("/my-trips", json=sample_trip_payload, headers=headers)

    # Patch title and start_date
    patch_payload = {
        "title": "Hành trình Xanh Mùa Thu Đà Nẵng - Huế (Đã chỉnh sửa)",
        "start_date": "2026-12-01",
    }
    res_patch = client.patch(f"/my-trips/{trip_id}", json=patch_payload, headers=headers)
    assert res_patch.status_code == 200
    patched = res_patch.json()
    assert patched["title"] == patch_payload["title"]
    assert patched["start_date"] == "2026-12-01"
    # Ensure stops and days remain completely intact
    assert len(patched["days"]) == 2
    assert len(patched["days"][0]["stops"]) == 2


def test_delete_my_trip(client: TestClient, sample_trip_payload):
    """Test 6: User can delete their trip permanently, cascading to days and stops."""
    user_id = "user_del_001"
    headers = auth_header(user_id)
    trip_id = sample_trip_payload["trip_id"]

    client.post("/my-trips", json=sample_trip_payload, headers=headers)

    # Verify exists
    assert client.get(f"/my-trips/{trip_id}", headers=headers).status_code == 200

    # Delete
    res_del = client.delete(f"/my-trips/{trip_id}", headers=headers)
    assert res_del.status_code == 200
    assert res_del.json()["success"] is True

    # Subsequent GET returns 404
    assert client.get(f"/my-trips/{trip_id}", headers=headers).status_code == 404


def test_cross_user_isolation_security(client: TestClient, sample_trip_payload):
    """Test 7: User B CANNOT read, edit, delete, or export User A's trip (Strict 403 Forbidden)."""
    user_a = "user_alpha_secure"
    user_b = "user_bravo_attacker"
    headers_a = auth_header(user_a)
    headers_b = auth_header(user_b)
    trip_id = sample_trip_payload["trip_id"]

    # User A creates trip
    client.post("/my-trips", json=sample_trip_payload, headers=headers_a)

    # User B attempts to GET details -> 403
    res_get = client.get(f"/my-trips/{trip_id}", headers=headers_b)
    assert res_get.status_code == 403

    # User B attempts to PATCH -> 403
    res_patch = client.patch(f"/my-trips/{trip_id}", json={"title": "Hacked"}, headers=headers_b)
    assert res_patch.status_code == 403

    # User B attempts to DELETE -> 403
    res_del = client.delete(f"/my-trips/{trip_id}", headers=headers_b)
    assert res_del.status_code == 403

    # User B attempts to EXPORT PDF -> 403
    res_exp = client.get(f"/my-trips/{trip_id}/export", headers=headers_b)
    assert res_exp.status_code == 403

    # User B listing must NOT contain User A's trip
    res_b_list = client.get("/my-trips", headers=headers_b)
    assert res_b_list.status_code == 200
    assert all(t["trip_id"] != trip_id for t in res_b_list.json())


def test_nonexistent_trip_returns_404(client: TestClient):
    """Test 8: Operations on non-existent trip IDs return 404 Not Found."""
    headers = auth_header("any_user")
    ghost_id = "nonexistent-trip-99999"

    assert client.get(f"/my-trips/{ghost_id}", headers=headers).status_code == 404
    assert client.patch(f"/my-trips/{ghost_id}", json={"title": "Test"}, headers=headers).status_code == 404
    assert client.delete(f"/my-trips/{ghost_id}", headers=headers).status_code == 404
    assert client.get(f"/my-trips/{ghost_id}/export", headers=headers).status_code == 404


def test_invalid_itinerary_payload_rejected(client: TestClient):
    """Test 9: Invalid itinerary payload (e.g. days_count mismatch) rejected with 422."""
    headers = auth_header("test_user")
    invalid_payload = {
        "trip_id": "invalid-trip",
        "title": "Invalid Trip",
        "destination": "Đà Nẵng",
        "days_count": 3,
        "days": [
            # Only 1 day provided while days_count is 3
            {"day_id": "d1", "day_number": 1, "title": "Day 1", "stops": []}
        ],
    }
    res = client.post("/my-trips", json=invalid_payload, headers=headers)
    assert res.status_code == 422


def test_export_pdf_success_and_vietnamese_unicode(client: TestClient, sample_trip_payload):
    """Test 10: Exporting trip to PDF returns valid application/pdf binary with Vietnamese headers."""
    user_id = "user_pdf_tester"
    headers = auth_header(user_id)
    trip_id = sample_trip_payload["trip_id"]

    client.post("/my-trips", json=sample_trip_payload, headers=headers)

    res_pdf = client.get(f"/my-trips/{trip_id}/export", headers=headers)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert "attachment; filename=" in res_pdf.headers["content-disposition"]
    assert "GreenTrip_" in res_pdf.headers["content-disposition"]

    # PDF format verification
    content = res_pdf.content
    assert content.startswith(b"%PDF-")
    assert len(content) > 5000  # Non-trivial PDF with complete styling and tables


def test_alternate_routes_mounted_correctly(client: TestClient, sample_trip_payload):
    """Test 11: Verify both /api/my-trips and /trips/my-trips aliases resolve seamlessly."""
    user_id = f"user_alias_{uuid.uuid4().hex[:6]}"
    headers = auth_header(user_id)

    # POST via /api/my-trips
    res_api = client.post("/api/my-trips", json=sample_trip_payload, headers=headers)
    assert res_api.status_code == 201

    # GET list via /trips/my-trips
    res_trips = client.get("/trips/my-trips", headers=headers)
    assert res_trips.status_code == 200
    assert len(res_trips.json()) >= 1
