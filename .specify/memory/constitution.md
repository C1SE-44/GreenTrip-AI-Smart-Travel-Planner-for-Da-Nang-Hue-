# GreenTrip AI — Constitution

> Hàng rào nguyên tắc kỹ thuật chi phối toàn bộ quá trình phát triển hệ thống GreenTrip AI.
> Mọi thay đổi code trong pha Implement bắt buộc tuân thủ các nguyên tắc bên dưới.

## Nguyên tắc cốt lõi

### I. Clean Code & Architecture (NON-NEGOTIABLE)
- **Tách biệt tầng trách nhiệm**: Router (Controller) chỉ nhận request/validate schema $\rightarrow$ Service xử lý nghiệp vụ $\rightarrow$ DB client thao tác cơ sở dữ liệu.
- **Tối giản (YAGNI & Simplicity First)**: Chỉ giải quyết đúng bài toán được giao, tránh over-engineering, không tạo abstraction thừa thãi khi chỉ dùng ở 1 chỗ.
- **Coding Standards**:
  - Backend: Python 3.11+, FastAPI, Pydantic v2, flake8/black formatting, type hinting đầy đủ.
  - Frontend: React 18+, TypeScript strict, TailwindCSS/Vanilla CSS nhất quán với theme Eco-travel.

### II. Auth & Security Rules (NON-NEGOTIABLE)
- **Không hard-code secret**: Mọi secret key, JWT secret, database url, SMTP credential, OAuth client ID/secret PHẢI được nạp qua biến môi trường (`.env`).
- **Mật khẩu & Token**: Mật khẩu bắt buộc hash bằng bcrypt/argon2 trước khi lưu DB. JWT access token phải có thời hạn (TTL) và chữ ký an toàn (HS256/RS256).
- **Phân quyền & Trạng thái tài khoản**: Tài khoản chưa kích hoạt (`pending`) tuyệt đối không được cấp JWT Access Token để truy cập tài nguyên được bảo vệ.
- **Xác thực bên thứ ba**: Google ID Token phải được verify bằng thư viện chính thức của Google (`google-auth`), không tự parse decode thô không kiểm tra chữ ký số.

### III. Test & Kiểm chứng (NON-NEGOTIABLE)
- Mọi logic xác thực (signup, verify-email, login, oauth) bắt buộc có automated test (pytest cho backend, vitest/testing-library cho frontend).
- Chỉ đánh dấu hoàn thành (Done) khi đã có bằng chứng test thực tế (manual hoặc automated).

### IV. Trải nghiệm người dùng (UX) & Thiết kế
- Phản hồi trạng thái rõ ràng: Loading state, Error state thân thiện bằng tiếng Việt, Success notification.
- Luồng Social Login (Google) là 1-click frictionless; luồng Email/Password có thông báo rõ ràng về việc kiểm tra hộp thư kích hoạt.

## Governance
- Mọi feature mới đều phải đi qua quy trình Spec-Driven Development: Constitution $\rightarrow$ Specify $\rightarrow$ Clarify $\rightarrow$ Plan $\rightarrow$ Tasks $\rightarrow$ Implement.
- Bất kỳ thay đổi nào làm vi phạm Constitution đều phải dừng lại và thảo luận với Architect (Người dùng).

**Version**: 1.0.0 | **Ratified**: 2026-10-08
