# GreenTrip AI — Quy Tắc Làm Việc Bắt Buộc (Team & AI Agent Rules)

> **BẮT BUỘC ĐỌC TRƯỚC KHI SỬA CODE**: Mọi AI Agent (Antigravity, Copilot, Cursor, Codex...) và mọi thành viên dự án **GreenTrip AI** phải đọc file này cùng [PRD.md](PRD.md) (và đối chiếu [ARCHITECTURE.md](ARCHITECTURE.md), [API_SPEC.md](API_SPEC.md) khi đụng tới kiến trúc hoặc API) trước khi thực hiện bất kỳ thay đổi mã nguồn nào.

---

## 0. Bảy Nguyên Tắc Cốt Lõi (Luôn Tuân Thủ)

1. **Rõ yêu cầu trong `PRD.md` trước khi code**: Trước khi thêm tính năng hoặc đổi hành vi, bắt buộc đối chiếu [PRD.md](PRD.md) (đối tượng sử dụng, danh sách tính năng, luồng thao tác, phân quyền). Nếu yêu cầu mới chưa có trong `PRD.md`, cập nhật `PRD.md` và xác nhận trước khi code.
2. **Hiểu rõ dự án trước khi sửa**: Nắm chắc công nghệ, cấu trúc thư mục và quy ước code ở Mục 1; đọc đúng file liên quan trước khi đề xuất sửa, không đoán mò.
3. **Chia nhỏ task — xong bước nào kiểm tra bước đó**: Không ôm cả module lớn làm một lần. Chia việc thành từng bước nhỏ chạy được, kiểm chứng xong bước này mới làm tiếp bước sau.
4. **Kỷ luật Git, `git diff`, kiểm thử & báo cáo sau mỗi task**:
   - Đảm bảo trạng thái Git sạch (đã commit checkpoint) trước khi sửa lớn để dễ quay lại nếu sai.
   - Luôn tự review bằng `git diff` để kiểm tra chính xác AI/mình đã thay đổi những gì.
   - Kiểm thử đầy đủ **chức năng, API và phân quyền (`401`/`403`/`404`)** trước khi tạo PR / deploy.
   - **Sau mỗi task, AI Agent bắt buộc báo cáo rõ 2 mục**: **(1) Đã sửa những gì** và **(2) Cần kiểm tra những gì**.
5. **Code đơn giản, dễ đọc cho cả nhóm**: Ưu tiên sự đơn giản, rõ ràng hơn là kỹ thuật cầu kỳ. Đặt tên hàm/biến có ý nghĩa, chỉ thêm chú thích ngắn giải thích *tại sao* khi cần thiết để mọi thành viên đều đọc hiểu và bảo trì được.
6. **Tôn trọng code của thành viên khác trong Git**: Tuyệt đối **không tự ý sửa code thuộc phần/file của thành viên khác** khi chưa trao đổi và được đồng ý trước (tham chiếu [.github/CODEOWNERS](.github/CODEOWNERS)). Chỉ được sửa trực tiếp khi là **lỗi cực kỳ nghiêm trọng / khẩn cấp** (lỗi production hoặc chặn CI toàn nhóm) và phải thông báo ngay cho chủ code.
7. **Commit nhỏ, hoàn chỉnh**: Mỗi commit là một đơn vị công việc nhỏ, hoàn chỉnh và có mô tả rõ ràng theo Conventional Commits.

---

## 1. Bối Cảnh Kỹ Thuật Dự Án (Tech Stack, Thư Mục & Quy Ước Code)

### 1.1. Công nghệ sử dụng (Không tự ý thêm thư viện mới khi chưa thống nhất)

| Thành phần | Công nghệ chuẩn |
| :--- | :--- |
| **Frontend** | React 18, TypeScript (strict, cấm `any`), Vite, Tailwind CSS, React Router, Leaflet / React-Leaflet, `lucide-react` |
| **Backend API** | Python 3.12+, FastAPI, Pydantic v2, PyJWT, Argon2 (`pwdlib`), ReportLab (xuất PDF) |
| **Database & Graph** | PostgreSQL / Supabase (có fallback SQLite cục bộ), Neo4j Aura (Knowledge Graph giải thích POI) |
| **AI & Auth** | Google Gemini (`gemini-2.5-flash`), Google OAuth 2.0, SMTP Gmail OTP |
| **CI/CD & Test** | `pytest` (Backend), `npm run lint:ci && npm run typecheck && npm run test:unit && npm run build` (Frontend), GitHub Actions |

### 1.2. Cấu trúc thư mục

```text
├── PRD.md                   # Đặc tả sản phẩm: đối tượng, tính năng, user flows, phân quyền
├── ARCHITECTURE.md          # Kiến trúc hệ thống, phân lớp BE/FE, DB schema & luồng dữ liệu
├── API_SPEC.md              # Hợp đồng HTTP/JSON API giữa FE và BE
├── AGENTS.md                # Quy tắc dự án cho AI Agent & thành viên (file gốc)
├── CONTRIBUTING.md          # Sổ tay nội quy nhóm & Git Flow
├── backend/
│   ├── app/
│   │   ├── main.py          # Entrypoint FastAPI & mount routers (1 prefix chuẩn duy nhất)
│   │   ├── config.py        # Đọc biến môi trường (.env), production guards
│   │   ├── rate_limit.py    # Rate limiter cho auth & AI copilot
│   │   ├── db/              # Kết nối PostgreSQL/SQLite & Neo4j Aura
│   │   ├── auth/            # /auth/* (JWT, OTP, Google OAuth, profile)
│   │   ├── pois/            # /pois/* (POI list, weights, KG explanation)
│   │   ├── recommendations/ # /v1/recommendations/* (gợi ý POI theo chuyến đi)
│   │   ├── saved_places/    # /saved-places/* (bộ sưu tập & địa điểm đã thích)
│   │   ├── trips/           # /trips/* (itinerary, AI copilot) & /my-trips/* (CRUD chuyến đi)
│   │   └── itineraries/     # /itineraries/* (tuyến hành trình mẫu)
│   ├── migrations/          # SQL migrations có đánh số thứ tự
│   └── tests/               # Bộ test pytest
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Khai báo routes React Router
│   │   ├── pages/           # LandingPage, ExplorePage, VerifyEmailPage
│   │   ├── components/      # Chia theo domain: account, auth, common, explore, home, layout, planner, poi, saved, ui
│   │   ├── services/        # Gọi API backend qua src/lib/api.ts
│   │   ├── context/         # React Context (ví dụ SavedPlacesContext)
│   │   ├── data/            # Kiểu dữ liệu & chuẩn hóa POI (pois.ts)
│   │   └── utils/           # Hàm tiện ích thuần (pure functions)
│   └── tests/               # Unit tests (*.test.mjs)
├── docs/                    # Đặc tả chi tiết API, UI/UX Master Spec, user flows, Postman
└── specs/                   # Đặc tả theo từng feature (Spec-Driven Development)
```

### 1.3. Quy tắc viết code thống nhất (Đơn giản — Rõ ràng — Dễ đọc)

- **Nguyên tắc tối giản**: Không over-engineering, không tạo lớp trừu tượng thừa cho code chỉ dùng 1 chỗ, không tự ý refactor ngoài phạm vi task.
- **Đặt tên có ý nghĩa**:
  - **TypeScript / React**: Component dùng `PascalCase` (`TripBudgetModal.tsx`), hàm/biến dùng `camelCase` (`calculateStopsPathKm`), hằng số dùng `UPPER_SNAKE_CASE`. Tuyệt đối không dùng `any`.
  - **Python / FastAPI**: Module, hàm, biến dùng `snake_case`; Pydantic schema/class dùng `PascalCase`; luôn khai báo type hints rõ ràng.
- **Tách nhỏ module hợp lý**: Tránh dồn logic mới vào file đã lớn; tách modal/drawer/helper thuần thành file riêng cùng thư mục domain.
- **Chú thích đúng chỗ**: Không viết comment thừa lặp lại code; chỉ chú thích ngắn khi cần giải thích *lý do nghiệp vụ* hoặc *ràng buộc đặc biệt*.
- **Bảo mật**: Tuyệt đối không hard-code secret, API key, mật khẩu hay connection string; luôn dùng biến môi trường (`.env` / `app.config`).

---

## 2. Quy Trình Nhận & Thực Hiện Task (Bắt Buộc)

Trước khi sửa bất kỳ dòng code nào, cả thành viên và AI phải đi qua đúng 4 bước:

1. **Đọc yêu cầu, đối chiếu `PRD.md` & khảo sát code trước khi sửa**:
   - Đọc kỹ mô tả task, đối chiếu [PRD.md](PRD.md) và đọc các file liên quan trên nhánh hiện tại. Nếu yêu cầu còn chưa rõ thì **hỏi trước khi mở code**, tuyệt đối không tự ý đoán hoặc tự đổi yêu cầu.
   - **Không viết từ con số 0**: Với chức năng chưa quen thuộc, chủ động tham khảo giải pháp chuẩn / mã nguồn mở uy tín để đối chiếu kiến trúc trước khi làm.
2. **Nhắc lại việc bằng một câu, chốt kế hoạch nhỏ & xác nhận**:
   - Tóm tắt mục tiêu bằng đúng 1 câu rõ nghĩa, chia nhỏ các bước sẽ làm (nêu rõ file dự kiến sửa) và chờ người giao việc xác nhận trước khi code.
3. **Checkpoint Git & làm từng bước nhỏ chạy được**:
   - Trước khi sửa, đảm bảo working tree sạch hoặc đã commit checkpoint hiện tại để có thể `git revert` / quay lại ngay nếu sai.
   - Hoàn thành từng lát cắt nhỏ kiểm chứng được (vertical slice), test xong bước đó rồi mới làm tiếp.
4. **Tự review `git diff`, kiểm thử & báo cáo sau mỗi task**:
   - Đọc lại toàn bộ `git diff` như một reviewer; xóa dead code, comment lỗi thời, `console.log` / debug log thừa.
   - Chạy kiểm thử tự động và kiểm tra thực tế chức năng, API và **phân quyền**:
     - Backend: `python -m compileall -q backend/app backend/tests && pytest -v backend/tests`
     - Frontend: `cd frontend && npm run lint:ci && npm run typecheck && npm run test:unit && npm run build`
   - **Demo là phần chạy được trên máy, không phải slide trạng thái**.
   - **Mẫu báo cáo bắt buộc của AI Agent sau mỗi task**:
     - **Đã sửa những gì**: Liệt kê file đã tạo/sửa và tóm tắt thay đổi ngắn gọn.
     - **Cần kiểm tra những gì**: Liệt kê các luồng chức năng, API, phân quyền và lệnh test cần người dùng xác minh trước khi merge/deploy.

---

## 3. Quy Tắc Giao Tiếp, Daily, Tôn Trọng Code & Báo Kẹt

### 3.1. Giờ giấc & Nhịp làm việc

- **Khung giờ làm việc**: `08:00 – 17:00` (8h sáng sẵn sàng nhận task; 17h hết ca, làm thêm thì báo nhóm trưởng; muộn/vắng/về sớm nhắn trước kèm lý do và giờ có mặt).
- **Nhịp tuần**: Đầu tuần chia việc (1 người cầm 1 việc trong ngày) · Mỗi sáng Daily 15 phút · Giữa tuần xem bài (review PR) của nhau · Cuối tuần demo phần chạy được trên máy.

### 3.2. Công thức nói trong Daily (Đúng 3 câu)

1. **Hôm qua em xong việc gì.**
2. **Hôm nay em làm việc gì.**
3. **Em đang kẹt ở đâu, cần ai.** *(Thảo luận kỹ thuật chi tiết để sau buổi Daily)*.

### 3.3. Quy tắc chủ động báo kẹt (Quy tắc 1 tiếng)

- Kẹt khoảng **1 tiếng** phải nói ngay với nhóm; chưa gỡ được thì đưa lên mentor kèm phần đã thử. Sắp trễ hạn báo ngay trong ngày.
- Cấu trúc nhắn tin báo lỗi bắt buộc **3 ý**: **Đang làm gì** · **Đã thử gì** · **Cần quyết định / hỗ trợ gì**.

### 3.4. Tôn trọng code thành viên & Năm điều tuyệt đối cấm

- **Tôn trọng công sức thành viên**: Không tự ý chỉnh sửa, ghi đè hoặc refactor code thuộc phạm vi/file của thành viên khác khi chưa trao đổi và nhận được sự đồng ý. Ngoại lệ duy nhất là lỗi **cực kỳ nghiêm trọng / khẩn cấp** (lỗi production hoặc chặn build/CI) và phải nhắn báo ngay kèm lý do + diff cụ thể.
- **Năm điều tuyệt đối cấm**:
  1. Ngồi im đến cuối ngày mới nói là chưa xong.
  2. Daily đáp "không có gì" trong khi đang cầm task.
  3. Tự đổi yêu cầu, không hỏi người giao việc.
  4. Tự ý sửa code của thành viên khác khi chưa trao đổi/xin phép (trừ lỗi khẩn cấp).
  5. Đưa mã nguồn, mật khẩu, API key, `.env` hoặc dữ liệu nội bộ ra ngoài nhóm.

---

## 4. Git Flow Rule (Quản Lý Nhánh, Commit & Pull Request)

### 4.1. Vai trò các nhánh

- `main`: Chỉ chứa code sẵn sàng release hoặc đã release. **Cấm commit trực tiếp lên `main`**. Đánh tag theo bản phát hành (`v0.1.1_stg`, `v1.0.0_prod`).
- `develop`: Nhánh tích hợp trung gian, luôn build & pass test. **Không phát triển feature trực tiếp trên `develop`**. Chỉ nhận merge qua PR.
- `feature/*`, `bugfix/*`, `docs/*`, `refactor/*`: Tách từ `develop` cho từng task riêng; xong merge về `develop` qua PR.
- `release/*`: Tách từ `develop` khi chốt phiên bản; xong merge vào cả `main` và `develop`.
- `hotfix/*`: Tách từ `main` khi vá lỗi khẩn cấp production; xong merge vào cả `main` và `develop`.

### 4.2. Quy tắc đặt tên branch

Viết thường, không dấu tiếng Việt, không ký tự lạ, dùng `_` tách mã issue và `-` cho mô tả ngắn:

- `feature/#<issue>_<short-description>` (Ví dụ: `feature/#pb08_sustainability-slider-ranking`)
- `bugfix/#<issue>_<short-description>` (Ví dụ: `bugfix/#pb10_handle-neo4j-timeout`)
- `release/<version>` · `hotfix/<version>_<short-description>`
- Không đặt tên mơ hồ như `temp`, `test`, `new-branch`, `update`.

### 4.3. Quy tắc Commit nhỏ & hoàn chỉnh

Mỗi commit là **một đơn vị công việc nhỏ, hoàn chỉnh**, có mô tả rõ ràng theo Conventional Commits:

- `feat: ...` · `fix: ...` · `refactor: ...` · `docs: ...` · `test: ...` · `chore: ...`

**Cấm**: Commit kiểu `wip`, `update`, `fix bug` chung chung; gom nhiều task khác nhau vào cùng 1 commit; `git push --force` lên nhánh chung (`main`, `develop`) hoặc sửa lịch sử commit của thành viên khác.

### 4.4. Quy tắc Pull Request & Definition of Done (DoD)

Một task/branch chỉ được coi là **Done** khi thỏa mãn toàn bộ:

- [ ] Đã tách nhánh đúng chuẩn từ `develop` mới nhất và không sửa ngoài phạm vi task / code của thành viên khác.
- [ ] Đã tự kiểm tra `git diff`, build thành công và pass kiểm thử Backend (`pytest`) / Frontend (`lint:ci`, `typecheck`, `test:unit`, `build`).
- [ ] Đã kiểm thử thực tế chức năng, API và **phân quyền** (trường hợp hợp lệ, thiếu token `401`, truy cập sai chủ sở hữu `403`/`404`).
- [ ] *(Nếu có sửa Frontend)* Đã vượt qua **Checklist 10 bước UI/UX & WCAG 2.2 AA** tại Mục 5.
- [ ] Đã mở Pull Request vào `develop` điền đầy đủ theo [.github/pull_request_template.md](.github/pull_request_template.md).
- [ ] Đã được AI/bot review và ít nhất 1 thành viên trong nhóm review & **Approve** (không tự resolve comment của người khác).
- [ ] CI/CD trên GitHub Actions xanh 100%.

---

## 5. Quy Chuẩn Thiết Kế UI/UX & Checklist 10 Bước Bắt Buộc (Frontend)

Mọi thay đổi giao diện trong `frontend/` phải tuân thủ [docs/UI_UX_MASTER_SPEC.md](docs/UI_UX_MASTER_SPEC.md) và vượt qua **10 bước kiểm duyệt** trước khi commit:

1. **Style Selection Check**: Đúng phong cách của phân hệ (*Style 3 - Drew Barrymore* ấm áp cho Landing/Onboarding/Auth; *Style 1 - Steve Jobs + Eco Accent* tối giản, sắc nét cho Explore/Filter/Planner).
2. **No "AI Slop" Check**: Không dùng gradient rập khuôn, icon/badge trang trí vô nghĩa hoặc thanh cuộn hệ điều hành thô kệch.
3. **Responsive & 320px Reflow Check**: Kiểm tra trên trình duyệt ở cả Desktop (`1280px`) và Mobile (`320px`), không tràn ngang hoặc cắt chữ trên nút CTA.
4. **60-30-10 Color & Token Check**: 60% nền sáng trung tính, 30% cấu trúc & nhận diện xanh (`neutral-900` / `emerald-800` / `forest-700`), 10% màu nhấn dành riêng cho nút CTA chính.
5. **Hierarchy & Typography Check**: Phân cấp 3 tầng thị giác rõ ràng; **cấm dùng cỡ chữ nhỏ hơn `12px` (`text-xs`)**.
6. **Input Context Check**: Chọn đúng loại input theo ngữ cảnh (Preset Pills + Slider thu gọn cho trọng số ưu tiên; Selectable Cards & Number Input rõ ràng cho form thông số chuyến đi).
7. **4-State Feedback Check**: Mọi thành phần gọi API phải có đủ 4 trạng thái: `Loading` (Skeleton), `Populated` (Có dữ liệu), `Empty State` (Có câu dẫn + nút hành động) và `Error State` (Thông báo thân thiện + nút thử lại).
8. **Tinted Shadow & WCAG 2.2 AA Contrast Check**: Dùng bóng đổ ấm cùng tông; chữ thông tin trên nền sáng phải đạt tương phản ≥ 4.5:1 (tối thiểu `text-neutral-600`, không dùng `text-neutral-400` cho nội dung đọc).
9. **Keyboard & Touch Accessibility Check**: Vùng chạm nút bấm đạt tối thiểu `40px–44px`; hỗ trợ điều hướng phím `Tab` (`focus-visible:ring-2`) và đầy đủ `aria-pressed`, `aria-expanded`, `aria-describedby`.
10. **Animation Performance Check**: Chỉ dùng `transform` và `opacity` cho hiệu ứng chuyển động; không gây lỗi hoặc cảnh báo trên Chrome DevTools Console.
