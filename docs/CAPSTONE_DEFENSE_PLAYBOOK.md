# Cẩm nang bảo vệ đồ án GreenTrip AI (C1SE-44)

GreenTrip AI giúp du khách tự túc lập lịch trình đi Đà Nẵng và Huế gọn trong vài phút, kiểm soát được tiền ăn ở, tránh chạy ngược đường và có phương án dự phòng ngay khi trời đổ mưa. Tài liệu này chuẩn bị sẵn kịch bản chạy thử trực tiếp cùng Hội đồng và phần giải đáp 24 câu hỏi phản biện dựa trên mã nguồn và số liệu đo thật của hệ thống.

## Phần 1: Bài toán của du khách và điểm khác biệt

### 1.1. Bốn khó khăn thật của khách đi Đà Nẵng và Huế (theo [PRD.md](../PRD.md))

1. Tự tìm quán ăn và điểm chơi rời rạc trên mạng mất nhiều ngày, dễ xếp lịch chạy ngược từ Sơn Trà sang Ngũ Hành Sơn rồi vòng về Hải Vân hoặc Kinh thành Huế, vừa mệt vừa tốn chi phí di chuyển.
2. Khó kiểm soát tổng chi phí theo từng người và từng khoản (ăn uống, lưu trú, vé tham quan) nên rất dễ lố ngân sách đặt ra (`B_max`).
3. Thời tiết miền Trung thay đổi nhanh (mưa dầm ở Huế, gió mạnh ven biển Đà Nẵng), khiến du khách bị động khi hoạt động ngoài trời bị hủy giữa chừng.
4. Các chatbot phổ biến thường gợi ý dồn vào vài điểm quá tải, đôi khi nêu tên quán đã đóng cửa hoặc nhầm địa bàn, mà người dùng lại không biết vì sao địa điểm đó hợp với mình.

### 1.2. So sánh dưới góc nhìn người đi du lịch

| Nhu cầu của du khách | Mindtrip AI / Layla AI | Wanderlog | GreenTrip AI (C1SE-44) |
| :--- | :--- | :--- | :--- |
| Tìm quán địa phương đúng thông tin, không chết ảnh | Dữ liệu toàn cầu rộng nhưng thiếu chiều sâu ngách bản địa | Phụ thuộc người dùng tự nhập hoặc Google Places thô | Kho 482 địa điểm Đà Nẵng và Huế đã kiểm tra tọa độ, giá, giờ mở cửa; ảnh WebP lưu riêng trên Supabase `poi-images` |
| Hỏi AI mà không bị gợi ý nhầm thành phố hay quán ảo | Trả lời LLM thuần nên vẫn có rủi ro nhầm địa bàn | Không chuyên lập lịch bằng hội thoại | Bộ lọc Corrective Grounding ([`copilot_grounding.py`](../backend/app/trips/copilot_grounding.py)) đối chiếu tên quán với DB, CSV chuẩn và `LANDMARK_CITY_KB` |
| Giữ tổng chi phí không vượt ngân sách và đúng giờ mở cửa | Gợi ý ước lượng | Ghi chép thu chi thủ công | Bộ giải [`itinerary_constraints.py`](../backend/app/trips/itinerary_constraints.py) kiểm tra `C_total <= B_max`, đối chiếu giờ mở cửa (`poi_contacts_cache.json`) và chừa giờ nghỉ trưa |
| Giảm đi vòng và biết mức phát thải CO2 | Sắp xếp tương đối | Sắp xếp điểm dừng cơ bản | Gom cụm đường đi theo Nearest-Neighbor + 2-opt và tính CO2 theo 4 phương tiện (ô tô 171g, xe máy 72g, buýt xanh 40g, đi bộ 0g/km) |
| Trở tay nhanh khi trời đột ngột đổ mưa | Phải gõ mô tả lại cho AI | Tự xóa và tìm từng điểm thay thế | Nút Chế độ ngày mưa 1 chạm ([`rainy_day_handler.py`](../backend/app/trips/handlers/rainy_day_handler.py)) đổi điểm ngoài trời sang điểm có mái che cùng khu vực, có Hoàn tác (Undo) |
| Hiểu vì sao ứng dụng chọn địa điểm này cho mình | Trả kết quả hộp đen | Không giải thích | Truy vấn đồ thị Neo4j (`GET /pois/{poi_id}/explanation-facts`) chỉ ra các mối liên kết phù hợp với sở thích của khách |
| Trải nghiệm ngay trên điện thoại và chịu tải lớn | Cần tải app hoặc tài khoản thương mại | App đóng | Quét QR tại `/demo-qr` mở trực tiếp qua HTTPS Caddy, có Redis Cache (`X-Cache: HIT/MISS`) và trang `/admin` phân quyền 2 lớp |

## Phần 2: Kịch bản demo 7 phút cùng Hội đồng

Mở ứng dụng từ tên miền HTTPS thật trên VPS (hoặc preview HTTPS) tại `/demo-qr` thay vì `localhost`, để giảng viên dùng chính camera điện thoại cá nhân bấm thử song song với màn hình trình chiếu.

### 2.1. Dòng thời gian trình diễn (0:00 đến 7:00)

| Khung giờ | Màn hình hoặc công cụ | Người dùng làm gì và Hội đồng kiểm chứng được gì |
| :--- | :--- | :--- |
| `0:00 - 1:00` | `/demo-qr` | Bật Chế độ Trình chiếu toàn màn hình, chỉ trạng thái `API Live` và HTTPS TLS, rồi mời Hội đồng quét mã QR bằng điện thoại để xem giao diện mobile `375px`. |
| `1:00 - 2:30` | `/explore` | Chọn Đà Nẵng hoặc Huế, kéo thanh ưu tiên Xanh và Chi phí, mở chi tiết 1 địa điểm và bấm xem giải thích "Vì sao nơi này phù hợp?" từ Neo4j. Mở nhanh tab Network cho thấy `X-Cache: HIT` và `Cache-Control: public, max-age=60`. |
| `2:30 - 4:30` | `/planner` | Tạo chuyến đi 3 ngày Đà Nẵng và Huế. Nhắn cho AI Copilot yêu cầu ưu tiên quán chay ở Huế và tránh điểm ngoài trời chiều mai để thấy câu trả lời stream SSE theo thời gian thực. Vào lịch chi tiết, bấm Tối ưu đường đi, đổi phương tiện sang Buýt xanh xem lượng CO2 giảm, bấm Chế độ ngày mưa rồi Hoàn tác, và xuất file `.ics` hoặc `.pdf`. |
| `4:30 - 5:45` | `/admin` và terminal | Từ trình duyệt chưa đăng nhập (hoặc điện thoại khách) truy cập `/admin` để thấy HTTP `401` / `403` chặn lại. Đăng nhập tài khoản `ADMIN`, sửa giá vé hoặc điểm xanh một địa điểm, cho xem vết log vừa ghi vào `admin_audit_logs` và xem cache tự làm mới nhờ `poi_cache.invalidate_pois()`. |
| `5:45 - 7:00` | Terminal và [`docker-compose.prod.yml`](../docker-compose.prod.yml) | Chạy `backend/scripts/benchmark_load.py` với 20 luồng song song để chứng minh tỷ lệ HIT cao và không lỗi, sau đó giới thiệu sơ đồ 4 container chạy production (Caddy, Frontend Nginx, FastAPI, Redis). |

### 2.2. Chuẩn bị trước buổi bảo vệ và phương án dự phòng

Trước 24 giờ, nhóm kiểm tra chứng chỉ HTTPS đã xanh (`curl -I https://<domain>/health`), dữ liệu trên Supabase PostgreSQL, Neo4j Aura và Redis đều sẵn sàng, tạo sẵn một tài khoản `USER` thường (test bị chặn `403`) và một tài khoản `ADMIN` bằng [`backend/scripts/promote_admin.py`](../backend/scripts/promote_admin.py), đồng thời tải ảnh PNG từ `/demo-qr` gắn vào slide. Trước giờ trình bày 15 phút, mở sẵn 3 tab: `/demo-qr`, `/explore` (bật sẵn DevTools Network lọc chữ `pois`), `/admin`, và một cửa sổ Terminal ở thư mục gốc của dự án.

Nếu Wi-Fi hội trường chập chờn, bật ngay 4G hotspot dự phòng; giao diện vẫn giữ nguyên bố cục vì ảnh POI tải webP lazy-load và [`PoiImage.tsx`](../frontend/src/components/ui/PoiImage.tsx) tự chèn ảnh dự phòng SVG khi mạng rớt. Nếu Gemini API chậm hoặc hết hạn mức trong lúc demo, luồng hội thoại ở [`backend/app/trips/`](../backend/app/trips/) tự chuyển sang bộ xử lý quy tắc kết hợp truy vấn SQL thực địa nên người dùng vẫn nhận được gợi ý có thật. Nếu Redis tạm gián đoạn, [`CacheBackend`](../backend/app/cache.py) và [`SlidingWindowRateLimiter`](../backend/app/rate_limit.py) tự chuyển về bộ nhớ RAM nội bộ sau timeout `0.5s` (thử kết nối lại sau `30s`), ứng dụng vẫn hoạt động bình thường.

## Phần 3: 24 câu hỏi Hội đồng thường gặp và cách trả lời

Mỗi câu dưới đây bắt đầu bằng câu trả lời ngắn gọn đúng góc nhìn người dùng, tiếp theo là cơ chế kỹ thuật bên dưới để trả lời khi giảng viên hỏi sâu vào mã nguồn.

### Nhóm 1: Trải nghiệm du khách và bài toán sản phẩm (Q1 - Q4)

#### Q1. Người dùng hỏi ChatGPT hoặc xem Google Maps là được, GreenTrip AI giải quyết thêm được gì?
Với ChatGPT, khách nhận về một đoạn chữ dễ lẫn quán đã đóng cửa và tự phải dò lại bản đồ xem hai điểm cách nhau bao xa hay tổng tiền có lố ví không. GreenTrip AI giúp du khách làm trọn trong một màn hình: xếp điểm đi theo cụm gần nhau để đỡ mệt, tự cộng tổng tiền so với trần ngân sách theo số người, đổi điểm ngoài trời sang điểm trong nhà khi trời mưa chỉ bằng một nút bấm, và giải thích rõ vì sao quán đó hợp với người đi.

Tham khảo mã nguồn: [`backend/app/trips/copilot_grounding.py`](../backend/app/trips/copilot_grounding.py), [`backend/app/trips/itinerary_constraints.py`](../backend/app/trips/itinerary_constraints.py), [`backend/app/trips/handlers/rainy_day_handler.py`](../backend/app/trips/handlers/rainy_day_handler.py).

#### Q2. Tại sao chỉ tập trung vào Đà Nẵng và Huế, liệu có mở rộng cho du khách đi các tỉnh khác không?
Nhóm chọn đi sâu vào tuyến Đà Nẵng và Huế vì đây là hành lang du lịch có đủ biển, núi bán đảo, di sản UNESCO và đèo Hải Vân, cho phép nhóm kiểm tra tận tay 482 địa điểm thay vì gom dữ liệu thô khắp cả nước khiến thông tin sai lệch. Về kỹ thuật, cơ sở dữ liệu chuẩn 3NF đã tách riêng bảng `cities` (`city_id`) và `poi_categories` (`category_id`), nên khi thêm Hội An, Nha Trang hay Đà Lạt chỉ cần nạp dữ liệu mới bằng script sẵn có mà giữ nguyên toàn bộ API và giao diện.

Tham khảo mã nguồn: [`docs/DATABASE_3NF_AUDIT_AND_ERD.md`](./DATABASE_3NF_AUDIT_AND_ERD.md), [`backend/scripts/safe_import_pois.py`](../backend/scripts/safe_import_pois.py).

#### Q3. Lượng CO2 và điểm Xanh (Eco Score) hiển thị cho du khách tính dựa trên cơ sở nào?
Để khách thấy tác động thật khi chọn phương tiện đi lại, hệ thống tính quãng đường giữa các điểm dừng trong ngày rồi nhân với hệ số phát thải hành khách theo từng loại xe: đi ô tô 171g, xe máy 72g, buýt xanh 40g và đi bộ 0g CO2e trên mỗi km. Riêng Eco Score của từng địa điểm phản ánh mức độ thân thiện môi trường qua các tiêu chí thực tế như quán chay, thực phẩm hữu cơ, điểm di sản văn hóa, sinh thái hoặc thuận tiện giao thông xanh.

Tham khảo mã nguồn: `TRANSPORT_EMISSION_FACTORS_G_PER_KM` trong [`backend/app/trips/itinerary_constraints.py`](../backend/app/trips/itinerary_constraints.py), [`backend/scripts/enrich_poi_scores.py`](../backend/scripts/enrich_poi_scores.py).

#### Q4. Nếu có 10.000 người dùng thật, chi phí server và AI có tăng vọt không?
Phần lớn thao tác của du khách là xem danh sách địa điểm, lọc sở thích và đọc hướng dẫn bản địa, những lượt đọc này được Redis Cache giữ lại để không tốn truy vấn database. Các câu hỏi đơn giản hoặc cẩm nang được phân loại ngay tại backend trước khi cần tới Gemini Flash, kết hợp giới hạn tần suất theo IP nên một máy chủ VPS phổ thông đủ sức gánh tải ổn định. Nếu thương mại hóa, nguồn thu đến từ việc hợp tác gắn nhãn xanh kiểm định cho cơ sở lưu trú, quán ăn sinh thái địa phương và bán gói lịch trình chọn sẵn cho đơn vị lữ hành nhỏ.

Tham khảo mã nguồn: [`backend/app/cache.py`](../backend/app/cache.py), [`backend/app/rate_limit.py`](../backend/app/rate_limit.py), [`docs/VPS_DEPLOYMENT_GUIDE.md`](./VPS_DEPLOYMENT_GUIDE.md).

### Nhóm 2: Trợ lý AI, bản đồ và tối ưu lịch trình (Q5 - Q10)

#### Q5. Làm sao để trợ lý AI không gợi ý nhầm quán ở Đà Nẵng cho người đang lập lịch ở Huế, hoặc tự bịa tên quán?
Câu trả lời từ Gemini đi qua tầng kiểm tra Corrective Grounding trước khi hiện trên màn hình. Mọi tên địa điểm được nhắc tới đều được chuẩn hóa tiếng Việt không dấu, đối chiếu chéo với kho địa điểm đã kiểm định (`all_pois_cleaned.csv`, `LANDMARK_CITY_KB` và PostgreSQL), rồi lọc đúng thành phố du khách đang chọn.

Tham khảo mã nguồn: `normalize_entity_text`, `_load_static_poi_names`, `LANDMARK_CITY_KB` trong [`backend/app/trips/copilot_grounding.py`](../backend/app/trips/copilot_grounding.py), [`backend/app/trips/copilot_hybrid_nlu.py`](../backend/app/trips/copilot_hybrid_nlu.py), [`backend/scripts/run_copilot_eval.py`](../backend/scripts/run_copilot_eval.py).

#### Q6. Khi API Gemini bị chậm hoặc hết hạn mức miễn phí, người dùng có bị lỗi trắng màn hình khi chat không?
Không, người dùng vẫn nhận được câu trả lời có ích cùng danh sách địa điểm thật. Kiến trúc Hybrid NLU nhận diện ý định và ràng buộc ngay tại backend trước khi gọi LLM, nên khi Gemini quá tải hoặc chưa có API key, hệ thống tự chuyển sang bộ quy tắc kết hợp truy vấn SQL trên dữ liệu địa điểm sẵn có và giữ nguyên luồng phản hồi SSE mượt mà.

Tham khảo mã nguồn: [`backend/app/trips/copilot_hybrid_nlu.py`](../backend/app/trips/copilot_hybrid_nlu.py), [`backend/app/trips/copilot_stream.py`](../backend/app/trips/copilot_stream.py), [`backend/tests/test_copilot_stream.py`](../backend/tests/test_copilot_stream.py).

#### Q7. Vì sao dùng thêm Neo4j bên cạnh PostgreSQL? Nếu Neo4j mất kết nối thì trang web có bị treo theo không?
PostgreSQL và PostGIS lo toàn bộ phần dữ liệu tài khoản, lịch trình và lọc tọa độ chính xác, còn Neo4j lưu quan hệ giữa địa điểm với phong cách, tiện ích xanh và cụm lân cận để trả lời tự nhiên câu hỏi "Vì sao nơi này hợp với bạn?" ngay khi khách bấm xem chi tiết. Nếu Neo4j Aura gặp sự cố tạm thời, `get_poi_explanation_facts` bắt lỗi riêng qua `ExplanationServiceUnavailable` để chỉ riêng khung giải thích hiện nút thử lại, còn việc xem bản đồ và lập lịch của du khách vẫn chạy bình thường.

Tham khảo mã nguồn: [`backend/app/pois/explanation_service.py`](../backend/app/pois/explanation_service.py), [`docs/NEO4J_KNOWLEDGE_GRAPH.md`](./NEO4J_KNOWLEDGE_GRAPH.md), [`docs/NEO4J_AURA_SETUP.md`](./NEO4J_AURA_SETUP.md).

#### Q8. Khi du khách bấm "Tối ưu đường đi" và đặt ngân sách, hệ thống tính toán như thế nào?
Bộ giải ở [`itinerary_constraints.py`](../backend/app/trips/itinerary_constraints.py) xử lý đồng thời 3 việc cho du khách: quy đổi giá vé và chi phí ước tính theo số người (`parse_vnd_amount`) để cảnh báo hoặc gợi ý đổi điểm rẻ hơn nếu vượt `B_max`, kiểm tra giờ mở cửa từng ngày trong tuần qua `check_opening_hours` (`poi_contacts_cache.json`) để không dẫn khách tới quán đóng cửa, và sắp xếp lại thứ tự điểm dừng bằng thuật toán Nearest-Neighbor kết hợp 2-opt trong khi vẫn giữ nguyên khung nghỉ trưa.

Tham khảo mã nguồn: [`backend/app/trips/itinerary_constraints.py`](../backend/app/trips/itinerary_constraints.py), [`backend/tests/test_copilot_part2_constraints.py`](../backend/tests/test_copilot_part2_constraints.py).

#### Q9. Du khách bật "Chế độ ngày mưa" thì ứng dụng chọn điểm thay thế bằng cách nào?
Hệ thống nhận diện các chặng ngoài trời dễ bị ảnh hưởng thời tiết (`OUTDOOR_EXCLUSIONS` như bãi biển, thác nước, bán đảo, đèo), tránh gợi ý các khu vực quá xa nếu khách đang ở trung tâm, và tìm điểm có mái che thuộc cùng thành phố (`INDOOR_SUB_CATEGORIES` như bảo tàng, không gian nghệ thuật, quán cafe yên tĩnh, điểm văn hóa). Nếu đổi xong mà du khách muốn giữ lại lịch cũ, chỉ cần bấm Hoàn tác (Undo) để khôi phục ngay trạng thái trước đó.

Tham khảo mã nguồn: [`backend/app/trips/handlers/rainy_day_handler.py`](../backend/app/trips/handlers/rainy_day_handler.py), [`frontend/src/components/planner/TripItineraryView.tsx`](../frontend/src/components/planner/TripItineraryView.tsx).

#### Q10. Làm sao để ảnh của 482 địa điểm tải nhanh trên điện thoại và không bao giờ bị lỗi vỡ hình?
Dữ liệu 482 địa điểm được làm sạch số điện thoại giả, chuẩn hóa địa chỉ và phân loại trước khi nạp DB (`clean_and_verify_all_pois.py`), sau đó chuyển toàn bộ ảnh sang định dạng WebP nhẹ đưa vào bucket `poi-images` trên Supabase Storage thay vì trỏ ra link ngoài dễ chết 404. Phía giao diện, component `PoiImage` bật `loading="lazy"` để tiết kiệm 4G cho khách, đặt `referrerPolicy="no-referrer"` và sẵn lớp ảnh dự phòng SVG nên thẻ địa điểm không bao giờ bị vỡ khung.

Tham khảo mã nguồn: [`backend/scripts/audit_and_migrate_poi_images.py`](../backend/scripts/audit_and_migrate_poi_images.py), [`backend/migrations/017_create_poi_images_bucket.sql`](../backend/migrations/017_create_poi_images_bucket.sql), [`frontend/src/components/ui/PoiImage.tsx`](../frontend/src/components/ui/PoiImage.tsx).

### Nhóm 3: Dữ liệu địa điểm và cơ sở dữ liệu (Q11 - Q14)

#### Q11. Cơ sở dữ liệu có đạt chuẩn 3NF và có khóa ngoại bảo vệ dữ liệu thật không?
Sau Migration `018`, schema trên PostgreSQL 15 + PostGIS gồm 13 bảng `public.*`, 11 khóa ngoại (`FOREIGN KEY`) quy định rõ `ON DELETE CASCADE`, `SET NULL` hoặc `RESTRICT`, và 6 ràng buộc miền `CHECK` (như `green_score` chỉ nhận `0..1`, `role` chỉ nhận `USER` hoặc `ADMIN`). Nhóm đã thử chèn giá trị sai `green_score = 1.5` và `role = 'SUPERHACKER'` trực tiếp vào database và PostgreSQL tự động từ chối bằng lỗi `CheckViolation`, đảm bảo dữ liệu hiển thị cho người dùng luôn sạch.

Tham khảo mã nguồn: [`backend/migrations/018_db_3nf_fk_indexes_and_audit.sql`](../backend/migrations/018_db_3nf_fk_indexes_and_audit.sql), [`docs/DATABASE_3NF_AUDIT_AND_ERD.md`](./DATABASE_3NF_AUDIT_AND_ERD.md).

#### Q12. Tại sao vẫn dùng `JSONB` / `TEXT[]` trên bảng `pois`, và giữ cả `user_id TEXT` lẫn `owner_user_id UUID` trên bảng `itineraries`?
Đây là cách cân bằng có chủ đích giữa chuẩn mực 3NF và tốc độ tải bản đồ cho du khách: các thông tin phụ ít sửa như danh sách tiện ích xanh (`eco_features`) hay giờ mở cửa (`opening_hours`) được lưu dạng `TEXT[]` / `JSONB` có đánh chỉ mục GIN để trang `/explore` không phải nối thêm 4 đến 5 bảng con khi nạp 482 địa điểm. Còn cột `owner_user_id UUID` và `poi_uuid UUID` giữ ràng buộc khóa ngoại chặt cho người dùng đã đăng nhập mà vẫn tương thích với lịch trình mẫu công khai dành cho khách chưa tạo tài khoản.

Tham khảo mã nguồn: [`docs/DATABASE_3NF_AUDIT_AND_ERD.md`](./DATABASE_3NF_AUDIT_AND_ERD.md) (Mục 1.2), [`backend/tests/test_db_3nf_migration.py`](../backend/tests/test_db_3nf_migration.py).

#### Q13. Khi nhiều người cùng tìm kiếm và lọc địa điểm, truy vấn database có chậm không?
Trên Supabase PostgreSQL thật, nhóm đã đo bằng `EXPLAIN ANALYZE` để kiểm chứng chỉ mục hoạt động đúng: câu tìm kiếm tên tiếng Việt gần đúng `ILIKE '%Chăm%'` chạy qua chỉ mục GIN `pg_trgm` (`idx_pois_name_trgm`) mất `2.532 ms` (`Bitmap Index Scan`), còn câu lọc ghép thành phố, danh mục và trạng thái qua B-Tree composite (`idx_pois_city_category_active`) chỉ mất `0.207 ms` (`Index Scan`), kết hợp cùng chỉ mục không gian PostGIS `GiST` trên cột tọa độ `geom`.

Tham khảo mã nguồn: Kết quả `EXPLAIN ANALYZE` ghi lại tại [`docs/DATABASE_3NF_AUDIT_AND_ERD.md`](./DATABASE_3NF_AUDIT_AND_ERD.md) (Phần 3, Mục 2).

#### Q14. Nếu quản trị viên sửa nhầm giá vé hoặc trạng thái hiển thị của một địa điểm thì làm sao truy vết lại?
Mỗi lần sửa qua `PATCH /admin/pois/{poi_id}`, hàm `update_poi_with_audit` thực hiện cập nhật bảng `pois` và ghi bản lưu `{before, after}` dưới dạng JSONB vào bảng `admin_audit_logs` trong cùng một transaction ACID. Ngoài ra khóa ngoại `admin_user_id` gắn `ON DELETE RESTRICT` để ngăn xóa nhầm tài khoản quản trị từng thao tác, giữ nguyên lịch sử đối chiếu lâu dài.

Tham khảo mã nguồn: [`backend/app/admin/repository.py`](../backend/app/admin/repository.py) (dòng 210 đến 281), [`backend/tests/test_admin_rbac.py`](../backend/tests/test_admin_rbac.py).

### Nhóm 4: An toàn tài khoản và phân quyền quản trị (Q15 - Q19)

#### Q15. Nếu một người dùng cố tình sửa dữ liệu trong trình duyệt hoặc tự gõ `/admin`, họ có vào được cổng quản trị không?
Không. Cả giao diện và máy chủ đều kiểm tra lại quyền tài khoản từ đầu ở mỗi lần truy cập: trên trình duyệt, `AdminRouteGuard` gọi `GET /auth/me` xác minh phiên làm việc; còn ở phía backend, toàn bộ API `/admin/*` gắn `Depends(require_admin)` để giải mã chữ ký JWT rồi đọc trực tiếp `role` và `status` mới nhất từ bảng `public.users` trong database, trả về `401 Unauthorized` nếu chưa đăng nhập hoặc `403 Forbidden` nếu tài khoản bị khóa hay chỉ có quyền `USER`.

Tham khảo mã nguồn: [`frontend/src/components/admin/AdminRouteGuard.tsx`](../frontend/src/components/admin/AdminRouteGuard.tsx), [`backend/app/auth/dependencies.py`](../backend/app/auth/dependencies.py) (`get_current_user`, `require_roles`), [`backend/app/admin/router.py`](../backend/app/admin/router.py).

#### Q16. Mật khẩu người dùng, token đăng nhập và mã xác thực OTP được bảo vệ ra sao?
Mật khẩu được băm một chiều bằng Argon2 qua thư viện `pwdlib`, còn mã OTP gửi qua email được lưu kèm thời hạn `expires_at`, cờ `is_used` và số lần thử `attempts` để khóa nếu nhập sai nhiều lần. Token JWT ký bằng `HS256`, và khi chạy ở môi trường `staging` hoặc `production`, hàm `validate_security_settings` từ chối khởi động server nếu `JWT_SECRET_KEY` còn để giá trị mặc định hoặc ngắn hơn 32 ký tự.

Tham khảo mã nguồn: [`backend/app/config.py`](../backend/app/config.py), [`backend/app/auth/password.py`](../backend/app/auth/password.py), [`backend/app/auth/router.py`](../backend/app/auth/router.py), [`backend/tests/test_dot1_security_and_bugfixes.py`](../backend/tests/test_dot1_security_and_bugfixes.py).

#### Q17. Làm thế nào để ngăn kẻ xấu gửi liên tục hàng nghìn yêu cầu đăng nhập hoặc hỏi AI làm nghẽn người dùng thật?
Các nhóm API nhạy cảm như xác thực, gửi lại OTP và AI Copilot được gắn bộ giới hạn tần suất `rate_limit` dùng cửa sổ trượt Redis Sorted Set (`ZREMRANGEBYSCORE`, `ZCARD`, `ZRANGE`, `ZADD`, `EXPIRE`). Khi một địa chỉ IP vượt ngưỡng, hệ thống chặn ngay ở đầu cổng FastAPI với mã `HTTP 429 Too Many Requests` kèm header `Retry-After` trước khi chạm tới database hay Gemini, đồng thời lấy đúng IP thật của khách từ header `X-Forwarded-For` sau proxy Caddy.

Tham khảo mã nguồn: [`backend/app/rate_limit.py`](../backend/app/rate_limit.py), [`backend/tests/test_redis_cache_and_ratelimit.py`](../backend/tests/test_redis_cache_and_ratelimit.py).

#### Q18. Nhóm quản lý thế nào để tránh lộ mật khẩu database hoặc khóa API Gemini lên GitHub và Docker image?
Toàn bộ khóa bí mật được nạp từ biến môi trường thông qua `pydantic-settings`, còn file `.env` được liệt kê trong cả `.gitignore` lẫn `.dockerignore` và `frontend/.dockerignore`. Khi đóng gói production multi-stage, container runtime chỉ gắn cấu hình khi chạy qua `env_file`, hoàn toàn không chứa file `.env` hay file kiểm thử bên trong image.

Tham khảo mã nguồn: [`.dockerignore`](../.dockerignore), [`frontend/.dockerignore`](../frontend/.dockerignore), [`.env.example`](../.env.example).

#### Q19. Khi đưa lên VPS, cổng Redis hoặc cổng Backend có bị hở ra Internet không?
Không. Trong [`docker-compose.prod.yml`](../docker-compose.prod.yml), Redis (cổng `6379`), Backend (`8000`) và Frontend (`8080`) chỉ mở giao tiếp nội bộ (`expose`) bên trong mạng Docker `greentrip_net`. Duy nhất container `caddy` mở cổng `80` và `443` ra ngoài kết hợp tường lửa UFW trên Ubuntu khóa các cổng còn lại, giúp tách biệt hoàn toàn tầng dữ liệu khỏi truy cập trực tiếp từ Internet.

Tham khảo mã nguồn: [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`deploy/Caddyfile`](../deploy/Caddyfile), [`docs/VPS_DEPLOYMENT_GUIDE.md`](./VPS_DEPLOYMENT_GUIDE.md).

### Nhóm 5: Khả năng phục vụ 10.000 người dùng và vận hành thực tế (Q20 - Q24)

#### Q20. Khi đông người vào xem trang Khám phá cùng lúc, tốc độ phản hồi đo được thực tế ra sao?
Nhóm chạy script đo tải đồng thời (`httpx` async) trực tiếp vào backend đang kết nối Supabase Postgres live:
- Với API tải 100 địa điểm một trang (`GET /pois?page=1&limit=100`, 120 request trên 20 luồng đồng thời): lượt lạnh đầu (`X-Cache: MISS`) mất `5.315,50 ms`, sau khi vào cache đạt `120/120` lượt `X-Cache: HIT`, 0 lỗi, độ trễ trung vị `p50 = 275,25 ms`, `p95 = 341,22 ms`, `p99 = 366,13 ms`, đạt `67,3 req/s`.
- Với API tải 10 địa điểm (`GET /pois?page=1&limit=10`, 50 request trên 10 luồng): lượt lạnh `1.486,13 ms` giảm xuống `p50 = 19,47 ms`, `p95 = 29,11 ms`, đạt `461,1 req/s` và 0 lỗi.

Tham khảo mã nguồn: [`backend/app/cache.py`](../backend/app/cache.py), [`backend/app/pois/router.py`](../backend/app/pois/router.py), [`backend/scripts/benchmark_load.py`](../backend/scripts/benchmark_load.py).

#### Q21. Nếu dùng Redis Cache mà Admin vừa cập nhật giá vé hoặc ẩn địa điểm, người dùng có phải đợi hết 5 phút mới thấy dữ liệu mới không?
Không, người dùng thấy dữ liệu mới ngay ở lần tải kế tiếp. Nhóm đánh số phiên bản cho key cache (`greentrip:pois:v{version}:...`); khi Admin lưu sửa đổi trong `patch_admin_poi`, hệ thống gọi `poi_cache.invalidate_pois()` để tăng biến đếm bằng lệnh `INCR greentrip:pois:version` trong độ phức tạp O(1) mà không dùng `KEYS *` gây nghẽn Redis, khiến mọi truy vấn mới tự động nạp dữ liệu vừa cập nhật (`X-Cache: MISS`).

Tham khảo mã nguồn: [`backend/app/cache.py`](../backend/app/cache.py), [`backend/app/admin/service.py`](../backend/app/admin/service.py) (dòng 77).

#### Q22. Khi nhiều người đăng ký tài khoản cùng lúc, việc gửi email OTP có làm khách phải đợi màn hình xoay vòng lâu không?
Khách nhận phản hồi đăng ký ngay lập tức vì việc kết nối máy chủ gửi mail SMTP được đưa sang `BackgroundTasks` qua hai hàm `_dispatch_verification_email` và `_dispatch_otp_email`. Giải pháp này giữ kiến trúc VPS gọn nhẹ cho giai đoạn 10.000 người dùng; khi mở rộng lên quy mô hàng trăm nghìn lượt cần bảo đảm gửi lại bền vững ngay cả lúc server khởi động lại, nhóm chỉ cần trỏ hai hàm này sang worker queue (Celery hoặc ARQ dùng chính Redis hiện có) mà giữ nguyên toàn bộ giao diện và API.

Tham khảo mã nguồn: [`backend/app/auth/router.py`](../backend/app/auth/router.py) (dòng 401, 408, 421, 591, 843).

#### Q23. Bộ cài đặt trên VPS khác gì so với môi trường lập trình trên máy cá nhân?
Môi trường dev chạy hot-reload (`vite dev` và `uvicorn --reload`) nên nặng RAM và chạy dưới quyền root. Trên VPS, nhóm tách riêng bộ build Multi-stage: `frontend/Dockerfile.prod` biên dịch sẵn file tĩnh rồi chạy bằng `nginxinc/nginx-unprivileged` ở quyền non-root `USER 101`, `backend/Dockerfile.prod` chạy API bằng user `appuser` với `UVICORN_WORKERS=2` không `--reload` kèm `HEALTHCHECK`, và đặt proxy Caddy đứng trước để tự cấp chứng chỉ HTTPS Let's Encrypt cũng như giữ luồng SSE streaming mượt cho AI Copilot (`flush_interval -1`).

Tham khảo mã nguồn: [`backend/Dockerfile.prod`](../backend/Dockerfile.prod), [`frontend/Dockerfile.prod`](../frontend/Dockerfile.prod), [`deploy/Caddyfile`](../deploy/Caddyfile), [`frontend/tests/demo-qr-and-deploy.test.mjs`](../frontend/tests/demo-qr-and-deploy.test.mjs).

#### Q24. Sản phẩm hiện tại còn giới hạn gì và hướng phát triển tiếp theo cho du khách là gì?
Nhóm xác định rõ 3 phần chưa đưa vào phiên bản MVP v1.0 (được ghi tại Mục 3.2 của [`PRD.md`](../PRD.md)): việc gửi email nền dùng `BackgroundTasks` theo tiến trình nên chưa có hàng đợi lưu vết bền vững qua lần khởi động lại container; chưa tích hợp thanh toán đặt vé trực tiếp VNPay/MoMo và bình chọn nhóm theo thời gian thực; dữ liệu mới tập trung tại Đà Nẵng và Huế. Ở phiên bản v1.1, nhóm dự kiến bổ sung hàng đợi Redis (ARQ/Celery), chia sẻ link lịch trình để nhóm bạn cùng bình chọn điểm đến, tự gắn mã QR bản đồ vào file PDF và mở rộng dữ liệu ra Hội An, Quy Nhơn.

Tham khảo tài liệu: Mục 3.2 trong [`PRD.md`](../PRD.md).

## Phần 4: Các lệnh kiểm chứng trực tiếp trước Hội đồng

Chạy các lệnh sau từ máy trình chiếu hoặc VPS nếu cần đối chiếu thông số trực tiếp:

```bash
# 1. Xác minh chứng chỉ HTTPS + endpoint sức khỏe hệ thống
curl -I https://<domain-cua-nhom>/health

# 2. Xác minh Cache-Aside X-Cache: MISS (lần 1) -> HIT (lần 2)
curl -I "https://<domain-cua-nhom>/api/pois?page=1&limit=10"
curl -I "https://<domain-cua-nhom>/api/pois?page=1&limit=10"

# 3. Chứng minh lớp chặn RBAC HTTP 401 khi không có token Admin
curl -i https://<domain-cua-nhom>/api/admin/overview

# 4. Chạy benchmark chịu tải đồng thời (120 request, 20 concurrency)
.venv/Scripts/python.exe backend/scripts/benchmark_load.py --base-url https://<domain-cua-nhom>/api --endpoint "/pois?page=1&limit=100" --requests 120 --concurrency 20

# 5. Xác minh cấu hình 4 container Production + không lỗi lint/typecheck/test
docker compose -f docker-compose.prod.yml config --quiet
cd frontend && npm run lint:ci && npm run typecheck && npm run test:unit && npm run build
```

## Phần 5: Danh mục tài liệu dự án

| Tài liệu hoặc thành phần | Nội dung chính | Mốc triển khai |
| :--- | :--- | :--- |
| [`PRD.md`](../PRD.md) | 4 nỗi đau của du khách, phân quyền 4 vai trò, phạm vi v1.0 và v1.1 | Nền tảng |
| [`ARCHITECTURE.md`](../ARCHITECTURE.md) và [`API_SPEC.md`](../API_SPEC.md) | Kiến trúc hệ thống và hợp đồng HTTP/JSON API | Nền tảng |
| [`docs/DATABASE_3NF_AUDIT_AND_ERD.md`](./DATABASE_3NF_AUDIT_AND_ERD.md) | Kiểm chứng 3NF, sơ đồ ERD 13 bảng, 11 khóa ngoại, 6 CHECK, kết quả `EXPLAIN ANALYZE` | Phase 5 (`#PB19`, PR #54) |
| [`backend/app/auth/dependencies.py`](../backend/app/auth/dependencies.py) và `/admin` | Bảo vệ RBAC 2 lớp (`401`/`403`), cổng quản trị POI và `admin_audit_logs` | Phase 6 (`#PB20`, PR #55) |
| [`backend/app/cache.py`](../backend/app/cache.py) và [`rate_limit.py`](../backend/app/rate_limit.py) | Redis Cache (`X-Cache`), xóa cache O(1), Rate Limit phân tán, gửi email nền, `benchmark_load.py` | Phase 7 (`#PB21`, PR #56) |
| [`docs/VPS_DEPLOYMENT_GUIDE.md`](./VPS_DEPLOYMENT_GUIDE.md) và `/demo-qr` | Docker Multi-stage `.prod`, Caddy Auto-HTTPS, tối ưu di động `375px`/`320px`, trang QR | Phase 8 (`#PB22`, PR #57) |
| [`docs/CAPSTONE_DEFENSE_PLAYBOOK.md`](./CAPSTONE_DEFENSE_PLAYBOOK.md) | Kịch bản demo 7 phút, 24 câu hỏi Hội đồng và các lệnh chứng minh | Phase 9 (`#PB23`, PR #58) |
