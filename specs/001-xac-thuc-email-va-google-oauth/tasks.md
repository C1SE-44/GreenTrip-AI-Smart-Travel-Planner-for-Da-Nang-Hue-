# Tasks: Xác thực người dùng qua Email Link & Google OAuth

**Input**: `specs/001-xac-thuc-email-va-google-oauth/plan.md`, `spec.md`  
**Trạng thái**: Draft — Chờ Architect (Người dùng) duyệt

---

## Format: `[ID] [P?] [Story] Mô tả`
- `[P]`: Có thể chạy độc lập / song song
- `[Story]`: `US1` (Email Verification), `US2` (Secure Login), `US3` (Google OAuth)

---

## Phase 1: Setup & Cấu hình môi trường

- [x] **T001** [P] Cập nhật `backend/app/config.py` và `.env.example` với cấu hình SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `FRONTEND_URL`) và `GOOGLE_CLIENT_ID`.
- [x] **T002** [P] Bổ sung thư viện `google-auth` vào `backend/requirements.txt`.

---

## Phase 2: Nền tảng Email & Token (Foundational)

- [x] **T003** Xây dựng module `backend/app/auth/email.py` hỗ trợ gửi mail HTML phong cách du lịch xanh và chế độ simulation.
- [x] **T004** Bổ sung schemas (`VerifyEmailRequest`, `VerifyEmailResponse`, `GoogleLoginRequest`) tại `backend/app/auth/schemas.py`.
- [x] **T005** Bổ sung hàm tạo và giải mã token kích hoạt trong `backend/app/auth/service.py`.


---

## Phase 3: User Story 1 - Kích hoạt tài khoản qua Email Link (P1) 🎯 Core MVP

- [x] **T006** [Test] [US1] Viết automated tests cho luồng xác thực email tại `backend/tests/test_email_verification.py`.
- [x] **T007** [US1] Cập nhật endpoint `POST /auth/signup` (tạo user `pending` và gửi mail) và thêm endpoint `POST /auth/verify-email` trong `backend/app/auth/router.py`.
- [x] **T008** [P] [US1] Thêm API client `verifyEmail` và `signup` trong `frontend/src/services/auth.ts`.
- [x] **T009** [P] [US1] Xây dựng trang `frontend/src/pages/VerifyEmailPage.tsx` và thêm route `/verify-email` trong `frontend/src/App.tsx`.
- [x] **T010** [US1] Cập nhật giao diện `frontend/src/pages/RegisterPage.tsx` hiển thị màn hình "Kiểm tra hộp thư" sau khi đăng ký.
- [x] **T011** [US1] Chạy `pytest` xác thực 100% test case của US1 vượt qua thành công.


---

## Phase 4: User Story 2 - Đăng nhập an toàn & Kiểm tra kích hoạt (P2)

- [x] **T012** [US2] Cập nhật hàm `authenticate_user` và endpoint `POST /auth/login` kiểm tra trạng thái `status == 'active'` (báo lỗi 403 nếu `pending`/`INACTIVE`).
- [x] **T013** [US2] Cập nhật giao diện `frontend/src/pages/LoginPage.tsx` hiển thị thông báo rõ ràng khi tài khoản chưa kích hoạt.

---

## Phase 5: User Story 3 - Đăng nhập 1 chạm với Google OAuth (P3)

- [x] **T014** [US3] Viết hàm `verify_google_token` và endpoint `POST /auth/google` trong backend (tự động tạo user `active` và cấp JWT token).
- [x] **T015** [US3] Tích hợp Google Identity Services (GIS) vào `frontend/src/components/ui/GoogleButton.tsx` và `LoginPage.tsx`.


---

## Phase 6: Kiểm thử thực tế với Gmail `hasagi1706@gmail.com`

- [ ] **T016** Cấu hình SMTP thông tin thật vào `.env`, chạy app và thực hiện đăng ký tài khoản với email `hasagi1706@gmail.com`, xác nhận nhận được email trong Gmail và kích hoạt thành công.
