# BỘ CÂU HỎI & TRẢ LỜI BẢO VỆ CAPSTONE (CAPSTONE DEFENSE Q&A)
## 30+ CÂU HỎI PHẢN BIỆN CHUYÊN SÂU & ĐÁP ÁN CHUẨN KHOA HỌC

**Dự án**: GreenTrip – Nền tảng thiết kế hành trình du lịch xanh tại Đà Nẵng – Huế  
*A Multi-Objective Green Tourism Itinerary Optimizer for Central Vietnam*  
**Dành cho**: Thành viên Nhóm Bảo vệ Đồ án Tốt nghiệp  
**Ngày cập nhật**: Tháng 11 năm 2026

---

### NHÓM 1: TÍNH MỚI & ĐÓNG GÓP KHOA HỌC (NOVELTY & CONTRIBUTION)

#### Q01: Đề tài này có điểm gì mới và khác biệt so với Google Maps, TripAdvisor hay TripHobo?
**Trả lời**:
- **Khác biệt cốt lõi 1 - Tối ưu hóa Đa mục tiêu gắn với Du lịch Xanh**: Các nền tảng thương mại hiện nay chủ yếu tối ưu theo thời gian ngắn nhất hoặc đánh giá đám đông (popularity-driven), dẫn đến quá tải tại các điểm du lịch đại trà. GreenTrip AI tối ưu đồng thời **4 chiều mục tiêu**: Chi phí, Lượng phát thải Carbon, Khoảng cách và Điểm du lịch xanh (Green Eco Score), thúc đẩy người dùng lựa chọn điểm đến sinh thái và phương tiện phát thải thấp.
- **Khác biệt cốt lõi 2 - Kiến trúc Lai giữa AI Tạo sinh và Ràng buộc Nghiệp vụ Cứng**: Thay vì để LLM tự do bịa đặt lịch trình như ChatGPT thông thường, GreenTrip AI kết hợp **Chatbot Orchestrator + RAG + Knowledge Graph + Heuristic Solver 2-Opt**. Mọi đề xuất lịch trình đều phải thỏa mãn ràng buộc cứng về giờ mở cửa, slot bữa ăn và tính khả thi địa lý thực tế tại Đà Nẵng – Huế.
- **Khác biệt cốt lõi 3 - Tri thức Bản địa Chuyên sâu**: Tập dữ liệu 34 POIs và 10 cẩm nang du lịch được chuẩn hóa thủ công với thông tin giá vé chính thức, thời gian trải nghiệm khuyến nghị và giải thích quan hệ văn hóa 2-hop.

#### Q02: Tại sao nhóm chọn địa bàn nghiên cứu là dải Đà Nẵng – Huế mà không làm cho toàn quốc?
**Trả lời**:
- **Đặc trưng địa lý & Du lịch bổ trợ**: Đà Nẵng đại diện cho đô thị biển hiện đại, sinh thái năng động (Sơn Trà, Bà Nà); Huế đại diện cho di sản cố đô thâm trầm, văn hóa và ẩm thực cung đình. Hai địa danh này tạo thành một hành lang du lịch hoàn chỉnh nối liền qua đèo Hải Vân và Quốc lộ 1A.
- **Tính khả thi của Dữ liệu & Đồ thị Tri thức**: Để xây dựng một hệ thống RAG và Knowledge Graph có độ chính xác cao (grounded), việc thu thập, kiểm chứng thực địa về giờ mở cửa, bảng giá và phân loại chuẩn du lịch xanh đòi hỏi chiều sâu dữ liệu. Tập trung vào một khu vực trọng điểm giúp mô hình đạt chất lượng chuyên gia thay vì rộng mà sai lệch thông tin.

#### Q03: Đóng góp khoa học lớn nhất của đồ án về mặt kỹ thuật phần mềm là gì?
**Trả lời**:
- Đó là việc thiết kế và hiện thực thành công mô hình **Corrective Grounding & Deterministic Orchestration Policy**. Mô hình này giải quyết triệt để vấn đề ảo giác (hallucination) thường gặp của LLM trong lĩnh vực du lịch bằng cách buộc LLM hoạt động trong một vòng lặp gọi công cụ có kiểm soát (Tool Calling Loop with Loop Guard) và đối chiếu thực tế với CSDL có cấu trúc trước khi trả lời người dùng.

---

### NHÓM 2: KIẾN TRÚC & TÍNH KHẢ THI KỸ THUẬT (ARCHITECTURE & FEASIBILITY)

#### Q04: Trình bày kiến trúc tổng thể của hệ thống và giải thích tại sao chọn FastAPI và React?
**Trả lời**:
- Hệ thống gồm 4 phân tầng: Frontend SPA (React 18 + TypeScript), Backend Microservices (FastAPI), Hybrid Data Layer (PostgreSQL + Neo4j) và Intelligence Engine (RAG + Orchestrator + Heuristic Solver).
- **FastAPI**: Lựa chọn vì hỗ trợ bất đồng bộ (Asynchronous native), tự động sinh OpenAPI spec, tương thích hoàn hảo với Pydantic v2 để xác thực dữ liệu đầu vào chặt chẽ và tốc độ xử lý nhanh hàng đầu trong hệ sinh thái Python.
- **React 18 + TypeScript**: Đảm bảo type safety toàn bộ ứng dụng ở chế độ strict (zero `any`), quản lý trạng thái mượt mà với React Context và tích hợp tốt với thư viện bản đồ tương tác Leaflet.

#### Q05: Tại sao hệ thống lại cần cả Cơ sở dữ liệu Quan hệ (PostgreSQL) và Đồ thị Tri thức (Neo4j)?
**Trả lời**:
- **PostgreSQL**: Tối ưu cho lưu trữ dữ liệu có cấu trúc bảng, giao dịch ACID, xác thực tài khoản người dùng, lưu trữ lịch trình và tìm kiếm lọc chỉ mục (B-Tree index) theo giá, thành phố, danh mục.
- **Neo4j**: Tối ưu cho việc mô hình hóa các mối quan hệ đa chiều phức tạp giữa các điểm đến: các điểm nào đi cùng nhau hợp lý (`:PAIRS_WELL_WITH`), cụm điểm gần nhau theo không gian (`:NEARBY`), hoặc liên kết giữa trải nghiệm văn hóa ẩm thực. Việc truy vấn đồ thị 2-hop trên Neo4j bằng ngôn ngữ Cypher diễn ra trong thời gian thực mà không làm nghẽn các câu lệnh JOIN nhiều bảng trong RDBMS.

#### Q06: Cơ chế "Graceful Degradation" (Suy hao mềm dẻo) của hệ thống hoạt động như thế nào khi các dịch vụ cloud bị sập?
**Trả lời**:
- GreenTrip AI được thiết kế theo nguyên lý **Zero Single Point of Failure (Không điểm lỗi đơn lẻ)**:
  1. Khi mất kết nối PostgreSQL $\rightarrow$ Tự động chuyển connection pool sang SQLite database cục bộ.
  2. Khi Neo4j Aura timeout $\rightarrow$ Tự động chuyển sang Relational Graph Projection (truy vấn đệ quy CTE trên bảng quan hệ `poi_relations`).
  3. Khi OSRM server định tuyến bị nghẽn $\rightarrow$ Tự động ngắt sau 1.5s và dùng công thức Haversine nhân hệ số uốn lượn $1.35\times$.
  4. Khi Gemini API hết quota hoặc mất mạng $\rightarrow$ Kích hoạt bộ tổng hợp câu trả lời theo mẫu ngữ cảnh chuẩn nội bộ.

#### Q07: Hệ thống hỗ trợ truyền phát kết quả (Streaming) như thế nào và tại sao chọn Server-Sent Events (SSE) thay vì WebSocket?
**Trả lời**:
- Hệ thống sử dụng Server-Sent Events (SSE) tại endpoint `/trips/copilot/stream`.
- **Lý do chọn SSE thay vì WebSocket**: Tương tác hỏi đáp giữa người dùng và Chatbot là giao tiếp **đơn hướng theo từng đợt** (Client gửi 1 câu hỏi, Server stream kết quả về). SSE hoạt động trực tiếp trên giao thức HTTP chuẩn, dễ dàng vượt qua các tường lửa doanh nghiệp, tự động kết nối lại (auto-reconnect) và nhẹ hơn rất nhiều so với việc duy trì một kết nối WebSocket song công (full-duplex) tốn kém tài nguyên server.

---

### NHÓM 3: DỮ LIỆU & TÍNH CHÍNH XÁC ĐỊA PHƯƠNG (DATA & LOCAL GROUNDING)

#### Q08: Dữ liệu 34 POIs trong hệ thống được thu thập và thẩm định chất lượng như thế nào?
**Trả lời**:
- Dữ liệu được tuyển chọn kỹ lưỡng chia đều: 17 điểm tại Đà Nẵng và 17 điểm tại Huế, bao phủ 4 nhóm: Di sản văn hóa, Sinh thái thiên nhiên, Ẩm thực bản địa và Nghỉ dưỡng.
- Mỗi POI trải qua quy trình kiểm toán 6 bước: (1) Tọa độ chuẩn WGS84 xác thực qua Google Maps; (2) Giá vé chính thức niêm yết bởi Trung tâm Bảo tồn Di tích Cố đô Huế và Ban Quản lý Bán đảo Sơn Trà; (3) Giờ mở cửa và đóng cửa thực tế; (4) Thời gian lưu trú khuyến nghị (dwell time); (5) Điểm du lịch xanh (Green Score $0.0 - 1.0$) đánh giá theo tiêu chí du lịch có trách nhiệm; (6) Thẻ phân loại và quan hệ liên kết đồ thị.

#### Q09: Làm sao hệ thống đảm bảo địa điểm ở Đà Nẵng không bị lẫn sang lịch trình ở Huế?
**Trả lời**:
- Thông qua cơ chế **Strict City Isolation (Cách ly Địa lý Cấp độ Mã nguồn)**:
  - Trong bộ lọc gợi ý `recommend_pois` và tìm kiếm `search_pois`, tham số `city` là trường lọc bắt buộc.
  - Trong logic lập lịch trình `itinerary_generator`, mỗi ngày trong chuyến đi được gắn nhãn thành phố mục tiêu (`target_city`). Các điểm đến được gom cụm theo không gian (spatial clustering), ngăn chặn tuyệt đối việc xếp Đại Nội Huế vào buổi sáng và Bán đảo Sơn Trà vào buổi chiều cùng một ngày.

#### Q10: Nếu có một điểm du lịch thay đổi giá vé hoặc giờ mở cửa, việc cập nhật vào hệ thống có phức tạp không?
**Trả lời**:
- Hoàn toàn đơn giản và tức thì. Toàn bộ thông tin được quản lý tập trung trong bảng `pois` của CSDL. Khi cập nhật một trường dữ liệu (ví dụ giá vé), cả bộ lọc tìm kiếm, thuật toán tính ngân sách của Heuristic Solver và tri thức RAG đều tự động nhận giá trị mới mà không cần biên dịch lại mã nguồn ứng dụng.

---

### NHÓM 4: GIẢI THUẬT & TỐI ƯU HÀNH TRÌNH (ALGORITHMS & OPTIMIZATION)

#### Q11: Hệ thống giải bài toán Tối ưu hóa Lịch trình bằng thuật toán gì? Có dùng OR-Tools không?
**Trả lời**:
- **Khẳng định**: Hệ thống **KHÔNG dùng Google OR-Tools**. Hệ thống sử dụng **Thuật toán Heuristic Nội bộ (In-house Multi-Objective Heuristic)** kết hợp giữa **Nearest-Neighbor Heuristic** (khởi tạo lộ trình) và **2-Opt Local Search** (cải tiến thứ tự ghé thăm).
- **Lý do lựa chọn**:
  1. *Độ trễ tương tác (Low Latency)*: Người dùng thao tác trên web cần phản hồi tức thì (< 50ms). Heuristic 2-Opt giải bài toán 4–6 điểm dừng/ngày trong vòng dưới 5ms, trong khi OR-Tools mất thời gian khởi tạo solver và tốn nhiều RAM.
  2. *Độc lập & Dễ bảo trì*: Thuật toán viết bằng Python thuần, không phụ thuộc thư viện biên dịch C++, dễ dàng triển khai trên mọi môi trường container hoặc server cấu hình thấp.

#### Q12: Phép hoán vị 2-Opt hoạt động như thế nào trong việc giảm quãng đường di chuyển?
**Trả lời**:
- 2-Opt lấy hai cạnh không kề nhau $(p_i, p_{i+1})$ và $(p_j, p_{j+1})$ trong hành trình hiện tại.
- Thuật toán tính toán độ chênh lệch khoảng cách nếu thực hiện ngắt hai cạnh này và nối lại chéo thành $(p_i, p_j)$ và $(p_{i+1}, p_{j+1})$:
$$\Delta D = \left( d(p_i, p_j) + d(p_{i+1}, p_{j+1}) \right) - \left( d(p_i, p_{i+1}) + d(p_j, p_{j+1}) \right)$$
- Nếu $\Delta D < 0$, hành trình mới ngắn hơn hành trình cũ $\rightarrow$ Đảo ngược thứ tự đoạn từ $i+1$ đến $j$. Quá trình lặp lại cho đến khi không còn cặp cạnh nào cải thiện được nữa. Thực nghiệm trên 20 kịch bản UAT cho thấy 2-Opt giúp giảm từ 12% đến 28% tổng quãng đường di chuyển so với thứ tự ngẫu nhiên.

#### Q13: Các ràng buộc khung giờ mở cửa và giờ ăn uống được tích hợp vào thuật toán tối ưu như thế nào?
**Trả lời**:
- Chúng em sử dụng kỹ thuật **Time Window Feasibility Checking kết hợp Penalty Cost**:
  - Khi xem xét thứ tự ghé thăm, hệ thống tính toán thời gian đến dự kiến: $T_{\text{arrive}}(p_k) = T_{\text{depart}}(p_{k-1}) + T_{\text{travel}}(p_{k-1}, p_k)$.
  - Nếu $T_{\text{arrive}}(p_k) < \text{OpenHour}(p_k)$, khách phải chờ (waiting time). Nếu $T_{\text{arrive}}(p_k) > \text{CloseHour}(p_k)$, điểm đó bị xem là không khả thi và nhận điểm phạt lớn.
  - Các slot ăn trưa (`11:30 - 13:00`) và ăn tối (`18:30 - 20:00`) được ghim cứng loại hình ẩm thực trước khi chạy 2-Opt trên các điểm tham quan còn lại.

#### Q14: Thanh trượt trọng số (Slider Weights) của người dùng ảnh hưởng như thế nào đến kết quả lịch trình?
**Trả lời**:
- Khi người dùng kéo thanh trượt (ví dụ: tăng trọng số Du lịch Xanh $w_{\text{green}}$ lên 0.7 và giảm Chi phí $w_{\text{cost}}$ xuống 0.1), hàm mục tiêu tổng hợp $\mathcal{F}(\pi)$ thay đổi độ dốc ưu tiên. Thuật toán sẽ ưu tiên chọn các POI có điểm sinh thái cao (như Rạn Nam Ô, Đầm Chuồn, Vườn Quốc gia Bạch Mã) và chọn phương tiện phát thải thấp (xe đạp, xe buýt điện) thay vì ưu tiên các điểm giá rẻ nhất.

---

### NHÓM 5: TRÍ TUỆ NHÂN TẠO & RAG (AI, RAG & HALLUCINATION MITIGATION)

#### Q15: Hệ thống chống hiện tượng "ảo giác" (hallucination) của LLM bằng những biện pháp kỹ thuật nào?
**Trả lời**:
- Chúng em áp dụng chiến lược phòng thủ 4 lớp (4-Layer Hallucination Defense):
  1. **Strict Context Injection**: Chỉ đưa vào prompt của LLM các đoạn tài liệu RAG đã được xác thực và thông tin trích xuất từ database.
  2. **System Prompt Constraint**: Yêu cầu LLM chỉ trả lời dựa trên ngữ cảnh được cung cấp; nếu không có dữ liệu, bắt buộc nói rõ là không có thay vì tự suy diễn.
  3. **Corrective Grounding Validator**: Một module Python hậu xử lý sẽ quét toàn bộ câu trả lời của LLM, kiểm tra tên các POI được nhắc tới xem có tồn tại trong CSDL 34 POIs hay không. Nếu phát hiện tên giả mạo, hệ thống loại bỏ hoặc thay thế bằng POI thật tương đương.
  4. **Transparent Source Visualization**: Giao diện hiển thị minh bạch các thẻ tài liệu nguồn (`RagSourceList`) để người dùng tự đối chiếu.

#### Q16: Bộ benchmark đánh giá ảo giác được xây dựng như thế nào và kết quả ra sao?
**Trả lời**:
- Nhóm đã xây dựng bộ benchmark chuẩn hóa gồm **50 câu hỏi thử thách** (`backend/data/hallucination_benchmark_50.json`) chia làm 4 nhóm: Câu hỏi thực tế (Factual), Câu hỏi bẫy thông tin sai lệch (Adversarial/Trap), Câu hỏi ngoài phạm vi (Out-of-Scope) và Câu hỏi ràng buộc thời gian/chi phí.
- Kết quả chạy kiểm thử tự động đạt **Tỷ lệ Ảo giác dưới 2%** (vượt xa mục tiêu đề ra là $< 10\%$), 100% câu hỏi ngoài phạm vi (như du lịch Hà Nội, Tokyo) được hệ thống từ chối lịch sự và hướng người dùng quay lại khu vực Đà Nẵng – Huế.

#### Q17: Vai trò của BM25 trong hệ thống RAG là gì? Tại sao không dùng Dense Embedding thuần túy?
**Trả lời**:
- BM25 là thuật toán truy xuất từ khóa thưa (Sparse Retrieval) dựa trên tần suất từ và nghịch đảo tần suất tài liệu.
- Trong lĩnh vực du lịch địa phương, người dùng thường tìm kiếm chính xác các **thực thể danh từ riêng độc nhất** (như *"bánh tráng cuốn thịt heo Đại Lộc"*, *"cơm hến Hoa Đông"*, *"lăng Tự Đức"*). Dense Embedding thông thường rất dễ bị nhầm lẫn giữa các thực thể có ngữ nghĩa tương tự nhau nhưng vị trí địa lý khác nhau. BM25 đảm bảo tìm chính xác 100% các thực thể này. Trong tương lai, mô hình lai (Hybrid Search: BM25 + Dense Vector) sẽ được tích hợp để tối ưu thêm về ngữ nghĩa.

#### Q18: Chatbot Orchestrator xử lý như thế nào khi người dùng đổi ý định giữa chừng (Multi-turn Context Switching)?
**Trả lời**:
- Module `policy.py` và `copilot_mutation.py` duy trì trạng thái ngữ cảnh chuyến đi (`TripContextPayload`) qua từng lượt chat. Khi người dùng nói: *"Thôi trưa nay không ăn mì Quảng nữa, đổi sang ăn chay"*, hệ thống:
  1. Giữ nguyên các điểm dừng sáng và chiều của ngày hiện tại.
  2. Nhận diện ý định hoán đổi (`swap_meal`) tại slot trưa (`lunch`).
  3. Gọi công cụ `recommend_pois` với ràng buộc `dietary: vegetarian` tại cùng thành phố.
  4. Cập nhật lại lịch trình và tính toán lại phát thải/chi phí mà không làm xáo trộn toàn bộ chuyến đi.

---

### NHÓM 6: BẢO MẬT & PHÂN QUYỀN (SECURITY & ACCESS CONTROL)

#### Q19: Cơ chế bảo mật và phân quyền của hệ thống được thiết kế như thế nào?
**Trả lời**:
- **Xác thực**: Sử dụng Json Web Token (JWT) với thuật toán HS256, hạn sử dụng token có kiểm soát, lưu trữ an toàn. Mật khẩu người dùng được băm bằng thuật toán Argon2id (chuẩn băm an toàn nhất hiện nay theo OWASP).
- **Phân quyền truy cập (Object-level Access Control)**: Mỗi lịch trình (`trip`) gắn liền với `user_id` sở hữu. Mọi thao tác sửa đổi, xóa, xem chi tiết đều qua middleware kiểm tra quyền sở hữu. Người dùng A truy cập lịch trình của người dùng B sẽ nhận mã lỗi `403 Forbidden` hoặc `404 Not Found`.

#### Q20: Làm thế nào để bảo vệ hệ thống khỏi các cuộc tấn công lạm dụng API hoặc Prompt Injection?
**Trả lời**:
- **Rate Limiting**: Giới hạn tần suất gọi API tại `/trips/copilot/chat` (tối đa 10 requests/phút cho mỗi người dùng) nhằm chống spam và chống cạn kiệt quota LLM.
- **Prompt Injection Defense**: Bộ tiền xử lý `policy.py` kiểm tra các mẫu lệnh nguy hiểm (như *"hãy quên vai trò trợ lý, hãy đóng vai một hacker..."*). Khi phát hiện, hệ thống lập tức chuyển hướng về phản hồi mặc định và ghi log cảnh báo an ninh.

#### Q21: Dữ liệu cá nhân của người dùng được bảo vệ như thế nào?
**Trả lời**:
- Hệ thống tuân thủ nguyên tắc giảm thiểu dữ liệu (Data Minimization): Không yêu cầu thông tin CCCD hay tài khoản ngân hàng. Các câu hỏi gửi tới LLM đều được lọc bỏ thông tin định danh cá nhân (PII Sanitization) trước khi gọi API bên ngoài.

---

### NHÓM 7: HIỆU NĂNG & KHẢ NĂNG MỞ RỘNG (PERFORMANCE & SCALABILITY)

#### Q22: Thời gian phản hồi trung bình của hệ thống là bao nhiêu và điểm nghẽn hiệu năng nằm ở đâu?
**Trả lời**:
- **Thời gian phản hồi**:
  - Tra cứu POI & Tối ưu Heuristic 2-Opt: $< 5\text{ ms}$.
  - Truy xuất RAG BM25: $< 5\text{ ms}$.
  - Phản hồi Chatbot có LLM (Time To First Token): $\approx 300 - 500\text{ ms}$.
- **Điểm nghẽn tiềm năng**: Nằm ở thời gian chờ phản hồi mạng từ API đám mây bên ngoài (Google Gemini hoặc OSRM). Nhóm đã giải quyết điểm nghẽn này bằng cơ chế **Server-Sent Events Streaming** (người dùng thấy phản hồi ngay từ chữ đầu tiên) và cơ chế **Local Cache TTL** kết hợp Fallback tức thì.

#### Q23: Nếu số lượng người dùng tăng lên 10,000 người cùng lúc, hệ thống sẽ mở rộng (scale) như thế nào?
**Trả lời**:
- **Frontend**: Là Single Page Application (SPA) gồm các file tĩnh (HTML/JS/CSS), có thể phân phối qua mạng lưới CDN (Cloudflare) với chi phí thấp và khả năng chịu tải hàng triệu người dùng.
- **Backend**: FastAPI là stateless, có thể dễ dàng nhân bản thành nhiều container Docker chạy phía sau một Load Balancer (Nginx/Traefik).
- **Database & Cache**: Tách biệt read/write replica cho PostgreSQL, bổ sung Redis để lưu trữ session và kết quả tính toán khoảng cách OSRM thường dùng.

#### Q24: Việc lưu trữ dữ liệu local SQLite có làm giới hạn khả năng mở rộng không?
**Trả lời**:
- SQLite chỉ đóng vai trò là **tầng lưu trữ dự phòng (Fallback Layer)** trong môi trường phát triển cục bộ và chế độ demo offline. Trong môi trường production thực tế, hệ thống cấu hình kết nối trực tiếp đến PostgreSQL (Supabase) với Connection Pooling đầy đủ, đáp ứng hoàn toàn nhu cầu mở rộng quy mô lớn.

---

### NHÓM 8: GIỚI HẠN HỆ THỐNG & RỦI RO (LIMITATIONS & RISKS)

#### Q25: Điểm hạn chế lớn nhất của đồ án hiện tại là gì?
**Trả lời**:
- Nhóm xin báo cáo trung thực 3 điểm hạn chế chính:
  1. *Phạm vi dữ liệu*: Hiện mới chuẩn hóa sâu cho 34 POIs tiêu biểu tại Đà Nẵng và Huế, chưa bao phủ hết các dịch vụ du lịch nhỏ lẻ khác.
  2. *Mô hình Carbon*: Là mô hình ước tính dựa trên hệ số phát thải chuẩn của phương tiện giao thông, chưa phản ánh được tình trạng tắc đường thực tế theo thời gian thực.
  3. *Kiểm thử tự động Frontend*: Mới dừng lại ở 75 bài test logic component bằng Node test runner, chưa cài đặt framework headless browser Playwright để chạy giả lập người dùng trên trình duyệt thật.

#### Q26: Tại sao nhóm không tích hợp đo lường Carbon thời gian thực bằng cảm biến IoT?
**Trả lời**:
- Việc lắp đặt cảm biến vật lý trên các phương tiện giao thông công cộng và xe máy của du khách vượt quá phạm vi và ngân sách của một đồ án tốt nghiệp công nghệ phần mềm. Phương pháp tiếp cận khoa học chuẩn quốc tế trong các ứng dụng du lịch bền vững hiện nay (như Google Flights, Skyscanner) đều sử dụng **Mô hình Hệ số Phát thải Chuẩn (Standard Emission Factors)** kết hợp độ dài lộ trình thực tế.

#### Q27: Nếu hội đồng mất kết nối Internet trong lúc demo, hệ thống có chạy được không?
**Trả lời**:
- **Hoàn toàn chạy được 100%**. Hệ thống đã được tích hợp cơ chế Offline Fallback toàn diện: CSDL SQLite local, công thức Haversine $1.35\times$ uốn lượn, BM25 RAG trong bộ nhớ và Rule-based Response Generator. Toàn bộ kịch bản demo tạo lịch trình, sắp xếp 2-Opt và tương tác chat vẫn hoạt động trơn tru không lỗi.

---

### NHÓM 9: ĐỊNH HƯỚNG PHÁT TRIỂN TƯƠNG LAI (FUTURE WORK)

#### Q28: Trong tương lai, nếu thương mại hóa sản phẩm, nhóm sẽ phát triển tiếp những tính năng gì?
**Trả lời**:
- **Tính năng 1 - Đặt vé & Dịch vụ Trực tiếp (Direct Booking API)**: Kết nối với các cổng thanh toán (VNPay, MoMo) và hệ thống vé điện tử của các khu du lịch để người dùng có thể mua vé trực tiếp từ lịch trình.
- **Tính năng 2 - Ứng dụng Di động Native (Mobile App Flutter/React Native)**: Bổ sung định vị GPS thời gian thực, nhắc nhở lịch trình theo vị trí và dẫn đường offline.
- **Tính năng 3 - Chia sẻ & Cộng tác Nhóm (Collaborative Itinerary Planning)**: Cho phép nhóm bạn cùng tham gia chỉnh sửa một lịch trình theo thời gian thực (giống Google Docs).

#### Q29: Nhóm có kế hoạch mở rộng tập dữ liệu sang các tỉnh thành khác như thế nào?
**Trả lời**:
- Chúng em đã xây dựng sẵn bộ công cụ tự động hóa pipeline dữ liệu (`backend/scripts/`): từ trích xuất thông tin, chuẩn hóa taxonomy, tính điểm du lịch xanh đến sinh embedding và quan hệ đồ thị. Nhờ pipeline chuẩn hóa này, việc mở rộng sang các địa phương lân cận như Quảng Nam (Hội An), Quảng Trị hay Quảng Bình có thể thực hiện nhanh chóng chỉ trong vài ngày làm việc.

#### Q30: Sau khi hoàn thành đồ án này, bài học kinh nghiệm kỹ thuật quý giá nhất mà nhóm rút ra là gì?
**Trả lời**:
- Bài học lớn nhất là: **"AI tạo sinh chỉ phát huy giá trị thực sự khi được đặt trong một khuôn khổ kỹ thuật có kỷ luật"**. Một mô hình LLM mạnh mẽ đến đâu cũng sẽ vô dụng trong thực tế nếu không có tầng kiểm soát ràng buộc, không có dữ liệu grounded chính xác và không có các giải thuật tối ưu hóa toán học hỗ trợ phía sau. Sự kết hợp hài hòa giữa AI Hiện đại và Kỹ thuật Phần mềm Truyền thống chính là chìa khóa tạo nên một sản phẩm phần mềm tin cậy.
