# Lưu lịch mẫu sau đăng nhập — 2026-11-18

## Luồng đã chốt và triển khai

Khách tự thêm/bỏ/đổi/thay thứ tự trong mẫu → Lưu thành chuyến riêng → LoginModal hiện có → một hộp Chốt thông tin chuyến đi → Tạo chuyến và mở lịch trình. Người đã đăng nhập đến thẳng hộp thông tin. Hộp có điểm đến/số ngày điền sẵn, ngày bắt đầu bắt buộc, số người 1–20, ngân sách cả chuyến tùy chọn. Không hỏi lại điểm đến hay sở thích và không sinh lại lịch bằng AI.

Tạo chính xác Ideas + các ngày và điểm theo bản khách đã chỉnh; gán ngày từ ngày bắt đầu; giữ thứ tự và giờ có sẵn. Giờ đã qua nếu chọn hôm nay được để Chưa xếp giờ, không tự dời ngày. Điểm thêm/đổi/di chuyển chưa chọn giờ giữ null, người dùng sửa trong timeline. Điều hướng `/planner?trip=...&tab=itinerary`; refresh vẫn mở đúng chuyến/tab. Lưu lỗi giữ draft/form và cùng trip ID để thử lại; đang lưu không cho back/close/chỉnh chồng request.

## Nguyên nhân lưu lỗi đã xác minh

Truy vấn chỉ đọc trên Supabase xác nhận các cột tương thích itinerary_id / itinerary_day_id / itinerary_stop_id có giới hạn varchar(64). Mã stop do frontend tạo từ trip UUID + ngày + POI UUID dài 75 ký tự; API cho tối đa 100. Backend chép nguyên mã đó vào cột varchar64. Phép chuyển kiểu jsonb_populate_record (SELECT, không ghi dữ liệu) tái hiện SQLSTATE22001: value too long for type character varying(64).

Lượt trước chỉ kiểm SQLite TEXT nên bỏ sót giới hạn PostgreSQL này. Ca regression mới áp giới hạn64 cho tất cả alias cũ: trước sửa API503 đúng thông báo ảnh, sau sửa200; GET/retry giữ nguyên ID và thứ tự. BE ánh xạ alias dài sang UUID5 ổn định theo loại trip/day/stop; các mã API vẫn nguyên vẹn, mã cũ <=64 không đổi. Không cắt chuỗi gây trùng, không nới schema, không migration hay ghi Supabase online. BE có log lỗi gốc khi lưu thất bại để tránh chỉ thấy503 chung.

Bằng chứng: LANDING_SAMPLE_HANDOFF_REPRO.json và backend/tests/test_itinerary_identifier_contract.py.

## Kiểm tra liên thông

- API PASS trên production routers trong fixture SQLite có trigger giới hạn64, POI router dùng adapter PostGIS/jsonb riêng fixture; source POI đọc từ bản dữ liệu local. Lưu 2 ngày, ngày bắt đầu2030-01-30, 3 người, 5.000.000 VNĐ; Ideas/itinerary khớp ID/thứ tự, tài khoản khác bị chặn. LANDING_SAMPLE_HANDOFF_API.json.
- UI PASS guest→login→form→timeline: Huế1ngày20/12/2026, 6 POI đã đổi thứ tự và thêm trước login, 3 người, ngân sách5.000.000. Cả Ideas và timeline đủ6ID đúng thứ tự. Sửa VOU Roastery thành09:00–10:00, reload vẫn giữ; tab mặc định là Lịch trình. LANDING_SAMPLE_HANDOFF_UI.json.
- Form320px: documentWidth320, form308, không tràn ngang; ngân sách không bắt buộc. Ngày dùng native date picker; công cụ DOM-fill không phát React change trong một lần thử, kiểm lại bằng native setValue đã xác nhận state/ngày lưu đúng.
- Tab Calendar trước đây tự gán giờ theo index cho start_time=null và dùng90phút dù end-start=60. Đã sửa: điểm chưa xếp giờ ở một nhóm riêng trong ngày, có nút sang timeline; điểm có giờ hiển thị đúng start/end, dải giờ mở rộng cho06:00 hoặc23:00 để không làm mất điểm. UI kiểm09–10/14:30–15:30/17–18 và3điểm chưa xếp; biên06/23 kiểm unit.
- Một lượt đầu bị cache cũ của fixture ui-demo sau reset DB dẫn đến409 khi migrate qa-expired-sync, không phải lỗi save mới. Dùng tài khoản fixture mới tạo trong local (email không gửi) để kiểm toàn luồng sạch. Không xóa cache/dữ liệu người dùng và không thay đổi logic migration account ngoài phạm vi.
- BE regression26 PASS: identifier contract, itinerary API, workspace và lịch quá khứ. FE7 landing/calendar tests +4 account isolation PASS. Typecheck/build và lint phần mới PASS; global lint/test cũ ngoài phạm vi chưa được làm xanh trong lượt này.
- Review độc lập đã bắt/sửa biên giờ Calendar và xác nhận không còn blocker trong phần sửa.

## Giới hạn

Không ghi dữ liệu Supabase online, không sửa tài khoản thật. PostgreSQL online chỉ đọc schema và tái hiện phép chuyển kiểu; kiểm save/read/refresh bằng fixture có cùng giới hạn64. Chưa kiểm OAuth/OTP/email thật. Hai API workspace/itinerary hiện có chưa phải giao dịch chung; nếu bước hai lỗi, workspace có thể đã tạo, nhưng chỉ điều hướng sau khi cả hai thành công và retry dùng lại ID. Draft khách còn lưu trong bộ nhớ trang, chưa giữ qua refresh trước lúc tạo chuyến.
