from pathlib import Path
import sys
from uuid import UUID

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user_id
from app.main import app
from app.saved_places import router as saved_places_router


USER_ID = "11111111-1111-4111-8111-111111111111"
POI_ID = "22222222-2222-4222-8222-222222222222"


def test_saved_places_requires_an_authenticated_account() -> None:
    with TestClient(app) as client:
        response = client.get("/saved-places")
    assert response.status_code == 401


def test_saved_place_routes_scope_reads_and_writes_to_current_user(monkeypatch) -> None:
    calls: list[tuple[str, UUID, UUID | None]] = []
    app.dependency_overrides[get_current_user_id] = lambda: USER_ID
    monkeypatch.setattr(
        saved_places_router,
        "get_saved_places",
        lambda user_id, collection_id=None: calls.append(("list", user_id, collection_id)) or [],
    )
    monkeypatch.setattr(
        saved_places_router,
        "add_saved_place",
        lambda user_id, poi_id: calls.append(("save", user_id, poi_id)) or True,
    )
    monkeypatch.setattr(
        saved_places_router,
        "delete_saved_place",
        lambda user_id, poi_id: calls.append(("remove", user_id, poi_id)) or True,
    )

    try:
        with TestClient(app) as client:
            listed = client.get("/saved-places")
            saved = client.post("/saved-places", json={"poi_id": POI_ID})
            removed = client.delete(f"/saved-places/{POI_ID}")
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)

    assert listed.status_code == 200
    assert listed.json() == {"items": []}
    assert saved.status_code == 200
    assert saved.json() == {"poi_id": POI_ID, "saved": True, "changed": True}
    assert removed.status_code == 200
    assert removed.json() == {"poi_id": POI_ID, "saved": False, "changed": True}
    assert calls == [
        ("list", UUID(USER_ID), None),
        ("save", UUID(USER_ID), UUID(POI_ID)),
        ("remove", UUID(USER_ID), UUID(POI_ID)),
    ]
