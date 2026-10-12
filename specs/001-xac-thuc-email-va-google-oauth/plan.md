# Implementation Plan: Xác thực người dùng qua Email Link & Google OAuth

**Feature**: `001-xac-thuc-email-va-google-oauth` | **Ngày**: 2026-10-08 | **Spec**: `specs/001-xac-thuc-email-va-google-oauth/spec.md`  
**Trạng thái**: Draft — Chờ Architect (Người dùng) duyệt để khóa (FINAL)

---

## 1. Tóm tắt giải pháp

Thực hiện giải pháp xác thực người dùng kép theo chuẩn công nghiệp:
1. **Luồng Email/Password (Bảo mật danh tính)**: Người dùng đăng ký $\rightarrow$ Tài khoản ở trạng thái `pending` $\rightarrow$ Backend gửi email chứa link kích hoạt (JWT có hạn 24h) đến email người dùng (đặc biệt test với `hasagi1706@gmail.com`) $\rightarrow$ Click link tại frontend kích hoạt tài khoản thành `active` $\rightarrow$ Đăng nhập.
2. **Luồng Google OAuth (Tối ưu trải nghiệm)**: Đăng nhập 1 chạm qua Google Identity Services $\rightarrow$ Backend verify ID Token $\rightarrow$ Tự động tạo/kích hoạt user `active` và cấp JWT Access Token ngay lập tức.

---

## 2. Technical Context

- **Backend**: Python 3.11+, FastAPI, Pydantic v2.
- **Frontend**: React 18, Vite, TypeScript, TailwindCSS.
- **Database**: PostgreSQL (Supabase) — bảng `public.users` với cột `status` (`pending`, `active`), `role`.
- **Thư viện chính**:
  - Backend: `PyJWT` (sinh và kiểm tra verification token), `smtplib` / `email` (gửi mail SMTP tiêu chuẩn), `google-auth` (verify Google token).
  - Frontend: `lucide-react` (icons), `react-router-dom` (routing).
- **Security & Constraints**:
  - Không hard-code credentials. Mọi cấu hình SMTP và Google Client ID nạp qua `.env`.
  - Mật khẩu hash bằng bcrypt.
  - Verification link có TTL 24 giờ.

---

## 3. Constitution Check

- ✅ **Clean Code**: Tách rõ router, service, email helper; tuân thủ PEP8 và ESLint.
- ✅ **Auth & Security**: Chặn triệt để tài khoản `pending` truy cập hệ thống; xác minh chữ ký Google token; mật khẩu được bảo vệ an toàn.
- ✅ **Test-First & Bằng chứng**: Viết test tự động cho toàn bộ luồng signup $\rightarrow$ send email $\rightarrow$ verify $\rightarrow$ login.

---

## 4. Chi tiết thay đổi Codebase

### Backend (`backend/`)
1. **`app/config.py`**:
   - Thêm cấu hình SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID`.
2. **`app/auth/email.py`**:
   - Hàm `send_verification_email(email, full_name, token)`: Render email HTML chuẩn thương hiệu GreenTrip (chủ đề du lịch xanh, nút bấm rõ ràng).
   - Hỗ trợ chế độ **Real SMTP** (khi có cấu hình) và fallback **Simulation** (in link ra log nếu đang dev).
3. **`app/auth/service.py`**:
   - Hàm `create_verification_token(email)` và `verify_email_token(token)`.
   - Cập nhật `authenticate_user`: Kiểm tra `status == 'active'`, trả về lỗi chi tiết nếu tài khoản đang `pending`.
   - Hàm `verify_google_token(id_token)`: Xác thực với Google và lấy thông tin người dùng.
4. **`app/auth/schemas.py`**:
   - `VerifyEmailRequest`, `VerifyEmailResponse`, `GoogleLoginRequest`.
5. **`app/auth/router.py`**:
   - Cập nhật `POST /auth/signup`: Lưu user với `status = 'pending'`, gửi email kích hoạt qua `BackgroundTasks`.
   - Thêm `POST /auth/verify-email`: Xác thực token và kích hoạt tài khoản.
   - Thêm `POST /auth/resend-verification`: Cho phép gửi lại email kích hoạt nếu thất lạc.
   - Thêm `POST /auth/google`: Xử lý đăng nhập Google 1 chạm.
6. **`tests/test_email_verification.py`**:
   - Bộ test tự động kiểm thử toàn bộ các ca: signup gửi mail, verify thành công, verify token sai/hết hạn, chặn login khi chưa verify.

### Frontend (`frontend/`)
1. **`src/services/auth.ts`**:
   - Thêm `verifyEmail(token)`, `resendVerification(email)`, `googleLogin(credential)`.
2. **`src/pages/RegisterPage.tsx`**:
   - Sau khi đăng ký thành công: Hiển thị màn hình "Kiểm tra hộp thư" thân thiện, hướng dẫn mở Gmail, nút gửi lại email hoặc đổi email.
3. **`src/pages/VerifyEmailPage.tsx`**:
   - Đọc query param `?token=...`, tự động gọi API kích hoạt, hiển thị loading/thành công/thất bại và nút chuyển sang Đăng nhập.
4. **`src/pages/LoginPage.tsx`**:
   - Xử lý thông báo khi tài khoản chưa kích hoạt.
   - Kết nối nút Google Login với Google Identity Services.
5. **`src/App.tsx`**:
   - Thêm route `/verify-email` vào router.

---

## 5. Kế hoạch kiểm thử với email `hasagi1706@gmail.com`

1. **Kiểm thử tự động (Automated Tests)**: Chạy `pytest` đảm bảo 100% logic token và DB hoạt động đúng chuẩn.
2. **Kiểm thử gửi Email thật**:
   - Nhập thông tin cấu hình gửi mail vào `.env`.
   - Thực hiện đăng ký tài khoản với email `hasagi1706@gmail.com`.
   - Kiểm tra hộp thư đến tại Gmail `hasagi1706@gmail.com` $\rightarrow$ Nhấp vào liên kết xác nhận.
   - Kiểm tra trạng thái tài khoản chuyển thành `active` và đăng nhập thành công.
