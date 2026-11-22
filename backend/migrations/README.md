# Database Migrations (`backend/migrations/`)

Danh sách và thứ tự chạy tuần tự các SQL migration cho PostgreSQL / Supabase của **GreenTrip AI**.

## Thứ tự chạy chuẩn (`001` → `018`)

Chạy lần lượt theo đúng số thứ tự tăng dần:

| Thứ tự | File | Mô tả ngắn |
|---|---|---|
| 001 | `001_create_pois.sql` | Tạo bảng `public.pois` nền tảng |
| 002 | `002_secure_email_otps.sql` | Cấu hình bảng & bảo mật `public.email_otps` |
| 003 | `003_allow_null_password_hash_for_oauth.sql` | Cho phép `password_hash` NULL với tài khoản Google OAuth |
| 004 | `004_add_image_and_gallery_to_pois.sql` | Bổ sung `image_url`, `gallery_urls` cho `public.pois` |
| 005 | `005_upgrade_pois_taxonomy_v2.sql` | Bổ sung taxonomy V2 (`sub_category`, `cuisine`, `budget_tier`, `vibes`, `best_time`, `eco_features`, `ai_metadata`) |
| 006 | `006_add_contact_and_hours_to_pois.sql` | Bổ sung thông tin liên hệ & giờ mở cửa (`phone_number`, `website_url`, `social_links`, `opening_hours`, `email`) |
| 007 | `007_add_recommendation_columns.sql` | Bổ sung các cột phục vụ gợi ý & chấm điểm |
| 008 | `008_create_itineraries_and_routes.sql` | Tạo các bảng lịch trình `itineraries`, `itinerary_days`, `itinerary_stops` (schema ban đầu) |
| 009 | `009_saved_place_collections.sql` | Tạo bảng `saved_place_collections` & `saved_place_collection_items` (PB16) |
| 010 | `010_saved_place_items_poi_fk.sql` | Gắn khóa ngoại `poi_id` từ `saved_place_collection_items` tới `public.pois` |
| 011 | `011_remove_legacy_saved_places.sql` | Chuyển nốt dữ liệu & gỡ bảng cũ `public.saved_places` |
| 012 | `012_create_itinerary_days_and_stops.sql` | Chuẩn hóa/nâng cấp bảng `itineraries`, `itinerary_days`, `itinerary_stops` (bản thay thế cho file `008_create_itinerary_days_and_stops.sql` cũ) |
| 013 | `013_add_itinerary_stop_address.sql` | Bổ sung cột `address` cho `public.itinerary_stops` |
| 014 | `014_unify_itinerary_schema_and_indexes.sql` | Hợp nhất cột giữa schema `008` và `012`, đồng thời bổ sung secondary indexes |
| 015 | `015_add_itinerary_day_note.sql` | Bổ sung cột `note` cho `public.itinerary_days` (chạy sau `014`) |
| 016 | `016_add_user_avatar_path.sql` | Bổ sung cột `avatar_path` cho `public.users` |
| 017 | `017_create_poi_images_bucket.sql` | Tạo bucket công khai `poi-images` (5MB, JPEG/PNG/WebP) trên Supabase Storage |
| 018 | `018_db_3nf_fk_indexes_and_audit.sql` | Bật `pg_trgm`, đánh GIN/Composite Index, ràng buộc `CHECK`, khóa ngoại `owner_user_id`/`poi_uuid`, tạo bảng `admin_audit_logs` |

## Thư mục `manual/` (Chạy thủ công khi cần, không thuộc chuỗi migrate tự động)

- `manual/008_realign_poi_taxonomy_groups.sql`: Cập nhật dữ liệu phân nhóm taxonomy cho các POI cụ thể đã seed sẵn.
- `manual/008_rollback_realign_poi_taxonomy_groups.sql`: Rollback tương ứng cho thao tác chỉnh nhóm POI ở trên.

## Quy ước đánh số mới

- Mỗi migration mới tiếp theo phải dùng số thứ tự duy nhất tăng dần (`017_<short_snake_description>.sql`, `018_...`), không đặt trùng số.
- Các script data-patch / rollback chạy tay theo từng đợt dữ liệu đặt trong `manual/`.
