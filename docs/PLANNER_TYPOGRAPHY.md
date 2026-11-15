# Quy chuẩn chữ — Explore và Trip Workspace

Cập nhật 13/11/2026. Người dùng yêu cầu lấy Explore hiện có làm chuẩn; thay thế các cỡ 28–34px đã thêm ở các lượt chỉnh Planner trước.

## Căn cứ

- ExplorePage.tsx: tiêu đề thành phố 24px/bold; nhóm khám phá 22px/bold; tên địa điểm 15px/bold; tab 13.5px/medium; metadata 13px và địa chỉ 12.5px.
- Font thực tế: Inter, từ font-sans trong tailwind.config.js. Không đổi sang Plus Jakarta Sans ở các màn chức năng.
- Ảnh Mindtrip giúp đối chiếu cấp bậc: tiêu đề màn lớn nhất, tiêu đề nhóm nhỏ hơn, hàng ngày/tên địa điểm gọn, số lượng và metadata nhẹ. Không suy ra hoặc công bố cỡ CSS chính xác của Mindtrip từ screenshot, vì có thể khác DPR/zoom.

## Thang chữ cố định cho Planner

| Vai trò | Cỡ / line-height | Weight | Token |
| --- | --- | --- | --- |
| Tiêu đề tab/drawer | 24 / 32px | 700 | plannerStyles.title |
| Tiêu đề nhóm con: Ý tưởng, Lịch trình | 18 / 24px | 600 | plannerStyles.sectionTitle |
| Tiêu đề modal chọn địa điểm | 22 / 28px | 600 | plannerStyles.modalTitle |
| Tên chuyến đi trong header | 16 / 22px | 600 | plannerStyles.tripTitle |
| Tên địa điểm trong danh sách, timeline, ảnh Ideas | 15 / 20px | 600 | plannerStyles.itemTitle |
| Tiêu đề ngày | 15 / 22px | 600 | plannerStyles.dayTitle |
| Tab/nút pill | 13.5 / 20px | 500 | plannerStyles.controlText / pill |
| Ngày tháng, số lượng, loại địa điểm | 13 / 18px | 400 | plannerStyles.meta |
| Địa chỉ gọn, nhãn giờ/lịch | 12–12.5 / 16px | 400–500 | theo ngữ cảnh |

Nhóm khám phá ở Explore là cấp nội dung chính nên giữ 22px; nhóm Ideas/Itinerary bên trong một tab là cấp con nên dùng 18px. Không tăng chữ theo breakpoint desktop. Card ảnh dùng cùng token itemTitle và chỉ đổi màu chữ trắng.

## Quy tắc duy trì

- Dùng token trong frontend/src/components/planner/plannerStyles.ts; không thêm text-[28px], text-[30px], text-[32px], text-[34px] cho tiêu đề ba tab hoặc drawer Planner.
- Không dùng extra-bold cho tiêu đề Planner. Dùng kích thước/weight/line-height cùng cấp; không làm nhãn số lượng đậm bằng tiêu đề.
- Chữ trong lịch có thể dùng 12px vì mật độ nội dung; không xuống dưới 12px.
- Giữ vùng bấm khoảng 40px dù chữ nhỏ hơn; không thu nhỏ toàn trang bằng CSS transform/zoom.
- Giữ cỡ Explore hiện tại, không thay đổi trang người dùng đã hài lòng chỉ để ép mọi heading về một cỡ.
- Khi thay đổi hệ chữ, cập nhật bảng này và PLANNER_UI_HANDOFF.md; xem trực tiếp desktop/mobile trước khi bàn giao.

## Kiểm tra sau áp dụng

- Đo computed styles thực tế: ba tiêu đề tab đều 24px / 32px, weight 700, font Inter; nhóm con 18px / 24px, weight 600; ngày 15px / 22px và tên địa điểm 15px / 20px.
- Mobile 320px: tiêu đề vẫn 24px, document width 320px, không tràn ngang.
- TypeScript, build và 39/39 test cốt lõi: PASS. ESLint đối chiếu không phát sinh lỗi mới; vẫn còn lỗi lint có sẵn trong repo.
- Đã cập nhật drawer Ý tưởng đã lưu, nhưng chưa mở kiểm tra trực quan mọi modal/drawer trong lượt này. Không commit/push.
