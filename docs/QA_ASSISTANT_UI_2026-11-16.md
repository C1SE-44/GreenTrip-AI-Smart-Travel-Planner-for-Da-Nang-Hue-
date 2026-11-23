# Nghiệm thu UI trợ lý — 16/11/2026

**Kết luận: UI thật BLOCKED, không báo UI PASS.** Có xác minh URL/HTTP của frontend và backend demo; có kiểm API thật trên SQLite riêng, sửa một lỗi rules tái hiện được. Không thay tính năng hoặc giao diện sản phẩm, không ghi Supabase online, không bật billing, không deploy.

## Môi trường đang mở và cách chạy lại

Không khởi động lại backend chính `app.main`: lifespan có seed dữ liệu và cấu hình hiện tại có thể trỏ DB online. Dùng router/component thật trong fixture riêng:

- Frontend: **http://127.0.0.1:5177/__assistant-ui**. Log thực tế: `QA_FRONTEND_URL=http://127.0.0.1:5177/__assistant-ui`, `QA_API_TARGET=http://127.0.0.1:8017 (isolated SQLite only)`.
- Backend: **http://127.0.0.1:8017**. Log thực tế: `QA_BACKEND_URL=http://127.0.0.1:8017`, Uvicorn `Application startup complete`, `Uvicorn running on http://127.0.0.1:8017`.
- GET frontend trả HTTP 200, entry là `travel-assistant-harness.tsx`; GET `/health` trả `database=isolated-sqlite`, `online_database=false`.
- Backend dùng DB/chat store tạm riêng, JWT secret test riêng, user/POI giả lập trong SQLite; không import lifespan app chính. Search/ranking, assistant router, xác thực JWT, itinerary repository/Apply là code thật. Đọc kho ♥ trả fixture rỗng vì không nằm trong luồng kiểm này.
- Frontend dùng chính `TravelAssistant` và stylesheet hiện có; không mock response chat trong browser. Chỉ bổ sung nút QA đóng/mở, đổi A/B, tắt/bật AI và bảng đối chiếu lịch đã lưu sau Apply. Chuyến A/B giữ Ý tưởng riêng trong harness. Không sửa bố cục sản phẩm.

Mở hai terminal riêng, từ root repo:

```powershell
# Terminal backend; AI mặc định tắt trong demo để tránh gọi provider đang lỗi.
cd backend
$env:QA_AI_ENABLED='0'
.\.venv\Scripts\python.exe -u tests/assistant_ui_server.py

# Terminal frontend
cd frontend
node tests/assistant-ui-server.mjs
```

Mỗi lần backend khởi động là DB test mới; không xóa DB người dùng. Cổng đã có tiến trình thì dừng đúng tiến trình demo của lần trước, không dừng app chính. Bản bàn giao được mở lại với DB sạch, AI tắt; `.env` và cờ AI của app chính không thay đổi.

Account **chỉ trong demo này**: `assistant-qa@example.test` / `AssistantQA123!`. Không phải tài khoản online. Đăng nhập bằng form **Đăng nhập QA** trong harness. Endpoint `/qa/state?trip_id=assistant-qa-trip-a&mode=planner` có JWT để đối chiếu SQLite; `/qa/ai` chỉ đổi cờ của tiến trình demo, không ghi config sản phẩm.

## Bước UI bị chặn chính xác

Computer Use ở lượt trước đã không xác định chắc URL browser Windows. Lượt này dùng phương án thay thế được yêu cầu: driver Chromium headless giống browser harness hiện có. Playwright/Puppeteer không được cài trong frontend; không thêm dependency.

1. Chrome được spawn với profile test mới, `--headless=new`, remote debugging và sandbox mặc định. Crashpad báo `TransactNamedPipe: The pipe has been ended (0x6D)` và `crash server failed to launch, self-terminating`; exit **4294930433**. Chưa có cổng DevTools ổn định.
2. Edge tạo cổng DevTools rồi báo `CreateAppContainerProfile failed ... HRESULT 0x80070057` và crash-server error; exit **3221225477** trước khi giữ được renderer để thao tác DOM.
3. Thử Chrome bằng profile mới trong workspace thay vì thư mục Temp của sandbox: vẫn cùng lỗi Crashpad, exit **4294930433**.

**Điểm dừng:** sau spawn browser, trước khi đọc DOM/nhập câu/nhấn nút. Chưa chụp được screenshot, chưa quan sát card/history/preview/Apply trong browser, chưa kiểm console/reflow. Không dùng `--no-sandbox`, không đổi Windows security, không can thiệp profile browser thật của người dùng để vượt chặn.

Vì vậy cả ba luồng UI bên dưới đều BLOCKED, dù API tương ứng có những bước PASS. Cần chạy lại trên browser của người kiểm thử hoặc môi trường Chromium khởi động được với sandbox thông thường.

## Lỗi/giới hạn ghi nhận trong lượt này

| Nơi quan sát | Câu nhập / bước | Kỳ vọng | Thực tế và nhánh | Xử lý |
|---|---|---|---|---|
| Browser startup | Mở URL frontend demo | Có DOM để nhập ba luồng | Chrome/Edge crash như trên; chưa có nhánh chat | UI BLOCKED; không sửa lỗi nền hệ điều hành, cung cấp checklist tay |
| API thật, Gemini thật | “Chào, chọn giúp mình hai quán cà phê ở Huế, mỗi ly tối đa 80k, quanh Chùa Demo khoảng một cây số.” | Hai quán cafe Huế, giữ số lượng/giá/mốc | Không có card; hỏi lại. Trace `fallback/unavailable`, model_calls=1. Đã xác nhận provider HTTP **503** bằng metadata riêng, không chứa chat/key. | Không báo Gemini PASS. Dừng retry provider sau các lần tái hiện; lỗi ngoài app, không bật billing hay thay model để né |
| API thật, AI tắt | “Tìm cà phê ở Huế dưới 80k” → “Chỉ trong 1 km quanh Chùa Demo nhé” | Giữ cafe/Huế/80k, chỉ thêm radius | Trước sửa: category bị đổi thành `temple`, trả rỗng, `rules/ai_disabled`. | Viết test chạy FAIL trước; sửa `criteria` chỉ nhận loại mục tiêu trước phần mốc `gần/quanh`. Không khớp nguyên câu/ID. Test và HTTP demo chạy lại PASS |

Sửa sản phẩm duy nhất trong lượt: parser rules trong `backend/app/assistant/search.py` tách mốc quan hệ khỏi category mục tiêu. Còn lại là fixture/harness, test và tài liệu; không thêm khả năng chatbot mới.

## Phần chỉ kiểm qua backend — không phải UI PASS

Sau sửa parser, dùng HTTP với JWT đăng nhập thật vào backend demo đang chạy, AI tắt, không mock model:

1. `Tìm cà phê ở Huế dưới 80k` → hai quán; `Chỉ trong 1 km quanh Chùa Demo nhé` → vẫn hai cafe, criteria giữ Huế/80k; `Dưới 65k nhé` → chỉ quán có upper bound phù hợp. Cả ba `rules`, model_calls=0.
2. Lưu hai ID từ các thẻ đã từng hiện bằng thao tác tương đương nút **Lưu vào Ý tưởng**; `rules/card_action`. `Xếp lịch từ Ý tưởng` → preview, `rules/explicit_action`; GET state xác nhận chưa có lịch. Apply → `itinerary_saved`, SQLite có POI đã chọn; Apply lại → 409. Đây là request HTTP, chưa nhấn nút thật trong browser.
3. Đổi trip ID sang B, history và lịch ban đầu rỗng. `Tìm cà phê Đà Nẵng dưới 60k` → đúng thẻ Đà Nẵng, `rules/ai_disabled`, model_calls=0. `Ngày thứ hai bắt đầu muộn hơn, giữ chỗ ăn trưa rồi thay riêng điểm cuối.` → hỏi một câu, không card/preview/lịch. Đối chiếu lịch A không đổi.

Các câu hội thoại tự do yêu cầu Gemini của luồng 1 chưa đạt kiểm live trong lượt này do 503. Các ca Gemini PASS từ lượt trước không được dùng thay cho kết quả UI/lượt này.

Artifact trong workspace Codex `outputs/`:

- `ui-acceptance-first-failure.json`, `ui-acceptance-backend-check.json`: câu tự do bị fallback và kết quả thực tế.
- `ui-provider-diagnostics.json`: HTTP status/finish metadata, không key/body provider.
- `ui-acceptance-rules-check.json`: chín bước HTTP PASS và invariant DB trước Apply / double Apply / cách ly A-B. Trường `ui_observed=false`.
- `ui-acceptance-backend-check.py --rules-only`: chạy lại trên backend demo **sạch**; không chạy trên app chính. Không tự gọi API online khác.

Regression: **163 backend test liên quan PASS** (mốc 162 + một test mới), frontend typecheck/build PASS, hai test service assistant PASS, eslint hai file harness PASS. Cảnh báo bundle lớn/Starlette có sẵn; không sửa lint/unit nền ngoài phạm vi. Không tuyên bố toàn repo hoặc UI xanh.

## Checklist thao tác tay

Chuẩn bị: hai URL đúng log, backend sạch; mở harness bằng browser bình thường, dùng account QA ở trên. Giữ DevTools Network/Console để ghi status/trace/error. Với mỗi bước ghi PASS/FAIL/BLOCKED, câu nhập và ảnh/chữ thực tế. Không đổi API target sang backend `:8000` hoặc deploy.

### 1. Khám phá nhiều lượt, giữ/đổi điều kiện

- [ ] Chọn **Khám phá**, chuyến A. Đăng nhập QA. Bật AI demo chỉ khi cấu hình Free Tier được xác nhận. Nếu HTTP 503/429 thì ghi BLOCKED cho ca cần model, không đổi sang mock để báo UI PASS.
- [ ] Nhập: “Chào, chọn giúp mình hai quán cà phê ở Huế, mỗi ly tối đa 80k, quanh Chùa Demo khoảng một cây số.” Kỳ vọng hai thẻ cafe đúng Huế, giá trong trần, badge khoảng cách đường thẳng; tên/lý do/thứ tự khớp.
- [ ] Nhập: “Vẫn giữ mức tiền ấy nhé, nhưng bỏ giới hạn quanh ngôi chùa đi.” Kỳ vọng bỏ distance, vẫn cafe/Huế/80k; không chuyển sang tìm chùa.
- [ ] Nhập: “Loại quán đang đứng đầu khỏi các gợi ý sau, các điều kiện khác cứ giữ vậy.” Kỳ vọng không lặp ID thẻ đầu; thiếu điểm thì trả ít, không bù bằng nhóm sai.
- [ ] **Đóng chat QA → Mở chat QA**: history còn đúng A. Kiểm câu “chỗ thứ hai” theo danh sách đang được nhắc, thiếu hai thẻ phải hỏi; không tự chọn thẻ khác.
- [ ] Nếu AI đang lỗi, có thể kiểm riêng nhánh rules bằng ba câu `Tìm cà phê ở Huế dưới 80k` → `Chỉ trong 1 km quanh Chùa Demo nhé` → `Dưới 65k nhé`. Đây là ca fallback/rules riêng, không thay thế PASS cho hội thoại Gemini phía trên.

### 2. Lưu Ý tưởng → xếp → preview → Apply (SQLite)

- [ ] Có hai thẻ cafe ở danh sách ban đầu; có thể cuộn lại thẻ lịch sử đã thấy. Bấm **Lưu vào Ý tưởng** từng thẻ, chờ hết loading; bộ đếm lần lượt 1/2. Không tự tim ♥.
- [ ] Chuyển **Lên lịch** trên cùng A; bộ đếm Ý tưởng vẫn 2. Có thể tắt AI demo để kiểm đường nút không gọi model.
- [ ] Bấm **Xếp lịch từ Ý tưởng**. Kỳ vọng panel “Xem trước · Chưa thay đổi lịch”, POI đúng các ID đã lưu. Network chưa có `/assistant/apply`; GET `/qa/state` chưa có itinerary.
- [ ] Bấm **Áp dụng** đúng một lần. Kỳ vọng thông báo đã áp dụng, panel Apply cũ biến mất và phần **Lịch đã lưu SQLite** hiện đúng tên/giờ. GET state có lịch; không có request đến Supabase.
- [ ] Đóng/mở chat: không hiện lại nút Apply của draft đã dùng. Nếu gửi lại draft cũ bằng API thì phải 409, không tạo bản ghi trùng.

### 3. Đổi chuyến kết hợp AI tắt

- [ ] Tắt AI demo; nhãn hiện “Tắt”. Bấm **Đổi chuyến A/B**, xác nhận ID/title là B, Ý tưởng=0, không có chat/preview của A.
- [ ] Chọn Khám phá, nhập “Tìm cà phê Đà Nẵng dưới 60k”. Kỳ vọng thẻ Đà Nẵng; trace rules/ai_disabled, model_calls=0. Search không tự đổi điểm đến của chuyến B.
- [ ] B vẫn là chuyến Huế: thử Lưu thẻ Đà Nẵng phải yêu cầu chọn chuyến phù hợp, không lưu chéo city.
- [ ] Nhập “Ngày thứ hai bắt đầu muộn hơn, giữ chỗ ăn trưa rồi thay riêng điểm cuối.” Kỳ vọng hỏi lại vì AI tắt; không tạo draft hoặc sửa lịch A/B.
- [ ] Đổi về A: chỉ history/Ý tưởng/lịch của A trở lại, không mang chat B. Thử đổi khi đang loading: phản hồi cũ không được gắn vào chuyến mới; vùng nhập không đứng vĩnh viễn.

Cuối cùng kiểm desktop và chiều rộng 320px: đọc được tên/giá, card cuộn ngang và điều hướng bàn phím được; không tràn trang, không exception mới trong Console. Những ô này hiện **chưa được agent đánh dấu** vì browser không chạy được.
