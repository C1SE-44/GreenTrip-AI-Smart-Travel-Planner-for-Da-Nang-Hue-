# Công cụ context — GreenTrip

## Nguồn và phạm vi

- Graphify: https://github.com/Graphify-Labs/graphify, revision `52cb28218eea0c68d80a9f4b2ae102d2fa63e267`, package graphifyy 0.9.108. Cài trong môi trường riêng ở `%USERPROFILE%/Documents/Codex/tools/graphify-0.9.108`; không thêm dependency frontend/backend.
- Ponytail: https://github.com/DietrichGebert/ponytail, revision `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846`, bản repo 5.3.3. Skill `skills/ponytail` cài bằng skill-installer vào `%USERPROFILE%/.codex/skills/ponytail`. Đây là hướng dẫn làm việc cho AI, không có tiến trình server cần khởi động. Trong lượt thiết lập đã áp dụng full: tái dùng CLI, chỉ thêm chỉ mục/định tuyến, không chỉnh code sản phẩm hay cài thư viện vào app.
- Skill mới được liệt kê ở phiên/turn mới; nếu chưa thấy, mở lại Codex. Tài liệu trong repo vẫn dùng được ngay khi đổi model.

## Dùng trên máy hiện tại

Tại root repo, PowerShell:

```powershell
# Lập chỉ mục lần đầu hoặc refresh sau khi code thay đổi (incremental mặc định)
.\scripts\graphify.ps1 extract . --code-only

# Tạo lại HTML/report khi muốn xem bản đồ; không gọi LLM để đặt tên cụm
.\scripts\graphify.ps1 cluster-only . --no-label

# Chỉ lấy ngữ cảnh liên quan, dùng tên symbol tiếng Anh trong code
.\scripts\graphify.ps1 query "AddToTripModal" --depth 1 --budget 700
.\scripts\graphify.ps1 query "matchesTimeOfDay" --seed frontend_src_components_poi_explorefiltermodal_matchestimeofday --context call --depth 1 --budget 700
.\scripts\graphify.ps1 query "matchesTimeOfDay" --seed frontend_src_pages_explorepage_matchestimeofday --context call --depth 1 --budget 700
.\scripts\graphify.ps1 explain "SPIRITUAL_CATEGORY_NAMES"
```

Nếu PowerShell chặn chạy script, dùng executable trực tiếp, không cần đổi ExecutionPolicy toàn máy:

```powershell
& "$env:USERPROFILE\Documents\Codex\tools\graphify-0.9.108\Scripts\graphify.exe" query "AddToTripModal" --budget 1200
```

Lệnh trực tiếp phải chạy từ root repo. Output ở `graphify-out/`, đã được gitignore sẵn. Không in toàn bộ output vào chat. `.graphifyignore` loại credential, dữ liệu và build/cache; luôn dùng **--code-only**, không dùng semantic extraction/cloud/--postgres hay đọc .env. Chỉ mục code không xác minh hành vi runtime, API hoặc quan hệ động/SQL chưa được parser hỗ trợ.

## Tránh đọc lại dự án

- Mỗi lượt: AGENTS.md → AI_CONTEXT.md → một truy vấn Graphify có budget → code/callers/test đúng phần. Roadmap chỉ đọc phần backlog liên quan.
- Không dựng lại graph cho mỗi câu hỏi. Nếu không đổi code, dùng graph hiện tại. Khi code đổi, refresh bằng `extract . --code-only`; khi xóa file/đổi phạm vi quét, kiểm kết quả và chỉ dùng `--force` khi cần dựng lại.
- Đối chiếu thời điểm graph với `git status`/`git diff`; không coi HEAD giống nhau là graph còn mới vì repo có thay đổi chưa commit.
- Nếu query không ra đúng phần, tìm tên symbol bằng `rg` trong module, rồi query tên đó hoặc đọc phạm vi nhỏ. Không chuyển ngay sang đọc toàn repo.
- Ưu tiên tên symbol chính xác + `--depth 1` (đã thử AddToTripModal: 4 nút liên quan). Nếu CLI báo trùng tên ở nhiều file, lấy full node id nó trả về, dùng `--seed <id> --context call`. Đã thử hai matchesTimeOfDay: mỗi query 2 nút, đúng caller. `path::symbol()` vẫn có thể mở rộng quá nhiều node ở phiên bản này. Không tăng budget hàng chục nghìn chỉ để lấy mọi node trong truy vấn quá rộng.
- Đổi model: đọc AI_CONTEXT.md, task đang giao và AI_ROADMAP.md. Sau task cập nhật trạng thái, quyết định, kiểm thử/bằng chứng và phần chưa kiểm. Chưa được chốt nghiệp vụ thì giữ nhãn “cần chốt”, không tự đoán.

## Cài lại trên máy khác

Tạo venv riêng bằng Python >=3.10,<3.15; clone Graphify, checkout revision trên, rồi `python -m pip install <đường-dẫn-clone>` và `python -m pip install tree-sitter-sql==0.3.13` để có cả SQL. Chạy `graphify install --platform codex` để cài skill. Venv/executable đường dẫn khác thì chỉnh đúng một biến `$toolExecutable` trong scripts/graphify.ps1. Ponytail cài bằng skill-installer với repo/ref/path ở trên. Không sao chép venv giữa các máy.

Chỉ mục tự sinh không cần commit. AGENTS.md, docs/AI_*.md, .graphifyignore và scripts/graphify.ps1 là phần bàn giao cần giữ trong repo; lượt thiết lập không commit/push.
