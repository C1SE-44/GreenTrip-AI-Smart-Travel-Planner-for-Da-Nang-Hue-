# Product Requirements Document (PRD) — GreenTrip AI

* **Tên dự án:** GreenTrip AI (Smart Eco-Friendly Travel Planner for Da Nang & Hue)
* **Phiên bản:** 1.0.0 (MVP — Đồ án tốt nghiệp C1SE-44)
* **Phạm vi địa lý:** Đà Nẵng & Thừa Thiên Huế
* **Trạng thái:** Đã chốt yêu cầu (Khớp 100% với codebase hiện tại — Ready for Verification & Iteration)

> **Quy tắc bắt buộc:** Trước khi code bất kỳ tính năng mới nào hoặc thay đổi hành vi sản phẩm, cả thành viên nhóm và AI Agent phải đọc, đối chiếu và cập nhật (nếu cần) file `PRD.md` này, sau đó xác nhận lại yêu cầu trước khi sửa code.

---

## 1. Mục tiêu sản phẩm & Bài toán giải quyết (What & Why)

### 1.1. Bối cảnh & Điểm đau của người dùng (Problem Space)
Khách du lịch tự túc đi tuyến **Đà Nẵng – Huế** hiện nay đang gặp 4 trở ngại lớn:
1. **Lãng phí thời gian & di chuyển kiệt sức:** Mất nhiều ngày đọc review rời rạc trên mạng xã hội, dẫn đến lịch trình xếp đường đi zíc-zắc qua lại giữa các quận/huyện, tốn chi phí và thời gian di chuyển.
2. **Dễ "cháy túi" (vượt ngân sách):** Thiếu công cụ theo dõi và kiểm soát chi phí thực tế theo trần ngân sách (`B_max`) và theo từng nhóm chi tiêu (ăn uống, lưu trú, tham quan).
3. **Bị động trước thời tiết miền Trung:** Thời tiết Đà Nẵng – Huế biến động nhanh (mưa dầm bất chợt tại Huế, gió/biển động tại Đà Nẵng). Khi hoạt động ngoài trời bị gián đoạn, du khách lúng túng không tìm được điểm trong nhà tương đương.
4. **Áp lực quá tải du lịch (Overtourism) & thiếu minh bạch gợi ý:** Các điểm trung tâm đông đúc, thiếu gợi ý sinh thái/làng nghề bản địa ít phát thải CO₂ và thiếu lời giải thích rõ ràng *vì sao địa điểm này phù hợp*.

### 1.2. Mục tiêu sản phẩm (Product Goals)
* Cung cấp nền tảng web lập lịch trình du lịch thông minh, hỗ trợ khám phá địa điểm xanh và tự động xếp lịch cá nhân hóa từng ngày (mục tiêu phản hồi nhanh dưới 10 giây).
* Tối ưu tuyến đường di chuyển theo cụm địa lý (Clustering — tránh đi zíc-zắc), ước tính quãng đường và phát thải carbon (CO₂) theo phương tiện.
* Giải thích lý do đề xuất địa điểm bằng **Knowledge Graph (Neo4j)** và tư vấn theo ngữ cảnh bằng **AI Travel Copilot (Gemini)**.
* Hỗ trợ phản ứng linh hoạt khi trời mưa, theo dõi ngân sách theo thời gian thực và xuất lịch trình ngoại tuyến (`.ics` Calendar, `.pdf`, checklist hành trang xanh).

---

## 2. Đối tượng sử dụng & Phân quyền (User Roles & Permissions)

| Vai trò (Role) | Mô tả | Quyền hạn & Giới hạn (MVP v1.0) |
| :--- | :--- | :--- |
| **Guest (Khách vãng lai)** | Người dùng chưa đăng nhập tài khoản. | - Xem Landing Page (`/`), Trang chủ (`/home`), Khám phá & Bản đồ xanh (`/explore`), xem chi tiết POI & giải thích Knowledge Graph.<br>- Trải nghiệm không gian Planner (`/planner`, `/trips`, `/chat`) và lưu nháp tạm trên trình duyệt.<br>- **Giới hạn:** Không lưu vĩnh viễn chuyến đi/bộ sưu tập vào Database tài khoản; không sử dụng các endpoint yêu cầu JWT (`/saved-places/*`, `/my-trips/*`, `/auth/me`). |
| **Authenticated User (Du khách đã đăng nhập)** | Đăng ký/đăng nhập bằng **Email + Mật khẩu + xác thực OTP** (`/verify-email`) hoặc **Google OAuth 2.0**. | - Toàn quyền của Guest.<br>- Quản lý hồ sơ cá nhân, đổi mật khẩu, cập nhật ảnh đại diện (`/profile`).<br>- Tạo/sửa/xóa bộ sưu tập và lưu địa điểm yêu thích (`/saved`).<br>- Tạo, sửa, xóa, đồng bộ nhiều chuyến đi cá nhân (`/my-trips`) và lịch trình từng ngày lên Database.<br>- Xuất lịch trình ngoại tuyến (`.ics`, `.pdf`) và chat AI Copilot gắn ngữ cảnh chuyến đi. |
| **Engineering / Maintainer (Nhóm phát triển)** | Thành viên kỹ thuật vận hành dữ liệu & hạ tầng. | - Quản trị dữ liệu POI, migration SQL (`backend/migrations/`), dữ liệu đồ thị Neo4j (`backend/neo4j/`), giám sát CI/CD qua repository và scripts kỹ thuật. |
| **Administrator (`ADMIN`)** | Quản trị viên được phân quyền `role = 'ADMIN'` trong cơ sở dữ liệu. | - Toàn quyền của Authenticated User.<br>- Truy cập Cổng quản trị (`/admin`) và các API quản trị (`/admin/*`) để kiểm tra KPI hệ thống, bật/tắt địa điểm, điều chỉnh giá tham khảo/điểm xanh và xem nhật ký kiểm toán (`admin_audit_logs`).<br>- Mọi người dùng `USER` thông thường hoặc khách chưa đăng nhập cố truy cập `/admin` đều bị chặn bởi **RBAC 2 lớp** (`401` / `403 Forbidden`). |

---

## 3. Danh sách tính năng (Feature Scope)

### 3.1. Trong phạm vi MVP (In-Scope — v1.0)
* **F-01 — Xác thực, Hồ sơ & Onboarding (`PB01`):** Đăng ký Email + mã OTP qua SMTP, đăng nhập Email/Mật khẩu, đăng nhập Google OAuth 2.0, quên/đổi mật khẩu, cập nhật hồ sơ & avatar (`/profile`), và luồng Onboarding (`/onboarding`) thu thập sở thích ban đầu.
* **F-02 — Khám phá địa điểm xanh & Lọc trọng số (`PB08`):** Trang `/home` và `/explore` chia 2 cột (danh sách POI + bản đồ `PoiMap` đồng bộ hover/select), gắn nhãn **Địa điểm xanh**, lọc theo thành phố (Đà Nẵng / Huế), danh mục (Ẩm thực, Di tích, Cảnh quan, Chùa, Lưu trú xanh trên tổng 642 POI đã kiểm định gồm 482 điểm tham quan/ẩm thực và 160 cơ sở lưu trú xanh), nút gạt **Bản địa ít đông** (ưu tiên phía Tây sông Hàn Đà Nẵng, làng nghề thủ công, kết nối Neo4j và lọc điểm ít quá tải), từ khóa và trọng số ưu tiên bền vững.
* **F-03 — Giải thích đề xuất bằng Knowledge Graph (`PB10`):** Xem chi tiết POI (`PoiDetailSection`) và mở modal giải thích *"Vì sao địa điểm này phù hợp?"* dựa trên dữ liệu đồ thị Neo4j (`GET /pois/{poi_id}/explanation-facts`).
* **F-04 — Bộ sưu tập, Địa điểm đã lưu & Xếp lịch từ Kho đã lưu (`Saved Places`):** Thả tim lưu địa điểm và tổ chức theo các bộ sưu tập cá nhân (`/saved`), đồng bộ trực tiếp vào modal thêm điểm trong Planner, và cho phép **xếp lịch trình trực tiếp từ bộ sưu tập đã lưu** (gom cụm theo thành phố/khoảng cách đúng các điểm đã chọn, chỉ gợi ý tùy chọn quán ăn/giờ nghỉ vào khung giờ trống).
* **F-05 — Thiết lập thông số chuyến đi & Gợi ý cá nhân hóa (`PB07`, `PB09`):** Chọn điểm đến (Đà Nẵng / Huế / Cả 2), lịch ngày đi/về hoặc số ngày linh hoạt, số du khách, ngân sách theo 3 nhóm độc lập (Ăn uống, Lưu trú, Hoạt động) và nhận gợi ý POI phù hợp (`POST /v1/recommendations/poi`).
* **F-06 — Không gian Lịch trình Split-Screen, Xếp lịch tự động & Tối ưu xanh (`PB11`):**
  * Giao diện chia đôi: Timeline theo ngày (bên trái) + Bản đồ lộ trình đánh số thứ tự & lọc theo ngày (bên phải).
  * Chuyến đi mới bắt đầu với các ngày chưa có điểm dừng; không tự tạo lịch mẫu. Trợ lý xếp lịch theo 3 nhịp độ (`Relaxed` / `Balanced` / `Fast`), tự chèn khung giờ nghỉ và kiểm tra xung đột giờ mở cửa khi người dùng chủ động yêu cầu.
  * Nếu mở lịch có bản nháp chưa đồng bộ, phiên đã đăng nhập sẽ tự thử đồng bộ lại; phiên khách giữ nguyên bản nháp và danh sách chuyến đi trên cùng trình duyệt/nguồn gốc trang web, không đồng bộ sang tài khoản. Khi lưu trữ trình duyệt bị xóa hoặc đổi thiết bị/nguồn gốc, bản nháp khách có thể không còn truy cập được.
  * Nếu người dùng yêu cầu xếp lịch nhưng chưa có địa điểm trong Ý tưởng hoặc lịch, hỏi họ có muốn GreenTrip gợi ý và xếp địa điểm không. Chỉ thêm gợi ý sau khi người dùng xác nhận; nếu họ chọn tự thêm hoặc để sau thì lịch tiếp tục để trống.
  * Xếp lịch thông minh theo kiểu cộng dồn: các điểm đã có (kể cả gợi ý của trợ lý ở lần trước) không bị xóa khi chạy lại; lần chạy mới chỉ bổ sung ý tưởng/đề xuất chưa được xếp theo sức chứa còn lại. Với mọi chuyến có POI thuộc nhiều thành phố, trợ lý phân bổ ngày thành từng chặng thành phố liên tiếp để tránh tuyến đi qua đi lại; không tự thêm điểm ở thành phố khác vào ngày đã có điểm. Khi người dùng chủ động bấm **Sắp xếp thông minh**, các điểm đã chọn nhưng đang nằm sai chặng có thể được chuyển sang ngày thuộc chặng của thành phố đó; mã điểm, giờ, ghi chú và thông tin điểm được giữ nguyên. Nếu người dùng tự xếp ngày xen kẽ thành phố thì lịch thủ công vẫn hiển thị như cũ cho tới khi họ yêu cầu sắp xếp thông minh. Nhịp Thong thả/Cân bằng/Dày đặc lần lượt giới hạn trợ lý tự xếp tối đa 2/3/5 điểm mỗi ngày; các điểm người dùng đã có luôn được giữ, kể cả khi vượt giới hạn mới. Trợ lý tự xếp tối đa một quán cà phê mỗi ngày; khi xếp lại, có thể chuyển quán cà phê do trợ lý xếp sang ngày khác để đạt giới hạn, còn điểm người dùng tự xếp luôn được giữ. Nếu không còn ngày phù hợp, quán cà phê AI chưa xếp vẫn nằm trong Ý tưởng. Trợ lý chỉ dùng POI có trong danh mục hoặc kết quả API, và không bịa thêm khi dữ liệu phù hợp không đủ. Điểm trợ lý xếp thành công cũng được thêm vào Ý tưởng và gắn nhãn ngày đã xếp. Nút × trên thẻ Ý tưởng gỡ điểm khỏi cả Ý tưởng lẫn lịch, đồng thời tạm loại điểm khỏi gợi ý tự động đến khi người dùng chủ động thêm lại. Địa điểm người dùng chỉ xóa khỏi lịch vẫn được đánh dấu bỏ qua ở các lần xếp sau. Cho phép hoàn tác lần xếp tự động gần nhất; mọi chỉnh sửa lịch tiếp theo sẽ ẩn thao tác hoàn tác để không ghi đè thay đổi mới.
  * Các công cụ bổ sung như nhịp độ, khoảng cách, ưu tiên điểm bản địa, xuất lịch, thêm ngày và tối ưu đường đi được gom trong mục **Tùy chọn** để giữ màn hình lịch trình gọn.
  * **Tối ưu đường đi (No Zig-zag):** Gom cụm điểm dừng giảm đi vòng, ước tính tổng km và phát thải CO₂ theo phương tiện (ô tô, xe máy, công cộng, đi bộ).
  * **Theo dõi ngân sách (`C_total` vs `B_max`):** Tính tổng chi phí dự kiến theo số khách và cảnh báo ngay khi vượt trần ngân sách.
  * **Ứng phó thời tiết 1 chạm & Cảnh báo Miền Trung:** Đổi nhanh hoạt động ngoài trời sang điểm trong nhà phù hợp kèm hoàn tác (Undo); hỗ trợ gợi ý điểm thay thế lân cận (ưu tiên **bản địa ít đông**); hiển thị cảnh báo nhẹ nếu chỉ xếp 1 ngày đi Huế từ Đà Nẵng hoặc đi vào mùa mưa tháng 9–1 (kèm lưu ý sóng biển).
* **F-07 — Trợ lý AI Travel Copilot & Cẩm nang Bản địa Xanh (`PB14`):** Chat trực tiếp trong không gian chuyến đi (`TripOverviewView`, `/chat`) qua `POST /trips/copilot/chat` để nhận tư vấn, highlight địa điểm lên bản đồ, thêm vào Ý tưởng hoặc cập nhật lịch trình; tích hợp ngăn **Cẩm nang Bản địa Xanh** (phong thủy Cố đô, trang phục di sản, di chuyển cho người lớn tuổi, dự phòng mùa mưa).
* **F-08 — Xuất dữ liệu ngoại tuyến (Offline Export):** Xuất lịch trình ra `.ics` (tương thích Google/Apple Calendar), xuất `.pdf` (Backend ReportLab / in PDF) và checklist hành trang du lịch xanh (tự động nhận diện mùa mưa miền Trung tháng 9–1, bổ sung áo mưa bộ và giày chống thấm).
* **F-09 — Phân quyền RBAC 2 lớp & Cổng quản trị dữ liệu POI (`/admin`):** Kiểm tra vai trò `ADMIN` và trạng thái `ACTIVE` trực tiếp từ cơ sở dữ liệu (`401`/`403`), cung cấp màn hình quản trị `/admin` bảo vệ 2 lớp cho phép thống kê tổng quan, ẩn/hiện địa điểm, chỉnh sửa giá vé/điểm xanh kèm lưu vết kiểm toán ACID (`admin_audit_logs`).
* **F-10 — Gói hành trình tuyển chọn:** Cung cấp ít nhất hai gói 2–3 ngày cho mỗi chủ đề đang được hỗ trợ (tiết kiệm, cao cấp, gia đình, check-in, thiên nhiên/xanh, di sản/văn hóa, ẩm thực, cà phê, tâm linh, làng nghề/mua sắm, cặp đôi, phiêu lưu, ngày mưa và tuyến Đà Nẵng–Huế). Mỗi gói phải nêu POI cụ thể theo từng ngày; ảnh bìa phải lấy từ POI thuộc chính gói. Nếu không có ảnh POI phù hợp thì dùng ảnh địa phương có sẵn hoặc placeholder, không dùng ảnh ngẫu nhiên theo thể loại. Gói chỉ hiển thị khi mọi điểm dừng cùng nơi lưu trú được đối chiếu với POI đang hoạt động; nơi lưu trú phải có thông tin liên hệ. Cho phép lọc theo điểm đến, chủ đề, thời lượng và mức ngân sách lưu trú; bộ lọc mặc định thu gọn, thanh lọc có một số chip chủ đề nhanh kèm số gói phù hợp để áp dụng bộ lọc trực tiếp; chủ đề không có kết quả trong các bộ lọc còn lại sẽ bị vô hiệu hóa. Khi có bộ lọc, người dùng có thể xóa toàn bộ điều kiện lọc từ thanh công cụ. Khi chọn gói, tạo chuyến đi với điểm tham quan trong lịch theo ngày và POI khách sạn trong Ý tưởng; bộ xếp lịch tự động không xếp khách sạn thành điểm tham quan. Giá lưu trú chỉ hiển thị theo dữ liệu tham khảo theo đêm kèm yêu cầu xác nhận trực tiếp, không giả định là giá đặt phòng hoặc tổng giá gói.

### 3.2. Ngoài phạm vi MVP / Kế hoạch giai đoạn sau (Out-of-Scope & Planned v1.1)
* **Không làm trong v1.0:**
  * Không tích hợp cổng thanh toán trực tiếp (In-app Payment / VNPay / MoMo) cho vé máy bay, khách sạn hay vé tham quan.
  * Không xây dựng mạng xã hội chia sẻ ảnh hoặc tính năng nhắn tin trực tiếp giữa người dùng với nhau.
* **Kế hoạch mở rộng (`Planned / v1.1` — chưa triển khai trong code v1.0):**
  * Chia sẻ liên kết chuyến đi có tương tác nhóm (**Share link bình chọn / voting**).
  * Chèn **mã QR bản đồ & danh bạ khẩn cấp** tự động trong file `.pdf` xuất từ Backend.
  * Giới hạn số lượt xuất file theo ngày riêng cho Guest (ví dụ 2 lần/ngày) và cơ chế tự động retry LLM 2 lần có cấu hình timeout 15 giây tập trung.

---

## 4. Luồng thao tác người dùng (User Flows)

### Flow 1: Truy cập lần đầu, Đăng nhập & Onboarding
1. Người dùng vào `/` (`LandingPage`) → chọn **Khám phá ngay** (vào `/explore` ở chế độ Guest) hoặc **Đăng nhập / Đăng ký** (`/login`, `/register`).
2. Đăng ký bằng Email → nhận OTP qua email → xác thực tại `/verify-email` → hoàn tất Onboarding (`/onboarding`) → vào `/home` hoặc `/explore`.
3. Hoặc đăng nhập nhanh bằng Google OAuth (`POST /auth/google`) → nhận JWT và vào ứng dụng.

### Flow 2: Khám phá, Xem giải thích xanh & Lưu bộ sưu tập
1. Tại `/explore`, người dùng chọn thành phố (Đà Nẵng / Huế), lọc danh mục hoặc chỉnh trọng số ưu tiên bền vững.
2. Di chuột vào thẻ POI → ghim tương ứng sáng nổi bật trên `PoiMap`; bấm vào thẻ → mở chi tiết POI và xem giải thích Knowledge Graph (`PB10`).
3. Bấm thả tim → nếu đã đăng nhập, chọn bộ sưu tập để lưu về `/saved` (`/saved-places/*`).

### Flow 3: Tạo chuyến đi & Chat cùng AI Copilot
1. Người dùng vào `/planner` (`/trips` / `/my-trips`) → bấm **Tạo chuyến đi mới** → nhập điểm đến, ngày đi, số khách, ngân sách.
2. Trong màn hình tổng quan chuyến đi (`TripOverviewView`), cột trái là **AI Copilot Chat**, cột phải là **Bản đồ & Drawer Ý tưởng / Lịch trình / Cẩm nang**.
   - Tại Landing, người dùng có thể chọn và chỉnh **lịch tham khảo**; chỉ mở chuyến riêng sau khi máy chủ xác nhận đã lưu toàn bộ điểm dừng theo ngày và khung giờ vào tài khoản. Nếu đồng bộ lỗi, giữ bản nháp trên thiết bị, báo rõ trạng thái và cho thử lại; khi mở lại chuyến đi đã lưu, lịch phải hiện nguyên vẹn.
3. Người dùng hỏi AI → nhận gợi ý địa điểm gắn liên kết bản đồ → bấm **+ Thêm vào Ý tưởng** hoặc mở **Xem lịch theo ngày**.

### Flow 4: Xếp lịch theo ngày, Tinh chỉnh, Ứng phó thời tiết & Xuất file
1. Tại `TripItineraryView`, ngày mới để trống. Người dùng thêm điểm vào Ý tưởng hoặc bấm **Gợi ý & xếp lịch**; nếu chưa có địa điểm, GreenTrip hỏi trước khi gợi ý và xếp. Khi thêm ý tưởng sau khi đã có lịch, bấm **Xếp thêm địa điểm** để đưa điểm mới vào sức chứa còn lại mà vẫn giữ các điểm cũ; nhịp Thong thả/Cân bằng/Dày đặc giới hạn trợ lý thêm tối đa 2/3/5 điểm mỗi ngày. Nếu người dùng đã có nhiều hơn mức mới, các điểm cũ vẫn được giữ và trợ lý không thêm quá giới hạn. Điểm trợ lý xếp thành công đồng thời xuất hiện trong Ý tưởng. Nút × trên thẻ Ý tưởng gỡ địa điểm khỏi cả Ý tưởng và lịch, đồng thời ngăn gợi ý tự động đưa lại cho đến khi người dùng chủ động thêm lại. Có thể hoàn tác ngay lần xếp gần nhất trước khi tiếp tục chỉnh lịch. Chọn nhịp độ khi đã có điểm sẽ áp dụng ngay và xếp thêm theo sức chứa mới; nếu chuyến đi chưa có điểm, nhịp độ chỉ được chọn và lịch vẫn trống cho đến khi người dùng chủ động yêu cầu gợi ý/xếp. Người dùng có thể tự thêm/xóa/sửa giờ, tiêu đề, ghi chú từng điểm dừng.
2. Bấm **Tối ưu đường đi** để gom cụm điểm gần nhau, đổi phương tiện để đối chiếu lượng CO₂ tiết kiệm và kiểm tra thanh tổng ngân sách.
3. Khi gặp mưa, bấm chuyển chế độ mưa (Rainy Day Switch) để thay điểm ngoài trời bằng điểm trong nhà (có hỗ trợ Undo) hoặc chọn điểm thay thế lân cận.
4. Lưu lịch trình (đồng bộ lên Database nếu đã đăng nhập; nếu là Guest sẽ gợi ý đăng nhập để đồng bộ) và bấm xuất `.ics` / `.pdf`.

### Flow 5: Chọn gói hành trình có POI và nơi lưu trú
1. Tại Trang chủ, người dùng lọc các gói theo điểm đến, chủ đề, số ngày/ngân sách lưu trú và mở chi tiết để xem danh sách POI theo từng ngày, nhãn ngân sách tham khảo, mùa phù hợp và nơi lưu trú.
2. Người dùng xem ảnh, thông tin liên hệ và giá tham khảo theo đêm (nếu POI có dữ liệu), sau đó chọn dùng gói.
3. Người dùng hoàn tất thông số chuyến đi; các POI tham quan được đưa vào lịch theo đúng ngày của gói, còn nơi lưu trú được thêm vào Ý tưởng để xem hoặc liên hệ.
4. Người dùng có thể chỉnh sửa chuyến đi; thao tác xếp lịch tự động chỉ chọn POI tham quan và không tính nơi lưu trú thành một điểm ghé.

---

## 5. Ma trận phân quyền & Quy tắc nghiệp vụ (Permissions & Business Rules)

### 5.1. Ma trận phân quyền API (Bắt buộc kiểm thử `401` / `403` / `404`)

| Nhóm Endpoint | Yêu cầu xác thực | Quy tắc phân quyền & bảo vệ |
| :--- | :--- | :--- |
| `GET /health`, `GET /pois/*`, `GET /itineraries/*`, `POST /v1/recommendations/poi` | Công khai (Public) | Chỉ trả dữ liệu POI, gợi ý và tuyến hành trình mẫu công khai. |
| `POST /auth/login`, `/register`, `/verify-email`, `/google`, `/check-email` | Công khai + Rate Limit | Áp dụng rate limiting (`rate_limit.py`) chống brute-force / spam OTP. |
| `GET/PATCH /auth/me`, `POST /auth/change-password`, `PUT /auth/me/avatar` | Bắt buộc JWT (`get_current_user_id`) | Thiếu/sai token trả `401`; chỉ được đọc/sửa hồ sơ của chính chủ token. |
| `/saved-places/*` | Bắt buộc JWT (`get_current_user_id`) | Bộ sưu tập và địa điểm lưu gắn chặt `user_id`; không truy cập dữ liệu user khác. |
| `/my-trips/*` | Bắt buộc JWT (`get_current_user_id`) | Chỉ chủ sở hữu `trip` mới được xem, sửa, xóa, xuất PDF; sai chủ sở hữu trả `403`/`404`. |
| `/trips/{trip_id}/itinerary`, `POST /trips/copilot/chat` | JWT (hỗ trợ ngữ cảnh chuyến đi + Rate Limit cho Copilot) | Copilot áp dụng rate limit chống spam token AI; chuyến đi gắn tài khoản phải xác thực quyền sở hữu trước khi ghi đè. |
| `/admin/overview`, `/admin/pois`, `PATCH /admin/pois/{poi_id}` | Bắt buộc JWT + RBAC (`require_admin`) | Thiếu/sai token trả `401`; tài khoản `USER` thường hoặc `status != 'ACTIVE'` trả `403 Forbidden`; chỉ `ADMIN` đang hoạt động mới truy cập và ghi `admin_audit_logs`. |

### 5.2. Quy tắc nghiệp vụ cốt lõi (Business Rules & Constraints)
* **Kiểm soát ngân sách (`C_total` vs `B_max`):** Hệ thống tính chi phí dự kiến theo số khách và danh mục. Khi tổng chi phí vượt trần ngân sách `B_max`, giao diện bắt buộc hiển thị cảnh báo vượt mức rõ ràng để người dùng điều chỉnh hoặc đổi điểm miễn phí/phù hợp hơn.
* **Thời gian di chuyển hợp lý:** Chặng liên tỉnh Đà Nẵng ↔ Huế cần tính dư thời gian di chuyển (tối thiểu ~2,0–2,5 tiếng), tránh xếp các điểm dừng chồng lấn giờ mở cửa.
* **Chống quá tải nhịp độ (Pacing):** Giới hạn mật độ điểm tham quan theo mức nhịp độ (`Relaxed` / `Balanced` / `Fast`) và tự động bố trí khung nghỉ ngơi/ăn uống hợp lý trong ngày.
* **An toàn khi lỗi dịch vụ ngoài (Neo4j / Gemini):** Khi dịch vụ AI hoặc Neo4j gặp lỗi/timeout, Backend phải trả thông báo lỗi thân thiện (không rò rỉ stack trace hay secret) và giữ nguyên dữ liệu người dùng đang thao tác trên giao diện.
* **Gói hành trình và dữ liệu POI:** Không hiển thị gói có tên địa điểm không khớp POI đang hoạt động, thiếu phương thức liên hệ nơi lưu trú hoặc ảnh bìa không liên quan đến điểm trong gói. Không dùng ảnh fallback ngẫu nhiên theo thể loại; nếu ảnh POI lỗi thì dùng ảnh thành phố có sẵn hoặc placeholder, và không hiển thị ảnh lưu trú chưa có trong dữ liệu. Không tự tạo giá phòng, giá gói hay chứng nhận xanh; giá tham khảo phải giữ nguyên đơn vị/thời hạn từ dữ liệu nguồn và kèm lưu ý cần xác nhận với cơ sở.

---

## 6. Tiêu chí hoàn thành & Checklist trước khi code

### 6.1. Tiêu chí nghiệm thu sản phẩm (Acceptance Criteria — v1.0)
- [ ] **Độ chính xác địa lý:** Các POI Đà Nẵng – Huế hiển thị có tọa độ (`lat`, `lng`) hợp lệ và hiển thị đúng vị trí trên bản đồ `PoiMap`.
- [ ] **Tối ưu lộ trình:** Nút *Tối ưu đường đi* gom cụm hợp lý, giảm quãng đường zíc-zắc và cập nhật lại số km + lượng CO₂ tương ứng.
- [ ] **Định dạng xuất ngoại tuyến:** File `.ics` nhập được vào Google/Apple Calendar không lỗi cú pháp; file `.pdf` hiển thị rõ lịch trình và thông tin điểm dừng.
- [ ] **Hiệu năng & Trạng thái phản hồi:** Có đầy đủ 4 trạng thái UI (`Loading` Skeleton, `Populated`, `Empty`, `Error` có nút thử lại); không có lỗi runtime trên Console.
- [ ] **Tương thích màn hình & WCAG 2.2 AA:** Giao diện responsive không tràn ngang trên Desktop (`≥ 1280px`) và Mobile (`320px–480px`), tuân thủ checklist 10 bước trong [AGENTS.md](AGENTS.md).
- [ ] **Kiểm thử tự động & Phân quyền:** Pass `pytest -v backend/tests`, `npm run lint:ci && npm run typecheck && npm run test:unit && npm run build`, và xác minh các case `401`/`403`/`404`.
- [ ] **Gói hành trình:** Mỗi thẻ hiển thị các điểm đã đối chiếu theo ngày, khoảng thời lượng 2–3 ngày, nơi lưu trú có ít nhất một cách liên hệ và giá phòng chỉ ở mức tham khảo; chọn gói tạo đúng lịch theo ngày, giữ nơi lưu trú trong Ý tưởng và loại nơi lưu trú khỏi xếp lịch tự động. Gói không đủ dữ liệu không được hiển thị như gói hoàn chỉnh.

### 6.2. Checklist kiểm tra `PRD.md` trước mỗi task mới
- [ ] Tính năng này phục vụ **vai trò người dùng** nào ở Mục 2?
- [ ] Thuộc **In-Scope v1.0** hay **Out-of-Scope / Planned v1.1** ở Mục 3?
- [ ] Đi qua luồng thao tác và endpoint nào ở Mục 4 & Mục 5 (có cần kiểm thử `401`/`403`/`404` không)?
- [ ] Phạm vi **không làm** trong task hiện tại là gì để tránh sửa lan man?

---

## 7. Tài liệu đặc tả chi tiết liên quan
- Quy tắc dự án & AI Agent: [AGENTS.md](AGENTS.md)
- Thiết kế UI/UX chuẩn: [docs/UI_UX_MASTER_SPEC.md](docs/UI_UX_MASTER_SPEC.md)
- Đặc tả AI Copilot: [docs/COPILOT_AI_ADAPTATION_SPEC.md](docs/COPILOT_AI_ADAPTATION_SPEC.md)
- Hợp đồng Auth PB01: [docs/PB01-SIGNUP-API-CONTRACT.md](docs/PB01-SIGNUP-API-CONTRACT.md)
- Thông số chuyến đi PB07: [docs/PB07-TRIP-PARAMETERS-WIREFRAME-AND-CONTRACT.md](docs/PB07-TRIP-PARAMETERS-WIREFRAME-AND-CONTRACT.md)
- Xếp lịch & Nghỉ ngơi PB11: [docs/PB11-TRAVEL-ASSISTANT-REST-PLANNING.md](docs/PB11-TRAVEL-ASSISTANT-REST-PLANNING.md)
- Luồng tư vấn POI: [docs/user_flows/copilot_poi_advice_flow.md](docs/user_flows/copilot_poi_advice_flow.md)
