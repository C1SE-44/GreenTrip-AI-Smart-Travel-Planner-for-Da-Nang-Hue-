# Hội thoại riêng theo tài khoản và chuyến — 17/11/2026

## Nguyên nhân và thay đổi

Ảnh mới là 403 kiểm tra chủ sở hữu của lịch đã lưu, khác lỗi `sample-*` trước đó. Frontend cũ dùng chung `greentrip_user_trips` giữa các tài khoản nên có thể hiện chuyến của phiên đăng nhập trước. Không bỏ kiểm tra quyền để cho chat chạy.

- Cache chuyến mới dùng `greentrip_user_trips:<verified user_id>`; auth-change xóa lựa chọn chuyến/khung chat trong bộ nhớ, hủy kết quả profile cũ đến trễ. Mã chuyến mới dùng UUID.
- Không ghi đè/xóa cache cũ. Lần đầu nhập cache theo tài khoản chỉ nhận ID được `/api/my-trips` xác nhận đúng chủ. Chuyến cũ chưa lưu lên server hoặc chưa gắn đúng chủ vẫn nằm trong cache cũ, không tự chuyển quyền. Đây là giới hạn chuyển đổi dữ liệu cũ, không được nói đã khôi phục toàn bộ chuyến của người dùng.
- API chat/history/apply nhận `conversation_id` 1–3, mặc định 1. SQLite server giữ lịch sử/ngữ cảnh/bản nháp theo tài khoản + chuyến + chế độ + hội thoại. Slot 1 dùng nguyên khóa cũ để giữ lịch sử. NLU không nhận account ID từ client; model không chọn chủ hoặc ghi lịch.
- UI thêm bộ chọn Hội thoại 1/2/3, scope chống response đến trễ gồm conversation ID. Auth-change quay về hội thoại 1. Đóng/mở lại có thể chọn lại hội thoại 2/3 để tiếp tục.
- 403 hiển thị hướng dẫn + nút tạo chuyến riêng qua form có sẵn thay cho retry vô ích. Guard sample/foreign owner/Preview–Apply/online Apply giữ nguyên.

## Quan sát trên UI thật của component (IAB, fixture SQLite)

URL xác minh từ log: frontend `http://127.0.0.1:5178/__assistant-ui`, backend `http://127.0.0.1:8018`; health báo SQLite riêng, online_database=false, AI=false. Router/service/auth/repository/TravelAssistant thật; user/POI giả lập. Không đăng nhập tài khoản thật trong trình duyệt IAB.

| Thao tác | Kết quả quan sát |
|---|---|
| Hội thoại 1: “Tìm giúp mình cà phê tại Huế, dưới 80k nhé” | Khi AI tắt, bot báo chưa xử lý chắc yêu cầu kết hợp. Không coi đây là Gemini PASS hay đã sửa hội thoại tự do. |
| Chọn nút “Tìm cà phê ở Huế” | Hai card cà phê demo. |
| Chuyển hội thoại 2, nhập “Tìm bảo tàng ở Huế” | Lịch sử trống trước khi nhập; chỉ trả bảo tàng demo, không mang theo card cà phê. |
| Lưu card → “Xếp lịch từ Ý tưởng” | Ý tưởng tăng 1, có bản xem trước với nút Áp dụng. |
| Chuyển hội thoại 1 rồi quay lại 2 | Hội thoại 1 khôi phục cà phê, không có nút Áp dụng của hội thoại 2. Hội thoại 2 khôi phục đúng bản nháp. |
| Áp dụng trong hội thoại 2 | Thành công; bảng “Lịch đã lưu SQLite” có Bảo tàng Demo và giờ nghỉ. API /assistant/apply 200. |
| Hội thoại 3: “xin chào” | Bắt đầu độc lập, chào đúng, không có bản nháp cũ. |
| Đổi chuyến A sang B, AI vẫn tắt | Lịch sử B trống. |
| Đăng nhập tài khoản QA B | Hội thoại chọn lại 1, không có chat A. Quay về chuyến A đã lưu bởi tài khoản A bị 403. |
| Tài khoản B mở chuyến A | Hiển thị hướng dẫn tạo chuyến riêng; bấm nút mở đúng CreateTripMindtripModal. Không có retry vô ích. |
| Đăng nhập lại A, chọn hội thoại 2 | Khôi phục bảo tàng, các lượt lưu/xếp lịch và tin “Đã áp dụng lịch trình vào chuyến đi.” |

Không có cuộc gọi provider trong lượt này (AI tắt); chưa nghiệm thu Gemini thật. Có kiểm cache theo tài khoản bằng test helper, chưa nghiệm thu UI toàn trang ExplorePage với hai tài khoản thật. Không suy ra toàn app/UI PASS.

## Kiểm tự động

- 171 test backend liên quan PASS, bao gồm 6 ca mới: lịch sử/criteria tách slot/tài khoản/chuyến/mode; slot mặc định giữ lịch cũ; API chặn 0/4/âm; Apply sai hội thoại 409 không lưu; Apply đúng hội thoại thành công; tài khoản khác vẫn bị 403 ở cả 3 slot.
- 6 test frontend service/cache PASS: truyền đúng slot ở cả 3 API; tách cache tài khoản; chuyển cache cũ theo owner xác minh; không nhận/xóa cache khi server lỗi.
- Typecheck/build và lint các file trợ lý/service/cache/harness PASS. Lint/test nền toàn repo có lỗi từ mốc trước, không sửa hoặc tuyên bố toàn suite xanh.
- Không deploy, không bật billing, không gọi API ghi lịch online. Fixture khởi động riêng, không chủ động chạy lại lifespan app.main.

Chạy fixture với port riêng bằng `QA_PORT=8018`, `QA_FRONTEND_PORT=5178`, `QA_AI_ENABLED=0` ở backend; `QA_FRONTEND_PORT=5178`, `QA_API_TARGET=http://127.0.0.1:8018` ở frontend. Mặc định cũ 8017/5177 vẫn hoạt động.
