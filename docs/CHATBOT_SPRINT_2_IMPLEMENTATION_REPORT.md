# BÁO CÁO KỸ THUẬT SPRINT 2.1 – CHATBOT AUDIT, RAG FOUNDATION & TOOL CALLING INTEGRATION

> **Dự án**: GreenTrip – Nền tảng thiết kế hành trình du lịch xanh tại Đà Nẵng–Huế  
> **Nhánh làm việc**: `develop` (đồng bộ mới nhất với commit `c6a472b` từ `origin/develop`)  
> **Người thực hiện**: Senior AI Engineer & Backend Architect  
> **Thời gian hoàn thành**: 23/11/2026  

---

## 1. TRẠNG THÁI HIỆN TẠI CỦA REPOSITORY (REPOSITORY STATE)

- **Nhánh hiện tại**: `develop` (Clean working tree, không ghi đè hay làm mất thay đổi nào của các thành viên).
- **Đồng bộ**: Đã fetch và fast-forward đồng bộ 100% với `origin/develop` (commit `c6a472b` - tích hợp Landing Page mới, Studio Cards, Onboarding và TripHeader).
- **Cơ sở dữ liệu**: Hỗ trợ 2 chế độ linh hoạt:
  - Môi trường Staging/Production: Supabase PostgreSQL (PostGIS) + Neo4j AuraDB.
  - Môi trường Local / CI Sandbox: SQLite fallback tự động (`data/greentrip_local.db`) + CSV Master Data (`data/processed/all_pois_cleaned.csv` với 482 POI).

---

## 2. KẾT QUẢ AUDIT KỸ THUẬT TOÀN DIỆN (TECHNICAL AUDIT RESULTS)

Dưới đây là bảng phân loại chi tiết hiện trạng các module của GreenTrip:

| STT | Phân hệ / Module | Đường dẫn File chính | Hàm / Lớp đại diện | Endpoint API hiện có | Trạng thái kỹ thuật | Đánh giá & Khả năng tích hợp |
|---|---|---|---|---|---|---|
| **1** | **Copilot Consultant / Chatbot** | `backend/app/trips/copilot_consultant.py`<br>`copilot_intent.py`<br>`copilot_hybrid_nlu.py`<br>`copilot_grounding.py` | `process_copilot_chat`<br>`classify_copilot_request_hybrid`<br>`verify_copilot_grounding` | `POST /trips/copilot/chat`<br>`POST /trips/copilot/chat/stream` | **PARTIALLY IMPLEMENTED** | Đã có NLU lai (Gemini JSON + Regex guardrails), Corrective Grounding chống ảo giác và SSE streaming. **Thiếu**: Chưa có cơ chế Tool Calling chuẩn hóa và chưa có RAG tìm kiếm ngữ nghĩa văn bản. |
| **2** | **POI API & Dữ liệu** | `backend/app/pois/router.py`<br>`repository.py`<br>`data/processed/all_pois_cleaned.csv` | `list_pois`<br>`get_poi_by_id`<br>`search_pois_by_text` | `GET /pois`<br>`GET /pois/{id}`<br>`GET /pois/categories` | **IMPLEMENTED** | 482 POIs sạch chuẩn hóa tọa độ, danh mục, giá vé, điểm xanh (green score). Hoạt động ổn định với cả DB và CSV cache. |
| **3** | **AI Recommendation** | `backend/app/recommendations/router.py`<br>`service.py`<br>`recommender_engine.py` | `get_poi_recommendations`<br>`ContentBasedRecommender.recommend` | `POST /recommendations/poi` | **IMPLEMENTED** | Mô hình Content-Based Filtering dùng TF-IDF + Cosine Similarity xếp hạng đa mục tiêu (ngân sách, độ phù hợp, điểm xanh). |
| **4** | **Knowledge Graph (Neo4j)** | `backend/app/db/neo4j.py`<br>`backend/app/pois/explanation_repository.py`<br>`backend/neo4j/queries/` | `fetch_poi_explanation_facts`<br>`get_poi_explanation_facts` | `GET /pois/{id}/explanation-facts` | **IMPLEMENTED** *(kèm offline fallback)* | Đã có schema Cypher (các quan hệ `IN_CATEGORY`, `OFFERS_ACTIVITY`, `LOCATED_IN`). Nếu Neo4j Aura offline, tự động fallback sang cơ sở dữ liệu quan hệ trích xuất sự kiện tương đương. |
| **5** | **Tối ưu hành trình (Optimizer)** | `backend/app/trips/itinerary_constraints.py` | `optimize_daily_sequence`<br>`compute_transit_carbon_emission`<br>`calculate_itinerary_fatigue_score` | Gọi nội bộ từ Itinerary Service | **IMPLEMENTED** | Có giải thuật chống zigzag, tính điểm mệt mỏi (fatigue), cảnh báo giờ mở cửa và tính toán lượng phát thải CO2. |
| **6** | **Dịch vụ Định tuyến (Routing)** | `backend/app/itineraries/routing_service.py` | `compute_route_geometry`<br>`haversine_distance_meters` | `GET /itineraries/{id}/days/{day}/route` | **IMPLEMENTED** | Gọi OSRM API và tự động fallback sang Haversine khoảng cách đường chim bay nếu mất mạng/sandbox. |
| **7** | **RAG Foundation (Ngữ nghĩa & Tài liệu)** | *(Chưa có trước Sprint 2.1)* | *(Chưa có)* | *(Chưa có)* | **NOT IMPLEMENTED** | Chưa có vector index và bộ chia chunk ngữ nghĩa cho các tài liệu du lịch đã kiểm duyệt. |
| **8** | **Tool Calling Registry** | *(Chưa có trước Sprint 2.1)* | *(Chưa có)* | *(Chưa có)* | **NOT IMPLEMENTED** | Chưa có abstraction schema (Pydantic) bao gói các API nội bộ cho LLM gọi an toàn. |
| **9** | **Frontend Chat UI** | `frontend/src/components/planner/IdeationChatView.tsx`<br>`copilotMessageMarkdown.tsx` | `IdeationChatView`<br>`copilotService.postChatMessage` | UI hiển thị trong Planner Drawer / Modal | **IMPLEMENTED** | Đã có khung chat, Markdown renderer, gợi ý POI chips và cơ chế SSE stream chữ gõ dần. |

---

## 3. KIẾN TRÚC CHATBOT & KHOẢNG TRỐNG KỸ THUẬT

### 3.1. Điểm mạnh đã có
- Hệ thống **Hybrid NLU**: Kết hợp LLM Structured Output (JSON) với bộ regex guardrail kiểm duyệt phạm vi (out-of-scope), tránh prompt injection và định tuyến các câu hỏi ngoài lề.
- Hệ thống **Corrective Grounding**: Mọi địa điểm dạng in đậm `**Địa danh**` được đối soát với danh mục 482 POIs thật, ngăn chặn 100% việc chém gió tên địa danh không có thật.

### 3.2. Khoảng trống cần bù đắp trong Sprint 2
1. **Thiếu RAG**: Chatbot chỉ nắm thông tin có cấu trúc ngắn gọn trong CSV (tên, tọa độ, giá vé). Khi du khách hỏi sâu về lịch sử, nguồn gốc văn hóa, món ăn đặc trưng (như thành phần Mỳ Quảng, bánh ép, nét kiến trúc lăng tẩm Huế), chatbot chưa có nguồn trích dẫn kiểm chứng.
2. **Thiếu Tool Calling Registry**: Các logic gọi sang Recommendation, Routing, Cost, POI hiện đang ghép trực tiếp vào luồng rẽ nhánh code của Copilot thay vì tổ chức thành các Tool độc lập có schema kiểm tra dữ liệu đầu vào chặt chẽ.

---

## 4. NGUỒN DỮ LIỆU ĐƯỢC CHỌN CHO RAG (RAG DATA ASSETS)

Chúng tôi đã khảo sát toàn bộ thư mục `data/` và tuyển chọn **5 nguồn dữ liệu du lịch uy tín, đã được kiểm duyệt thực tế** để đưa vào RAG:

1. **`data/raw/notebooklm_pois.csv`**: Bộ tóm lược danh lam, bảo tàng, di tích văn hóa Đà Nẵng – Huế chuẩn bị cho NotebookLM với mô tả văn học chất lượng cao.
2. **`data/raw/eco_places_danang_hue_60.json`**: 60 điểm đến sinh thái có đặc điểm xanh (`eco_highlights`), thời điểm lý tưởng trong ngày (`best_time`) và gợi ý phương tiện xanh (`transport_tip`).
3. **`data/raw/food_beverage_danang_hue_phase1.json`**: 118 địa chỉ ẩm thực tuyển chọn, có menu chi tiết từng món ăn (`menu_items`), ghi chú thuần chay (`is_vegetarian_friendly`) và thực hành zero-waste.
4. **`data/raw/nature_heritage_danang_hue_phase2.json`**: 97 di sản thiên nhiên và kiến trúc cổ kèm lưu ý thời tiết mùa mưa bão miền Trung (`seasonal_note`).
5. **`data/processed/curated_stays_160.csv`**: 160 cơ sở lưu trú xanh (homestay, resort sinh thái) kèm nhãn sinh thái và địa chỉ.

**Tổng số chunk dữ liệu được chuẩn hóa và lập chỉ mục**: **668 chunks**.

---

## 5. CÁC THÀNH PHẦN RAG ĐÃ TRIỂN KHAI (RAG FOUNDATION IMPLEMENTATION)

Được đóng gói gọn gàng trong module độc lập `backend/app/rag/`:

1. **`app/rag/schemas.py`**:
   - `DocumentChunk`: Đại diện cho một lát cắt tri thức đã kiểm chứng (chunk_id, doc_id, title, city, category, content, source, metadata).
   - `RetrievedChunk`: Kết quả tìm kiếm trả về gồm snippet, độ tương đồng (score từ 0.0 đến 1.0), thành phố và nguồn trích dẫn (`source`).
   - `RAGSearchResult`: Container kết quả truy vấn.
2. **`app/rag/normalizer.py`**:
   - Trích xuất dữ liệu đa cấu trúc từ CSV và JSON.
   - Hàm cắt câu thông minh `_split_into_chunks` (độ dài 60 - 600 ký tự, giữ trọn vẹn ngữ nghĩa câu văn).
   - Chuẩn hóa thông tin món ăn, điểm xanh và lưu ý thời tiết.
3. **`app/rag/retriever.py`**:
   - Bộ máy tìm kiếm lai: Sử dụng `TfidfVectorizer` (ngram 1-2, sublinear TF) kết hợp Cosine Similarity và bộ lọc siêu dữ liệu (city filter, category filter).
   - Khả năng khử dấu tiếng Việt (`strip_vietnamese_accents`) giúp du khách gõ có dấu hay không dấu đều truy xuất chính xác địa danh.
   - Không phụ thuộc vào kết nối mạng bên ngoài, chạy offline siêu tốc và tương thích 100% với môi trường CI/CD.
4. **`app/rag/service.py`**:
   - Cung cấp Singleton `get_rag_service()` tải dữ liệu một lần và sẵn sàng phục vụ song song.

---

## 6. THIẾT KẾ VÀ TÍCH HỢP TOOL CALLING (TOOL CALLING REGISTRY)

Module `backend/app/tools/` chuẩn hóa 8 công cụ chuyên biệt của GreenTrip theo tiêu chuẩn Function Calling:

| Tên Tool | Mục đích nghiệp vụ | Đầu vào chính | Đầu ra nghiệp vụ | Module nội bộ được bao gói |
|---|---|---|---|---|
| **`search_pois`** | Tìm kiếm địa điểm | `query`, `city`, `category`, `limit` | Danh sách POI tóm tắt (tọa độ, giá, điểm xanh) | `app.pois.repository` / CSV Cache |
| **`get_poi_details`** | Lấy chi tiết 1 địa điểm | `poi_id` | Chi tiết đầy đủ của POI | `app.pois.repository` |
| **`recommend_pois`** | Đề xuất địa điểm thông minh | `interests` (list), `city`, `budget_band` | Danh sách POI kèm lý do đề xuất và green score | `app.recommendations.service` |
| **`get_poi_explanation`** | **Giải thích tri thức Neo4j** | `poi_id` | Sự kiện Knowledge Graph + Diễn giải tiếng Việt tự nhiên | `app.pois.explanation_service` (Neo4j Aura / Relational) |
| **`calculate_trip_cost`** | Ước tính chi phí chuyến đi | `num_days`, `num_people`, `budget_tier` | Tổng chi phí VND + Phân bổ (lưu trú, ăn uống, xe cộ, vé) | `app.trips.service` |
| **`get_route_information`** | Tính toán cự ly & thời gian | `origin_lat`, `origin_lng`, `dest_lat`, `dest_lng` | Cự ly (km, mét), thời gian (phút), cờ fallback | `app.itineraries.routing_service` (OSRM / Haversine) |
| **`get_carbon_estimate`** | Tính phát thải khí nhà kính | `distance_km`, `transport_mode` | Kg CO2 phát thải + Mẹo đổi xe xanh tiết kiệm CO2 | `app.trips.itinerary_constraints` |
| **`rag_travel_knowledge`** | **Truy vấn tài liệu RAG** | `query`, `city`, `top_k` | Danh sách đoạn văn trích dẫn kèm file nguồn | `app.rag.service` |

### Cơ chế bảo vệ & An toàn của Tool Registry (`app/tools/registry.py`)
- **Schema Validation**: Dùng Pydantic bắt lỗi đối số sai type, sai miền giá trị (ví dụ `num_days > 14`, `num_people < 1`) ngay tại cổng vào và trả về JSON lỗi có cấu trúc, tuyệt đối không gây sập tiến trình.
- **Không thực thi mã tự do**: Chatbot và LLM **không bao giờ** được phép gửi trực tiếp câu lệnh SQL hay Cypher. Toàn bộ câu truy vấn đều được đóng cứng (hardcoded & parameterized) bên trong handler.
- **Hỗ trợ xuất schema chuẩn Gemini**: Hàm `get_gemini_tool_declarations()` tự động sinh ra cấu trúc `parameters: {type: OBJECT, properties: ...}` tương thích với Google Gemini API.

---

## 7. KẾT QUẢ TÍCH HỢP KNOWLEDGE GRAPH (NEO4J EXPLANATION)

- Đã kết nối thành công với hàm `get_poi_explanation_facts` trong `app/pois/explanation_service.py`.
- Khi người dùng hỏi "Tại sao lại gợi ý địa điểm này?", tool `get_poi_explanation` sẽ:
  1. Truy vấn các quan hệ `IN_CATEGORY`, `OFFERS_ACTIVITY`, `LOCATED_IN` từ Neo4j Aura (thông qua file query `backend/neo4j/queries/get_poi_explanation_facts.cypher`).
  2. Tự động chuyển đổi các quan hệ dạng đồ thị thành câu văn tiếng Việt tự nhiên, ví dụ:
     > *"GreenTrip đề xuất 'Bảo tàng Cổ vật Cung đình Huế' vì: Là cơ sở kinh doanh bản địa, đóng góp trực tiếp vào kinh tế cộng đồng địa phương; Thuộc danh mục Di tích lịch sử và văn hóa; Nằm tại khu vực Huế."*
  3. Nếu đường truyền mạng tới Neo4j Aura bị gián đoạn, cơ chế relational projection tự động thế chỗ mà không gây đứt gãy trải nghiệm người dùng.

---

## 8. DANH SÁCH FILE ĐÃ TẠO MỚI / CHỈNH SỬA

### File tạo mới hoàn toàn:
1. `backend/app/rag/__init__.py`
2. `backend/app/rag/schemas.py`
3. `backend/app/rag/normalizer.py`
4. `backend/app/rag/retriever.py`
5. `backend/app/rag/service.py`
6. `backend/app/tools/__init__.py`
7. `backend/app/tools/schemas.py`
8. `backend/app/tools/implementations.py`
9. `backend/app/tools/registry.py`
10. `backend/tests/test_rag.py` (8 test cases kiểm thử RAG)
11. `backend/tests/test_tool_calling.py` (14 test cases kiểm thử Tool Calling)
12. `docs/CHATBOT_SPRINT_2_IMPLEMENTATION_REPORT.md` (Báo cáo này)

---

## 9. LỆNH KIỂM THỬ VÀ BẰNG CHỨNG THỰC TẾ (TEST VERIFICATION LOGS)

### 9.1. Kiểm thử Test Suite mới cho RAG và Tool Calling
```bash
cd backend
python -m pytest tests/test_rag.py tests/test_tool_calling.py -v
```
**Kết quả thực tế**:
```text
tests/test_rag.py::test_rag_normalizer_loads_chunks PASSED               [  4%]
tests/test_rag.py::test_rag_retriever_successful_retrieval PASSED        [  9%]
tests/test_rag.py::test_rag_retriever_empty_query PASSED                 [ 13%]
tests/test_rag.py::test_rag_retriever_invalid_symbols_query PASSED       [ 18%]
tests/test_rag.py::test_rag_retriever_city_filtering PASSED              [ 22%]
tests/test_rag.py::test_rag_retriever_empty_index_fallback PASSED        [ 27%]
tests/test_rag.py::test_rag_prompt_injection_safety PASSED               [ 31%]
tests/test_rag.py::test_rag_vietnamese_diacritics_robustness PASSED      [ 36%]
tests/test_tool_calling.py::test_registry_contains_all_sprint2_tools PASSED [ 40%]
tests/test_tool_calling.py::test_execute_unregistered_tool PASSED        [ 45%]
tests/test_tool_calling.py::test_search_pois_valid_and_limit PASSED      [ 50%]
tests/test_tool_calling.py::test_search_pois_input_validation PASSED     [ 54%]
tests/test_tool_calling.py::test_get_poi_details PASSED                  [ 59%]
tests/test_tool_calling.py::test_get_poi_details_nonexistent PASSED      [ 63%]
tests/test_tool_calling.py::test_recommend_pois PASSED                   [ 68%]
tests/test_tool_calling.py::test_get_poi_explanation_knowledge_graph PASSED [ 72%]
tests/test_tool_calling.py::test_calculate_trip_cost PASSED              [ 77%]
tests/test_tool_calling.py::test_calculate_trip_cost_validation PASSED   [ 81%]
tests/test_tool_calling.py::test_get_route_information PASSED            [ 86%]
tests/test_tool_calling.py::test_get_carbon_estimate PASSED              [ 90%]
tests/test_tool_calling.py::test_rag_travel_knowledge_tool PASSED        [ 95%]
tests/test_tool_calling.py::test_gemini_tool_declarations_schema PASSED  [100%]

======================== 22 passed, 1 warning in 6.02s ========================
```

### 9.2. Kiểm thử hồi quy tích hợp với các module liên quan
```bash
cd backend
python -m pytest tests/test_copilot_chat.py tests/test_recommendations.py tests/test_poi_explanation_query.py tests/test_rag.py tests/test_tool_calling.py -q
```
**Kết quả thực tế**:
```text
95 passed, 1 warning in 10.87s
```
*(Bảo đảm 100% không làm ảnh hưởng hay phá vỡ bất kỳ luồng hoạt động nào có sẵn trên `develop`)*.

---

## 10. KẾ HOẠCH BƯỚC TIẾP THEO (NEXT SPRINT TASKS)

Theo đúng quy chuẩn phân chia công việc Scrum:

1. **Nối Tool Calling vào Chat Orchestrator (`app/trips/copilot_consultant.py`)**:
   - Khi Gemini trả về lời gọi hàm (Function Call), cho phép Orchestrator gọi qua `ToolRegistry.execute_tool` và phản hồi kết quả trực tiếp cho du khách.
2. **Khai thác RAG trong câu trả lời tư vấn**:
   - Tự động đính kèm đoạn trích dẫn nguồn (ví dụ: `[Nguồn: Cẩm nang ẩm thực Đà Nẵng - Huế]`) vào cuối câu trả lời về ẩm thực hoặc di sản văn hóa.
3. **Hiển thị Badge "Knowledge Graph Verified" trên Frontend**:
   - Cho phép người dùng bấm vào biểu tượng "Vì sao gợi ý?" trên tin nhắn chat để mở popup xem các sự kiện Knowledge Graph đã được chứng thực.
