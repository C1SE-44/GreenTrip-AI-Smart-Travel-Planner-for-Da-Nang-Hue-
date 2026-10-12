# 🎨 HỆ THỐNG TYPOGRAPHY CHUẨN (MINDTRIP CLONE DESIGN SYSTEM)
> **Tài liệu hướng dẫn bắt buộc dành cho Developer & AI Assistant khi phát triển dự án GreenTrip.**  
> Mục tiêu: Đảm bảo tính nhất quán 100% về mặt thẩm mỹ, phân cấp chữ (hierarchy) và không bao giờ tự ý chèn các font rác khác làm phá vỡ giao diện.

---

## 1. NGUYÊN TẮC CỐT LÕI (2-FONT SYSTEM)

Toàn bộ dự án **GreenTrip** chỉ sử dụng **DUY NHẤT 2 HỌ FONT** theo chuẩn phong cách Mindtrip / Luxury Tech:

| Vai trò | Font Family | Class Tailwind | Mục đích sử dụng |
| :--- | :--- | :--- | :--- |
| **Tiêu đề & Điểm nhấn** | `Plus Jakarta Sans` | `font-heading` hoặc `font-display` | Tiêu đề lớn (Hero, Section, Card Title, CTA Banner) |
| **Nội dung & Giao diện (UI)** | `Inter` | `font-sans` hoặc `font-body` | Đoạn văn, mô tả, nút bấm, menu, nhãn, dữ liệu, bản đồ |

> 🚫 **NGHIÊM CẤM:** Không tự ý import hoặc sử dụng các font có chân (`serif`, `Fraunces`), `Roboto`, `Be Vietnam Pro`, `Arial` hoặc bất kỳ font lạ nào khác.

---

## 2. QUY CHUẨN CẤU HÌNH KỸ THUẬT

### 2.1. Nhúng trong `index.html`
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
  rel="stylesheet"
/>
```

### 2.2. Cấu hình trong `tailwind.config.js`
```javascript
theme: {
  extend: {
    fontFamily: {
      sans: ['"Inter"', 'sans-serif'],
      body: ['"Inter"', 'sans-serif'],
      heading: ['"Plus Jakarta Sans"', 'sans-serif'],
      display: ['"Plus Jakarta Sans"', 'sans-serif'],
    },
  }
}
```

---

## 3. KHUÔN MẪU PHÂN CẤP TYPOGRAPHY (UI HIERARCHY GUIDELINES)

Mỗi khi tạo mới hoặc sửa bất kỳ thành phần giao diện nào, **AI và Developer PHẢI tuân theo đúng bảng quy chuẩn sau**:

### 🅰️ NHÓM TIÊU ĐỀ (HEADINGS) — `font-heading`
1. **Hero Title (H1 - Tiêu đề lớn nhất đầu trang):**
   * Class: `font-heading text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] text-black`
   * Quy tắc: Chữ cực đậm, khoảng cách ký tự ép sát (`tracking-tight`), khoảng cách dòng khít rịt (`leading-[1.05]`).
2. **Section Title (H2 - Tiêu đề từng phân đoạn):**
   * Class: `font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-950`
3. **Card Title (H3/H4 - Tên địa điểm, tên dịch vụ):**
   * Class: `font-heading text-base sm:text-lg font-bold tracking-tight text-gray-900 truncate`

---

### 🅱️ NHÓM ĐOẠN VĂN MÔ TẢ (BODY TEXT) — `font-sans`
1. **Đoạn dẫn chính (Subtitle / Lead text dưới H1/H2):**
   * Class: `text-base sm:text-lg lg:text-xl font-light text-gray-500 max-w-2xl leading-relaxed`
   * Quy tắc: **Bắt buộc dùng `font-light` (Weight 300) hoặc `font-normal` (Weight 400)**. Màu chữ xám vừa phải (`text-gray-500` hoặc `text-gray-600`), **tuyệt đối không dùng chữ đen đậm** để nhường spotlight cho tiêu đề.
2. **Đoạn mô tả ngắn trong Card (Card description):**
   * Class: `text-[13px] font-light text-gray-500 leading-relaxed`
3. **Đoạn văn dài (Articles, Chi tiết lịch trình):**
   * Class: `text-[15px] font-normal text-gray-700 leading-relaxed`

---

### 🅲️ NHÓM GIAO DIỆN & ĐIỀU HƯỚNG (UI & MICRO-COPY) — `font-sans`
1. **Thanh Navbar & Sidebar:**
   * Link mặc định: `text-sm font-normal text-gray-700 hover:text-black`
   * Link Active: `text-sm font-semibold text-black bg-gray-100`
2. **Nút bấm hành động (Buttons & CTAs):**
   * Nút chính (Pill Button): `rounded-full px-6 py-3 text-sm sm:text-base font-normal tracking-normal text-white bg-black hover:bg-gray-900 transition`
   * Quy tắc Mindtrip: **Nút bấm chuộng nét chữ thanh mảnh (`font-normal` hoặc `font-medium`)**, không dùng chữ quá đậm thô kệch.
3. **Bộ lọc & Tabs (Filter chips):**
   * Tab mặc định: `text-xs sm:text-sm font-normal text-gray-600 hover:text-black`
   * Tab Active: `text-xs sm:text-sm font-semibold text-white bg-black rounded-full px-4 py-1.5`
4. **Metadata, Tags, Điểm đánh giá (Badges & Rating):**
   * Tag/Badge: `text-[10px] sm:text-[11px] font-medium text-gray-600 bg-gray-100 rounded-full px-2.5 py-0.5`
   * Điểm Rating số: `text-xs font-bold text-gray-900`
   * Nhãn đính kèm: `text-[11px] font-light text-gray-400`

---

## 4. CHECKLIST DÀNH CHO AI TRƯỚC KHI CODE XONG
- [ ] Không có font nào ngoài `Inter` và `Plus Jakarta Sans`.
- [ ] Các tiêu đề H1/H2 có class `font-heading font-extrabold tracking-tight`.
- [ ] Các đoạn câu dẫn (lead paragraph) có class `font-light text-gray-500`.
- [ ] Nút bấm (CTA) dùng `font-normal` hoặc `font-medium` bo tròn `rounded-full`.
