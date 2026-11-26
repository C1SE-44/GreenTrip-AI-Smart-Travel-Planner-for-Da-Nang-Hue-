from dataclasses import dataclass

import pytest

from app.accommodations.repository import PoiCatalogueAccommodationProvider, normalize_stay
from app.accommodations.schemas import AccommodationItinerary, AccommodationRecommendationRequest
from app.accommodations.service import recommend_accommodations


@dataclass
class FakeProvider:
    stays: list[dict]

    def list_stays(self, destination: str) -> list[dict]:
        return self.stays


def stop(poi_id: str, city: str, lat: float | None, lng: float | None):
    return {"poi_id": poi_id, "city": city, "latitude": lat, "longitude": lng}


def stay(stay_id: str, name: str, city: str, lat: float | None, lng: float | None, **extra):
    return {
        "stay_id": stay_id,
        "name": name,
        "category": "Hotel",
        "city": city,
        "address": None,
        "latitude": lat,
        "longitude": lng,
        "image_url": None,
        "website_url": None,
        "nightly_room_price": None,
        "currency": None,
        "price_unit": None,
        "budget_tier": None,
        "max_guests_per_room": None,
        "room_types": [],
        "amenities": [],
        "rating": None,
        "review_count": None,
        "check_in": None,
        "check_out": None,
        "sustainability_evidence": None,
        "data_source": "public.pois",
        "updated_at": None,
        **extra,
    }


def request(days, *, start="2026-12-01", end=None, destination="Đà Nẵng & Huế", **trip):
    end = end or f"2026-12-{days:02d}"
    return AccommodationRecommendationRequest.model_validate({
        "alternative_id": "nearby",
        "trip": {
            "destination": destination,
            "days_count": days,
            "start_date": start,
            "end_date": end,
            "date_mode": "dates",
            "adult_count": 2,
            "child_count": 0,
            "infant_count": 0,
            "pet_count": 0,
            **trip,
        },
        "itinerary": {"days": []},
    })


def with_days(payload: AccommodationRecommendationRequest, days: list[dict]) -> AccommodationRecommendationRequest:
    payload.itinerary = AccommodationItinerary.model_validate({"days": days})
    return payload


def test_multi_city_itinerary_groups_contiguous_days_and_estimates_nights_once_per_city():
    payload = request(4)
    payload = with_days(payload, [
        {"day_number": 1, "stops": [stop("d1", "Đà Nẵng", 16.05, 108.2)]},
        {"day_number": 2, "stops": [stop("d2", "Đà Nẵng", 16.06, 108.21)]},
        {"day_number": 3, "stops": [stop("h1", "Huế", 16.46, 107.58)]},
        {"day_number": 4, "stops": [stop("h2", "Huế", 16.47, 107.59)]},
    ])
    provider = FakeProvider([
        stay("d-hotel", "Stay Đà Nẵng", "Đà Nẵng", 16.055, 108.205),
        stay("h-hotel", "Stay Huế", "Huế", 16.465, 107.585),
    ])

    result = recommend_accommodations(payload, provider)

    assert [group.city for group in result.groups] == ["Đà Nẵng", "Huế"]
    assert [group.day_numbers for group in result.groups] == [[1, 2], [3, 4]]
    assert [group.nights for group in result.groups] == [2, 1]
    assert all(group.nights_status == "DATE_RANGE" for group in result.groups)
    assert [group.recommendations[0].stay.stay_id for group in result.groups] == ["d-hotel", "h-hotel"]


def test_more_convenient_multi_poi_location_outweighs_a_higher_single_rating():
    payload = request(2, destination="Đà Nẵng")
    payload = with_days(payload, [
        {"day_number": 1, "stops": [stop("p1", "Đà Nẵng", 16.05, 108.20), stop("p2", "Đà Nẵng", 16.07, 108.22)]},
        {"day_number": 2, "stops": [stop("p3", "Đà Nẵng", 16.06, 108.21)]},
    ])
    provider = FakeProvider([
        stay("near", "Nearby", "Đà Nẵng", 16.06, 108.21, rating=4.1),
        stay("far", "Far high rated", "Đà Nẵng", 16.30, 108.45, rating=5.0),
    ])

    result = recommend_accommodations(payload, provider)

    ranked = result.groups[0].recommendations
    assert [item.stay.stay_id for item in ranked] == ["near", "far"]
    assert ranked[0].match_score > ranked[1].match_score
    assert "đường chim bay" in ranked[0].reasons[0]


def test_no_database_stay_records_returns_explicit_empty_without_fabricated_results():
    payload = request(2, destination="Đà Nẵng")
    payload = with_days(payload, [{
        "day_number": 1,
        "stops": [stop("p1", "Đà Nẵng", 16.05, 108.20), stop("p2", "Đà Nẵng", 16.07, 108.22)],
    }])

    result = recommend_accommodations(payload, FakeProvider([]))

    assert result.status == "no_data"
    assert result.groups[0].status == "no_data"
    assert result.groups[0].recommendations == []
    assert any("không có" in warning for warning in result.groups[0].warnings)


def test_stays_from_another_city_are_not_returned_for_the_current_group():
    payload = request(2, destination="Đà Nẵng")
    payload = with_days(payload, [{
        "day_number": 1,
        "stops": [stop("p1", "Đà Nẵng", 16.05, 108.20), stop("p2", "Đà Nẵng", 16.07, 108.22)],
    }])

    result = recommend_accommodations(payload, FakeProvider([
        stay("hue", "Huế stay", "Huế", 16.46, 107.58),
        stay("danang", "Đà Nẵng stay", "Đà Nẵng", 16.06, 108.21),
    ]))

    assert [item.stay.stay_id for item in result.groups[0].recommendations] == ["danang"]


def test_single_or_missing_coordinates_do_not_create_rating_only_ranking():
    payload = request(2, destination="Đà Nẵng")
    payload = with_days(payload, [{"day_number": 1, "stops": [stop("one", "Đà Nẵng", 16.05, 108.20)]}])
    provider = FakeProvider([
        stay("rated", "A rated stay", "Đà Nẵng", 16.05, 108.20, rating=5),
        stay("unknown", "B unknown stay", "Đà Nẵng", None, None, rating=2),
    ])

    result = recommend_accommodations(payload, provider)

    group = result.groups[0]
    assert group.status == "insufficient_location_data"
    assert all(item.match_score is None for item in group.recommendations)
    assert any("dưới hai POI" in warning for warning in group.warnings)


def test_price_preference_is_soft_and_total_cost_requires_room_night_unit_and_room_count():
    payload = request(
        2, destination="Đà Nẵng", lodging_preference="budget", room_count=2,
        total_budget=2_000_000,
    )
    payload = with_days(payload, [{
        "day_number": 1,
        "stops": [stop("p1", "Đà Nẵng", 16.05, 108.20), stop("p2", "Đà Nẵng", 16.07, 108.22)],
    }])
    provider = FakeProvider([
        stay("lux", "Luxury", "Đà Nẵng", 16.06, 108.21, budget_tier="luxury", nightly_room_price=600_000, currency="VND", price_unit="VND/room/night"),
        stay("budget", "Budget", "Đà Nẵng", 16.06, 108.21, budget_tier="budget", nightly_room_price=300_000, currency="VND", price_unit="VND/room/night"),
    ])

    result = recommend_accommodations(payload, provider)

    assert len(result.groups[0].recommendations) == 2
    budget = next(item for item in result.groups[0].recommendations if item.stay.stay_id == "budget")
    luxury = next(item for item in result.groups[0].recommendations if item.stay.stay_id == "lux")
    assert budget.match_score > luxury.match_score
    assert budget.estimated_total_cost == 600_000  # 2 rooms × 1 night
    assert budget.estimated_cost_unit.startswith("VND")
    assert any("ngân sách khách sạn" in reason for reason in budget.reasons)


def test_per_group_room_count_informs_capacity_ranking_and_room_night_estimate():
    payload = request(
        2,
        destination="Đà Nẵng",
        adult_count=2,
        child_count=1,
        room_counts_by_group={"da-nang-1-1-1": 1},
    )
    payload = with_days(payload, [{
        "day_number": 1,
        "stops": [stop("p1", "Đà Nẵng", 16.05, 108.20), stop("p2", "Đà Nẵng", 16.07, 108.22)],
    }])
    provider = FakeProvider([
        stay("short", "Two guests per room", "Đà Nẵng", 16.06, 108.21, max_guests_per_room=2, nightly_room_price=500_000, currency="VND", price_unit="VND/room/night"),
        stay("fit", "Three guests per room", "Đà Nẵng", 16.06, 108.21, max_guests_per_room=3, nightly_room_price=500_000, currency="VND", price_unit="VND/room/night"),
    ])

    result = recommend_accommodations(payload, provider)

    assert result.groups[0].group_id == "da-nang-1-1-1"
    ranked = result.groups[0].recommendations
    assert [item.stay.stay_id for item in ranked] == ["fit", "short"]
    assert ranked[0].estimated_total_cost == 500_000
    assert ranked[0].estimated_cost_unit.startswith("VND · 1 phòng × 1 đêm")


@pytest.mark.parametrize("unit,expected", [("VND/room/night", 250_000), ("VND/phòng/đêm", 250_000), ("VND/person/visit", None), (None, None)])
def test_normalizer_never_treats_non_room_night_prices_as_lodging_price(unit, expected):
    row = {
        "poi_id": "db-1", "name": "Real property", "category_name": "Khách sạn",
        "city_name": "Huế", "estimated_cost": 250_000, "price_unit": unit,
        "repository_source": "postgres", "is_active": True,
        "ai_metadata": {},
    }
    normalized = normalize_stay(row)
    assert normalized is not None
    assert normalized["nightly_room_price"] == expected


@pytest.mark.parametrize("amount", [float("inf"), 1_000_000_001])
def test_normalizer_ignores_non_finite_or_out_of_range_nightly_price(amount):
    normalized = normalize_stay({
        "poi_id": "invalid-price",
        "name": "Catalogue stay",
        "category_name": "Hotel",
        "estimated_cost": amount,
        "price_unit": "VND/room/night",
        "is_active": True,
        "repository_source": "postgres",
    })

    assert normalized is not None
    assert normalized["nightly_room_price"] is None


def test_inactive_and_non_lodging_catalogue_rows_are_not_stays():
    base = {
        "poi_id": "db-1", "name": "Some POI", "category_name": "Hotel",
        "repository_source": "postgres", "is_active": True,
    }
    assert normalize_stay({**base, "is_active": False}) is None
    assert normalize_stay({**base, "category_name": "Restaurant"}) is None
    assert normalize_stay({**base, "repository_source": "offline_csv"}) is None


def test_database_provider_supports_direct_city_and_category_columns_without_a_stays_table():
    from types import SimpleNamespace

    schema = {
        "pois": {
            "id", "name", "category", "city", "latitude", "longitude", "is_active",
            "estimated_cost", "budget_tier", "satisfaction_score", "image_url", "website_url",
            "status", "sub_category", "price_unit", "currency", "max_guests_per_room",
            "review_count", "check_in", "check_out", "updated_at",
        },
        "poi_categories": set(),
        "cities": set(),
    }
    data = {
        "poi_id": "hotel-row-1",
        "name": "Catalogue stay",
        "category_name": "Hotel",
        "city_id": None,
        "city_name": "Đà Nẵng",
        "latitude": 16.06,
        "longitude": 108.21,
        "address": None,
        "estimated_cost": 800_000,
        "budget_tier": "standard",
        "satisfaction_score": None,
        "image_url": None,
        "website_url": None,
        "status": None,
        "is_active": True,
        "sub_category": None,
        "price_unit": "VND/room/night",
        "currency": "VND",
        "max_guests_per_room": "2",
        "review_count": None,
        "check_in": None,
        "check_out": None,
        "updated_at": None,
        "ai_metadata": {},
    }
    aliases = list(data)

    class Cursor:
        def __init__(self):
            self.description = None
            self.rows = []

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, query, params):
            if "information_schema.columns" in query:
                self.description = [SimpleNamespace(name="column_name")]
                self.rows = [(column,) for column in schema[params[0]]]
                return
            self.query = query
            self.params = params
            self.description = [SimpleNamespace(name=alias) for alias in aliases]
            self.rows = [tuple(data[alias] for alias in aliases)]

        def fetchall(self):
            return self.rows

    class Connection:
        def cursor(self):
            return Cursor()

    stays = PoiCatalogueAccommodationProvider(Connection()).list_stays("Đà Nẵng")

    assert [item["stay_id"] for item in stays] == ["hotel-row-1"]
    assert stays[0]["city"] == "Đà Nẵng"
    assert stays[0]["nightly_room_price"] == 800_000
    assert stays[0]["max_guests_per_room"] == 2


def test_pet_is_not_counted_as_human_capacity_and_unknown_capacity_is_not_claimed():
    payload = request(2, destination="Đà Nẵng", pet_count=2, room_count=1)
    payload = with_days(payload, [{
        "day_number": 1,
        "stops": [stop("p1", "Đà Nẵng", 16.05, 108.20), stop("p2", "Đà Nẵng", 16.07, 108.22)],
    }])
    result = recommend_accommodations(payload, FakeProvider([
        stay("unknown-capacity", "Unknown capacity", "Đà Nẵng", 16.06, 108.21),
    ]))
    recommendation = result.groups[0].recommendations[0]
    assert "capacity" not in recommendation.data_coverage
    assert any("Chính sách thú cưng" in reason for reason in recommendation.reasons)
    assert result.metadata["pets_excluded_from_human_capacity"] is True


def test_flexible_dates_mark_nights_as_estimated_not_confirmed():
    payload = request(3, start=None, end=None, destination="Huế", date_mode="flex")
    payload = with_days(payload, [{"day_number": 1, "stops": [stop("p1", "Huế", 16.46, 107.58)]}])
    result = recommend_accommodations(payload, FakeProvider([]))
    assert result.groups[0].nights == 1
    assert result.groups[0].nights_status == "ESTIMATED"
    assert any("ước tính" in warning for warning in result.groups[0].warnings)


def test_database_unavailable_provider_error_is_not_misreported_as_empty_inventory():
    class UnavailableProvider:
        def list_stays(self, destination: str) -> list[dict]:
            raise RuntimeError("database unavailable")

    payload = request(2, destination="Đà Nẵng")
    payload = with_days(payload, [{
        "day_number": 1,
        "stops": [stop("p1", "Đà Nẵng", 16.05, 108.20), stop("p2", "Đà Nẵng", 16.07, 108.22)],
    }])
    with pytest.raises(RuntimeError, match="catalogue is unavailable"):
        recommend_accommodations(payload, UnavailableProvider())


def test_authenticated_read_endpoint_returns_empty_catalogue_without_fabricating_stays(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import app.accommodations.router as router_module
    from app.auth.dependencies import get_current_user_id

    app = FastAPI()
    app.include_router(router_module.router, prefix="/api/accommodations")
    app.dependency_overrides[get_current_user_id] = lambda: "qa-user"
    app.dependency_overrides[router_module.get_accommodation_connection] = lambda: object()
    monkeypatch.setattr(router_module, "PoiCatalogueAccommodationProvider", lambda _connection: FakeProvider([]))
    payload = request(2, destination="Đà Nẵng")
    payload = with_days(payload, [{
        "day_number": 1,
        "stops": [stop("p1", "Đà Nẵng", 16.05, 108.20), stop("p2", "Đà Nẵng", 16.07, 108.22)],
    }])

    with TestClient(app) as client:
        response = client.post("/api/accommodations/recommendations", json=payload.model_dump())

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "no_data"
    assert result["data_source"] == "public.pois"
    assert result["groups"][0]["recommendations"] == []


def test_authenticated_read_endpoint_reports_unavailable_catalogue_without_database_access():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import app.accommodations.router as router_module
    from app.auth.dependencies import get_current_user_id

    app = FastAPI()
    app.include_router(router_module.router, prefix="/api/accommodations")
    app.dependency_overrides[get_current_user_id] = lambda: "qa-user"
    app.dependency_overrides[router_module.get_accommodation_connection] = lambda: None
    payload = request(2, destination="Đà Nẵng")
    payload = with_days(payload, [{
        "day_number": 1,
        "stops": [stop("p1", "Đà Nẵng", 16.05, 108.20), stop("p2", "Đà Nẵng", 16.07, 108.22)],
    }])

    with TestClient(app) as client:
        response = client.post("/api/accommodations/recommendations", json=payload.model_dump())

    assert response.status_code == 503
    assert "Itinerary" in response.json()["detail"]

