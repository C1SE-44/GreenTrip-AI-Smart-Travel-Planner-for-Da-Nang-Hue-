# 🐳 Hướng Dẫn Chạy GreenTrip AI Bằng Docker Compose

Tài liệu này giúp tất cả các thành viên trong nhóm khởi chạy toàn bộ hệ thống (Frontend + Backend + Database) một cách nhanh chóng, đồng bộ 100% môi trường và dữ liệu giữa các máy tính (Windows, macOS, Linux).

---

## ⚡ Khởi Động Nhanh (1 Bước Duy Nhất)

1. Mở Terminal (PowerShell / Command Prompt / Terminal) tại thư mục gốc của dự án.
2. Đảm bảo Docker Desktop đang bật, sau đó chạy lệnh:
   ```bash
   docker compose up --build
   ```

Khi Docker hoàn tất quá trình build và khởi chạy:
- **Website (Frontend)**: Mở trình duyệt truy cập 👉 [http://localhost:5173](http://localhost:5173)
- **API Backend**: Kiểm tra trạng thái 👉 [http://localhost:8000/health](http://localhost:8000/health) hoặc Swagger Docs tại [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🛠️ Tính Năng Hỗ Trợ Phát Triển (Developer Experience)

- **Hot-Reload (Tự động cập nhật)**: Toàn bộ code trong thư mục `frontend/` và `backend/` đã được liên kết trực tiếp (volume mount) vào container. Bạn chỉ cần sửa code trên VS Code của máy mình, trình duyệt và server sẽ tự động cập nhật ngay lập tức mà không cần build lại.
- **Icon chuẩn 100%**: Bộ icon Phosphor đã được đóng gói nội bộ trong thư viện frontend, không còn bị lỗi biến thành ô vuông `▢` do mạng yếu hay chặn CDN.
- **Đầy đủ 339 Địa điểm**: Kết nối trực tiếp vào bộ cơ sở dữ liệu đã chuẩn hóa 339 POIs Đà Nẵng - Huế.

---

## 📋 Các Lệnh Thường Dùng

| Thao tác | Câu lệnh |
| :--- | :--- |
| **Chạy hệ thống (xem log trực tiếp)** | `docker compose up` |
| **Chạy ngầm (chạy nền không chiếm terminal)** | `docker compose up -d` |
| **Xem log của Backend** | `docker compose logs -f backend` |
| **Xem log của Frontend** | `docker compose logs -f frontend` |
| **Dừng toàn bộ hệ thống** | `docker compose down` |
| **Build lại image khi có thay đổi package/thư viện** | `docker compose up --build` |

---

## ❓ Câu Hỏi Thường Gặp (Troubleshooting)

### 1. Máy báo lỗi thiếu file `.env`?
Hệ thống Docker đã được cấu hình tự động nhận diện file `.env` nếu có. Nếu bạn chưa có file `.env`, hãy copy từ file `.env.example`:
```bash
cp .env.example .env
```
*(Sau đó liên hệ trưởng nhóm để nhận các API key / mật khẩu database mới nhất)*.

### 2. Muốn chạy Database PostGIS hoàn toàn Offline (không cần mạng)?
Chạy lệnh với profile `local-db`:
```bash
docker compose --profile local-db up
```
Database local sẽ được khởi chạy tại cổng `5433` kèm PostGIS.
