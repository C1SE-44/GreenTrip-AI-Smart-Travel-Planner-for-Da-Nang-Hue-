"""CPU LoRA experiment: pinned public base weights, synthetic data, disjoint evaluation."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import time
ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault('HF_HOME',str(ROOT/'.training'/'huggingface'))
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY','1')
os.environ.setdefault('HF_HUB_DISABLE_XET','1')
os.environ.setdefault('TOKENIZERS_PARALLELISM','false')
from contract import SYSTEM
MODEL='Qwen/Qwen3-0.6B'
REVISION='c1899de289a04d12100db370d81485cdf75e47ca'


def score(row,prediction):
    try:
        text=prediction.strip();start=text.find('{');end=text.rfind('}')
        value=json.loads(text[start:end+1])
    except (ValueError,TypeError):return False
    expected=row['target']
    if value.get('intent')!=expected['intent']:return False
    if not isinstance(value.get('changes'),list):return False
    if expected['intent']=='list_ideas' and value['changes']:return False
    for key in ('search_scope','reference_index'):
        if key in expected and value.get(key)!=expected[key]:return False
    for change in expected['changes']:
        if change not in value['changes']:return False
    if row['id'].split('-')[1]=='near' and any(c.get('op')=='clear' and c.get('field') in ('city','category','max_price') for c in value['changes']):return False
    return True


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--baseline-report',type=Path);parser.add_argument('--steps',type=int,default=64);parser.add_argument('--threads',type=int,default=4);parser.add_argument('--max-seq',type=int,default=512);parser.add_argument('--output',type=Path,default=ROOT/'.training'/'qwen3-greentrip-lora-v1');args=parser.parse_args()
    import torch,psutil
    from transformers import AutoTokenizer,AutoModelForCausalLM
    from peft import LoraConfig,get_peft_model
    random.seed(42);torch.manual_seed(42);torch.set_num_threads(args.threads);torch.set_num_interop_threads(1)
    args.output.mkdir(parents=True,exist_ok=True)
    data_path=Path(__file__).with_name('local_dialogue_v1.json');rows=json.loads(data_path.read_text(encoding='utf-8'))['cases']
    training=[r for r in rows if r['split']=='train'];heldout=[r for r in rows if r['split']!='train']
    assert not ({r['message'] for r in training}&{r['message'] for r in heldout})
    print(json.dumps({'stage':'loading','model':MODEL,'revision':REVISION,'device':'cpu','available_gib':round(psutil.virtual_memory().available/2**30,1)}),flush=True)
    tokenizer=AutoTokenizer.from_pretrained(MODEL,revision=REVISION,trust_remote_code=False)
    def prefix(row):
        user=json.dumps({'message':row['message'],'context':row['context']},ensure_ascii=False,separators=(',',':'))
        return tokenizer.apply_chat_template([{'role':'system','content':SYSTEM},{'role':'user','content':user}],tokenize=True,add_generation_prompt=True,enable_thinking=False)
    examples=[]
    for row in training:
        prompt=prefix(row);answer=tokenizer.encode(json.dumps(row['target'],ensure_ascii=False,separators=(',',':'))+tokenizer.eos_token,add_special_tokens=False)
        ids=prompt+answer
        if len(ids)>args.max_seq:raise ValueError(f"{row['id']} has {len(ids)} tokens; refuse to truncate labels")
        examples.append((ids,[-100]*len(prompt)+answer))
    model=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,low_cpu_mem_usage=True,trust_remote_code=False,use_safetensors=True)
    report={'status':'RUNNING','model':MODEL,'revision':REVISION,'device':'cpu','method':'LoRA q_proj/v_proj rank 8','weights_trained':False,'data_sha256':hashlib.sha256(data_path.read_bytes()).hexdigest(),'train_count':len(training),'heldout_count':len(heldout),'max_tokens':max(len(x[0]) for x in examples),'evaluations':[],'loss':[]}
    def save_report():
        (args.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    def evaluate(variant):
        model.eval();model.config.use_cache=True
        for row in heldout:
            started=time.perf_counter();ids=torch.tensor([prefix(row)])
            with torch.inference_mode():
                result=model.generate(input_ids=ids,attention_mask=torch.ones_like(ids),max_new_tokens=220,do_sample=False,pad_token_id=tokenizer.eos_token_id)
            text=tokenizer.decode(result[0,len(ids[0]):],skip_special_tokens=True)
            item={'id':row['id'],'split':row['split'],'variant':variant,'pass':score(row,text),'seconds':round(time.perf_counter()-started,2),'prediction':text}
            report['evaluations'].append(item);save_report();print(json.dumps({k:item[k] for k in ('id','variant','pass','seconds')}),flush=True)
        model.config.use_cache=False
    print(json.dumps({'stage':'baseline_evaluation','max_training_tokens':report['max_tokens'],'train_examples':len(examples)}),flush=True)
    if args.baseline_report:
        old=json.loads(args.baseline_report.read_text(encoding='utf-8'))
        base_rows=[row for row in old['evaluations'] if row['variant']=='base']
        if old['revision']!=REVISION or old['data_sha256']!=report['data_sha256'] or {r['id'] for r in base_rows}!={r['id'] for r in heldout}:
            raise ValueError('Baseline cache does not match model/dataset')
        report['evaluations']=base_rows;save_report()
        print(json.dumps({'stage':'baseline_reused','cases':len(base_rows)}),flush=True)
    else:evaluate('base')
    model=get_peft_model(model,LoraConfig(r=8,lora_alpha=16,lora_dropout=0.05,target_modules=['q_proj','v_proj'],bias='none',task_type='CAUSAL_LM'))
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False});model.enable_input_require_grads();model.config.use_cache=False;model.train()
    parameters=[p for p in model.parameters() if p.requires_grad];report['trainable_parameters']=sum(p.numel() for p in parameters)
    optimizer=torch.optim.AdamW(parameters,lr=5e-4);order=list(range(len(examples)));random.shuffle(order);cursor=0;started=time.perf_counter();optimizer.zero_grad(set_to_none=True)
    for step in range(args.steps):
        if psutil.virtual_memory().available<600*2**20:
            report['stop_reason']='low_available_memory';break
        total=0
        for micro in range(2):
            if cursor>=len(order):random.shuffle(order);cursor=0
            ids,labels=examples[order[cursor]];cursor+=1
            inputs=torch.tensor([ids]);target=torch.tensor([value for value in labels if value!=-100])
            # Only the final response positions need the large vocabulary projection.
            logits=model(input_ids=inputs,attention_mask=torch.ones_like(inputs),logits_to_keep=len(target)+1).logits[0,:-1]
            loss=torch.nn.functional.cross_entropy(logits.float(),target)
            total+=float(loss.detach());(loss/2).backward()
        torch.nn.utils.clip_grad_norm_(parameters,1.0);optimizer.step();optimizer.zero_grad(set_to_none=True)
        item={'step':step+1,'loss':round(total/2,5),'elapsed_seconds':round(time.perf_counter()-started,1),'available_gib':round(psutil.virtual_memory().available/2**30,1)}
        report['loss'].append(item)
        if step==0 or (step+1)%4==0:print(json.dumps({'stage':'training',**item}),flush=True);save_report()
    report['completed_steps']=len(report['loss']);report['weights_trained']=any(float(p.detach().abs().sum())>0 for name,p in model.named_parameters() if 'lora_B' in name)
    model.save_pretrained(args.output,safe_serialization=True);tokenizer.save_pretrained(args.output)
    report['training_seconds']=round(time.perf_counter()-started,1);save_report()
    print(json.dumps({'stage':'adapter_saved','completed_steps':report['completed_steps'],'weights_trained':report['weights_trained']}),flush=True)
    evaluate('lora')
    report['scores']={variant:{split:sum(r['pass'] for r in report['evaluations'] if r['variant']==variant and r['split']==split) for split in ('dev','test')} for variant in ('base','lora')}
    report['status']='COMPLETE';report['production_enabled']=False;save_report();print(json.dumps({'stage':'complete','scores':report['scores'],'production_enabled':False}),flush=True)

if __name__=='__main__':main()
