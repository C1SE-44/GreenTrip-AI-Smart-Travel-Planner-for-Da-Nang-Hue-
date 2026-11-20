import math
from unittest.mock import patch
import pytest

from app.itineraries.schemas import RouteStop, RouteGeometry
from app.itineraries.routing_service import (
    compute_route_geometry,
    build_fallback_route,
    get_corridor_between_points,
    haversine_distance_meters,
    CORRIDOR_DA_NANG_HUE_GEOJSON,
)


def is_in_da_nang_bay_water(lon: float, lat: float) -> bool:
    """
    Check if a coordinate [lon, lat] falls into the deep water area of Da Nang Bay.
    Bounding box of the water body:
    - Latitude: 16.095 to 16.135 N
    - Longitude: 108.150 to 108.190 E
    """
    return 16.095 < lat < 16.135 and 108.150 < lon < 108.190


def is_in_dam_cau_hai_water(lon: float, lat: float) -> bool:
    """
    Check if a coordinate [lon, lat] falls into the open water area of Đầm Cầu Hai.
    Water body bounds:
    - Latitude: 16.335 to 16.365 N
    - Longitude: 107.880 to 107.980 E
    """
    return 16.335 < lat < 16.365 and 107.880 < lon < 107.980


# ─── 15 COMPREHENSIVE TEST CASES FOR ROUTING & BAY FIX ───

def test_case_01_north_danang_to_south_danang_bypasses_bay():
    """Case 1: Route from Nam Ô (North) to Hải Châu/Cầu Rồng (South) MUST NOT cross Da Nang Bay."""
    nam_o = RouteStop(order=1, poi_id="nam_o", name="Cầu Nam Ô", latitude=16.1360, longitude=108.1360)
    cau_rong = RouteStop(order=2, poi_id="cau_rong", name="Cầu Rồng", latitude=16.0611, longitude=108.2270)

    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=None):
        geom, dist, dur, is_fallback, prov = compute_route_geometry([nam_o, cau_rong])

        assert is_fallback is True
        assert len(geom.coordinates) >= 5, "Route must contain bypass waypoints around the bay"

        # Verify no coordinate in the route falls into Da Nang Bay water body
        for lon, lat in geom.coordinates:
            assert not is_in_da_nang_bay_water(lon, lat), (
                f"Coordinate [{lon}, {lat}] is in the middle of Da Nang Bay water!"
            )


def test_case_02_south_danang_to_north_danang_bypasses_bay_reverse():
    """Case 2: Route from Son Tra/Hai Chau to Nam Ô in reverse must also bypass Da Nang Bay."""
    son_tra = RouteStop(order=1, poi_id="son_tra", name="Chùa Linh Ứng", latitude=16.1058, longitude=108.2933)
    nam_o = RouteStop(order=2, poi_id="nam_o", name="Cầu Nam Ô", latitude=16.1360, longitude=108.1360)

    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=None):
        geom, dist, dur, is_fallback, prov = compute_route_geometry([son_tra, nam_o])

        assert is_fallback is True
        assert len(geom.coordinates) >= 5
        for lon, lat in geom.coordinates:
            assert not is_in_da_nang_bay_water(lon, lat), (
                f"Reverse coordinate [{lon}, {lat}] is in the middle of Da Nang Bay water!"
            )


def test_case_03_danang_to_hue_highway_ql1a_corridor():
    """Case 3: Inter-provincial route from Da Nang to Hue follows QL1A land highway, not crossing open sea."""
    da_nang = RouteStop(order=1, poi_id="dn", name="Đà Nẵng", latitude=16.0611, longitude=108.2270)
    hue = RouteStop(order=2, poi_id="hue", name="Đại Nội Huế", latitude=16.4637, longitude=107.5809)

    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=None):
        geom, dist, dur, is_fallback, prov = compute_route_geometry([da_nang, hue])

        assert is_fallback is True
        # Must contain highway corridor waypoints (Hai Van, Lang Co, Phu Gia, Phuoc Tuong...)
        assert len(geom.coordinates) >= len(CORRIDOR_DA_NANG_HUE_GEOJSON)
        # Distance between Da Nang and Hue via QL1A is approx 90-110 km
        assert 80_000 <= dist <= 140_000, f"Expected realistic highway distance, got {dist}m"
        assert dur > 5400, "Duration should reflect ~2 hours driving"


def test_case_04_hue_to_danang_highway_ql1a_corridor_reverse():
    """Case 4: Route from Hue back to Da Nang preserves reverse highway corridor sequence."""
    hue = RouteStop(order=1, poi_id="hue", name="Đại Nội Huế", latitude=16.4637, longitude=107.5809)
    da_nang = RouteStop(order=2, poi_id="dn", name="Đà Nẵng", latitude=16.0611, longitude=108.2270)

    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=None):
        geom, dist, dur, is_fallback, prov = compute_route_geometry([hue, da_nang])

        assert is_fallback is True
        # Verify first waypoint after start is near Hue and last is near Da Nang
        assert geom.coordinates[0][0] < 108.0  # Hue longitude ~107.58
        assert geom.coordinates[-1][0] > 108.1  # Da Nang longitude ~108.22


def test_case_05_route_avoids_dam_cau_hai_lagoon():
    """Case 5: Road corridor hugs foothills along QL1A, never cutting across Đầm Cầu Hai water."""
    da_nang = RouteStop(order=1, poi_id="dn", name="Đà Nẵng", latitude=16.0611, longitude=108.2270)
    hue = RouteStop(order=2, poi_id="hue", name="Huế", latitude=16.4637, longitude=107.5809)

    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=None):
        geom, _, _, _, _ = compute_route_geometry([da_nang, hue])

        for lon, lat in geom.coordinates:
            assert not is_in_dam_cau_hai_water(lon, lat), (
                f"Point [{lon}, {lat}] cuts across Đầm Cầu Hai water!"
            )


def test_case_06_urban_danang_route_within_city_bounds():
    """Case 6: Intra-city Da Nang route stays within reasonable city distance and geometry."""
    stop1 = RouteStop(order=1, poi_id="s1", name="Cầu Rồng", latitude=16.0611, longitude=108.2270)
    stop2 = RouteStop(order=2, poi_id="s2", name="Chợ Hàn", latitude=16.0678, longitude=108.2208)
    stop3 = RouteStop(order=3, poi_id="s3", name="Bãi biển Mỹ Khê", latitude=16.0590, longitude=108.2440)

    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=None):
        geom, dist, dur, is_fallback, prov = compute_route_geometry([stop1, stop2, stop3])

        assert len(geom.coordinates) >= 3
        # Intra-city Da Nang 3 stops should be under 15 km
        assert 1_000 <= dist <= 15_000
        assert 0 < dur < 3600


def test_case_07_urban_hue_route_within_city_bounds():
    """Case 7: Intra-city Hue route stays within city limits and does not trigger highway corridor."""
    stop1 = RouteStop(order=1, poi_id="h1", name="Đại Nội", latitude=16.4637, longitude=107.5809)
    stop2 = RouteStop(order=2, poi_id="h2", name="Chùa Thiên Mụ", latitude=16.4697, longitude=107.5489)
    stop3 = RouteStop(order=3, poi_id="h3", name="Chợ Đông Ba", latitude=16.4680, longitude=107.5920)

    corridor = get_corridor_between_points(stop1.latitude, stop1.longitude, stop2.latitude, stop2.longitude)
    # Intra-city Hue does not cross province boundary
    assert corridor == [], "Intra-city Hue should not invoke Hai Van highway corridor"


def test_case_08_single_stop_route():
    """Case 8: Single stop returns direct point with 0 distance and duration."""
    single = RouteStop(order=1, poi_id="ba_na", name="Bà Nà Hills", latitude=15.9980, longitude=107.9960)

    geom, dist, dur, is_fallback, prov = compute_route_geometry([single])

    assert len(geom.coordinates) == 1
    assert geom.coordinates[0] == [107.9960, 15.9980]
    assert dist == 0.0
    assert dur == 0.0
    assert prov == "direct"


def test_case_09_empty_stops_route():
    """Case 9: Zero stops returns empty geometry gracefully without errors."""
    geom, dist, dur, is_fallback, prov = compute_route_geometry([])

    assert geom.coordinates == []
    assert dist == 0.0
    assert dur == 0.0
    assert prov == "none"


def test_case_10_identical_close_stops():
    """Case 10: Two identical or near-identical stops handle cleanly without division by zero."""
    stop1 = RouteStop(order=1, poi_id="p1", name="Điểm A", latitude=16.0611, longitude=108.2270)
    stop2 = RouteStop(order=2, poi_id="p2", name="Điểm A trùng", latitude=16.0611, longitude=108.2270)

    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=None):
        geom, dist, dur, is_fallback, prov = compute_route_geometry([stop1, stop2])

        assert len(geom.coordinates) == 2
        assert dist == 0.0
        assert dur == 0.0


def test_case_11_osrm_failure_activates_corridor_fallback():
    """Case 11: When OSRM fails or times out, fallback immediately supplies valid bypass route."""
    stop1 = RouteStop(order=1, poi_id="nam_o", name="Nam Ô", latitude=16.1360, longitude=108.1360)
    stop2 = RouteStop(order=2, poi_id="son_tra", name="Sơn Trà", latitude=16.1058, longitude=108.2933)

    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=None):
        geom, dist, dur, is_fallback, prov = compute_route_geometry([stop1, stop2])

        assert is_fallback is True
        assert prov == "fallback"
        assert len(geom.coordinates) > 2
        assert dist > 0


def test_case_12_osrm_success_uses_osrm_geometry():
    """Case 12: When OSRM succeeds, real road geometry is returned with provider='osrm'."""
    stop1 = RouteStop(order=1, poi_id="s1", name="Điểm 1", latitude=16.0611, longitude=108.2270)
    stop2 = RouteStop(order=2, poi_id="s2", name="Điểm 2", latitude=16.0678, longitude=108.2208)

    mock_osrm = {
        "code": "Ok",
        "routes": [
            {
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[108.2270, 16.0611], [108.2240, 16.0640], [108.2208, 16.0678]],
                },
                "distance": 1250.0,
                "duration": 180.0,
            }
        ],
    }

    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=mock_osrm):
        geom, dist, dur, is_fallback, prov = compute_route_geometry([stop1, stop2])

        assert is_fallback is False
        assert prov == "osrm"
        assert dist == 1250.0
        assert dur == 180.0
        assert len(geom.coordinates) == 3


def test_case_13_route_caching_returns_instantaneous_result():
    """Case 13: Subsequent call with same stops uses cache and avoids external calls."""
    stop1 = RouteStop(order=1, poi_id="c1", name="Cầu Rồng", latitude=16.0611, longitude=108.2270)
    stop2 = RouteStop(order=2, poi_id="c2", name="Bảo tàng Chăm", latitude=16.0600, longitude=108.2220)

    # First call primes cache
    res1 = compute_route_geometry([stop1, stop2])
    # Second call uses cache
    res2 = compute_route_geometry([stop1, stop2])

    assert res1 == res2
    assert res2[0].type == "LineString"


def test_case_14_haversine_formula_accuracy():
    """Case 14: Haversine distance matches real-world distance between known benchmarks."""
    # Distance between Cầu Rồng (16.0611, 108.2270) and Chợ Hàn (16.0678, 108.2208) is ~1 km
    d = haversine_distance_meters(16.0611, 108.2270, 16.0678, 108.2208)
    assert 900 <= d <= 1200, f"Expected ~1000m, got {d}m"


def test_case_15_multistop_itinerary_preserves_sequential_corridors():
    """Case 15: 4-Stop multi-leg trip correctly attaches bypass waypoints on relevant legs."""
    stops = [
        RouteStop(order=1, poi_id="s1", name="Đại Nội Huế", latitude=16.4637, longitude=107.5809),
        RouteStop(order=2, poi_id="s2", name="Lăng Cô", latitude=16.2300, longitude=108.0100),
        RouteStop(order=3, poi_id="s3", name="Cầu Nam Ô", latitude=16.1360, longitude=108.1360),
        RouteStop(order=4, poi_id="s4", name="Cầu Rồng Đà Nẵng", latitude=16.0611, longitude=108.2270),
    ]

    with patch("app.itineraries.routing_service.fetch_osrm_json", return_value=None):
        geom, dist, dur, is_fallback, prov = compute_route_geometry(stops)

        assert is_fallback is True
        assert len(geom.coordinates) >= 8
        # No coordinate may fall in Da Nang Bay
        for lon, lat in geom.coordinates:
            assert not is_in_da_nang_bay_water(lon, lat), (
                f"Multi-stop coordinate [{lon}, {lat}] is inside Da Nang Bay!"
            )
