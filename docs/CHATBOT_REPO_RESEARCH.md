# Repo tham khảo và hướng nâng GreenTrip — 17/11/2026

## Những repo đã đối chiếu

| Repo / nguồn chính | Có gì phù hợp | Áp dụng vào GreenTrip |
|---|---|---|
| [Google ADK Python](https://github.com/google/adk-python), Apache-2.0 | Công cụ, phiên/ngữ cảnh, evaluation theo chuỗi invocation và tool responses | Tiếp tục tách hiểu yêu cầu khỏi thực thi nghiệp vụ; đo nhánh chạy và kết quả thật. Không đổi cả backend sang framework mới trong bản demo. |
| [Pydantic AI](https://github.com/pydantic/pydantic-ai), MIT | Typed outputs, typed tools, bộ case/evaluator có expected output | Dùng schema Turn hiện có để kiểm target và output, không chấm bằng câu văn nghe hợp lý. |
| [DSPy](https://github.com/stanfordnlp/dspy), MIT | Tối ưu instructions/demonstrations bằng train set và metric | Tách train/dev/test, so baseline/candidate, không promote nếu chỉ hòa hoặc có regression. Không cài thêm cả DSPy để chạy một phép so sánh nhỏ. |
| [LangGraph](https://github.com/langchain-ai/langgraph), MIT | Persistence/checkpoints và human-in-the-loop | Đối chiếu mô hình lưu draft/context và checkpoint trước Apply; giữ guard hiện có thay vì tạo agent được tự ghi lịch. |
| [Hugging Face PEFT](https://github.com/huggingface/peft), Apache-2.0 | LoRA/adapter chỉ cập nhật một phần nhỏ tham số | Đã dùng thật cho nhánh fine-tune cục bộ Qwen3-0.6B bằng dữ liệu tổng hợp. |
| [Unsloth](https://github.com/unslothai/unsloth) | Repo thực hành local training và notebook cho các model mở | Tham khảo; máy quan sát chỉ có Intel Iris Xe nên chọn đường CPU Transformers + PEFT cho lần thử này. |

Nguồn mã cụ thể đã đọc: [ADK eval_case.py](https://github.com/google/adk-python/blob/main/src/google/adk/evaluation/eval_case.py), [DSPy BootstrapFewShot](https://github.com/stanfordnlp/dspy/blob/main/dspy/teleprompt/bootstrap.py), [Pydantic Evals dataset](https://github.com/pydantic/pydantic-ai/blob/main/pydantic_evals/pydantic_evals/dataset.py), [PEFT LoRA docs](https://huggingface.co/docs/peft/main/package_reference/lora). Không copy nguyên module của các repo vào ứng dụng.

## Phân biệt ba việc

- Dữ liệu POI thay đổi: cập nhật/truy vấn database, kiểm bằng chứng tên/loại/địa lý/giờ/giá. Không fine-tune lại chỉ để model biết quán mới.
- Đọc câu khách: có thể cải thiện bằng prompt có ví dụ hoặc fine-tune intent/delta parser. Bộ dữ liệu phải thể hiện giữ/thay/bỏ/loại trừ, quota từng nhóm và ngữ cảnh liên quan.
- Ghi lịch: vẫn do backend xác thực quyền và dữ liệu, qua Xem trước → Áp dụng. Model chỉ đề xuất ý định/thay đổi, không SQL/ID giả hay tự ghi dữ liệu.

## Gemini hiện tại

[Google xác nhận Gemini API/AI Studio hiện không có model hỗ trợ fine-tuning](https://aistudio.google.com/docs/model-tuning). Không đổi billing hoặc dịch vụ cloud trong lượt này. Đã thực hiện một phép tối ưu demonstrations có kiểm chứng riêng:

- Corpus assistant_dialogue_v1.json: 6 train / 4 dev / 4 test, tổng hợp thủ công, không export chat riêng.
- Gemini thật, cùng model cấu hình hiện có, 13 lần gọi trong lần chạy hoàn chỉnh (gồm retry).
- Baseline 4/4 dev; candidate thêm ví dụ cũng 4/4. Baseline được chọn và đạt 4/4 held-out.
- Candidate không được promote: không có bằng chứng tốt hơn trên phép đo này. Tập nhỏ không chứng minh chất lượng mọi hội thoại.
- Kết quả: ASSISTANT_PROMPT_EVAL.json. Script backend/scripts/evaluate_assistant.py mặc định chỉ validate; --live cần cấu hình Free Tier hiện có, có budget và gate promotion.

## Nhánh fine-tune thật theo lựa chọn người dùng

Model: [Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B), Apache-2.0, revision cố định c1899de289a04d12100db370d81485cdf75e47ca. Model card có chế độ enable_thinking=False; dùng chế độ này để học đầu ra JSON ngắn.

Hardware: RAM 16GB, Intel Iris Xe, 16 logical CPU threads; không quan sát được CUDA GPU. Dung lượng trống đủ cho môi trường và weights. Môi trường backend/.training/venv riêng: torch 2.9.1+cpu, transformers 4.57.6, peft 0.21.3, accelerate 1.16.0; không cài vào .venv của app.

Dữ liệu local_dialogue_v1.json: 166 mẫu train tổng hợp, 4 dev và 4 test tách riêng, tất cả target đã qua schema Turn thật. Chỉ huấn luyện cách hiểu ý định và tạo delta. Không đưa danh mục POI thật, lịch sử chat thật, ID tài khoản, email hoặc API key vào dataset.

Phương pháp: LoRA rank 8, q_proj/v_proj; CPU FP32, microbatch 1, accumulation 2, response-only loss, gradient checkpointing, 4 CPU threads. Base weights đóng băng; ma trận LoRA được cập nhật bằng gradient. Có metric model gốc trước train và model có adapter sau train; output còn phải qua schema production bằng validate_local_eval.py. Ghi lại loss, số bước thật, latency, held-out outputs và adapter safetensors.

Xem backend/training/README.md và report.json trong backend/.training/qwen3-greentrip-lora-v1 để có kết quả run. Model/adapter chưa được tự động bật trong GreenTrip. Chỉ xem xét thay provider khi output hợp schema, đúng nghiệp vụ và đáp ứng thời gian phản hồi. Không suy ra chất lượng production từ loss thấp hoặc vài câu thuộc template.

## Kết quả đã quan sát

Train đủ 64 bước, 1.146.880 tham số LoRA thay đổi, adapter safetensors 4.602.248 byte. Nạp lại adapter thành công. Kiểm contract production: base 0/8 → adapter 6/8; một câu mới sau reload vẫn đảo 2 café + 3 chùa thành 3 café + 2 chùa. Không bật provider local. Xem [báo cáo hành vi](LOCAL_LORA_RESULT.md), [output gốc](LOCAL_LORA_RUN.json), [nghiệm thu](LOCAL_ADAPTER_ACCEPTANCE.json).
