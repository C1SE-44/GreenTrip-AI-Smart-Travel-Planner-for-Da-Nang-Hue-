from app.assistant.learning import load_cases,grade,candidate_prompt,released_prompt
from app.assistant.nlu import INSTRUCTIONS
from copy import deepcopy

def test_synthetic_corpus_splits_are_valid_and_only_training_enters_prompt():
 cases=load_cases();prompt=candidate_prompt(INSTRUCTIONS)
 assert len([c for c in cases if c['split']=='train'])==6
 for case in cases:
  assert (case['message'] in prompt)==(case['split']=='train')

def test_semantic_grade_catches_wrong_total_and_missing_protected_constraint():
 row=next(c for c in load_cases() if c['id']=='dev-mix');wrong=deepcopy(row['expected'])
 wrong['changes']=[c if c['field']!='count' else {**c,'value':3} for c in wrong['changes']]
 assert grade(row,wrong)==['count:set']
 near=next(c for c in load_cases() if c['id']=='dev-near');wrong=deepcopy(near['expected']);wrong['changes'].append({'field':'city','op':'clear','value':None})
 assert 'forbidden:city' in grade(near,wrong)

def test_semantic_grade_accepts_equivalent_subjective_preferences():
 row=next(c for c in load_cases() if c['id']=='test-quiet')
 assert not grade(row,{'intent':'compare','changes':[{'field':'ambience','op':'prefer','value':'conversation'}]})
 assert grade(row,{'intent':'compare','changes':[]})

def test_release_with_changed_corpus_or_invalid_manifest_uses_baseline(monkeypatch,tmp_path):
 from app.assistant import learning
 path=tmp_path/'release.json';monkeypatch.setattr(learning,'RELEASE',path)
 path.write_text('{"use_examples":true,"corpus_sha256":"obsolete"}')
 assert released_prompt('base')==('base','baseline-v1')
 path.write_text('{')
 assert released_prompt('base')==('base','baseline-v1')
