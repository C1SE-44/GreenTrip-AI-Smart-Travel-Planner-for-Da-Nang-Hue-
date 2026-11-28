# BÁO CÁO KỸ THUẬT SPRINT 2.2 – TÍCH HỢP RAG & TOOL CALLING VÀO CHATBOT ORCHESTRATOR

> **Dự án**: GreenTrip – Nền tảng thiết kế hành trình du lịch xanh tại Đà Nẵng–Huế  
> **Nhánh làm việc**: `develop`  
> **Người thực hiện**: Senior Full-stack Engineer & AI Architect  
> **Thời gian hoàn thành**: 23/11/2026  

---

## 1. TRẠNG THÁI BAN ĐẦU CỦA REPOSITORY (INITIAL REPOSITORY STATE)

- **Nhánh làm việc**: `develop` (đồng bộ hoàn toàn với `origin/develop`, không có thay đổi dở dang hay xung đột).
- **Cơ sở hạ tầng Sprint 2.1 kế thừa**:
  - Module `backend/app/rag/` với 668 chunk tri thức đã kiểm chứng từ 5 nguồn dữ liệu (`notebooklm_pois.csv`, `eco_places_danang_hue_60.json`, `food_beverage_danang_hue_phase1.json`, `nature_heritage_danang_hue_phase2.json`, `curated_stays_160.csv`).
  - Module `backend/app/tools/` với 8 công cụ chuẩn hóa (`search_pois`, `get_poi_details`, `recommend_pois`, `get_poi_explanation`, `calculate_trip_cost`, `get_route_information`, `get_carbon_estimate`, `rag_travel_knowledge`).
  - Test suite 22 tests của Sprint 2.1 đạt 100% PASS.

---

## 2. KIẾN TRÚC THỰC TẾ SAU TÍCH HỢP (ACTUAL ARCHITECTURE AFTER INTEGRATION)

Chúng tôi đã thiết lập phân lớp **Chatbot Conversation Orchestrator** tại `backend/app/orchestrator/` nối liền giữa API endpoint của Copilot và các dịch vụ nền tảng:

```text
               +-------------------------------------------------------+
               |                  USER MESSAGE (Frontend)              |
               +-------------------------------------------------------+
                                          |
                                          v
               +-------------------------------------------------------+
               |     FastAPI Router (/trips/copilot/chat & /stream)    |
               +-------------------------------------------------------+
                                          |
                                          v
               +-------------------------------------------------------+
               |           LOAD CONTEXT (TripContextPayload)           |
               | - Destination, Duration, Days, Budget, History        |
               +-------------------------------------------------------+
                                          |
                                          v
               +-------------------------------------------------------+
               |           DECISION POLICY (policy.py)                 |
               | Phân loại: RAG, Tool Calling, Hybrid, hay Dialogue    |
               +-------------------------------------------------------+
                               /                       \
                              /                         \
                             v                           v
              +---------------------------+  +----------------------------+
              |    RAG RETRIEVAL SERVICE  |  |    BOUNDED TOOL REGISTRY   |
              | - TF-IDF n-gram search    |  | - Max 3 iterations         |
              | - City/Category filter    |  | - Schema Validation        |
              | - Attach Source Citations |  | - Neo4j KG / OSRM / POI DB |
              +---------------------------+  +----------------------------+
                             \                           /
                              \                         /
                               v                       v
               +-------------------------------------------------------+
               |                 RESULT COMBINER & GROUNDING           |
               +-------------------------------------------------------+
                                          |
                                          v
               +-------------------------------------------------------+
               |         VIETNAMESE RESPONSE SYNTHESIS                 |
               | - Gemini API (online) hoặc Deterministic Fallback     |
               | - Dẫn nguồn tài liệu thật, không bịa đặt địa danh     |
               +-------------------------------------------------------+
                                          |
                                          v
               +-------------------------------------------------------+
               |           CopilotChatResponse (Tương thích 100%)       |
               | - reply_text (answer), tools_used, sources, data      |
               | - suggested_pois (POI Cards hiển thị trên bản đồ)     |
               +-------------------------------------------------------+
```

---

## 3. CHI TIẾT TÍCH HỢP RAG (RAG INTEGRATION DETAILS)

- **Kích hoạt thông minh**: Orchestrator chỉ gọi RAG khi phát hiện câu hỏi thuộc về kiến thức du lịch văn hóa, lịch sử, ẩm thực, đặc sản, hoặc lưu ý thời tiết miền Trung.
- **Dẫn nguồn minh bạch**: Mỗi câu trả lời có sử dụng RAG đều tự động đính kèm danh sách `sources` chứa `title`, `city`, `source` (file gốc), `snippet` và chú thích cuối câu:
  > *(Nguồn tham khảo đã kiểm chứng: data/raw/notebooklm_pois.csv, data/raw/nature_heritage_danang_hue_phase2.json)*
- **Xử lý khi RAG không có dữ liệu**: Nếu người dùng hỏi câu hỏi ngoài phạm vi (ví dụ: du lịch Tokyo, Paris hay câu hỏi lập trình), hệ thống không bịa đặt nguồn mà trả lời thành thật: dữ liệu GreenTrip hiện chỉ tập trung cho Đà Nẵng và Huế.

---

## 4. CHI TIẾT TÍCH HỢP TOOL CALLING (TOOL CALLING INTEGRATION)

- **Vòng lặp giới hạn (Bounded Loop)**: Cấu hình hằng số `MAX_TOOL_ITERATIONS = 3`, chống lặp vô tận, chống timeout.
- **Xử lý cô lập lỗi**: Mọi công cụ khi thực thi đều được bọc trong khối `try-except`. Nếu công cụ gặp lỗi (như mạng OSRM mất kết nối), công cụ tự động kích hoạt fallback (tính cự ly Haversine đường chim bay) và trả lời bình thường, không làm sập API.
- **Bảo mật tuyệt đối**: Chatbot không cho phép LLM truyền chuỗi Cypher hay SQL tự do; toàn bộ logic được thực hiện qua các hàm Python chuẩn hóa có sẵn trong repository.

---

## 5. CHÍNH SÁCH ĐIỀU PHỐI (ROUTING POLICY)

Orchestrator phân loại và điều phối qua 6 tình huống nghiệp vụ:

| Tình huống | Câu hỏi mẫu của người dùng | Quyết định điều phối của Orchestrator | Công cụ / Nguồn được gọi |
|---|---|---|---|
| **CASE 1** | *"Huế có những địa điểm du lịch văn hóa nào?"* | Kích hoạt RAG tìm kiếm tài liệu di sản + gọi `search_pois` lấy danh sách điểm đến thực tế. | RAG + `search_pois` |
| **CASE 2** | *"Địa điểm nào phù hợp với người thích thiên nhiên?"* | Gọi `recommend_pois` với trọng số sinh thái và ngân sách tương ứng. | `recommend_pois` |
| **CASE 3** | *"Tại sao hệ thống đề xuất địa điểm này?"* | Truy vấn Knowledge Graph (Neo4j / relational projection) tìm mối quan hệ văn hóa, bản địa và sinh thái. | `get_poi_explanation` |
| **CASE 4** | *"Tạo lịch trình Huế 2 ngày ngân sách 2 triệu cho 2 người."* | Tính toán phân bổ chi phí 4 danh mục và gợi ý các điểm dừng khả thi. | `calculate_trip_cost` + `recommend_pois` |
| **CASE 5** | *"Giá vé vào cổng Bảo tàng Điêu khắc Chăm bao nhiêu?"* | Truy xuất thông tin giá vé có cấu trúc từ DB/CSV Master. Nếu không có giá chính thức, nêu rõ chưa có dữ liệu kiểm chứng. | `get_poi_details` |
| **CASE 6** | *"Nếu ngày thứ hai mình muốn đi ít điểm hơn thì sao?"* | Giữ nguyên ngày 1 từ lịch sử hội thoại, chỉ tinh chỉnh ngày thứ 2 nhẹ nhàng hơn. | Context Memory + `recommend_pois` |

---

## 6. QUẢN LÝ NGỮ CẢNH HỘI THOẠI (CONTEXT MANAGEMENT)

- Hệ thống đọc trực tiếp `conversation_history` và `current_itinerary_state` từ `TripContextPayload`.
- Khi du khách yêu cầu thay đổi điểm đến (từ Huế sang Đà Nẵng) hoặc đổi ngân sách giữa cuộc hội thoại, Orchestrator cập nhật lại `effective_city` và tính toán lại bài toán kinh tế phù hợp với thành phố mới.
- Không lưu trữ thông tin nhạy cảm vào ngữ cảnh hội thoại; dữ liệu phiên được cách ly độc lập theo từng request.

---

## 7. TƯƠNG THÍCH API VÀ FRONTEND (API & FRONTEND COMPATIBILITY)

Hợp đồng dữ liệu `CopilotChatResponse` được mở rộng hoàn toàn tương thích ngược:
- Thuộc tính `reply_text` tiếp tục chứa văn bản trả lời tiếng Việt chính cho khung chat của Frontend (`IdeationChatView.tsx`, `CreateTripCopilotModal.tsx`).
- Bổ sung property alias `answer` trỏ vào `reply_text`.
- Bổ sung các trường siêu dữ liệu phục vụ audit và hiển thị nâng cao:
  - `tools_used: list[str]`
  - `sources: list[dict[str, Any]]`
  - `session_id: str | None`
  - `data: dict[str, Any] | None`
  - `created_at: str | None`
- Không có bất kỳ thay đổi nào làm gãy mã nguồn Frontend hiện có.

---

## 8. CÁC FILE ĐÃ TẠO MỚI / THAY ĐỔI

1. `backend/app/orchestrator/__init__.py`: Package entrypoint.
2. `backend/app/orchestrator/policy.py`: Bộ quy tắc định tuyến quyết định sử dụng RAG/Tool.
3. `backend/app/orchestrator/orchestrator.py`: Bộ điều phối hội thoại chính (ChatbotOrchestrator).
4. `backend/app/trips/schemas.py`: Mở rộng `CopilotChatResponse` bổ sung `tools_used`, `sources`, `data`, `session_id`.
5. `backend/app/trips/service.py`: Tích hợp Orchestrator vào luồng xử lý `process_copilot_chat`.
6. `backend/app/trips/copilot_consultant.py`: Cập nhật `finalize_copilot_response` ghi nhận công cụ và timestamp.
7. `backend/app/tools/implementations.py`: Tinh chỉnh tìm kiếm từ khóa POI và chuẩn hóa thang điểm xanh 0-100.
8. `backend/tests/test_chatbot_orchestrator_sprint2_2.py`: Test suite gồm 16 test cases tương ứng 16 kịch bản đầu cuối.
9. `docs/CHATBOT_SPRINT_2_2_ORCHESTRATOR_INTEGRATION_REPORT.md`: Báo cáo kỹ thuật này.

---

## 9. KẾT QUẢ KIỂM THỬ THỰC TẾ (TEST VERIFICATION LOGS)

### 9.1. Kiểm thử trọn bộ 16 kịch bản đầu cuối Sprint 2.2
```bash
cd backend
python -m pytest tests/test_chatbot_orchestrator_sprint2_2.py -v
```
**Kết quả thực tế**:
```text
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_01_simple_knowledge_rag PASSED [  6%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_02_poi_search_tool_calling PASSED [ 12%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_03_recommend_pois_nature PASSED [ 18%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_04_poi_explanation_knowledge_graph PASSED [ 25%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_05_rag_and_tool_used_together PASSED [ 31%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_06_itinerary_generation_cost PASSED [ 37%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_07_multiturn_retained_context PASSED [ 43%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_08_user_changes_destination PASSED [ 50%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_09_rag_empty_retrieval PASSED [ 56%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_10_tool_empty_results PASSED [ 62%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_11_tool_execution_failure_handled PASSED [ 68%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_12_llm_timeout_fallback PASSED [ 75%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_13_max_tool_iteration_limit PASSED [ 81%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_14_structured_price_lookup PASSED [ 87%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_15_prompt_injection_safety PASSED [ 93%]
tests/test_chatbot_orchestrator_sprint2_2.py::test_scenario_16_response_contract_backward_compatibility PASSED [100%]

======================== 16 passed, 1 warning in 5.05s ========================
```

### 9.2. Kiểm thử hồi quy toàn bộ hệ thống Chatbot & AI Backend
```bash
cd backend
python -m pytest tests/test_rag.py tests/test_tool_calling.py tests/test_chatbot_orchestrator_sprint2_2.py tests/test_copilot_chat.py tests/test_recommendations.py tests/test_poi_explanation_query.py -q
```
**Kết quả thực tế**:
```text
111 passed, 1 warning in 9.32s
```
*(111/111 test cases đều PASS hoàn toàn)*.

---

## 10. ĐÁNH GIÁ TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

| Tiêu chí | Nội dung yêu cầu | Đánh giá | Bằng chứng thực tế |
|---|---|:---:|---|
| **AC1** | Orchestrator gọi được dịch vụ RAG | **PASS** | `test_scenario_01`: Trích xuất thành công tri thức di sản văn hóa kèm score và file nguồn. |
| **AC2** | Orchestrator gọi được các công cụ đã đăng ký | **PASS** | `test_scenario_02`, `03`, `04`, `06`: Gọi thành công `search_pois`, `recommend_pois`, `get_poi_explanation`, `calculate_trip_cost`. |
| **AC3** | Bộ định tuyến tự chọn RAG, Tool hoặc kết hợp linh hoạt | **PASS** | `decide_orchestration_plan` định tuyến chuẩn xác 6 trường hợp nghiệp vụ, không ép buộc gọi thừa. |
| **AC4** | Kết quả từ RAG và Tool được tổng hợp chính xác trước khi sinh câu trả lời | **PASS** | `_synthesize_response` ghép nối thông tin ngân sách, điểm đến và trích dẫn văn bản mượt mà. |
| **AC5** | Duy trì ngữ cảnh hội thoại nhiều lượt | **PASS** | `test_scenario_07`: Hiểu ý định "ngày thứ hai đi ít hơn" mà không làm mất ngày 1. |
| **AC6** | `sources` và `tools_used` phản ánh chính xác lần thực thi thực tế | **PASS** | `test_scenario_05`, `16`: `tools_used` và `sources` ghi nhận đầy đủ danh sách thực tế. |
| **AC7** | Xử lý lỗi tool và kết quả RAG rỗng an toàn | **PASS** | `test_scenario_09`, `10`, `11`: Không sập ứng dụng, trả về thông báo lịch sự. |
| **AC8** | Hợp đồng API với Frontend được bảo toàn nguyên vẹn | **PASS** | `test_scenario_16` và 25 tests trong `test_copilot_chat.py` đều pass 100%. |
| **AC9** | Toàn bộ Unit Test và Integration Test liên quan đều PASS | **PASS** | **111/111 tests PASS** trong 9.32 giây. |
| **AC10** | Không làm hỏng Recommendation, KG, POI hay Optimizer hiện có | **PASS** | Toàn bộ module gốc giữ nguyên interface, chạy song song trơn tru. |

---

## 11. ĐỀ XUẤT CHO SPRINT 2.3 TIẾP THEO

1. **Hiển thị huy hiệu RAG & Knowledge Graph trên UI**:
   - Thêm nút *"Xem nguồn tài liệu"* bên dưới tin nhắn tư vấn để du khách có thể mở xem trích dẫn sách hướng dẫn du lịch hoặc chứng nhận xanh.
2. **Streaming qua Server-Sent Events (SSE)**:
   - Nối Orchestrator vào `/trips/copilot/chat/stream` để câu trả lời sinh ra từ RAG + Tool có thể gõ chữ dần từng từ (typewriter effect) trên giao diện người dùng.
3. **Đánh giá Hallucination Benchmark**:
   - Thiết lập bộ dữ liệu đánh giá 50 câu hỏi khó để kiểm tra tỷ lệ trả lời đúng sự thật của Chatbot.
