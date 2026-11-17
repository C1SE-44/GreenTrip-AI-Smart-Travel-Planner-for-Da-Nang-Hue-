"""Validate local model outputs against the actual production Turn schema after training."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.assistant.dialogue import Turn


def validate_prediction(text,target):
    try:
        value=Turn.model_validate(json.loads(text[text.find('{'):text.rfind('}')+1])).model_dump(mode='json')
        return True,value==target
    except (ValueError,TypeError):
        return False,False


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--report',type=Path,default=Path(__file__).resolve().parents[1]/'.training'/'qwen3-greentrip-lora-v1'/'report.json');parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[2]/'docs'/'LOCAL_ADAPTER_ACCEPTANCE.json');args=parser.parse_args()
    report=json.loads(args.report.read_text(encoding='utf-8'));rows=[]
    if report['status']!='COMPLETE':raise SystemExit('Training/evaluation is incomplete; refuse acceptance report')
    cases=json.loads((Path(__file__).resolve().parents[1]/'training'/'local_dialogue_v1.json').read_text(encoding='utf-8'))['cases']
    targets={row['id']:Turn.model_validate(row['target']).model_dump(mode='json') for row in cases}
    for result in report['evaluations']:
        valid,exact=validate_prediction(result['prediction'],targets[result['id']])
        rows.append({'id':result['id'],'split':result['split'],'variant':result['variant'],'schema_valid':valid,'expected_contract_exact':exact,'semantic_pass':valid and result['pass'] and exact,'seconds':result['seconds']})
    scores={variant:{split:sum(row['semantic_pass'] for row in rows if row['variant']==variant and row['split']==split) for split in ('dev','test')} for variant in ('base','lora')}
    result={'training_status':report['status'],'weights_trained':report['weights_trained'],'completed_steps':report.get('completed_steps',0),'model':report['model'],'scores':scores,'rows':rows,'production_enabled':False,'dataset_note':'small synthetic template corpus; no production generalization claim'}
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in result.items() if k!='rows'}))

if __name__=='__main__':main()
