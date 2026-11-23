# Lịch tham khảo từ chân-mây (2)

Luồng lưu/ngày/tab đã được cập nhật tiếp trong [LANDING_SAMPLE_HANDOFF.md](LANDING_SAMPLE_HANDOFF.md); phần bên dưới ghi lại lần tích hợp UI đầu tiên.

2026-11-18. Mốc đăng nhập đã được người dùng chốt: cho khách thử chỉnh, yêu cầu đăng nhập khi lưu thành chuyến riêng.

## Hành vi

- Lấy bố cục SampleItineraryModal.tsx trong Downloads/chân-mây (2).zip: tờ lịch theo ngày, timeline, ảnh, chi tiết, chỉnh ngày, thêm/bỏ/đổi điểm, lên/xuống, khôi phục và xem trước. Đồng bộ font, màu nền ấm, CTA đen và điểm nhấn xanh GreenTrip. Không chép dữ liệu giả, tên/ID quán giả hoặc ảnh stock từ file Studio.
- Dùng chung getPois `/pois` với Khám phá. Tải tối đa 100 ứng viên curated mỗi thành phố; picker tìm tiếp bằng q + city trong API, không giới hạn tìm vào 200 ứng viên ban đầu. Không mở Explore khi thêm trong mẫu. Hai thành phố yêu cầu ít nhất hai ngày.
- Ghép tham khảo theo nhóm danh mục, điểm dữ liệu và khoảng cách trong ngày; ID không trùng. Đây không phải kết quả gọi AI hay tối ưu OSRM; giờ chỉ tham khảo và chưa kiểm giờ mở cửa. Mô tả trống thì dùng địa chỉ thực làm dòng giới thiệu, chi tiết ghi thiếu mô tả; không tự bịa ảnh, rating hoặc điểm xanh. `/pois` chỉ lấy is_active=true, kể cả count.
- Khách chỉnh tự do. Dùng lịch này mở bản xem trước. Lưu thành chuyến riêng mới mở LoginModal hiện có. Đóng đăng nhập giữ nguyên draft; đăng nhập thành công kiểm getMe rồi lưu đúng Ideas + itinerary, mở đúng chuyến ở Ý tưởng. Không có tuyến auto-signup mới.
- Token được kiểm trước/sau các bước lưu; ID được giữ khi thử lại, không báo thành công khi một trong hai API chưa xong. Hai API hiện có không phải một giao dịch: nếu lỗi ở bước hai có thể có workspace draft trên server; thử lại dùng cùng ID. Khóa back/close/edit trong lúc lưu để không mất chỉnh mới do request cũ.
- Draft khách lưu trong bộ nhớ trang, giữ khi đóng/mở popup và đổi preset; chưa giữ qua refresh. Chưa chọn ngày đi nên chuyến được lưu linh hoạt, không tự gán ngày đã qua. Điểm đổi/thêm/di chuyển không tự gán giờ giả 08:00–09:30 trong Planner.
- Lazy-load popup khi mở lần đầu; catalogue giới thiệu tải gần vùng nhìn, dùng cùng cache. Giữ các thay đổi hero/nhân vật đang có trước lượt này.

## Kiểm chứng

- API PASS trên fixture SQLite riêng, POI router production với adapter PostGIS/jsonb chỉ trong fixture; đọc bản sao dữ liệu local, không ghi Supabase online. Saved Ideas và itinerary khớp toàn bộ IDs/thứ tự; tài khoản B không đọc được chuyến của A. Bằng chứng: LANDING_SAMPLE_V2_API.json.
- UI PASS tại 1280px và 320px (document scrollWidth=320): thêm/bỏ/đổi/lên-xuống; tìm Mì Quảng Bà Mua; chi tiết; tìm rỗng; lỗi tải/thử lại; đổi preset và đóng/mở vẫn giữ chỉnh; login chỉ khi lưu; authcancel giữ draft; lưu vào Ideas đúng 4 POI, timeline cùng thứ tự, refresh còn. Bằng chứng: LANDING_SAMPLE_V2_UI.json.
- Review phát hiện back còn bấm được lúc save. Đã khóa và kiểm lại với mỗi PUT trễ 4 giây: back/save disabled trong lúc đang lưu; sau thành công mới chuyển Planner. Review lại không còn blocker trong phạm vi.
- Frontend: typecheck/build PASS; scoped ESLint PASS; 4 test landing-sample PASS (preset/city/unique, move/add/replace, raw data honesty, exact save/partial failure retry/account switch). Backend POI/loading contract: 25 PASS.
- Lint toàn dự án vẫn 11 errors, 139 warnings ở phạm vi cũ. npm test toàn dự án chưa xanh: các assertion cũ về hover/camera/date helper và các bài browser không khởi động được debugging endpoint. Không gọi đó là toàn bộ test PASS; không sửa ngoài phạm vi để che kết quả.
- Backend chính port 8000 không chạy khi kiểm. Chưa kiểm lưu trên môi trường chính, OAuth hay gửi email đăng ký thật; không tạo tài khoản thật, không bật billing, không gọi AI.
