# BẢN BÀN GIAO TOÀN DIỆN DỰ ÁN GREENTRIP AI (DÀNH CHO CODEX / AI AGENT)

Tài liệu này được biên soạn để bất kỳ AI Agent nào (Codex, Claude Code, Cursor, Antigravity...) khi nhận dự án đều có thể đọc, nắm bắt 100% bối cảnh kiến trúc, quy chuẩn code, quy trình Git và tiếp tục phát triển mà không bị đứt gãy hay phá vỡ hệ thống kiểm thử.

---

## 1. THÔNG TIN DỰ ÁN & MÔI TRƯỜNG LÀM VIỆC

- **Tên dự án**: **GreenTrip AI** — Nền tảng lập kế hoạch du lịch thông minh, cá nhân hóa và bền vững cho Đà Nẵng & Huế.
- **Root thư mục**: `d:\ĐỒ ÁN\repo`
- **Frontend**: `d:\ĐỒ ÁN\repo\frontend` (React + TypeScript + Vite + Tailwind CSS + Leaflet/OpenStreetMap).
  - Khởi chạy: `npm run dev` (Port `http://localhost:5173`)
  - Build: `npm run build`
  - Kiểm tra kiểu: `npm run typecheck`
  - Unit test: `node --test tests/*.test.mjs`
- **Backend**: `d:\ĐỒ ÁN\repo\backend` (Python + FastAPI + Neo4j Aura + AI Recommendation Engine).
  - Khởi chạy: `uvicorn app.main:app --reload` (Port `http://127.0.0.1:8000`)
- **Tài liệu quy tắc đội ngũ**: `d:\ĐỒ ÁN\repo\AGENTS.md` (Quy ước bắt buộc về Git Flow, nhịp làm việc, quy tắc 4 bước nhận task).
- **Tài liệu đặc tả**: `d:\ĐỒ ÁN\repo\docs\` (Bao gồm `UI_UX_MASTER_SPEC.md`, `COPILOT_AI_ADAPTATION_SPEC.md`, `PB07-...`, `PB11-...`).

---

## 2. QUY TRÌNH LÀM VIỆC VỚI GIT (GIT FLOW)

### 2.1. Remote & Nhánh
- **Git Remote**: `origin https://github.com/C1SE-44/GreenTrip-AI-Smart-Travel-Planner-for-Da-Nang-Hue-.git`
- **Nhánh đang làm việc hiện tại**: `test/integration-pb09-pb11-pb16`
- **Nhánh tích hợp chung**: `develop`
- **Nhánh sản phẩm chính thức**: `main`

### 2.2. Lệnh đẩy code & kiểm tra (Git Workflow)
Trước khi push, **bắt buộc** chạy test và build:
```bash
# Di chuyển vào frontend
cd "d:\ĐỒ ÁN\repo\frontend"

# 1. Kiểm tra TypeScript
npm run typecheck

# 2. Chạy bộ unit test cốt lõi (39 tests)
node --test tests/planner-sync-logic.test.mjs tests/itinerary-route-map.test.mjs tests/for-you-and-planner-chat.test.mjs tests/home-dashboard.test.mjs tests/morph-components.test.mjs tests/map-green-interaction.test.mjs

# 3. Build kiểm tra gói
npm run build
```

Quy tắc commit theo chuẩn Conventional Commits (chi tiết tại `AGENTS.md`):
- `feat(scope): ...` — Thêm tính năng mới
- `fix(scope): ...` — Sửa lỗi
- `refactor(scope): ...` — Tái cấu trúc không đổi logic
- `test(scope): ...` — Bổ sung / sửa test

Đẩy code lên remote:
```bash
git add <các file đã sửa>
git commit -m "feat(planner): mô tả rõ ràng việc đã làm"
git push origin <tên_nhánh>
```

---

## 3. KIẾN TRÚC UI/UX & HỆ THỐNG MÀN HÌNH CHÍNH

### 3.1. Tiêu chuẩn thiết kế (Design Benchmark)
- **Chuẩn tham chiếu**: **Explore** (`src/pages/ExplorePage.tsx`) làm chuẩn phong cách:
  - Tối giản, thoáng đãng, nhiều khoảng thở trắng (`bg-white`), viền cực mỏng (`border-gray-200/80` hoặc `border-gray-150/70`).
  - Màu xanh GreenTrip `#16A34A` hoặc `#368B65` chỉ dùng làm điểm nhấn cho các tiêu chí bền vững / địa điểm xanh, không dùng tràn lan.
  - Button pill tròn trịa (`rounded-full`), active pill dùng nền đen chữ trắng (`bg-black text-white`), tab không active nền trong suốt.
- **Học tập Mindtrip**: Bố cục phân cấp typographic rõ ràng, căn lề trái chuẩn xác, không bị bóp nghẹt.

### 3.2. Không gian làm việc Lập kế hoạch (Trip Workspace)
Đã được đồng bộ hoàn toàn giữa 3 tab thông qua component header chung:
1. **`src/components/planner/TripHeader.tsx`**:
   - Header cố định chiều cao `h-[64px]`.
   - **Bên trái**: Nút quay lại tròn (`h-9 w-9`), ảnh đại diện chuyến đi nhỏ (`w-9 h-9 rounded-lg`), tên chuyến đi (`text-[16px] font-semibold`), phụ đề tóm tắt dạng `{ngày} · {số ngày} ngày · {số khách}` (ví dụ: `10–13/11 · 4 ngày · 2 khách`).
   - **Ở giữa (Căn giữa tuyệt đối)**: 3 tab **Ý tưởng · Lịch trình · Lịch** (`h-[36px] px-[14px] rounded-full`). Tab active có pill đen, tab inactive nền trong suốt. Kích thước và padding giữ cố định để không bị giật layout khi click.
   - **Bên phải**: Phân cách mỏng `|`, nút `Tùy chỉnh` kèm Popover để đổi Điểm đến, Ngày bắt đầu, Khách, Ngân sách (không để 4 ô này làm chật chội header).
2. **Tỷ lệ khung nhìn**:
   - Cột nội dung bên trái: `w-[54%] max-w-[720px] min-w-[460px] px-7 pt-6 pb-6`.
   - Khung bản đồ bên phải: `flex-1 h-full min-w-0 pr-6 lg:pr-[36px] py-5 pl-0`, bo góc `rounded-[20px] border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`.
3. **Ba màn hình tương ứng**:
   - **Ý tưởng (`TripOverviewView.tsx`)**: Quản lý `Địa điểm đã chọn`, thẻ địa điểm ngang nhỏ gọn (`w-16 h-16`), nút `+ Thêm địa điểm`, tích hợp AI Copilot hỗ trợ.
   - **Lịch trình (`TripItineraryView.tsx`)**: Bố cục đọc trên xuống: Lịch trình $\rightarrow$ Chưa xếp lịch (collapsible) $\rightarrow$ Timeline các ngày. Mặc định chỉ mở Ngày 1, các ngày sau thu gọn 1 dòng `h-11 sm:h-12`.
   - **Lịch (`TripCalendarView.tsx`)**: Lưới lịch 24 giờ (`07:00`, `08:00`), banner điều hướng khi chưa có lịch trình.

---

## 4. NHỮNG BẤT BIẾN KIỂM THỬ TUYỆT ĐỐI KHÔNG ĐƯỢC PHÁ VỠ (TEST INVARIANTS)

Hệ thống unit test tại `frontend/tests/*.test.mjs` có các test case kiểm tra cấu trúc code tĩnh qua `fs.readFileSync`. **Khi sửa code, tuyệt đối không xóa hoặc đổi tên các thuộc tính / chuỗi sau:**
1. Trong `TripOverviewView.tsx`:
   - Chuỗi: `Xem lịch theo ngày`, `isDrawerMode={true}`, `showItineraryDrawer`, `showIdeasView`, `Ý tưởng đã lưu`, `Thêm địa điểm bạn muốn đến.`, `handleSaveCopilotPoiToIdeas`, `modalTab === 'saved'`, `<PoiMap`.
2. Trong `TripItineraryView.tsx`:
   - Chuỗi: `updateDateRangeWithDays`, `onUpdateTrip`, `handleAddDay`, `handleDeleteDay`, `alignItineraryToTrip(latestPlan.current, trip)`, `isDrawerMode`, `modalTab === 'saved'`, `rounded-l-[24px]`, `animate-slideInRight`, `!isDrawerMode &&`.
3. Trong `TripCalendarView.tsx`:
   - Chuỗi: `parseStartDateFromTrip(trip.startDate)`, `calendarDaysMeta`, `alignItineraryToTrip(plan, trip)`.
4. Trong `itineraryService.ts`:
   - Phải giữ nguyên 2 hàm: `updateDateRangeWithDays` và `parseStartDateFromTrip`.

---

## 5. VỊ TRÍ CÁC SKILLS & PROMPTS TRÊN MÁY TÍNH

Khi cần hướng dẫn thiết kế hoặc công cụ bổ trợ, Codex có thể đọc trực tiếp các tệp `SKILL.md` tại các đường dẫn sau:

- **Frontend & UI/UX Design**:
  - `C:\Users\ngoho\.gemini\config\plugins\frontend-design\skills\frontend-design\frontend-design\SKILL.md` (Nguyên lý thiết kế UI/UX hiện đại)
  - `C:\Users\ngoho\.gemini\config\plugins\frontend-design\skills\brand-guidelines\SKILL.md`
  - `C:\Users\ngoho\.gemini\config\plugins\taste-skill\` (Quy chuẩn thẩm mỹ UI)
- **Hoạt họa & Tương tác**:
  - `C:\Users\ngoho\.gemini\config\plugins\gsap\` (GSAP Animation)
  - `C:\Users\ngoho\.gemini\config\plugins\scroll-craft\` (Cuộn trang mượt mà)
  - `C:\Users\ngoho\.gemini\config\plugins\morphicons\` (Icon chuyển động mượt)
- **Hạ tầng & Dịch vụ**:
  - `C:\Users\ngoho\.gemini\config\plugins\vercel-plugin\skills\` (Triển khai, tối ưu Next/React, caching, env)
  - `C:\Users\ngoho\.gemini\config\plugins\supabase\skills\` (Cơ sở dữ liệu Postgres, Auth, Supabase)
- **Kiểm thử tự động**:
  - `C:\Users\ngoho\.gemini\config\plugins\playwright\` (E2E Test)
- **Kỹ năng cốt lõi tích hợp**:
  - `C:\Users\ngoho\.gemini\antigravity\builtin\skills\` (Bao gồm `generative_ui`, `automation`, `antigravity_guide`...)
