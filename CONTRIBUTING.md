# Sổ Tay Quy Trình Làm Việc Nhóm & Git Flow — GreenTrip AI

Tài liệu này thống nhất **Nội quy làm việc nhóm** và **Chiến lược quản lý nhánh (Git Flow Rule)** cho toàn bộ thành viên dự án **GreenTrip AI — Smart Travel Planner for Da Nang & Hue**.

---

## Phần I. Nội Quy Làm Việc Nhóm

### 1. Giờ giấc làm việc (`08:00 – 17:00`)
- **08:00**: Đã ngồi vào việc — máy mở, tài khoản đăng nhập, sẵn sàng nhận task.
- **17:00**: Hết ca. Nếu ở lại làm tiếp thì báo nhóm trưởng trước.
- **Muộn, vắng hoặc về sớm**: Nhắn trước vào kênh nhóm, nói rõ lý do và giờ có mặt.
- **Nghỉ giữa ngày**: Theo lịch chung; hết giờ nghỉ là vào việc lại ngay.

### 2. Họp Daily hằng ngày (15 phút đầu giờ sáng)
- Mỗi nhóm họp 1 lần vào đầu giờ sáng, tối đa **15 phút** (mỗi người nói khoảng **1 phút**).
- Đủ mặt; nếu vắng phải nhắn nhóm trước giờ họp.
- Chỉ nói việc đang cầm; các câu hỏi thảo luận kỹ thuật chi tiết để sau buổi Daily.
- **Cách nói trong Daily — Đúng 3 câu**:
  1. **Hôm qua em xong việc gì.**
  2. **Hôm nay em làm việc gì.**
  3. **Em đang kẹt ở đâu, cần ai.**
  > *Mẫu chuẩn*: "Hôm qua em xong phần parse trọng số PB08. Hôm nay em nối trọng số vào truy vấn POI và thanh trượt UI. Em đang cần xác nhận trần chi phí 1.000.000đ, nhờ nhóm trưởng xem sau daily."

### 3. Chủ động trao đổi công việc & Báo kẹt
1. **Yêu cầu còn chưa rõ** thì hỏi trước khi mở code.
2. **Kẹt khoảng 1 tiếng** thì nói ngay với người trong nhóm.
3. **Vẫn chưa gỡ được** thì đưa lên mentor, kèm phần mình đã thử.
4. **Sắp trễ hạn** thì báo ngay trong ngày, không đợi bị hỏi.

**Cách nhắn tin sao cho người nhận trả lời được ngay (3 ý bắt buộc)**:
> **Đang làm gì. Đã thử gì. Cần quyết định / hỗ trợ gì.**
- ❌ *Chưa đủ*: "Em bị lỗi ạ."
- ✅ *Đủ để xử lý*: "Task PB10 giải thích địa điểm. API `/pois/{id}/explanation-facts` trả 503. Em đã kiểm tra biến `NEO4J_URI` trong `.env`. Em cần xác nhận thông tin kết nối Neo4j Aura hiện tại."

### 4. Phân vai trong nhóm (6–7 thành viên)
- **Mỗi người cầm một việc rõ ràng trong ngày**, cùng daily, cùng xem bài (review code), cùng demo. Không tự tách nhóm hay gộp nhóm.
- **Nhóm trưởng**:
  1. Chốt giờ daily và điểm danh.
  2. Nhắc thành viên chưa cập nhật việc.
  3. Đưa việc kẹt lâu lên mentor.
- **Thành viên**:
  1. Cầm một việc, nói được tên việc đó.
  2. Báo ngay khi xong, hoặc khi bắt đầu kẹt.
  3. Xong sớm thì chủ động hỏi ai đang cần người hỗ trợ.

### 5. Cách nhận task cho rõ (4 bước)
1. **Đọc hết yêu cầu** trước khi sửa code.
2. **Nhắc lại việc bằng một câu** và xác nhận với người giao.
3. **Làm một phần nhỏ chạy được**, rồi mới làm tiếp.
4. **Nhờ người trong nhóm xem bài** trước khi báo xong.

### 6. Nhịp làm việc 1 tuần của nhóm
| Thời điểm | Hoạt động trọng tâm |
| :--- | :--- |
| **01. Đầu tuần** | Chia việc. Mỗi người biết rõ phần mình cầm. |
| **02. Mỗi sáng** | Họp Daily. Nói đúng ba câu, rồi vào việc. |
| **03. Giữa tuần** | Xem bài (review PR, chạy thử nhánh) của nhau trước khi nộp. |
| **04. Cuối tuần** | Demo phần chạy được trên máy, nói rõ phần còn thiếu. *(Demo là phần chạy được trên máy, không phải slide trạng thái).* |

### 7. Bốn việc tuyệt đối KHÔNG làm (Làm hỏng cả nhóm)
1. Ngồi im đến cuối ngày mới nói là chưa xong.
2. Daily đáp "không có gì" trong khi đang cầm task.
3. Tự đổi yêu cầu, không hỏi người giao việc.
4. Đưa mã nguồn, mật khẩu hoặc dữ liệu của dự án ra ngoài nhóm.

---

## Phần II. Git Flow Rule

Quy ước vận hành branch và chiến lược review theo tinh thần [Atlassian Gitflow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow) đã đơn giản hóa:

### 1. Vai trò từng nhánh
| Nhánh | Mục đích & Quy định |
| :--- | :--- |
| `main` | Nhánh chính thức ghi lại lịch sử release. **Cấm commit trực tiếp lên `main`**. Mỗi lần merge vào `main` đi kèm version tag (`v0.1.0_stg`, `v1.0.0_prod`). |
| `develop` | Nhánh tích hợp trung gian cho toàn bộ feature đang phát triển. Chỉ nhận merge từ `feature/*`, `bugfix/*`, `release/*`, `hotfix/*` qua PR. Luôn phải ở trạng thái build được. |
| `feature/*` | Tách từ `develop` cho từng task/issue riêng (ví dụ PB07, PB08, PB09, PB10). Chỉ chứa đúng phạm vi task đang làm. Xong thì mở PR merge vào `develop`. |
| `bugfix/*` | Tách từ `develop` để sửa lỗi phát hiện trong lúc phát triển. Chỉ sửa đúng phạm vi bug, không thêm tính năng mới. Xong mở PR vào `develop`. |
| `release/*` | Tách từ `develop` khi chốt phiên bản. Chỉ sửa bug cuối kỳ, text, format, version, changelog. Không thêm feature mới. Xong merge vào cả `main` và `develop` rồi đánh tag. |
| `hotfix/*` | Tách từ `main` (hoặc `release/*`, `tag`) khi vá lỗi khẩn cấp trên production. Xong merge vào cả `main` và `develop`. |

### 2. Quy tắc đặt tên branch
- Viết thường, ngắn gọn, có ý nghĩa, không dùng tiếng Việt có dấu hay ký tự lạ.
- Dùng dấu gạch dưới `_` để tách mã issue và dấu gạch ngang `-` cho nội dung mô tả:
  - `feature/#<issue>_<short-description>` -> Ví dụ: `feature/#pb07_trip-params-validation`, `feature/#pb08_sustainability-slider-ranking`, `feature/#pb09_content-based-filtering`, `feature/#pb10_why-this-place-ui`
  - `bugfix/#<issue>_<short-description>` -> Ví dụ: `bugfix/#pb08_zero-weights-fallback`
  - `release/<version>` -> Ví dụ: `release/0.2.0`
  - `hotfix/<version>_<short-description>` -> Ví dụ: `hotfix/0.2.1_fix-cors-header`
- Không dùng tên mơ hồ như `temp`, `test`, `new-branch`.

### 3. Quy tắc Commit
Mỗi commit phải là một thay đổi nhỏ, rõ mục đích, theo định dạng Conventional Commits:
- `feat: ...` (Thêm tính năng mới)
- `fix: ...` (Sửa lỗi)
- `refactor: ...` (Tái cấu trúc code không đổi hành vi)
- `docs: ...` (Cập nhật tài liệu)
- `test: ...` (Thêm/sửa bài kiểm thử)
- `chore: ...` (Cấu hình build, công cụ, thư viện)

**Checklist trước mỗi lần Commit**:
- [ ] Tự đọc lại `git diff` như một reviewer.
- [ ] Dùng AI review lại toàn bộ code đã thay đổi.
- [ ] Xóa toàn bộ code thừa, dead code, comment lỗi thời, log debug.
- [ ] Không commit kiểu `wip`, `update`, `fix bug` chung chung; không gom nhiều task vào 1 commit.

### 4. Quy trình chuẩn khi bắt đầu & kết thúc Task

#### Khi bắt đầu task mới:
```bash
git checkout develop
git pull origin develop
git checkout -b feature/#pb08_sustainability-slider-ranking
```
Làm đúng phạm vi task -> Commit theo từng bước nhỏ -> Push branch lên remote cuối ngày để backup:
```bash
git push -u origin feature/#pb08_sustainability-slider-ranking
```

#### Khi hoàn thành feature:
1. Chạy kiểm thử local và lấy bằng chứng (ảnh chụp UI, kết quả chạy `pytest` và `npm run build`).
2. Tự review lại `git diff`, tạo Pull Request vào nhánh `develop` theo mẫu tự động `.github/pull_request_template.md`.
3. Gán **Assignee** (người làm) và **Reviewer** (ít nhất 1 thành viên trong nhóm).
4. Phản hồi và sửa toàn bộ comment từ AI/bot và Reviewer (ai là người comment thì người đó bấm `Resolve`).
5. Khi đã có **Approve** và **CI xanh**, tiến hành merge (ưu tiên `Squash and merge` cho feature branch để giữ lịch sử `develop` sạch).

