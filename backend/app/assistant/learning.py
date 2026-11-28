"""Versioned synthetic demonstrations and deterministic semantic evaluation."""
import hashlib
import json
from pathlib import Path
from app.assistant.dialogue import Turn

CORPUS = Path(__file__).resolve().parents[2] / 'evals' / 'assistant_dialogue_v1.json'
RELEASE = Path(__file__).with_name('prompt_release.json')


def load_cases():
    cases = json.loads(CORPUS.read_text(encoding='utf-8'))['cases']
    if len({row['id'] for row in cases}) != len(cases):
        raise ValueError('Duplicate evaluation IDs')
    if len({row['message'] for row in cases}) != len(cases):
        raise ValueError('A message occurs in more than one split')
    for row in cases:
        if row['split'] not in ('train','dev','test'): raise ValueError('Unknown split')
        Turn.model_validate(row['expected'])
        if any(key in json.dumps(row['context']) for key in ('user_id','trip_id','access_token','api_key','email')):
            raise ValueError('Private account data is not permitted in demonstrations')
    return cases


def corpus_digest():
    return hashlib.sha256(CORPUS.read_bytes()).hexdigest()


def candidate_prompt(base):
    examples = [{'input':{'message':row['message'],'context':row['context']},'output':row['expected']}
                for row in load_cases() if row['split']=='train']
    return base + '\nSynthetic demonstrations (not current user data). Follow the schema and generalize the operations, not the place names:\n' + json.dumps(examples,ensure_ascii=False)


def released_prompt(base):
    try:
        release = json.loads(RELEASE.read_text(encoding='utf-8'))
        if release.get('use_examples') and release.get('corpus_sha256') == corpus_digest():
            return candidate_prompt(base), 'dialogue-examples-v1'
    except (OSError,ValueError,KeyError,TypeError):
        pass
    return base, 'baseline-v1'


def grade(row, prediction):
    if prediction.get('_model_status'): return [prediction['_model_status']]
    try: actual = Turn.model_validate({k:v for k,v in prediction.items() if not k.startswith('_')}).model_dump()
    except ValueError: return ['invalid_schema']
    expected = row['expected']; failures=[]
    for key in ('intent','search_scope','reference_index','budget'):
        if key in expected and expected[key] != actual.get(key): failures.append(key)
    if expected['intent']=='list_ideas' and actual['changes']: failures.append('list_mutates_filters')
    for change in expected['changes']:
        if change not in actual['changes']: failures.append(change['field']+':'+change['op'])
    for forbidden in row.get('forbidden_changes',[]):
        if any(all(change.get(k)==v for k,v in forbidden.items()) for change in actual['changes']):
            failures.append('forbidden:'+forbidden['field'])
    alternatives=row.get('one_of_changes')
    if alternatives and not any(all(change in actual['changes'] for change in option) for option in alternatives):
        failures.append('missing_equivalent_preference')
    return failures
