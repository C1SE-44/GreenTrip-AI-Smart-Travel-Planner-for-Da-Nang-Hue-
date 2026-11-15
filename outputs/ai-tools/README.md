# Hướng Dẫn & Bằng Chứng Tích Hợp AI Tools (Graphify & Ponytail)

Tài liệu này ghi nhận việc thiết lập, trạng thái vận hành và bằng chứng tích hợp của bộ đôi công cụ **Graphify** và **Ponytail** dùng chung giữa **Antigravity** và **Codex**.

---

## 1. Mục Tiêu & Cơ Chế Hoạt Động

- **Vấn đề giải quyết**: Tránh việc AI Agent phải đọc lại toàn bộ mã nguồn (>300 file) mỗi khi nhận câu hỏi/yêu cầu mới, gây lãng phí lớn token và làm loãng ngữ cảnh.
- **Giải pháp**:
  - **Graphify**: Lập chỉ mục cây quan hệ code (AST/symbol graph) gồm file, component, function, model và caller/callee. Cung cấp CLI truy vấn symbol có giới hạn token (`--budget 700`).
  - **Ponytail**: Quy trình làm việc tinh gọn (Surgical Coding): tra cứu bảng định tuyến `docs/AI_CONTEXT.md` -> truy vấn targeted symbol -> chỉ đọc và sửa đúng file mục tiêu -> chạy test cục bộ -> cập nhật roadmap.

---

## 2. Bằng Chứng Cài Đặt & Cấu Hình

### A. Graphify
- **Kho nguồn**: `https://github.com/Graphify-Labs/graphify` (Graphify Labs)
- **Chỉ mục cục bộ**: Đã quét 318 file mã nguồn, khởi tạo đồ thị 2.751 nodes / 6.299 relations.
- **Cache**: Đã lưu tại cache cục bộ (`graphify-out/`), toàn bộ các lần chạy sau sử dụng cache tức thì (`--code-only`), **hoàn toàn không gọi LLM bên ngoài**.
- **CLI Script**: `scripts/graphify.ps1` hỗ trợ các lệnh:
  ```powershell
  # Cập nhật đồ thị khi có thay đổi code
  .\scripts\graphify.ps1 extract . --code-only

  # Truy vấn quan hệ của 1 component/symbol với giới hạn token
  .\scripts\graphify.ps1 query "AddToTripModal" --depth 1 --budget 700
  ```

### B. Ponytail
- **Kho nguồn**: `https://github.com/DietrichGebert/ponytail`
- **Tích hợp**: 
  - Quy tắc định tuyến tập trung tại `docs/AI_CONTEXT.md`.
  - Hướng dẫn thực hành tại `.agents/skills/ponytail/SKILL.md`.

### C. Khả Năng Tương Thích Dùng Chung (Codex & Antigravity)
- Thư mục skill chuẩn `.agents/skills/` được thiết lập tại root repo:
  - `.agents/skills/graphify/SKILL.md`
  - `.agents/skills/ponytail/SKILL.md`
- Cả **Codex** và **Antigravity** đều tự động quét và nhận diện các skill nằm trong thư mục `.agents/skills/`.

---

## 3. Tổng Hợp Số Lượng Skill Hiện Có

1. **Workspace Skills (Dùng chung trong repo qua `.agents/skills/`)**: **2 skills**
   - `graphify`: Truy vấn đồ thị mã nguồn, callers/callees có budget.
   - `ponytail`: Phương pháp làm việc minimal-context, tra cứu định tuyến trực tiếp.
2. **Platform & Ecosystem Skills (Antigravity & Plugins)**: **48 skills**
   - Vercel (CLI, Functions, Deployments, Storage, Flags, Firewall, AI Gateway, Chat SDK, Workflows...).
   - Supabase (Postgres Best Practices, Migrations, Auth, Edge Functions...).
   - UI & Development (Generative UI, React Best Practices, Native Swarm...).
3. **Tổng cộng**: **50 skills** sẵn sàng hoạt động.

---

## 4. Liên Kết Nhanh
- **Roadmap tiến độ**: [AI_ROADMAP.md](AI_ROADMAP.md) (hoặc [docs/AI_ROADMAP.md](../../docs/AI_ROADMAP.md))
- **Bảng định tuyến file nguồn**: [docs/AI_CONTEXT.md](../../docs/AI_CONTEXT.md)
- **Hướng dẫn chi tiết công cụ**: [docs/AI_TOOLS.md](../../docs/AI_TOOLS.md)
