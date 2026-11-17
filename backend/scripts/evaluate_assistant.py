"""Validate locally; --live compares prompts with bounded Free Tier calls, not weight training."""
import argparse
import json
import sys
from pathlib import Path
from time import perf_counter, sleep
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.assistant import nlu
from app.assistant.learning import load_cases,candidate_prompt,grade,corpus_digest,RELEASE
from app.config import get_settings


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--live',action='store_true')
    parser.add_argument('--promote',action='store_true')
    parser.add_argument('--max-calls',type=int,default=12)
    parser.add_argument('--output',type=Path,default=Path('../docs/ASSISTANT_PROMPT_EVAL.json'))
    args=parser.parse_args();cases=load_cases()
    train=[row for row in cases if row['split']=='train']
    export=Path(__file__).resolve().parents[1]/'evals'/'assistant_train_v1.jsonl'
    export.write_text(''.join(json.dumps({'messages':[{'role':'user','content':json.dumps({'message':row['message'],'context':row['context']},ensure_ascii=False)},{'role':'assistant','content':json.dumps(row['expected'],ensure_ascii=False)}]},ensure_ascii=False)+'\n' for row in train),encoding='utf-8')
    if not args.live:
        print(json.dumps({'validation':'PASS','splits':{split:sum(r['split']==split for r in cases) for split in ('train','dev','test')},'weight_training':False}));return
    settings=get_settings()
    if not (settings.ASSISTANT_AI_ENABLED and settings.ASSISTANT_AI_FREE_TIER_CONFIRMED and settings.gemini_configured):
        raise SystemExit('Live evaluation requires the existing enabled, verified Free Tier configuration. No flags were changed.')
    dev=[row for row in cases if row['split']=='dev'];test=[row for row in cases if row['split']=='test']
    if args.max_calls<2*len(dev)+len(test): raise SystemExit('Call budget too small; no partial promotion allowed.')
    base=getattr(nlu,'BASE_INSTRUCTIONS',nlu.INSTRUCTIONS);prompts={'baseline':base,'candidate':candidate_prompt(base)}
    rows=[];calls=0
    def run(row,variant):
        nonlocal calls
        if calls>=args.max_calls:raise RuntimeError('Explicit call budget reached')
        nlu.INSTRUCTIONS=prompts[variant];started=perf_counter()
        prediction=nlu.extract(row['message'],context=row['context']);calls+=prediction.get('_model_calls',0)
        retries=[]
        if prediction.get('_model_status') in ('unavailable','timeout') and calls<args.max_calls:
            retries.append(prediction['_model_status']);sleep(3)
            prediction=nlu.extract(row['message'],context=row['context']);calls+=prediction.get('_model_calls',0)
        failures=grade(row,prediction)
        result={'case':row['id'],'split':row['split'],'variant':variant,'pass':not failures,'failures':failures,'elapsed_ms':round((perf_counter()-started)*1000),'provider_status':prediction.get('_model_status'),'retry_statuses':retries,'prediction':{k:v for k,v in prediction.items() if not k.startswith('_')}}
        rows.append(result);print(json.dumps({k:result[k] for k in ('case','variant','pass','failures')}) ,flush=True)
        if prediction.get('_model_status') or not prediction:
            args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps({'status':'BLOCKED','calls':calls,'results':rows,'promoted':False},ensure_ascii=False,indent=2),encoding='utf-8')
            raise SystemExit('Provider unavailable/quota/disabled; report saved and no prompt promoted.')
        return result
    try:
        for row in dev:
            for variant in prompts:run(row,variant)
        scores={variant:sum(row['pass'] for row in rows if row['variant']==variant) for variant in prompts}
        regressions=[row['case'] for row in rows if row['variant']=='candidate' and not row['pass'] and any(other['case']==row['case'] and other['variant']=='baseline' and other['pass'] for other in rows)]
        selected='candidate' if scores['candidate']>scores['baseline'] and not regressions else 'baseline'
        heldout=[run(row,selected) for row in test]
        promote=args.promote and selected=='candidate' and all(row['pass'] for row in heldout)
        report={'status':'COMPLETE','model':settings.GEMINI_MODEL,'weight_training':False,'corpus_sha256':corpus_digest(),'calls':calls,'dev_scores':scores,'dev_total':len(dev),'regressions':regressions,'selected':selected,'test_passed':sum(row['pass'] for row in heldout),'test_total':len(test),'promoted':promote,'results':rows}
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        if promote:
            pending=RELEASE.with_suffix('.tmp');pending.write_text(json.dumps({'use_examples':True,'corpus_sha256':corpus_digest(),'version':'dialogue-examples-v1'}),encoding='utf-8');pending.replace(RELEASE)
        print(json.dumps({k:v for k,v in report.items() if k!='results'}),flush=True)
    finally:nlu.INSTRUCTIONS=base

if __name__=='__main__':main()
