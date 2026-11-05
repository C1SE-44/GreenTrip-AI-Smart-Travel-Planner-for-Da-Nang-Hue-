import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from neo4j import READ_ACCESS


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app
from app.pois import explanation_repository, explanation_service, router
from app.pois.explanation_service import ExplanationServiceUnavailable
from app.pois.schemas import POIExplanationFactsResponse


POI_ID = "12345"


def response_payload(facts: list[dict[str, Any]]) -> POIExplanationFactsResponse:
    return POIExplanationFactsResponse.model_validate(
        {
            "poi": {
                "id": str(POI_ID),
                "name": "Sample Heritage Site",
                "is_local_business": False,
                "local_business_type": None,
                "source": "curated",
            },
            "facts": facts,
        }
    )


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_existing_poi_returns_structured_multiple_facts(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    facts = [
        {
            "relationship": "IN_CATEGORY",
            "target_type": "Category",
            "target_key": "heritage",
            "target_name": "Heritage",
        },
        {
            "relationship": "OFFERS_ACTIVITY",
            "target_type": "Activity",
            "target_key": "sightseeing",
            "target_name": "Sightseeing",
        },
        {
            "relationship": "LOCATED_IN",
            "target_type": "Location",
            "target_key": "HUE",
            "target_name": "Hue",
        },
    ]
    requested_ids: list[str] = []

    def fake_service(poi_id: str) -> POIExplanationFactsResponse:
        requested_ids.append(poi_id)
        return response_payload(facts)

    monkeypatch.setattr(router, "get_poi_explanation_facts", fake_service)

    response = client.get(f"/pois/{POI_ID}/explanation-facts")

    assert response.status_code == 200
    assert requested_ids == [POI_ID]
    assert response.json()["poi"]["id"] == str(POI_ID)
    assert response.json()["facts"] == facts
    assert "element_id" not in response.text.lower()


def test_existing_poi_without_facts_returns_200(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        router,
        "get_poi_explanation_facts",
        lambda _poi_id: response_payload([]),
    )

    response = client.get(f"/pois/{POI_ID}/explanation-facts")

    assert response.status_code == 200
    assert response.json()["facts"] == []


def test_missing_poi_returns_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(router, "get_poi_explanation_facts", lambda _poi_id: None)

    response = client.get(f"/pois/{POI_ID}/explanation-facts")

    assert response.status_code == 404
    assert response.json() == {"detail": "POI not found"}


def test_neo4j_failure_returns_safe_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unavailable(_poi_id: str) -> None:
        raise ExplanationServiceUnavailable("sensitive driver details")

    monkeypatch.setattr(router, "get_poi_explanation_facts", unavailable)

    response = client.get(f"/pois/{POI_ID}/explanation-facts")

    assert response.status_code == 503
    assert response.json() == {"detail": "Knowledge Graph service is unavailable"}
    assert "secret" not in response.text
    assert "neo4j" not in response.text.lower()


def test_numeric_poi_id_is_passed_through_to_service(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    requested_ids: list[str] = []

    def fake_service(poi_id: str) -> POIExplanationFactsResponse:
        requested_ids.append(poi_id)
        return response_payload([])

    monkeypatch.setattr(router, "get_poi_explanation_facts", fake_service)

    response = client.get(f"/pois/{POI_ID}/explanation-facts")

    assert response.status_code == 200
    assert requested_ids == [POI_ID]


def test_service_removes_duplicate_facts_in_existing_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    category = {
        "relationship": "IN_CATEGORY",
        "target_type": "Category",
        "target_key": "heritage",
        "target_name": "Heritage",
    }
    location = {
        "relationship": "LOCATED_IN",
        "target_type": "Location",
        "target_key": "HUE",
        "target_name": "Hue",
    }
    monkeypatch.setattr(
        explanation_repository,
        "fetch_poi_explanation_facts",
        lambda _poi_id: {
            "poi": {"id": str(POI_ID), "name": "Sample"},
            "facts": [category, category, location],
        },
    )

    result = explanation_service.get_poi_explanation_facts(POI_ID)

    assert result is not None
    assert [fact.target_key for fact in result.facts] == ["heritage", "HUE"]


class FakeRecord(dict[str, Any]):
    pass


class FakeResult:
    def __init__(self, record: FakeRecord | None) -> None:
        self.record = record

    def single(self) -> FakeRecord | None:
        return self.record


class FakeSession:
    def __init__(self, record: FakeRecord) -> None:
        self.record = record
        self.query = ""
        self.parameters: dict[str, Any] = {}

    def __enter__(self) -> "FakeSession":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def run(self, query: str, **parameters: Any) -> FakeResult:
        self.query = query
        self.parameters = parameters
        return FakeResult(self.record)


class FakeDriver:
    def __init__(self, session: FakeSession) -> None:
        self.fake_session = session
        self.session_arguments: dict[str, Any] = {}

    def session(self, **arguments: Any) -> FakeSession:
        self.session_arguments = arguments
        return self.fake_session


def test_repository_reuses_existing_query_once_with_stable_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = FakeSession(
        FakeRecord(
            poi={"id": str(POI_ID), "name": "Sample"},
            facts=[],
        )
    )
    driver = FakeDriver(session)
    monkeypatch.setattr(explanation_repository, "get_driver", lambda: driver)

    result = explanation_repository.fetch_poi_explanation_facts(str(POI_ID))

    assert result is not None
    assert session.query == explanation_repository.EXPLANATION_QUERY
    assert session.parameters == {"poi_id": str(POI_ID)}
    assert driver.session_arguments["default_access_mode"] == READ_ACCESS


def test_endpoint_is_public_and_documented_in_openapi(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    operation = response.json()["paths"]["/pois/{poi_id}/explanation-facts"]["get"]
    assert operation["summary"] == "Return POI explanation facts"
    assert operation.get("security") in (None, [])
    assert operation["parameters"][0]["schema"]["type"] == "string"
    assert "format" not in operation["parameters"][0]["schema"]
    assert "200" in operation["responses"]
    assert "POIExplanationFactsResponse" in response.text
