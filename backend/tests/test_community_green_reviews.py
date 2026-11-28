import json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.assistant import workspaces, planning
from app.assistant.schemas import Context
from app.auth.dependencies import get_current_user_id
from app.community_green.router import router as community_green_router
from app.db.postgres import SQLiteConnectionWrapper
from app.trips.schemas import TripItinerarySyncRequest


@pytest.fixture
def env(monkeypatch, tmp_path):
    from app.assistant import store

    monkeypatch.setattr(store, "PATH", tmp_path / "assistant_sessions.db")
    store.initialize_store()
    workspaces.initialize_store()


@pytest.fixture
def local_repository(monkeypatch, tmp_path):
    import sqlite3
    from contextlib import contextmanager

    from app.trips import itinerary_repository
    from app.trips.itinerary_repository import _ensure_local_tables

    @contextmanager
    def connection():
        database = sqlite3.connect(tmp_path / "itineraries.db", timeout=10)
        with SQLiteConnectionWrapper(database) as wrapped:
            yield wrapped

    monkeypatch.setattr(itinerary_repository, "get_connection", connection)
    with connection() as database:
        with database.cursor() as cursor:
            _ensure_local_tables(database, cursor)
        database.commit()
    return itinerary_repository


@pytest.fixture
def community_client(env, local_repository, monkeypatch, tmp_path):
    import sqlite3
    from contextlib import contextmanager

    from app.community_green import repository as review_repository
    from app.community_green import service

    monkeypatch.setattr(workspaces, "get_connection", local_repository.get_connection)
    workspaces.initialize_store()
    @contextmanager
    def review_connection():
        database = sqlite3.connect(tmp_path / "community_reviews.db", timeout=10)
        with SQLiteConnectionWrapper(database) as wrapped:
            yield wrapped

    monkeypatch.setattr(review_repository, "get_connection", review_connection)
    with review_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """CREATE TABLE IF NOT EXISTS poi_environmental_reviews (
                       review_id TEXT PRIMARY KEY,
                       user_id TEXT NOT NULL,
                       poi_id TEXT NOT NULL,
                       trip_id TEXT NOT NULL,
                       visit_reference TEXT NOT NULL,
                       visit_verification_type TEXT NOT NULL,
                       cleanliness_waste INTEGER,
                       single_use_plastic INTEGER,
                       ecosystem_protection INTEGER,
                       responsible_management INTEGER,
                       comment TEXT,
                       review_version INTEGER NOT NULL DEFAULT 1,
                       created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                       updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                       UNIQUE(user_id, poi_id)
                   )"""
            )
            cursor.execute("DELETE FROM poi_environmental_reviews")
        connection.commit()

    monkeypatch.setattr(
        service,
        "get_poi_identity_status",
        lambda _poi_id: {"is_active": True, "status": "ACTIVE"},
    )
    app = FastAPI()
    app.include_router(community_green_router)
    app.dependency_overrides[get_current_user_id] = lambda: "alice"
    return TestClient(app), local_repository


def _seed_visited_trip(repository, trip_id="trip-review", status="VISITED", poi_id="poi-live"):
    plan = planning.empty_itinerary(
        trip_id, Context(destination="Huáº¿", days_count=1, start_date="2026-12-01")
    )
    plan["days"][0]["stops"] = [{
        "stop_id": "visit-stop",
        "poi_id": poi_id,
        "title": "Live POI",
        "city": "Huáº¿",
        "stop_type": "poi",
        "source": "idea",
        "sequence": 0,
        "duration_minutes": 60,
    }]
    repository.save_itinerary(TripItinerarySyncRequest.model_validate(plan), "alice")
    progress = {
        "version": 1,
        "stops": [{
            "stopId": "visit-stop", "poiId": poi_id, "name": "Live POI",
            "status": status, "statusUpdatedAt": "2026-11-23T10:00:00+07:00",
        }],
        "movements": [],
    }
    data = {"id": trip_id, "title": "Review trip", "destination": "Huáº¿", "actualProgress": progress}
    with workspaces.connection() as connection:
        connection.execute(
            "INSERT OR REPLACE INTO trip_workspaces(trip_id,user_id,data,revision,deleted) VALUES(?,?,?,?,0)",
            (trip_id, "alice", json.dumps(data, ensure_ascii=False), 1),
        )


def test_review_requires_auth_self_reported_visited_stop_and_owned_trip(community_client):
    api, _repository = community_client
    payload = {
        "trip_id": "trip-review", "stop_id": "visit-stop",
        "cleanliness_waste": 4,
    }
    assert api.get("/pois/poi-live/community-green-rating").status_code == 200
    response = api.put("/pois/poi-live/community-green-review", json=payload, headers={"Authorization": "Bearer test"})
    assert response.status_code == 404  # no saved Workspace/itinerary visit exists


def test_own_review_endpoint_requires_authentication(community_client):
    _api, _repository = community_client
    app = FastAPI()
    app.include_router(community_green_router)
    anonymous = TestClient(app)
    assert anonymous.get("/pois/poi-live/community-green-review").status_code == 401
    assert anonymous.put("/pois/poi-live/community-green-review", json={}).status_code == 401


def test_reviews_are_idempotent_editable_and_aggregate_na_without_zero(community_client):
    api, repository = community_client
    _seed_visited_trip(repository)
    headers = {"Authorization": "Bearer test"}
    url = "/pois/poi-live/community-green-review"
    body = {
        "trip_id": "trip-review", "stop_id": "visit-stop",
        "cleanliness_waste": 5, "single_use_plastic": None,
        "ecosystem_protection": 3, "responsible_management": 4,
        "comment": "  Khu vực sạch, thùng rác được bố trí tốt.  ",
    }
    created = api.put(url, json=body, headers=headers)
    assert created.status_code == 200, created.text
    first = created.json()["review"]
    assert first["visit_verification_type"] == "SELF_REPORTED_VISIT"
    assert first["review_version"] == 1
    assert first["comment"] == "Khu vực sạch, thùng rác được bố trí tốt."
    assert created.json()["aggregate"]["community_green_score"] == 4.0
    assert created.json()["aggregate"]["review_count"] == 1
    assert created.json()["aggregate"]["criterion_review_counts"]["single_use_plastic"] == 0

    replay = api.put(url, json=body, headers=headers)
    assert replay.status_code == 200
    assert replay.json()["review"]["review_id"] == first["review_id"]
    assert replay.json()["review"]["review_version"] == 1

    edited_body = {**body, "cleanliness_waste": 1, "expected_version": 1}
    edited = api.put(url, json=edited_body, headers=headers)
    assert edited.status_code == 200
    assert edited.json()["review"]["review_version"] == 2
    assert edited.json()["aggregate"]["community_green_score"] == 2.67
    stale_edit = api.put(url, json={**edited_body, "expected_version": 1}, headers=headers)
    assert stale_edit.status_code == 409

    all_na = api.put(
        "/pois/poi-live/community-green-review",
        json={"trip_id": "trip-review", "stop_id": "visit-stop"},
        headers={"Authorization": "Bearer test"},
    )
    assert all_na.status_code == 409  # editing requires the fetched current version
    current = api.get(url, headers=headers).json()["review"]
    all_na = api.put(
        "/pois/poi-live/community-green-review",
        json={"trip_id": "trip-review", "stop_id": "visit-stop", "expected_version": current["review_version"]},
        headers=headers,
    )
    assert all_na.status_code == 200
    assert all_na.json()["aggregate"]["community_green_score"] is None
    assert all_na.json()["aggregate"]["review_count"] == 0
    assert all_na.json()["aggregate"]["feedback_count"] == 1
    assert "Ch\u01b0a c\u00f3" in all_na.json()["aggregate"]["sample_note"]


def test_review_validation_inactive_poi_and_visit_mismatch(community_client, monkeypatch):
    api, repository = community_client
    _seed_visited_trip(repository, status="PLANNED")
    headers = {"Authorization": "Bearer test"}
    url = "/pois/poi-live/community-green-review"
    base = {"trip_id": "trip-review", "stop_id": "visit-stop", "cleanliness_waste": 5}
    assert api.put(url, json=base, headers=headers).status_code == 403
    assert api.put(url, json={**base, "cleanliness_waste": 0}, headers=headers).status_code == 422
    assert api.put(url, json={**base, "comment": "x" * 501}, headers=headers).status_code == 422

    from app.community_green import service
    monkeypatch.setattr(
        service,
        "get_poi_identity_status",
        lambda _poi_id: {"is_active": False, "status": "INACTIVE"},
    )
    assert api.get("/pois/poi-live/community-green-rating").status_code == 404


def test_minimal_poi_identity_lookup_does_not_require_geometry(tmp_path, monkeypatch):
    import sqlite3

    from app.db.postgres import SQLiteConnectionWrapper
    from app.pois import repository as poi_repository

    raw = sqlite3.connect(tmp_path / "poi-identity.sqlite3")
    raw.execute(
        "CREATE TABLE pois (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER, status TEXT)"
    )
    raw.execute("INSERT INTO pois (id, name, is_active, status) VALUES (42, 'Identity fixture', 1, 'ACTIVE')")
    raw.execute("INSERT INTO pois (id, name, is_active, status) VALUES (43, 'Inactive fixture', 0, 'INACTIVE')")
    raw.commit()
    raw.close()
    monkeypatch.setattr(
        poi_repository,
        "get_connection",
        lambda: SQLiteConnectionWrapper(sqlite3.connect(tmp_path / "poi-identity.sqlite3")),
    )

    assert poi_repository.get_poi_identity("42") == {"is_active": True, "status": "ACTIVE"}
    assert poi_repository.get_poi_identity("43") == {"is_active": False, "status": "INACTIVE"}
    assert poi_repository.get_poi_identity("404") is None


def test_minimal_poi_identity_query_failure_remains_a_service_error(community_client, monkeypatch):
    from app.community_green import service
    from app.pois.service import POIServiceUnavailable

    api, _repository = community_client

    def fail(_poi_id):
        raise POIServiceUnavailable

    monkeypatch.setattr(service, "get_poi_identity_status", fail)
    response = api.get("/pois/poi-live/community-green-rating")
    assert response.status_code == 503


def test_community_green_keeps_poi_existence_check(community_client, monkeypatch):
    from app.community_green import service

    api, _repository = community_client
    monkeypatch.setattr(service, "get_poi_identity_status", lambda _poi_id: None)

    response = api.get("/pois/missing-poi/community-green-rating")

    assert response.status_code == 404
