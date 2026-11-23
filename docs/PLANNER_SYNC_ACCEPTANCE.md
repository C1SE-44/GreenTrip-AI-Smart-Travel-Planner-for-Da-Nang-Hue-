# Mở trang và đồng bộ ba tab lịch trình — 17/11/2026

## Nguyên nhân và bản sửa

1. HTML khởi động có một trang chữ lớn tách biệt, chưa có ảnh. Thay bằng khung mở trang có ảnh nội bộ từ HTML; không đợi JavaScript mới tải ảnh. Trang riêng dùng khung trung tính đúng ngữ cảnh. Modal bộ sưu tập được tải khi cần thay vì nằm trong đường khởi động mọi trang.
2. Trang chuyến đi chỉ hiện một dòng loading trước khi có dữ liệu. Đổi thành khung card skeleton có kích thước ổn định; không chờ ảnh bên ngoài mới dựng danh sách. Giới hạn thời gian chờ API danh sách để có thể thoát sang trạng thái lỗi/thử lại.
3. Đổi ngày trước đây chờ lưu itinerary, sau đó cập nhật metadata bằng effect nền. Cả nút dời ngày và popup Khi nay dùng chung saveTripSchedule: đọc lịch mới nhất → giữ stops và căn lại ngày → chờ lưu lịch → chờ lưu metadata → mới cập nhật UI/đóng popup. 503 đọc lịch không biến thành lịch rỗng. Danh sách chờ các ghi metadata đang chạy của chính tài khoản trước khi đọc lại.
4. Các tab đang mở được cập nhật theo cùng danh sách userTrips theo ID; đổi chuyến reset component theo ID. Thêm/xóa ngày chờ lưu số ngày vào metadata; không để effect căn ngày ghi ngược trong khi thao tác đang lưu.
5. Lỗi tải ở Lịch trình/Lịch có thông báo và nút thử lại; chặn chỉnh khi chưa đọc được dữ liệu đầy đủ. Chỉ 404 mới là lịch chưa tồn tại. Thao tác thêm/xóa điểm ở Ý tưởng đọc bản lịch mới nhất và chỉ báo đã thêm sau khi save thành công.
6. Quay lại/Xong chờ lưu cả lịch và metadata; lỗi thì giữ editor để thử lại, không rời trang như đã thành công.

## Môi trường bằng chứng

Frontend thật localhost:5173 tại /, /planner và /my-trips. Chrome headless với Playwright, desktop 1440px/1280px và màn hẹp 320px. Trong profile QA riêng, API được chuyển tới backend fixture 127.0.0.1:8021, SQLite tạm và POI giả lập. Không ghi Supabase online, không thay guard lưu lịch. Ảnh bản đồ trống trong ảnh QA vì đã chặn tài nguyên bên ngoài.

## Ca đã quan sát trên UI

| Ca | Thao tác | Kỳ vọng | Thực tế | Kết quả |
|---|---|---|---|---|
| Mở trang | Cố ý giữ chưa tải module main.tsx, sau đó cho chạy | Có ảnh từ HTML, không tràn; React thay khung chờ và hiện form | Có ảnh cả 1440/320px; form hoạt động sau khi module sẵn sàng | PASS |
| Tải danh sách | Giữ response metadata để quan sát | Có skeleton, không màn chữ trống | Có khung card và trạng thái tải | PASS |
| Lưu ngày lỗi | Dời lịch 10–12/11, giả lập metadata PUT 503 | Không báo hoàn tất; cho thử lại | Banner và lỗi vẫn hiện; chưa cập nhật metadata thành công | PASS |
| Dời ngày thành công | Thử lại → 17–19/11 | Cùng ngày mới ở hai nguồn, giữ ba stops | Giữ qa-preserved-0/1/2 và POI cafe-garden/museum/park; ngày 17,18,19/11 | PASS |
| Chuyển tab/mở lại | Ý tưởng → Lịch trình → Lịch → reload | Không quay về 10–12/11 | Cả ba tab và mở lại dùng ngày mới | PASS |
| Thêm ngày | Thêm ngày 4 ở Lịch trình, qua Lịch | Metadata và lịch cùng 4 ngày | Cùng 4 ngày | PASS |
| Xóa ngày | Mở ngày 4 trống rồi xóa | Cùng 3 ngày; không mất ba stops cũ | Đúng số ngày và IDs | PASS |
| Popup Khi | Chọn 22–24/11, Cập nhật | Hai nguồn lưu start 22/11, 3 ngày | Đúng metadata và itinerary | PASS |
| Lỗi đọc | Giả lập GET lịch 503 ở cả Lịch và Lịch trình | Báo lỗi, không giả rỗng, không ghi; retry phục hồi | Không PUT; retry hiện đúng stops | PASS |
| Rời editor | Thêm ngày, metadata 503 rồi bấm quay lại; sau đó thử lại | Không đóng khi lỗi; đóng sau khi lưu đủ | Giữ editor khi lỗi; thành công về danh sách và server có 4 ngày | PASS |

Dữ liệu: STARTUP_UI.json, PLANNER_SYNC_UI.json, PLANNER_EXIT_UI.json. Script: qa-startup.mjs, qa-planner-sync.mjs, qa-planner-exit.mjs, qa-planner-photos.mjs. Script sync cần fixture SQLite mới vì có cả ca ngày quá khứ và ngày tương lai. Khởi động fixture bằng QA_PORT=8021, QA_AI_ENABLED=0, QA_FRONTEND_PORT=5173 rồi chạy script.

Ảnh: startup-first-paint-1440.png, startup-first-paint-320.png, planner-list-skeleton.png, planner-dates-ideas.png, planner-dates-itinerary.png, planner-dates-calendar.png, planner-dates-mobile.png. Bộ ảnh ba tab chụp sau popup đổi sang 22–24/11, gồm cùng ba POI.

## Kiểm bằng test và giới hạn

- 19 test frontend liên quan qua; gồm ngày/giờ quá khứ, chờ lưu metadata, lỗi đọc/lưu, token đổi, cache và trợ lý.
- 19 test backend lịch/ngày/quyền sở hữu qua trên DB test.
- Typecheck và build qua. Build còn cảnh báo bundle lớn. Lint toàn repo chưa qua: 11 lỗi và 140 cảnh báo trong code hiện có; không sửa dàn trải ngoài phạm vi. Lint các module service/date/banner/context được chỉnh trực tiếp không có lỗi.
- Không đo tốc độ trên mạng/máy người dùng; kiểm khung mở trang trong điều kiện chủ động trì hoãn JavaScript. Không coi thay khung loading là bằng chứng mọi API nhanh hơn.
- Chưa ghi/nghiệm thu dữ liệu tài khoản thật trên Supabase; không kiểm đầy đủ mọi tổ hợp kéo thả, tuyến Google Maps hay nhiều thiết bị. Hai nguồn lưu chưa có transaction phân tán: nếu metadata lỗi sau khi itinerary đã ghi, UI báo lỗi và giữ thao tác để thử lại, không báo thành công toàn bộ.
