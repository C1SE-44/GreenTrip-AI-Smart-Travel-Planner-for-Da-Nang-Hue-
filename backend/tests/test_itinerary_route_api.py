import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest
from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app
from app.itineraries.router import get_day_route
from app.itineraries.repository import seed_sample_itineraries
from app.itineraries.schemas import RouteStop, DayRouteResponse
from app.itineraries.service import get_itinerary_day_route

# Ensure sample itineraries are in DB
seed_sample_itineraries()

# Mocked OSRM GeoJSON response
MOCK_OSRM_GEOJSON = {
    "code": "Ok",
    "routes": [
        {
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [108.2270, 16.0611],
                    [108.2208, 16.0678],
                    [108.2778, 16.1005],
                ],
            },
            "distance": 4500.5,
            "duration": 650.0,
        }
    ],
}


def test_get_day_route_success_with_osrm():
    """Test 1 & 4: Successfully retrieve route geometry for Day 1 with mocked OSRM."""
    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=MOCK_OSRM_GEOJSON):
        res: DayRouteResponse = get_day_route("sample-danang-hue-3d", 1)

        assert res.itinerary_id == "sample-danang-hue-3d"
        assert res.day_number == 1
        assert res.total_stops == 3
        assert len(res.stops) == 3
        assert res.route.type == "LineString"
        assert len(res.route.coordinates) >= 3
        assert abs(res.distance_meters - 4500.5) < 1.0
        assert res.duration_seconds == 650.0
        assert res.is_fallback is False
        assert res.routing_provider == "osrm"


def test_stops_preserve_exact_sequence():
    """Test 2: Visiting order strictly preserves sequence_no (1, 2, 3)."""
    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=MOCK_OSRM_GEOJSON):
        res: DayRouteResponse = get_day_route("sample-danang-hue-3d", 1)

        orders = [s.order for s in res.stops]
        assert orders == [1, 2, 3]
        assert res.stops[0].poi_id == "poi_cau_rong"
        assert res.stops[1].poi_id == "poi_cho_han"
        assert res.stops[2].poi_id == "poi_linh_ung"


def test_geojson_coordinates_order():
    """Test 3: Coordinates must strictly be [longitude, latitude]."""
    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=MOCK_OSRM_GEOJSON):
        res: DayRouteResponse = get_day_route("sample-danang-hue-3d", 1)

        for point in res.route.coordinates:
            assert len(point) == 2
            lon, lat = point[0], point[1]
            # Da Nang / Hue longitude is ~107.5 - 108.5, latitude is ~16.0 - 16.5
            assert 107.0 <= lon <= 109.0, f"Expected longitude ~108, got {lon}"
            assert 15.5 <= lat <= 17.0, f"Expected latitude ~16, got {lat}"


def test_single_stop_day():
    """Test 5: Day with 1 stop returns single coordinate point and 0 distance/duration."""
    res: DayRouteResponse = get_day_route("sample-danang-hue-3d", 3)

    assert res.day_number == 3
    assert res.total_stops == 1
    assert len(res.stops) == 1
    assert res.distance_meters == 0
    assert res.duration_seconds == 0
    assert res.route.type == "LineString"
    assert len(res.route.coordinates) == 1
    assert res.route.coordinates[0] == [
        res.stops[0].longitude,
        res.stops[0].latitude,
    ]


def test_empty_stops_day():
    """Test 6: Day with 0 stops returns empty route coordinates and 0 distance/duration."""
    res: DayRouteResponse = get_day_route("sample-empty-day-itin", 1)

    assert res.total_stops == 0
    assert res.stops == []
    assert res.route.coordinates == []
    assert res.distance_meters == 0
    assert res.duration_seconds == 0


def test_nonexistent_itinerary_404():
    """Test 7: Nonexistent itinerary ID returns HTTP 404."""
    with pytest.raises(HTTPException) as exc_info:
        get_day_route("nonexistent-uuid-99999", 1)
    assert exc_info.value.status_code == 404
    assert "not found" in exc_info.value.detail.lower()


def test_nonexistent_day_404():
    """Test 8: Nonexistent day number (e.g. Day 99) returns HTTP 404."""
    with pytest.raises(HTTPException) as exc_info:
        get_day_route("sample-danang-hue-3d", 99)
    assert exc_info.value.status_code == 404
    assert "day 99 not found" in exc_info.value.detail.lower()


def test_invalid_day_number_422():
    """Test 8b: Invalid day_number < 1 triggers HTTP 422."""
    with pytest.raises(HTTPException) as exc_info:
        get_day_route("sample-danang-hue-3d", 0)
    assert exc_info.value.status_code == 422


def test_invalid_coordinates_422():
    """Test 9: POI with missing/invalid coordinates raises 422 error."""
    with patch(
        "app.itineraries.service.repository.get_poi_by_id",
        return_value={"poi_id": "poi_bad", "name": "Broken Point", "latitude": None, "longitude": 108.20},
    ):
        with pytest.raises(HTTPException) as exc_info:
            get_day_route("sample-danang-hue-3d", 1)
        assert exc_info.value.status_code == 422
        assert "coordinates" in exc_info.value.detail.lower()


def test_osrm_failure_fallback_haversine():
    """Test 10: OSRM timeout / failure falls back to straight-line with Haversine distance."""
    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=None):
        res: DayRouteResponse = get_day_route("sample-danang-hue-3d", 1)

        assert res.total_stops == 3
        assert res.is_fallback is True
        assert res.routing_provider == "fallback"
        assert res.distance_meters > 0
        assert res.duration_seconds > 0
        assert len(res.route.coordinates) == 3


def test_router_endpoints_registered_in_app():
    """Test 11: Verify routes are registered under both /api/itineraries and /itineraries in FastAPI app."""
    registered_paths = [route.path for route in app.routes]

    assert "/api/itineraries/{itinerary_id}/days/{day_number}/route" in registered_paths
    assert "/itineraries/{itinerary_id}/days/{day_number}/route" in registered_paths


def test_multiday_1d_itinerary():
    """Test 12: 1-Day itinerary retrieves Day 1 successfully and reports total_days=1."""
    res = get_day_route("sample-danang-1d", 1)
    assert res.itinerary_id == "sample-danang-1d"
    assert res.day_number == 1
    assert res.total_days == 1
    assert res.total_stops == 2
    assert res.stops[0].order == 1
    assert res.stops[1].order == 2


def test_multiday_2d_itinerary():
    """Test 13: 2-Day itinerary retrieves Day 1 and Day 2, resetting order to 1 on Day 2."""
    d1 = get_day_route("sample-danang-2d", 1)
    assert d1.total_days == 2
    assert d1.day_number == 1
    assert d1.stops[0].order == 1

    d2 = get_day_route("sample-danang-2d", 2)
    assert d2.total_days == 2
    assert d2.day_number == 2
    assert d2.stops[0].order == 1  # Resets to 1


def test_multiday_5d_itinerary_all_days_accessible():
    """Test 14: 5-Day itinerary can navigate across Day 1 -> Day 2 -> Day 3 -> Day 4 -> Day 5."""
    for d_num in range(1, 6):
        res = get_day_route("sample-danang-hue-5d", d_num)
        assert res.total_days == 5
        assert res.day_number == d_num
        assert res.total_stops >= 1
        assert res.stops[0].order == 1  # Every day numbering restarts from 1


def test_multiday_7d_itinerary():
    """Test 15: N-Day (7-day) itinerary works dynamically up to Day 7."""
    res_d7 = get_day_route("sample-central-vietnam-7d", 7)
    assert res_d7.total_days == 7
    assert res_d7.day_number == 7
    assert res_d7.total_stops == 2
    assert res_d7.stops[0].order == 1
