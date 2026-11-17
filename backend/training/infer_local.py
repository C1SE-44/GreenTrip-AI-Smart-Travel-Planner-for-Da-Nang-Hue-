"""Run the trained adapter locally without changing the GreenTrip backend provider."""
import argparse
import json
import os
from pathlib import Path
import time
from contract import SYSTEM
ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault('HF_HOME',str(ROOT/'.training'/'huggingface'))
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY','1')
os.environ.setdefault('TOKENIZERS_PARALLELISM','false')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--message',required=True);parser.add_argument('--context',default='{}');parser.add_argument('--adapter',type=Path,default=ROOT/'.training'/'qwen3-greentrip-lora-v1');args=parser.parse_args()
    if len(args.message)>1000:raise SystemExit('Message too long')
    if not (args.adapter/'adapter_model.safetensors').exists():raise SystemExit('Trained adapter is not available')
    import torch
    from transformers import AutoModelForCausalLM,AutoTokenizer
    from peft import PeftModel
    from train_lora import MODEL,REVISION
    torch.set_num_threads(4)
    tokenizer=AutoTokenizer.from_pretrained(str(args.adapter),local_files_only=True)
    base=AutoModelForCausalLM.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,local_files_only=True,trust_remote_code=False)
    model=PeftModel.from_pretrained(base,str(args.adapter),local_files_only=True);model.eval()
    user=json.dumps({'message':args.message,'context':json.loads(args.context)},ensure_ascii=False,separators=(',',':'))
    ids=tokenizer.apply_chat_template([{'role':'system','content':SYSTEM},{'role':'user','content':user}],tokenize=True,add_generation_prompt=True,enable_thinking=False,return_tensors='pt')
    started=time.perf_counter()
    with torch.inference_mode():generated=model.generate(input_ids=ids,attention_mask=torch.ones_like(ids),max_new_tokens=220,do_sample=False,pad_token_id=tokenizer.eos_token_id)
    print(json.dumps({'prediction':tokenizer.decode(generated[0,len(ids[0]):],skip_special_tokens=True),'seconds':round(time.perf_counter()-started,2),'provider':'local_lora_experimental'},ensure_ascii=False))

if __name__=='__main__':main()
