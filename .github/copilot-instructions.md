# GitHub Copilot Instructions — GreenTrip AI

> Nguồn quy tắc duy nhất (Single Source of Truth): hãy luôn đọc và tuân thủ đầy đủ [AGENTS.md](../AGENTS.md) và [PRD.md](../PRD.md) (kèm [ARCHITECTURE.md](../ARCHITECTURE.md) và [API_SPEC.md](../API_SPEC.md) khi làm việc với kiến trúc/API) trước khi đề xuất hoặc sửa bất kỳ dòng code nào.

## Tóm tắt 7 quy tắc bắt buộc
1. **Đối chiếu `PRD.md` trước khi code**: Xác định rõ đối tượng người dùng, tính năng, luồng thao tác và phân quyền; nếu có yêu cầu mới thì cập nhật `PRD.md` và xác nhận trước khi sửa code.
2. **Tuân thủ kiến trúc & tech stack trong `AGENTS.md`**: React 18 / TypeScript strict (không `any`) / Tailwind CSS (Frontend) và Python 3.12 / FastAPI / Pydantic v2 / PostgreSQL+SQLite / Neo4j Aura (Backend). Không tự ý thêm thư viện mới.
3. **Chia nhỏ task**: Làm từng bước nhỏ chạy và kiểm chứng được trước khi chuyển sang bước tiếp theo.
4. **Kỷ luật Git, kiểm thử & báo cáo**: Đảm bảo có commit checkpoint trước khi sửa lớn; tự rà `git diff`; kiểm thử chức năng, API và phân quyền (`401`/`403`/`404`). Sau mỗi task, luôn báo cáo rõ **Đã sửa những gì** và **Cần kiểm tra những gì**.
5. **Code đơn giản, dễ đọc**: Đặt tên hàm/biến rõ nghĩa, chú thích ngắn gọn khi cần, ưu tiên sự đơn giản để mọi thành viên nhóm đều dễ hiểu.
6. **Tôn trọng code thành viên**: Không tự ý sửa file/code của thành viên khác (xem `.github/CODEOWNERS`) khi chưa trao đổi và được đồng ý, trừ lỗi cực kỳ nghiêm trọng/khẩn cấp.
7. **Commit nhỏ, hoàn chỉnh**: Mỗi commit là 1 đơn vị công việc nhỏ rõ nghĩa theo Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
