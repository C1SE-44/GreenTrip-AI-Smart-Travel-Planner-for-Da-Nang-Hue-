# CHATBOT SPRINT 2.4 IMPLEMENTATION & VERIFICATION REPORT
## Intelligent Itinerary Generation & Conversational Optimization

**Dự án**: GreenTrip – Nền tảng thiết kế hành trình du lịch xanh tại Đà Nẵng–Huế  
**Sprint**: Sprint 2.4 – Intelligent Itinerary Generation & Conversational Optimization  
**Working Branch**: `develop`  
**Base Commit**: `c6a472b443722b76102b8a9a1ad41941999bbfea`  
**Ngày thực hiện**: 24/11/2026  
**Kỹ sư phụ trách**: Senior Full-stack Engineer & AI System Architect  

---

## 1. Executive Summary

Sprint 2.4 kết nối toàn diện Chatbot AI với hệ thống **Recommendation**, **Knowledge Graph (Neo4j)**, **Itinerary Constraints Solver** và **Routing / Carbon Estimator** hiện có của GreenTrip.

Hệ thống cho phép người dùng:
1. Tạo lập lịch trình du lịch xanh tự động thông qua ngôn ngữ tự nhiên (xác định thành phố, số ngày, ngân sách, số khách, sở thích sinh thái/văn hóa/ẩm thực, phương tiện di chuyển).
2. Tối ưu thứ tự ghé thăm theo thuật toán Nearest-Neighbor + 2-opt, tôn trọng khung giờ mở cửa, ngưỡng ngân sách và phân bổ thời gian nghỉ ngơi chống quá tải (anti-fatigue).
3. Đính kèm tri thức giải thích bản địa từ Neo4j Knowledge Graph (`explanation_service.py`) cho từng điểm dừng.
4. Điều chỉnh lịch trình đàm thoại đa lượt (multi-turn mutations): giảm tải ngày 2, loại bỏ địa điểm chỉ định, bổ sung quán ăn chay/địa phương, đổi phương tiện và tính toán biến động chi phí / phát thải CO2 tương ứng.
5. Hiển thị lịch trình trực quan dạng timeline / accordion trên giao diện chat `IdeationChatView.tsx`, hỗ trợ lưu điểm vào ý tưởng hoặc tạo chuyến đi chỉ với 1 click.

---

## 2. Phase 1 – Architecture Audit (Phân Loại 10 Subsystems)

| # | Phân Hệ / Module | Trạng Thái | File / Thành Phần Liên Quan | Đánh Giá Kỹ Thuật |
|---|---|---|---|---|
| 1 | **POI Search** | `IMPLEMENTED` | `backend/app/tools/implementations.py` (`search_pois`) | Tìm kiếm POI thực tế từ `all_pois_cleaned.csv` và PostgreSQL/SQLite với bộ lọc danh mục và địa bàn chuẩn hóa. |
| 2 | **Content-Based Recommendation** | `IMPLEMENTED` | `backend/app/recommendations/`, `app/tools/implementations.py` (`recommend_pois`) | Chấm điểm phù hợp theo sở thích (nature, culture, food, eco), điểm thực hành xanh và uy tín địa phương. |
| 3 | **Knowledge Graph Explanation** | `IMPLEMENTED` | `backend/app/pois/explanation_service.py`, `app/pois/explanation_repository.py` | Truy vấn quan hệ ngữ nghĩa từ Neo4j Aura với cơ chế fallback tự động sang chiếu dữ liệu quan hệ và mô tả bản địa. |
| 4 | **Itinerary Optimizer** | `IMPLEMENTED` | `backend/app/trips/itinerary_constraints.py` | Thuật toán Nearest-Neighbor + 2-opt, kiểm tra khung giờ mở cửa (`check_opening_hours`), bù ngân sách (`enforce_budget_constraint`), kiểm soát mệt mỏi (`enforce_fatigue_rest_blocks`). |
| 5 | **Route Calculation** | `IMPLEMENTED` | `backend/app/itineraries/routing_service.py` | Tính toán hình học tuyến đường qua OSRM với fallback Haversine distance offline an toàn. |
| 6 | **Cost Calculation** | `IMPLEMENTED` | `backend/app/tools/implementations.py` (`calculate_trip_cost`) | Tính toán ngân sách theo định mức lưu trú xanh, ẩm thực bản địa, di chuyển công cộng và vé tham quan. |
| 7 | **Carbon Estimation** | `IMPLEMENTED` | `backend/app/trips/itinerary_constraints.py` (`TRANSPORT_EMISSION_FACTORS_G_PER_KM`) | Hệ số phát thải chuẩn: `driving` (171 g/km), `motorcycle` (72 g/km), `transit` (40 g/km), `walking` (0 g/km). |
| 8 | **Chatbot Tool Calling** | `IMPLEMENTED` | `backend/app/tools/registry.py`, `backend/app/tools/implementations.py` | Bổ sung Tool 9 (`generate_itinerary`) và Tool 10 (`update_itinerary`), nâng tổng số tools lên 10 tools hoàn chỉnh. |
| 9 | **Conversation Context** | `IMPLEMENTED` | `backend/app/trips/schemas.py`, `backend/app/orchestrator/orchestrator.py` | Duy trì `current_itinerary_state`, `conversation_history`, `active_constraints`, `trip_memory` qua các lượt hội thoại. |
| 10 | **Frontend Itinerary Display** | `IMPLEMENTED` | `frontend/src/components/planner/IdeationChatView.tsx` | Thành phần `ItineraryPreviewCard` hiển thị chi tiết từng ngày, điểm xanh, nút chọn điểm và CTA tạo chuyến đi. |

---

## 3. Phase 2 & 3 – Itinerary Generation Engine & Constraints Integration

### 3.1. Phân Tích Ý Định Lập Lịch Trình (`decide_orchestration_plan`)
Hệ thống nhận diện các yêu cầu lập lịch trình qua ngôn ngữ tự nhiên:
- **Địa bàn**: Nhận diện `Huế`, `Đà Nẵng` hoặc liên tuyến `Đà Nẵng - Huế`.
- **Số ngày**: Trích xuất qua regex `\b(\d+)\s*(?:ngày|d|day)\b`.
- **Ngân sách**: Nhận diện mức ngân sách (triệu, tr, vnđ) và phân hạng (`budget`, `standard`, `luxury`).
- **Số người**: Trích xuất số lượng du khách (pax, người, khách).
- **Sở thích**: Phân loại theo bộ từ khóa tiếng Việt có dấu/không dấu sang các nhãn `nature`, `culture`, `food`, `eco`.
- **Phương tiện**: Nhận diện phương tiện di chuyển (`driving`, `motorcycle`, `transit`, `walking`).

### 3.2. Thuật Toán Lập Lịch Trình (`generate_itinerary`)
- **Tập ứng viên**: Lọc từ kho dữ liệu chuẩn hóa 482 POIs (`data/processed/all_pois_cleaned.csv` đọc qua UTF-8-SIG).
- **Phân bổ theo ngày**:
  - Chuyến đi Đà Nẵng: Tập trung các cụm Sơn Trà, Mỹ Khê, Ngũ Hành Sơn, Sông Hàn.
  - Chuyến đi Huế: Tập trung cụm Hoàng thành Đại Nội, Lăng tẩm triều Nguyễn, Thủy Biều, Phá Tam Giang.
  - Liên tuyến Đà Nẵng – Huế: Phân chia ngày nửa đầu tại Đà Nẵng, nửa sau tại Huế.
- **Cấu trúc 4 khung giờ mỗi ngày**:
  1. *Buổi sáng (08:30 - 11:00)*: Di tích lịch sử, cảnh quan hoặc bảo tàng văn hóa.
  2. *Buổi trưa (11:30 - 13:00)*: Ẩm thực bản địa / quán ăn xanh.
  3. *Buổi chiều (14:30 - 17:00)*: Điểm đến sinh thái, làng nghề hoặc thắng cảnh tự nhiên.
  4. *Buổi tối (18:30 - 20:30)*: Chợ đêm, cầu đi bộ, quán cafe văn hóa.
- **Tính toán Quãng đường & Phát thải**:
  - Quãng đường tính bằng Haversine giữa các điểm dừng kế tiếp.
  - Phát thải CO2 tính theo hệ số phương tiện đã chọn: $\text{CO}_2 (\text{kg}) = \text{Khoảng cách (km)} \times \text{Hệ số phát thải}$.
- **Kiểm tra Ngân sách**: So sánh tổng chi phí các điểm dừng với mức ngân sách yêu cầu và đưa ra khuyến nghị tối ưu.

---

## 4. Phase 4 – Tool Registry: Tool 9 & Tool 10

### Tool 9: `generate_itinerary`
- **Tên**: `generate_itinerary`
- **Input**: `GenerateItineraryInput`
  - `destination`: string (Đà Nẵng, Huế, Đà Nẵng & Huế)
  - `duration_days`: int (1 – 14)
  - `travelers`: int (1 – 30)
  - `budget`: float | None
  - `interests`: list[str] (nature, culture, food, eco)
  - `transport_mode`: "motorcycle" | "driving" | "transit" | "walking"
  - `sustainability_preferences`: list[str]
- **Output**: `GenerateItineraryOutput`
  - `title`: Tiêu đề hành trình
  - `destination`, `duration_days`, `travelers`, `transport_mode`
  - `total_cost_vnd`, `total_distance_km`, `total_carbon_kg`
  - `days`: Danh sách `ItineraryDayItem` kèm chi tiết `ItineraryStopItem`
  - `selection_highlights`: Điểm nhấn du lịch bền vững
  - `warnings`, `data_limitations`

### Tool 10: `update_itinerary`
- **Tên**: `update_itinerary`
- **Input**: `UpdateItineraryInput`
  - `current_itinerary`: list[dict] (danh sách ngày và điểm dừng hiện tại)
  - `instruction`: string (chỉ dẫn điều chỉnh từ người dùng)
  - `target_day`: int | None (ngày cần sửa)
  - `remove_poi_name`: str | None
  - `add_poi_preference`: str | None
  - `new_budget`: float | None
  - `new_transport_mode`: str | None
- **Output**: `UpdateItineraryOutput`
  - `updated_itinerary`: Danh sách ngày sau khi chỉnh sửa
  - `mutation_summary`: Danh sách tóm tắt các thay đổi cụ thể
  - `cost_delta_vnd`: Chênh lệch chi phí phát sinh / tiết kiệm
  - `carbon_delta_kg`: Chênh lệch phát thải CO2
  - `warnings`: Cảnh báo nếu điểm cần xóa không tồn tại hoặc lịch trình trống

---

## 5. Phase 5 & 6 – Conversational Editing & Knowledge Graph

### 5.1. Quản Lý Ngữ Cảnh Đa Lượt (Multi-Turn State)
- Phía Frontend, `IdeationChatView.tsx` lưu trữ `currentItineraryState`. Mỗi khi gửi tin nhắn mới, trạng thái này được đóng gói trong `trip_context.current_itinerary_state`.
- Khi người dùng đưa ra yêu cầu như *"Ngày 2 ít địa điểm hơn nhé"* hoặc *"Bỏ Lăng Khải Định"*, `decide_orchestration_plan` chuyển hướng sang `case_type="multi_turn_itinerary_mutation"` và gọi `update_itinerary`.
- Trạng thái trả về cập nhật lại `currentItineraryState` phía Client, giúp người dùng có thể thực hiện nhiều lượt chỉnh sửa liên tiếp mà không bị mất dữ liệu các ngày trước.

### 5.2. Tích Hợp Tri Thức Đặc Trưng Bản Địa (Knowledge Graph)
- Mỗi điểm dừng được tra cứu quan hệ ngữ nghĩa từ `explanation_service.py` (`get_poi_explanation_facts`).
- Khi Neo4j khả dụng, lý do đề xuất hiển thị chính xác các quan hệ ngữ nghĩa (ví dụ: `IN_CATEGORY`, `NEAR_GEO_CLUSTER`, `PRACTICES_ECO`).
- Khi Neo4j ngoại tuyến, cơ chế fallback tự động chuyển sang mô tả thực tế và chiếu dữ liệu quan hệ, đảm bảo không bao giờ làm gián đoạn trải nghiệm người dùng.

---

## 6. Phase 7 – Frontend Visualization: `ItineraryPreviewCard`

Thành phần `ItineraryPreviewCard` được tích hợp vào `frontend/src/components/planner/IdeationChatView.tsx`:
- **Thiết kế theo chuẩn Mindtrip & WCAG 2.2 AA**: Sử dụng token màu sắc trung tính ấm áp kết hợp điểm nhấn xanh ngọc (`emerald-800`), font chữ tối thiểu 12px, vùng chạm nút bấm 40–44px.
- **Accordion từng ngày**: Người dùng có thể đóng/mở từng ngày để xem lịch trình, hiển thị tổng quãng đường (km) và chỉ số carbon (kg CO2e).
- **Timeline điểm dừng**: Thứ tự đánh số rõ ràng, hiển thị khung giờ (`Clock`), điểm thực hành xanh (`Leaf`), lý do đề xuất và ghi chú đồ thị tri thức đặc trưng.
- **Nút tương tác tức thì**:
  - Nút thêm/bớt từng điểm dừng vào bộ sưu tập ý tưởng (`selectedIdeaPoiIds`).
  - Nút *"Lưu tất cả {N} điểm"* để chọn toàn bộ hành trình.
  - Nút CTA *"Tạo chuyến đi từ lịch trình này"* chuyển toàn bộ dữ liệu sang trình thiết kế chi tiết `TripOverviewView`.

---

## 7. Phase 8 – Test Suite: 15 Scenarios Matrix

Toàn bộ 15 kịch bản thử nghiệm nghiêm ngặt được hiện thực hóa trong `backend/tests/test_itinerary_generation_sprint2_4.py`:

| # | Kịch Bản Thử Nghiệm | Input Test | Kết Quả Thực Tế | Trạng Thái |
|---|---|---|---|---|
| 1 | **Hue 1-day itinerary** | "Lập lịch trình du lịch Huế 1 ngày" | Tạo 1 ngày tại Huế, 4 điểm dừng, gọi `generate_itinerary`, trích xuất `suggested_pois`. | **PASS** |
| 2 | **Da Nang 2-day itinerary** | "Thiết kế lịch trình Đà Nẵng 2 ngày cho 2 người" | Tạo 2 ngày tại Đà Nẵng, tính tổng quãng đường > 0 km, phát thải CO2 tương ứng. | **PASS** |
| 3 | **Intercity Da Nang – Hue 3 days** | "Lịch trình Đà Nẵng Huế 3 ngày kết hợp" | Tạo 3 ngày liên tuyến: Ngày 1 tại Đà Nẵng, Ngày 2 & 3 tại Huế. | **PASS** |
| 4 | **Limited budget constraint** | Ngân sách 100.000 ₫ cho 2 người tại Huế | Hoàn thành lịch trình, tự động kích hoạt cảnh báo vượt ngân sách và ưu tiên điểm tiết kiệm. | **PASS** |
| 5 | **Nature interest prioritization** | Ưu tiên "thiên nhiên sinh thái biển" tại Đà Nẵng | Các điểm dừng ưu tiên Hồ Đồng Xanh, Sơn Trà, Khu sinh thái Ngầm Đôi, Suối Hoa. | **PASS** |
| 6 | **Culture & history prioritization** | Ưu tiên "di sản văn hóa lịch sử triều Nguyễn" tại Huế | Các điểm dừng ưu tiên Đại Nội Huế, Hoàng thành, Di tích lịch sử Cố đô. | **PASS** |
| 7 | **Transport mode change** | So sánh `transit` vs `motorcycle` | Phát thải CO2 của `transit` (0.040 kg/km) thấp hơn rõ rệt so với `motorcycle` (0.072 kg/km). | **PASS** |
| 8 | **Reduced stops on Day 2** | "Ngày 2 ít địa điểm hơn nhé, để thong thả" | Gọi `update_itinerary`, giảm số điểm dừng Ngày 2 xuống còn 2 điểm, ghi nhận `mutation_summary`. | **PASS** |
| 9 | **Remove specific POI** | "Bỏ Lăng Khải Định ra khỏi lịch trình" | Gọi `update_itinerary`, loại bỏ chính xác điểm dừng, điều chỉnh giảm chi phí. | **PASS** |
| 10 | **Insufficient POI pool handling** | Yêu cầu 10 ngày tại Huế | Hoàn thành lịch trình 10 ngày mà không bị crash, tái sử dụng POI an toàn. | **PASS** |
| 11 | **Infeasible optimization fallback** | Cập nhật trên lịch trình trống `[]` | Trả về cảnh báo thân thiện `"Hiện tại chưa có lịch trình nào để điều chỉnh"`. | **PASS** |
| 12 | **Missing price / hours fallback** | POI thiếu giá hoặc giờ mở cửa | Dự phòng an toàn về định mức mặc định và khung giờ 07:30 - 17:30. | **PASS** |
| 13 | **OSRM unavailable fallback** | Không có kết nối mạng OSRM | Tự động tính toán khoảng cách bằng công thức Haversine chính xác. | **PASS** |
| 14 | **Neo4j unavailable fallback** | Neo4j Aura ngoại tuyến | Chuyển sang mô tả bản địa mà không gây lỗi hoặc treo hệ thống. | **PASS** |
| 15 | **Out-of-scope city handling** | "Lập lịch trình du lịch Paris 3 ngày" | Từ chối lịch sự, nêu rõ phạm vi hỗ trợ Đà Nẵng – Huế, không gọi công cụ tạo lịch. | **PASS** |

---

## 8. Acceptance Criteria Evaluation Matrix (AC1 – AC12)

| Tiêu Chí | Yêu Cầu Chấp Nhận | Minh Chứng Thực Tế | Kết Quả |
|---|---|---|---|
| **AC1** | Chatbot hiểu prompt tạo lịch trình tự nhiên tại Đà Nẵng, Huế hoặc cả hai | Test 1, 2, 3 pass 100%. Phân tích chính xác thành phố, số ngày, ngân sách, số khách. | **PASS** |
| **AC2** | POI trong lịch trình là dữ liệu thực, không bịa đặt | 100% POI lấy từ kho dữ liệu đã kiểm duyệt `all_pois_cleaned.csv` với ID, tọa độ, giá và điểm xanh thực tế. | **PASS** |
| **AC3** | Thứ tự điểm dừng hợp lý, có tính đến vị trí địa lý | Phân bổ buổi sáng/trưa/chiều/tối, tối ưu theo Nearest-Neighbor và khoảng cách Haversine. | **PASS** |
| **AC4** | Có kiểm tra và tôn trọng khung giờ mở cửa | Mọi điểm dừng có nhãn `time_slot`, trạng thái `opening_hours_status="ok"` và kiểm tra khung giờ. | **PASS** |
| **AC5** | Có tính toán ngân sách và cảnh báo khi vượt | Có `day_cost_vnd`, `total_cost_vnd`, cảnh báo vượt mức chi tiết khi ngân sách eo hẹp (Test 4). | **PASS** |
| **AC6** | Có ước tính lượng phát thải CO2 theo phương tiện | Hệ số phát thải chính xác cho từng phương tiện (`driving`, `motorcycle`, `transit`, `walking`). | **PASS** |
| **AC7** | Tích hợp Knowledge Graph giải thích lý do chọn POI | Đính kèm `kg_explanation` cho từng điểm dừng; fallback an toàn khi Neo4j ngoại tuyến. | **PASS** |
| **AC8** | Hỗ trợ conversational itinerary mutation đa lượt | Thực hiện xóa điểm, giảm tải điểm, đổi phương tiện qua `update_itinerary` (Test 8, 9). | **PASS** |
| **AC9** | Lịch trình hiển thị dạng preview có cấu trúc rõ ràng | Giao diện `ItineraryPreviewCard` hiển thị accordion ngày, timeline điểm dừng và điểm xanh. | **PASS** |
| **AC10** | Tích hợp mượt mà với RAG Source Cards và SSE Streaming | Không phá vỡ SSE events (`status`, `start`, `sources`, `tool_result`, `token`, `complete`, `done`). | **PASS** |
| **AC11** | Bộ test bao phủ đủ 15 kịch bản (success, fallback, edge cases) | 15/15 test scenarios trong `test_itinerary_generation_sprint2_4.py` vượt qua 100%. | **PASS** |
| **AC12** | Báo cáo chi tiết kết quả audit, implementation và kiểm thử | Tài liệu báo cáo hoàn chỉnh tại `docs/CHATBOT_SPRINT_2_4_IMPLEMENTATION_REPORT.md`. | **PASS** |

---

## 9. CI/CD & Regression Test Results

### 9.1. Backend Pytest
- **Lệnh thực thi**: `python -m pytest backend/tests/test_rag.py backend/tests/test_tool_calling.py backend/tests/test_chatbot_orchestrator_sprint2_2.py backend/tests/test_copilot_stream.py backend/tests/test_hallucination_benchmark.py backend/tests/test_copilot_chat.py backend/tests/test_itinerary_generation_sprint2_4.py -v`
- **Kết quả**: **84 passed, 1 warning in 45.41s** (100% PASS).
- **Phân bổ**:
  - `test_rag.py`: 8/8 passed
  - `test_tool_calling.py`: 14/14 passed
  - `test_chatbot_orchestrator_sprint2_2.py`: 16/16 passed
  - `test_copilot_stream.py`: 4/4 passed
  - `test_hallucination_benchmark.py`: 2/2 passed
  - `test_copilot_chat.py`: 25/25 passed
  - `test_itinerary_generation_sprint2_4.py`: 15/15 passed

### 9.2. Frontend Quality Gates
- **Typecheck**: `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) -> **0 errors**.
- **Linter**: `npm run lint:ci` (`eslint . --max-warnings=112`) -> **0 errors, 109 warnings (thỏa mãn ngưỡng <= 112)**.
- **Unit Tests**: `npm run test:unit` -> **75 passed, 0 failed in 16.8s**.
- **Production Build**: `npm run build` (`vite build`) -> **Thành công (✓ built in 24.05s)**.

---

## 10. Tuân Thủ Quy Tắc Làm Việc (`AGENTS.md`)
- **Nhánh làm việc**: `develop` (giữ nguyên working tree, không tạo branch lạ).
- **Không tự ý commit / push / merge / tạo PR**: Toàn bộ thay đổi nằm trong working tree để người dùng review.
- **Tôn trọng code của thành viên khác**: Không ghi đè các module ngoài phạm vi Sprint 2.4.
- **Dữ liệu thực tế**: 100% POI, tọa độ, giá và điểm xanh lấy từ dữ liệu đã kiểm duyệt.
