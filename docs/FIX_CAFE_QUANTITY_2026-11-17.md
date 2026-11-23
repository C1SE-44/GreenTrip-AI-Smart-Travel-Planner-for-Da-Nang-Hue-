# Sửa lỗi cà phê / số lượng / nhận diện lập lịch — 2026-11-17

- Dữ liệu dự án: 7 Bridges Brewing Company có category `Quán cafe giải khát`, sub_category `craft_beer`. Backend cũ chỉ nhìn nhãn chung nên chọn sai.
- Sửa shared category_match: nhận diện brewery/beer/pub/cocktail ở loại chi tiết/tên/mô tả trước khi chấp nhận café. Không sửa dữ liệu online.
- Nhận số trong `N quán`, `N chùa`, `N bảo tàng`, `N địa điểm` và số chữ một–mười. Mặc định lượt tìm mới 5 kết quả; thiếu dữ liệu nói rõ. Giới hạn an toàn 50 kết quả/lượt, vượt giới hạn hỏi lại; không cam kết số lượng nếu không đủ điểm phù hợp.
- Số lượng rõ ở tin nhắn hiện tại được dùng cả khi model trả count khác. Giữ điều kiện model đã xác thực. Đánh giá cao xếp hạng theo satisfaction_score sẵn có sau lọc loại/city.
- Bổ sung nhận diện `lên kế hoạch` và `tạo lịch` vào luồng Preview hiện có. Có Ideas thì tạo bản nháp, chưa Apply không ghi lịch.
- 129 tests backend liên quan PASS (14 ca trong test_demo_search gồm parametrize), gồm bản ghi brewery thật, số lượng 1/2/4/7, số chữ, reset count, model mock sai count, hai cách nói lập lịch và regression SQLite Preview/Apply.
- UI/live Gemini chưa kiểm lượt này; không suy PASS UI từ backend tests. BE đang chạy cần reload code; chưa xác nhận tiến trình người dùng đã reload. Không restart tiến trình không do agent quản lý.
