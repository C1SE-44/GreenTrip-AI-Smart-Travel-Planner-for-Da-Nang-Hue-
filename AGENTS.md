# GreenTrip AI — Quy Tắc Làm Việc Bắt Buộc (Team & AI Agent Rules)

Tài liệu này là quy ước vận hành bắt buộc cho tất cả thành viên và AI Agent khi làm việc trên repository **GreenTrip AI**. Mọi phiên làm việc phải tuân thủ nghiêm ngặt **Nội quy làm việc nhóm** và **Git Flow Rule** dưới đây.

---

## 1. Quy Trình Nhận & Thực Hiện Task (4 Bước Bắt Buộc)

Trước khi sửa bất kỳ dòng code nào, cả thành viên và AI phải đi qua đúng 4 bước:

1. **Đọc hết yêu cầu trước khi sửa code**: Khảo sát kỹ mô tả task (PB07, PB08, PB09, PB10...), đọc các file liên quan trên nhánh hiện tại. Nếu yêu cầu còn chưa rõ thì **hỏi trước khi mở code**, tuyệt đối không tự ý đoán hoặc tự đổi yêu cầu.
2. **Nhắc lại việc bằng một câu và xác nhận**: Tóm tắt lại mục tiêu công việc bằng đúng 1 câu rõ nghĩa và chờ người giao việc / Architect xác nhận trước khi bắt tay vào code.
3. **Làm một phần nhỏ chạy được, rồi mới làm tiếp**: Chia công việc thành các lát cắt nhỏ có thể chạy và kiểm chứng được ngay (vertical slice). Không ôm cả module lớn làm một lần.
4. **Tự review & nhờ người trong nhóm xem bài trước khi báo xong**:
   - Đọc lại toàn bộ `git diff` như một reviewer.
   - Xóa toàn bộ code thừa, dead code, comment lỗi thời, `console.log` / debug log không cần thiết.
   - Chạy kiểm thử (`pytest` cho backend, `npm run lint && npm run typecheck && npm run build` cho frontend).
   - **Demo là phần chạy được trên máy, không phải slide trạng thái**.

---

## 2. Quy Tắc Giao Tiếp, Daily & Báo Kẹt

### 2.1. Giờ giấc & Nhịp làm việc
- **Khung giờ làm việc**: `08:00 – 17:00` (8h sáng máy mở, tài khoản đăng nhập, sẵn sàng nhận task; 17h hết ca, ở lại làm tiếp thì báo nhóm trưởng trước; muộn/vắng/về sớm phải nhắn trước kèm lý do và giờ có mặt).
- **Nhịp tuần**:
  - **Đầu tuần**: Chia việc, mỗi người biết rõ phần mình cầm (1 người cầm 1 việc trong ngày).
  - **Mỗi sáng**: Họp Daily 15 phút đầu giờ (mỗi người nói ~1 phút).
  - **Giữa tuần**: Xem bài (review PR/code) của nhau trước khi nộp.
  - **Cuối tuần**: Demo phần chạy được trên máy, nói rõ phần còn thiếu.

### 2.2. Công thức nói trong Daily (Đúng 3 câu)
Khi người dùng yêu cầu chuẩn bị nội dung Daily hoặc báo cáo tiến độ, luôn xuất đúng 3 câu ngắn gọn:
1. **Hôm qua em xong việc gì.**
2. **Hôm nay em làm việc gì.**
3. **Em đang kẹt ở đâu, cần ai.** *(Câu hỏi kỹ thuật chi tiết để sau buổi Daily)*.

> *Ví dụ chuẩn*: "Hôm qua em xong màn hình đăng nhập. Hôm nay em nối API. Em kẹt lỗi 401, nhờ nhóm trưởng xem sau daily."

### 2.3. Quy tắc chủ động trao đổi khi gặp lỗi / kẹt (Quy tắc 1 tiếng)
- Kẹt khoảng **1 tiếng** thì phải nói ngay với người trong nhóm. Vẫn chưa gỡ được thì đưa lên mentor kèm phần đã thử. Sắp trễ hạn thì báo ngay trong ngày, không đợi bị hỏi.
- Khi nhắn tin báo lỗi hoặc khi AI báo cáo vướng mắc kỹ thuật, bắt buộc viết theo cấu trúc **3 ý đủ để người nhận xử lý được ngay**:
  - **Đang làm gì** (Task nào, file/API nào).
  - **Đã thử gì** (triệu chứng lỗi, nguyên nhân đã kiểm tra).
  - **Cần quyết định / hỗ trợ gì**.

> ❌ *Chưa đủ*: "Em bị lỗi ạ."
> ✅ *Đủ để xử lý*: "Task đăng nhập. API trả 401. Em đã kiểm tra token hết hạn. Em cần cách gọi refresh."

### 2.4. Bốn điều tuyệt đối cấm (Làm hỏng cả nhóm)
1. Ngồi im đến cuối ngày mới nói là chưa xong.
2. Daily đáp "không có gì" trong khi đang cầm task.
3. Tự đổi yêu cầu, không hỏi người giao việc.
4. Đưa mã nguồn, mật khẩu, API key, `.env` hoặc dữ liệu nội bộ ra ngoài nhóm.

---

## 3. Git Flow Rule (Quản Lý Nhánh, Commit & Pull Request)

### 3.1. Vai trò các nhánh
- `main`: Chỉ chứa code sẵn sàng release hoặc đã release. **Cấm commit trực tiếp lên `main`**. Mỗi bản release đánh tag (`v0.1.1_stg` cho môi trường staging, `v1.0.0_prod` cho môi trường production).
- `develop`: Nhánh tích hợp trung gian, luôn ở trạng thái build & pass test. **Không phát triển feature mới trực tiếp trên `develop`**. Chỉ nhận merge qua PR từ `feature/*`, `bugfix/*`, `release/*`, `hotfix/*`.
- `feature/*`: Tách từ `develop` cho từng task/issue riêng; xong việc merge về `develop` qua PR.
- `bugfix/*`: Tách từ `develop` để sửa lỗi phát sinh trong quá trình phát triển; chỉ sửa đúng phạm vi bug, không thêm tính năng mới.
- `release/*`: Tách từ `develop` khi chốt phiên bản; chỉ sửa bug cuối kỳ, metadata, version, changelog; xong merge vào cả `main` và `develop`.
- `hotfix/*`: Tách từ `main` (hoặc `release/*` / `tag`) khi vá lỗi khẩn cấp trên production; xong merge vào cả `main` và `develop`.

### 3.2. Quy tắc đặt tên branch
Viết thường, không dấu tiếng Việt, không ký tự lạ, dùng dấu gạch dưới `_` để ngăn cách mã issue và dấu gạch ngang `-` cho mô tả ngắn:
- `feature/#<issue>_<short-description>` (Ví dụ: `feature/#pb08_sustainability-slider-ranking`, `feature/#pb09_content-based-filtering`)
- `bugfix/#<issue>_<short-description>` (Ví dụ: `bugfix/#pb10_handle-neo4j-timeout`)
- `release/<version>` (Ví dụ: `release/0.2.0`)
- `hotfix/<version>_<short-description>` (Ví dụ: `hotfix/0.2.1_fix-auth-crash`)
- Không đặt tên mơ hồ như `temp`, `test`, `new-branch`, `update`.

### 3.3. Quy tắc Commit
Mỗi commit là một thay đổi nhỏ, đơn mục tiêu, dùng tiền tố chuẩn:
- `feat: ...`
- `fix: ...`
- `refactor: ...`
- `docs: ...`
- `test: ...`
- `chore: ...`

**Cấm**:
- Commit kiểu `wip`, `update`, `fix bug` chung chung.
- Gom nhiều task khác nhau vào cùng một commit.
- `git push --force` lên nhánh chung (`main`, `develop`) hoặc sửa lịch sử commit của thành viên khác.

### 3.4. Quy tắc Pull Request & Definition of Done (DoD)
Một task/branch chỉ được coi là **Done** khi thỏa mãn toàn bộ:
- [ ] Đã tách đúng nhánh `feature/#<issue>_<short-description>` từ `develop` mới nhất.
- [ ] Code đã build thành công (`npm run build`, `npm run typecheck`) và pass unit/integration test (`pytest`).
- [ ] Luồng chính đã được chạy kiểm tra thực tế trên máy, không còn lỗi console/runtime do thay đổi mới.
- [ ] *(Nếu có sửa Frontend)* Đã vượt qua **Checklist 10 bước UI/UX & WCAG 2.2 AA** tại Mục 4 dưới đây.
- [ ] Đã mở Pull Request vào `develop` điền đầy đủ theo mẫu `.github/pull_request_template.md` (Issue, Mục tiêu, Ảnh chụp/Bằng chứng test, Rủi ro, Việc cần làm sau merge).
- [ ] Đã được AI/bot review và ít nhất 1 thành viên trong nhóm review & **Approve** (người tạo PR không tự resolve comment của người khác).
- [ ] CI/CD trên GitHub Actions xanh 100%.

---

## 4. Quy Chuẩn Thiết Kế UI/UX & Checklist 10 Bước Bắt Buộc (Frontend)

Mọi thay đổi giao diện trong `frontend/` phải tuân thủ tài liệu đặc tả [docs/UI_UX_MASTER_SPEC.md](docs/UI_UX_MASTER_SPEC.md) và vượt qua **10 bước kiểm duyệt** trước khi commit:

1. **Style Selection Check**: Đúng phong cách của phân hệ (*Style 3 - Drew Barrymore* ấm áp cho Landing/Onboarding/Auth; *Style 1 - Steve Jobs + Eco Accent* tối giản, sắc nét cho Explore/Filter/Planner).
2. **No "AI Slop" Check**: Không dùng gradient rập khuôn, icon/badge trang trí vô nghĩa hoặc thanh cuộn hệ điều hành thô kệch.
3. **Responsive & 320px Reflow Check**: Kiểm tra trên trình duyệt ở cả Desktop (`1280px`) và Mobile (`320px`), không tràn ngang hoặc cắt chữ trên nút CTA.
4. **60-30-10 Color & Token Check**: 60% nền sáng trung tính, 30% cấu trúc & nhận diện xanh (`neutral-900` / `emerald-800` / `forest-700`), 10% màu nhấn dành riêng cho nút CTA chính.
5. **Hierarchy & Typography Check**: Phân cấp 3 tầng thị giác rõ ràng; **cấm dùng cỡ chữ nhỏ hơn `12px` (`text-xs`)**.
6. **Input Context Check**: Chọn đúng loại input theo ngữ cảnh (Preset Pills + Slider thu gọn cho trọng số ưu tiên; Selectable Cards & Number Input rõ ràng cho form thông số chuyến đi).
7. **4-State Feedback Check**: Mọi thành phần gọi API phải có đủ 4 trạng thái: `Loading` (Skeleton), `Populated` (Có dữ liệu), `Empty State` (Có câu dẫn + nút hành động) và `Error State` (Thông báo thân thiện + nút thử lại).
8. **Tinted Shadow & WCAG 2.2 AA Contrast Check**: Dùng bóng đổ ấm cùng tông; chữ thông tin trên nền sáng phải đạt tương phản $\ge 4.5:1$ (tối thiểu `text-neutral-600`, không dùng `text-neutral-400` cho nội dung đọc).
9. **Keyboard & Touch Accessibility Check**: Vùng chạm nút bấm đạt tối thiểu `40px–44px`; hỗ trợ điều hướng phím `Tab` (`focus-visible:ring-2`) và đầy đủ `aria-pressed`, `aria-expanded`, `aria-describedby`.
10. **Animation Performance Check**: Chỉ dùng `transform` và `opacity` cho hiệu ứng chuyển động; không gây lỗi hoặc cảnh báo trên Chrome DevTools Console.


