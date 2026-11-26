# API Specification — GreenTrip AI

> Hợp đồng giao tiếp HTTP/JSON chính thức giữa **Frontend (`frontend/src/services/`)** và **Backend (`backend/app/`)**.
> **Nguồn sự thật chi tiết nhất** cho từng kiểu dữ liệu & validation là Pydantic schemas trong `backend/app/*/schemas.py` và OpenAPI Swagger tự sinh tại `GET /docs` (`/openapi.json`).

---

## 1. Quy ước chung

- **Base URL (Local Dev):** `http://localhost:8000` (Frontend cấu hình qua biến `VITE_API_BASE_URL` trong `frontend/src/lib/api.ts`).
- **Prefix chuẩn duy nhất:** Mọi router được mount theo **1 prefix duy nhất** trong `backend/app/main.py` (`/auth`, `/pois`, `/v1/recommendations`, `/saved-places`, `/trips`, `/my-trips`, `/itineraries`). Không sử dụng prefix trùng `/api/...`.
- **Xác thực (Authentication):** Gửi JWT trong header:
  ```http
  Authorization: Bearer <access_token>
  ```
- **Định dạng lỗi chuẩn (FastAPI):**
  ```json
  { "detail": "Thông báo lỗi rõ ràng" }
  ```
- **Mã trạng thái HTTP chuẩn:**
  - `200 OK` / `201 Created` / `204 No Content`: Thành công.
  - `400 Bad Request` / `422 Unprocessable Entity`: Dữ liệu đầu vào không hợp lệ.
  - `401 Unauthorized`: Thiếu JWT, token sai hoặc hết hạn.
  - `403 Forbidden`: Đã đăng nhập nhưng không có quyền truy cập tài nguyên của người khác.
  - `404 Not Found`: Không tìm thấy tài nguyên (hoặc không thuộc chủ sở hữu).
  - `429 Too Many Requests`: Vượt giới hạn tần suất (`rate_limit.py`).
  - `500 Internal Server Error` / `503 Service Unavailable`: Lỗi hệ thống hoặc dịch vụ ngoài (DB/Neo4j/LLM).

---

## 2. Health Check

| Method | Path | Auth | Mô tả | Response chính |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/` | Public | Kiểm tra service sống | `{ "status": "ok", "service": "greentrip-api" }` |
| `GET` | `/health` | Public | Health check cho Docker / CI | `{ "status": "ok", "service": "greentrip-api" }` |

---

## 3. Authentication & Profile (`/auth`)

> Router: `backend/app/auth/router.py` · Schemas: `backend/app/auth/schemas.py` · FE: `frontend/src/services/auth.ts`, `profile.ts`

| Method | Path | Auth & Rate Limit | Request Body chính | Response chính |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/check-email` | Public | `{ email }` | `{ exists, email, status }` |
| `POST` | `/auth/signup` | Public + Rate Limit | `{ full_name, email, phone?, password }` | `201` `{ message, user, require_otp, otp_session_token, access_token?, token_type }` |
| `POST` | `/auth/login` | Public + Rate Limit (10/60s) | `{ email, password }` | `{ access_token, token_type }` |
| `POST` | `/auth/google` | Public + Rate Limit (10/60s) | `{ credential }` (Google ID Token) | `{ require_otp, email, otp_session_token?, access_token?, token_type, user?, message }` |
| `POST` | `/auth/verify-otp` | Public + Rate Limit | `{ email, otp_code, otp_session_token }` | `{ access_token, token_type }` |
| `POST` | `/auth/resend-otp` | Public + Rate Limit | `{ email, otp_session_token }` | `{ message, email }` |
| `POST` | `/auth/verify-email` | Public | `{ token }` | `{ message, email }` |
| `POST` | `/auth/resend-verification` | Public + Rate Limit | `{ email }` | `{ message, email }` |
| `GET` | `/auth/me` | **JWT** | — | `UserResponse`: `{ user_id, full_name, email, phone, role, status, avatar_url, has_password, created_at, updated_at }` |
| `PATCH` | `/auth/me` | **JWT** | `{ full_name?, phone? }` | `UserResponse` |
| `PUT` | `/auth/me/avatar` | **JWT** | `multipart/form-data` (file ảnh) | `UserResponse` |
| `POST` | `/auth/change-password` | **JWT** | `{ current_password, new_password, confirm_password }` | `204 No Content` |

---

## 4. POIs & Knowledge Graph Explanation (`/pois`)

> Router: `backend/app/pois/router.py` · Schemas: `backend/app/pois/schemas.py` · FE: `frontend/src/services/poi.ts`, `poiExplanation.ts`

| Method | Path | Auth | Query / Path Params | Response chính |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/pois/weights` | Public | Slider weight query params (`PB08`, gồm `local_authentic_only`) | `ParsedSliderWeights` |
| `GET` | `/pois` | Public | `page` (≥ 1), `limit`, `city`, `category`, `sub_category`, `cuisine`, `budget_tier`, `local_authentic_only`, slider weights... | `{ items: POIResponse[], pagination: { page, limit, total, total_pages, has_next, has_previous } }` *(gồm thêm trường tùy chọn `popularity_score`)* |
| `GET` | `/pois/{poi_id}/explanation-facts` | Public | `poi_id` | `{ poi: { id, name, is_local_business, local_business_type, source }, facts: [{ relationship, target_type, target_key, target_name }] }` |

---

## 5. Personalized Recommendations (`/v1/recommendations`)

> Router: `backend/app/recommendations/router.py` · Schemas: `backend/app/recommendations/schemas.py` · FE: `frontend/src/services/recommendations.ts`

| Method | Path | Auth | Request Body chính | Response chính |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/v1/recommendations/poi` | Public | `{ destination?, interests?, budget_band?, budget_tier?, ideas?, trip_days?, green_priority?, top_k?, trip_data?, slider_weights? }` | `{ status, total, data: RecommendationPOI[] }` *(mỗi item gồm `poi_id`, `name`, `category_name`, `sub_category`, `match_score`, `estimated_cost`, `green_score`, `is_local_business`, `best_time`, `opening_hours`...)* |

---

## 6. Saved Places & Collections (`/saved-places`)

> Router: `backend/app/saved_places/router.py` · Schemas: `backend/app/saved_places/schemas.py` · FE: `frontend/src/services/savedPlaces.ts`
> **Toàn bộ endpoint bên dưới bắt buộc JWT (`get_current_user_id`)** và chỉ thao tác trên dữ liệu của chính chủ token.

| Method | Path | Request / Query | Response chính |
| :--- | :--- | :--- | :--- |
| `GET` | `/saved-places` | — | `{ items: SavedPlaceItem[] }` |
| `POST` | `/saved-places` | `{ poi_id }` | `{ poi_id, saved, changed }` |
| `DELETE` | `/saved-places/{poi_id}` | `poi_id` (UUID) | `{ poi_id, saved, changed }` |
| `GET` | `/saved-places/collections` | `?poi_id=<UUID>` *(tùy chọn)* | `{ items: SavedPlaceCollection[] }` (`collection_id`, `name`, `is_default`, `place_count`, `cover_images`, `contains_poi`) |
| `POST` | `/saved-places/collections` | `{ name }` | `201` `{ collection_id, changed }` |
| `PATCH` | `/saved-places/collections/{collection_id}` | `{ name }` | `{ collection_id, changed }` |
| `DELETE` | `/saved-places/collections/{collection_id}` | — | `{ collection_id, changed }` |
| `GET` | `/saved-places/collections/{collection_id}/places` | — | `{ items: SavedPlaceItem[] }` |
| `POST` | `/saved-places/collections/{collection_id}/places/{poi_id}` | — | `{ collection_id, poi_id, saved, changed }` |
| `DELETE` | `/saved-places/collections/{collection_id}/places/{poi_id}` | — | `{ collection_id, poi_id, saved, changed }` |

---

## 7. Trip Planner & AI Copilot (`/trips`)

> Router: `backend/app/trips/router.py` · Schemas: `backend/app/trips/schemas.py` · FE: `frontend/src/services/itineraryService.ts`, `copilotService.ts`

| Method | Path | Auth & Rate Limit | Request Body chính | Response chính |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/trips/validate-parameters` | Public | `{ destination, days, total_budget?, budget_tier?, dining_tier?, lodging_tier?, activities_tier?, num_people, start_date?, preferences? }` | `{ valid, message, data: ValidatedTripData }` |
| `GET` | `/trips/{trip_id}/itinerary` | Optional JWT (owner check nếu trip gắn user) | Path `trip_id` | `TripItineraryResponse` (`trip_id`, `title`, `destination`, `start_date`, `days_count`, `days`, `updated_at`) |
| `PUT` | `/trips/{trip_id}/itinerary` | Optional JWT (owner check nếu trip gắn user) | `TripItinerarySyncRequest`: `{ trip_id, title, destination, start_date, days_count, days: ItineraryDay[] }` | `TripItineraryResponse` |
| `POST` | `/trips/copilot/chat` | Public + Rate Limit (20/60s) | `{ message, trip_context: TripContextPayload }` | `CopilotChatResponse`: `{ reply_text, intent, intent_category, reasoning_trace, recommended_poi_ids, detected_constraints, trip_memory, fact_check_warning, target_slot, suggested_pois, action_type, next_suggested_prompts }` |

---

## 8. My Trips CRUD & PDF Export (`/my-trips`)

> Router: `backend/app/trips/my_trips_router.py` · Schemas: `backend/app/trips/schemas.py` · FE: `frontend/src/services/tripService.ts`, `frontend/src/services/itineraryService.ts`
> **Toàn bộ endpoint bên dưới bắt buộc JWT (`get_current_user_id`)** và kiểm tra quyền sở hữu `user_id`.

| Method | Path | Request Body chính | Response chính |
| :--- | :--- | :--- | :--- |
| `POST` | `/my-trips` | `TripItinerarySyncRequest` | `201` `TripItineraryResponse` (tạo mới hoặc cập nhật lịch trình thuộc tài khoản hiện tại) |
| `GET` | `/my-trips` | — | `MyTripSummaryResponse[]` (`trip_id`, `title`, `destination`, `start_date`, `days_count`, `total_stops`, `updated_at`) |
| `GET` | `/my-trips/{trip_id}` | — | `TripItineraryResponse` |
| `PATCH` | `/my-trips/{trip_id}` | `{ title?, destination?, start_date? }` | `TripItineraryResponse` |
| `DELETE` | `/my-trips/{trip_id}` | — | `{ success, message, trip_id }` |
| `GET` | `/my-trips/{trip_id}/export` | — | `application/pdf` (file PDF tải xuống từ ReportLab) |

---

## 9. Route Geometry (`/itineraries`)

> Router: `backend/app/itineraries/router.py` · Schemas: `backend/app/itineraries/schemas.py` · FE: `frontend/src/services/itineraryService.ts`

| Method | Path | Auth | Request / Path | Response chính |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/itineraries/{itinerary_id}/days/{day_number}/route` | Public | Path `itinerary_id`, `day_number` | `DayRouteResponse`: `{ itinerary_id, day_number, total_days, total_stops, stops, route: { type, coordinates }, distance_meters, duration_seconds, is_fallback, routing_provider }` |
| `POST` | `/itineraries/compute` | Public | `{ stops: [{ order, poi_id?, name, latitude, longitude }] }` | `DayRouteResponse` |

---

## 10. Quy tắc bảo trì hợp đồng API
- Khi thêm/sửa bất kỳ endpoint hoặc trường JSON nào ở `backend/app/*/schemas.py`, bắt buộc cập nhật đồng thời `frontend/src/services/*.ts` và file `API_SPEC.md` này trong cùng PR.
- Kiểm thử tối thiểu 3 trường hợp cho mọi endpoint bảo vệ bằng JWT: **hợp lệ (`200`/`201`)**, **thiếu/sai token (`401`)**, và **truy cập tài nguyên của người khác (`403`/`404`)**.
