from copy import deepcopy
import pytest
from test_travel_assistant import env, req, point
from app.assistant import service, store, demo_search

@pytest.mark.parametrize('message,dish',[
 ('tôi muốn ăn mì quảng thì có quán nào','mi quang'),
 ('Tôi muốn ăn bún bò thì có chỗ nào không?','bun bo'),
 ('Tìm quán có bánh xèo ngon ở Đà Nẵng','banh xeo'),
 ('Mình muốn ăn cao lầu, gợi ý giúp nhé','cao lau'),
])
def test_dish_question_tail_is_not_part_of_food_name(message,dish):
 assert demo_search.understand(message,{},'Huế')['filters']['dish']==dish

@pytest.mark.parametrize('ai',[False,True])
def test_dish_search_and_city_followup_use_same_food_not_old_cafe_filters(env,monkeypatch,ai):
 food=point('noodles','Mì Quảng Bà Mua','Da Nang',category='Ẩm thực và quán ăn')
 food['description']='Quán phục vụ mì Quảng gà và tôm.'
 env.append(food)
 if ai:
  def model(message,**kwargs):
   if message.startswith('ở'):
    return {'intent':'search','search_scope':'refine','changes':[{'field':'city','op':'set','value':'Đà Nẵng'}]}
   return {'intent':'search','search_scope':'new','changes':[{'field':'dish','op':'set','value':'mì Quảng'},{'field':'category','op':'set','value':'food'}]}
  monkeypatch.setattr(service,'extract',model)
 first=service.process(req('tôi muốn ăn mì quảng thì có quán nào'),'alice')
 assert first['pois']==[]
 with store.session('alice','own-trip','planner') as state:
  assert state['criteria']['dish'] in ('mi quang','mì Quảng')
 second=service.process(req('ở Đà Nẵng có không'),'alice')
 assert [p['id'] for p in second['pois']]==['noodles']
 assert second['prompts'][0]['label']=='Tìm quán khác'
 assert 'quang' in second['prompts'][0]['message'].lower() or 'Quảng' in second['prompts'][0]['message']


def test_correct_model_dish_is_never_overwritten_by_greedy_rules(env,monkeypatch):
 p=point('soup','Quán bún bò','Hue',category='Ẩm thực và quán ăn');p['description']='Phục vụ bún bò Huế.';env.append(p)
 monkeypatch.setattr(service,'extract',lambda *a,**kw:{'intent':'search','search_scope':'new','changes':[{'field':'dish','op':'set','value':'bún bò'},{'field':'category','op':'set','value':'food'}]})
 result=service.process(req('Tôi muốn ăn bún bò ngon thì có quán nào phù hợp'),'alice')
 assert [p['id'] for p in result['pois']]==['soup']
 with store.session('alice','own-trip','planner') as state:assert state['criteria']['dish']=='bún bò'

@pytest.mark.parametrize('text', ['mì Quảng ở Đà Nẵng có quán nào?', 'tìm mì Quảng ở Huế', 'Có quán nào bán bún bò ở Huế không?'])
def test_direct_food_questions_are_understood_offline(text):
 turn=demo_search.understand(text,{},'Huế')
 assert turn and turn['filters']['dish'] in ('mi quang','bun bo')


def test_menu_only_is_used_and_descriptive_mentions_do_not_prove_service(env):
 from app.assistant import search
 good=point('menu-only','Quán Một','Da Nang',category='Ẩm thực và quán ăn')
 good['ai_metadata']['menu_items']=[{'name':'Mì Quảng gà'}]
 mention=point('mention','Quán Hai','Da Nang',category='Ẩm thực và quán ăn')
 mention['description']='Nằm gần quán mì Quảng nổi tiếng; khu phố ẩm thực.'
 env.extend([good,mention])
 result=service.process(req('Tôi muốn ăn mì Quảng ở Đà Nẵng'),'alice')
 assert [p['id'] for p in result['pois']]==['menu-only']
 assert result['pois'][0]['dish_evidence']['source']=='ai_metadata.menu_items'


def test_city_then_sao_keeps_food_even_after_zero_results(env):
 p=point('other-dish','Quán Thử','Da Nang',category='Ẩm thực và quán ăn');p['ai_metadata']['menu_items']=[{'name':'Bánh xèo tôm'}];env.append(p)
 a=service.process(req('tìm bánh xèo ở Huế'),'alice');assert a['pois']==[]
 b=service.process(req('Đà Nẵng thì sao?'),'alice');assert [p['id'] for p in b['pois']]==['other-dish']


def test_culinary_spelling_variants_and_negative_evidence(env):
 from app.assistant import search
 p=point('proof','Quán mẫu',category='Ẩm thực và quán ăn')
 p['ai_metadata']['menu_items']=[{'name':'Mỳ Quảng gà'}]
 assert search.dish_evidence(p,'mì Quảng')['source']=='ai_metadata.menu_items'
 p['description']='Không phục vụ mì Quảng.'
 assert search.dish_evidence(p,'mì Quảng') is None
 assert demo_search.understand('Gợi ý cà phê',{},'Huế')['filters'].get('dish') is None


def test_catalogue_keeps_full_menu_for_food_confirmation(monkeypatch):
 from app.assistant import search
 from app.pois.model import POI
 calls=[]
 def listing(**kw):
  calls.append(kw)
  return [POI(id='menu',name='Quán thử',category='Ẩm thực và quán ăn',description='',latitude=None,longitude=None,address='',city='Hue',ai_metadata={'menu_items':[{'name':'Bánh xèo'}]})],1
 monkeypatch.setattr(search,'list_pois',listing)
 assert search.catalogue()[0]['ai_metadata']['menu_items']
 assert calls[0]['view']=='full'
