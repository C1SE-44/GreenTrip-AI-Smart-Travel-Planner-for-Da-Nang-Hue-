# PB01 - Backend User Signup API Contract

> **Mục đích**: Tài liệu đặc tả API Endpoint Đăng ký người dùng (`/auth/signup`) cho thành viên Frontend tích hợp vào Form Đăng ký (`RegisterPage`).

---

## 1. Thông Tin Endpoint

* **URL**: `http://localhost:8000/auth/signup`
* **Method**: `POST`
* **Content-Type**: `application/json`
* **Swagger UI (kiểm tra trực tiếp)**: `http://localhost:8000/docs#/Authentication/signup_auth_signup_post`

---

## 2. Request Body

Dữ liệu JSON gửi lên:

| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
| :--- | :--- | :---: | :--- |
| `full_name` | `string` | **Có** | Độ dài 1–100 ký tự, không được chỉ chứa khoảng trắng. |
| `email` | `string` | **Có** | Định dạng email hợp lệ, tối đa 255 ký tự (hệ thống tự chuẩn hóa về chữ thường). |
| `password` | `string` | **Có** | Tối thiểu 8 ký tự, tối đa 128 ký tự. |
| `phone` | `string` \| `null` | Không | Tùy chọn (9–15 chữ số), có thể bỏ qua hoặc truyền `null`. |

### Ví dụ Payload Request:
```json
{
  "full_name": "Nguyễn Văn A",
  "email": "nguyenvana@example.com",
  "password": "Password123!",
  "phone": null
}
```

---

## 3. Response Specification

### 3.1. Thành công (`201 Created`)
Trả về khi người dùng đăng ký tài khoản thành công. Mật khẩu và hash mật khẩu được bảo mật tuyệt đối, không bao giờ trả về frontend.

```json
{
  "message": "User registered successfully.",
  "user": {
    "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "full_name": "Nguyễn Văn A",
    "email": "nguyenvana@example.com",
    "phone": null,
    "role": "USER",
    "status": "ACTIVE",
    "created_at": "2026-10-08T15:20:00.000000Z",
    "updated_at": "2026-10-08T15:20:00.000000Z"
  }
}
```

### 3.2. Lỗi trùng Email (`409 Conflict`)
Trả về khi email đã được đăng ký trước đó. Frontend nên hiển thị thông báo lỗi tại ô nhập email:

```json
{
  "detail": "Email is already registered."
}
```

### 3.3. Lỗi dữ liệu không hợp lệ (`422 Unprocessable Entity`)
Trả về khi dữ liệu không thỏa mãn validation (ví dụ mật khẩu < 8 ký tự, email sai cú pháp):

```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "email"],
      "msg": "Invalid email format.",
      "input": "invalid-email"
    }
  ]
}
```

### 3.4. Lỗi máy chủ (`500 Internal Server Error`)
Trả về khi có sự cố cơ sở dữ liệu:

```json
{
  "detail": "Unable to create user."
}
```

---

## 4. Cấu Hình CORS & Môi Trường Frontend

Backend FastAPI đã được cấu hình sẵn `CORSMiddleware` cho phép:
* **Origins được phép**: `http://localhost:5173`, `http://127.0.0.1:5173`
* **Methods**: Tất cả (`GET`, `POST`, `OPTIONS`, v.v.)
* **Headers**: Tất cả

Frontend có thể gọi trực tiếp `http://localhost:8000/auth/signup` mà **không bị lỗi CORS**.

---

## 5. Mẫu Code TypeScript Dành Cho Frontend (Gợi ý tích hợp)

Thành viên Frontend làm task *"Connect Frontend Registration form to API"* có thể tham khảo hàm gọi API chuẩn dưới đây:

```typescript
export interface SignupPayload {
  full_name: string;
  email: string;
  password: string;
  phone?: string | null;
}

export interface SignupSuccessResponse {
  message: string;
  user: {
    user_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    role: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
}

export async function signup(payload: SignupPayload): Promise<SignupSuccessResponse> {
  const response = await fetch('http://localhost:8000/auth/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    // Trả về lỗi 409 hoặc 422
    const errorMessage = typeof data.detail === 'string'
      ? data.detail
      : data.detail?.[0]?.msg || 'Đăng ký thất bại';
    throw new Error(errorMessage);
  }

  return data as SignupSuccessResponse;
}
```
