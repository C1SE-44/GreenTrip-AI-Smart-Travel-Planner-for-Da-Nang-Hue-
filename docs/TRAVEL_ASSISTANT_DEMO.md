# Trợ lý GreenTrip — demo 2026-11-16

## Kiểm UI sau mốc 162

Demo kiểm tay: `http://127.0.0.1:5177/__assistant-ui`, backend `http://127.0.0.1:8017`, SQLite riêng; cách khởi động/account QA/checklist ở [QA_ASSISTANT_UI_2026-11-16.md](QA_ASSISTANT_UI_2026-11-16.md). UI tự động hiện BLOCKED vì Chrome/Edge crash trước DOM; Gemini hiện có HTTP 503, không báo UI/model PASS. Có sửa một lỗi rules ở câu nối tiếp gần mốc qua API; suite liên quan **163 PASS**, typecheck/build và test assistant service qua. Các mốc bên dưới là lịch sử trước lượt kiểm UI này.

## Nghiệm thu bổ sung theo giai đoạn — 16/11/2026

Đã bổ sung local preference/giá theo người, kiểm city rõ ràng, tìm kiếm mới khác refine, lọc lại điều kiện khi compare, nearer theo tọa độ và preview ghi rõ phần đổi/giữ. Frontend chỉ nhận active_draft_id để gỡ nút Apply của preview bị hủy; giữ thiết kế. Suite backend liên quan **162 PASS**, typecheck/build PASS. Bốn JWT test đồng thời (mock model, SQLite thật) qua cả slow/quota/timeout; bốn câu mới đã được gọi Gemini thật, ca ăn tối kiểm lại sau sửa grammar value. Không ghi cloud DB.

UI thật còn BLOCKED; lint 10 lỗi và unit/tĩnh 3 lỗi nền vẫn còn, không báo toàn demo PASS. Báo cáo hiện hành và lệnh chạy lại hai luồng: [QA_ASSISTANT_ACCEPTANCE_2026-11-16.md](QA_ASSISTANT_ACCEPTANCE_2026-11-16.md). Phần dưới ghi lại mốc triển khai trước lượt nghiệm thu này.

## Cập nhật hội thoại theo ngữ cảnh — 16/11/2026

Đã sửa luồng backend để dùng trực tiếp delta đã xác thực từ Gemini, không dựng câu cho rules phân tích lại. Working state riêng theo tài khoản/chuyến/chế độ giữ bộ lọc, thứ tự thẻ, mốc, ngày đang chỉnh và bản nháp. Model chỉ nhận câu mới và context gọn liên quan; không nhận nguyên văn lịch sử chat, tên chuyến, ID nội bộ, toàn lịch hoặc toàn danh mục.

Hỗ trợ count/mix (3 điểm, chỉ 1 chùa), loại trừ nhóm/thẻ, bỏ riêng điều kiện gần mốc, xếp hạng theo thuộc tính đã có và nhiều edit trên cùng draft. Sửa sáng/giữ lunch/đổi điểm cuối không dựng lại cả ngày. Thiếu giờ thì hỏi một câu và giữ các yêu cầu còn lại. Lời chào/thẻ/nút rõ ràng đi rules; câu tự do dùng AI kể cả khi regex hiểu một phần. Model lỗi vẫn còn tìm đơn giản và thao tác thẻ, còn yêu cầu phức tạp giữ nguyên dữ liệu để người dùng thử lại.

Máy hiện tại giữ key trong `backend/.env`, local override đã được cho phép bật AI, model `gemini-3.5-flash-lite`, hạn mức 40 lượt/ngày. Source vẫn mặc định AI tắt; không bật billing hoặc grounding trả phí. Request dùng JSON grammar; backend kiểm lại giá trị, ID, giờ, quyền và phiên bản. Preview/Apply và guard Supabase giữ nguyên.

Chi tiết nguyên nhân, từng ca kiểm, lượt Gemini thật/mock, các lần thử lỗi và giới hạn: [QA_DIALOGUE_V2_2026-11-16.md](QA_DIALOGUE_V2_2026-11-16.md). Không thay UI và chưa kiểm lại UI bằng browser trong lượt này; không deploy hoặc ghi Supabase online.

## Đã triển khai

- Khám phá: nút **Hỏi trợ lý GreenTrip**, chọn chuyến trước khi lưu Ý tưởng. Trang chủ dùng cùng trợ lý, thay phản hồi giả.
- Ý tưởng: **Hỏi trợ lý AI** và gợi ý lịch. Lịch trình: **Trợ lý lên lịch**, chờ lưu sửa tay trước khi mở. Một component dùng chung hai chế độ.
- Bắt buộc đăng nhập; lịch sử server riêng theo tài khoản/chuyến/chế độ, giữ tối đa 80 tin. Không có bản chat trước đăng nhập.
- Lọc thành phố, nhóm địa điểm, khoảng giá có đơn vị, yên tĩnh và gần mốc thật trước PB09 ranking. Thành phố nói rõ thắng context; không lưu chéo thành phố. Không dùng LLM để tạo địa điểm hay SQL.
- Tối đa 5 thẻ/lượt, tên đậm + mô tả ngắn, mũi tên ngang, ảnh lazy 320px; ♥ tái dùng Đã lưu; bản đồ, lưu Ý tưởng và xem trước khi thêm vào ngày. Card cũ giữ ID thật; “chỗ thứ hai” theo thứ tự đã hiện.
- Gần mặc định 1 km, có thể mở 3 km kèm thông báo; yêu cầu “chỉ 1 km” không tự nới. Thiếu mốc thì hỏi, không tự lấy vị trí. Khoảng cách ghi rõ đường thẳng.
- Lịch từ ID đã lưu hoặc điểm người dùng chủ động chọn. Có thời lượng ghé, ăn/nghỉ và đệm di chuyển ×1,5; ×0,5 thời lượng ghé chỉ khi yêu cầu đi nhanh. Chỉnh ngày 2 giữ ngày khác và khung ăn/nghỉ đã nhập; giữ hoạt động đã bắt đầu.
- **Xem trước → Áp dụng**. Chat không tự ghi lịch. Xác thực owner, kiểm quá khứ, so phiên bản trong transaction; bản nháp dùng một lần. Sửa ở tab khác phải tạo lại nháp. Đổi ngân sách cũng cần xác nhận.
- Không tạo số CO₂/nhựa, tổng chi phí hay giờ mở cửa giả. Giá “từ” và thiếu đơn vị không được coi là trần. Giá /ly không biến thành giá /người. Trần /người đã biết vượt ngân sách thì hỏi lại ưu tiên.

Thử: `cà phê ở Huế dưới 100k` → `lưu chỗ thứ hai vào Ý tưởng` → mở Lên lịch → `Xếp lịch từ Ý tưởng` → **Áp dụng** → `Ngày 2 nhẹ hơn`.

## Chạy và chi phí

Chạy backend/frontend theo dự án hiện tại, không thêm dependency runtime:

```powershell
# Terminal 1, backend/
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
# Terminal 2, frontend/
npm run dev
```

Mặc định `ASSISTANT_AI_ENABLED=false`: dữ liệu/quy tắc chạy không cần API key và không gọi model. Đây là trợ lý có phạm vi, chưa phải LLM hội thoại mở; câu ngoài tiêu chí hỗ trợ có thể cần hỏi lại.

Gemini là lớp hội thoại/hiểu ý tùy chọn. Chỉ khi đã xác minh project Google dùng Free Tier **và không bật billing**, cấu hình **backend**, tuyệt đối không dùng biến `VITE_` cho key:

```text
ASSISTANT_AI_ENABLED=true
ASSISTANT_AI_FREE_TIER_CONFIRMED=true
ASSISTANT_AI_DAILY_LIMIT=40
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_API_KEY=<key riêng phía backend>
```

Model mặc định `gemini-3.5-flash-lite`, tối đa 768 output tokens/call; timeout kết nối 3 giây/đọc 12 giây, bộ đếm tổng theo ngày. Khi bật AI, lỗi/quota được báo rõ; không fallback model khác, Search grounding hay Maps có phí. Chỉ chấp nhận cấu hình model trong allowlist Flash-Lite đã đối chiếu giá. Lưu ý điều khoản dùng dữ liệu Free Tier.

Đã xem [giá Gemini](https://ai.google.dev/gemini-api/docs/pricing) và [structured output](https://ai.google.dev/gemini-api/docs/structured-output); đã gọi Gemini thật thành công trong lượt cấu hình tiếp theo. Hai cờ không tự kiểm chứng billing của Google nếu quản trị viên đổi tier sau này.

## Giới hạn demo

- Chat/nháp/context lưu SQLite riêng `backend/data/assistant_sessions.db`; đổi đường dẫn bằng `ASSISTANT_STORE_PATH`, không đặt trong public. Deploy cần đĩa bền vững; serverless/container thay mới có thể mất file. Nhiều instance cần chuyển store sang DB dùng chung.
- Ý tưởng/ngân sách dùng callback và cơ chế lưu `UserTrip` hiện tại; snapshot chat không thay thế API metadata. **Chưa đồng bộ Ý tưởng/ngân sách đa thiết bị.** Cache chuyến cũ vẫn dùng localStorage chung `greentrip_user_trips`; cần tách theo tài khoản trước khi dùng máy chung nhiều tài khoản. API chat tự kiểm owner, không tin cache client để cấp quyền lịch đã lưu.
- Nháp dùng ước tính từ tọa độ và tốc độ quy ước, chưa phải ETA đường bộ; thiếu tọa độ chừa 30 phút và nói rõ. Sau Apply, màn bản đồ dùng routing cũ. Chưa có né thi công/đường đóng thời gian thực.
- Chỉ dùng khung mở/đóng rõ ràng; giờ chưa rõ phải kiểm lại, không suy từ `open_now`. Chưa đủ ăn/ở/vận chuyển để bảo đảm tổng ngân sách.
- Legacy `/trips/copilot/chat` thêm yêu cầu đăng nhập; `PlannerCopilotDrawer` cũ vẫn giữ tương thích, không nằm trên UI mới.
- Giữ nguyên LandingPage, theme, F02/F03 và dependency runtime. Không commit/push/deploy hoặc bật billing.

## Điều kiện lưu lịch Supabase online

Kiểm tra chỉ đọc cho thấy ba bảng lịch trình chưa bật RLS và còn quyền Data API rộng cho `anon`/`authenticated`. App dùng JWT FastAPI riêng nên không gắn tùy tiện `auth.uid() = user_id`.

Để không ghi thêm lịch riêng vào bảng đang lộ, nhánh save có kiểm tra phiên bản của trợ lý **từ chối ghi PostgreSQL** cho đến khi ba bảng bật RLS và không cấp SELECT/INSERT/UPDATE/DELETE cho hai role client. Bản nháp được giữ; **demo SQLite vẫn lưu được**. Các API cũ không được coi là đã xử lý toàn bộ bảo mật nhờ guard mới.

[SQL đề xuất](sql/assistant_itinerary_privacy.review.sql) **chưa áp dụng online**. Xác minh backend role sở hữu bảng hoặc BYPASSRLS và client chỉ đi qua FastAPI trước khi áp dụng. Đây là thay đổi quyền DB dùng chung, tách khỏi demo code; không xóa bảng/dữ liệu/policy. Cần kiểm lại API đọc/lưu sau thay đổi.

## Kiểm thử và bằng chứng

- Backend: quyền truy cập, lịch sử, thứ tự thẻ, giá/đơn vị, bán kính, preview/apply, ngày riêng, quá khứ, CAS thật trên SQLite, ngân sách và guard online; regression PB14 legacy có đăng nhập, ngày/giờ, POI loading, tham số chuyến.
- Frontend: API serialization/cancellation, ID card và endpoint Apply riêng; typecheck/build. Browser dùng component và API thật, snapshot chỉ đọc **235 POI Huế**, SQLite/JWT/tài khoản test cục bộ riêng.
- Browser: login bắt buộc → tìm → lưu điểm thứ hai → đổi chế độ → preview → Apply thành công; đổi chuyến tách hội thoại; 320px không tràn ngang, chữ 12–14px. Không ghi DB online. Chưa kiểm ghi ♥ end-to-end trên PostgreSQL thật; adapter SQLite cũ của Saved Places thiếu schema/PostGIS.
- Baseline HEAD `a449fa0` đã được chạy riêng: có sẵn **3 test unit/tĩnh lỗi** (hover map, camera focus, parse date calendar) và **10 lỗi lint**. Không sửa module khác để làm xanh báo cáo. `npm test` toàn bộ còn có browser harness cũ timeout; không tuyên bố toàn suite xanh.
- Log/ảnh/source snapshot trước sửa: `outputs/chatbot-2026-11-16` trong workspace Codex. `frontend/assistant-harness.html` chỉ phục vụ dev/test, không là entry build production.
