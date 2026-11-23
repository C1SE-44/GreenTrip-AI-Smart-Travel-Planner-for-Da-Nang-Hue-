# PB18 — tích hợp trang cá nhân của Thiện

Nguồn: `origin/feature/#pb18-user-profile-settings`, commit `88e0411`, tác giả Huynh Van Thien (15/11/2026). Đã fetch từ origin và ghép phần PB18 vào nhánh `feature/pb18-profile-ui-integration`. Không checkout đè bản đang sửa, không commit/push. Bản sao trước tích hợp được giữ cục bộ trong `backend/.training/pb18-integration-backup` (ignored).

## Đã đưa vào

- `/profile`: xem hồ sơ, sửa họ tên/số điện thoại, email chỉ đọc; chọn/xem trước ảnh; form đổi mật khẩu và đăng xuất.
- AccountMenu dùng chung trong sidebar, có mục Hồ sơ của tôi; logout dùng cùng hàm xóa phiên.
- Backend PATCH /auth/me, PUT /auth/me/avatar, POST /auth/change-password và test gốc PB18.
- Giữ logic phân tách tài khoản/chuyến đi, guard tạo chuyến, tải POI theo trang, lazy-loading và retry DB của bản hiện tại khi xử lý xung đột.
- Chỉnh heading, input trắng/viền trung tính/focus xanh, CTA đen và bo tròn, scrollbar cùng workspace. Nút dark/ghostDark dùng pill mà không đổi variant của trang marketing.
- Chỉ nhận response cập nhật hồ sơ nếu user_id còn khớp tài khoản hiện tại.

## Đã quan sát trên route thật

`http://localhost:5173/profile`: đăng nhập tài khoản người dùng đã cho phép; hiển thị thông tin thật. Desktop 1280px, document width 1280; mobile 320px, document width 320, sidebar tự thu gọn. Menu mở được Hồ sơ của tôi. Form đổi mật khẩu mở/hủy được; không nhập mật khẩu mới, không bấm lưu hồ sơ hay tải ảnh lên online. Email readOnly=true. Radius CTA sau sửa=9999px. Screenshot desktop/mobile đã quan sát qua công cụ browser trong cuộc trò chuyện.

## Kiểm thử và giới hạn

- PB18 backend: 34 pass; test dùng mock/SQLite và storage mock, không ghi Supabase.
- Backend liên quan: 67 pass. Khi chạy đủ nhóm, 2 test cũ thất bại: test_login_returns_jwt_with_required_claims đòi JWT chỉ có sub/exp trong khi code hiện có type=access; test_copilot_chat_hides_raw_exception_details không xác thực nhưng endpoint hiện trả 401. Không sửa AI để làm xanh test.
- Frontend tài khoản/trip isolation: 9 pass. Typecheck/build đạt; lint riêng các module tài khoản đạt.
- Lint toàn dự án còn 11 errors / 139 warnings. Không mở rộng task để sửa các lỗi khác của Explore/planner/AI.
- Harness Chromium của Thiện treo, đã dừng. Không gọi harness PASS; đã chuyển sang kiểm route thật bằng browser trong ứng dụng.
- Chưa chạy migration 014 hoặc cấu hình bucket avatar trên Supabase online. /auth/me vẫn hoạt động khi migration còn thiếu; upload ảnh cần migration/bucket phù hợp.
- Không thay đổi dữ liệu tài khoản thật, không đổi mật khẩu, không merge remote/push.

Chi tiết máy đọc được: [PB18_PROFILE_INTEGRATION.json](PB18_PROFILE_INTEGRATION.json).
