# GreenTrip AI — Smart Travel Planner for Da Nang & Hue

Nền tảng lập kế hoạch du lịch bền vững thông minh dành cho **Đà Nẵng – Huế** (Capstone Project — **C1SE-44**), kết hợp gợi ý địa điểm xanh, Knowledge Graph giải thích đề xuất, tối ưu lộ trình di chuyển ít phát thải và trợ lý AI Copilot.

---

## Kiến trúc & Công nghệ

| Thành phần | Công nghệ chính |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, React Router, Leaflet / React-Leaflet |
| **Backend API** | FastAPI, Pydantic v2, PyJWT, Argon2 (`pwdlib`), ReportLab (xuất PDF) |
| **Database & Graph** | PostgreSQL / Supabase (kèm fallback SQLite cục bộ khi chưa cấu hình DB), Neo4j Aura |
| **AI & Auth** | Google Gemini (`gemini-2.5-flash`), Google OAuth 2.0, SMTP Gmail OTP |
| **DevOps & CI/CD** | Docker Compose, GitHub Actions (`Backend CI` + `Frontend CI`), Vercel |

---

## Cấu trúc thư mục chính

```text
.
├── backend/
│   ├── app/                # FastAPI modules (auth, pois, recommendations, saved_places, trips, itineraries)
│   ├── migrations/         # SQL migrations (001 → 016) & hướng dẫn trong backend/migrations/README.md
│   ├── neo4j/              # Schema, sample graph và Cypher queries
│   ├── scripts/            # Scripts xử lý, kiểm định & nạp dữ liệu POI
│   └── tests/              # Bộ test pytest cho API & data pipeline
├── frontend/
│   ├── public/             # Tài nguyên tĩnh (images, leaf-route.svg)
│   ├── src/                # React pages, components, services, context, utils
│   └── tests/              # Unit tests (*.test.mjs) & browser harness tests
├── data/                   # Dữ liệu POI Đà Nẵng – Huế (raw/ & processed/)
├── docs/                   # Đặc tả API, UI/UX Master Spec, ERD (.drawio), Postman collection
├── specs/                  # Spec-Driven Development specs theo từng feature
├── docker-compose.yml      # Chạy đồng bộ Backend + Frontend (+ optional local PostGIS)
├── PRD.md                  # Đặc tả sản phẩm: đối tượng dùng, tính năng, user flows, phân quyền
├── AGENTS.md               # Quy tắc làm việc bắt buộc cho thành viên & AI Agent (Antigravity/Codex)
├── .github/copilot-instructions.md  # Con trỏ tự động nạp quy tắc cho GitHub Copilot
├── .cursor/rules/          # Con trỏ tự động nạp quy tắc cho Cursor
├── CONTRIBUTING.md         # Nội quy nhóm & Git Flow Rule
└── DOCKER_GUIDE.md         # Hướng dẫn chi tiết chạy bằng Docker Compose
```

---

## Khởi động nhanh

### 1. Cấu hình biến môi trường

```bash
cp .env.example .env
```

Điền các giá trị thực tế vào `.env` (liên hệ nhóm trưởng để lấy `DATABASE_URL`, `NEO4J_*`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `SMTP_*` nội bộ). **Không bao giờ commit file `.env`.**

### 2. Chạy bằng Docker Compose (Khuyên dùng)

Xem chi tiết tại [DOCKER_GUIDE.md](DOCKER_GUIDE.md):

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend Swagger Docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

### 3. Chạy trực tiếp trên máy (Local Dev)

**Backend (Python 3.12+):**

```bash
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
# macOS/Linux:        source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --reload --port 8000
```

**Frontend (Node.js 22+):**

```bash
cd frontend
npm ci
npm run dev
```

*(Trên Windows có thể dùng nhanh `.\start-dev.ps1` hoặc `start-dev.bat` sau khi đã tạo `.venv` và cài packages).*

---

## Kiểm thử trước khi tạo Pull Request

Mọi PR vào `develop` đều phải đi qua checklist trong [CONTRIBUTING.md](CONTRIBUTING.md) và vượt qua các lệnh sau:

```bash
# Backend
python -m compileall -q backend/app backend/tests
pytest -v backend/tests

# Frontend (trong thư mục frontend/)
npm run lint:ci
npm run typecheck
npm run test:unit
npm run build
```

---

## Tài liệu tham chiếu quan trọng

- **Đặc tả sản phẩm (đọc trước khi code)**: [PRD.md](PRD.md)
- **Quy trình nhóm, AI Agent & Git Flow**: [AGENTS.md](AGENTS.md) · [CONTRIBUTING.md](CONTRIBUTING.md)
- **Thứ tự SQL Migrations**: [backend/migrations/README.md](backend/migrations/README.md)
- **Thiết kế UI/UX**: [docs/UI_UX_MASTER_SPEC.md](docs/UI_UX_MASTER_SPEC.md)
- **Thiết lập Neo4j Aura**: [docs/NEO4J_AURA_SETUP.md](docs/NEO4J_AURA_SETUP.md)
- **Security Review (Sprint 1)**: [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md)
