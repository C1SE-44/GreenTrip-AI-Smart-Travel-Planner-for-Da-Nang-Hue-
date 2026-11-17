import pytest
from unittest.mock import Mock
from test_travel_assistant import env, req, point
from app.assistant import service, search, demo_search

@pytest.mark.parametrize('text',[
 'tôi muốn tìm 3 địa điểm cà phê Huế, và 2 địa điểm chùa',
 'Tìm ba quán cà phê và hai ngôi chùa tại Huế',
 'Ở Huế lấy 2 chùa cùng 3 quán cafe nhé',
])
@pytest.mark.parametrize('ai',[False,True])
def test_separate_category_quantities_are_added_not_used_as_total(env,monkeypatch,text,ai):
 env.extend([point('t1','Chùa Một',category='Tâm linh'),point('t2','Chùa Hai',category='Tâm linh')])
 if ai:monkeypatch.setattr(service,'extract',lambda *a,**k:{'intent':'search','search_scope':'new','changes':[{'field':'count','op':'set','value':5},{'field':'mix','op':'set','value':{'cafe':3,'temple':2}},{'field':'city','op':'set','value':'Huế'}]})
 result=service.process(req(text),'alice')
 assert result['trace']['route']==('gemini' if ai else 'rules')
 assert len(result['pois'])==5
 assert len({p['id'] for p in result['pois']})==5
 assert sum(search.category_match(p,'cafe') for p in result['pois'])==3
 assert sum(search.category_match(p,'temple') for p in result['pois'])==2

@pytest.mark.parametrize('text',[
 'bạn xem cho tôi các ý tưởng tôi đang có gồm những gì rồi',
 'Liệt kê các địa điểm đã chọn cho chuyến này nhé',
 'Trong Ý tưởng của chuyến đi này có những gì?',
])
def test_list_ideas_reads_current_server_ids_in_order_without_search_or_model(env,monkeypatch,text):
 ids=['b','c','a']
 monkeypatch.setattr(service.workspaces,'load_if_registered',lambda *a:{'ideas':ids})
 model=Mock(side_effect=AssertionError('Listing owned data needs no model'));monkeypatch.setattr(service,'extract',model)
 result=service.process(req(text,idea_ids=['forged']),'alice')
 assert [p['id'] for p in result['pois']]==ids
 assert result['idea_ids']==ids
 assert result['trace']['route']=='rules'
 assert '3' in result['text']
 model.assert_not_called()

def test_model_can_request_idea_listing_without_turning_it_into_poi_search(env,monkeypatch):
 monkeypatch.setattr(service,'extract',lambda *a,**k:{'intent':'list_ideas','changes':[]})
 result=service.process(req('Mình đã bỏ túi những chỗ nào nhỉ?',idea_ids=['c','a']),'alice')
 assert result['trace']['route']=='gemini'
 assert [p['id'] for p in result['pois']]==['c','a']

def test_missing_saved_poi_is_reported_without_filling_with_new_places(env):
 result=service.process(req('Xem danh sách Ý tưởng',idea_ids=['a','deleted-id']),'alice')
 assert [p['id'] for p in result['pois']]==['a']
 assert result['outcome']['status']=='partial'
 assert result['outcome']['missing_count']==1

def test_empty_ideas_does_not_search_and_propose_new_places(env):
 result=service.process(req('Ý tưởng của mình có gì?',idea_ids=[]),'alice')
 assert result['pois']==[]
 assert 'chưa có' in result['text'].lower()
@pytest.mark.parametrize('ai',[False,True])
def test_mixed_shortage_is_not_filled_by_wrong_category(env,monkeypatch,ai):
 env[:]=[p for p in env if p['id']!='e']
 env.extend([point('t1','Chùa Một',category='Tâm linh'),point('t2','Chùa Hai',category='Tâm linh')])
 if ai:monkeypatch.setattr(service,'extract',lambda *a,**k:{'intent':'search','changes':[{'field':'count','op':'set','value':5},{'field':'mix','op':'set','value':{'cafe':3,'temple':2}}]})
 result=service.process(req('Tìm 3 quán cà phê và 2 chùa ở Huế'),'alice')
 assert len(result['pois'])==4
 assert sum(search.category_match(p,'cafe') for p in result['pois'])==2
 assert sum(search.category_match(p,'temple') for p in result['pois'])==2
 assert 'Chưa tìm đủ 1 quán cà phê' in result['text']

def test_three_named_groups_and_total_conflict_are_distinguished(env):
 env.extend([point('t1','Chùa Một',category='Tâm linh'),point('t2','Chùa Hai',category='Tâm linh')])
 result=service.process(req('Lấy 2 quán cafe, 2 chùa và 1 bảo tàng ở Huế'),'alice')
 assert len(result['pois'])==5
 assert sum(search.category_match(p,'museum') for p in result['pois'])==1
 conflict=service.process(req('Tìm 4 điểm gồm 3 quán cà phê và 2 chùa ở Huế'),'alice')
 assert conflict['pois']==[]
 assert 'lớn hơn tổng' in conflict['text']
