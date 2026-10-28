# PB07 - Trip Parameters Form: Wireframe Design & API Contract

> **Người thực hiện**: Bách  
> **Tính năng**: PB07 - Trip Parameters Form (Điểm đến, Số ngày, Ngân sách, Số người & Sở thích)  
> **Phạm vi**: GreenTrip AI - Smart Travel Planner for Da Nang – Hue

---

## 1. Mục Tiêu & User Story

* **User Story**:
  > *"Là một du khách lên kế hoạch đi Đà Nẵng – Huế, tôi muốn nhập điểm đến, số ngày dự kiến và ngân sách chuyến đi để hệ thống AI tính toán tính khả thi, phân bổ chi phí thông minh và chuẩn bị dữ liệu tạo lịch trình tối ưu."*

* **Phạm vi công việc (Tasks hoàn thành)**:
  - **2.1 [PB07]**: Bản thiết kế Wireframe (Layout & UI/UX Specs) theo Design System.
  - **2.2 [PB07]**: Xây dựng giao diện Frontend (Form nhập liệu Số ngày, Ngân sách, Điểm đến, Du khách, Sở thích).
  - **2.3 [PB07]**: Lập trình Backend Pydantic validation & nghiệp vụ kiểm tra tính khả thi của ngân sách.
  - **2.4 [PB07]**: Tích hợp Frontend form với API Backend (`POST /trips/validate-parameters`).
  - **2.5 [PB07]**: Viết trọn bộ Unit Test kiểm thử API validation với 13 kịch bản kiểm thử.

---

## 2. Bản Thiết Kế Wireframe (Figma Layout Blueprint)

### 2.1. Sơ đồ Wireframe Desktop & Mobile

```text
+-----------------------------------------------------------------------------------+
|  [Logo GreenTrip.]       Khám Phá     Lập Lịch Trình (Active)    Chuyến Đi       |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|                   🌿 GreenTrip AI • Trợ Lý Du Lịch Thông Minh                    |
|             LẬP KẾ HOẠCH CHUYẾN ĐI ĐÀ NẴNG & CỐ ĐÔ HUẾ                            |
|             Tự động tính toán ngân sách, tối ưu thời gian & di chuyển xanh        |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   |  🌿 PB07 • Smart Trip Parameters Form                                     |   |
|   |  THIẾT LẬP THÔNG SỐ CHUYẾN ĐI                                             |   |
|   |                                                                           |   |
|   |  📍 1. Chọn Điểm Đến Du Lịch                                              |   |
|   |  +--------------------+  +--------------------+  +--------------------+   |   |
|   |  | [Ảnh Đà Nẵng]   ✓  |  | [Ảnh Cố đô Huế]    |  | [Ảnh ĐN & Huế]     |   |   |
|   |  | Đà Nẵng            |  | Huế                |  | Cả Đà Nẵng & Huế   |   |   |
|   |  | Biển & Nghỉ dưỡng  |  | Di sản & Văn hóa   |  | Hành trình Eco     |   |   |
|   |  +--------------------+  +--------------------+  +--------------------+   |   |
|   |                                                                           |   |
|   |  📅 2. Thời Lượng Chuyến Đi (Số Ngày)                                      |   |
|   |     [- ]  [ 3 ngày ]  [ +]      Gợi ý nhanh: [1N] [2N] [3N★] [4N] [5N]... |   |
|   |     Ngày bắt đầu: [ 2026-11-01 ]  --> Ngày kết thúc dự kiến: [2026-11-03] |   |
|   |                                                                           |   |
|   |  👥 3. Số Lượng Du Khách                                                  |   |
|   |     [- ]  [ 2 người ]  [ +]     (Cặp đôi / Bạn bè)                        |   |
|   |                                                                           |   |
|   |  💰 4. Tổng Ngân Sách Dự Kiến (VNĐ)                                       |   |
|   |     Ô nhập tiền: [ 6.000.000 ₫ ]                                          |   |
|   |     Thanh trượt: [================o-----------------------]               |   |
|   |     500.000 ₫                   6.000.000 ₫                 30.000.000 ₫  |   |
|   |     Trung bình: 1.000.000 ₫ / người / ngày  |  Tùy chọn: [Tiết kiệm][Cân bằng]|
|   |                                                                           |   |
|   |  🧭 5. Sở Thích & Phong Cách Du Lịch (Chips)                              |   |
|   |     [✓ 🏛️ Văn hóa]  [✓ 🍲 Ẩm thực]  [✓ 🌿 Du lịch Xanh]  [🏖️ Biển]...      |   |
|   |                                                                           |   |
|   |  +---------------------------------------------------------------------+  |   |
|   |  |   ✨ XÁC NHẬN & KIỂM TRA THÔNG SỐ CHUYẾN ĐI  -> (Primary Button)     |  |   |
|   |  +---------------------------------------------------------------------+  |   |
|   +---------------------------------------------------------------------------+   |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   |  ✓ KẾT QUẢ XÁC THỰC THÀNH CÔNG (AI Cost Allocation)                      |   |
|   |  - Điểm đến: Đà Nẵng | Thời lượng: 3 ngày • 2 người | Phân khúc: Cân bằng  |   |
|   |  - Phân bổ ngân sách:                                                     |   |
|   |    [ Lưu trú 35% ]  [ Ẩm thực 30% ]  [ Đi lại 20% ]  [ Hoạt động 15% ]    |   |
|   |  - Khuyến nghị GreenTrip:                                                 |   |
|   |    • Đà Nẵng: Nên đón bình minh tại Bán đảo Sơn Trà & tắm biển Mỹ Khê...  |   |
|   |    • Du lịch Xanh: Khuyến khích thuê xe điện / xe đạp nội đô...           |   |
|   +---------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------+
```

### 2.2. Quy Chuẩn Thiết Kế Tuân Thủ DESIGN_SYSTEM.md

| Yếu tố | Quy chuẩn | Mô tả ứng dụng trên Form |
| :--- | :--- | :--- |
| **Màu chính (Primary)** | `#1F8A5B` (Forest Green) | Nút bấm xác nhận chính, thẻ radio đang chọn, thanh slider. |
| **Màu nền (Background)** | `#FCFAF5` (Cream) | Màu nền tổng thể trang PlannerPage. |
| **Màu thẻ (Card)** | `#FFFFFF` (Ivory White) | Thẻ form nhập liệu và thẻ kết quả phân bổ ngân sách. |
| **Bo góc (Border Radius)** | `rounded-3xl` (24px) / `rounded-xl` (12px) | Khối Form ngoài bo lớn `24px`, các ô Stepper và Input bo `12px`. |
| **Slider & Ô nhập ngân sách** | **Quy tắc 4** | Thanh trượt kéo thả đồng bộ 2 chiều với ô nhập số tiền. Tự động định dạng bằng `toLocaleString('vi-VN')` (ví dụ `6.000.000 ₫`) ngay khi người dùng gõ để tránh gõ thừa/thiếu số 0. |
| **Phơi bày lựa chọn** | **Quy tắc 5** | Điểm đến hiển thị dưới dạng 3 Cards trực quan kèm hình ảnh và badge. |
| **Token Chips** | **Quy tắc 9** | Danh sách sở thích dạng thẻ bo tròn (`rounded-full`) có icon sinh động. |
| **Duy nhất 1 Nút chính & Loading** | **Quy tắc 15 & 17** | Nút CTA duy nhất "Xác Nhận & Kiểm Tra Thông Số Chuyến Đi" tích hợp biểu tượng Loading Spinner (`Loader2`), disable trạng thái và chặn click lặp nhiều lần (debounce/guard). |

> **Figma Link dự án**: Đã phản ánh đầy đủ trên giao diện code mẫu tại `frontend/src/components/planner/TripParametersForm.tsx` và `frontend/src/pages/PlannerPage.tsx`.

---

## 3. Backend API Contract (`POST /trips/validate-parameters`)

### 3.1. Thông Tin Endpoint
* **URL**: `http://localhost:8000/trips/validate-parameters`
* **Method**: `POST`
* **Content-Type**: `application/json`

### 3.2. Request Payload Body
```json
{
  "destination": "Đà Nẵng",
  "days": 3,
  "total_budget": 6000000.0,
  "num_people": 2,
  "start_date": "2026-11-01",
  "preferences": ["culture", "food", "eco"]
}
```

#### Bảng đặc tả trường dữ liệu & Ràng buộc nghiệp vụ:

| Trường | Kiểu | Bắt buộc | Ràng buộc / Validation Logic |
| :--- | :--- | :---: | :--- |
| `destination` | `string` | **Có** | Chỉ chấp nhận: `Đà Nẵng`, `Huế`, `Đà Nẵng & Huế` (hệ thống tự chuẩn hóa các biến thể tiếng Anh hoặc không dấu). |
| `days` | `integer` | **Có** | Giá trị từ `1` đến `14` ngày. Nếu chọn đi cả 2 thành phố thì tối thiểu `2` ngày. |
| `total_budget` | `float` | **Có** | Lớn hơn 0. Tối thiểu `200.000 VNĐ / người / ngày` (chi phí sàn cho lưu trú và ăn uống). |
| `num_people` | `integer` | Không | Mặc định: `1`. Giới hạn từ `1` đến `20` người. |
| `start_date` | `string \| null` | Không | Định dạng `YYYY-MM-DD`. Không được là ngày trong quá khứ. |
| `preferences` | `list[string]` | Không | Mảng các tag sở thích (`culture`, `food`, `eco`, `beach`, `nature`, `checkin`, v.v.). |

### 3.3. Response Payload (200 OK)
```json
{
  "valid": true,
  "message": "Thông số chuyến đi hợp lệ và sẵn sàng để tạo lịch trình.",
  "data": {
    "destination": "Đà Nẵng",
    "days": 3,
    "num_people": 2,
    "total_budget": 6000000.0,
    "daily_budget_per_person": 1000000.0,
    "budget_tier": "standard",
    "start_date": "2026-11-01",
    "end_date": "2026-11-03",
    "preferences": ["culture", "food", "eco"],
    "cost_breakdown": {
      "accommodation": 2100000.0,
      "food_and_beverage": 1800000.0,
      "transportation": 1200000.0,
      "activities_and_tickets": 900000.0
    },
    "recommendations": [
      "Đà Nẵng: Nên đón bình minh tại Bán đảo Sơn Trà & tắm biển Mỹ Khê; xem Cầu Rồng phun lửa vào cuối tuần.",
      "Hành trình 3 ngày: Thời lượng lý tưởng để cân bằng giữa khám phá di sản và thư giãn.",
      "Phong cách cân bằng: Kết hợp khách sạn tiện nghi 3-4 sao với các trải nghiệm ẩm thực đa dạng.",
      "Du lịch Xanh: GreenTrip khuyến khích sử dụng xe điện hoặc xe đạp nội đô để giảm phát thải carbon.",
      "Sở thích ẩm thực: Danh sách các quán bánh tráng cuốn thịt heo, mì Quảng và bún bò Huế truyền thống đã được ưu tiên."
    ]
  }
}
```

### 3.4. Response Lỗi Nghiệp Vụ (422 Unprocessable Entity)
* Khi ngân sách thấp hơn mức tối thiểu 200.000 VNĐ / người / ngày:
```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body"],
      "msg": "Value error, Ngân sách không đủ cho chuyến đi 3 ngày (2 người). Mức chi tiêu tối thiểu ước tính là 1.200.000 VNĐ (tối thiểu 200.000 VNĐ/người/ngày)."
    }
  ]
}
```

---

## 4. Bảng Kiểm Thử Unit Test (`backend/tests/test_trip_parameters.py`)

Toàn bộ 13 test case kiểm thử tự động đã chạy thành công 100%:

| STT | Tên Test Case | Mục đích kiểm tra | Kết quả |
| :---: | :--- | :--- | :---: |
| 1 | `test_validate_parameters_success_da_nang` | Kiểm tra tạo thông số chuẩn Đà Nẵng 3 ngày | ✅ PASS |
| 2 | `test_validate_parameters_success_hue` | Kiểm tra tạo thông số chuẩn Cố đô Huế 2 ngày | ✅ PASS |
| 3 | `test_validate_parameters_destination_normalization` | Kiểm tra tự chuẩn hóa biến thể tên thành phố | ✅ PASS |
| 4 | `test_validate_parameters_with_future_start_date` | Kiểm tra tự động tính ngày kết thúc từ ngày bắt đầu | ✅ PASS |
| 5 | `test_validate_parameters_budget_tiers` | Kiểm tra phân loại ngân sách (Tiết kiệm, Cân bằng, Cao cấp) | ✅ PASS |
| 6 | `test_validate_parameters_invalid_days_zero_or_negative` | Bắt lỗi số ngày <= 0 | ✅ PASS |
| 7 | `test_validate_parameters_invalid_days_exceed_max` | Bắt lỗi số ngày > 14 ngày | ✅ PASS |
| 8 | `test_validate_parameters_invalid_budget_zero_or_negative` | Bắt lỗi ngân sách <= 0 | ✅ PASS |
| 9 | `test_validate_parameters_insufficient_budget_for_duration` | Bắt lỗi ngân sách không đủ chi trả mức sàn tối thiểu | ✅ PASS |
| 10 | `test_validate_parameters_both_cities_requires_min_2_days` | Bắt lỗi đi cả 2 thành phố nhưng chỉ chọn 1 ngày | ✅ PASS |
| 11 | `test_validate_parameters_invalid_destination` | Bắt lỗi nhập điểm đến ngoài phạm vi Đà Nẵng / Huế | ✅ PASS |
| 12 | `test_validate_parameters_invalid_num_people` | Bắt lỗi số lượng người <= 0 hoặc > 20 | ✅ PASS |
| 13 | `test_validate_parameters_start_date_in_past` | Bắt lỗi chọn ngày bắt đầu trong quá khứ | ✅ PASS |

---

## 5. Danh Sách File Đã Cập Nhật

1. **Docs & Wireframe**:
   - [`docs/PB07-TRIP-PARAMETERS-WIREFRAME-AND-CONTRACT.md`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/docs/PB07-TRIP-PARAMETERS-WIREFRAME-AND-CONTRACT.md)
2. **Backend**:
   - [`backend/app/trips/schemas.py`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/trips/schemas.py)
   - [`backend/app/trips/service.py`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/trips/service.py)
   - [`backend/app/trips/router.py`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/trips/router.py)
   - [`backend/app/main.py`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/app/main.py)
   - [`backend/tests/test_trip_parameters.py`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/backend/tests/test_trip_parameters.py)
3. **Frontend**:
   - [`frontend/src/services/tripService.ts`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/frontend/src/services/tripService.ts)
   - [`frontend/src/components/planner/TripParametersForm.tsx`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/frontend/src/components/planner/TripParametersForm.tsx)
   - [`frontend/src/pages/PlannerPage.tsx`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/frontend/src/pages/PlannerPage.tsx)
   - [`frontend/src/App.tsx`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/frontend/src/App.tsx)
   - [`frontend/src/pages/LandingPage.tsx`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/frontend/src/pages/LandingPage.tsx)
   - [`frontend/.env`](file:///Users/ngoxuanbach/Documents/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-/frontend/.env)
