from datetime import datetime, timezone
from dataclasses import replace
from pathlib import Path
import sys
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth.service import create_access_token
from app.config import get_settings
from app.main import app
from app.pois.model import POI


class SavedPlacesDatabase:
    def __init__(self) -> None:
        self.pois: dict[UUID, POI] = {}
        self.default_collections: dict[UUID, UUID] = {}
        self.collections: dict[tuple[UUID, UUID], bool] = {}
        self.memberships: dict[tuple[UUID, UUID, UUID], datetime] = {}

    def connect(self) -> "SavedPlacesConnection":
        return SavedPlacesConnection(self)


class SavedPlacesConnection:
    def __init__(self, database: SavedPlacesDatabase) -> None:
        self.database = database

    def __enter__(self) -> "SavedPlacesConnection":
        return self

    def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        return None

    def cursor(self) -> "SavedPlacesCursor":
        return SavedPlacesCursor(self.database)

    def commit(self) -> None:
        return None


class SavedPlacesCursor:
    def __init__(self, database: SavedPlacesDatabase) -> None:
        self.database = database
        self.rows: list[tuple[Any, ...]] = []

    def __enter__(self) -> "SavedPlacesCursor":
        return self

    def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        return None

    def execute(self, query: str, parameters: tuple[Any, ...] | None = None) -> None:
        params = parameters or ()
        if "WITH saved AS" in query:
            user_id = UUID(str(params[0]))
            collection_id = UUID(str(params[1])) if params[1] else None
            selected: dict[UUID, datetime] = {}
            for (saved_user_id, saved_collection_id, poi_id), created_at in self.database.memberships.items():
                if saved_user_id != user_id or (collection_id and saved_collection_id != collection_id):
                    continue
                selected[poi_id] = min(selected.get(poi_id, created_at), created_at)
            self.rows = []
            for poi_id, created_at in selected.items():
                saved_count = len({
                    saved_user_id
                    for saved_user_id, _collection_id, saved_poi_id in self.database.memberships
                    if saved_poi_id == poi_id
                })
                poi = replace(self.database.pois[poi_id], saved_count=saved_count)
                self.rows.append(
                    tuple(getattr(poi, field) for field in POI.__dataclass_fields__)
                    + (created_at,)
                )
        elif "INSERT INTO public.saved_place_collections" in query:
            user_id = UUID(str(params[0]))
            collection_id = self.database.default_collections.get(user_id)
            if collection_id is None:
                collection_id = uuid4()
                self.database.default_collections[user_id] = collection_id
                self.database.collections[(user_id, collection_id)] = True
                self.rows = [(collection_id,)]
            else:
                self.rows = []
        elif query.lstrip().startswith("SELECT collection_id") and "is_default" in query:
            user_id = UUID(str(params[0]))
            collection_id = self.database.default_collections.get(user_id)
            self.rows = [(collection_id,)] if collection_id else []
        elif "SELECT poi_id FROM public.pois" in query:
            poi_id = UUID(str(params[0]))
            self.rows = [(poi_id,)] if poi_id in self.database.pois else []
        elif query.lstrip().startswith("INSERT INTO public.saved_place_collection_items"):
            user_id = UUID(str(params[0]))
            collection_id = UUID(str(params[1]))
            poi_id = UUID(str(params[2]))
            key = (user_id, collection_id, poi_id)
            inserted = poi_id in self.database.pois and key not in self.database.memberships
            if inserted:
                self.database.memberships[key] = datetime.now(timezone.utc)
                self.rows = [(poi_id,)]
            else:
                self.rows = []
        elif query.lstrip().startswith("DELETE FROM public.saved_place_collection_items"):
            user_id = UUID(str(params[0]))
            poi_id = UUID(str(params[1]))
            matches = [key for key in self.database.memberships if key[0] == user_id and key[2] == poi_id]
            for key in matches:
                del self.database.memberships[key]
            self.rows = [(poi_id,)] if matches else []
        else:
            raise AssertionError(f"Unexpected saved places query: {query}")

    def fetchone(self) -> tuple[Any, ...] | None:
        return self.rows[0] if self.rows else None

    def fetchall(self) -> list[tuple[Any, ...]]:
        return self.rows


@pytest.fixture
def saved_places_client(monkeypatch: pytest.MonkeyPatch) -> tuple[TestClient, SavedPlacesDatabase]:
    monkeypatch.setenv("JWT_SECRET_KEY", "saved-places-test-secret")
    monkeypatch.setenv("JWT_ALGORITHM", "HS256")
    get_settings.cache_clear()
    database = SavedPlacesDatabase()
    poi_id = UUID("11111111-1111-4111-8111-111111111111")
    database.pois[poi_id] = POI(
        id=str(poi_id),
        name="Cầu Rồng",
        category="Di tích lịch sử và văn hóa",
        description="Cầu nổi tiếng tại Đà Nẵng.",
        latitude=16.061,
        longitude=108.227,
        address="Đà Nẵng",
        city="Da Nang",
        image_url="https://example.test/dragon-bridge.jpg",
        satisfaction_score=4.7,
    )

    from app.saved_places import repository

    monkeypatch.setattr(repository, "get_connection", database.connect)
    with TestClient(app) as client:
        yield client, database
    get_settings.cache_clear()


def auth_header(user_id: UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user_id))}"}


def test_authenticated_user_saves_valid_poi_idempotently_and_gets_full_poi(
    saved_places_client: tuple[TestClient, SavedPlacesDatabase],
) -> None:
    client, database = saved_places_client
    user_id = uuid4()
    poi_id = UUID("11111111-1111-4111-8111-111111111111")
    headers = auth_header(user_id)

    first = client.post("/saved-places", json={"poi_id": str(poi_id)}, headers=headers)
    second = client.post("/saved-places", json={"poi_id": str(poi_id)}, headers=headers)

    assert first.status_code == 200
    assert first.json() == {"poi_id": str(poi_id), "saved": True, "changed": True}
    assert second.status_code == 200
    assert second.json() == {"poi_id": str(poi_id), "saved": True, "changed": False}
    default_collection_id = database.default_collections[user_id]
    assert (user_id, default_collection_id, poi_id) in database.memberships
    assert len(database.memberships) == 1

    response = client.get("/saved-places", headers=headers)
    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["id"] == str(poi_id)
    assert response.json()["items"][0]["name"] == "Cầu Rồng"
    assert response.json()["items"][0]["city"] == "Da Nang"
    assert response.json()["items"][0]["saved_at"]


def test_saved_places_are_scoped_to_verified_user(
    saved_places_client: tuple[TestClient, SavedPlacesDatabase],
) -> None:
    client, database = saved_places_client
    owner_id, other_id = uuid4(), uuid4()
    poi_id = UUID("11111111-1111-4111-8111-111111111111")
    database.memberships[(owner_id, uuid4(), poi_id)] = datetime.now(timezone.utc)

    owner_items = client.get("/saved-places", headers=auth_header(owner_id)).json()["items"]
    other_items = client.get("/saved-places", headers=auth_header(other_id)).json()["items"]
    other_delete = client.delete(f"/saved-places/{poi_id}", headers=auth_header(other_id))

    assert [item["id"] for item in owner_items] == [str(poi_id)]
    assert other_items == []
    assert other_delete.status_code == 200
    assert other_delete.json()["changed"] is False
    assert any(item[0] == owner_id and item[2] == poi_id for item in database.memberships)


def test_saved_count_counts_users_once_across_multiple_collections(
    saved_places_client: tuple[TestClient, SavedPlacesDatabase],
) -> None:
    client, database = saved_places_client
    owner_id, second_user_id = uuid4(), uuid4()
    poi_id = UUID("11111111-1111-4111-8111-111111111111")
    now = datetime.now(timezone.utc)
    database.memberships[(owner_id, uuid4(), poi_id)] = now
    database.memberships[(owner_id, uuid4(), poi_id)] = now
    database.memberships[(second_user_id, uuid4(), poi_id)] = now

    response = client.get("/saved-places", headers=auth_header(owner_id))

    assert response.status_code == 200
    assert response.json()["items"][0]["saved_count"] == 2


def test_request_body_cannot_choose_another_account(
    saved_places_client: tuple[TestClient, SavedPlacesDatabase],
) -> None:
    client, _database = saved_places_client
    owner_id, requested_user_id = uuid4(), uuid4()
    poi_id = UUID("11111111-1111-4111-8111-111111111111")

    response = client.post(
        "/saved-places",
        json={"poi_id": str(poi_id), "user_id": str(requested_user_id)},
        headers=auth_header(owner_id),
    )

    assert response.status_code == 200
    assert client.get("/saved-places", headers=auth_header(owner_id)).json()["items"]
    assert client.get("/saved-places", headers=auth_header(requested_user_id)).json()["items"] == []


def test_authenticated_user_can_remove_place_and_repeated_remove_is_safe(
    saved_places_client: tuple[TestClient, SavedPlacesDatabase],
) -> None:
    client, database = saved_places_client
    user_id = uuid4()
    poi_id = UUID("11111111-1111-4111-8111-111111111111")
    collection_id = uuid4()
    database.memberships[(user_id, collection_id, poi_id)] = datetime.now(timezone.utc)
    headers = auth_header(user_id)

    first = client.delete(f"/saved-places/{poi_id}", headers=headers)
    second = client.delete(f"/saved-places/{poi_id}", headers=headers)

    assert first.status_code == 200
    assert first.json() == {"poi_id": str(poi_id), "saved": False, "changed": True}
    assert second.status_code == 200
    assert second.json() == {"poi_id": str(poi_id), "saved": False, "changed": False}


def test_saved_places_endpoints_reject_unauthenticated_requests(
    saved_places_client: tuple[TestClient, SavedPlacesDatabase],
) -> None:
    client, _database = saved_places_client

    assert client.get("/saved-places").status_code == 401
    assert client.post(
        "/saved-places", json={"poi_id": "11111111-1111-4111-8111-111111111111"}
    ).status_code == 401
    assert client.delete(
        "/saved-places/11111111-1111-4111-8111-111111111111"
    ).status_code == 401


def test_invalid_and_unknown_poi_ids_are_handled(
    saved_places_client: tuple[TestClient, SavedPlacesDatabase],
) -> None:
    client, _database = saved_places_client
    headers = auth_header(uuid4())

    invalid = client.post("/saved-places", json={"poi_id": "not-a-uuid"}, headers=headers)
    unknown = client.post(
        "/saved-places",
        json={"poi_id": "22222222-2222-4222-8222-222222222222"},
        headers=headers,
    )

    assert invalid.status_code == 422
    assert unknown.status_code == 404
