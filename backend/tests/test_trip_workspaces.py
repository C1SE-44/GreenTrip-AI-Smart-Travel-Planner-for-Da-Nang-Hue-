from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from test_travel_assistant import env,req
from test_assistant_acceptance import local_repository
from app.assistant import workspaces,service,store
from app.assistant.router import router as assistant_router
from app.trips.router import router as trips_router
from app.auth.dependencies import get_current_user_id


@pytest.fixture
def client(local_repository,monkeypatch):
    monkeypatch.setattr(workspaces,"get_connection",local_repository.get_connection)
    app=FastAPI();app.include_router(workspaces.router);app.include_router(assistant_router);app.include_router(trips_router)
    from app.itineraries import router as route_module
    app.include_router(route_module.router,prefix="/api/itineraries")
    who={"user":"alice"}
    real_auth=route_module.get_current_user_id
    monkeypatch.setattr(route_module,"get_current_user_id",lambda authorization: who["user"] if authorization=="Bearer qa" else real_auth(authorization))
    app.dependency_overrides[get_current_user_id]=lambda:who["user"]
    return TestClient(app),who


def body(id="trip-a",revision=None,**data):
    return {"data":{"id":id,"title":"Private trip","destination":"Huế","daysCount":2,"peopleCount":2,"ideas":["a"],**data},"expected_revision":revision}


def test_workspace_owner_is_enforced_across_api_paths(client):
    api,who=client
    saved=api.put('/trip-workspaces/trip-a',json=body(user_id='bob'));assert saved.status_code==200
    assert saved.json()['workspaceRevision']==1
    who['user']='bob'
    assert api.get('/trip-workspaces').json()['items']==[]
    for response in [api.get('/trip-workspaces/trip-a'),api.put('/trip-workspaces/trip-a',json=body(revision=1)),api.delete('/trip-workspaces/trip-a'),api.get('/assistant/history?trip_id=trip-a&mode=planner'),api.get('/assistant/conversations?trip_id=trip-a&mode=planner'),api.post('/assistant/chat',json=req('xin chào',trip='trip-a').model_dump()),api.get('/trips/trip-a/itinerary'),api.get('/api/itineraries/trip-a/days/1/route',headers={'Authorization':'Bearer qa'})]:
        assert response.status_code==403,response.text
    who['user']='alice'
    assert api.get('/trip-workspaces/trip-a').json()['ideas']==['a']


def test_metadata_revision_prevents_overwrite_and_delete_is_owner_scoped(client):
    api,who=client
    assert api.put('/trip-workspaces/trip-a',json=body()).status_code==200
    assert api.put('/trip-workspaces/trip-a',json=body(revision=1,ideas=['a','b'])).json()['workspaceRevision']==2
    assert api.put('/trip-workspaces/trip-a',json=body(revision=1,ideas=[])).status_code==409
    assert api.get('/trip-workspaces/trip-a').json()['ideas']==['a','b']
    assert api.delete('/trip-workspaces/trip-a').status_code==200
    assert api.get('/trip-workspaces/trip-a').status_code==410
    assert api.get('/trip-workspaces').json()['deleted_ids']==['trip-a']


def test_ideas_are_saved_before_chat_reports_success(client):
    api,who=client
    api.put('/trip-workspaces/trip-a',json=body())
    service.process(req('tìm cà phê ở Huế',trip='trip-a'),'alice')
    payload=req('Lưu vào Ý tưởng',trip='trip-a',idea_ids=['forged']).model_copy(update={'selected_poi_id':'b'})
    result=service.process(payload,'alice')
    assert result['action']=='ideas_saved'
    assert result['idea_ids']==['a','b']
    assert api.get('/trip-workspaces/trip-a').json()['ideas']==['a','b']
    assert api.get('/trip-workspaces/trip-a').json()['workspaceRevision']==result['workspace_revision']


def test_conversation_list_only_contains_real_histories(client):
    api,who=client
    api.put('/trip-workspaces/trip-a',json=body())
    assert api.get('/assistant/conversations?trip_id=trip-a&mode=planner').json()['items']==[]
    for slot in [1,2,3]:
        request=req('xin chào',trip='trip-a').model_copy(update={'conversation_id':slot})
        service.process(request,'alice')
    assert [r['id'] for r in api.get('/assistant/conversations?trip_id=trip-a&mode=planner').json()['items']]==[1,2,3]
    assert api.post('/assistant/chat',json=req('hello',trip='trip-a').model_dump()|{'conversation_id':4}).status_code==422
    who['user']='bob'
    assert api.get('/assistant/conversations?trip_id=trip-a&mode=planner').status_code==403


def test_guest_cannot_create_read_or_write_private_work(client):
    api,who=client
    api.app.dependency_overrides.clear()
    assert api.get('/trip-workspaces').status_code==401
    assert api.put('/trip-workspaces/trip-a',json=body()).status_code==401
    assert api.get('/trips/trip-a/itinerary').status_code==401
    assert api.get('/assistant/conversations?trip_id=trip-a').status_code==401


def test_route_reads_do_not_seed_private_itineraries(client,monkeypatch):
    api,who=client
    assert api.get('/api/itineraries/trip-missing/days/1/route').status_code==401
    assert api.get('/api/itineraries/trip-missing/days/1/route',headers={'Authorization':'Bearer qa'}).status_code==404
    from app.itineraries import repository
    from app.trips import itinerary_repository
    monkeypatch.setattr(repository,'get_connection',itinerary_repository.get_connection)
    monkeypatch.setattr(repository,'ensure_itinerary_tables',lambda:None)
    monkeypatch.setattr(repository,'ensure_user_trip_itinerary',lambda *args,**kwargs:pytest.fail('Read must not seed a private itinerary'))
    assert repository.get_itinerary('trip-missing') is None
    assert repository.get_itinerary_day('trip-missing',1) is None


@pytest.mark.parametrize("budget", [-1, True, "5000000", float("inf"), 100_000_000_001])
def test_workspace_rejects_invalid_total_budget(budget):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        workspaces.WorkspaceWrite(data={"id":"budget-test","title":"Budget","destination":"Huế","totalBudget":budget})


def test_workspace_allows_optional_budget():
    for value in (None, 0, 5000000):
        result=workspaces.WorkspaceWrite(data={"id":"budget-test","title":"Budget","destination":"Huế","totalBudget":value})
        assert result.data["totalBudget"] == value
