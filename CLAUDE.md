# Claude Code Project Instructions — GreenTrip AI

Bắt buộc đọc và tuân thủ đầy đủ 2 tài liệu gốc của dự án trước khi sửa bất kỳ file nào:
- @AGENTS.md
- @PRD.md

## Tóm tắt quy trình bắt buộc
1. Trước khi code: đọc `AGENTS.md` và đối chiếu `PRD.md` (đối tượng, tính năng, luồng người dùng, phân quyền); xác nhận kế hoạch từng bước nhỏ trước khi chỉnh sửa.
2. Trước khi sửa lớn: kiểm tra trạng thái Git sạch / đã có commit checkpoint để dễ rollback.
3. Khi viết code: ưu tiên code đơn giản, dễ đọc, đặt tên hàm rõ nghĩa, chú thích đúng chỗ, không dùng `any`, không tự ý sửa code thuộc phần của thành viên khác (đối chiếu `.github/CODEOWNERS`) khi chưa trao đổi, trừ lỗi cực kỳ nghiêm trọng/khẩn cấp.
4. Sau mỗi task: tự review `git diff`, chạy test chức năng/API/phân quyền (`pytest` / `npm run lint:ci && npm run typecheck && npm run test:unit && npm run build`), commit nhỏ hoàn chỉnh và báo cáo rõ **(1) Đã sửa những gì** + **(2) Cần kiểm tra những gì**.
