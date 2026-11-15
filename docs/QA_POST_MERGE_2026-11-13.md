# QA sau merge — 5 nhóm ngày/giờ và chuyến đi

Ngày kiểm: 13/11/2026. **Cả 5 nhóm Pass trên localhost sau sửa**, không phải kết luận từ build/code. Dùng Playwright/Chromium, timezone Asia/Ho_Chi_Minh, clock browser 18:30 rồi 18:31; backend dùng giờ Việt Nam thật.

| Nhóm | Ca đã chạy / sửa |
|---|---|
| 1. ♥ / + → Ý tưởng | 2AM ♥ → Đã thích → đúng Ý tưởng; 5AM + → chuyến chọn, không bật tim; reload và kiểm cuối lượt vẫn đúng. Không sửa luồng này. |
| 2. Hộp ngày | Sửa draft cố định 2–5/11; nạp khoảng lưu, hủy, cập nhật/mở lại, khóa quá khứ bằng disabled và bước lưu; hôm nay chọn được; chuyến cũ đọc được ngày/hoạt động quá khứ. |
| 3. Đồng bộ ngày | Sửa ngày cũ còn giữ khi đổi khoảng cùng số ngày; căn chỉnh ISO/null. Thêm ngày nối cuối và +/− giảm cuối. Sửa lưu debounce bị hủy khi đổi tab và đọc cũ đè ghi mới. Kiểm 4 ngày tương lai, 4→5→4 linh hoạt, mọi tab/reload; ngày cuối có hoạt động thì chặn giảm, không xóa. |
| 4. Giờ và thẻ | Chặn thêm/dời quá khứ tại frontend trước cache và API trước ghi; giữ lịch sử không đổi. UI 19:30 lưu, sửa về 10:30 bị chặn; thêm mới quá khứ bị chặn/tương lai được. API 422 quá khứ, 200 tương lai. Thẻ 10:30–11:30 top32px/height64px ở hàng64px. Vạch đỏ đúng hôm nay, tự đổi sau15s, không hiện ở khung khác ngày. Lịch không có UI thêm/chỉnh giờ để kiểm. |
| 5. UI | Lưới nhẹ, ngày chọn khác hôm nay; bớt thông tin ngày lặp, giữ hai loại thêm riêng. Mũi tên chọn ngày có tác dụng và khóa biên. Map cả3tab cùng x877.875/y64/w562.125/h936 ở1440×1000; không đổi layout header/map/tỷ lệ cột. Không tràn ngang toàn trang ở1280/320. |

## Điểm vào code mới

- `frontend/src/utils/tripDates.ts`: ngày Việt Nam, ISO, parse legacy và nhãn; không lấy ngày từ ảnh.
- `frontend/src/services/itineraryService.ts`: align ngày, scheduleError, cache và thứ tự ghi/đọc.
- `backend/app/trips/schedule_validation.py` + `trips/router.py`: so lịch cũ/mới, chặn quá khứ trước ghi.
- UI: CreateTripMindtripModal, TripOverviewView, TripItineraryView, TripCalendarView và phần format nhãn của TripHeader.
- Test mới: frontend/tests/planner-date-schedule.test.mjs; backend/tests/test_schedule_validation.py.

## Giới hạn kiểm tra phụ

Typecheck/build và test mới Pass. Test cũ kiểm chuỗi source parser calendar còn Fail vì đổi sang helper dùng chung, giữ nguyên test. Backend itinerary suite có 2 ca 503 do SQLite test; kiểm đối chứng bỏ đọc mới vẫn lỗi lưu. Lint còn9lỗi có sẵn. npm test toàn bộ có browser harness Fail/không kết thúc nên đã dừng; không ghi toàn suite Pass.

Chuyến QA: `qa-merge-20261113-main`. Metadata/Ý tưởng vẫn localStorage; lịch có GET/PUT API/cache. Fixture lịch sử được dựng riêng qua repository cho chuyến QA để kiểm dữ liệu đã tồn tại; các bước kiểm sau đó dùng UI/API thật. Không tuyên bố đồng bộ metadata đa thiết bị.

Báo cáo đầy đủ, ảnh 3 tab cùng viewport, requests và 76 quan sát nằm tại máy đã chạy: `C:/Users/ngoho/Documents/Codex/2026-11-13/b-y/outputs/merge-qa/REPORT.md`. Không chứa mật khẩu/token.

Đã dừng đủ5nhóm. **F02/F03 chưa xử lý**; không mở AI/Sprint4/redesign. Không commit/push, giữ các thay đổi trước lượt này.
