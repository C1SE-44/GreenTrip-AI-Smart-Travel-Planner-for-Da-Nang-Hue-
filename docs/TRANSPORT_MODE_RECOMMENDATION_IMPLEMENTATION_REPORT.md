# BÁO CÁO TOÀN DIỆN VỀ AUDIT VÀ NÂNG CẤP ĐỀ XUẤT TUYẾN ĐƯỜNG KẾT HỢP ĐỀ XUẤT PHƯƠNG TIỆN DI CHUYỂN
## GreenTrip AI — A Multi-Objective Green Tourism Itinerary Optimizer for Central Vietnam

> **Ngày thực hiện**: 24/11/2026  
> **Nhánh thực hiện**: `develop` (Working tree trực tiếp, không commit, không push)  
> **Phiên bản hệ thống**: GreenTrip 2.10 (Multi-Criteria Segment Transport Engine)

---

## 1. TỔNG QUAN DỰ ÁN & MỤC TIÊU NÂNG CẤP (EXECUTIVE SUMMARY)

GreenTrip AI ban đầu cung cấp công cụ tạo lập lịch trình du lịch xanh tối ưu hóa theo đa mục tiêu (Nearest-Neighbor kết hợp 2-Opt pairwise swap) tại Đà Nẵng và Huế. Tuy nhiên, ở phiên bản trước:
1. **Thiếu đề xuất phương tiện cấp độ từng chặng (segment-level)**: Hệ thống chỉ gán một phương tiện chung (`transport_mode`) cho toàn bộ lịch trình hoặc từng ngày, chưa phân tích sự khác biệt về cự ly giữa các điểm dừng kề cận (ví dụ: chặng 800m đi bộ là tối ưu, nhưng chặng 6km nên đi xe buýt điện hoặc xe máy).
2. **Chưa phân biệt đặc thù tuyến liên tỉnh vs nội thành**: Tuyến kết nối Đà Nẵng <-> Huế (qua Đèo Hải Vân / Vịnh Lăng Cô ~100 km) chưa được gợi ý các phương tiện giao thông liên tỉnh bền vững và di sản như **Tàu hỏa (Đường sắt Thống Nhất)** hoặc **Xe khách chất lượng cao / Limousine**.
3. **Chưa có mô hình chi phí di chuyển động**: Chi phí trước đây chỉ tính ngân sách du lịch tổng quát theo ngày hoặc giá vé tham quan POI, chưa tính chi phí nhiên liệu/vé xe cho từng chặng di chuyển.

**Kết quả sau nâng cấp Sprint này**:
- Xây dựng thành công **Multi-Criteria Segment Transport Recommendation Engine** ([backend/app/itineraries/transport_service.py](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/transport_service.py)) đánh giá đồng thời 5 tiêu chí: **Khoảng cách, Thời gian, Chi phí (VND), Phát thải carbon (CO2e) và Tính khả thi (Feasibility)**.
- Phân biệt rõ nét **Tuyến nội thành (Intra-city)** và **Hành lang liên tỉnh Đà Nẵng - Huế (Inter-city Corridor)**.
- Tích hợp 3 hồ sơ trọng số ưu tiên: `balanced` (Cân bằng), `eco_priority` (Ưu tiên xanh), `budget_constrained` (Thắt chặt ngân sách).
- Bổ sung cấu trúc dữ liệu `segments` vào API `DayRouteResponse` và cung cấp endpoint đổi phương tiện từng chặng `POST /itineraries/{id}/days/{day}/segment-transport`.
- Mở rộng Chatbot Tool Calling (`get_route_information`, `recommend_transport_mode`, `update_itinerary`).
- Hoàn thiện giao diện bản đồ và timeline: Badge phương tiện từng chặng, Drawer so sánh đa tiêu chí và Modal chuyển đổi phương tiện trực quan.
- Đạt **100% tỷ lệ vượt qua bài kiểm tra** (20/20 test cases backend, 75/75 frontend unit tests, 0 lỗi TypeScript).

---

## 2. HIỆN TRẠNG ROUTING & ĐỐI CHIẾU 12 CÂU HỎI AUDIT (CODE AUDIT FINDINGS)

Dưới đây là câu trả lời chi tiết kèm dẫn chứng file, hàm và dòng code thực tế trong dự án:

### Câu 1: Hiện tại người dùng được đề xuất tuyến đường như thế nào?
- **Cơ chế**: Tuyến đường được tính toán và trả về qua API `GET /itineraries/{itinerary_id}/days/{day_number}/route` hoặc `POST /itineraries/compute`.
- **Dẫn chứng**: [backend/app/itineraries/router.py:55-86](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/router.py#L55-L86) gọi hàm `get_itinerary_day_route` trong [backend/app/itineraries/service.py:21-95](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/service.py#L21-L95). Tuyến nối các điểm dừng theo thứ tự ghé thăm đã được sắp xếp trước đó.

### Câu 2: Hệ thống xác định thứ tự các điểm đến ra sao?
- **Cơ chế**: Thứ tự điểm dừng được sắp xếp bằng giải thuật **Nearest-Neighbor kết hợp 2-Opt pairwise swap** (tối đa 32 passes) nhằm giảm thiểu tổng quãng đường di chuyển nội bộ trong ngày trong khi bảo toàn các ràng buộc về khung giờ mở cửa và địa điểm ăn uống trưa/tối.
- **Dẫn chứng**: [backend/app/trips/itinerary_constraints.py:491-525](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/trips/itinerary_constraints.py#L491-L525) trong hàm `_nearest_neighbor_and_2opt`.

### Câu 3: Khoảng cách được tính bằng OSRM hay Haversine?
- **Cơ chế**: Hệ thống ưu tiên truy vấn OSRM đường bộ thực tế (`https://router.project-osrm.org/route/v1/driving`). Nếu OSRM timeout (> 7 giây) hoặc xảy ra lỗi kết nối mạng (ví dụ môi trường sandbox/offline), hệ thống tự động fallback sang khoảng cách Haversine nhân với hệ số detour uốn khúc đường bộ.
- **Dẫn chứng**: [backend/app/itineraries/routing_service.py:165-225](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/routing_service.py#L165-L225) trong hàm `compute_route_geometry`.

### Câu 4: Khi OSRM không hoạt động thì hệ thống xử lý thế nào?
- **Cơ chế**: Hàm `build_fallback_route` được kích hoạt. Không chỉ nối đường chim bay thông thường, hệ thống chèn 19 tọa độ waypoints đường bộ QL1A (`CORRIDOR_DA_NANG_HUE_GEOJSON`) cho chặng Đà Nẵng - Huế, hoặc chèn 6 waypoints vòng qua Vịnh Đà Nẵng (`da_nang_bay_bypass`) để tránh đường chim bay cắt ngang biển/núi. Cờ `is_fallback = True`, `routing_provider = "fallback"` được trả về minh bạch cho frontend.
- **Dẫn chứng**: [backend/app/itineraries/routing_service.py:99-158](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/routing_service.py#L99-L158).

### Câu 5: Thời gian di chuyển được tính bằng cách nào?
- **Khi có OSRM**: Lấy trực tiếp trường `duration` (giây) từ OSRM API response.
- **Khi fallback**: Tính bằng công thức `estimated_duration = total_distance / FALLBACK_SPEED_MPS` với `FALLBACK_SPEED_MPS = 9.72 m/s` (~35 km/h) cộng thêm hệ số detour.
- **Dẫn chứng**: [backend/app/itineraries/routing_service.py:20](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/routing_service.py#L20) và [routing_service.py:143](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/routing_service.py#L143).

### Câu 6: Hiện tại có những phương tiện nào?
- **Khai báo cũ**: 4 phương tiện chính: `driving` (Ô tô), `motorcycle` (Xe máy), `transit` (Xe buýt), `walking` (Đi bộ) trong [backend/app/trips/itinerary_constraints.py:34-46](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/trips/itinerary_constraints.py#L34-L46) và [frontend/src/components/planner/ItineraryRouteMap.tsx:42](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/frontend/src/components/planner/ItineraryRouteMap.tsx#L42). Trong tool chatbot [backend/app/tools/implementations.py:340](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/tools/implementations.py#L340) có thêm `electric_bus` và `bicycle`.

### Câu 7: Mỗi phương tiện có hệ số phát thải riêng không?
- **Có**: Hệ số phát thải theo km:
  - `itinerary_constraints.py`: driving = 171 g/km, motorcycle = 72 g/km, transit = 40 g/km, walking = 0 g/km.
  - `tools/implementations.py`: car = 0.170 kg/km, motorbike = 0.085 kg/km, electric_bus = 0.025 kg/km, bicycle = 0 kg/km, walking = 0 kg/km.

### Câu 8: Chi phí di chuyển đã được tính chưa?
- **Trước nâng cấp**: Chưa được tính chi tiết theo từng chặng. Hệ thống chỉ ước tính chi phí du lịch chung theo ngày hoặc chi phí vé tham quan / ăn uống của từng điểm dừng POI (`estimated_cost`). Chi phí đi lại (xăng xe, vé buýt, vé tàu hỏa, taxi) chưa được mô hình hóa động.

### Câu 9: Hệ thống có phân biệt tuyến nội thành và liên tỉnh không?
- **Về hình học đường đi**: Có nhận diện trong hàm `get_corridor_between_points` ([routing_service.py:62-75](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/routing_service.py#L62-L75)) để chèn waypoints QL1A qua Đèo Hải Vân / Vịnh Lăng Cô.
- **Về đề xuất phương tiện**: Trước đây chưa phân biệt; người dùng chọn `driving` hoặc `motorcycle` thì áp dụng đồng nhất từ nội thành đến liên tỉnh.

### Câu 10: Dữ liệu phương tiện có được lưu trong itinerary không?
- **Toàn chuyến (Trip-level)**: Có trường `transport_mode` trong `TripContextPayload` và `GenerateItineraryInput`.
- **Từng chặng (Leg/Segment-level)**: Trước đây chưa có! Lịch trình chỉ lưu danh sách điểm dừng (`stops`), thiếu mảng các chặng nối giữa 2 điểm dừng (`segments`).

### Câu 11: Frontend đã có nơi hiển thị phương tiện hay chưa?
- **Trước nâng cấp**: Có bộ nút chuyển đổi phương tiện tổng thể trên thanh tiêu đề `ItineraryRouteMap.tsx` (`Car`, `Bike`, `Bus`, `Footprints`), nhưng áp dụng cho toàn bộ tuyến trong ngày, không có giao diện xem hay đổi phương tiện cho từng chặng riêng biệt.

### Câu 12: Chatbot có thể hiểu và xử lý yêu cầu đổi phương tiện hay không?
- **Trước nâng cấp**: Chatbot có tool `update_itinerary` hỗ trợ đổi phương tiện cho toàn bộ lịch trình qua tham số `new_transport_mode`, nhưng chưa hỗ trợ câu lệnh đổi phương tiện cho một chặng cụ thể (ví dụ: "chặng từ Cầu Rồng sang Chợ Hàn đi bộ, còn chặng sang Huế đi tàu hỏa").

---

## 3. MÔ HÌNH TOÁN HỌC & HEURISTIC ĐỀ XUẤT PHƯƠNG TIỆN (SCORING MODEL)

### 3.1. Mô hình chấm điểm tổng hợp có trọng số (Weighted-Sum Scoring Model)

Với mỗi phương tiện ứng viên $m \in \mathcal{M}$ trên chặng $s$, điểm đánh giá tổng hợp $\text{Score}(m)$ được tính:

$$\text{Score}(m) = 100 \times \left( w_{\text{time}} \cdot \bar{T}_m + w_{\text{cost}} \cdot \bar{C}_m + w_{\text{carbon}} \cdot \bar{E}_m + w_{\text{feasibility}} \cdot F_m + \text{Bonus}_{\text{pref}} \right)$$

Trong đó:
- $\bar{T}_m = 1.0 - \frac{T_m - T_{\min}}{T_{\max} - T_{\min}}$: Điểm thời gian chuẩn hóa min-max đảo nghịch (thời gian di chuyển càng ngắn điểm càng cao).
- $\bar{C}_m = 1.0 - \frac{C_m - C_{\min}}{C_{\max} - C_{\min}}$: Điểm chi phí chuẩn hóa min-max đảo nghịch (chi phí càng thấp điểm càng cao).
- $\bar{E}_m = 1.0 - \frac{E_m - E_{\min}}{E_{\max} - E_{\min}}$: Điểm phát thải carbon chuẩn hóa min-max đảo nghịch (phát thải càng ít điểm càng cao).
- $F_m \in \{0.0, 1.0\}$: Hệ số khả thi kỹ thuật và an toàn. Nếu phương tiện không khả thi (ví dụ: đi bộ chặng 40km), $F_m = 0$ và bị phạt nặng ($\text{Score} = 10$).
- $\text{Bonus}_{\text{pref}} = 0.10$: Điểm ưu tiên nếu phương tiện trùng khớp với nguyện vọng của người dùng.

### 3.2. Ma trận trọng số theo 3 hồ sơ ưu tiên (Priority Profiles)

| Hồ sơ ưu tiên (`profile`) | $w_{\text{time}}$ | $w_{\text{cost}}$ | $w_{\text{carbon}}$ | $w_{\text{feasibility}}$ | Mục tiêu tối ưu |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`balanced` (Cân bằng - Mặc định)** | 0.35 | 0.25 | 0.25 | 0.15 | Hài hòa giữa tốc độ, ngân sách và môi trường |
| **`eco_priority` (Ưu tiên xanh)** | 0.20 | 0.15 | 0.50 | 0.15 | Tối đa hóa giảm phát thải carbon |
| **`budget_constrained` (Tiết kiệm)** | 0.20 | 0.55 | 0.10 | 0.15 | Tối ưu hóa chi phí đi lại thấp nhất |

### 3.3. Quy tắc kiểm tra tính khả thi (Feasibility Boundary Constraints)

- **Đi bộ (`walking`)**:
  - Khả thi nếu $d \le 3.0\text{ km}$ nội thành.
  - Bị loại bỏ nếu $d > 3.0\text{ km}$ hoặc là chặng liên tỉnh Đà Nẵng - Huế ($d > 40\text{ km}$).
- **Xe đạp (`bicycle`)**:
  - Khả thi nếu $d \le 10.0\text{ km}$ nội thành.
  - Không khả thi cho chặng liên tỉnh qua đèo Hải Vân.
- **Xe buýt điện / Công cộng (`electric_bus`, `public_bus`)**:
  - Không khuyến nghị nếu $d < 1.0\text{ km}$ (ưu tiên đi bộ ngắm phố).
  - Tuyến buýt điện chỉ khả thi trong mạng lưới nội thành Đà Nẵng / Huế.
- **Xe máy (`motorcycle`)**:
  - Khả thi cho mọi chặng nội thành và liên tỉnh $d \le 130\text{ km}$.
- **Tàu hỏa (`train`)**:
  - **Chỉ khả thi cho chặng liên tỉnh** kết nối Đà Nẵng - Huế ($d > 45\text{ km}$).
  - Không khả thi cho các chặng ngắn trong nội đô ($< 15\text{ km}$).
- **Xe khách chất lượng cao / Limousine (`tourist_coach`)**:
  - Chỉ áp dụng cho tuyến liên tỉnh Đà Nẵng - Huế qua Hầm Hải Vân.
- **Taxi / Ô tô riêng (`taxi_car`, `private_car`)**:
  - Khả thi cho mọi chặng có $d \ge 400\text{ m}$.

---

## 4. BẢNG THÔNG SỐ VẬN HÀNH & PHÁT THẢI (BENCHMARK PARAMETERS)

Toàn bộ thông số vận hành, thời gian đệm và chi phí được chuẩn hóa minh bạch trong [backend/app/itineraries/transport_service.py](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/transport_service.py):

| Phương tiện (`mode`) | Vận tốc nội thành | Vận tốc liên tỉnh | Thời gian đệm (Buffer) | Chi phí ước tính (VND) | Hệ số phát thải ($g\text{ CO}_2/\text{p-km}$) |
| :--- | :---: | :---: | :---: | :--- | :---: |
| **Đi bộ (`walking`)** | 4.5 km/h (1.25 m/s) | N/A | 0s | 0 VND | **0** |
| **Xe đạp (`bicycle`)** | 14.0 km/h (3.89 m/s) | N/A | 60s (khóa/mở xe) | 0 VND | **0** |
| **Xe buýt điện (`electric_bus`)** | 20.0 km/h (5.56 m/s) | N/A | 480s (8p chờ bến) | 8,000 VND / vé đồng giá | **25** |
| **Xe buýt thường (`public_bus`)** | 18.0 km/h (5.00 m/s) | 35.0 km/h | 600s (10p chờ bến) | 8,000 - 35,000 VND | **42** |
| **Tàu hỏa ĐN - Huế (`train`)** | N/A | ~38 km/h (10.56 m/s) | 1,500s (25p làm thủ tục) | 95,000 VND / vé ngồi mềm | **35** |
| **Xe khách / Limousine (`tourist_coach`)** | N/A | ~50 km/h (13.89 m/s) | 900s (15p đón khách) | 140,000 VND / vé | **45** |
| **Xe máy (`motorcycle`)** | 28.0 km/h (7.78 m/s) | 42.0 km/h (11.67 m/s) | 120s (gửi xe/mũ bảo hiểm) | ~700 VND/km (xăng + hao mòn) | **72** |
| **Taxi / Ô tô công nghệ (`taxi_car`)** | 30.0 km/h (8.33 m/s) | 55.0 km/h (15.28 m/s) | 300s (5p gọi & đón) | 11k mở cửa + 14.5k/km; package liên tỉnh 280k/người | **171** |
| **Ô tô riêng / Đi chung (`private_car`)** | 30.0 km/h (8.33 m/s) | 55.0 km/h (15.28 m/s) | 180s | Xăng + phí hầm Hải Vân (110k/xe) chia 2 pax | **114** |

---

## 5. THIẾT KẾ KIẾN TRÚC & CÁC THAY ĐỔI MÃ NGUỒN

### 5.1. Backend
1. **`backend/app/itineraries/transport_service.py` (Mới tạo)**:
   - Chứa toàn bộ logic nghiệp vụ: `evaluate_segment_transport_options`, `compute_estimated_cost_vnd`, `check_feasibility`.
   - Phân loại kết quả đề xuất thành 3 nhóm nổi bật: `best_match` (Phù hợp nhất), `eco_friendly` (Xanh nhất), `cost_saving` (Tiết kiệm chi phí nhất).
   - Đánh dấu cờ `is_verified_schedule = True` cho Tàu hỏa (lịch cố định Đường sắt Việt Nam) và `is_verified_schedule = False` cho xe khách/taxi (ước tính theo lưu lượng giao thông).
2. **`backend/app/itineraries/schemas.py`**:
   - Khai báo schema chuẩn Pydantic: `TransportModeOption`, `RouteSegment`, `UpdateSegmentTransportRequest`.
   - Mở rộng `DayRouteResponse` với 4 trường: `segments: list[RouteSegment]`, `day_total_cost_vnd: float`, `day_total_carbon_kg: float`, `priority_profile: str`.
3. **`backend/app/itineraries/service.py`**:
   - Thêm hàm `build_day_segments(stops, profile, custom_modes)`: Tính toán khoảng cách từng chặng, phát hiện hành lang liên tỉnh, chấm điểm các phương tiện và tính tổng chi phí / carbon cả ngày.
   - Cập nhật `get_itinerary_day_route` để tích hợp `build_day_segments`.
4. **`backend/app/itineraries/router.py`**:
   - Thêm query parameter `profile` vào `GET /{itinerary_id}/days/{day_number}/route`.
   - Thêm endpoint mới `POST /{itinerary_id}/days/{day_number}/segment-transport` cho phép người dùng đổi phương tiện của từng chặng.
   - Cập nhật `POST /itineraries/compute` tính toán đề xuất phương tiện cho mọi danh sách điểm dừng tự do.
5. **`backend/app/tools/schemas.py` & `implementations.py` & `registry.py`**:
   - Mở rộng tool `get_route_information` trả về phân tích phương tiện và tóm tắt đề xuất.
   - Bổ sung tool chuyên biệt `recommend_transport_mode` vào Tool Registry.
   - Hỗ trợ đổi phương tiện từng chặng qua `update_itinerary`.

### 5.2. Frontend
1. **`frontend/src/services/itineraryService.ts`**:
   - Thêm TypeScript interface `TransportModeOption`, `RouteSegment`.
   - Mở rộng `DayRouteResponse` tương thích 100% với backend.
   - Cập nhật hàm `fetchDayRoute` hỗ trợ tham số `priorityProfile`.
   - Thêm hàm API `updateSegmentTransport(itineraryId, dayNumber, segmentIndex, selectedMode, priorityProfile)`.
2. **`frontend/src/components/planner/ItineraryRouteMap.tsx`**:
   - Hiển thị thanh tóm tắt **Chi phí đi lại cả ngày (~VND)** và **Tổng phát thải carbon (kg CO2)** trên đầu danh sách điểm dừng.
   - Giữa mỗi cặp điểm dừng $i \to i+1$, hiển thị **Segment Transition Pill** chứa icon phương tiện đã chọn, tên phương tiện, cự ly, thời gian và chi phí, kèm nút **"Đổi phương tiện"**.
   - Thêm **Segment Comparison Modal**: Giao diện pop-up hiện đại cho phép so sánh trực quan các phương tiện ứng viên, huy hiệu phân loại (`Phù hợp nhất`, `Xanh nhất`, `Tiết kiệm`, `Đã xác thực`) và nút kích hoạt thay đổi phương tiện tức thì.
   - Tích hợp cơ chế **Optimistic Update**: Khi đổi phương tiện, frontend cập nhật giao diện và tính toán lại tổng chi phí & carbon ngay lập tức, đem lại trải nghiệm mượt mà không có độ trễ.

---

## 6. BẰNG CHỨNG KIỂM THỬ TOÀN DIỆN (TEST SUITE VERIFICATION)

### 6.1. Backend Automated Tests (20/20 PASSED)

Toàn bộ 20 bài kiểm thử tại [backend/tests/test_transport_mode_recommendation.py](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/tests/test_transport_mode_recommendation.py) đã thực thi thành công:

```text
backend/tests/test_transport_mode_recommendation.py::test_short_urban_segment_walking PASSED [  5%]
backend/tests/test_transport_mode_recommendation.py::test_medium_urban_segment_motorcycle_bus PASSED [ 10%]
backend/tests/test_transport_mode_recommendation.py::test_intercity_danang_hue_corridor PASSED [ 15%]
backend/tests/test_transport_mode_recommendation.py::test_feasibility_boundary_walking_rejected PASSED [ 20%]
backend/tests/test_transport_mode_recommendation.py::test_feasibility_boundary_train_only_intercity PASSED [ 25%]
backend/tests/test_transport_mode_recommendation.py::test_profile_eco_priority PASSED [ 30%]
backend/tests/test_transport_mode_recommendation.py::test_profile_budget_constrained PASSED [ 35%]
backend/tests/test_transport_mode_recommendation.py::test_profile_balanced PASSED [ 40%]
backend/tests/test_transport_mode_recommendation.py::test_multi_criteria_scoring_normalization PASSED [ 45%]
backend/tests/test_transport_mode_recommendation.py::test_day_route_endpoint_with_segments PASSED [ 50%]
backend/tests/test_transport_mode_recommendation.py::test_segment_transport_switch_recalculation PASSED [ 55%]
backend/tests/test_transport_mode_recommendation.py::test_compute_route_with_transport_recommendations PASSED [ 60%]
backend/tests/test_transport_mode_recommendation.py::test_osrm_active_vs_haversine_fallback PASSED [ 65%]
backend/tests/test_transport_mode_recommendation.py::test_tool_get_route_information_enhancement PASSED [ 70%]
backend/tests/test_transport_mode_recommendation.py::test_tool_recommend_transport_mode PASSED [ 75%]
backend/tests/test_transport_mode_recommendation.py::test_tool_update_itinerary_segment_mode PASSED [ 80%]
backend/tests/test_transport_mode_recommendation.py::test_unverified_schedule_and_estimated_cost_flags PASSED [ 85%]
backend/tests/test_transport_mode_recommendation.py::test_single_stop_or_empty_stops_day PASSED [ 90%]
backend/tests/test_transport_mode_recommendation.py::test_speed_and_fixed_buffer_calculations PASSED [ 95%]
backend/tests/test_transport_mode_recommendation.py::test_no_hallucinated_booking_in_tool_output PASSED [100%]

======================= 20 passed, 1 warning in 20.32s ========================
```

### 6.2. Route API & Tool Regression Tests (49/49 PASSED)

- `test_itinerary_route_api.py` (15/15 passed): Đảm bảo các route endpoints hiện có không bị hồi quy.
- `test_tool_calling.py` (14/14 passed): Đảm bảo toàn bộ 11 tools trong Tool Registry gọi hàm an toàn và chuẩn schema Gemini.

### 6.3. Frontend Verification (75/75 PASSED & 0 TypeScript Error)

```text
> npm run typecheck --prefix frontend
> tsc --noEmit -p tsconfig.app.json (PASSED, 0 errors)

> npm run test:unit --prefix frontend
ℹ tests 75
ℹ suites 0
ℹ pass 75
ℹ fail 0
ℹ duration_ms 9692.24ms
```

---

## 7. MINH BẠCH GIỚI HẠN & DỮ LIỆU ĐƯỢC XÁC THỰC (LIMITATIONS & DATA PROVENANCE)

1. **Hệ số phát thải carbon**: Dựa trên báo cáo chuyển đổi UK DEFRA 2023 kết hợp hiệu chỉnh đặc thù đội xe tại Việt Nam (xe máy phổ thông 110-150cc trung bình 72 $g/\text{km}$, xe buýt điện VinBus/Đà Nẵng trung bình 25 $g/\text{p-km}$). Đây là hệ số ước tính theo mô hình phân tích vòng đời, không phải thiết bị đo thời gian thực trên ống xả.
2. **Chi phí di chuyển**: Chi phí nhiên liệu xe máy và vé xe buýt là giá thực tế niêm yết tại Đà Nẵng (8.000 đ/lượt buýt, xăng A95 ~24.000 đ/lít). Chi phí taxi và thuê xe liên tỉnh là mức giá tham khảo theo biểu giá tour phổ biến 2024.
3. **Lịch trình tàu hỏa**: Tàu hỏa Đà Nẵng - Huế mang cờ `is_verified_schedule = True` vì vận hành theo khung giờ biểu cố định của Tổng công ty Đường sắt Việt Nam. Các phương tiện xe khách, taxi mang cờ `is_verified_schedule = False` do thời gian di chuyển biến động theo lưu lượng giao thông thực tế.
4. **Không bịa đặt hành vi đặt chỗ (No Booking Hallucination)**: Hệ thống hoàn toàn minh bạch rằng đây là **công cụ đề xuất và ước tính tối ưu hóa du lịch xanh**, tuyệt đối không đưa ra các câu nói giả định như "đã đặt vé thành công" hay dẫn link thanh toán không có thực.

---

## 8. HƯỚNG DẪN DÀNH CHO THÀNH VIÊN NHÓM (DEVELOPER INTEGRATION GUIDE)

### Cách gọi API lấy danh sách chặng và phương tiện từ Frontend:
```typescript
import { fetchDayRoute, updateSegmentTransport } from '@/services/itineraryService';

// 1. Lấy tuyến đường kèm đề xuất phương tiện từng chặng
const dayRoute = await fetchDayRoute('sample-danang-hue-3d', 1, undefined, 'balanced');
console.log('Tổng chi phí đi lại:', dayRoute.day_total_cost_vnd);
console.log('Tổng phát thải carbon:', dayRoute.day_total_carbon_kg);
console.log('Các chặng di chuyển:', dayRoute.segments);

// 2. Chuyển đổi phương tiện cho chặng 0 sang 'electric_bus'
const updatedRoute = await updateSegmentTransport(
  'sample-danang-hue-3d',
  1,
  0,
  'electric_bus',
  'balanced'
);
```

### Cách gọi Tool từ Chatbot / Python:
```python
from app.tools.registry import get_default_tool_registry

registry = get_default_tool_registry()

# Gọi tool gợi ý phương tiện di chuyển
result = registry.execute_tool(
    name="recommend_transport_mode",
    arguments={
        "origin_lat": 16.0611,
        "origin_lng": 108.2270,
        "dest_lat": 16.4699,
        "dest_lng": 107.5779,
        "priority_profile": "eco_priority",
    }
)
print(result["recommended_mode"]) # 'train'
print(result["recommendation_summary"])
```

---

## 9. KẾT LUẬN & SẴN SÀNG BẢO VỆ ĐỒ ÁN (CAPSTONE DEFENSE READINESS)

Tính năng **Đề xuất tuyến đường kết hợp đề xuất phương tiện di chuyển đa tiêu chí cho GreenTrip** đã được hoàn thiện trọn vẹn, giải quyết triệt để bài toán:
- Tối ưu hóa du lịch xanh đa mục tiêu ở cấp độ vi mô (từng chặng di chuyển) thay vì chỉ ở cấp vĩ mô.
- Tôn vinh các phương tiện xanh và di sản đặc thù của miền Trung như **Tuyến đường sắt di sản Đà Nẵng - Huế** và **Xe buýt điện nội đô**.
- Tuân thủ nghiêm ngặt quy tắc dự án: Không tạo branch mới, không commit, bảo toàn working tree, 0 lỗi TypeScript, 100% test passing.
- Đồ án sẵn sàng cho các kịch bản demo và bảo vệ trước hội đồng chuyên môn.
