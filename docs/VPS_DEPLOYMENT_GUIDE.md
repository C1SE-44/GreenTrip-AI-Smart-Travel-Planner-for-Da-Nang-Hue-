# Hướng Dẫn Triển Khai GreenTrip AI Lên VPS & Auto-HTTPS (Production)

Tài liệu này hướng dẫn từng bước đưa toàn bộ hệ thống **GreenTrip AI** lên máy chủ VPS thật với chứng chỉ **HTTPS tự động (Let's Encrypt qua Caddy)**, Redis Cache thật và bộ Docker Multi-stage tối giản, để hội đồng bảo vệ có thể quét mã QR tại `/demo-qr` và trải nghiệm trực tiếp trên điện thoại cá nhân.

---

## 1. Kiến trúc Production (4 Container Cô Lập)

Mọi dịch vụ backend, frontend và Redis chỉ giao tiếp qua mạng nội bộ Docker (`greentrip_net`). Chỉ duy nhất **Caddy** mở cổng `80` và `443` ra Internet:

- **`caddy` (`caddy:2.9-alpine`)**: Nhận request từ Internet trên cổng `80/443`, tự cấp và gia hạn chứng chỉ SSL/TLS Let's Encrypt, tự chuyển hướng HTTP → HTTPS, phục vụ `/api/*` tới Backend (hỗ trợ SSE streaming `flush_interval -1` cho AI Copilot) và phục vụ Frontend ở `/`.
- **`frontend` (`frontend/Dockerfile.prod`)**: Build file tĩnh bằng `node:22-alpine`, sau đó chạy bằng `nginxinc/nginx-unprivileged:1.27-alpine` dưới quyền non-root (`USER 101`) tại cổng nội bộ `8080`.
- **`backend` (`backend/Dockerfile.prod`)**: Cài thư viện vào `/opt/venv` ở stage `builder`, chỉ sao chép mã nguồn chạy thực tế sang `python:3.12-slim` dưới quyền non-root `appuser`, chạy `uvicorn` đa worker (`UVICORN_WORKERS=2`, không dùng `--reload`), kết hợp `HEALTHCHECK /health`.
- **`redis` (`redis:7.4-alpine`)**: Lưu cache-aside danh sách địa điểm (`X-Cache: HIT/MISS`) và bộ đếm rate limit phân tán qua Redis nội bộ `redis://redis:6379/0`.

> **Lưu ý:** File `docker-compose.yml` dùng để lập trình cục bộ (hot-reload) vẫn được giữ nguyên. Khi chạy trên VPS, sử dụng `docker-compose.prod.yml`.

---

## 2. Mua Tên Miền & Trỏ DNS Về VPS

1. Chọn và mua một tên miền riêng tại nhà cung cấp (ví dụ `.vn`, `.io.vn`, `.site` — chẳng hạn `greentripai.site` hoặc `greentrip.vn`).
2. Vào trang quản trị DNS của tên miền, tạo bản ghi `A`:
   - **Type**: `A` · **Name**: `@` · **Value**: `<IP_PUBLIC_CUA_VPS>` · **TTL**: tự động / 300s.
   - *(Khuyến nghị thêm nếu muốn hỗ trợ `www`)*: **Type**: `A` · **Name**: `www` · **Value**: `<IP_PUBLIC_CUA_VPS>`.
3. Kiểm tra DNS đã nhận IP VPS chưa trước khi chạy Caddy:
   ```bash
   dig +short greentripai.site A
   ```

---

## 3. Cài Docker Engine & Khóa Tường Lửa UFW Trên Ubuntu VPS

Đăng nhập SSH vào VPS Ubuntu (khuyến nghị RAM >= 2GB) và chạy các lệnh sau:

```bash
# 1. Mở duy nhất cổng SSH (22) và HTTP/HTTPS (80, 443)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable

# 2. Cài Docker Engine + Docker Compose plugin chính thức
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# 3. Tải mã nguồn nhánh develop/main về VPS
git clone https://github.com/C1SE-44/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-.git
cd GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-
```

---

## 4. Cấu Hình Biến Môi Trường `.env` Production

Sao chép `.env.example` thành `.env` trên VPS và điền đầy đủ thông tin thật (**tuyệt đối không commit file `.env` lên Git**):

```bash
cp .env.example .env
# Tạo JWT_SECRET_KEY ngẫu nhiên >= 32 ký tự (bắt buộc khi APP_ENV=production)
openssl rand -hex 32
```

Các biến quan trọng cần kiểm tra trong `.env`:

- `APP_ENV=production`
- `DOMAIN=greentripai.site` *(Tên miền thật đã trỏ DNS; nếu tạm test bằng IP HTTP thuần chưa có domain thì đặt `DOMAIN=:80`)*
- `FRONTEND_URL=https://greentripai.site` *(Khớp chính xác origin HTTPS để CORS và Google OAuth hoạt động đúng)*
- `JWT_SECRET_KEY=<chuỗi_hex_64_ký_tự_vừa_tạo>`
- `DATABASE_URL=...` *(Connection string Supabase PostgreSQL)*
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`
- `GEMINI_API_KEY=...`, `GOOGLE_CLIENT_ID=...`, `VITE_GOOGLE_CLIENT_ID=...`
- `UVICORN_WORKERS=2`
- *(Lưu ý: `REDIS_URL=redis://redis:6379/0` đã được gán tự động trong `docker-compose.prod.yml`)*

*(Nếu dùng Google OAuth trên tên miền thật, nhớ vào Google Cloud Console → Credentials → thêm `https://greentripai.site` vào **Authorized JavaScript origins**).*

---

## 5. Khởi Chạy Production Stack & Xác Minh HTTPS + Cache + QR

```bash
# Build 2 image production tối giản và chạy nền toàn bộ 4 container
docker compose -f docker-compose.prod.yml up -d --build

# Kiểm tra toàn bộ container đều đạt trạng thái healthy
docker compose -f docker-compose.prod.yml ps

# Xác minh chứng chỉ HTTPS + API /health + header X-Cache
curl -I https://greentripai.site/health
curl -I "https://greentripai.site/api/pois?page=1&limit=10"   # Lần 1: X-Cache: MISS
curl -I "https://greentripai.site/api/pois?page=1&limit=10"   # Lần 2: X-Cache: HIT
```

Sau khi xanh toàn bộ, mở **`https://greentripai.site/demo-qr`** trên màn hình máy chiếu của phòng bảo vệ để hội đồng quét mã QR bằng camera điện thoại:
- Nếu cần trình chiếu slide trước khi mua domain, vào `/demo-qr` để tải ảnh **PNG mã QR** gắn sẵn URL tên miền hoặc dùng nút **Chế độ Trình chiếu** toàn màn hình.

---

## 6. Ghi Chú So Sánh: VPS Full-Stack vs Vercel (Frontend) + VPS (Backend)

| Phương án | Cách hoạt động | Khi nào nên chọn |
| :--- | :--- | :--- |
| **VPS Full-Stack (`docker-compose.prod.yml`)** *(Khuyên dùng cho bảo vệ)* | Một tên miền duy nhất (`https://greentripai.site`), Caddy cấp HTTPS cho cả React SPA (`/`) lẫn FastAPI (`/api/*`) + Redis nội bộ. | Tốt nhất khi bảo vệ: không vướng CORS chéo miền, SSE streaming mượt, `X-Cache` và QR cùng 1 URL gọn đẹp. |
| **Vercel (Frontend) + VPS (Backend)** | Frontend deploy miễn phí lên Vercel; Backend + Redis + Caddy chạy trên VPS tại subdomain `api.<domain>`, trỏ `VITE_API_BASE_URL=https://api.<domain>` và `FRONTEND_URL=https://<vercel-app>.vercel.app`. | Tiện khi cả nhóm muốn tận dụng Vercel Preview cho từng Pull Request trong lúc phát triển. |
