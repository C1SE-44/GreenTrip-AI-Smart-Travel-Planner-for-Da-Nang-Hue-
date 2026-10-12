# Feature Specification: Xác thực người dùng qua Email Link & Google OAuth

**Feature ID**: `001-xac-thuc-email-va-google-oauth`  
**Ngày tạo**: 2026-10-08  
**Trạng thái**: Draft — Chờ Architect (Người dùng) review & làm rõ Clarifications  
**Mô tả gốc từ người dùng**: "tôi quyết định chọn theo hướng 1, hãy bắt đầu lập kế hoạch để triển khai từng bước để cho ra kết quả tốt nhất rồi test trên gmail hiện tại của tôi là : hasagi1706@gmail.com"

---

## User Scenarios & Testing

### User Story 1 - Kích hoạt tài khoản qua Link gửi về Email (Priority: P1) 🎯 Core MVP

Người dùng đăng ký tài khoản mới bằng Email và Mật khẩu. Để đảm bảo email là có thật và chính chủ, hệ thống gửi một liên kết xác nhận vào hòm thư. Người dùng mở email, bấm vào link để kích hoạt tài khoản.

- **Vì sao ưu tiên này**: Đảm bảo an toàn danh tính, ngăn chặn tài khoản rác/email giả mạo, đáp ứng trực tiếp yêu cầu gửi mail thực tế đến `hasagi1706@gmail.com`.
- **Test độc lập**: Đăng ký tài khoản mới với email `hasagi1706@gmail.com` $\rightarrow$ Kiểm tra hộp thư nhận email chứa link $\rightarrow$ Nhấp link $\rightarrow$ Tài khoản được kích hoạt thành công.

**Acceptance Scenarios**:
1. **Given** Người dùng điền đầy đủ form đăng ký hợp lệ tại `/register`, **When** bấm nút "Đăng ký tài khoản", **Then** hệ thống tạo tài khoản ở trạng thái `pending`, gửi email kích hoạt và chuyển giao diện sang màn hình "Kiểm tra hộp thư của bạn".
2. **Given** Người dùng nhận được email chứa liên kết kích hoạt (có kèm token), **When** nhấn vào liên kết dẫn đến `/verify-email?token=...`, **Then** Frontend gọi API backend kích hoạt, hiển thị thông báo "Kích hoạt thành công" và nút chuyển sang Đăng nhập.
3. **Given** Token kích hoạt đã hết hạn (quá 24 giờ) hoặc không hợp lệ, **When** người dùng truy cập link, **Then** hệ thống báo lỗi rõ ràng và gợi ý gửi lại email kích hoạt.

---

### User Story 2 - Đăng nhập an toàn bằng Email & Mật khẩu (Priority: P2)

Người dùng đăng nhập bằng Email và Mật khẩu. Hệ thống kiểm tra tính hợp lệ của mật khẩu và trạng thái kích hoạt của tài khoản.

- **Vì sao ưu tiên này**: Khép kín vòng đời của tài khoản đã đăng ký và kích hoạt ở US1.
- **Test độc lập**: Đăng nhập với tài khoản chưa kích hoạt $\rightarrow$ Bị chặn kèm thông báo nhắc nhở; Đăng nhập với tài khoản đã kích hoạt $\rightarrow$ Nhận JWT token và vào app.

**Acceptance Scenarios**:
1. **Given** Tài khoản có trạng thái `pending` (chưa kích hoạt), **When** người dùng thực hiện đăng nhập tại `/login`, **Then** hệ thống từ chối (HTTP 403) với thông báo: "Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email của bạn."
2. **Given** Tài khoản đã có trạng thái `active`, **When** người dùng đăng nhập với đúng email và mật khẩu, **Then** hệ thống trả về JWT Access Token và chuyển hướng đến trang `/explore`.

---

### User Story 3 - Đăng nhập 1 chạm với Google OAuth (Priority: P3)

Người dùng chọn "Tiếp tục với Google" để đăng nhập hoặc đăng ký nhanh chóng mà không cần nhập mật khẩu hay chờ đợi xác nhận qua email.

- **Vì sao ưu tiên này**: Tối ưu trải nghiệm người dùng (1-click login), tuân thủ chuẩn công nghiệp khi đã có xác thực danh tính từ Google.
- **Test độc lập**: Nhấn nút "Tiếp tục với Google" $\rightarrow$ Chọn tài khoản Google $\rightarrow$ Tự động đăng nhập và vào trang `/explore`.

**Acceptance Scenarios**:
1. **Given** Người dùng chưa từng đăng ký tài khoản GreenTrip, **When** đăng nhập thành công với Google, **Then** hệ thống tự động tạo User mới với trạng thái `active` (tin cậy email từ Google), sinh JWT Access Token và chuyển vào app.
2. **Given** Người dùng đã có tài khoản (đã kích hoạt hoặc tạo từ trước), **When** đăng nhập với Google cùng email đó, **Then** hệ thống nhận diện và đăng nhập thành công ngay lập tức.

---

### Edge Cases
- Email gửi đi bị trễ mạng hoặc hòm thư từ chối: Cung cấp nút "Gửi lại email xác nhận" (Resend Verification).
- Người dùng bấm lại link xác nhận đã được kích hoạt trước đó: Báo thông báo thân thiện "Tài khoản này đã được kích hoạt trước đó, bạn có thể đăng nhập ngay."
- Trùng lặp email: Nếu đăng ký với email đã tồn tại ở trạng thái `active`, trả về lỗi 409 Conflict rõ ràng.

---

## Requirements

### Functional Requirements
- **FR-001**: Hệ thống PHẢI lưu trạng thái tài khoản người dùng (`status`: `pending` hoặc `active`) trong cơ sở dữ liệu.
- **FR-002**: Hệ thống PHẢI gửi email HTML chứa đường dẫn kích hoạt an toàn có thời hạn 24 giờ khi đăng ký tài khoản mới.
- **FR-003**: Hệ thống PHẢI hỗ trợ cấu hình gửi mail linh hoạt qua biến môi trường (SMTP Host, Port, User, Password hoặc Chế độ giả lập Simulation khi phát triển).
- **FR-004**: Endpoint `/auth/verify-email` PHẢI xác minh tính hợp lệ và thời hạn của token trước khi cập nhật trạng thái người dùng sang `active`.
- **FR-005**: Endpoint `/auth/login` PHẢI từ chối các tài khoản chưa kích hoạt (`pending`).
- **FR-006**: Endpoint `/auth/google` PHẢI xác thực Google ID Token với Google API trước khi cấp JWT token nội bộ.

---

## Success Criteria
- **SC-001**: Gửi thành công email kích hoạt thực tế đến `hasagi1706@gmail.com` khi người dùng đăng ký.
- **SC-002**: Người dùng click vào link trong email kích hoạt thành công tài khoản trong dưới 5 giây.
- **SC-003**: Tài khoản chưa kích hoạt không thể đăng nhập lấy JWT token.
- **SC-004**: 100% các ca kiểm thử tự động (Unit Test / Integration Test) của module Auth vượt qua thành công.

---

## Clarifications

### Session 2026-10-08
- **Q**: Phương thức gửi email thực tế đến `hasagi1706@gmail.com`?  
  $\rightarrow$ **A**: Sử dụng **Gmail SMTP** (`smtp.gmail.com:587`, TLS). Người dùng sẽ tạo Google App Password 16 ký tự và cung cấp vào `.env`.
- **Q**: Trạng thái Google OAuth Client ID?  
  $\rightarrow$ **A**: Chuẩn bị sẵn kiến trúc code, SDK và biến môi trường `VITE_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID`. Người dùng sẽ điền Client ID vào `.env` khi hoàn tất thiết lập trên Google Cloud Console.

## Assumptions

- Verification token qua email có thời hạn hợp lệ trong vòng 24 giờ.
- Các tài khoản đăng ký qua Google OAuth được tự động đánh dấu `is_active = true` mà không cần xác nhận qua email (chuẩn SSO 1-chạm).

