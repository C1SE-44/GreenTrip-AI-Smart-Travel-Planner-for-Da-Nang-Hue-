# Nghiệm thu GreenTrip theo 6 tầng — 17/11/2026

## Kết luận theo hành vi

| Ca người dùng | Kết quả quan sát | Trạng thái |
|---|---|---|
| Hỏi green → giải thích → xin2vídụ ở Huế | Không card ở lượt giải thích; lượt nối tiếp trả đúng2card Huế, tên/thứ tự khớp chữ | PASS UI |
| Lưu liên tiếp2điểm → xếp5điểm trong4ngày | Cùng trip/slot, không reload; Ideas3→4→5; UI request IDs = scheduler_input_ids = IDs trong draft; không thêm/trùng điểm | PASS UI SQLite |
| Tạo → yêu cầu ngày2nhẹ hơn → làm rõ → Preview → Apply | Ngày2chỉ1POI nên bot hỏi cách làm nhẹ; chọn10h thì giờ09h→10h, ba ngày khác giữ nguyên; trước Apply chưa có lịch; sau Apply SQLite khớp draft | PASS UI, có1bước làm rõ |

Chạy liên tục cả3ca trên cùng chuyến/cùng màn hình trong mỗi lần thử. Chạy lại toàn bộ với cách nói khác, không phải chỉ kiểm các câu rời. Ca3 không giả vờ đã thay đổi khi ngày2vốn chỉ có1điểm.

## Môi trường và phạm vi bằng chứng

- UI sản phẩm thật `http://localhost:5173/my-trips`, TripOverviewView + TravelAssistant; không dùng `/__assistant-ui`.
- Ca lưu3→5và Apply dùng tài khoản SQLite QA, backend riêng `http://127.0.0.1:8019`. Playwright chuyển request của phiên kiểm thử từ port8000sang8019; cấu hình browser/backend của người dùng không đổi. POI fixture ghi rõ giả lập.
- Đã đăng nhập lại tài khoản thật người dùng cung cấp, kiểm trên đúng trip/5IDs trong ảnh: giải thích →2vídụHuế →preview5điểm/4ngày →chỉnh giờ ngày2. Ba ngày khác được so sánh bằng dữ liệu, không chỉ nhìn chữ. Không bấm Apply online, không lưu thêm/bớt Ideas online. Cache của phiên test riêng lấy5IDs từ context hội thoại; không truy cập cache Chrome cá nhân đang mở.
- Apply chỉ chạy SQLite. Nhánh UI thử lần này là rules, AI tắt ở fixture. Không lấy bằng chứng này để tuyên bố Gemini live hiểu mọi câu tự do.

## Ca1 — Hỏi, giải thích, tìm

| Tầng | Quan sát/đối chiếu |
|---|---|
|1Ngữ cảnh | Giữ cùng trip, slot1; nhớ chủ đề green; vẫn giữ3Ideas ban đầu. Câu định nghĩa không thay criteria hoặc last_ids (backend test). |
|2Hiểu yêu cầu | `explain_green` rồi `green_examples`. Cách nói lại: “Giải thích điểm xanh giúp tôi” →“Cho mình hai ví dụ ở Huế”. |
|3Nghiệp vụ | Lượt định nghĩa0POI; lượt ví dụ mới chạy tìm với city=Huế, green=true, count=2. Không lấy category cà phê của lượt cũ làm điều kiện bắt buộc. |
|4Kiểm kết quả | Đúng2IDs khác nhau, cả2cityHuế; tên từng POI xuất hiện trong câu chữ theo thứ tự card. Lý do dùng mô tả/nhãn địa phương/loại thiên nhiên-văn hóa có trong dữ liệu, không gọi đó là chứng nhận môi trường. |
|5Phản hồi | Định nghĩa trước; backend có nút “Xem ví dụ ở Huế”. Sau câu tìm mới hiện2card. Trong test chuỗi, câu xin ví dụ được nhập tay. |
|6UI/ghi thật | Ảnh `six-layer-green-0.png`, `six-layer-examples-0.png`; không lưu Ideas/lịch trong2lượt này. Trên tài khoản thật trả Đại Nội Huế và VOU Roastery; trace `green_examples`,0modelcalls. |

**Lỗi bắt được và sửa:** chưa giữ chủ đề cho “2vídụ”; câu tìm ở cuối có “4ngày” từng bị bounded search chặn mất nhánh lập lịch. Tách định nghĩa, nối tiếp chủ đề và ưu tiên tác vụ cả chuyến trước tìm POI.

## Ca2 — Lưu2điểm, xếp ngay không reload

| Tầng | Quan sát/đối chiếu |
|---|---|
|1Ngữ cảnh | Ban đầu3Ideas; gửi lưu card1với3IDs, lưu card2với4IDs; gửi yêu cầu xếp lịch với5IDs. Trip/slotkhông đổi. Tab Ý tưởng hiển thị5card. |
|2Hiểu yêu cầu | `card_action`/`ideas_saved` hai lần; sau đó `whole_trip_plan`. Câu “Xếp5điểm trong Ý tưởng thành lịch4ngày” và biến thể “Xếp đều…” đều là tạo nháp từ Ideas. |
|3Nghiệp vụ | Response.outcome ghi `requested_ids`, `scheduler_input_ids`, `used_ids`, `unresolved_ids`, `unscheduled_ids`. Script so sánh chính xác tập5IDs ở request, đầu vào scheduler và draft. Không cho phép ID ngoài Ideas. |
|4Kiểm kết quả |5IDskhác nhau, mỗiIDdùng1lần,4ngày. Nếu một IDkhông tìm được: partial/errorvà nêu IDchưa đối chiếu, không nói Ideasrỗng. Nếu điểm không xếp vừa: nêu tên và giới hạn thời gian/giờ mở cửa. |
|5Phản hồi | “Mình đã xếp5điểm trong4ngày. Đây là bản nháp, lịch hiện tại chưa thay đổi.” Có nút chỉnh các ngày thực sự có POI. |
|6UI/ghi thật | Ảnh `six-layer-plan-0.png`. Chỉ Ideas được cập nhật sau200/ideas_saved; chưa có itinerary trong SQLite trước Apply. |

**Phân biệt trạng thái đã test qua backend:**

- Không có idea_ids thật: `needs_clarification/empty_ideas`.
- Có IDnhưng không đối chiếu được POI: `error/unresolved_ideas`, hoặc `partial` nếu vẫn xếp được các điểm còn lại.
- Nguồn catalogue báo503: giữ lỗi503, không biến thành câu “chưa có Ý tưởng”.

**Đối chiếu lỗi cũ trên tài khoản thật:** UI5ID →request5ID →state còn focused_day=1 →bot báo chưa có Ý tưởng. Trace cũ không có scheduler_input_ids; nguyên nhân lấy stops của ngày đang focus được xác định từ state+code. Không trình bày con số đầu vào scheduler cũ như một giá trị đã ghi trực tiếp. Bản mới ghi rõ đầu vào thực tế và đã đối chiếu5=5=5.

## Ca3 — Tạo, chỉnh, Apply

| Tầng | Quan sát/đối chiếu |
|---|---|
|1Ngữ cảnh | Chỉnh chính draft vừa tạo của cùng trip/slot; giữ5Ideas. Nếu revision lịch đã đổi thì409, không lấy draft cũ để ghi đè. |
|2Hiểu yêu cầu | “Ngày2nhẹ hơn, đừng đổi ngày khác” /“Giảm nhịp ngày thứ hai, giữ nguyên phần còn lại” →scoped edit. Vì ngày2chỉ1POI, trả needs_clarification. |
|3Nghiệp vụ | Hỏi chọn cách làm nhẹ. Nút điền “Ngày2bắt đầu lúc10:00, giữ nguyên các ngày khác”. Gửi câu đó mới gọi edit_plan với đúng day2/start_after10:00. |
|4Kiểm kết quả | So sánh toàn bộ object ngày1,3,4 trước/sau: bằng nhau. Ngày2giữPOI/stopID, giờ09:00→10:00. Không trộn chỉnh thêm điểm cuối/ăn trưa vào nhánh đơn giản; ca nhiều thay đổi vẫn qua đường hiểu yêu cầu hiện có. |
|5Phản hồi | Nêu điểm/giờ thay đổi; nêu3ngày không đổi; hiện preview. Bấm nút hỏi tiếp chỉ điền input, không tự gửi hoặc Apply. |
|6UI/ghi thật | Trước Apply: SQLite itinerary=null. Click Apply riêng:200, đọc lại lịch khớp draft. Mapper DB bổ sung nullcho fieldtùy chọn; test so sánh nội dung sau chuẩn hóa null, không coi nullvà fieldvắng là thay đổi lịch. |

Ảnh: `six-layer-edit-0.png`, biến thể`-1.png`. Trên tài khoản thật đã kiểm preview chỉnh giờ riêng ngày2, chưa Apply online.

## Bản ghi đầy đủ

- `SIX_LAYER_UI_RECORDS.json`: mỗi lượt có layers.context/understanding/execution/validation/response/ui, kèm draft và xác nhận ApplySQLite cho cả2cách diễn đạt. Không có token/password.
- `qa-six-layers.mjs`: assertions cả nhãn/nội dung câu điền, ID, các ngày giữ nguyên và thời điểm ghi DB; kết thúc bằng PASS cho2biến thể.
- `REAL_ACCOUNT_RECHECK.json`: request/trace/kết quả thực của tài khoản người dùng ở5lượt giải thích →vídụ →lên lịch →hỏi rõ →chỉnh giờ.
- `QA_REAL_ACCOUNT_CONTEXT_FIX_2026-11-17.md`: căn nguyên những lỗi trước đó.

## Kiểm tra bổ sung và giới hạn

146 backend tests liên quan đạt; frontend typecheck/build đạt. Số test là regression bổ sung, kết luận3ca ở đầu dựa trên UI và đối chiếu dữ liệu.

Chưa khẳng định chatbot xử lý mọi câu tự do. Bản ghi complete của ca2xác nhận việc xếp đủIDs; giờ mở cửa chưa rõ và ETAgiữa các thành phố vẫn là hạn chế có cảnh báo trên preview. Một số endpoint đề xuất ngoài fixture trả404, ảnh/bản đồ ngoài localhost bị chặn trong phiên test; không chấm PASS cho các phần đó. Không thay model, bật billing, deploy hay ghi Supabaseonline.
