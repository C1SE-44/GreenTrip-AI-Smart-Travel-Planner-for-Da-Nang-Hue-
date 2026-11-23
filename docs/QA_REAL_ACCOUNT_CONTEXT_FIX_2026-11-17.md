# Kiểm lại tài khoản thật — lỗi hội thoại và xếp 5 Ý tưởng, 2026-11-17

## Môi trường và đăng nhập
Đã dùng Playwright Chrome ở `http://localhost:5173/login`, điền email → Tiếp tục → mật khẩu → Đăng nhập. Sau đó kiểm `http://localhost:5173/my-trips` với backend thật `http://127.0.0.1:8000`, không chuyển sang fixture/harness. Phiên browser riêng; khôi phục metadata chuyến và 5 idea_ids từ đúng context hội thoại server-side SQLite sang cache của phiên kiểm thử riêng. Không đọc cache Chrome cá nhân, không sửa cache trình duyệt người dùng đang mở. Đây là cùng tài khoản/trip/POIs, không phải chia sẻ cookie từ cửa sổ Chrome người dùng.

Tài khoản/mật khẩu chỉ đưa vào lúc chạy qua stdin; script không chứa mật khẩu/token. Không commit secrets. Script chặn Apply và chặn mọi request ghi sau đăng nhập ngoài `/assistant/chat`. Không bấm Apply, không lưu Ý tưởng mới, không ghi lịch Supabase. Các lượt chat kiểm thử được thêm vào lịch sử cục bộ như thao tác chat bình thường.

## Tái hiện và nguyên nhân
- Đã đọc đúng scope chuyến trong ảnh, nhận đủ 5 ID. Trace lỗi cũ là `gemini/structured_turn`, 1 model call. Không phải Gemini chưa bật hay FE gửi thiếu Ý tưởng.
- State còn `focused_day=1`. Khi intent=plan nhưng không chỉ định ngày, backend vẫn lấy ngày đang focus. Mốc này lấn át yêu cầu cả chuyến, lấy stops trống và báo sai không có Ý tưởng.
- Câu `địa điểm green là gì` có trace Gemini set green rồi trả lại danh sách cà phê Huế. Đây là nhầm câu hỏi định nghĩa với tìm địa điểm.
- Khi kiểm UI sau sửa lần đầu, còn 1 ID ngoài 5 Ý tưởng. Định vị thêm lỗi bỏ dấu: parser tham chiếu hiểu `cho 5 địa điểm` thành `chỗ 5`, lấy kết quả cũ thứ năm làm target và append vào lịch. Đã sửa parser và kiểm tập ID chính xác.

## Sửa
- Nhận phạm vi cả chuyến theo tác vụ + thời lượng, phân biệt `4 ngày` và `ngày 4`. Yêu cầu đầy đủ, rõ ràng chạy rules, bỏ focus cũ cho lượt đó.
- Xếp lại cả chuyến từ baseline lịch hiện tại, không lấy toàn bộ bản nháp cũ. Chỉ các POI đã chọn được đưa vào bản nháp mới; giữ bảo vệ ngày đã qua/hoạt động đã bắt đầu và hoạt động không phải POI. Đây vẫn là Preview; CAS/Apply guard giữ nguyên.
- Chia 5 POI qua 4 ngày thành 2–1–1–1 nếu dữ liệu/giờ cho phép, thay vì dồn 5 điểm vào ngày đầu.
- Câu hỏi nghĩa của green/điểm xanh/eco score dùng lời giải thích chức năng có giới hạn dữ liệu; không gọi model, không đổi criteria/last_ids, không tự gợi ý danh sách.
- Parser tham chiếu giữ phân biệt `cho` và `chỗ`; không lấy số lượng trong `cho 5 địa điểm` làm vị trí thẻ. Kiểm thêm các cách diễn đạt khác của yêu cầu cả chuyến.

## Kết quả
| Ca | Tin nhắn | Kỳ vọng | Quan sát thực | Nhánh | Trạng thái |
|---|---|---|---|---|---|
| Đăng nhập | Email → mật khẩu → Đăng nhập | Tài khoản thật ở /my-trips | UI hiện ha và chuyến có 5 Ý tưởng | UI + auth thật | PASS |
| Giải thích | địa điểm green là gì | Giải thích, 0 card, không đổi điều kiện | HTTP200, text giải thích, pois=[] | rules/explain_green, 0 call | PASS UI |
| Lên lịch | bạn có lên lịch trình 4 ngày cho 5 địa điểm ở ý tưởng được không | Dùng đúng 5 IDs, preview4ngày | HTTP200, IDs trùng chính xác request; số POI mỗi ngày [2,1,1,1] | rules/whole_trip_plan, 0 call | PASS UI |
| Tham chiếu | cho 5 địa điểm / chỗ thứ 2 | Số lượng khác vị trí thẻ | Test có last_ids cũ5phần tử không thêm ID ngoài Ideas | rules | PASS backend + UI exact IDs |
| Cách nói khác | xếp đều5điểm trong4ngày; lập kế hoạch4ngày từ Ý tưởng | Cùng phạm vi cả chuyến | Regression cả current=None và current có lịch cũ đạt | rules | PASS backend |
| Áp dụng online | Không thao tác | Không ghi lịch | Nút Apply hiển thị nhưng không bấm; request ghi bị chặn | — | KHÔNG THỰC HIỆN |

141 backend tests liên quan PASS. Lượt này chỉ sửa backend; frontend không đổi. Gemini live đã quan sát được trong trace lỗi cũ; hai yêu cầu rõ sau sửa dùng rules, không lấy mock làm bằng chứng model live.

## Bằng chứng
- `REAL_ACCOUNT_RECHECK.json`: request idea_ids/trip_id, response text/trace và IDs từng ngày; không có token/password.
- `real-account-five-ideas.png`: ảnh UI tài khoản thật, 5 Ideas và preview4ngày.
- `real-account-green.png`: giải thích green trên UI.
- `qa-account-ui.mjs`: đăng nhập UI và assertions; credentials đọc stdin, không hardcode.

## Giới hạn
Chưa nghiệm thu tất cả câu tự do. Đoạn chuyển Đà Nẵng → Huế trước điểm đầu ngày vẫn chưa tính ETA đường đi; preview hiện cảnh báo đó. Không thay model hoặc bật billing.
