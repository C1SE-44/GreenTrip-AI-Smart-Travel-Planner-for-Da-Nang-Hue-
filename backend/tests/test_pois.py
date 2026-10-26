from pathlib import Path
import sys
from typing import Any

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app
from app.pois import repository
from app.pois.model import POI


class FakeCursor:
    def __init__(self, records: list[POI], queries: list[tuple[str, Any]]) -> None:
        self.records = records
        self.queries = queries
        self.rows: list[tuple[Any, ...]] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, query: str, parameters: tuple[Any, ...] | None = None) -> None:
        self.queries.append((query, parameters))
        if "COUNT(*)" in query:
            self.rows = [(len(self.records),)]
            return

        limit, offset = (parameters[-2], parameters[-1]) if parameters else (0, 0)
        ordered = sorted(self.records, key=lambda poi: int(poi.id) if str(poi.id).isdigit() else poi.id)
        page = ordered[offset : offset + limit]
        self.rows = [
            (
                poi.id,
                poi.name,
                poi.category,
                poi.description,
                poi.latitude,
                poi.longitude,
                poi.address,
                poi.city,
                poi.estimated_cost,
                poi.average_visit_minutes,
                poi.satisfaction_score,
                poi.green_score,
                poi.is_local_business,
                poi.local_business_type,
                poi.image_url,
                poi.gallery_urls,
                poi.sub_category,
                poi.cuisine,
                poi.budget_tier,
                poi.vibes,
                poi.best_time,
                poi.eco_features,
                poi.ai_metadata,
                poi.phone_number,
                poi.website_url,
                poi.social_links,
                poi.opening_hours,
                poi.email,
            )
            for poi in page
        ]

    def fetchall(self) -> list[tuple[Any, ...]]:
        return self.rows

    def fetchone(self) -> tuple[Any, ...] | None:
        return self.rows[0] if self.rows else None


class FakeConnection:
    def __init__(self, records: list[POI], queries: list[tuple[str, Any]]) -> None:
        self.records = records
        self.queries = queries

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return FakeCursor(self.records, self.queries)


@pytest.fixture
def poi_records() -> list[POI]:
    names = [
        "My Khe Beach",
        "Dragon Bridge",
        "Marble Mountains",
        "Imperial City Hue",
        "Thien Mu Pagoda",
    ]
    categories = ["beach", "attraction", "nature", "heritage", "heritage"]
    return [
        POI(
            id=poi_id,
            name=f"{names[(poi_id - 1) % len(names)]} {poi_id}",
            category=categories[(poi_id - 1) % len(categories)],
            description=None,
            latitude=16.0 + poi_id / 1000,
            longitude=108.0 + poi_id / 1000,
            address=None,
            city="Da Nang",
        )
        for poi_id in range(1, 26)
    ]


@pytest.fixture
def client(
    monkeypatch: pytest.MonkeyPatch, poi_records: list[POI]
) -> tuple[TestClient, list[tuple[str, Any]]]:
    queries: list[tuple[str, Any]] = []
    monkeypatch.setattr(
        repository,
        "get_connection",
        lambda: FakeConnection(poi_records, queries),
    )
    with TestClient(app) as test_client:
        yield test_client, queries


def test_list_pois_defaults_to_first_page_of_ten(
    client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    test_client, _ = client

    response = test_client.get("/pois")

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 10
    assert [item["id"] for item in data["items"]] == list(range(1, 11))
    assert data["pagination"] == {
        "page": 1,
        "limit": 10,
        "total": 25,
        "total_pages": 3,
        "has_next": True,
        "has_previous": False,
    }


def test_custom_page_and_limit_use_database_limit_offset(
    client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    test_client, queries = client

    response = test_client.get("/pois?page=2&limit=5")

    assert response.status_code == 200
    data = response.json()
    assert [item["id"] for item in data["items"]] == list(range(6, 11))
    assert len(data["items"]) <= 5
    assert data["pagination"] == {
        "page": 2,
        "limit": 5,
        "total": 25,
        "total_pages": 5,
        "has_next": True,
        "has_previous": True,
    }
    page_query, page_parameters = queries[0]
    assert "ORDER BY p.name ASC" in page_query
    assert "LIMIT %s OFFSET %s" in page_query
    assert page_parameters == (5, 5)
    assert "COUNT(*)" in queries[1][0]
    assert all(query.lstrip().upper().startswith("SELECT") for query, _ in queries)


def test_three_pages_return_expected_records_without_duplicates(
    client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    test_client, _ = client

    pages = [
        test_client.get(f"/pois?page={page}&limit=10").json()["items"]
        for page in (1, 2, 3)
    ]
    page_ids = [[item["id"] for item in page] for page in pages]

    assert page_ids == [list(range(1, 11)), list(range(11, 21)), list(range(21, 26))]
    assert len(set(page_ids[0] + page_ids[1] + page_ids[2])) == 25
    assert pages[0][0]["name"] == "My Khe Beach 1"


def test_exact_division_calculates_total_pages(
    client: tuple[TestClient, list[tuple[str, Any]]], poi_records: list[POI]
) -> None:
    test_client, _ = client
    del poi_records[20:]

    response = test_client.get("/pois?limit=10")

    assert response.status_code == 200
    assert response.json()["pagination"]["total"] == 20
    assert response.json()["pagination"]["total_pages"] == 2


def test_maximum_limit_is_valid(
    client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    test_client, queries = client

    response = test_client.get("/pois?limit=100")

    assert response.status_code == 200
    assert len(response.json()["items"]) == 25
    assert response.json()["pagination"]["limit"] == 100
    assert queries[0][1] == (100, 0)


@pytest.mark.parametrize(
    "query",
    ["?page=0", "?page=-1", "?limit=0", "?limit=-1", "?limit=101"],
)
def test_invalid_pagination_returns_422(
    client: tuple[TestClient, list[tuple[str, Any]]], query: str
) -> None:
    test_client, queries = client

    response = test_client.get(f"/pois{query}")

    assert response.status_code == 422
    assert queries == []


def test_empty_poi_list_returns_empty_page(
    client: tuple[TestClient, list[tuple[str, Any]]], poi_records: list[POI]
) -> None:
    test_client, _ = client
    poi_records.clear()

    response = test_client.get("/pois")

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "pagination": {
            "page": 1,
            "limit": 10,
            "total": 0,
            "total_pages": 0,
            "has_next": False,
            "has_previous": False,
        },
    }


def test_page_beyond_available_records_returns_empty_list(
    client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    test_client, _ = client

    response = test_client.get("/pois?page=100&limit=10")

    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["pagination"] == {
        "page": 100,
        "limit": 10,
        "total": 25,
        "total_pages": 3,
        "has_next": False,
        "has_previous": True,
    }


def test_consecutive_pages_have_stable_nonduplicated_ids(
    client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    test_client, _ = client

    first_page = test_client.get("/pois?page=1&limit=5").json()["items"]
    second_page = test_client.get("/pois?page=2&limit=5").json()["items"]
    first_ids = [item["id"] for item in first_page]
    second_ids = [item["id"] for item in second_page]

    assert first_ids == list(range(1, 6))
    assert second_ids == list(range(6, 11))
    assert set(first_ids).isdisjoint(second_ids)


def test_pois_route_and_pagination_constraints_are_in_openapi(
    client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    test_client, _ = client

    response = test_client.get("/openapi.json")

    assert response.status_code == 200
    operation = response.json()["paths"]["/pois"]["get"]
    parameters = {parameter["name"]: parameter["schema"] for parameter in operation["parameters"]}
    assert parameters["page"]["minimum"] == 1
    assert parameters["limit"]["minimum"] == 1
    assert parameters["limit"]["maximum"] == 100


def test_database_failure_does_not_expose_connection_details(
    client: tuple[TestClient, list[tuple[str, Any]]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_client, _ = client

    def unavailable_connection() -> None:
        raise RuntimeError("postgresql://user:secret@database")

    monkeypatch.setattr(repository, "get_connection", unavailable_connection)

    response = test_client.get("/pois")

    assert response.status_code == 503
    assert response.json() == {"detail": "Unable to fetch POIs."}
    assert "secret" not in response.text
    assert "database" not in response.text


def test_list_pois_resolves_city_and_category_aliases(
    client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    test_client, queries = client

    response = test_client.get("/pois?city=Đà Nẵng&category=di-tich")

    assert response.status_code == 200
    page_query, page_parameters = queries[0]
    count_query, count_parameters = queries[1]

    assert "c.name = ANY(%s)" in page_query
    assert "ci.code = %s" in page_query
    assert ["Di tích lịch sử và văn hóa"] in page_parameters
    assert "DANANG" in page_parameters

    assert "c.name = ANY(%s)" in count_query
    assert "ci.code = %s" in count_query
    assert ["Di tích lịch sử và văn hóa"] in count_parameters
    assert "DANANG" in count_parameters


def test_list_pois_ignores_all_filter_values(
    client: tuple[TestClient, list[tuple[str, Any]]],
) -> None:
    test_client, queries = client

    response = test_client.get("/pois?city=all&category=all")

    assert response.status_code == 200
    page_query, page_parameters = queries[0]

    assert "WHERE" not in page_query
    assert page_parameters == (10, 0)


def test_list_pois_returns_image_and_gallery_urls(
    client: tuple[TestClient, list[tuple[str, Any]]], poi_records: list[POI]
) -> None:
    test_client, _ = client
    # Set custom image_url and gallery_urls on the first record
    poi_records[0] = POI(
        id=1,
        name="My Khe Beach 1",
        category="beach",
        description="Famous beach",
        latitude=16.001,
        longitude=108.001,
        address="Vo Nguyen Giap",
        city="Da Nang",
        image_url="https://example.com/mykhe.jpg",
        gallery_urls=["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
    )

    response = test_client.get("/pois?limit=1")

    assert response.status_code == 200
    first_item = response.json()["items"][0]
    assert first_item["image_url"] == "https://example.com/mykhe.jpg"
    assert first_item["gallery_urls"] == [
        "https://example.com/img1.jpg",
        "https://example.com/img2.jpg",
    ]


def test_list_pois_returns_v2_taxonomy_fields(
    client: tuple[TestClient, list[tuple[str, Any]]], poi_records: list[POI]
) -> None:
    test_client, _ = client
    poi_records[0] = POI(
        id=1,
        name="Pizza 4P's Hoang Van Thu",
        category="food",
        description="Wood-fired artisanal pizza",
        latitude=16.066,
        longitude=108.222,
        address="8 Hoang Van Thu",
        city="Da Nang",
        image_url="https://example.com/pizza4ps.jpg",
        gallery_urls=["https://example.com/pizza1.jpg"],
        sub_category="western_international",
        cuisine="italian_pizza",
        budget_tier="$$$",
        vibes=["Hẹn hò", "Hiện đại"],
        best_time=["evening", "night"],
        eco_features=["Zero-waste", "Farm-to-table"],
        ai_metadata={
            "dna_tags": ["wood_fired_pizza", "artisan_cheese"],
            "noise_pace": "chill_slow",
            "rainy_day_friendly": True,
        },
    )

    response = test_client.get("/pois?limit=1")

    assert response.status_code == 200
    first_item = response.json()["items"][0]
    assert first_item["sub_category"] == "western_international"
    assert first_item["cuisine"] == "italian_pizza"
    assert first_item["budget_tier"] == "$$$"
    assert first_item["vibes"] == ["Hẹn hò", "Hiện đại"]
    assert first_item["best_time"] == ["evening", "night"]
    assert first_item["eco_features"] == ["Zero-waste", "Farm-to-table"]
    assert first_item["ai_metadata"]["dna_tags"] == ["wood_fired_pizza", "artisan_cheese"]
    assert first_item["ai_metadata"]["rainy_day_friendly"] is True
