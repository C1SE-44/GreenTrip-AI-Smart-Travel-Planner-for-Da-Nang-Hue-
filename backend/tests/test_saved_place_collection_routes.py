from datetime import datetime, timezone
from pathlib import Path
import sys
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth.service import create_access_token
from app.config import get_settings
from app.main import app
from app.saved_places import router as saved_places_router
from app.saved_places.collections_repository import CollectionNotFoundError, DefaultCollectionError
from app.saved_places.schemas import SavedPlaceCollection


@pytest.fixture
def collection_route_client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "saved-places-collection-test-secret")
    monkeypatch.setenv("JWT_ALGORITHM", "HS256")
    get_settings.cache_clear()
    with TestClient(app) as client:
        yield client
    get_settings.cache_clear()


def _headers(user_id: UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user_id))}"}


def test_collection_listing_requires_authentication(collection_route_client: TestClient) -> None:
    assert collection_route_client.get("/saved-places/collections").status_code == 401


def test_collection_listing_uses_only_verified_user_id(
    collection_route_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id, poi_id = uuid4(), uuid4()
    seen: list[tuple[UUID, UUID | None]] = []
    monkeypatch.setattr(
        saved_places_router,
        "get_saved_place_collections",
        lambda account_id, selected_poi: seen.append((account_id, selected_poi)) or [],
    )

    response = collection_route_client.get(
        f"/saved-places/collections?poi_id={poi_id}", headers=_headers(user_id)
    )

    assert response.status_code == 200
    assert response.json() == {"items": []}
    assert seen == [(user_id, poi_id)]


def test_collection_creation_ignores_frontend_user_id(
    collection_route_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id, attacker_id, collection_id = uuid4(), uuid4(), uuid4()
    seen: list[tuple[UUID, str]] = []
    monkeypatch.setattr(
        saved_places_router,
        "create_saved_place_collection",
        lambda account_id, name: seen.append((account_id, name)) or collection_id,
    )

    response = collection_route_client.post(
        "/saved-places/collections",
        json={"name": "Muốn ghé", "user_id": str(attacker_id)},
        headers=_headers(user_id),
    )

    assert response.status_code == 201
    assert response.json() == {"collection_id": str(collection_id), "changed": True}
    assert seen == [(user_id, "Muốn ghé")]


def test_collection_membership_keeps_saved_state_until_last_membership(
    collection_route_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner_id, collection_id, poi_id = uuid4(), uuid4(), uuid4()
    results = iter([(True, True), (True, False)])
    monkeypatch.setattr(
        saved_places_router,
        "remove_place_from_collection",
        lambda *_args: next(results),
    )

    still_saved = collection_route_client.delete(
        f"/saved-places/collections/{collection_id}/places/{poi_id}",
        headers=_headers(owner_id),
    )
    removed = collection_route_client.delete(
        f"/saved-places/collections/{collection_id}/places/{poi_id}",
        headers=_headers(owner_id),
    )

    assert still_saved.json() == {
        "collection_id": str(collection_id), "poi_id": str(poi_id), "saved": True, "changed": True,
    }
    assert removed.json()["saved"] is False


def test_default_collection_cannot_be_deleted_and_foreign_collection_is_hidden(
    collection_route_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner_id, other_user_id, collection_id = uuid4(), uuid4(), uuid4()

    def reject_default(*_args):
        raise DefaultCollectionError

    monkeypatch.setattr(saved_places_router, "delete_saved_place_collection", reject_default)
    forbidden = collection_route_client.delete(
        f"/saved-places/collections/{collection_id}", headers=_headers(owner_id)
    )
    assert forbidden.status_code == 409

    monkeypatch.setattr(
        saved_places_router,
        "add_place_to_collection",
        lambda *_args: (_ for _ in ()).throw(CollectionNotFoundError()),
    )
    foreign = collection_route_client.post(
        f"/saved-places/collections/{collection_id}/places/{uuid4()}",
        headers=_headers(other_user_id),
    )
    assert foreign.status_code == 404


def test_collection_response_schema_includes_counts_and_membership() -> None:
    item = SavedPlaceCollection(
        collection_id=uuid4(),
        name="Địa điểm của tôi",
        is_default=True,
        created_at=datetime.now(timezone.utc),
        place_count=2,
        cover_images=["https://example.test/place.jpg"],
        contains_poi=True,
    )
    assert item.place_count == 2
    assert item.contains_poi is True
