---
name: ponytail
description: >-
  Minimal-context, token-efficient surgical coding methodology for GreenTrip.
  Use when receiving coding tasks to avoid reading the entire codebase, routing
  directly to exact target files via docs/AI_CONTEXT.md.
---

# Ponytail — Quy Tắc Tiết Kiệm Token & Sửa Đổi Tối Giản

Ponytail là phương pháp làm việc tinh gọn nhằm tối ưu hóa chi phí token và tránh đọc lại toàn bộ repository khi nhận lệnh mới.

## Quy trình làm việc 4 bước (Surgical Coding):

1. **Định tuyến trực tiếp (Zero-Waste Context)**:
   - Khi nhận lệnh, luôn tra cứu bảng định tuyến tại `docs/AI_CONTEXT.md`.
   - Đi thẳng vào đúng file nguồn, hàm và caller cần xử lý.
   - Không đọc file `PROJECT_HANDOFF_FOR_CODEX.md` dài hoặc quét toàn bộ cây thư mục theo thói quen.

2. **Truy vấn hẹp (Targeted Query)**:
   - Dùng Graphify (`.\scripts\graphify.ps1 query <Symbol> --depth 1 --budget 700`) hoặc tìm kiếm symbol cụ thể để xem quan hệ giữa các component.
   - Không tăng budget token lên hàng nghìn chỉ để lấy các node không cần thiết.

3. **Lát cắt tối thiểu (Minimal Vertical Slice)**:
   - Giải quyết đúng trọng tâm yêu cầu của người dùng bằng thay đổi nhỏ nhất có thể chạy được.
   - Tái sử dụng tối đa component, helper và type sẵn có. Không cài thêm thư viện rườm rà.

4. **Kiểm thử cục bộ & Cập nhật Roadmap**:
   - Chạy `npm run typecheck` và unit test liên quan (`node --test tests/...`).
   - Cập nhật dòng trạng thái vào `docs/AI_ROADMAP.md` sau khi hoàn thành.
