# GreenTrip AI — Design System & Frontend UI/UX Master Specification (v2)

Tài liệu này là **Hệ Thống Quy Chuẩn Thiết Kế & Hướng Dẫn Khởi Tạo Giao Diện Frontend Dành Cho AI Agent và Đội Ngũ GreenTrip AI (Version 2)**, hợp nhất từ:
1. **Design System & Frontend UI/UX Master Specification for AI Agent (v2)** — 6 Phong cách thiết kế web cốt lõi 2026, quy tắc 60-30-10, Design Tokens, Component Patterns & 10-Step Execution Checklist.
2. **Cẩm nang UI/UX Thực chiến cho Website và Ứng dụng Web (v2.0)** — Tiêu chuẩn định lượng WCAG 2.2 AA, Typography Scale, Touch Target, Responsive Reflow 320px, Form Validation & Core Web Vitals.

---

## 0. Định Vị Phong Cách Thiết Kế Cho GreenTrip AI (Project Style Mapping)

GreenTrip AI áp dụng mô hình **Hybrid 2 Phong Cách** tùy theo ngữ cảnh sử dụng của màn hình:

| Phân hệ giao diện | Phong cách chủ đạo (Mục 5.3) | Quy chuẩn thị giác thực tế trong GreenTrip AI |
| :--- | :--- | :--- |
| **1. Marketing & Onboarding UI**<br>(`LandingPage.tsx`, `OnboardingModal.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`) | **Style 3: "The Drew Barrymore"**<br>*(Warm, Inviting & Down-To-Earth)* | • **Màu nền**: Kem ấm `cream` (`#FCFAF5`), tông đất & rừng tự nhiên (`forest`, `wood`, `beige`).<br>• **Typography & Bo góc**: `Plus Jakarta Sans` + `Inter`, bo góc lớn mềm mại `16px–24px` (`rounded-2xl`, `rounded-3xl`).<br>• **Bóng đổ**: Tinted Shadow ấm `rgba(43, 38, 34, 0.06)` (`shadow-card`). |
| **2. Functional App & AI Workspace**<br>(`ExplorePage.tsx`, `ExploreFilterModal.tsx`, `PoiDetailSection.tsx`, `PlannerPage.tsx`) | **Style 1: "The Steve Jobs"**<br>*(Ultra-Clean & Systemized Precision)*<br>+ **Eco Accent (`emerald-800`)** | • **Màu sắc (60-30-10)**: 60% nền trắng/xám sáng (`white`, `neutral-50`) giúp ảnh địa điểm và bản đồ nổi bật; 30% cấu trúc `neutral-900` + nhận diện xanh `emerald-800`; 10% nút CTA chính.<br>• **Bố cục**: Khoảng trắng rộng, không viền thừa, thanh cuộn ẩn tự động (`.auto-hide-scrollbar`). |

---

## 1. Nền Tảng Thiết Kế & Triết Lý UX (Foundations & UX Philosophy)

### 1.1 Triết Lý "Intent-First & Storytelling"
* **Chức Năng Trọng Tâm (Function Over Pure Aesthetics)**: Giao diện dẫn dắt người dùng thực hiện mục đích (*User Intent*), không trang trí vô nghĩa.
* **Mở Rộng Chức Năng Theo Ý Định**: Bắt đầu từ tác vụ cốt lõi (Thanh tìm kiếm / Khám phá địa điểm), chỉ mở rộng bộ lọc chi tiết (*Smart Filter Sheet*) hoặc thanh trượt nâng cao khi người dùng có nhu cầu tinh chỉnh (*Progressive Disclosure*).
* **Tránh Bẫy Portfolio (Design for User, Not Portfolio)**: Ưu tiên tốc độ và sự rõ ràng ở phần màn hình đầu tiên (*Top Fold*).
* **Tôn Trọng Thói Quen Người Dùng (Layout Expectations)**: Luồng đọc từ trên xuống dưới, từ trái sang phải; điều hướng rõ ràng, CTA chính nổi bật.

### 1.2 Nguyên Tắc Tránh "AI Slop" (Anthropic "Break the Default")
* Tuyệt đối không dùng các mẫu rập khuôn vô hồn (gradient tím nhạt mặc định, badge trang trí không có chức năng, chữ xám nhạt không đọc được).
* Phân định rõ **Functional UI** (tối giản, cấu trúc dữ liệu rõ ràng) và **Marketing UI** (kể chuyện, cảm xúc ấm áp).

---

## 2. Design Tokens, Màu Sắc, Kiểu Chữ & Bố Cục

### 2.1 Quy Tắc Bảng Màu 60-30-10 & Độ Tương Phản WCAG 2.2 AA
* **Quy tắc 60-30-10**:
  * **60% Không gian**: Nền trung tính (`white`, `cream #FCFAF5`, `neutral-50`).
  * **30% Không gian**: Màu thương hiệu & cấu trúc (`charcoal #2B2622`, `neutral-900`, `forest-700`, `emerald-800`).
  * **10% Không gian**: Màu nhấn hành động (*Accent CTA*). Dành riêng cho nút hành động chính trên màn hình.
* **Ngưỡng tương phản bắt buộc (WCAG 2.2 AA — Scoped 1.4.3 & 1.4.11)**:
  * **Văn bản thường**: Tối thiểu `4.5 : 1` (trên nền trắng, dùng `text-neutral-600` trở lên; cấm dùng `text-neutral-400` cho chữ thông tin).
  * **Văn bản lớn** ($\ge 24\text{px}$ hoặc $\ge 18.66\text{px}$ in đậm): Tối thiểu `3 : 1`.
  * **Thành phần UI & đường viền nút/input**: Tối thiểu `3 : 1`.

### 2.2 Quy Chuẩn Typography (Kiểu Chữ & Thang Đo)
* **Font chữ chuẩn dự án**: `Plus Jakarta Sans` (Heading/Display) và `Inter` (Body/UI).
* **Thang cỡ chữ chuẩn (Cấm dùng cỡ chữ nhỏ hơn `12px` / `text-xs`)**:
  * **Body chuẩn**: `16px` (`text-base` / `1rem`), `line-height: 1.5`.
  * **Body phụ / Nhãn nút / Mô tả**: `14px` (`text-sm` / `0.875rem`), `line-height: 1.4–1.5`.
  * **Chú thích / Badge / Metadata**: `12px` (`text-xs` / `0.75rem`) — ngưỡng nhỏ nhất cho phép.
  * **Độ dài dòng đọc (Measure)**: `45–75` ký tự/dòng cho văn bản mô tả dài.

### 2.3 Bố Cục, Khoảng Trắng & Responsive Reflow 320px
* **3 Cấp Thị Giác (Visual Hierarchy)**:
  * **Cấp 1 (Primary)**: Tiêu đề chính, Điểm Xanh, Tên địa điểm.
  * **Cấp 2 (Secondary)**: Lý do gợi ý AI (*"Vì sao chọn địa điểm này?"*), thông tin giá & khoảng cách.
  * **Cấp 3 (Tertiary)**: Nhãn phụ, chú thích kỹ thuật.
* **Reflow 320px & Touch Target (WCAG 2.5.8 / Mobile Ergonomics)**:
  * Giao diện phải hiển thị hoàn hảo ở chiều rộng `320px` mà không bị cắt chữ hay cuộn ngang 2 chiều.
  * Mọi nút bấm, chip lọc, điểm chạm cảm ứng đạt kích thước tối thiểu `40px–44px` (`min-h-[40px]` hoặc `min-h-[44px]`).

---

## 3. Thư Viện Component & UI Patterns Chuẩn Hóa

### 3.1 Nút Hành Động (Buttons & CTAs)
* Nhãn nút rõ nghĩa hành động (*"Xem địa điểm • 339"*, *"Đặt lại"*, *"Tạo lộ trình xanh"*).
* Phản hồi đủ trạng thái: `Hover`, `Active/Pressed`, `Focus-visible` (vòng nét đứt rõ khi bấm `Tab`), `Loading` và `Disabled`.

### 3.2 Thẻ Bài & Danh Sách (Staff-Level Card Hierarchy)
* Sử dụng **Selectable Cards** có icon và nhãn rõ ràng thay cho danh sách chữ đơn điệu.
* Thẻ địa điểm gợi ý hàng đầu từ AI gắn nhãn *"Phù hợp nhất / Best Match"*.
* Chuẩn hóa bo góc đồng bộ (`rounded-xl` / `10px–12px` cho chip và thẻ nhỏ; `rounded-2xl` / `rounded-3xl` cho modal và thẻ lớn).

### 3.3 Bộ Nhập Liệu Theo Ngữ Cảnh & Chuẩn Form Validation
* **Thiết lập một lần / Tỷ lệ ưu tiên**: Dùng **Preset Pills + Sliders** (ví dụ: Trọng số Xanh vs Chi phí `0–100`).
* **Nhập liệu chính xác**: Dùng **Number Input / Selectable Cards** có giới hạn rõ ràng.
* **Form Validation**:
  * Mọi input có `<label>` rõ ràng (không dùng `placeholder` thay `label`).
  * Thông báo lỗi đặt ngay dưới trường lỗi, liên kết bằng `aria-describedby`, nêu rõ nguyên nhân và cách sửa.
  * **Không xóa dữ liệu người dùng đã nhập** khi submit lỗi.

### 3.4 Màn Hình Rỗng, Đang Tải & Báo Lỗi (States Completeness)
Mọi khu vực hiển thị dữ liệu bất đồng bộ (API Backend / Neo4j) bắt buộc có đủ 4 trạng thái:
1. **Loading State**: Skeleton hoặc vòng xoay tải mượt.
2. **Populated State**: Hiển thị dữ liệu phân cấp rõ ràng.
3. **Empty State Hành Động**: Minh họa nhẹ + câu giải thích lịch sự + nút CTA gợi ý bước tiếp theo (ví dụ: *"Đặt lại bộ lọc"*).
4. **Error State (`503` / Mạng lỗi)**: Thông báo thân thiện tiếng Việt kèm nút *"Thử lại"*, không làm sập trang.

---

## 4. Quy Chuẩn Chi Tiết 6 Phong Cách Thiết Kế Web Cốt Lõi 2026

| Phong Cách | Triết Lý Trọng Tâm | Typography Chuẩn | Bố Cục & Grid | Loại Hình Dự Án Phù Hợp |
| :--- | :--- | :--- | :--- | :--- |
| **1. Steve Jobs** | Tối giản, thanh lịch, chắt lọc | Skinny Sans-serif (`Inter`) | Whitespace rộng, không viền thừa | App cao cấp, Functional Workspace |
| **2. Jensen Huang** | Sắc nét, ổn định, B2B | Technical Sans / Mono | Bento Grid đóng khung gãy gọn | SaaS B2B, AI Platform, DevTools |
| **3. Drew Barrymore** | Ấm áp, gần gũi, thân thiện | Soft Round Sans (`Plus Jakarta Sans`) | Bo góc lớn (`16-24px`), màu kem ấm | Onboarding, Du lịch sinh thái, Cộng đồng |
| **4. Zendaya** | High-fashion, Editorial | Serif thời trang & Swiss Sans | Modular Editorial Grid | Fashion, Luxury, Creative Agency |
| **5. Virgil Abloh** | Điểm nhấn gây ấn tượng mạnh | Display Font độc bản / 3D | Tương phản cao, 1 Hero Visual | Streetwear, Creative Studio |
| **6. Christopher Nolan** | Trải nghiệm WOW, đắm chìm | Variable / Dynamic Fonts | Scroll-driven 3D WebGL | WebGL Showcase, Game |

---

## 5. Bóng Đổ (Tinted Shadows) & Hiệu Năng Chuyển Động (Motion)

* **Tinted Shadows**: Không dùng bóng đen gắt mặc định; dùng bóng đổ pha tông ấm `rgba(43, 38, 34, 0.06)` (`shadow-card`) hoặc bóng mờ nhẹ tự nhiên.
* **Hiệu năng Animation**: Chỉ animate trên `transform` (`translate3d`, `scale`) và `opacity`. Tuyệt đối không animate `width`, `height`, `top`, `left` gây giật khung hình (layout shift).

---

## 6. AI Agent Frontend Execution Checklist (10 Bước Kiểm Duyệt Bắt Buộc)

Trước khi báo hoàn thành bất kỳ task Frontend nào, thành viên và AI Agent phải kiểm tra đủ 10 mục sau:

- [ ] **1. Style Selection Check**: Đã áp dụng đúng phong cách của phân hệ chưa (*Style 3 - Drew Barrymore* cho Marketing/Onboarding; *Style 1 - Steve Jobs + Eco Accent* cho Functional Workspace)?
- [ ] **2. Design Direction Check**: Đã loại bỏ hoàn toàn các yếu tố "AI Slop" (badge trang trí thừa, gradient rập khuôn, thanh cuộn thô)?
- [ ] **3. Responsive & 320px Reflow Check**: Đã kiểm tra thực tế ở cả Desktop (`1280px`) và Mobile hẹp (`320px`) không bị tràn ngang hay cắt chữ chưa?
- [ ] **4. Color & 60-30-10 Token Check**: Đã áp dụng đúng tỷ lệ 60-30-10 và nút CTA chính sở hữu màu nhấn rõ ràng chưa?
- [ ] **5. Hierarchy & Typography Check**: Cỡ chữ nhỏ nhất có $\ge 12\text{px}$ (`text-xs`) và phân cấp 3 tầng thị giác rõ ràng chưa?
- [ ] **6. Component & Input Context Check**: Lựa chọn bộ nhập liệu đã đúng ngữ cảnh (Preset/Slider cho tỷ lệ ưu tiên, Card/Input cho thông số chuyến đi) chưa?
- [ ] **7. Feedback & 4 States Check**: Đã có đủ trạng thái `Hover`, `Active`, `Loading`, `Empty State` có nút hành động và `Error State` chưa?
- [ ] **8. Shadow & WCAG Contrast Check**: Bóng đổ đã dùng Tinted Shadow và độ tương phản chữ phụ đạt $\ge 4.5:1$ (`text-neutral-600` trở lên) chưa?
- [ ] **9. Accessibility & Keyboard Check**: Đã hỗ trợ điều hướng phím `Tab` (`focus-visible:ring-2`), thuộc tính `aria-*` (`aria-pressed`, `aria-expanded`, `aria-describedby`) và vùng chạm $\ge 40\text{–}44\text{px}$ chưa?
- [ ] **10. Animation Performance Check**: Hiệu ứng chuyển động có dùng `transform` / `opacity` và không gây lỗi Console/Runtime không?

