import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from neo4j import READ_ACCESS


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.pois import explanation_repository, explanation_service, router
from app.pois.explanation_service import ExplanationServiceUnavailable
from app.pois.schemas import POIExplanationFactsResponse


POI_ID = "12345"


def response_payload(
    facts: list[dict[str, Any]],
    fact_source: str | None = None,
) -> POIExplanationFactsResponse:
    return POIExplanationFactsResponse.model_validate(
        {
            "poi": {
                "id": str(POI_ID),
                "name": "Sample Heritage Site",
                "is_local_business": False,
                "local_business_type": None,
                "source": None,
            },
            "facts": facts,
            "fact_source": fact_source,
        }
    )


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    # Keep endpoint tests isolated from the application's resource lifecycle.
    test_app = FastAPI()
    test_app.include_router(router.router)

    class MemoryOnlyCache:
        def build_pois_cache_key(self, prefix: str, params: dict[str, Any]) -> str:
            return f"{prefix}:{params}"

        def get_json(self, _key: str) -> None:
            return None

        def set_json(self, *_args: Any, **_kwargs: Any) -> None:
            return None

    monkeypatch.setattr(router, "poi_cache", MemoryOnlyCache())
    with TestClient(test_app) as test_client:
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


def test_repository_unavailable_returns_503_not_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unavailable(_poi_id: str) -> None:
        raise explanation_repository.ExplanationRepositoryUnavailable

    monkeypatch.setattr(
        explanation_repository,
        "fetch_poi_explanation_facts",
        unavailable,
    )

    response = client.get(f"/pois/{POI_ID}/explanation-facts")

    assert response.status_code == 503
    assert response.json() == {"detail": "Explanation data is temporarily unavailable"}


def test_fallback_source_is_preserved_in_http_response(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        router,
        "get_poi_explanation_facts",
        lambda _poi_id: response_payload([], "POSTGRESQL_FALLBACK"),
    )

    response = client.get(f"/pois/{POI_ID}/explanation-facts")

    assert response.status_code == 200
    assert response.json()["fact_source"] == "POSTGRESQL_FALLBACK"
    assert response.json()["poi"]["source"] is None


def test_neo4j_outage_with_postgres_fallback_returns_http_200(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = explanation_repository._build_facts_payload(
        poi_id=POI_ID,
        name="Sample Heritage Site",
        is_local=False,
        btype=None,
        category_key="historical_culture",
        cat_name="Heritage",
        city_name="Hue",
        city_code="HUE",
        fact_source="POSTGRESQL_FALLBACK",
    )
    monkeypatch.setattr(
        explanation_repository,
        "_fetch_from_relational_db",
        lambda _poi_id: explanation_repository._RelationalLookup("found", payload),
    )

    def fail_driver() -> None:
        raise OSError("Neo4j is unavailable")

    monkeypatch.setattr(explanation_repository, "get_driver", fail_driver)

    response = client.get(f"/pois/{POI_ID}/explanation-facts")

    assert response.status_code == 200
    assert response.json()["fact_source"] == "POSTGRESQL_FALLBACK"
    assert {fact["relationship"] for fact in response.json()["facts"]} == {"IN_CATEGORY", "LOCATED_IN"}


def test_unavailable_graph_row_uses_postgres_to_confirm_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(explanation_repository, "get_driver", lambda: None)
    monkeypatch.setattr(
        explanation_repository,
        "_fetch_from_relational_db",
        lambda _poi_id: explanation_repository._RelationalLookup("not_found"),
    )

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
    assert response.json() == {"detail": "Explanation data is temporarily unavailable"}
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
            "fact_source": "POSTGRESQL_FALLBACK",
        },
    )

    result = explanation_service.get_poi_explanation_facts(POI_ID)

    assert result is not None
    assert [fact.target_key for fact in result.facts] == ["heritage", "HUE"]
    assert result.fact_source == "POSTGRESQL_FALLBACK"


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
    from app.db import neo4j as neo4j_mod

    neo4j_mod.reset_neo4j_cooldown()
    session = FakeSession(
        FakeRecord(
            poi={"id": str(POI_ID), "name": "Sample"},
            facts=[],
        )
    )
    driver = FakeDriver(session)
    monkeypatch.setattr(explanation_repository, "get_driver", lambda: driver)
    monkeypatch.setattr(
        explanation_repository,
        "get_settings",
        lambda: SimpleNamespace(DATABASE_URL="", NEO4J_DATABASE="neo4j"),
    )

    result = explanation_repository.fetch_poi_explanation_facts(str(POI_ID))

    assert result is not None
    assert result["fact_source"] == "NEO4J"
    assert session.query == explanation_repository.EXPLANATION_QUERY
    assert session.parameters == {"poi_id": str(POI_ID)}
    assert driver.session_arguments["default_access_mode"] == READ_ACCESS


def test_relational_fallback_only_returns_observed_category_and_location() -> None:
    result = explanation_repository._build_facts_payload(
        poi_id=POI_ID,
        name="Sample Nature Site",
        is_local=True,
        btype="craft_workshop",
        category_key="category-7",
        cat_name="Nature",
        city_name="Da Nang",
        city_code="DANANG",
        fact_source="POSTGRESQL_FALLBACK",
    )

    assert result["fact_source"] == "POSTGRESQL_FALLBACK"
    assert result["poi"]["source"] is None
    assert [fact["relationship"] for fact in result["facts"]] == ["IN_CATEGORY", "LOCATED_IN"]
    assert all(fact["target_type"] != "Activity" for fact in result["facts"])
    assert all(fact["target_key"] != "low_crowd_authentic" for fact in result["facts"])


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
