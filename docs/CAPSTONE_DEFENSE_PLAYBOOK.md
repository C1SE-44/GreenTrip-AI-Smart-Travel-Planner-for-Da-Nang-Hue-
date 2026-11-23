# Cẩm Nang Bảo Vệ Đồ Án Tốt Nghiệp — GreenTrip AI (`C1SE-44`)

Tài liệu tác chiến toàn diện phục vụ buổi **Bảo vệ Đồ án Tốt nghiệp** cho nền tảng **GreenTrip AI (Smart Eco-Friendly Travel Planner for Da Nang & Hue)** — tổng hợp từ kiến trúc thật, mã nguồn thật, số liệu kiểm thử thực tế trên Supabase PostgreSQL + Neo4j Aura + Redis + Google Chrome, giúp nhóm trình diễn thuyết phục trước Hội đồng mà không phụ thuộc vào suy đoán hay localhost cơ bản.

---

## Phần 1 — Định Vị Sản Phẩm, Nỗi Đau Thật (10.000 Người Dùng) & So Sánh Đối Thủ

### 1.1. Bốn nỗi đau thực tế tại tuyến Đà Nẵng – Huế (trích [PRD.md](../PRD.md))

Khách du lịch tự túc tại hành lang Đà Nẵng – Thừa Thiên Huế hiện đối mặt 4 vấn đề cụ thể:

1. **Lãng phí thời gian & di chuyển zíc-zắc kiệt sức:** Phải đọc review rời rạc trên mạng xã hội, dẫn tới xếp điểm tham quan ngược đường giữa các quận/khu vực (Sơn Trà ↔ Ngũ Hành Sơn ↔ Hải Vân ↔ Kinh thành Huế), tốn kém chi phí và thời gian di chuyển.
2. **Dễ vượt ngân sách (`B_max`):** Chưa có công cụ theo dõi tổng chi phí thực tế theo số người và theo từng nhóm chi tiêu (Ăn uống, Lưu trú, Hoạt động) ngay trong lúc chỉnh lịch.
3. **Bị động trước thời tiết miền Trung:** Mưa dầm bất chợt ở Huế hoặc biển động tại Đà Nẵng làm gãy kế hoạch ngoài trời, du khách lúng túng không tìm được điểm thay thế trong nhà tương đương về vị trí và gu.
4. **Áp lực quá tải du lịch (Overtourism) & thiếu minh bạch gợi ý AI:** Chatbot AI thông thường hay gợi ý dồn vào vài điểm đông đúc, dễ bịa địa chỉ/quán đóng cửa và không giải thích rõ *vì sao địa điểm đó phù hợp*.

### 1.2. Đối chiếu công tâm với Mindtrip AI, Wanderlog và Layla AI

| Tiêu chí thực chiến | Mindtrip AI / Layla AI | Wanderlog | GreenTrip AI (`C1SE-44`) |
| :--- | :--- | :--- | :--- |
| **Dữ liệu địa phương Đà Nẵng – Huế** | Dữ liệu toàn cầu chung, thiếu độ sâu ngách bản địa (chay, làng nghề, di sản nhỏ) | Phụ thuộc người dùng tự nhập hoặc Google Places thô | Kho địa điểm Đà Nẵng – Huế đã kiểm định & chuẩn hóa (ảnh WebP riêng trên Supabase bucket `poi-images`) |
| **Chống AI bịa tên địa điểm (Hallucination)** | Trả lời LLM thuần, có rủi ro bịa quán đã đóng cửa hoặc nhầm thành phố | Không phải AI Planner chủ đạo | Lọc **Corrective Grounding** ([`copilot_grounding.py`](../backend/app/trips/copilot_grounding.py)): đối chiếu thực thể với DB, CSV chuẩn và `LANDMARK_CITY_KB`, chặn rò rỉ điểm giữa Đà Nẵng và Huế |
| **Ràng buộc ngân sách & giờ mở cửa** | Chỉ gợi ý ước lượng | Theo dõi chi tiêu thủ công | Bộ giải định lượng ([`itinerary_constraints.py`](../backend/app/trips/itinerary_constraints.py)): kiểm tra `C_total <= B_max`, đối chiếu giờ mở cửa (`poi_contacts_cache.json`) & khung nghỉ trưa |
| **Tối ưu đường đi & dấu chân Carbon (CO₂)** | Sắp xếp tương đối | Sắp xếp đường đi cơ bản | Gom cụm **Nearest-Neighbor + 2-opt** + ước tính CO₂ theo 4 phương tiện (`Ô tô 171g`, `Xe máy 72g`, `Buýt xanh 40g`, `Đi bộ 0g/km`) |
| **Ứng phó thời tiết xấu** | Hỏi lại từ đầu bằng text | Phải xóa tay từng chặng | Nút **Chế độ ngày mưa** 1 chạm ([`rainy_day_handler.py`](../backend/app/trips/handlers/rainy_day_handler.py)) thay điểm ngoài trời bằng điểm trong nhà + **Hoàn tác (Undo)** |
| **Minh bạch lý do gợi ý** | Đưa kết quả hộp đen | Không có | **Neo4j Knowledge Graph** (`GET /pois/{poi_id}/explanation-facts`) giải thích quan hệ điểm đến |
| **Quét QR trải nghiệm & vận hành 10.000 user** | Cần tải app / hạ tầng thương mại đóng | App đóng | `/demo-qr` quét trực tiếp HTTPS qua Caddy + Redis Cache (`X-Cache: HIT/MISS`) + RBAC `/admin` có Audit Log |

---

## Phần 2 — Kịch Bản Live Demo 7 Phút Bất Bại Trước Hội Đồng

> **Nguyên tắc vàng:** Không chạy `localhost` trước Hội đồng — mở trang `/demo-qr` từ tên miền HTTPS thật (hoặc preview HTTPS) để Hội đồng tự quét mã và bấm trực tiếp trên điện thoại cá nhân song song màn hình máy chiếu.

### 2.1. Dòng thời gian chi tiết (0:00 → 7:00)

| Mốc thời gian | Màn hình / Công cụ | Hành động trình diễn & Thông điệp chốt với Hội đồng |
| :--- | :--- | :--- |
| **`0:00 – 1:00`** | **`/demo-qr`** | Bấm **Chế độ Trình chiếu** toàn màn hình. Chỉ trạng thái **`API Live · HTTPS TLS`**, mời Quý Thầy/Cô dùng camera điện thoại quét mã QR để trải nghiệm song song trên giao diện mobile `375px` mượt mà. |
| **`1:00 – 2:30`** | **`/explore`** | Chọn khu vực Đà Nẵng / Huế, kéo thanh lọc ưu tiên **Xanh vs Chi phí**, bấm xem 1 POI và mở *"Vì sao nơi này phù hợp?"* (Neo4j Knowledge Graph `GET /pois/{id}/explanation-facts`). Chỉ nhanh tab Network thấy header **`X-Cache: HIT`** & **`Cache-Control: public, max-age=60`**. |
| **`2:30 – 4:30`** | **`/planner`** | Tạo lịch 3 ngày Đà Nẵng – Huế. Mở **AI Copilot Chat** gõ yêu cầu (ví dụ: *"Ưu tiên quán chay ở Huế và tránh điểm ngoài trời chiều mai"*), chỉ stream SSE thời gian thực. Chuyển sang lịch chi tiết, bấm **Tối ưu đường đi**, đổi phương tiện sang Buýt xanh để thấy CO₂ giảm, bấm **Chế độ ngày mưa** (và **Hoàn tác**), xuất file **`.ics` / `.pdf`**. |
| **`4:30 – 5:45`** | **`/admin` & Postman/cURL** | Từ một tab ẩn danh / điện thoại Hội đồng thử vào `/admin` → chứng minh lớp bảo vệ **`HTTP 401` / `403`** chặn tuyệt đối người dùng thường. Đăng nhập tài khoản **`ADMIN`**, sửa giá/điểm xanh 1 địa điểm → cho xem bản ghi vết mới tinh ở **`admin_audit_logs`** và giải thích cơ chế `poi_cache.invalidate_pois()` làm mới cache ngay lập tức. |
| **`5:45 – 7:00`** | **Terminal + [`docker-compose.prod.yml`](../docker-compose.prod.yml)** | Chạy `backend/scripts/benchmark_load.py` chứng minh tốc độ khi 20 luồng đồng thời (`X-Cache: HIT`, `0` lỗi), mở sơ đồ 4 container production cô lập mạng (`Caddy Auto-HTTPS` → `Nginx` + `FastAPI` + `Redis`). |

### 2.2. Checklist chuẩn bị trước giờ G & Plan B

**Trước `T-24 giờ`:**
- [ ] Kiểm tra tên miền HTTPS trỏ đúng IP VPS, chứng chỉ TLS tự động qua Caddy xanh (`curl -I https://<domain>/health`).
- [ ] Nạp sẵn dữ liệu mẫu vào PostgreSQL/Supabase, Neo4j Aura và kiểm tra Redis container `healthy`.
- [ ] Chuẩn bị sẵn 2 tài khoản test: 1 tài khoản `USER` bình thường (chứng minh bị chặn `403` ở `/admin`) và 1 tài khoản `ADMIN` (tạo bằng [`backend/scripts/promote_admin.py`](../backend/scripts/promote_admin.py)).
- [ ] Tải sẵn file PNG mã QR từ nút **Tải mã QR (PNG)** ở `/demo-qr` chèn vào slide mở đầu và slide kết thúc.

**Trước `T-15 phút`:**
- [ ] Mở sẵn 3 tab: Tab 1 (`/demo-qr` full-screen), Tab 2 (`/explore` + DevTools tab Network lọc sẵn `pois`), Tab 3 (`/admin`).
- [ ] Mở sẵn 1 cửa sổ Terminal tại thư mục gốc để chạy lệnh benchmark hoặc `curl -I` nếu Hội đồng hỏi kỹ thuật.

**Plan B (Xử lý sự cố tức thì nếu mạng hội trường yếu hoặc Gemini quota chạm ngưỡng):**
- Nếu **Wi-Fi hội trường chập chờn**: dùng ngay 4G phát hotspot từ điện thoại dự phòng; toàn bộ ảnh POI đã dùng lazy-load WebP trên Supabase Storage + [`PoiImage.tsx`](../frontend/src/components/ui/PoiImage.tsx) có SVG an toàn khi ảnh lỗi nên giao diện không vỡ.
- Nếu **Gemini API chậm hoặc hết quota**: Hệ thống đã cài fallback tuyến tính theo ngữ cảnh & tri thức bản địa ngay trong [`backend/app/trips/`](../backend/app/trips/) (không văng lỗi 500 trước mặt Hội đồng).
- Nếu **Redis tạm gián đoạn**: [`CacheBackend`](../backend/app/cache.py) và [`SlidingWindowRateLimiter`](../backend/app/rate_limit.py) tự chuyển sang RAM nội bộ sau timeout `0.5s` (cooldown `30s`), ứng dụng vẫn chạy liên tục.

---

## Phần 3 — 24 Câu Hỏi Phản Biện Khó Nhất & Lời Trả Lời Phòng Thủ Tối Thượng

> **Mẹo trả lời Hội đồng:** Luôn nói **30 giây đầu tiên đúng trọng tâm**, sau đó mới dẫn **tên file / số liệu đo thật** trong codebase để giảng viên thấy nhóm tự làm chủ từng dòng code.

---

### Nhóm A — Nghiệp Vụ & Sản Phẩm (Q1 – Q4)

#### Q1. Sinh viên dùng ChatGPT hoặc mở Google Maps cũng hỏi được lịch trình, GreenTrip AI sinh ra để giải quyết vấn đề gì khác biệt?
- **Trả lời nhanh 30 giây:** ChatGPT chỉ sinh văn bản tĩnh, rất hay bịa quán đã đóng cửa và không kiểm soát được tọa độ đường đi hay trần ngân sách. GreenTrip AI giải 4 nỗi đau thật của khách tự túc Đà Nẵng – Huế: **không đi zíc-zắc** (gom cụm lộ trình + CO₂), **không cháy túi** (bộ giải `C_total <= B_max` theo 3 nhóm chi), **không đứng hình khi trời mưa** (đổi điểm trong nhà 1 chạm), và **không mù mờ thông tin** (Neo4j giải thích lý do đề xuất).
- **Bằng chứng mã nguồn:** Bộ kiểm chứng thực thể [`backend/app/trips/copilot_grounding.py`](../backend/app/trips/copilot_grounding.py), bộ giải ràng buộc [`backend/app/trips/itinerary_constraints.py`](../backend/app/trips/itinerary_constraints.py) và bộ xử lý ngày mưa [`backend/app/trips/handlers/rainy_day_handler.py`](../backend/app/trips/handlers/rainy_day_handler.py).

#### Q2. Tại sao phạm vi chỉ làm Đà Nẵng – Huế? Có mở rộng toàn quốc cho 10.000 người dùng được không?
- **Trả lời nhanh 30 giây:** Nhóm cố ý chọn chiều sâu dữ liệu ở hành lang du lịch Đà Nẵng – Huế (kết nối nhiều đặc thù: biển – bán đảo – di sản UNESCO – đèo Hải Vân) để kiểm định thủ công 100% tọa độ, giá vé, giờ mở cửa và nhãn xanh thay vì cào rác toàn quốc. Kiến trúc DB chuẩn 3NF đã tách bảng tham chiếu `cities` (`city_id`) và `poi_categories` (`category_id`), nên mở thêm Hội An, Nha Trang hay Đà Lạt chỉ cần chạy pipeline nạp dữ liệu mà không phải sửa schema hay viết lại API.
- **Bằng chứng mã nguồn:** Tài liệu 3NF [`docs/DATABASE_3NF_AUDIT_AND_ERD.md`](./DATABASE_3NF_AUDIT_AND_ERD.md) và script import an toàn [`backend/scripts/safe_import_pois.py`](../backend/scripts/safe_import_pois.py).

#### Q3. Chỉ số Eco Score và lượng phát thải CO₂ trong app là bịa số cho đẹp hay tính có cơ sở?
- **Trả lời nhanh 30 giây:** Hai lớp này tách bạch rõ ràng: **lượng CO₂ di chuyển** được tính theo quãng đường thực tế giữa các điểm nhân hệ số phát thải chuẩn giao thông đô thị (`g CO₂e/km`), còn **Eco Score** đánh giá mức độ bền vững của từng địa điểm theo tiêu chí ẩm thực chay/hữu cơ, giao thông xanh và di sản/sinh thái bản địa.
- **Bằng chứng mã nguồn:** Hệ số trong [`backend/app/trips/itinerary_constraints.py`](../backend/app/trips/itinerary_constraints.py) (`TRANSPORT_EMISSION_FACTORS_G_PER_KM`: `driving: 171`, `motorcycle: 72`, `transit: 40`, `walking: 0` g CO₂e/km) và hàm chuẩn hóa điểm xanh trong [`backend/scripts/enrich_poi_scores.py`](../backend/scripts/enrich_poi_scores.py).

#### Q4. Nếu có 10.000 người dùng thật ngoài xã hội, chi phí server & AI có làm nhóm phá sản không? Mô hình duy trì thế nào?
- **Trả lời nhanh 30 giây:** Nhờ 3 kỹ thuật kiểm soát tải — **Redis Cache** giữ 100% truy vấn danh sách POI lặp lại không chạm DB, **bộ phân loại intent cục bộ** giảm gọi Gemini vô ích cho các thao tác lọc/cẩm nang, và **Rate Limit** theo IP — một VPS phổ thông kèm Redis và Gemini Flash đủ gánh mức đọc cao. Về doanh thu bền vững (B2B2C), nền tảng có thể thu phí gắn nhãn kiểm định xanh cho quán ăn/homestay sinh thái bản địa, gói trải nghiệm Must-Try và API tư vấn tuyến xanh cho đơn vị lữ hành địa phương.
- **Bằng chứng mã nguồn:** [`backend/app/cache.py`](../backend/app/cache.py), [`backend/app/rate_limit.py`](../backend/app/rate_limit.py), [`docs/VPS_DEPLOYMENT_GUIDE.md`](./VPS_DEPLOYMENT_GUIDE.md).

---

### Nhóm B — AI Thực Chiến, Knowledge Graph & Thuật Toán (Q5 – Q10)

#### Q5. Làm sao ngăn Gemini "nói hươu nói vượn" hoặc gợi ý quán ở Đà Nẵng cho lịch trình đang ở Huế?
- **Trả lời nhanh 30 giây:** GreenTrip không thả nổi câu trả lời thô của LLM ra màn hình mà cho đi qua tầng **Corrective Grounding**. Mọi địa danh in đậm hoặc thẻ POI AI nhắc đến đều được chuẩn hóa tiếng Việt không dấu, đối chiếu với kho địa điểm đã kiểm định (`all_pois_cleaned.csv` + `LANDMARK_CITY_KB` + PostgreSQL) và lọc nghiêm theo thành phố mục tiêu.
- **Bằng chứng mã nguồn:** Hàm `normalize_entity_text`, `_load_static_poi_names`, `LANDMARK_CITY_KB` trong [`backend/app/trips/copilot_grounding.py`](../backend/app/trips/copilot_grounding.py) và [`backend/app/trips/copilot_hybrid_nlu.py`](../backend/app/trips/copilot_hybrid_nlu.py), cùng bộ đánh giá AI [`backend/scripts/run_copilot_eval.py`](../backend/scripts/run_copilot_eval.py).

#### Q6. Khi API Gemini mất kết nối hoặc vượt hạn mức thì AI Copilot của hệ thống có bị lỗi sập trang không?
- **Trả lời nhanh 30 giây:** Không. Kiến trúc Hybrid NLU của nhóm phân loại ý định và trích xuất ràng buộc định lượng ngay tại backend trước khi gọi LLM; khi Gemini timeout hoặc chưa cấu hình API key, hệ thống tự động fallback sang bộ xử lý quy tắc + truy vấn SQL thực địa để vẫn trả lời đúng địa điểm có thật và không làm sập luồng chat SSE.
- **Bằng chứng mã nguồn:** [`backend/app/trips/copilot_hybrid_nlu.py`](../backend/app/trips/copilot_hybrid_nlu.py), [`backend/app/trips/copilot_stream.py`](../backend/app/trips/copilot_stream.py) và suite test [`backend/tests/test_copilot_stream.py`](../backend/tests/test_copilot_stream.py).

#### Q7. Tại sao dùng Neo4j song song với PostgreSQL? Có bị thừa công nghệ không, và Neo4j sập thì web có chết theo không?
- **Trả lời nhanh 30 giây:** PostgreSQL + PostGIS mạnh về lưu trữ giao dịch 3NF, lọc quan hệ và truy vấn tọa độ phẳng; còn Neo4j biểu diễn tự nhiên đồ thị liên kết *"Địa điểm → Đặc trưng xanh / Phong cách / Khu vực lân cận"* để trả lời câu hỏi *"Vì sao gợi ý nơi này?"* chỉ bằng một lần duyệt đồ thị. Và để an toàn, mọi kết nối Neo4j đều có lớp cô lập lỗi: nếu Neo4j Aura tạm nghỉ, `get_poi_explanation_facts` ném `ExplanationServiceUnavailable` có kiểm soát để UI hiện thông báo thân thiện + nút thử lại, hoàn toàn không ảnh hưởng `/explore` hay `/planner`.
- **Bằng chứng mã nguồn:** [`backend/app/pois/explanation_service.py`](../backend/app/pois/explanation_service.py), [`docs/NEO4J_KNOWLEDGE_GRAPH.md`](./NEO4J_KNOWLEDGE_GRAPH.md) và [`docs/NEO4J_AURA_SETUP.md`](./NEO4J_AURA_SETUP.md).

#### Q8. Thuật toán "tối ưu lộ trình" và kiểm tra ngân sách của nhóm chạy như thế nào?
- **Trả lời nhanh 30 giây:** Ở backend ([`itinerary_constraints.py`](../backend/app/trips/itinerary_constraints.py)), hệ thống giải 3 ràng buộc đồng thời: (1) tính tổng chi phí thực tế theo số người và so với trần `B_max` (dùng `parse_vnd_amount` và tự đề xuất điểm thay thế rẻ hơn nếu vượt trần), (2) kiểm tra khung giờ mở cửa từng thứ trong tuần (`check_opening_hours` đối chiếu `poi_contacts_cache.json`), và (3) sắp xếp thứ tự điểm dừng bằng thuật toán **Nearest-Neighbor + 2-opt** nhưng giữ cố định khung giờ nghỉ trưa để không đi zíc-zắc.
- **Bằng chứng mã nguồn:** [`backend/app/trips/itinerary_constraints.py`](../backend/app/trips/itinerary_constraints.py) và [`backend/tests/test_copilot_part2_constraints.py`](../backend/tests/test_copilot_part2_constraints.py).

#### Q9. Tính năng "Chế độ ngày mưa" hoạt động ra sao để không thay đại bằng một điểm xa tít?
- **Trả lời nhanh 30 giây:** Bộ xử lý ngày mưa xác định các chặng ngoài trời (`OUTDOOR_EXCLUSIONS` như bãi biển, thác nước, bán đảo, đèo), loại trừ vùng xa cách biệt nếu đang ở nội đô, và truy vấn các địa điểm thuộc nhóm trong nhà/mái che (`INDOOR_SUB_CATEGORIES` như bảo tàng, không gian nghệ thuật, quán cafe yên tĩnh, lăng tẩm/chùa chiền có mái) cùng thành phố. Trên UI còn lưu lịch sử trước khi đổi để người dùng bấm **Hoàn tác (Undo)** 1 chạm.
- **Bằng chứng mã nguồn:** [`backend/app/trips/handlers/rainy_day_handler.py`](../backend/app/trips/handlers/rainy_day_handler.py) và [`frontend/src/components/planner/TripItineraryView.tsx`](../frontend/src/components/planner/TripItineraryView.tsx).

#### Q10. Kho 482 địa điểm và ảnh hiển thị được thu thập, xử lý ra sao để không gặp ảnh gãy hay link chết?
- **Trả lời nhanh 30 giây:** Toàn bộ dữ liệu qua pipeline chuẩn hóa địa chỉ, phân loại taxonomy, khử số điện thoại giả (`clean_and_verify_all_pois.py`), chuyển toàn bộ ảnh địa điểm sang định dạng WebP nhẹ lưu trên **Supabase Storage bucket riêng `poi-images`** thay vì dựa vào URL ngoài dễ chết 404. Trên Frontend, component `PoiImage` bắt buộc `loading="lazy"`, `referrerPolicy="no-referrer"`, fallback theo danh mục và SVG nội tuyến cuối cùng để không bao giờ vỡ layout.
- **Bằng chứng mã nguồn:** [`backend/scripts/audit_and_migrate_poi_images.py`](../backend/scripts/audit_and_migrate_poi_images.py), [`backend/migrations/017_create_poi_images_bucket.sql`](../backend/migrations/017_create_poi_images_bucket.sql) và [`frontend/src/components/ui/PoiImage.tsx`](../frontend/src/components/ui/PoiImage.tsx).

---

### Nhóm C — Cơ Sở Dữ Liệu 3NF, Khóa Ngoại & Chỉ Mục (Q11 – Q14)

#### Q11. Cơ sở dữ liệu có thực sự đạt chuẩn 3NF và có ràng buộc Khóa ngoại chặt chẽ không hay chỉ nói suông?
- **Trả lời nhanh 30 giây:** Có đầy đủ trên **PostgreSQL 15 + PostGIS (Supabase)** sau Migration `018`. Hệ thống có **13 bảng `public.*`**, **11 ràng buộc Khóa ngoại (`FOREIGN KEY`)** phân loại rõ hành vi `ON DELETE CASCADE`, `SET NULL` và `RESTRICT`, cùng **6 ràng buộc miền `CHECK`** (ví dụ `green_score` `0..1`, `role` chỉ nhận `USER`/`ADMIN`). Nhóm đã thử ghi `green_score = 1.5` và `role = 'SUPERHACKER'` vào DB thật và PostgreSQL chặn cứng bằng lỗi `CheckViolation`.
- **Bằng chứng mã nguồn:** [`backend/migrations/018_db_3nf_fk_indexes_and_audit.sql`](../backend/migrations/018_db_3nf_fk_indexes_and_audit.sql) và báo cáo kiểm chứng [`docs/DATABASE_3NF_AUDIT_AND_ERD.md`](./DATABASE_3NF_AUDIT_AND_ERD.md).

#### Q12. Tại sao trên bảng `pois` vẫn dùng `JSONB` / `TEXT[]`, và bảng `itineraries` giữ cả `user_id TEXT` lẫn `owner_user_id UUID`? Có vi phạm 3NF không?
- **Trả lời nhanh 30 giây:** Đây là **phi chuẩn hóa có kiểm soát (Controlled Denormalization)**: các mảng thuộc tính ít đổi như `eco_features` hoặc `opening_hours` lưu dạng `TEXT[]`/`JSONB` kèm **GIN Index** để tránh `JOIN` thêm 4–5 bảng con mỗi lần nạp toàn bộ bản đồ, giúp tăng tốc độ đọc mà vẫn giữ 3NF cho mọi thực thể nghiệp vụ (`cities`, `poi_categories`, `itinerary_days`, `itinerary_stops`). Riêng `owner_user_id UUID` trên `itineraries` và `poi_uuid UUID` trên `itinerary_stops` giúp giữ chặt khóa ngoại cho dữ liệu tài khoản thật trong khi vẫn tương thích chuyến đi mẫu/Guest.
- **Bằng chứng mã nguồn:** [`docs/DATABASE_3NF_AUDIT_AND_ERD.md`](./DATABASE_3NF_AUDIT_AND_ERD.md) (Mục 1.2) và [`backend/tests/test_db_3nf_migration.py`](../backend/tests/test_db_3nf_migration.py).

#### Q13. Chứng minh hiệu năng truy vấn Index trên bảng `pois` chứ không phải chỉ "tạo index cho có"?
- **Trả lời nhanh 30 giây:** Nhóm đã chạy `EXPLAIN ANALYZE` trực tiếp trên Supabase PostgreSQL thật: truy vấn tìm kiếm gần đúng tiếng Việt `ILIKE '%Chăm%'` đi qua GIN `pg_trgm` (`idx_pois_name_trgm`) chỉ mất **2.532 ms** (`Bitmap Index Scan`), còn truy vấn lọc ghép Thành phố + Danh mục + Trạng thái đi qua B-Tree composite (`idx_pois_city_category_active`) chỉ mất **0.207 ms** (`Index Scan`). Ngoài ra cột `geom` có Spatial Index **GiST** cho truy vấn khoảng cách địa lý.
- **Bằng chứng mã nguồn:** Số liệu `EXPLAIN ANALYZE` trích nguyên văn tại [`docs/DATABASE_3NF_AUDIT_AND_ERD.md`](./DATABASE_3NF_AUDIT_AND_ERD.md) (Phần 3, Mục 2).

#### Q14. Nếu Admin sửa nhầm hoặc xóa tài khoản Admin từng sửa dữ liệu POI thì hệ thống có giữ được bằng chứng không?
- **Trả lời nhanh 30 giây:** Có. Mọi thao tác `PATCH /admin/pois/{poi_id}` được thực hiện trong **cùng một transaction ACID** tại [`update_poi_with_audit`](../backend/app/admin/repository.py): cập nhật bảng `pois` và chèn bản ghi diff `{before, after}` dưới dạng JSONB vào `admin_audit_logs` trước khi `connection.commit()`. Khóa ngoại `admin_user_id` tới `users(user_id)` gắn **`ON DELETE RESTRICT`** nên PostgreSQL không cho xóa vật lý tài khoản Admin đã từng ghi vết kiểm toán.
- **Bằng chứng mã nguồn:** [`backend/app/admin/repository.py`](../backend/app/admin/repository.py) (dòng 210–281) và [`backend/tests/test_admin_rbac.py`](../backend/tests/test_admin_rbac.py).

---

### Nhóm D — Bảo Mật, Xác Thực & RBAC (Q15 – Q19)

#### Q15. Nếu người dùng rành kỹ thuật sửa biến trong `localStorage` hoặc tự sửa URL `/admin` trên trình duyệt thì có lọt vào trang quản trị không?
- **Trả lời nhanh 30 giây:** Tuyệt đối không. Nhóm triển khai **RBAC 2 lớp độc lập**: Frontend (`AdminRouteGuard`) luôn gọi lại `GET /auth/me` để kiểm tra phiên hiện hành trước khi render, và quan trọng hơn, ở **Backend** mọi endpoint `/admin/*` đều đi qua `Depends(require_admin)` → giải mã chữ ký JWT bằng `JWT_SECRET_KEY`, sau đó **truy vấn thẳng `SELECT role, status FROM public.users WHERE user_id = %s` từ PostgreSQL** ở mỗi request. Nếu chưa đăng nhập trả `401`, nếu `status != 'ACTIVE'` hoặc `role != 'ADMIN'` trả `403 Forbidden`.
- **Bằng chứng mã nguồn:** [`frontend/src/components/admin/AdminRouteGuard.tsx`](../frontend/src/components/admin/AdminRouteGuard.tsx), [`backend/app/auth/dependencies.py`](../backend/app/auth/dependencies.py) (`get_current_user`, `require_roles`), và [`backend/app/admin/router.py`](../backend/app/admin/router.py).

#### Q16. Hệ thống băm mật khẩu và bảo vệ JWT, OTP như thế nào?
- **Trả lời nhanh 30 giây:** Mật khẩu băm bằng **Argon2** qua `pwdlib` (không dùng MD5/SHA256 thô), token JWT ký `HS256` kèm kiểm tra an toàn lúc khởi động: khi `APP_ENV` là `production` hoặc `staging`, `Settings.validate_security_settings` bắt buộc `JWT_SECRET_KEY` phải khác chuỗi mặc định và dài tối thiểu **32 ký tự**, nếu không ứng dụng từ chối khởi động. Mã OTP gửi email lưu trong bảng `email_otps` có thời hạn `expires_at`, cờ `is_used` và giới hạn số lần nhập sai `attempts`.
- **Bằng chứng mã nguồn:** [`backend/app/config.py`](../backend/app/config.py), [`backend/app/auth/password.py`](../backend/app/auth/password.py), [`backend/app/auth/router.py`](../backend/app/auth/router.py) và [`backend/tests/test_dot1_security_and_bugfixes.py`](../backend/tests/test_dot1_security_and_bugfixes.py).

#### Q17. Nếu kẻ xấu spam liên tục 1.000 request/giây vào API đăng nhập hoặc AI Copilot để đốt tiền Gemini thì xử lý thế nào?
- **Trả lời nhanh 30 giây:** Các route nhạy cảm (auth, gửi lại OTP, AI Copilot) đều được bọc dependency **`rate_limit(bucket, max_requests, window_seconds)`** sử dụng thuật toán **Sliding Window trên Redis Sorted Set** (`ZREMRANGEBYSCORE`, `ZCARD`, `ZRANGE`, `ZADD`, `EXPIRE`). Khi vượt ngưỡng, backend ngắt ngay ở tầng FastAPI với **`HTTP 429 Too Many Requests`** và trả header **`Retry-After`** theo chuẩn HTTP trước khi chạm tới DB hay Gemini API, đồng thời tự tách IP thật từ `X-Forwarded-For` sau proxy Caddy.
- **Bằng chứng mã nguồn:** [`backend/app/rate_limit.py`](../backend/app/rate_limit.py) và [`backend/tests/test_redis_cache_and_ratelimit.py`](../backend/tests/test_redis_cache_and_ratelimit.py).

#### Q18. Làm sao nhóm đảm bảo không vô tình đẩy API Key (Gemini, Supabase, DB password) lên GitHub hay Docker image?
- **Trả lời nhanh 30 giây:** Mọi khóa bí mật chỉ đọc từ biến môi trường / `.env` qua `pydantic-settings` ([`backend/app/config.py`](../backend/app/config.py)); file `.env` bị chặn cả ở `.gitignore` (Git) lẫn `.dockerignore` và `frontend/.dockerignore` (Docker build context). Trong multi-stage Docker build, image runtime cuối cùng chỉ nhận bản `.env` gắn lúc chạy (`env_file`), không chứa `.env` hay file lịch sử test nào bên trong image.
- **Bằng chứng mã nguồn:** [`.dockerignore`](../.dockerignore), [`frontend/.dockerignore`](../frontend/.dockerignore), [`.env.example`](../.env.example).

#### Q19. Kiến trúc mạng VPS có lộ thẳng cổng Backend hay Redis ra Internet không?
- **Trả lời nhanh 30 giây:** Không. Trong [`docker-compose.prod.yml`](../docker-compose.prod.yml), Redis (`6379`), Backend (`8000`) và Frontend (`8080`) chỉ dùng `expose` trong mạng cầu nội bộ `greentrip_net` (`ports` chỉ khai báo duy nhất ở container `caddy` với cổng `80`/`443`). Thêm tường lửa **UFW** trên Ubuntu chỉ mở `22`, `80`, `443`, nên hacker ngoài Internet không thể kết nối trực tiếp vào Redis hay cổng nội bộ Uvicorn.
- **Bằng chứng mã nguồn:** [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`deploy/Caddyfile`](../deploy/Caddyfile) và [`docs/VPS_DEPLOYMENT_GUIDE.md`](./VPS_DEPLOYMENT_GUIDE.md).

---

### Nhóm E — Chịu Tải 10.000 Người Dùng, Cache, Bất Đồng Bộ & DevOps (Q20 – Q24)

#### Q20. Nhóm nói hệ thống sẵn sàng phục vụ 10.000 người dùng với Redis Cache — có số đo thực tế chứng minh trước Hội đồng không?
- **Trả lời nhanh 30 giây:** Có, nhóm tự viết công cụ đo tải đồng thời (`httpx` async) bắn thẳng vào backend đang nối Supabase Postgres live:
  - Trên endpoint nặng **`GET /pois?page=1&limit=100`** (`120` request, `20` luồng song song): lần lạnh đầu (`X-Cache: MISS`) mất **`5.315,50 ms`**; sang trạng thái ấm đạt **`120/120 (100%) X-Cache: HIT`**, **`0` lỗi**, độ trễ trung vị **`p50 = 275,25 ms`**, `p95 = 341,22 ms`, `p99 = 366,13 ms`, đạt **`67,3 req/s`**.
  - Trên trang nhỏ **`GET /pois?page=1&limit=10`** (`50` request, `10` luồng): từ **`1.486,13 ms`** (`MISS`) xuống **`p50 = 19,47 ms`**, `p95 = 29,11 ms`, **`461,1 req/s`** (`0` lỗi).
- **Bằng chứng mã nguồn:** [`backend/app/cache.py`](../backend/app/cache.py), [`backend/app/pois/router.py`](../backend/app/pois/router.py) và [`backend/scripts/benchmark_load.py`](../backend/scripts/benchmark_load.py).

#### Q21. Dùng Cache rồi mà Admin vừa cập nhật giá vé hoặc ẩn địa điểm ở `/admin` thì người dùng có bị xem dữ liệu cũ (Stale Cache) 5 phút không?
- **Trả lời nhanh 30 giây:** Không. Nhóm dùng chiến lược **Versioned Cache Namespace** (`greentrip:pois:v{version}:...`): ngay sau khi `update_poi_with_audit` ở [`patch_admin_poi`](../backend/app/admin/service.py) commit xong, hệ thống gọi `poi_cache.invalidate_pois()` để chạy lệnh **`INCR greentrip:pois:version` trong độ phức tạp O(1)** (tuyệt đối không dùng `KEYS *` gây đứng Redis). Mọi request đọc tiếp theo tự động nhận key version mới (`X-Cache: MISS`) và nạp dữ liệu mới nhất ngay lập tức.
- **Bằng chứng mã nguồn:** [`backend/app/cache.py`](../backend/app/cache.py) (`invalidate_pois`, `build_pois_cache_key`) và [`backend/app/admin/service.py`](../backend/app/admin/service.py) (dòng 77).

#### Q22. Khi hàng loạt người dùng đăng ký nhận email OTP cùng lúc, việc kết nối SMTP chậm có làm treo luồng API không? Tại sao chọn `BackgroundTasks` thay vì dựng luôn Kafka/RabbitMQ?
- **Trả lời nhanh 30 giây:** Nhóm đẩy toàn bộ việc gửi email xác thực và OTP (`signup`, `resend_verification`, `resend_otp`) sang **`BackgroundTasks`** qua hai hàm bọc `_dispatch_verification_email` và `_dispatch_otp_email`, giúp request trả `200`/`201` về trình duyệt ngay mà không chờ bắt tay SMTP Gmail. Với quy mô 10.000 người dùng đồ án, `BackgroundTasks` giúp giữ chi phí VPS gọn ở mức tối thiểu (tránh over-engineering); nếu mở rộng lên trăm nghìn user cần bảo đảm retry bền vững khi worker khởi động lại, có thể chuyển thẳng 2 hàm dispatch đó sang worker queue (ARQ/Celery trên chính Redis đang chạy) mà không đổi API.
- **Bằng chứng mã nguồn:** [`backend/app/auth/router.py`](../backend/app/auth/router.py) (dòng 401, 408, 421, 591, 843).

#### Q23. Tại sao phải tách riêng `Dockerfile.prod` multi-stage và đưa `Caddy` vào thay vì lấy luôn `docker-compose.yml` dev đẩy lên VPS?
- **Trả lời nhanh 30 giây:** File dev chạy `vite dev` và `uvicorn --reload`, chiếm nhiều RAM, giữ toàn bộ dev dependencies/mã nguồn thô và chạy quyền `root`. Ngược lại, bộ production dùng **Multi-stage build** (`backend/Dockerfile.prod` + `frontend/Dockerfile.prod`): loại bỏ toàn bộ Node build tools khỏi runtime image, chạy web tĩnh qua `nginx-unprivileged` (**`USER 101`**), chạy API bằng user **`appuser`** không có quyền root với **`UVICORN_WORKERS=2`** (không `--reload`), kèm `HEALTHCHECK` tự phục hồi và **Caddy** tự xin/gia hạn chứng chỉ SSL Let's Encrypt cho tên miền thật.
- **Bằng chứng mã nguồn:** [`backend/Dockerfile.prod`](../backend/Dockerfile.prod), [`frontend/Dockerfile.prod`](../frontend/Dockerfile.prod), [`deploy/Caddyfile`](../deploy/Caddyfile) và [`frontend/tests/demo-qr-and-deploy.test.mjs`](../frontend/tests/demo-qr-and-deploy.test.mjs).

#### Q24. Sản phẩm hiện còn điểm hạn chế nào nếu triển khai thực tế lớn hơn và hướng phát triển tiếp theo là gì?
- **Trả lời nhanh 30 giây:** Nhóm nhìn thẳng 3 điểm chưa làm ở MVP v1.0 (đã ghi rõ trong [PRD.md](../PRD.md)): (1) gửi email nền đang dùng `BackgroundTasks` theo worker tiến trình, chưa có persistent dead-letter queue khi container restart giữa chừng; (2) chưa tích hợp thanh toán đặt vé trực tiếp VNPay/MoMo và chia sẻ link bình chọn nhóm thời gian thực; (3) phạm vi dữ liệu tập trung Đà Nẵng – Huế. Lộ trình v1.1 gồm persistent Redis task queue (ARQ/Celery), chia sẻ lịch nhóm có voting, tự chèn QR bản đồ vào file PDF xuất từ Backend và mở rộng sang Hội An – Quy Nhơn.
- **Bằng chứng tài liệu:** Mục 3.2 trong [`PRD.md`](../PRD.md).

---

## Phần 4 — Bảng Lệnh Chứng Minh Trực Tiếp (Live Proof Cheat-Sheet)

Chạy ngay trên máy trình chiếu / SSH VPS khi Hội đồng yêu cầu kiểm chứng số liệu thật:

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

---

## Phần 5 — Bản Đồ Tài Liệu & Chuỗi Triển Khai Hoàn Chỉnh (Phase 5 → Phase 9)

| Tài liệu / Artifact | Nội dung cốt lõi | Phase hoàn thiện |
| :--- | :--- | :--- |
| [`PRD.md`](../PRD.md) | Bài toán 4 nỗi đau, phân vai 4 role, phạm vi v1.0 & v1.1, ma trận RBAC | Nền tảng + đồng bộ |
| [`ARCHITECTURE.md`](../ARCHITECTURE.md) · [`API_SPEC.md`](../API_SPEC.md) | Kiến trúc hệ thống & hợp đồng HTTP/JSON API giữa FE và BE | Nền tảng |
| [`docs/DATABASE_3NF_AUDIT_AND_ERD.md`](./DATABASE_3NF_AUDIT_AND_ERD.md) | Chuẩn hóa 3NF, Mermaid ERD 13 bảng, 11 FK, 6 CHECK, `EXPLAIN ANALYZE` Index | **Phase 5 (`#PB19`, PR #54)** |
| [`backend/app/auth/dependencies.py`](../backend/app/auth/dependencies.py) · `/admin` | Phân quyền RBAC 2 lớp (`401`/`403`), trang quản trị POI & `admin_audit_logs` | **Phase 6 (`#PB20`, PR #55)** |
| [`backend/app/cache.py`](../backend/app/cache.py) · [`rate_limit.py`](../backend/app/rate_limit.py) | Redis Cache (`X-Cache`), O(1) versioned invalidation, Rate Limit phân tán, Email nền, `benchmark_load.py` | **Phase 7 (`#PB21`, PR #56)** |
| [`docs/VPS_DEPLOYMENT_GUIDE.md`](./VPS_DEPLOYMENT_GUIDE.md) · `/demo-qr` | Docker Multi-stage `.prod`, Caddy Auto-HTTPS, Mobile `375px`/`320px`, trang QR live | **Phase 8 (`#PB22`, PR #57)** |
| [`docs/CAPSTONE_DEFENSE_PLAYBOOK.md`](./CAPSTONE_DEFENSE_PLAYBOOK.md) | Kịch bản Live Demo 7 phút, 24 câu hỏi phản biện & lệnh chứng minh | **Phase 9 (`#PB23`)** |
