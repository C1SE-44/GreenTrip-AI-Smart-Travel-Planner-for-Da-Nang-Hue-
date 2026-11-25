# BÁO CÁO KIỂM THỬ CHUYÊN SÂU & RÀ SOÁT LỖI (BUG HUNTING & QA AUDIT REPORT)
## Chức Năng: Đề Xuất Tuyến Đường Kết Hợp Đề Xuất Phương Tiện Di Chuyển (Transport Mode Recommendation)

> **Dự án**: GreenTrip – A Multi-Objective Green Tourism Itinerary Optimizer for Central Vietnam  
> **Phiên bản kiểm toán**: Sprint 2.9+ / Post-Integration Audit  
> **Nhánh thực hiện**: `develop`  
> **Trạng thái Working Tree**: Sạch (Read-Only Audit, bảo toàn 100% mã nguồn hiện tại)  
> **Người thực hiện**: Senior QA Engineer / Technical Auditor  

---

## 1. TỔNG QUAN KẾT QUẢ KIỂM THỬ

Hệ thống đề xuất tuyến đường và phương tiện di chuyển đa tiêu chí (Multi-Criteria Decision Analysis - MCDA) đã được tích hợp thành công trên 4 tầng kiến trúc:
1. **Core Transport Engine**: [transport_service.py](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/transport_service.py) (Đánh giá trọng số Green vs Cost vs Speed, lọc theo khoảng cách, ngân sách, hồ sơ sinh thái).
2. **Routing & OSRM Engine**: [routing_service.py](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/routing_service.py) (Tính toán Polyline, OSRM driving/fallback, qua Đèo Hải Vân / Lăng Cô corridor).
3. **API & DB Router**: [router.py](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/router.py) (`GET /days/{day}/route`, `POST /days/{day}/segment-transport`, `POST /recommend-transport-mode`).
4. **AI Chatbot & Frontend UI**: [implementations.py](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/tools/implementations.py), [ItineraryRouteMap.tsx](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/frontend/src/components/planner/ItineraryRouteMap.tsx).

### Số liệu kiểm thử tự động (Execution Metrics)
- **Backend Tests Collected**: 55 tests
  - `backend/tests/test_transport_mode_recommendation.py`: 20/20 PASSED
  - `backend/tests/test_transport_deep_qa.py`: 19/19 PASSED
  - `backend/tests/test_itinerary_route_api.py`: 16/16 PASSED
- **Backend Tests Executed**: 55 tests
- **Backend Tests Passed**: 55 tests (100%)
- **Backend Tests Failed / Skipped**: 0 tests
- **Frontend Unit Tests Executed & Passed**: 75/75 tests (100%)
- **TypeScript Typecheck**: 0 errors
- **Tổng số lỗi / điểm bất thường phát hiện qua Audit mã nguồn**: 8 vấn đề (2 High - P1, 3 Medium - P2, 3 Low - P3).

---

## 2. DANH SÁCH CHI TIẾT CÁC LỖI & ĐIỂM BẤT THƯỜNG PHÁT HIỆN ĐƯỢC

### 🔴 [BUG-01] [High - P1] Hệ số phát thải Carbon không đồng nhất giữa Chatbot Tool, Routing Engine và Frontend
- **Vị trí file & dòng**:
  - [backend/app/trips/itinerary_constraints.py:34](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/trips/itinerary_constraints.py#L34): Motorbike = `72 g/km`, Driving = `171 g/km`, Transit = `40 g/km`.
  - [backend/app/tools/implementations.py:340](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/tools/implementations.py#L340): Motorbike = `0.085 kg/km` (`85 g/km`), Car = `0.170 kg/km`, Electric Bus = `0.025 kg/km`.
  - [backend/app/itineraries/transport_service.py:37-47](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/transport_service.py#L37-L47): Motorcycle = `72 g/p-km`, Taxi = `171 g/p-km`, Private Car = `114 g/p-km` (chia 1.5 người), Public Bus = `42 g/p-km`, Electric Bus = `25 g/p-km`, Train = `35 g/p-km`.
  - [frontend/src/services/itineraryService.ts:1432](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/frontend/src/services/itineraryService.ts#L1432): Driving = `171 g/km`, Motorcycle = `72 g/km`, Transit = `40 g/km`.
- **Mô tả & Ảnh hưởng**:
  - Khi người dùng hỏi Chatbot (`get_carbon_estimate`), xe máy được tính là $85\text{ g/km}$. Nhưng khi xem trên bản đồ tuyến đường hoặc gọi API `recommend_transport_mode`, xe máy chỉ thải $72\text{ g/km}$. Độ lệch là $18.1\%$.
  - Ô tô cá nhân (`private_car`) trong `transport_service` được chia hệ số tải $1.5$ người ($114\text{ g/km}$), trong khi các module khác tính $171\text{ g/km}$.
- **Nguyên nhân**: Các hằng số phát thải được khai báo độc lập ở 4 file khác nhau mà không có một module cấu hình dùng chung (Single Source of Truth).
- **Phương án giải quyết đề xuất**:
  - Tạo file `backend/app/config/emission_factors.py` chuẩn hóa toàn bộ hệ số theo báo cáo CO2 trung bình tại Việt Nam (tham chiếu DEFRA / Bộ GTVT).
  - Yêu cầu `itinerary_constraints.py`, `implementations.py`, `transport_service.py` và API export cho frontend import trực tiếp từ file này.

---

### 🔴 [BUG-02] [High - P1] Lệch tổng thời gian ngày (`DayRouteResponse.duration_seconds`) so với tổng thời gian các chặng (`sum(seg.duration_seconds)`)
- **Vị trí file & dòng**:
  - [backend/app/itineraries/transport_service.py:284](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/transport_service.py#L284)
  - [backend/app/itineraries/routing_service.py:101-143](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/routing_service.py#L101-L143)
- **Mô tả & Ảnh hưởng**:
  - `DayRouteResponse.duration_seconds` do OSRM hoặc Fallback Router trả về chỉ tính **thời gian lăn bánh thuần túy** (pure driving time, ví dụ 1,105 giây $\approx 18.4$ phút).
  - Tuy nhiên, trong từng `RouteSegment`, `duration_seconds` lại cộng thêm `fixed_buffer_sec` (thời gian chờ xe, gửi xe, đón trả: Bus +480s, Taxi +300s, Xe máy +120s, Tàu hỏa +900s).
  - Dẫn đến việc trên Frontend: Tổng thời gian hiển thị ở thanh Header ngày là $18$ phút, nhưng cộng nhẩm 3 chặng bên dưới lại ra $42$ phút. Người dùng hoặc giám khảo sẽ nhận thấy sự mâu thuẫn này.
- **Nguyên nhân**: Không phân tách rõ ràng giữa `pure_transit_duration_seconds` và `door_to_door_duration_seconds` (gồm buffer chuyển tiếp).
- **Phương án giải quyết đề xuất**:
  - Bổ sung vào schema `DayRouteResponse`:
    - `transit_duration_seconds`: Thời gian di chuyển thực tế trên đường.
    - `total_trip_duration_seconds`: Tổng thời gian bao gồm thời gian chờ/chuẩn bị phương tiện (`sum(seg.duration_seconds)`).
  - Frontend hiển thị rõ: "Thời gian di chuyển: 18 phút (Dự kiến gồm chờ/chuyển tiếp: 42 phút)".

---

### 🟡 [BUG-03] [Medium - P2] Khoảng cách chặng tính bằng Detour Factor xấp xỉ bị lệch nhẹ so với tổng khoảng cách OSRM
- **Vị trí file & dòng**:
  - [backend/app/itineraries/service.py:53-56](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/service.py#L53-L56)
- **Mô tả & Ảnh hưởng**:
  - Khi OSRM tính thành công toàn bộ tuyến đường nhiều điểm dừng trong ngày, OSRM trả về tổng `distance_meters` chính xác theo mạng lưới đường bộ thực tế (ví dụ: $15,400\text{ m}$).
  - Nhưng trong `build_day_segments()`, hàm lại tính khoảng cách từng chặng con bằng công thức Haversine nhân với hệ số detour cố định ($1.25$ nội đô hoặc $1.35$ liên tỉnh): `seg_dist_m = haversine(...) * 1.25`.
  - Tổng của `seg[0].distance_meters + seg[1].distance_meters + ...` thường chênh lệch khoảng $3\% - 8\%$ so với tổng `route.distance_meters`.
- **Nguyên nhân**: OSRM API trả về mảng `legs[]` chứa khoảng cách chính xác của từng chặng, nhưng code hiện tại chỉ lấy tổng và polyline gộp mà chưa map ngược `legs[i].distance` vào từng chặng con tương ứng.
- **Phương án giải quyết đề xuất**:
  - Cập nhật `build_day_segments(day_stops, route_legs=None)`: Nếu có `legs` từ OSRM, gán trực tiếp `distance_meters = legs[i].distance`. Chỉ dùng Haversine x $1.25$ khi OSRM gặp sự cố và phải kích hoạt fallback.

---

### 🟡 [BUG-04] [Medium - P2] Lựa chọn đổi phương tiện trên chặng (`POST /segment-transport`) chưa được lưu bền vững vào Database
- **Vị trí file & dòng**:
  - [backend/app/itineraries/router.py:110-128](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/router.py#L110-L128)
  - [backend/app/itineraries/service.py:108-142](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/service.py#L108-L142)
- **Mô tả & Ảnh hưởng**:
  - Người dùng có thể bấm đổi phương tiện của từng chặng trên giao diện (ví dụ Chặng 1 đổi sang Xe buýt điện, Chặng 2 đổi sang Taxi). API tính lại carbon, chi phí và thời gian ngay lập tức và trả về rất mượt mà.
  - Tuy nhiên, API này chỉ tính toán trên RAM/request (`on-the-fly`) và trả về kết quả cho Frontend, chứ **không ghi đè lựa chọn này vào Database** (`itinerary_day_stops` hoặc bảng lưu `custom_modes`).
  - Hậu quả: Nếu người dùng F5 tải lại trang, hoặc đăng nhập trên thiết bị khác, hoặc xuất lịch trình ra file PDF, phương tiện của chặng đó sẽ bị reset về phương tiện mặc định mà thuật toán đề xuất ban đầu.
- **Nguyên nhân**: Bảng `itinerary_day_stops` hiện tại trong DB chỉ lưu thông tin địa điểm (`poi_id`, `stop_order`, `arrival_time`, `note`) chứ chưa có cột `transport_mode` hoặc metadata chặng.
- **Phương án giải quyết đề xuất**:
  - *Giải pháp nhanh (Frontend/Session)*: Lưu `customModesMap` vào `localStorage` theo `itinerary_id` để khi F5 không bị mất.
  - *Giải pháp triệt để (Backend DB)*: Thêm cột `transport_mode VARCHAR(50)` hoặc `metadata JSONB` vào bảng `itinerary_day_stops` để lưu phương tiện di chuyển từ điểm dừng trước tới điểm dừng hiện tại.

---

### 🟡 [BUG-05] [Medium - P2] Chatbot nhận diện câu lệnh đổi phương tiện chặng nhưng không lưu vào cấu trúc Outline của Itinerary
- **Vị trí file & dòng**:
  - [backend/app/tools/implementations.py:1044-1052](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/tools/implementations.py#L1044-L1052)
- **Mô tả & Ảnh hưởng**:
  - Công cụ `update_itinerary` của Chatbot có regex bắt các câu như *"đổi chặng 1 sang xe máy"*, *"chuyển chặng 2 đi xe buýt"* và trả về câu thông báo *"Đã cập nhật phương tiện chặng 1 thành xe máy"*.
  - Tuy nhiên, object `updated_itinerary` trả về chỉ bao gồm danh sách các điểm dừng (`stops: []`), không có trường `segments` hay `transport_mode` gắn vào stop. Khi Chatbot đồng bộ dữ liệu với giao diện Planner, bản đồ không tự động cập nhật lại màu polyline của chặng đó.
- **Nguyên nhân**: Cấu trúc dữ liệu lịch trình của Chatbot (`ItineraryDayOutline`) được thiết kế ở Sprint trước khi có khái niệm `Segment-level Transport`.
- **Phương án giải quyết đề xuất**:
  - Bổ sung trường `transport_mode` vào từng phần tử của `stops` trong schema lịch trình của Chatbot để map đồng bộ với API Route.

---

### 🟢 [BUG-06] [Low - P3] Giá vé xe buýt và tàu hỏa đang áp dụng mức cố định (Flat-rate) bất kể độ dài chặng
- **Vị trí file & dòng**:
  - [backend/app/itineraries/transport_service.py:122-148](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/transport_service.py#L122-L148)
- **Mô tả & Ảnh hưởng**:
  - Vé tàu hỏa tuyến Đà Nẵng – Huế được gán cứng là `95,000 VND` (giá vé tham khảo ghế mềm điều hòa tàu SE/HD).
  - Vé xe buýt điện / liên tỉnh được gán cứng là `8,000 VND` hoặc `30,000 VND`.
  - Nếu hành khách đi các ga trung gian (như Ga Lăng Cô) hoặc chọn khoang nằm mềm (~150,000 - 180,000 VND), giá thực tế sẽ khác.
- **Nguyên nhân**: Hệ thống chưa tích hợp API bán vé thời gian thực của Đường sắt Việt Nam (dsvn.vn) hay VinBus.
- **Phương án giải quyết đề xuất**:
  - Giữ nguyên công thức nhưng bổ sung chú thích rõ ràng trên UI: *"Giá vé tham khảo tiêu chuẩn; giá thực tế có thể thay đổi tùy hạng vé và thời điểm đặt"*.

---

### 🟢 [BUG-07] [Low - P3] Ngưỡng khả thi của phương thức Đi bộ bị cắt đột ngột (Hard Cliff) tại mốc 3.0 km
- **Vị trí file & dòng**:
  - [backend/app/itineraries/transport_service.py:159-161](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/transport_service.py#L159-L161)
- **Mô tả & Ảnh hưởng**:
  - Ở cự ly $2.99\text{ km}$, Đi bộ được coi là khả thi và có thể đạt điểm đánh giá cao nếu người dùng chọn Eco-friendly ($Score \approx 75$).
  - Nhưng chỉ cần sang $3.01\text{ km}$, hàm `check_feasibility()` trả về `False` ngay lập tức, khiến điểm số bị phạt tụt xuống đáy ($Score = 10.0$).
- **Nguyên nhân**: Sử dụng bước nhảy cứng `if dist_km > 3.0: return False`.
- **Phương án giải quyết đề xuất**:
  - Áp dụng hàm suy giảm tuyến tính (linear decay) hoặc sigmoid từ $2.5\text{ km}$ đến $3.5\text{ km}$ thay vì ngắt đột ngột.

---

### 🟢 [BUG-08] [Low - P3] Bất nhất nhẹ về ngưỡng khoảng cách xác định hành lang liên tỉnh (40 km vs 45 km)
- **Vị trí file & dòng**:
  - [backend/app/itineraries/service.py:55](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/service.py#L55): `h_dist > 45000.0` (45 km).
  - [backend/app/itineraries/transport_service.py:158](file:///d:/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/itineraries/transport_service.py#L158): `dist_km > 40.0` (40 km).
- **Mô tả & Ảnh hưởng**:
  - Một chặng có khoảng cách $42\text{ km}$ nằm ngoài danh sách tọa độ Đà Nẵng - Huế sẽ bị `service.py` coi là nội đô (vì $< 45\text{ km}$), nhưng `transport_service.py` lại đánh giá các phương tiện theo tiêu chí liên tỉnh (vì $> 40\text{ km}$).
- **Nguyên nhân**: Định nghĩa hằng số ngưỡng khoảng cách liên tỉnh độc lập ở hai file.
- **Phương án giải quyết đề xuất**:
  - Thống nhất một hằng số chung `INTERCITY_DISTANCE_THRESHOLD_METERS = 40000.0` ($40\text{ km}$).

---

## 3. ĐÁNH GIÁ TỔNG QUAN VÀ KẾT LUẬN NGHIỆM THU (ACCEPTANCE VERDICT)

| Tiêu chuẩn đánh giá | Kết quả | Ghi chú |
| :--- | :---: | :--- |
| **Tính ổn định & Chống Crash (Reliability)** | **ĐẠT (100%)** | Toàn bộ 55 backend tests và 75 frontend tests pass 100%. Fallback OSRM và lỗi mạng được bắt try/except đầy đủ. |
| **Thuật toán Đề xuất (MCDA Logic)** | **ĐẠT (Tốt)** | Phân biệt chính xác nội đô vs liên tỉnh Đèo Hải Vân, phản hồi chuẩn theo 3 trọng số Eco/Cost/Speed. |
| **Tính Nhất quán Số liệu (Data Consistency)** | **CẦN ĐỒNG BỘ** | Lệch $18\%$ hệ số carbon xe máy giữa Chatbot và Route; Lệch tổng thời gian do cộng buffer chặng (P1). |
| **Khả năng Lưu trữ & Đồng bộ (Persistence)** | **HẠN CHẾ** | Đổi phương tiện chặng hoạt động tốt on-the-fly nhưng chưa persist DB khi reload trang (P2). |

### KẾT LUẬN CHÍNH THỨC:
### ⭐️ **READY WITH KNOWN LIMITATIONS** (SẴN SÀNG DEMO VỚI CÁC GIỚI HẠN ĐÃ ĐỊNH DANH)

- **Đánh giá bảo vệ đồ án**: Chức năng hoàn toàn đủ điều kiện để demo trực tiếp trong buổi bảo vệ. Giao diện bản đồ vẽ polyline mượt mà, phân loại màu theo phương tiện trực quan, đổi phương tiện chặng phản hồi tức thì, Chatbot gọi tool mượt mà.
- **Các phương án giải quyết**: Đã được chuẩn bị chi tiết để trao đổi với nhóm và hội đồng.
