import importlib.util
import json
from pathlib import Path
import sys
from app.assistant.dialogue import Turn
ROOT=Path(__file__).resolve().parents[1]/'training'
sys.path.insert(0,str(ROOT))
from train_lora import score


def test_synthetic_targets_are_valid_and_heldout_messages_do_not_leak():
    rows=json.loads((ROOT/'local_dialogue_v1.json').read_text(encoding='utf-8'))['cases']
    for row in rows: Turn.model_validate(row['target'])
    train={r['message'] for r in rows if r['split']=='train'}
    held={r['message'] for r in rows if r['split']!='train'}
    assert len(train)==166 and len(held)==8 and not train&held


def test_local_metric_rejects_broken_json_wrong_counts_and_write_intent():
    row={'id':'test-mix-1','target':{'intent':'search','changes':[{'field':'count','op':'set','value':5}]}}
    assert not score(row,'not JSON')
    assert not score(row,'{"intent":"search","changes":[{"field":"count","op":"set","value":3}]}')
    assert not score(row,'{"intent":"save_idea","changes":[]}')
    assert score(row,json.dumps(row['target']))


def test_acceptance_rejects_extra_operation_even_when_schema_is_valid():
    from scripts.validate_local_eval import validate_prediction
    expected=Turn.model_validate({'intent':'list_ideas','changes':[]}).model_dump(mode='json')
    assert validate_prediction(json.dumps(expected),expected)==(True,True)
    extra={**expected,'changes':[{'field':'city','op':'clear','value':None}]}
    assert validate_prediction(json.dumps(extra),expected)==(True,False)
    assert validate_prediction('broken',expected)==(False,False)
