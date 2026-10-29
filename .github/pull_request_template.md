## 1. Issue / Task liên quan
- **Mã Task / Backlog**: `#PB__` (Ví dụ: `#PB07`, `#PB08`, `#PB09`, `#PB10`)
- **Người thực hiện (Assignee)**: @
- **Nhánh nguồn -> Nhánh đích**: `feature/#...` -> `develop`

---

## 2. Mục tiêu thay đổi
- **Tóm tắt 1 câu về việc đã làm**:
  - ...
- **Các thay đổi chính trong PR này**:
  - ...

---

## 3. Bằng chứng kiểm thử thực tế (Evidence)
> *"Demo là phần chạy được trên máy, không phải slide trạng thái."*

### 3.1. Kết quả chạy kiểm thử tự động (Backend / Frontend)
- [ ] Backend (`pytest -v backend/tests`):
  ```text
  (Dán kết quả chạy pytest tại đây)
  ```
- [ ] Frontend (`npm run lint && npm run typecheck && npm run build`):
  ```text
  (Dán kết quả build/typecheck tại đây)
  ```

### 3.2. Ảnh chụp màn hình / Video kết quả chạy thực tế trên máy
*(Đính kèm ảnh chụp giao diện hoặc response từ Swagger/Postman)*

---

## 4. Ghi chú rủi ro / Ảnh hưởng (Risks & Impact)
- **Phạm vi ảnh hưởng**: ...
- **Rủi ro / Edge cases còn lại (nếu có)**: ...

---

## 5. Việc thành viên khác cần thực hiện sau khi Merge (Post-Merge Actions)
- [ ] Không cần thao tác thêm.
- [ ] Cần cập nhật biến môi trường trong `.env` (nêu rõ tên biến): ...
- [ ] Cần chạy lại script database / migration (nêu rõ câu lệnh): ...
- [ ] Cần cài đặt thêm thư viện (`pip install -r backend/requirements.txt` / `npm ci` / `docker compose up --build`): ...

---

## 6. Checklist tự kiểm tra trước khi yêu cầu Review & Merge
- [ ] **Branch**: Đặt tên đúng chuẩn `feature/#<issue>_<short-description>` hoặc `bugfix/#<issue>_<short-description>` và tách từ `develop`.
- [ ] **Scope Lock**: Chỉ sửa đúng các file thuộc phạm vi task, không tự ý refactor lan man.
- [ ] **Clean Code**: Đã tự đọc lại `git diff`, xóa toàn bộ dead code, comment lỗi thời, `console.log`/debug log và đảm bảo không lộ secret/API key.
- [ ] **Commit**: Các commit nhỏ, rõ nghĩa theo chuẩn (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- [ ] **Review**: Đã được AI review và gán ít nhất 1 Reviewer trong nhóm (không tự ý `Resolve` comment của người khác).
- [ ] **CI/CD**: Toàn bộ checks trên GitHub Actions đã xanh.
- [ ] **Merge Target**: Đã trỏ đúng vào nhánh `develop` (tuyệt đối không mở PR thẳng từ `feature/*` vào `main`).

