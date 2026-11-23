# Nghiệm thu chatbot GreenTrip theo giai đoạn — 16/11/2026

## Kết luận

Đã triển khai và kiểm các phần backend của giai đoạn 0–4; giai đoạn 5 mới đạt phần API đồng thời, typecheck và build. **Chưa nghiệm thu UI thật**, không báo toàn demo PASS. Không commit/push/deploy, không ghi Supabase online hoặc sửa guard PostgreSQL. Không thêm dependency, RAG, fine-tune, grounding Search/Maps hay bật billing.

## Mốc và đường đi tin nhắn

Mốc trước yêu cầu: 134 test backend liên quan đã qua ở lượt trước. Frontend đã biết có 3 test tĩnh lỗi và 10 lỗi lint; lượt này chạy lại để đối chiếu, không lấy lỗi nền làm lý do bỏ qua test mới.

`TravelAssistant.tsx` → `services/travelAssistant.ts` → FastAPI `/assistant/chat` → xác thực/owner → store riêng account/trip/mode → fast path hoặc `nlu.extract` → delta kiểm bằng Pydantic → search/PB09/card hoặc planning/preview → lưu working state. `/assistant/apply` vẫn kiểm owner, digest và CAS trước khi lưu qua repository được bảo vệ.

Gemini không bị đổi lại thành câu cho rules đọc lần nữa. Bộ kiểm tra thành phố chỉ ràng buộc địa danh khách nói rõ, có xử lý phủ định trực tiếp; không phân tích lại toàn bộ câu bằng rules. Model không sinh POI/ID/SQL hoặc tự lưu lịch.

Logger DEBUG `greentrip.assistant.route` và metadata test ghi route, reason, elapsed_ms, model_calls, intent và tên trường đổi/bỏ. `_model_calls=0` khi AI tắt hoặc bị chặn trước request, =1 khi thực sự thử HTTP, kể cả timeout. Không log raw chat, account/trip ID, key, hồ sơ hay provider body. Các output model lưu trong artifact live chỉ là dữ liệu giả lập do test chủ động tạo.

## Từng giai đoạn

| Giai đoạn | Trước sửa / test tái hiện | Thay đổi và kết quả |
|---|---|---|
| 0 — Luồng thực tế | Hai ca discover/planner thiếu elapsed_ms; test mới thất bại đúng chỗ này | PASS phần backend: thêm latency/model-count và kiểm fast path không gọi provider. Tái hiện search trên cả hai mode; tạo/sửa draft kiểm trong giai đoạn 3. |
| 1 — Ý định và điều kiện | Chưa có `local`, model chọn sai city vẫn lọt; thêm giới hạn giá trong lượt compare không lọc lại thẻ cũ | PASS backend: local set là bắt buộc, local prefer chỉ xếp hạng; city rõ ràng thắng context/model suy sai; compare dùng lại cùng lọc cứng trên tập ID đã thấy trước PB09. Kiểm giá /người khác /món, mixed quota thiếu điểm không bù sai nhóm, giá không biết không thành match. |
| 2 — Ngữ cảnh | Tìm bảo tàng mới còn dính trần tiền/bán kính của cà phê; đổi city giữ anchor cũ; so sánh khi chưa có card không hỏi | PASS backend: `search_scope=new/refine`, new xóa riêng working search cũ, giữ known city và draft lịch; refine chỉ sửa phần nêu. Đổi city bỏ anchor của city cũ. Câu tham chiếu chưa có danh sách hỏi một câu. Regression giữ reopen/thứ tự ID/loại trừ/đổi account-trip-mode. |
| 3 — Lịch | Chưa hỗ trợ nearer; preview chỉ nói chung chung; frontend giữ nút Apply của draft đã bị backend hủy; lượt nối tiếp nearer có thể thiếu tọa độ điểm gốc | PASS SQLite/API: nearer kiểm khoảng cách đường thẳng từ điểm trước, không lấy Ý tưởng đầu tiên mặc định. Thiếu tọa độ/không có ứng viên thật sự gần hơn thì hỏi, không tạo draft. Giữ POI gốc và POI trong preview để kiểm lại lượt sau. Preview nói giờ/điểm đổi và số hoạt động/ngày giữ. Backend trả active_draft_id, frontend cập nhật nút Apply theo ID đó. Luồng đầy đủ search → save ideas → plan → preview → Apply dùng repository SQLite thật. Kiểm ngày quá khứ/đã bắt đầu, stale revision, double Apply và owner. UI hiển thị thật còn BLOCKED. |
| 4 — Hội thoại/fallback | Lý do lấy nguyên mô tả, lặp tên; khi AI lỗi câu mixed có thể thành danh sách chùa; câu nối tiếp chưa hiểu lặp card cũ | PASS backend: mỗi điểm tên + lý do từ nhãn/giá/khoảng cách có dữ liệu. Không lặp câu hỏi cuối khi đã có kết quả. Câu fallback phức tạp hoặc chưa đọc được tiêu chí hỏi lại, không replay card cũ; kết quả fallback đơn giản nói rõ chỉ dùng bộ lọc đã đọc được. Test AI off, timeout, 429 và JSON/schema sai; nút và tìm cơ bản vẫn hoạt động. |
| 5 — Nghiệm thu | Cần kiểm cạnh tranh và kiểm UI mới | PASS phần API: 4 JWT test riêng gửi gần đồng thời, cả slow-model và hai phiên quota/timeout. Các model call cùng chờ, history vẫn trả trước khi mở khóa; save/Apply đúng chuyến, cross-owner 403, token giả 401. Typecheck/build PASS. UI thật/four-browser-session còn BLOCKED; không thay bằng kết quả API để báo UI PASS. |

Mọi test lỗi được chạy trước thay đổi tương ứng, rồi chạy lại cùng regression. Có sửa lỗi test-fixture khi mô phỏng frontend quên gửi idea_ids vừa cập nhật, và đổi giờ thử không xung đột lunch ở ca chỉ kiểm stale revision; đây là sửa dữ liệu thử, không nới kiểm tra giờ.

## Bốn phiên đồng thời

`test_stage5_four_authenticated_sessions_parallel_without_locking_model_or_leaking` chạy hai kịch bản:

1. Bốn tài khoản/chuyến, JWT encode/decode thật với secret test riêng, bốn model response **mock** cùng bị giữ bằng barrier/event. Trong lúc cả bốn đang chờ model, GET history của một phiên vẫn hoàn tất và không có phản hồi chat chưa xong.
2. Lặp lại với một phiên quota, một phiên timeout; tìm cơ bản và thao tác thẻ vẫn được. Sau đó cả bốn lưu Ý tưởng, tạo draft, xác minh DB lịch chưa đổi, Apply gần đồng thời và kiểm POI theo đúng chuyến.

Dùng FastAPI router thật và SQLite trong tmp_path; không khởi động lifespan app chính, không dùng auth user thật, không gọi cloud database. Đây là kiểm API với bốn phiên xác thực, **không phải** bốn phiên đăng nhập bằng UI.

## Gemini thật

Script `outputs/assistant-acceptance-live.py` trong workspace Codex dùng key `.env` hiện có, cờ Free Tier đã xác nhận từ lượt cấu hình trước, `gemini-3.5-flash-lite`; store và quota test trong thư mục tạm riêng, cap 4 request/run. Không đổi `.env`, counter người dùng hoặc bật billing. Không gọi Apply.

Các câu mới chưa có trong unit test:

- Ăn tối ở Huế, ưu tiên quán địa phương, không trên 150 nghìn/người: lần đầu fallback; kiểm đích phát hiện model bỏ value của local preference. Siết JSON grammar bắt buộc `field/op/value`, keep/clear dùng null, rồi gọi lại thật **PASS**: quán có nhãn địa phương đứng trước, quán khác vẫn còn nếu đủ giới hạn; không trộn giá /món vào /người.
- Đổi hẳn sang bảo tàng, không dùng điều kiện ăn uống trước: **PASS live**, model chọn search_scope=new.
- Hai chỗ vừa xem, ưu tiên ngồi nói chuyện cả nhóm: **PASS live**, ambience preference xếp đúng điểm có nhãn phù hợp nhóm.
- Ngày thứ hai xuất phát 10h, giữ lunch, đổi điểm chót gần điểm trước: **PASS live**, giữ lunch/điểm chiều, thay đúng POI và không lưu thật.

Ba ca sau chạy trước lần siết value; ca ăn tối đã gọi kiểm đích lại sau sửa. Không nói rằng toàn bộ suite live đã chạy lại trên mọi phiên bản giao thức. Không tự retry provider ở runtime, chỉ có những lần thử dev được ghi riêng. AI vẫn có thể lỗi mạng/quota hoặc hiểu sai cách nói mới; backend giữ kiểm tra và Preview/Apply.

Artifact: `outputs/assistant-acceptance-live.json` giữ lượt thử có lỗi; `outputs/assistant-acceptance-live-targeted.json` giữ ca ăn tối đã qua sau sửa. Không chứa key. Việc quán thật mở buổi tối hay yên tĩnh thực địa còn phụ thuộc dữ liệu giờ mở cửa/nhãn hiện có; không có dịch vụ xác minh thực địa.

## Lệnh kiểm và kết quả

Backend, từ thư mục `backend`:

Kết quả cuối: **162 PASS**, 1 cảnh báo Starlette/httpx có sẵn. Đây là suite liên quan được chọn, không phải tuyên bố toàn backend repository xanh.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_assistant_acceptance.py tests/test_dialogue_deltas.py tests/test_gemini_dialogue.py tests/test_travel_assistant.py tests/test_copilot_chat.py tests/test_schedule_validation.py tests/test_poi_loading_contract.py tests/test_trip_parameters.py tests/test_config.py -q
```

Frontend, từ `frontend`: `npm run typecheck`, `npm run build`, `npm run lint`. Cả typecheck/build PASS; build còn cảnh báo bundle lớn có sẵn. Lint: 10 error, 139 warning, không có lỗi ở hai file assistant vừa sửa. Không sửa module ngoài phạm vi để làm xanh lint.

`npm test` có chạy browser harness cũ, báo `GreenTrip planner flows in a real Chromium browser` thất bại rồi không thoát; đã dừng tiến trình test do lượt này khởi tạo. Chưa có kết luận nguyên nhân browser harness từ output đó. Chạy riêng 10 file test không mở browser: 51 PASS / 3 FAIL, khớp ba lỗi nền đã ghi trước (debounced hover, city camera, calendar parseStartDateFromTrip). Log ở `outputs/assistant-acceptance-frontend-{lint,tests,unit}.txt` của workspace.

Computer Use đã chặn điều khiển browser vì không xác định URL Windows đủ chắc, yêu cầu dừng lượt trước. Không vượt chặn bằng cách điều khiển browser người dùng qua cách khác. Vì vậy chưa kiểm tương tác card/history/draft trên UI thật và chưa kiểm bốn browser session. Cần một phiên công cụ trình duyệt hoạt động trên URL test xác định, hoặc người kiểm thử chạy thủ công trên môi trường SQLite tách biệt; không áp dụng vào DB online để thử.

## Chạy lại hai luồng demo an toàn

1. **Khám phá:** chạy test `-k "stage1 or stage2"` trong file acceptance và các ca follow-up ở `test_dialogue_deltas.py`. Dữ liệu giả có city/giá/nhãn/khoảng cách rõ ràng; thử tìm → ưu tiên → loại trừ → bỏ mốc → tham chiếu thẻ. Kiểm trace route và các trường giữ/đổi/bỏ. Câu chào kèm yêu cầu ở cả discover/planner được kiểm riêng ở stage0.
2. **Lên lịch:** chạy `-k stage3` trong file acceptance: search → save ideas → draft → sửa ngày → kiểm DB chưa đổi → Apply → kiểm DB chỉ đổi phần cho phép. Chạy `-k stage5` để lặp hai kịch bản bốn phiên JWT. Không cần server online hoặc tài khoản Supabase.

```powershell
# Khám phá
.\.venv\Scripts\python.exe -m pytest tests/test_assistant_acceptance.py -q -k "stage1 or stage2"
# Lên lịch và bốn phiên
.\.venv\Scripts\python.exe -m pytest tests/test_assistant_acceptance.py -q -k "stage3 or stage5"
```

Chạy live độc lập bằng Python của backend và đường dẫn script workspace nêu trên; dữ liệu/store vẫn là test, key không đi vào frontend hoặc file báo cáo. Không dùng nút Apply trên môi trường PostgreSQL online để thay thế demo SQLite.

Hai file frontend chỉ thêm nhận active_draft_id và cập nhật trạng thái preview, không đổi bố cục/màu/typography. Landing SHA256 vẫn `2abe196d48f15d038a1004011e2742101dc05ece93ebe13691388266c3dabe37`. Graphify đã refresh code-only, không gửi tài liệu/key ra dịch vụ khác. Chưa review nhóm/CI, không tuyên bố hoàn tất DoD phát hành.
