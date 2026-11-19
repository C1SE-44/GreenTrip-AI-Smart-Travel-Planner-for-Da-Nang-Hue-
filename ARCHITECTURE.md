# System Architecture — GreenTrip AI

> Bản thiết kế kỹ thuật tổng quan của **GreenTrip AI (Smart Travel Planner for Da Nang & Hue)**. Tài liệu này giúp thành viên nhóm và AI Agent đặt đúng file vào đúng tầng, không trộn lẫn logic giữa UI, HTTP Router, Business Logic và Database.

---

## 1. Sơ đồ kiến trúc tổng quan

```text
+---------------------------------------------------------------+
|               FRONTEND (React 18 + TypeScript + Vite)         |
|  pages/ (Landing, Explore, VerifyEmail)                       |
|  components/<domain>/ (auth, explore, home, planner, poi...)  |
|  context/ (SavedPlacesContext)   services/ -> src/lib/api.ts  |
|  Leaflet / React-Leaflet Map     Offline Export (.ics / PDF)  |
+------------------------------+--------------------------------+
                               | HTTPS / JSON (JWT Bearer)
                               v
+---------------------------------------------------------------+
|                BACKEND API (Python 3.12 + FastAPI)            |
|  main.py (CORS, Lifespan, 1 prefix chuẩn duy nhất)            |
|  rate_limit.py (Sliding-window limiter cho Auth & Copilot)    |
|  Modules: auth | pois | recommendations | saved_places        |
|           trips | itineraries                                 |
|  Phân lớp: router.py -> schemas.py -> service.py -> repo/db   |
+-------+----------------+----------------+---------------------+
        |                |                |
        v                v                v
+---------------+ +--------------+ +----------------------------+
| PostgreSQL /  | |  Neo4j Aura  | | External Services          |
| Supabase      | |  (Knowledge  | | - Google Gemini 2.5 Flash  |
| (fallback     | |   Graph POI  | | - Google OAuth 2.0 Verify  |
|  SQLite dev)  | |  Explanation)| | - SMTP Gmail (OTP)         |
|               | |              | | - OSRM / Fallback Routing  |
+---------------+ +--------------+ +----------------------------+
```

---

## 2. Kiến trúc phân lớp (Layered Architecture)

### 2.1. Backend (`backend/app/`)
Mỗi phân hệ nghiệp vụ (`auth`, `pois`, `recommendations`, `saved_places`, `trips`, `itineraries`) được tổ chức tách biệt rõ trách nhiệm:

1. **`router.py` (HTTP / Controller Layer)**:
   - Khai báo FastAPI endpoint, đọc path/query/body params, gắn `Depends(get_current_user_id)` và `Depends(rate_limit(...))`.
   - Ánh xạ exception nghiệp vụ sang `HTTPException` (`400`, `401`, `403`, `404`, `422`, `429`, `500`, `503`).
   - **Không** viết truy vấn SQL trực tiếp hoặc logic tính toán dài trong router.
2. **`schemas.py` (Data Contract Layer)**:
   - Định nghĩa Pydantic v2 models cho Request/Response (là nguồn sự thật duy nhất của hợp đồng JSON — đồng bộ với [API_SPEC.md](API_SPEC.md)).
3. **`service.py` / domain helpers (Business Logic Layer)**:
   - Xử lý quy tắc nghiệp vụ: chấm điểm gợi ý POI, tối ưu/xác thực tham số chuyến đi, điều phối AI Copilot (`copilot_consultant.py`, `copilot_fallback.py`, `copilot_prompts.py`), xuất PDF (`pdf_export.py`), tính lộ trình (`routing_service.py`).
4. **`repository.py` & `app/db/` (Data Access Layer)**:
   - `app/db/postgres.py`: Quản lý kết nối PostgreSQL/Supabase (và fallback SQLite cục bộ khi không cấu hình `DATABASE_URL`).
   - `app/db/neo4j.py`: Driver Neo4j Aura phục vụ truy vấn Knowledge Graph giải thích địa điểm (`PB10`).

### 2.2. Frontend (`frontend/src/`)
1. **`pages/`**: Điểm vào tuyến trang (`LandingPage.tsx`, `ExplorePage.tsx`, `VerifyEmailPage.tsx`), khai báo route tập trung tại `App.tsx`.
2. **`components/<domain>/`**: Chia theo nghiệp vụ (`account`, `auth`, `common`, `explore`, `home`, `layout`, `planner`, `poi`, `saved`, `ui`). Các modal/drawer/panel phức tạp được tách thành subcomponent riêng cùng thư mục domain.
3. **`context/`**: Trạng thái dùng chung toàn ứng dụng (ví dụ `SavedPlacesContext.tsx`).
4. **`services/` & `lib/api.ts`**:
   - Mọi request tới Backend đều đi qua `src/lib/api.ts` (`fetchJson`, tự gắn `Authorization: Bearer <token>` và chuẩn hóa URL base).
   - Mỗi domain có service riêng (`auth.ts`, `poi.ts`, `poiExplanation.ts`, `recommendations.ts`, `savedPlaces.ts`, `tripService.ts`, `itineraryService.ts`, `copilotService.ts`, `profile.ts`).
5. **`data/` & `utils/`**: Kiểu dữ liệu & chuẩn hóa POI (`data/pois.ts`) cùng các hàm thuần (pure functions) dễ viết unit test trong `frontend/tests/`.

---

## 3. Cấu trúc cơ sở dữ liệu (Database Overview)

### 3.1. Cơ sở dữ liệu quan hệ (PostgreSQL / Supabase)
Các bảng chính được quản lý qua chuỗi migration đánh số tuần tự `001` → `016` (xem chi tiết thứ tự chạy tại [backend/migrations/README.md](backend/migrations/README.md) và sơ đồ ERD tại [docs/diagrams/README.md](docs/diagrams/README.md)):

| Bảng (`public.*`) | Vai trò chính |
| :--- | :--- |
| `users` | Tài khoản người dùng (`user_id`, `email`, `full_name`, `phone`, `password_hash` nullable cho Google OAuth, `role`, `status`, `avatar_path`). |
| `email_otps` | Lưu mã OTP xác thực email / đăng nhập (có hạn sử dụng và kiểm soát bảo mật). |
| `pois` | Danh mục điểm đến Đà Nẵng – Huế (tọa độ `lat`/`lng`, danh mục taxonomy V2, `green_score`, `is_local_business`, `estimated_cost`, `opening_hours`, `image_url`, `gallery_urls`, `eco_features`, `ai_metadata`). |
| `saved_place_collections` | Bộ sưu tập địa điểm đã lưu của từng `user_id` (có bộ sưu tập mặc định). |
| `saved_place_collection_items` | Liên kết N–N giữa `saved_place_collections` và `pois` (ràng buộc khóa ngoại `poi_id`). |
| `itineraries` | Thông tin chuyến đi / lịch trình (`trip_id`/`itinerary_id`, `user_id`, `title`, `destination`, `start_date`, `days_count`). |
| `itinerary_days` | Từng ngày trong chuyến đi (`day_number`, `date`, `title`, `note`). |
| `itinerary_stops` | Từng điểm dừng trong ngày (`poi_id`, `title`, `address`, `sequence`, `start_time`, `end_time`, `duration_minutes`, `stop_type`). |

### 3.2. Knowledge Graph (Neo4j Aura)
- Lưu quan hệ ngữ nghĩa giữa `POI`, `Category`, `City`, `EcoFeature`, `Vibe`, `LocalBusiness` (chi tiết tại [docs/NEO4J_KNOWLEDGE_GRAPH.md](docs/NEO4J_KNOWLEDGE_GRAPH.md) và [docs/NEO4J_AURA_SETUP.md](docs/NEO4J_AURA_SETUP.md)).
- Khi Neo4j chưa cấu hình hoặc tạm gián đoạn, backend trả fallback an toàn cho endpoint giải thích POI thay vì làm sập luồng khám phá.

---

## 4. Luồng dữ liệu trọng tâm (Data Flows)

1. **Khám phá & Giải thích POI**: `ExplorePage` → `poi.ts` (`GET /pois`) → `pois/router.py` → `pois` DB → render thẻ & `PoiMap`. Khi bấm xem lý do xanh → `poiExplanation.ts` (`GET /pois/{id}/explanation-facts`) → Neo4j Aura.
2. **Gợi ý & Lập lịch thông minh**: `TripOverviewView` / `TripItineraryView` → `recommendations.ts` (`POST /v1/recommendations/poi`) + `itineraryService.ts` (`PUT /trips/{id}/itinerary`, `POST /itineraries/compute`).
3. **AI Travel Copilot (PB14)**: `TripOverviewView` → `copilotService.ts` (`POST /trips/copilot/chat`) → `rate_limit` → `copilot_consultant.py` (kết hợp ngữ cảnh chuyến đi + truy vấn POI thật từ DB + Google Gemini; có `copilot_fallback.py` khi Gemini lỗi/thiếu key).
4. **Xuất lịch trình**:
   - `.ics` (Calendar): sinh trực tiếp phía Frontend từ dữ liệu lịch trình.
   - `.pdf`: gọi `GET /my-trips/{trip_id}/export` (yêu cầu JWT & kiểm tra chủ sở hữu) → Backend dùng ReportLab xuất binary PDF.

---

## 5. Bảo mật, Cấu hình & Triển khai

- **Biến môi trường (`backend/app/config.py`)**: Tất cả secrets (`JWT_SECRET_KEY`, `DATABASE_URL`, `NEO4J_*`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `SMTP_*`) đọc qua `.env`. Ở môi trường `staging`/`production`, ứng dụng **chặn khởi động** nếu còn dùng `JWT_SECRET_KEY` mặc định.
- **CORS (`backend/app/main.py`)**: Chỉ cho phép origin từ `FRONTEND_URL` và các địa chỉ dev local (`localhost:5173`, `127.0.0.1:5173`, `localhost:3000`, `127.0.0.1:3000`) khi bật `allow_credentials=True`.
- **Xác thực & Mật khẩu**: Hash mật khẩu bằng **Argon2 (`pwdlib`)**, xác thực token bằng **PyJWT**, bảo vệ route nhạy cảm bằng `get_current_user_id` và `rate_limit`.
- **CI/CD (`.github/workflows/ci.yml`)**: Tự động chạy **Backend CI** (`compileall` + `pytest`) và **Frontend CI** (`lint:ci` + `typecheck` + `test:unit` + `build`) trên mọi PR vào `develop`/`main`.
