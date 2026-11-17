"""Read-only POI snapshot, real Free Tier NLU comparison, SQLite-only dialogue replay."""
import json,re,sys,tempfile
from pathlib import Path
from copy import deepcopy
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.assistant import service,store,search,nlu,demo_search
from app.assistant.schemas import ChatRequest,Context
from app.config import get_settings
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.assistant.router import router
from app.auth.dependencies import get_current_user_id
ROOT=Path(__file__).resolve().parents[2]
rows=json.loads((ROOT/'backend/data/dish_qa_snapshot.json').read_text(encoding='utf-8'))
settings=get_settings()
if '--replay-only' not in sys.argv:assert settings.ASSISTANT_AI_FREE_TIER_CONFIRMED and settings.gemini_configured
cases=[
 ('original','tôi muốn ăn mì quảng thì có quán nào',{'filters':{'city':'Huế'}},'mi quang','Huế'),
 ('followup','ở Đà Nẵng có không?',{'filters':{'city':'Huế','category':'food','dish':'mì Quảng'},'result_refs':[]},'mi quang','Đà Nẵng'),
 ('direct','mì Quảng ở Đà Nẵng có quán nào?',{},'mi quang','Đà Nẵng'),
 ('other','Tôi muốn ăn bánh xèo ở Đà Nẵng thì có quán nào?',{},'banh xeo','Đà Nẵng'),
]
existing=json.loads((ROOT/'docs/DISH_MODEL_COMPARISON.json').read_text(encoding='utf-8')) if '--replay-only' in sys.argv else {}
result={'settings_model':settings.GEMINI_MODEL,'free_tier_confirmed':True,'models':existing.get('models',{}),'offline':[],'production_model_changed':False}
for name in (() if '--replay-only' in sys.argv else (settings.GEMINI_MODEL,'gemini-4-hydrogen')):
 output=[]
 for ident,message,context,dish,city in cases:
  with patch.object(nlu,'get_settings',return_value=settings.model_copy(update={'GEMINI_MODEL':name})):
   parsed=nlu.extract(message,context=context)
  changes={c['field']:c.get('value') for c in parsed.get('changes',[]) if c['op']=='set'}
  actual_dish=changes.get('dish') or context.get('filters',{}).get('dish')
  actual_city=changes.get('city') or context.get('filters',{}).get('city')
  passed=parsed.get('intent')=='search' and search.food_fold(actual_dish)==dish and actual_city==city
  output.append({'case':ident,'message':message,'context':context,'parsed':parsed,'pass':passed})
  print(json.dumps({'model':name,'case':ident,'pass':passed,'status':parsed.get('_model_status'),'dish':actual_dish,'city':actual_city},ensure_ascii=False),flush=True)
  result['models'][name]=output
  (ROOT/'docs/DISH_MODEL_COMPARISON.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
# Replay same snapshot through the service with SQLite for sessions; no cloud writes.
qa_store=Path(tempfile.mkdtemp(prefix='dish-qa-'))/'sessions.db'
def catalogue(city=None,ids=None):
 return deepcopy([p for p in rows if (not ids or p['id'] in ids) and (not city or search.fold(city).replace(' ','')==search.fold(p['city']).replace(' ',''))])
def replay(label,messages,extractor,empty_hue=False):
 records=[]
 def filtered(city=None,ids=None):
  return [p for p in catalogue(city,ids) if not(empty_hue and search.fold(p['city'])=='hue')]
 with patch.object(store,'PATH',qa_store),patch.object(service,'owned_itinerary',return_value=None),patch.object(service.workspaces,'load_if_registered',return_value=None),patch.object(search,'catalogue',side_effect=filtered),patch.object(service,'catalogue',side_effect=filtered),patch.object(service,'extract',side_effect=extractor):
  app=FastAPI();app.include_router(router);app.dependency_overrides[get_current_user_id]=lambda:'qa'
  client=TestClient(app)
  for i,message in enumerate(messages):
   with store.session('qa',label,'planner') as state:before=deepcopy(state.get('criteria',{}))
   api=client.post('/assistant/chat',json=ChatRequest(message=message,trip_id=label,mode='planner',context=Context(destination='Huế')).model_dump());assert api.status_code==200,api.text
   response=api.json()
   with store.session('qa',label,'planner') as state:after=deepcopy(state.get('criteria',{}))
   records.append({'http_status':api.status_code,'message':message,'rules_understood':demo_search.understand(message,{'criteria':before},'Huế'),'before':before,'after':after,'trace':response['trace'],'pois':[{'id':p['id'],'name':p['name'],'city':p['city'],'evidence':p.get('dish_evidence')} for p in response['pois']],'text':response['text'],'prompts':response['prompts']})
 return records
for label,messages,empty in [('original',['tôi muốn ăn mì quảng thì có quán nào','ở Đà Nẵng có không?'],False),('zero-hue',['tìm mì Quảng ở Huế','Đà Nẵng thì sao?'],True),('direct',['mì Quảng ở Đà Nẵng có quán nào?'],False),('other',['Tôi muốn ăn bánh xèo ở Đà Nẵng thì có quán nào?'],False),('absent',['Tôi muốn ăn món thử không tồn tại ở Đà Nẵng'],False)]:
 result['offline'].append({'case':label,'rows':replay(label,messages,lambda *a,**kw:{},empty)})
for name,output in result['models'].items():
 parsed=iter([r['parsed'] for r in output[:2]])
 result.setdefault('model_service_replay',{})[name]=replay(name,['tôi muốn ăn mì quảng thì có quán nào','ở Đà Nẵng có không?'],lambda *a,**kw:deepcopy(next(parsed)))
old=re.search(r'\b(?:muon an|tim quan (?:ban|co)|an mon)\s+(.+?)(?=\s+(?:o|tai|duoi|gan)\b|[,.!?]|$)',search.fold(cases[0][1]))[1]
result['before_bug_replay']={'old_regex_dish':old,'city':'Đà Nẵng','matching_ids':[p['id'] for p in rows if old in search.fold(p.get('description',''))]}
(ROOT/'docs/DISH_MODEL_COMPARISON.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')

# Behavioral acceptance assertions, independent of provider availability.
by_case={case['case']:case['rows'] for case in result['offline']}
for label in ('original','zero-hue'):
 assert search.food_fold(by_case[label][-1]['after']['dish'])=='mi quang'
 assert by_case[label][-1]['after']['city']=='Đà Nẵng'
 assert any(p['name']=='Mì Quảng Bà Mua' for p in by_case[label][-1]['pois'])
 assert all(p['city']=='Đà Nẵng' and p['evidence'] for p in by_case[label][-1]['pois'])
assert not by_case['zero-hue'][0]['pois'] and not by_case['absent'][0]['pois']
assert by_case['other'][0]['pois'] and all(p['evidence'] for p in by_case['other'][0]['pois'])
print(json.dumps({'api_replay':'PASS','sqlite_only':True,'online_writes':False,'model_promoted':False}))
