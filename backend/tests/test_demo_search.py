from test_travel_assistant import env, req, point
from app.assistant import service, search


def test_offline_mixed_append_and_dish(env):
    env.extend([
        point('t1', 'Chùa Một', 'Da Nang', 'Tâm linh'),
        point('t2', 'Chùa Hai', 'Da Nang', 'Tâm linh'),
        point('n', 'Công viên', 'Da Nang', 'Cảnh quan thiên nhiên'),
        {**point('food', 'Quán Mì', 'Da Nang', 'Ẩm thực'), 'description': 'Có mì Quảng gà trong thực đơn.'},
        point('unknown', 'Quán địa phương', 'Da Nang', 'Ẩm thực'),
        {**point('border', 'Farm', 'Da Nang', 'Cảnh quan thiên nhiên'), 'address': 'Duy Vinh, giáp ranh Nam Đà Nẵng'},
    ])
    first = service.process(req('tìm 3 điểm ở Đà Nẵng, 1 điểm là chùa'), 'alice')
    assert len(first['pois']) == 3
    assert sum(search.category_match(p, 'temple') for p in first['pois']) == 1
    assert all(p['city'] == 'Đà Nẵng' and p['id'] != 'border' for p in first['pois'])
    second = service.process(req('thêm 1 chùa nữa'), 'alice')
    assert len(second['pois']) == 1
    assert second['pois'][0]['id'] not in {p['id'] for p in first['pois']}
    third = service.process(req('tôi muốn ăn mì Quảng'), 'alice')
    assert [p['id'] for p in third['pois']] == ['food']
    assert 'Chưa xác nhận' in third['pois'][0]['price_label']
    assert third['prompts'][0]['label'] == 'Tìm quán khác'


def test_dish_followup_fills_valid_query_without_repeating(env):
    env.extend([
        {**point('food', 'Quán Mì', 'Da Nang', 'Ẩm thực'), 'description': 'Có mì Quảng gà trong thực đơn.'},
    ])
    first = service.process(req('tôi muốn ăn mì Quảng ở Đà Nẵng'), 'alice')
    button = first['prompts'][0]
    assert button['label'] == 'Tìm quán khác'
    next_turn = service.process(req(button['message']), 'alice')
    assert next_turn['pois'] == []
    assert '0 điểm' in next_turn['text']


def test_model_append_uses_new_card_only(env, monkeypatch):
    env.extend([point('t1', 'Chùa Một', 'Da Nang', 'Tâm linh'), point('t2', 'Chùa Hai', 'Da Nang', 'Tâm linh')])
    first = service.process(req('tìm 1 điểm ở Đà Nẵng, 1 điểm là chùa'), 'alice')
    monkeypatch.setattr(service, 'extract', lambda *a, **k: {'intent':'search', 'search_scope':'refine', 'changes':[{'field':'category','op':'set','value':'temple'},{'field':'count','op':'set','value':1}]})
    second = service.process(req('thêm 1 chùa nữa'), 'alice')
    assert second['trace']['route'] == 'gemini'
    assert len(second['pois']) == 1
    assert second['pois'][0]['id'] != first['pois'][0]['id']


import pytest
@pytest.mark.parametrize('message', [
    'Tôi đi cùng ba mẹ, muốn chiều ở Huế nhẹ nhàng, ăn món địa phương và không ghé cà phê',
    'Chiều nay ở Huế cùng bố mẹ, ưu tiên đi nhẹ, thích món địa phương, đừng gợi ý cà phê',
])
def test_long_offline_request_preserves_exclusion(env, message):
    response = service.process(req(message), 'alice')
    assert response['pois']
    assert all(p['city'] == 'Huế' and not search.category_match(p, 'cafe') for p in response['pois'])
    assert 'chưa xác nhận' in response['text'].lower()
    assert any(p['label'] == 'Tìm món địa phương' for p in response['prompts'])


@pytest.mark.parametrize('count', [1,2,4,7])
def test_cafe_count_and_brewery_exclusion(env, count):
    env.extend([point(f'coffee-{i}', f'Coffee {i}', 'Da Nang', 'Quán cafe giải khát') for i in range(8)])
    env.append({**point('beer', '7 Bridges Brewing Company', 'Da Nang', 'Quán cafe giải khát'), 'description':'Nhà nấu bia thủ công độc lập', 'satisfaction_score':5})
    result = service.process(req(f'tôi muốn {count} quán cà phê ngon đánh giá cao ở đà nẵng'), 'alice')
    assert len(result['pois']) == count
    assert 'beer' not in [p['id'] for p in result['pois']]
    assert all(search.category_match(p,'cafe') for p in result['pois'])


def test_new_search_without_count_resets_previous_quantity(env):
    service.process(req('tìm 1 điểm ở Huế'), 'alice')
    response=service.process(req('tìm quán cà phê ở Huế'), 'alice')
    assert len(response['pois']) == 3


@pytest.mark.parametrize('message', ['lên kế hoạch từ ý tưởng', 'tạo lịch trình cho chuyến này'])
def test_plain_plan_request_creates_preview(env, message):
    response=service.process(req(message, idea_ids=['a','b']), 'alice')
    assert response['draft']
    assert not response['pois']


def test_explicit_count_overrides_model_count(env, monkeypatch):
    env.extend([point(f'coffee-{i}', f'Coffee {i}', 'Da Nang') for i in range(8)])
    monkeypatch.setattr(service,'extract',lambda *a,**k:{'intent':'search','search_scope':'new','changes':[{'field':'city','op':'set','value':'Đà Nẵng'},{'field':'category','op':'set','value':'cafe'},{'field':'count','op':'set','value':5}]})
    response=service.process(req('tôi muốn hai quán cà phê ở Đà Nẵng'), 'alice')
    assert response['trace']['route']=='gemini'
    assert len(response['pois'])==2


def test_project_brewery_record_is_not_coffee():
    import csv
    from pathlib import Path
    with (Path(__file__).parents[2]/'data/processed/all_pois_cleaned.csv').open(encoding='utf-8-sig') as source:
        row=next(p for p in csv.DictReader(source) if p['name']=='7 Bridges Brewing Company')
    assert row['sub_category']=='craft_beer'
    assert not search.category_match(row,'cafe')


def test_auto_plan_consent_and_fresh_ideas(env):
    env.extend([point(f'p{i}',f'Điểm {i}',lat=16.46+i*.001) for i in range(8)])
    first=service.process(req('xếp 2 điểm mỗi ngày', days_count=4, idea_ids=['p0','p1','p2']), 'alice')
    assert not first['draft']
    assert '3 điểm đã lưu' in first['text'] and 'thêm 5 điểm' in first['text']
    # Simulates adding an Idea while the existing chat stays open.
    second=service.process(req('bạn tự lên cho tôi đi', days_count=4, idea_ids=['p0','p1','p2','p3']), 'alice')
    assert second['idea_ids']==['p0','p1','p2','p3']
    assert [sum(bool(s.get('poi_id')) for s in d['stops']) for d in second['draft']['itinerary']['days']]==[2,2,2,2]
    comments=[s['comment'] for d in second['draft']['itinerary']['days'] for s in d['stops'] if s.get('poi_id')]
    assert sum('Đã lưu trong Ý tưởng.' in c for c in comments)==4


def test_coffee_name_and_roastery_override_broad_food_label():
    assert search.category_match({'name':'Đi Lạc Coffee', 'category':'Quán ăn', 'sub_category':'specialty_roastery'},'cafe')
    assert not search.category_match({'name':'Quán giải khát', 'category':'Quán giải khát'},'cafe')


def test_rating_requires_score_and_review_count():
    assert search.rating_evidence({'satisfaction_score':5})==(0,0)
    assert search.rating_evidence({'satisfaction_score':4.9,'ai_metadata':{'review_count':180}})==(4.9,180)
    assert 'chưa đủ dữ liệu' in search.reason_for(point('c','Coffee'),{'high_rating':True})


@pytest.mark.parametrize('persisted',[False,True])
@pytest.mark.parametrize('message',['bạn có lên lịch trình 4 ngày cho 5 địa điểm ở ý tưởng được không','xếp đều 5 điểm đã lưu trong 4 ngày giúp tôi','lập kế hoạch 4 ngày từ các ý tưởng'])
def test_whole_trip_request_ignores_old_focused_day(env, monkeypatch, message, persisted):
    from app.assistant import store
    env.extend([point(f'idea{i}',f'Ý tưởng {i}') for i in range(5)])
    with store.session('alice','own-trip','planner') as state:
        state['focused_day']=1
        state['last_ids']=['a','b','c','d','e']
        previous=service.empty_itinerary('own-trip',req('plan',days_count=4).context)
        previous['days'][0]['stops']=[{'stop_id':'old','poi_id':'a','title':'Old draft POI','start_time':'09:00','end_time':'10:00'}]
        state['draft']={'before_digest':service.digest(previous if persisted else None),'itinerary':previous}
    if persisted:
        monkeypatch.setattr(service,'owned_itinerary',lambda *a: previous)
    monkeypatch.setattr(service,'extract',lambda *a,**k:{'intent':'plan','changes':[{'field':'count','op':'set','value':5}]})
    response=service.process(req(message,days_count=4,idea_ids=[f'idea{i}' for i in range(5)]),'alice')
    assert response['draft']
    assert [sum(bool(s.get('poi_id')) for s in day['stops']) for day in response['draft']['itinerary']['days']]==[2,1,1,1]


@pytest.mark.parametrize('question',['địa điểm green là gì','green nghĩa là sao','giải thích điểm xanh giúp tôi'])
def test_green_definition_does_not_search_or_change_filters(env, monkeypatch, question):
    from app.assistant import store
    from copy import deepcopy
    service.process(req('tìm 2 quán cà phê ở Huế'),'alice')
    with store.session('alice','own-trip','planner') as state:
        before=deepcopy(state['criteria']); ids=state['last_ids'][:]
    monkeypatch.setattr(service,'extract',lambda *a,**k: (_ for _ in ()).throw(AssertionError('Definition should not call model')))
    response=service.process(req(question),'alice')
    assert not response['pois'] and not response['draft']
    assert 'chứng nhận' in response['text']
    with store.session('alice','own-trip','planner') as state:
        assert state['criteria']==before and state['last_ids']==ids


def test_explanation_then_two_examples_keeps_topic(env):
    service.process(req('địa điểm green là gì'),'alice')
    response=service.process(req('Cho mình 2 ví dụ ở Huế'),'alice')
    assert len(response['pois'])==2
    assert all(p['city']=='Huế' for p in response['pois'])
    assert response['trace']['reason']=='green_examples'
    assert response['text'].startswith('Mình')


def test_plan_intro_reports_actual_pois_and_missing_id(env):
    r=service.process(req('xếp 3 điểm trong 4 ngày',days_count=4,idea_ids=['a','b','missing-id']),'alice')
    assert r['outcome']['status']=='partial'
    assert r['outcome']['unresolved_ids']==['missing-id']
    assert '2 điểm' in r['text'] and '4 ngày' in r['text']


@pytest.mark.parametrize('message',['Ngày 2 nhẹ hơn, đừng đổi ngày khác','Giảm nhịp ngày thứ hai, giữ nguyên phần còn lại'])
def test_scoped_light_clarifies_then_only_edits_requested_day(env,message):
    env.extend([point(f'p{i}',f'Điểm {i}') for i in range(5)])
    preview=service.process(req('xếp 5 điểm trong 4 ngày',days_count=4,idea_ids=[f'p{i}' for i in range(5)]),'alice')['draft']['itinerary']
    question=service.process(req(message,days_count=4),'alice')
    assert question['outcome']['status']=='needs_clarification'
    changed=service.process(req(question['prompts'][0]['message'],days_count=4),'alice')['draft']['itinerary']
    assert [d for d in changed['days'] if d['day_number']!=2]==[d for d in preview['days'] if d['day_number']!=2]
    assert next(s for s in changed['days'][1]['stops'] if s.get('poi_id'))['start_time']=='10:00'


def test_empty_and_unavailable_ideas_are_distinct(env,monkeypatch):
    from fastapi import HTTPException
    empty=service.process(req('xếp lịch 4 ngày',days_count=4),'alice')
    assert empty['outcome']['reason']=='empty_ideas'
    missing=service.process(req('xếp lịch 4 ngày',days_count=4,idea_ids=['not-found']),'alice')
    assert missing['outcome']['reason']=='unresolved_ideas'
    assert 'chưa có Ý tưởng' not in missing['text']
    def unavailable(*a,**k):raise HTTPException(503,'Chưa tải được dữ liệu địa điểm')
    monkeypatch.setattr(service,'catalogue',unavailable)
    with pytest.raises(HTTPException) as caught:
        service.process(req('xếp lịch 4 ngày',days_count=4,idea_ids=['a']),'alice')
    assert caught.value.status_code==503
