# GreenTrip AI — Database Design Diagrams (Draw.io)

Thư mục lưu trữ bộ diagram đồ án tốt nghiệp **GreenTrip AI: Smart Travel Planner for Da Nang - Hue** (CMU-SE 450 - Capstone Project 1, Duy Tân University).

Các file được thiết kế theo chuẩn **Native Draw.io ER Shapes**, hiển thị hoàn hảo và không bị lỗi mã HTML khi mở trên trang web [https://app.diagrams.net](https://app.diagrams.net) hoặc extension Draw.io Integration trong Antigravity IDE.

---

## 📁 Danh sách các file trong thư mục `D:\diagram`

| STT | Tên File | Loại Diagram | Mô tả chi tiết |
| :---: | :--- | :--- | :--- |
| **0** | [`greentrip_database_master.drawio`](./greentrip_database_master.drawio) | **Master (8 Tabs)** | **File tổng hợp toàn bộ 8 diagram** dưới dạng các trang/tab để tiện mở xem và chỉnh sửa tập trung. |
| **1** | [`sprint_1_chen_erd.drawio`](./sprint_1_chen_erd.drawio) | Chen ERD | Sơ đồ Chen Sprint 1 (7 thực thể: `users`, `email_otps`, `cities`, `pois`, `poi_categories`, `poi_opening_hours`, `poi_sources`). |
| **2** | [`sprint_1_relational_schema.drawio`](./sprint_1_relational_schema.drawio) | Physical Schema | Lược đồ quan hệ vật lý Sprint 1 với đầy đủ kiểu dữ liệu PostGIS (`geography`), PK, FK, UK. |
| **3** | [`sprint_2_chen_erd.drawio`](./sprint_2_chen_erd.drawio) | Chen ERD | Sơ đồ Chen Sprint 2: Bổ sung khảo sát người dùng (`trip_preferences`), chế độ ngân sách và sở thích du lịch. |
| **4** | [`sprint_2_relational_schema.drawio`](./sprint_2_relational_schema.drawio) | Physical Schema | Lược đồ quan hệ Sprint 2 + ánh xạ sang Knowledge Graph Neo4j AuraDB. |
| **5** | [`sprint_3_chen_erd.drawio`](./sprint_3_chen_erd.drawio) | Chen ERD | Sơ đồ Chen Sprint 3: Bổ sung quản lý lịch trình xanh (`itineraries`, `itinerary_days`, `itinerary_stops`) & 6 mục tiêu tối ưu. |
| **6** | [`sprint_3_relational_schema.drawio`](./sprint_3_relational_schema.drawio) | Physical Schema | Lược đồ quan hệ Sprint 3: Chi tiết các bảng tính toán chi phí, carbon, điểm đánh giá và booking Agoda/Traveloka. |
| **7** | [`sprint_4_domain_model_erd.drawio`](./sprint_4_domain_model_erd.drawio) | Chen ERD | **Mô hình miền dữ liệu toàn diện** Sprint 4 liên kết tất cả 17 thực thể của toàn hệ thống. |
| **8** | [`sprint_4_relational_schema.drawio`](./sprint_4_relational_schema.drawio) | Physical Schema | **Lược đồ CSDL vật lý hoàn chỉnh nhất (17 bảng)**, phân bổ trực quan theo 5 phân vùng miền nghiệp vụ. |
| **9** | [`generate_diagrams.py`](./generate_diagrams.py) | Python Script | Script tự động sinh lại toàn bộ file `.drawio` khi cần cập nhật schema. |

---

## 🚀 Hướng dẫn mở và chỉnh sửa trên Website `app.diagrams.net`

1. Truy cập [https://app.diagrams.net/#](https://app.diagrams.net/#).
2. Chọn **Tập tin** -> **Mở từ** -> **Thiết bị**.
3. Điều hướng đến thư mục **`D:\diagram`** và chọn file **`greentrip_database_master.drawio`** (hoặc bất kỳ file lẻ nào).
4. Bạn có thể xem và chỉnh sửa trực tiếp:
   * Chuyển tab giữa các Sprint ở thanh dưới cùng.
   * Nhấp đúp chuột vào bất kỳ ô hoặc dòng thuộc tính nào để chỉnh sửa văn bản.
   * Xuất ảnh chất lượng cao để chèn vào Word/báo cáo: **Tập tin** -> **Xuất dưới dạng** -> **PNG...** (Zoom `200%` - `300%`).
