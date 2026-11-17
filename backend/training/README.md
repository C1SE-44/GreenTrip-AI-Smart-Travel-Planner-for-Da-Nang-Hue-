# GreenTrip local LoRA experiment

This trains a small intent/delta parser, not a POI database, factual travel guide or direct database-writing agent.

Base: [Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B), Apache-2.0, pinned revision `c1899de289a04d12100db370d81485cdf75e47ca`. Training uses [Hugging Face PEFT](https://github.com/huggingface/peft) LoRA on q_proj/v_proj; [Transformers](https://github.com/huggingface/transformers) loads safetensors with trust_remote_code=False. Unsloth was reviewed but the installed machine has Intel Iris Xe, not a CUDA GPU; this run uses the CPU PEFT path.

Hardware observed: 16 GB RAM, roughly 5.8 GB free at inspection, Intel Iris Xe, 16 logical CPU threads. No CUDA device. Uses 4 CPU threads, microbatch 1, accumulation 2, rank 8, FP32, checkpointed gradients. The training environment/cache/weights are under backend/.training, excluded by backend/.gitignore. Application .venv and runtime model configuration are not changed.

Data: local_dialogue_v1.json, 166 synthetic training rows, 4 development rows and 4 held-out test rows. Targets pass GreenTrip's current Turn schema; account IDs, emails, credentials and real user chats are not exported. Held-out messages do not occur in training. This is a small template-generated experiment, not evidence of broad conversational generalization.

Windows commands from repo root:

```powershell
backend/.venv/Scripts/python.exe -m venv backend/.training/venv
backend/.training/venv/Scripts/python.exe -m pip install -r backend/training/requirements-cpu.txt
$env:PYTHONUTF8='1'
backend/.training/venv/Scripts/python.exe -u backend/training/train_lora.py --steps 64 --threads 4
```

The trainer measures base outputs first, updates LoRA weights with response-only token loss, checks that LoRA B weights changed, saves a safetensors adapter, and measures the same held-out inputs after training. It refuses truncation of labels and stops training if available RAM falls below its memory threshold. report.json stores actual steps, loss, measured output/latency and scores; production_enabled remains false until a separate application acceptance gate is met. No server/billing is provisioned and no itinerary database is written.


Local inference after an adapter passes inspection:

```powershell
backend/.training/venv/Scripts/python.exe backend/training/infer_local.py --message "Tìm 3 quán cà phê và 2 chùa ở Huế"
```

This CLI does not save trip/chat data or switch the production provider. It returns the experimental model prediction; use the existing backend Turn validator before executing any operation based on that output.


Acceptance: run `backend/.venv/Scripts/python.exe backend/scripts/validate_local_eval.py` only after training completes. The report validates the production Turn schema and compares the complete normalized contract, rejecting extra operations as well as missing ones. Eight held-out cases are only a pilot measurement. The 64-step run processes 128 examples from the shuffled 166-example training pool (microbatch 1 x accumulation 2), not 64 full epochs.

The optional Gemini demonstrations experiment is separate from LoRA. A prompt release is loaded at application import; restart the backend after a future successful promotion. This run did not promote a candidate because baseline and candidate tied.
