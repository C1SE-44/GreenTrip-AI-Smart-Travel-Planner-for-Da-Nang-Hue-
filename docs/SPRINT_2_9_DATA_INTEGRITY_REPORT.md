# GreenTrip AI — Sprint 2.9 Data Integrity Audit Report

**Dự án**: GreenTrip – A Multi-Objective Green Tourism Itinerary Optimizer for Central Vietnam  
**Thời gian thực hiện**: 24/11/2026  
**Cơ sở dữ liệu kiểm tra**: CSDL SQLite Fallback (`backend/app/db/greentrip.db`) & Đối chiếu Lược đồ PostgreSQL Target  
**Phương pháp kiểm thử**: Script tự động `backend/scripts/audit_sprint2_9.py` & Kiểm tra tính toàn vẹn phi phá hủy (Non-destructive)  

---

## 1. Kết Quả Tổng Thể Kiểm Tra Tính Toàn Vẹn Dữ Liệu

| Mã Kiểm Tra | Hạng Mục Kiểm Tra | Kết Quả Đo Lường | Ngưỡng Tiêu Chuẩn | Trạng Thái |
| :--- | :--- | :---: | :---: | :---: |
| **DATA-01** | Tổng số lượng Địa điểm du lịch (POIs) | **482 POIs** | ≥ 400 POIs | **PASS** |
| **DATA-02** | Trùng lặp địa điểm (Duplicate POI Name + City) | **0 bản ghi** | = 0 | **PASS** |
| **DATA-03** | Tọa độ địa lý hợp lệ (Coordinate Bounds Đà Nẵng – Huế) | **0 lỗi ngoài biên** | = 0 | **PASS** |
| **DATA-04** | Trường dữ liệu bắt buộc bị NULL (`name`, `city_id`, `category_id`) | **0 trường rỗng** | = 0 | **PASS** |
| **DATA-05** | Tính toàn vẹn quan hệ Đồ thị tri thức (KG / Relational Projection) | **Relational fallback sẵn sàng** | Sẵn sàng | **PASS** |
| **DATA-06** | Tính toàn vẹn Khóa ngoại Lịch trình (`user_id` Foreign Key) | **7 trips, 0 orphan trips** | 0 orphan | **PASS** |

---

## 2. Chi Tiết Các Hạng Mục Kiểm Tra

### 2.1. Số lượng và Phân Bổ POI
- **Tổng số**: 482 POIs du lịch đã được làm sạch và chuẩn hóa.
- **Phạm vi địa lý**: Bao phủ hai trung tâm du lịch trọng điểm miền Trung:
  - **Đà Nẵng** (`city_id = 1`): Gồm các cụm danh thắng Hải Châu, Sơn Trà, Ngũ Hành Sơn, Hòa Vang.
  - **Huế** (`city_id = 2`): Gồm Cố đô Huế, sông Hương, hệ thống lăng tẩm triều Nguyễn và các làng nghề truyền thống.
- **Phân loại danh mục**: Đầy đủ các danh mục `Ẩm thực`, `Di tích lịch sử`, `Danh lam thắng cảnh`, `Văn hóa - Nghệ thuật`, `Làng nghề truyền thống`, `Du lịch sinh thái / Điểm xanh`.

### 2.2. Kiểm tra Trùng lặp Dữ liệu (Deduplication Check)
- Truy vấn kiểm tra:
  ```sql
  SELECT name, city_id, COUNT(*) 
  FROM pois 
  GROUP BY name, city_id 
  HAVING COUNT(*) > 1;
  ```
- **Kết quả**: 0 bản ghi trùng lặp. Tên địa điểm trong cùng một thành phố là duy nhất.

### 2.3. Ràng buộc Tọa độ Địa lý (Bounding Box Validation)
- Tọa độ địa lý cho khu vực Đà Nẵng và Thừa Thiên Huế phải nằm trong giới hạn tự nhiên:
  - Vĩ độ (Latitude): từ `15.0° N` đến `17.5° N`
  - Kinh độ (Longitude): từ `106.5° E` đến `109.0° E`
- Truy vấn kiểm tra:
  ```sql
  SELECT COUNT(*) FROM pois 
  WHERE latitude < 15.0 OR latitude > 17.5 
     OR longitude < 106.5 OR longitude > 109.0 
     OR latitude IS NULL OR longitude IS NULL;
  ```
- **Kết quả**: 0 bản ghi vi phạm. 100% POIs có tọa độ hợp lệ, đảm bảo công thức tính khoảng cách Haversine và OSRM Routing không phát sinh lỗi ngoại lệ toán học.

### 2.4. Tính Toàn Vẹn Khóa Ngoại và Dữ Liệu Người Dùng
- Bảng lịch trình (`itineraries`):
  - Hiện có **7 lịch trình** mẫu và lịch trình người dùng đã tạo trong quá trình kiểm thử.
  - 100% các chuyến đi đều gắn với `user_id` hợp lệ.
  - Số lượng chuyến đi mồ côi (orphan records không có chủ sở hữu): **0**.

### 2.5. Đối Chiếu Tính Nhất Quán Giữa SQLite Cục Bộ & PostgreSQL Đám Mây
- Lược đồ CSDL tuân thủ chặt chẽ các file migration trong `backend/migrations/`:
  - `001_initial_schema.sql`: Khai báo bảng `users`, `cities`, `poi_categories`, `pois`.
  - `002_itineraries_and_trips.sql`: Khai báo bảng `itineraries`, `itinerary_days`, `itinerary_stops`.
  - `003_saved_places_and_collections.sql`: Khai báo bảng lưu điểm ưa thích.
- Lớp trừu tượng kết nối trong [backend/app/db/connection.py](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/db/connection.py) tự động chuyển đổi giữa cú pháp `%s` của psycopg và `?` của sqlite3, giúp mã nguồn backend chạy mượt mà trên cả 2 hệ quản trị cơ sở dữ liệu mà không cần chỉnh sửa code.

---

## 3. Khuyến Nghị Quản Trị Dữ Liệu
1. **Sao lưu tự động (Automated Backup)**: Thiết lập cronjob hàng ngày để dump cơ sở dữ liệu PostgreSQL lên Amazon S3 / Google Cloud Storage.
2. **Kiểm tra chỉ mục (Index Optimization)**: Đảm bảo các chỉ mục `idx_pois_city_category` và `idx_itineraries_user_id` luôn được kích hoạt để giữ thời gian truy vấn dưới 10ms khi lượng dữ liệu tăng lên hàng triệu bản ghi.
