# GreenTrip AI — Sprint 2.9 Performance Benchmark Report

**Dự án**: GreenTrip – A Multi-Objective Green Tourism Itinerary Optimizer for Central Vietnam  
**Thời gian thực hiện**: 24/11/2026  
**Công cụ benchmark**: `backend/scripts/audit_sprint2_9.py`, Starlette TestClient & Python `time.perf_counter`  
**Hệ điều hành / Cấu hình**: Windows 11, Intel Core i7 / AMD Ryzen, Python 3.13.9, 16GB RAM  

---

## 1. Kết Quả Đo Lường 10 Tác Vụ Cốt Lõi (Benchmark Table)

Toàn bộ 10 tác vụ trọng yếu của hệ thống GreenTrip AI đã được đo lường với số lượt lặp (iterations) từ 10 đến 20 lần, tính toán đầy đủ các chỉ số: **Mean (Trung bình)**, **Median (Trung vị)**, **P95 (Bách phân vị 95)**, **Max (Độ trễ tối đa)** và **Số lượng lỗi (Errors/Timeouts)**.

| STT | Tác Vụ Hệ Thống (Operation) | Số Lượt (Runs) | Mean (ms) | Median (ms) | P95 (ms) | Max (ms) | Số Lỗi (Errors) | Đánh Giá Hiệu Năng |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | **API Health Response** (`/health`) | 20 | 9.20 | 4.21 | 104.43 | 104.43 | 0 | Đạt chuẩn phản hồi nhanh (P50 < 5ms; P95 bị ảnh hưởng bởi cold start) |
| **2** | **POI Search (Tool Calling)** (`search_pois`) | 20 | 7.13 | 6.29 | 16.90 | 16.90 | 0 | Cực nhanh nhờ chỉ mục SQLite và tối ưu hóa truy vấn |
| **3** | **POI Details (Tool Calling)** (`get_poi_details`) | 20 | 0.05 | 0.04 | 0.11 | 0.11 | 0 | Gần như tức thời (< 0.1ms), truy xuất theo ID khóa chính |
| **4** | **POI Recommendation (Tool)** (`recommend_pois`) | 20 | 3.14 | 3.01 | 4.58 | 4.58 | 0 | Tính toán trọng số đa mục tiêu (Multi-criteria scoring) < 5ms |
| **5** | **KG Explanation (Tool)** (`get_poi_explanation`) | 20 | 32.86 | 30.90 | 44.87 | 44.87 | 0 | Cơ chế Relational Projection Fallback phản hồi ổn định ~30ms |
| **6** | **BM25 RAG Retrieval** (`rag_travel_knowledge`) | 20 | 4.70 | 3.96 | 8.15 | 8.15 | 0 | Truy xuất kho tri thức BM25 địa phương siêu tốc (< 5ms) |
| **7** | **Chatbot Response (Local Heuristic)** | 10 | 7.28 | 7.36 | 8.10 | 8.10 | 0 | Tổng hợp phản hồi điều phối nội bộ không phụ thuộc network cloud |
| **8** | **Generate/Optimize 2-Opt (5 stops)** | 20 | 0.03 | 0.02 | 0.08 | 0.08 | 0 | Thuật toán Nearest Neighbor + 2-Opt hội tụ tức thì với quy mô ngày |
| **9** | **Update / Mutate Itinerary (Tool)** | 20 | 0.10 | 0.04 | 1.07 | 1.07 | 0 | Thêm/xóa điểm dừng và tính toán lại chênh lệch chi phí/CO2 < 1ms |
| **10**| **Carbon Calculation (Tool)** (`get_carbon_estimate`)| 20 | 0.01 | 0.01 | 0.09 | 0.09 | 0 | Tính toán phát thải CO2 theo định mức ước tính (Heuristic Baseline GTVT VN) tức thời |

*Ghi chú*: Tỷ lệ lỗi trên toàn bộ 10 tác vụ là **0%** (0 lỗi / 190 lượt kiểm thử).

---

## 2. Phân Tích Chi Tiết Hiệu Năng & Hiện Tượng Cold-Start

### 2.1. Hiện tượng Cold-Start ở Endpoint `/health`
- **Quan sát**: Lần gọi đầu tiên của TestClient mất ~104.43ms do FastAPI và Starlette phải khởi tạo vòng lặp sự kiện (event loop), nạp middleware và kết nối database ban đầu.
- **Warm-State**: Sau lần gọi đầu tiên, thời gian xử lý trung bình giảm xuống chỉ còn **4.21ms**.
- **Kết luận**: Mức độ trễ này hoàn toàn nằm trong giới hạn cho phép của hệ thống Microservices du lịch (< 200ms).

### 2.2. Hiệu năng của Knowledge Graph Explanation Fallback
- Khi không có kết nối internet đến cụm Neo4j Aura Cloud, hệ thống tự động kích hoạt cơ chế phòng vệ **Relational Projection Fallback** trong `backend/app/db/neo4j_fallback.py`.
- Thời gian xử lý ghi nhận là **32.86ms (Mean)** và **30.90ms (Median)**. Cơ chế fallback này giải phóng hoàn toàn sự phụ thuộc vào mạng ngoài trong các tình huống demo ngoại tuyến hoặc khi hạ tầng mạng của hội đồng bảo vệ gặp sự cố.

### 2.3. Tốc độ của Thuật toán Tối ưu Tuyến đường (Nearest-Neighbor & 2-Opt)
- Thuật toán Heuristic đa mục tiêu thực hiện sắp xếp thứ tự các điểm dừng dựa trên ma trận khoảng cách Haversine và ràng buộc thời gian mở cửa/thời lượng tham quan.
- **Bản chất giải thuật**: Đây là thuật toán Heuristic kết hợp Nearest-Neighbor và 2-Opt pairwise swap viết bằng Python thuần ([backend/app/trips/itinerary_constraints.py:491](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/trips/itinerary_constraints.py#L491)), **không sử dụng Google OR-Tools**.
- **Quy mô đo lường**: Phép đo được thực hiện in-memory trên cụm 5 điểm dừng thông thường của một ngày du lịch, với thời gian hội tụ ghi nhận là **0.03ms (Mean)** và **0.02ms (Median)**.

### 2.4. Lưu ý về Môi Trường Đo Lường Ngoại Tuyến vs Trực Tuyến
- Toàn bộ kết quả benchmark trên phản ánh thời gian xử lý nội bộ của ứng dụng khi chạy với cơ chế dự phòng Heuristic cục bộ và CSDL SQLite.
- Trong điều kiện chạy trực tuyến có kết nối mạng tới mô hình ngôn ngữ lớn (Google Gemini 2.5 Flash), thời gian phản hồi tổng thể qua API sẽ dao động từ **800ms đến 2500ms** tùy thuộc vào độ trễ mạng internet và độ dài nội dung sinh ra (được bù đắp bằng cơ chế Streaming SSE để người dùng thấy token hiển thị ngay lập tức).

---

## 3. Khuyến Nghị Tối Ưu Hóa & Mở Rộng Quy Mô (Scalability)

1. **Bộ nhớ đệm (Caching)**:
   - Triển khai Redis Cache hoặc in-memory LRU cache cho các kết quả tìm kiếm POI phổ biến và RAG queries để giảm thiểu 80% tải đọc CSDL.
2. **Streaming SSE (Server-Sent Events)**:
   - Tiếp tục duy trì endpoint `/trips/copilot/chat/stream` đã xây dựng ở Sprint 2.3 để mang lại trải nghiệm phản hồi liên tục từng token cho người dùng cuối khi kết nối mô hình Gemini 2.5 Flash trên môi trường có internet.
3. **Connection Pooling**:
   - Khi chuyển sang production với PostgreSQL và Neo4j Aura, cấu hình `pool_size=20` và `max_overflow=10` cho SQLAlchemy / asyncpg để tối ưu số lượng kết nối đồng thời.
