"""Exercise the POI router without app startup/seeding or external services."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.pois import repository
from app.pois.router import router
from test_pois import FakeConnection, poi_records


def test_summary_search_ids_and_limit_reach_parameterized_queries(monkeypatch, poi_records):
    queries = []
    monkeypatch.setattr(repository, 'get_connection', lambda: FakeConnection(poi_records, queries))
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    response = client.get('/pois', params=[('ids', 'a'), ('ids', 'b'), ('q', '50%_'), ('view', 'summary'), ('sort', 'curated'), ('page', 2), ('limit', 16)])
    assert response.status_code == 200
    query, params = queries[0]
    assert 'p.poi_id::text = ANY(%s)' in query
    assert params[:4] == (['a', 'b'], '%50\\%\\_%', '%50\\%\\_%', '%50\\%\\_%')
    assert params[-2:] == (16, 16)
    assert "'featured_reviews'" in query and "'menu_items'" in query
    assert 'NULL AS social_links' in query
    assert "POSITION('michelin'" in query
    assert queries[1][1] == params[:-2]
    assert client.get('/pois?view=unknown').status_code == 422


def test_summary_heritage_excludes_spiritual_to_match_frontend(monkeypatch, poi_records):
    queries = []
    monkeypatch.setattr(repository, 'get_connection', lambda: FakeConnection(poi_records, queries))
    repository.list_pois(limit=16, offset=0, category='di-tich', view='summary')
    assert 'NOT (c.name = ANY(%s))' in queries[0][0]
    queries.clear()
    repository.list_pois(limit=16, offset=0, category='di-tich')
    assert 'NOT (c.name = ANY(%s))' not in queries[0][0]
