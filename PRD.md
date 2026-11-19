# PRD — GreenTrip AI (Smart Travel Planner for Da Nang & Hue)

> **Quy tắc bắt buộc**: Trước khi code bất kỳ tính năng mới nào hoặc thay đổi hành vi sản phẩm, cả thành viên nhóm và AI Agent phải đọc, đối chiếu và cập nhật (nếu cần) file `PRD.md` này, sau đó xác nhận lại yêu cầu trước khi sửa code.

---

## 1. Tổng quan & Mục tiêu sản phẩm

**GreenTrip AI** là ứng dụng web lập kế hoạch du lịch thông minh và bền vững dành riêng cho khu vực **Đà Nẵng – Huế** (Capstone Project — **C1SE-44**).

**Bài toán cần giải quyết:**
- Du khách đi Đà Nẵng – Huế thường mất nhiều thời gian gom địa điểm rời rạc, khó cân đối giữa ngân sách – sức khỏe/nhịp độ – yếu tố du lịch xanh ít phát thải CO₂.
- Các gợi ý chung chung thường thiếu lời giải thích thuyết phục (*vì sao nơi này hợp với chuyến đi của tôi?*).

**Giá trị cốt lõi:**
- Khám phá & lọc địa điểm (POI) kèm nhãn **Địa điểm xanh** và bản đồ tương tác đồng bộ.
- Gợi ý cá nhân hóa đa tiêu chí (ngân sách, nhịp độ, trọng số ưu tiên) kết hợp **Knowledge Graph (Neo4j)** để giải thích đề xuất.
- Lập lịch trình theo ngày kèm tối ưu lộ trình (giảm đi vòng zig-zag), ước tính phát thải CO₂ theo phương tiện, dự báo ngân sách và trợ lý **AI Copilot**.

---

## 2. Đối tượng sử dụng website

| Nhóm người dùng | Nhu cầu chính | Phạm vi thao tác |
| :--- | :--- | :--- |
| **1. Khách (Chưa đăng nhập / Guest)** | Xem thử sản phẩm, khám phá địa điểm xanh Đà Nẵng – Huế, dùng thử bản đồ và tạo lịch nháp trên trình duyệt. | Truy cập `/`, `/home`, `/explore`, `/chat`, `/planner`, `/trips` (lưu nháp local trên trình duyệt, chưa đồng bộ tài khoản). |
| **2. Du khách đã đăng nhập (Authenticated User)** | Lưu địa điểm yêu thích theo bộ sưu tập, tạo & quản lý nhiều chuyến đi cá nhân, đồng bộ lịch trình lên server, hỏi AI Copilot theo ngữ cảnh chuyến đi, xuất lịch trình. | Toàn bộ quyền của Khách + quản lý hồ sơ `/profile`, bộ sưu tập `/saved`, chuyến đi `/my-trips`, đồng bộ DB (`saved-places`, `my-trips`, `trips/{id}/itinerary`). |
| **3. Thành viên nhóm phát triển / Quản trị kỹ thuật** | Nạp & kiểm định dữ liệu POI/Neo4j, chạy migration SQL, rà soát chất lượng code, bảo mật và CI/CD. | Thao tác trên repo, `backend/scripts/`, `backend/migrations/`, `backend/neo4j/`, GitHub Actions. |

---

## 3. Danh sách tính năng cốt lõi

### 3.1. Xác thực & Hồ sơ cá nhân (`Auth` — PB01)
- Đăng ký bằng Email + xác thực mã OTP qua SMTP (`/verify-email`), đăng nhập Email/Mật khẩu, đăng nhập nhanh bằng **Google OAuth 2.0**.
- Quên mật khẩu / đặt lại mật khẩu, đổi mật khẩu, cập nhật thông tin cá nhân & ảnh đại diện (`/profile`).
- Onboarding ban đầu (`/onboarding`) để thu thập sở thích và thành phố quan tâm.

### 3.2. Khám phá địa điểm & Bản đồ xanh (`Explore` — PB08, PB10)
- Trang chủ tổng quan (`/home`) và trang khám phá (`/explore`) gồm 2 cột: danh sách thẻ POI (Ẩm thực, Di tích, Cảnh quan, Chùa) + bản đồ Leaflet (`PoiMap`) đồng bộ hover/select theo thời gian thực.
- Lọc theo thành phố (Đà Nẵng, Huế), danh mục, từ khóa và trọng số ưu tiên bền vững (`GET /pois/weights`, `GET /pois`).
- Xem chi tiết địa điểm (`PoiDetailSection`) và mở modal giải thích **Vì sao địa điểm này phù hợp?** từ Knowledge Graph (`GET /pois/{poi_id}/explanation-facts`).

### 3.3. Địa điểm đã lưu & Bộ sưu tập (`Saved Places`)
- Thả tim lưu địa điểm và phân loại vào các bộ sưu tập cá nhân (`/saved`).
- Tạo, đổi tên, xóa bộ sưu tập; thêm/xóa địa điểm khỏi từng bộ sưu tập (`GET/POST/PATCH/DELETE /saved-places/*`).

### 3.4. Lập kế hoạch chuyến đi & Tối ưu lịch trình (`Trip Planner` — PB07, PB09, PB11)
- Thiết lập thông số chuyến đi: Điểm đến (Đà Nẵng / Huế / Cả 2), thời gian/số ngày, số lượng du khách, ngân sách theo từng nhóm (Ăn uống, Lưu trú, Hoạt động).
- Quản lý kho **Ý tưởng (Ideas)** và kéo/thêm địa điểm từ Tìm kiếm, Đã thích hoặc Tùy chỉnh vào từng ngày.
- Gợi ý địa điểm tối ưu theo bối cảnh chuyến đi (`POST /v1/recommendations/poi`).
- Sắp xếp lịch trình tự động theo nhịp độ (`Relaxed` / `Balanced` / `Fast`), chèn giờ nghỉ hợp lý, cảnh báo giờ mở cửa, phương án dự phòng ngày mưa.
- Tối ưu thứ tự điểm dừng giảm đi vòng (zig-zag), tính quãng đường & ước tính phát thải CO₂ theo phương tiện (ô tô, xe máy, công cộng, đi bộ), theo dõi tổng chi phí so với ngân sách.
- Hiển thị bản đồ đường đi theo từng ngày hoặc toàn chuyến, hỗ trợ xuất lịch trình (PDF / `.ics` / checklist hành trang xanh).

### 3.5. Trợ lý AI du lịch (`AI Copilot` — PB14)
- Chat trực tiếp trong không gian chuyến đi (`TripOverviewView`) hoặc trang `/chat` (`POST /trips/copilot/chat`).
- AI tư vấn địa điểm, phương tiện xanh, đặc sản bản địa; nhận diện tên địa điểm để highlight trên bản đồ và cho phép thêm nhanh vào Ý tưởng hoặc cập nhật lịch trình.
- Tích hợp ngăn **Cẩm nang Bản địa Xanh** (phong thủy Cố đô, trang phục di sản, di chuyển cho người lớn tuổi, phương án mùa mưa).

---

## 4. Luồng hoạt động chính của người dùng (User Flows)

### Luồng 1: Truy cập lần đầu & Đăng nhập
1. Người dùng vào `/` (`LandingPage`) → chọn **Khám phá ngay** (vào thẳng `/explore` ở chế độ Guest) hoặc **Đăng nhập / Đăng ký** (`/login`, `/register`).
2. Nếu đăng ký bằng Email → hệ thống gửi OTP → người dùng nhập OTP tại `/verify-email` → hoàn tất Onboarding (`/onboarding`) → chuyển vào `/home` hoặc `/explore`.
3. Nếu đăng nhập Google OAuth → xác thực token với `POST /auth/google` → nhận JWT và vào ứng dụng.

### Luồng 2: Khám phá & Lưu địa điểm yêu thích
1. Tại `/explore`, người dùng chọn thành phố (Đà Nẵng / Huế), lọc danh mục hoặc kéo trọng số ưu tiên xanh.
2. Di chuột vào thẻ POI → ghim tương ứng sáng nổi bật trên `PoiMap`; bấm vào thẻ → mở chi tiết POI và xem giải thích Knowledge Graph.
3. Bấm biểu tượng tim → nếu đã đăng nhập, mở hộp chọn bộ sưu tập và lưu về `/saved` qua `/saved-places`.

### Luồng 3: Tạo chuyến đi & Chat cùng AI Copilot
1. Người dùng vào `/planner` (`/trips` / `/my-trips`) → bấm **Tạo chuyến đi mới** → chọn Điểm đến, Ngày đi, Số khách, Ngân sách.
2. Trong màn hình tổng quan chuyến đi (`TripOverviewView`), cột trái là **AI Copilot Chat**, cột phải là **Bản đồ & Drawer Ý tưởng / Lịch trình / Cẩm nang**.
3. Người dùng hỏi AI (hoặc chọn prompt gợi ý) → AI trả lời kèm danh sách địa điểm gợi ý → người dùng bấm **+ Thêm vào Ý tưởng** hoặc **Xem lịch theo ngày**.

### Luồng 4: Xếp lịch theo ngày, Tối ưu xanh & Xuất lịch trình
1. Người dùng mở `TripItineraryView` (dạng Drawer hoặc toàn màn hình).
2. Chọn nhịp độ (`Thư thả` / `Cân bằng` / `Khám phá nhiều`) để hệ thống xếp lịch gợi ý, hoặc tự thêm/xóa/đổi giờ/ghi chú từng điểm dừng.
3. Bấm **Tối ưu đường đi** để gom cụm điểm gần nhau, đổi phương tiện để xem mức giảm phát thải CO₂ và kiểm tra thanh ngân sách.
4. Lưu lịch trình (đồng bộ qua `PUT /trips/{trip_id}/itinerary` nếu đã đăng nhập) và xuất file PDF / `.ics`.

---

## 5. Ma trận phân quyền & Bảo mật API

Mọi thay đổi liên quan đến API phải được kiểm thử cả trường hợp hợp lệ, thiếu token (`401`) và truy cập chéo dữ liệu người khác (`403` / `404`):

| Nhóm Endpoint | Yêu cầu xác thực | Ghi chú phân quyền |
| :--- | :--- | :--- |
| `GET /health`, `GET /pois/*`, `GET /itineraries/*`, `POST /v1/recommendations/poi` | Công khai (Public) | Chỉ trả dữ liệu địa điểm / gợi ý / tuyến mẫu công khai. |
| `POST /auth/login`, `/register`, `/verify-email`, `/google`, `/check-email` | Công khai + Rate Limit | Giới hạn tần suất để chống brute-force/spam OTP. |
| `GET/PATCH /auth/me`, `POST /auth/change-password`, `PUT /auth/me/avatar` | Bắt buộc JWT (`get_current_user_id`) | Chỉ đọc/sửa hồ sơ của chính chủ token. |
| `/saved-places/*` | Bắt buộc JWT (`get_current_user_id`) | Mọi bộ sưu tập và địa điểm lưu gắn chặt `user_id` của người đăng nhập. |
| `/my-trips/*` | Bắt buộc JWT (`get_current_user_id`) | Chỉ chủ sở hữu `trip` mới được xem, sửa, xóa, xuất PDF chuyến đi của mình. |
| `/trips/{trip_id}/itinerary`, `POST /trips/copilot/chat` | JWT (tùy chọn cho Guest demo hoặc kiểm tra owner nếu có `user_id`) | Copilot có Rate Limit; với chuyến đi gắn tài khoản phải kiểm tra quyền sở hữu trước khi ghi đè. |

---

## 6. Checklist kiểm tra PRD trước khi code tính năng mới

Trước khi tạo nhánh và viết code, người thực hiện (và AI Agent) cần trả lời nhanh 4 câu sau:
- [ ] Tính năng này phục vụ **đối tượng người dùng** nào ở Mục 2?
- [ ] Luồng thao tác đi qua màn hình / API nào? Có ảnh hưởng tới luồng cũ ở Mục 4 không?
- [ ] Yêu cầu **phân quyền & validation** ra sao (Guest vs User đã đăng nhập, lỗi `400/401/403/404`)?
- [ ] Phạm vi **không làm** trong task hiện tại là gì để tránh sửa lan man?

---

## 7. Tài liệu đặc tả chi tiết liên quan
- Thiết kế UI/UX chuẩn: [docs/UI_UX_MASTER_SPEC.md](docs/UI_UX_MASTER_SPEC.md)
- Đặc tả AI Copilot: [docs/COPILOT_AI_ADAPTATION_SPEC.md](docs/COPILOT_AI_ADAPTATION_SPEC.md)
- Hợp đồng Auth PB01: [docs/PB01-SIGNUP-API-CONTRACT.md](docs/PB01-SIGNUP-API-CONTRACT.md)
- Thông số chuyến đi PB07: [docs/PB07-TRIP-PARAMETERS-WIREFRAME-AND-CONTRACT.md](docs/PB07-TRIP-PARAMETERS-WIREFRAME-AND-CONTRACT.md)
- Xếp lịch & Nghỉ ngơi PB11: [docs/PB11-TRAVEL-ASSISTANT-REST-PLANNING.md](docs/PB11-TRAVEL-ASSISTANT-REST-PLANNING.md)
- Luồng tư vấn POI: [docs/user_flows/copilot_poi_advice_flow.md](docs/user_flows/copilot_poi_advice_flow.md)
