---
name: graphify
description: >-
  Knowledge graph tool for querying code symbols, callers, callees, and dependencies
  with strict token budgets to avoid full codebase re-reads.
---

# Graphify — Truy Vấn Đồ Thị Mã Nguồn

Graphify xây dựng và truy vấn đồ thị quan hệ trong codebase (file, component, hàm, biến, type) với chi phí token tối thiểu.

## Các lệnh thường dùng (chạy từ root repo):

```powershell
# Refresh đồ thị sau khi code thay đổi (chế độ incremental, chỉ quét code)
.\scripts\graphify.ps1 extract . --code-only

# Truy vấn Component/Hàm cụ thể với ngân sách token giới hạn
.\scripts\graphify.ps1 query "<SymbolName>" --depth 1 --budget 700

# Giải thích symbol
.\scripts\graphify.ps1 explain "<SymbolName>"
```

## Lưu ý an toàn & Tiết kiệm:
- Luôn kèm cờ `--code-only` và `--budget 700` hoặc `--budget 1200`.
- Không gọi cluster semantic với LLM nếu không cần thiết.
- Đồ thị đã lưu sẵn trong cache cục bộ, tái sử dụng giữa các phiên làm việc của Codex và Antigravity.
