# Nghiệm thu tách tài khoản, chuyến đi và hội thoại — 17/11/2026

## Môi trường và giới hạn bằng chứng

Frontend thật: http://localhost:5173/planner và http://localhost:5173/my-trips.
Chrome headless qua Playwright, profile riêng. Trong riêng trình duyệt kiểm thử, request backend 8000 được chuyển sang fixture 127.0.0.1:8020, SQLite tạm, hai tài khoản A/B và POI giả lập. Đây là kiểm UI thật với backend demo cô lập; không phải bằng chứng ghi dữ liệu trên backend Supabase của tài khoản thật. Không bật billing hoặc ghi Supabase online.

## Hành vi đã quan sát trên UI

| Ca | Thao tác | Kỳ vọng và kết quả quan sát | Kết quả |
|---|---|---|---|
| Khách | Mở /planner, bấm Tạo chuyến đi | Không hiện chuyến mẫu như chuyến riêng; hiện yêu cầu đăng nhập; thao tác tạo chuyển /login | PASS |
| Tạo chuyến | Đăng nhập A, điền modal và tạo | Chỉ mở chuyến khi PUT metadata trả thành công | PASS |
| Chat mới | Mở trợ lý trong chuyến A chưa chat | Không có bộ chọn ba ô rỗng hoặc dòng giới hạn thô | PASS |
| Lịch sử | Chào ở hội thoại 1; tìm cà phê và tạo nháp ở hội thoại 2; tìm bảo tàng ở hội thoại 3 | Chỉ hiện lịch sử thực tế, đủ ba thì ẩn nút tạo mới | PASS |
| Tách nháp | Chuyển từ hội thoại 2 sang 1 rồi quay lại | Hội thoại 1 không có nút Apply của hội thoại 2; quay lại đúng draft ID | PASS |
| Lưu mới | Lưu cafe-group từ chat của chuyến có cafe-garden, museum, park | Server có đúng bốn ID; tải lại giữ dữ liệu và lịch sử | PASS |
| Đổi chuyến | Mở chuyến vừa tạo khác, gửi xin chào | Không có lịch sử cũ; chuyến mới có một lịch sử riêng | PASS |
| Đổi tài khoản | Chuyển B, thử chèn cache chuyến A vào khóa cache B | Không hiển thị chuyến A; server từ chối đọc workspace/chat/lịch A | PASS |
| Bỏ cache | Bỏ cache tài khoản A rồi đăng nhập lại A | Lấy lại đúng bốn Ý tưởng từ server | PASS |
| Đăng xuất | Bấm Đăng xuất | Đóng workspace/chat, trở về màn yêu cầu đăng nhập | PASS |

Dữ liệu máy đọc: AUTH_ISOLATION_UI.json. Script tái chạy: qa-auth-isolation.mjs.
Ảnh: auth-guest-blocked.png, auth-chat-empty.png, auth-chat-history.png, auth-b-isolated.png.

## Kiểm riêng bằng API/module

- 91 test backend liên quan qua, gồm quyền sở hữu, đăng nhập, phiên bản bản lưu, ba hội thoại, itinerary và trợ lý.
- Khách đọc/ghi chuyến riêng nhận 401; tài khoản khác bị 403/404.
- Ghi metadata dùng revision; bản cũ bị 409 thay vì ghi đè âm thầm. Chuyến đã xóa bị tombstone 410 và không xuất hiện lại qua cache cũ.
- Đọc tuyến riêng theo ngày cần đăng nhập và đúng chủ. Đọc trip chưa tồn tại không tự tạo lịch trình mẫu.
- 15 test frontend liên quan qua: cache chéo tài khoản bị bỏ, 403 không dùng cache cũ, 500 không báo lưu thành công, response đang chờ của A không được trả cho B.
- Frontend typecheck và build qua. Build còn cảnh báo kích thước bundle có sẵn.

## Cách lưu hiện tại

Danh sách chuyến và Ý tưởng dùng metadata server riêng theo user ID và trip ID, SQLite cạnh kho chat. Lịch trình giữ repository và guard hiện tại; lịch sử/nháp theo tài khoản, chuyến, chế độ và hội thoại. Cache trình duyệt chỉ là bản dự phòng/migration, không chứng minh quyền sở hữu. Dữ liệu global cũ không tự nhận vào tài khoản nếu chưa xác minh được chủ. Không xóa cache cũ của người dùng.

Chưa nghiệm thu triển khai nhiều server, đồng bộ nhiều thiết bị với backend production hoặc kiểm toán bảo mật toàn hệ thống. Không áp dụng migration Supabase trong lượt này.
