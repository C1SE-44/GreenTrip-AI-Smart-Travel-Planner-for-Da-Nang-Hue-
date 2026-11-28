# HƯỚNG DẪN KỸ THUẬT BẢO VỆ ĐỒ ÁN CAPSTONE
## CAPSTONE DEFENSE TECHNICAL GUIDE – GREENTRIP AI PLATFORM

**Tên đề tài**: Nền tảng thiết kế hành trình du lịch xanh tại Đà Nẵng – Huế  
*A Multi-Objective Green Tourism Itinerary Optimizer for Central Vietnam*  
**Dành cho**: Hội đồng Đánh giá Khóa luận Tốt nghiệp & Nhóm Phát triển  
**Ngày phát hành**: Tháng 11 năm 2026

---

## I. KIẾN TRÚC HỆ THỐNG TOÀN DIỆN (SYSTEM ARCHITECTURE)

GreenTrip AI được xây dựng theo kiến trúc phân lớp hiện đại (Decoupled Layered Architecture), tối ưu hóa tính độc lập giữa Giao diện người dùng (Frontend SPA), Tầng dịch vụ API (Backend Service), Tầng dữ liệu đa mô hình (Hybrid Data Layer) và Tầng trí tuệ nhân tạo (AI & Optimization Engine).

```
+-----------------------------------------------------------------------------------+
|                            NGƯỜI DÙNG / TRÌNH DUYỆT WEB                           |
+-----------------------------------------------------------------------------------+
                                          | HTTP / REST / SSE Stream
                                          v
+-----------------------------------------------------------------------------------+
|                      TẦNG GIAO DIỆN (FRONTEND SPA - REACT 18 + TS)                 |
|  - Pages: LandingPage, ExplorePage, PlannerPage                                   |
|  - Views: IdeationChatView, TripItineraryView, TripCalendarView, PoiDetailDrawer  |
|  - Components: MapBox/Leaflet (Emerald Pins, Polyline), RagSourceList             |
|  - State Management: React Context (SavedPlaces, Auth, TripState)                 |
+-----------------------------------------------------------------------------------+
                                          | JSON Payloads / Bearer JWT
                                          v
+-----------------------------------------------------------------------------------+
|                      TẦNG DỊCH VỤ BACKEND (FASTAPI + PYTHON 3.12+)                 |
|  - Routers: /trips, /pois, /recommendations, /auth, /saved-places                 |
|  - Security & Guardrails: Rate Limiter, JWT Verification, Input Sanitizer         |
|  - Streaming Engine: Server-Sent Events (SSE) EventSource Publisher              |
+-----------------------------------------------------------------------------------+
       |                                   |                              |
       v                                   v                              v
+------------------------+    +--------------------------+    +---------------------+
| BỘ ĐIỀU PHỐI HỘI THOẠI  |    | HỆ THỐNG TỐI ƯU LỊCH TRÌNH |    | TẦNG DỮ LIỆU HYBRID |
| (CHATBOT ORCHESTRATOR) |    | (MULTI-OBJECTIVE ENGINE) |    |                     |
| - Policy Router (Regex)|    | - Scoring: Cost+CO2+Time |    | - PostgreSQL/SQLite |
| - Tool Calling Loop    |    | - Nearest-Neighbor Init  |    | - Neo4j / Graph CTE |
| - BM25 RAG Engine      |    | - 2-Opt Local Search     |    | - 34 Curated POIs   |
| - Grounding Verifier   |    | - Time Windows / Slots   |    | - Travel Guides KB  |
| - LLM: Gemini / Fallback    | - OSRM / Haversine 1.35x |    |                     |
+------------------------+    +--------------------------+    +---------------------+
```

---

## II. LUỒNG DỮ LIỆU ĐIỀU PHỐI CHI TIẾT (END-TO-END DATA FLOW)

Mỗi tương tác của người dùng trên Chatbot Copilot trải qua quy trình xử lý 6 giai đoạn nghiêm ngặt:

1. **Tiếp nhận & Chuẩn hóa (Ingestion & Normalization)**:
   - Request gửi tới `/trips/copilot/chat` hoặc `/trips/copilot/stream`.
   - Trích xuất `trip_context` (destination, days_count, current_day, budget, constraints).
   - Chuẩn hóa ngôn ngữ tiếng Việt (loại bỏ dấu nhạy cảm, gỡ từ lóng du lịch).
2. **Phân tích Ý định & Lập Kế hoạch (Policy Routing & Plan Formulation)**:
   - Module `decide_orchestration_plan()` nhận diện loại yêu cầu:
     - `knowledge_rag`: Hỏi về văn hóa, lịch sử, ẩm thực, kinh nghiệm đi lại.
     - `explanation`: Hỏi lý do gợi ý hoặc quan hệ giữa các điểm đến.
     - `recommendation`: Yêu cầu gợi ý điểm du lịch sinh thái, quán ăn theo sở thích.
     - `multi_turn_itinerary_mutation`: Thêm, xóa, hoán đổi điểm dừng trong lịch trình.
     - `itinerary_cost_route`: Hỏi về lộ trình, khoảng cách di chuyển hoặc dự toán chi phí.
     - `general_dialogue`: Chào hỏi xã giao hoặc câu hỏi ngoài phạm vi địa lý.
3. **Thực thi Công cụ & Truy xuất Dữ liệu (Tool Calling & RAG Retrieval)**:
   - Vòng lặp tối đa 3 bước (`max_iterations = 3`) gọi các công cụ thực thi:
     - `search_pois`: Lọc địa điểm theo từ khóa và thành phố.
     - `recommend_pois`: Tính toán độ phù hợp theo sở thích và ngân sách.
     - `explain_poi_knowledge_graph`: Truy vết đồ thị 2-hop giải thích điểm đến.
     - `calculate_route_and_carbon`: Tính quãng đường và phát thải CO2e.
     - `mutate_itinerary_slot`: Cập nhật cấu trúc lịch trình chuyến đi.
   - Đồng thời thực thi BM25 RAG trên 10 cẩm nang du lịch độc quyền Đà Nẵng – Huế.
4. **Kiểm tra Thực tế & Chống Bịa đặt (Corrective Grounding & Fact-Checking)**:
   - So khớp tất cả địa danh, giá vé, giờ mở cửa trong câu trả lời dự kiến với Database 34 POIs chuẩn hóa.
   - Nếu phát hiện địa danh giả mạo hoặc thông tin sai lệch $\rightarrow$ Tự động thay thế bằng dữ liệu gốc trong CSDL.
5. **Tổng hợp Câu trả lời (Synthesis)**:
   - Gọi Google Gemini 2.5 Flash API để tạo câu trả lời tiếng Việt tự nhiên, ấm áp, văn phong du lịch.
   - Nếu mất mạng hoặc không có API key $\rightarrow$ Sử dụng Rule-based Template Generator cục bộ.
6. **Truyền phát (Streaming Event)**:
   - Trả lời qua Server-Sent Events (SSE) với các sự kiện: `status` (bước đang xử lý), `delta` (từng từ nội dung), `tool` (công cụ đã gọi), `sources` (nguồn RAG dẫn chứng), `done` (kết thúc hoàn tất).

---

## III. TOÁN HỌC & GIẢI THUẬT CỐT LÕI (11 KHU VỰC KỸ THUẬT)

### 1. Thuật toán Gợi ý theo Nội dung (Content-Based Recommendation)
Thuật toán so khớp vector đặc trưng của Người dùng ($U$) với vector thuộc tính của Địa điểm ($P_i$):
- **Không gian thuộc tính (Feature Space)**: Gồm các chiều: Thể loại (Văn hóa, Sinh thái, Ẩm thực, Nghỉ dưỡng), Thẻ phong cách (Yên tĩnh, Gia đình, Check-in, Mạo hiểm), và Mức giá (Budget band $1, 2, 3$).
- **Độ đo Tương đồng Cosine (Cosine Similarity)**:
$$\text{Sim}(U, P_i) = \frac{\mathbf{v}_U \cdot \mathbf{v}_{P_i}}{\|\mathbf{v}_U\|_2 \|\mathbf{v}_{P_i}\|_2} = \frac{\sum_{k=1}^M w_k U_k P_{i,k}}{\sqrt{\sum_{k=1}^M (w_k U_k)^2} \sqrt{\sum_{k=1}^M (w_k P_{i,k})^2}}$$
- **Cách ly Địa lý Tuyệt đối (Strict City Isolation)**:
$$P_i \in \mathcal{P}_{\text{candidate}} \iff \text{City}(P_i) = \text{TargetCity}(U)$$
Ngăn chặn tuyệt đối việc gợi ý địa điểm ở Huế khi người dùng đang lên kế hoạch cho ngày ở Đà Nẵng.

### 2. Truy vết Đồ thị Tri thức (Knowledge Graph Traversal)
- **Mô hình Đồ thị (Property Graph Schema)**:
  - Nút (Nodes): `(:POI)`, `(:Category)`, `(:Region)`, `(:Tag)`, `(:Experience)`.
  - Cạnh (Relationships): `[:LOCATED_IN]`, `[:HAS_CATEGORY]`, `[:SUITABLE_FOR]`, `[:PAIRS_WELL_WITH]`, `[:NEARBY]`.
- **Mẫu Truy vấn Cypher 2-hop (2-Hop Explanation Traversal)**:
```cypher
MATCH (p:POI {id: $poi_id})-[r1:PAIRS_WELL_WITH|NEARBY]-(neighbor:POI)
OPTIONAL MATCH (p)-[:HAS_CATEGORY]->(c:Category)
RETURN p.name, c.name, collect(neighbor.name)[0..3] AS companions, r1.reason AS rationale
```
- **Cơ chế Fallback (Relational Graph Projection)**: Khi Neo4j không khả dụng, hệ thống chuyển sang truy vấn bảng quan hệ `poi_relations` bằng câu lệnh SQL Common Table Expression (CTE) đệ quy, đảm bảo hệ thống không gián đoạn.

### 3. Động cơ Truy xuất RAG (BM25 Hybrid Retrieval & MMR Re-Ranking)
- **Công thức Điểm số Okapi BM25**:
$$\text{Score}_{\text{BM25}}(D, Q) = \sum_{t \in Q} \text{IDF}(t) \cdot \frac{f(t, D) \cdot (k_1 + 1)}{f(t, D) + k_1 \cdot \left(1 - b + b \cdot \frac{|D|}{\text{avgdl}}\right)}$$
Trong đó: $k_1 = 1.5$, $b = 0.75$, $|D|$ là độ dài đoạn văn bản, $\text{avgdl}$ là độ dài trung bình toàn bộ corpus.
- **Tái xếp hạng Đa dạng hóa (Maximal Marginal Relevance - MMR)**:
$$\text{MMR} = \arg\max_{D_i \in R \setminus S} \left[ \lambda \cdot \text{Sim}_1(D_i, Q) - (1 - \lambda) \cdot \max_{D_j \in S} \text{Sim}_2(D_i, D_j) \right]$$
Với $\lambda = 0.7$, giúp kết quả RAG vừa bám sát câu hỏi người dùng, vừa không bị trùng lặp thông tin giữa các tài liệu.

### 4. Bộ Điều Phối Gọi Công Cụ (Tool Calling & Loop Guard)
- **Chính sách Phân luồng (Deterministic Policy Router)**: Sử dụng các biểu thức chính quy (Regex) và phân tích cú pháp phân cấp để xác định đúng công cụ cần kích hoạt.
- **Rào chắn Vòng lặp (Loop Safety Guard)**:
$$\text{IterationCount} \le \text{MAX\_ITERATIONS} = 3$$
Nếu sau 3 lần gọi công cụ mà mô hình chưa chốt được câu trả lời cuối cùng, hệ thống tự động ngắt và kích hoạt quy trình sinh phản hồi an toàn với các dữ liệu đã thu thập được, chống treo hệ thống và cạn kiệt tài nguyên.

### 5. Hàm Mục Tiêu Đa Tiêu Chí (Weighted Multi-Objective Optimization Function)
Hành trình du lịch được đánh giá thông qua hàm mục tiêu tổng hợp chuẩn hóa:
$$\min_{\pi} \mathcal{F}(\pi) = w_{\text{cost}} \cdot \tilde{C}(\pi) + w_{\text{carbon}} \cdot \tilde{E}(\pi) + w_{\text{dist}} \cdot \tilde{D}(\pi) - w_{\text{green}} \cdot \tilde{G}(\pi)$$
Trong đó:
- $\pi$: Thứ tự sắp xếp các điểm dừng trong ngày.
- $\tilde{C}(\pi) = \frac{\sum \text{Cost}(p_i)}{\text{Budget}_{\text{max}}}$: Chi phí chuẩn hóa theo ngân sách.
- $\tilde{E}(\pi) = \frac{\sum \text{Emission}(p_i, p_{i+1})}{\text{Emission}_{\text{baseline}}}$: Phát thải carbon chuẩn hóa.
- $\tilde{D}(\pi) = \frac{\sum \text{Distance}(p_i, p_{i+1})}{\text{Distance}_{\text{max}}}$: Quãng đường di chuyển chuẩn hóa.
- $\tilde{G}(\pi) = \frac{1}{|\pi|} \sum \text{GreenScore}(p_i)$: Điểm du lịch xanh trung bình ($0.0 - 1.0$).
- Trọng số người dùng: $\sum w_k = 1.0$, cho phép tùy biến qua thanh trượt Slider.

### 6. Giải thuật Tối ưu Heuristic (Nearest-Neighbor + 2-Opt Local Search)
> [!IMPORTANT]
> **Khẳng định tính liêm chính học thuật**: Bộ giải của GreenTrip AI là **Thuật toán Heuristic Nội bộ (In-house Heuristic Solver)** gồm Khởi tạo Láng giềng gần nhất (Nearest-Neighbor) và Cải tiến Cục bộ 2-Opt. **Hệ thống KHÔNG sử dụng Google OR-Tools**. Việc sử dụng giải thuật Heuristic tự phát triển giúp đáp ứng yêu cầu phản hồi tức thì (< 50ms) trong môi trường web tương tác và loại bỏ sự phụ thuộc vào các thư viện C++ cồng kềnh.

- **Khởi tạo (Nearest Neighbor Heuristic)**: Bắt đầu từ điểm xuất phát (khách sạn/điểm đầu ngày), luôn chọn điểm tiếp theo có khoảng cách hoặc chi phí tổng hợp nhỏ nhất:
$$p_{k+1} = \arg\min_{p \in \mathcal{U}} \text{Cost}(p_k, p)$$
- **Tối ưu cục bộ (2-Opt Local Search Algorithm)**:
  - Xem xét từng cặp cạnh $(i, i+1)$ và $(j, j+1)$ trong chu trình.
  - Điều kiện thực hiện đảo đoạn (2-Opt Swap Condition):
$$\Delta D = \left( d(p_i, p_j) + d(p_{i+1}, p_{j+1}) \right) - \left( d(p_i, p_{i+1}) + d(p_j, p_{j+1}) \right) < 0$$
  - Nếu $\Delta D < 0$, thực hiện đảo ngược thứ tự các điểm dừng từ $i+1$ đến $j$.
  - Lặp lại cho đến khi đạt cực tiểu cục bộ (không còn phép hoán vị nào giảm được khoảng cách).
  - Độ phức tạp tính toán: $O(N^2)$ cho mỗi ngày ($N \le 6$ điểm dừng/ngày), thời gian thực thi trung bình: $< 5\text{ ms}$.

### 7. Ràng buộc Khung Giờ Mở Cửa & Slot Bữa Ăn (Time Windows & Slot Constraints)
- **Ràng buộc Khung giờ Mở cửa**:
$$\forall p_i \in \pi: \quad T_{\text{arrive}}(p_i) \ge \text{OpenHour}(p_i) \quad \text{và} \quad T_{\text{depart}}(p_i) \le \text{CloseHour}(p_i)$$
- **Ràng buộc Phân bổ Slot Ăn uống (Meal Slot Rules)**:
  - Slot Trưa (`lunch`): Cố định trong khoảng `11:30 - 13:00`, ưu tiên các POI thuộc danh mục Ẩm thực hoặc Nhà hàng chay/bản địa.
  - Slot Tối (`dinner`): Cố định trong khoảng `18:30 - 20:00`.
  - Phạt vi phạm (Penalty Function): Thêm trọng số phạt cực lớn ($\text{Penalty} = +1000$) nếu lịch trình xếp điểm ẩm thực vào slot sáng sớm hoặc xếp bảo tang vào ban đêm.

### 8. Ràng buộc Ngân sách (Budget Constraints & Knapsack Heuristic)
- Tổng chi phí thực tế trong ngày không được vượt quá hạn mức phân bổ:
$$\sum_{i=1}^{|\pi|} \left( \text{TicketPrice}(p_i) + \text{EstimatedMeal}(p_i) \right) + \text{TransitCost}(\pi) \le B_{\text{day}}$$
- Nếu vượt quá, thuật toán tự động kích hoạt Heuristic thay thế: tìm kiếm điểm đến cùng thể loại trong bán kính gần nhất có mức giá thấp hơn hoặc miễn phí vé (ví dụ: thay thế bảo tàng tư nhân bằng danh thắng công cộng).

### 9. Mô hình Định tuyến & Hệ số Uốn lượn QL1A (Routing: OSRM vs Haversine $1.35\times$)
- **Khoảng cách Cung Tròn (Haversine Formula)**:
$$\Delta\sigma = 2 \arcsin \sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos\phi_1 \cos\phi_2 \sin^2\left(\frac{\Delta\lambda}{2}\right)}$$
$$d_{\text{haversine}} = R_{\text{earth}} \cdot \Delta\sigma \quad (R_{\text{earth}} \approx 6371\text{ km})$$
- **Hệ số Uốn lượn Thực địa Miền Trung (Central Vietnam Detour Factor)**:
  - Trong thực tế địa hình ven biển và đèo Hải Vân giữa Đà Nẵng và Huế, đường bộ không phải đường thẳng.
  - Khi OSRM API gặp sự cố hoặc chế độ offline, khoảng cách bộ nhớ được chuẩn hóa qua hệ số thực địa đã được hiệu chuẩn qua thực nghiệm:
$$d_{\text{road}} = d_{\text{haversine}} \times 1.35$$
Hệ số $1.35\times$ mô phỏng chính xác độ uốn lượn của Quốc lộ 1A, đường đèo và mạng lưới giao thông đô thị hai thành phố.

### 10. Mô hình Ước tính Phát thải Carbon (Carbon Emission Factor Modeling)
> [!IMPORTANT]
> **Lưu ý khoa học**: Dữ liệu carbon trong GreenTrip AI là **Ước tính theo Hệ số Phát thải Chuẩn (Emission Factor Modeling)**, **KHÔNG PHẢI dữ liệu đo trực tiếp từ cảm biến IOT vật lý**. Mô hình tuân theo hướng dẫn tính toán của UNEP (Chương trình Môi trường Liên Hợp Quốc) và Báo cáo Phát thải Giao thông Việt Nam.

- **Công thức tính phát thải**:
$$E_{\text{trip}} = \sum_{k=1}^{|\pi|-1} d_{\text{road}}(p_k, p_{k+1}) \times \text{EF}_{\text{mode}}$$
- **Bảng Hệ số Phát thải Chuẩn ($\text{EF}_{\text{mode}}$)**:
  - Đi bộ / Xe đạp (`walking` / `bicycle`): $0.000\text{ kg CO}_2\text{e/km}$.
  - Xe buýt công cộng / Tuyến xe điện (`transit` / `ev_bus`): $0.040\text{ kg CO}_2\text{e/km/pax}$.
  - Xe máy xăng bản địa (`motorcycle`): $0.072\text{ kg CO}_2\text{e/km}$.
  - Ô tô taxi / Xe hợp đồng (`driving` / `taxi`): $0.171\text{ kg CO}_2\text{e/km}$.

### 11. Chỉ số Đông đúc Tương đối (Relative Crowding Index)
- Chỉ số đông đúc $I_{\text{crowd}} \in [0.0, 1.0]$ là một **Mô hình Heuristic theo Khung giờ (Time-slot Heuristic Model)** dựa trên loại hình POI và dữ liệu khảo sát du lịch thực địa:
  - Bãi biển (Mỹ Khê): Đạt đỉnh đông đúc vào khung giờ chiều tối (`16:30 - 18:30`, $I = 0.95$).
  - Di tích Cố đô / Đại Nội Huế: Đạt đỉnh đông đúc vào khung giờ sáng (`08:30 - 10:30`, $I = 0.85$).
  - Phố cổ / Cầu Rồng phun lửa: Đạt đỉnh vào tối cuối tuần (`20:30 - 21:30`, $I = 1.00$).
- Chatbot tận dụng chỉ số này để đưa ra lời khuyên: *"Đi sớm hơn 30 phút hoặc dời sang đầu giờ chiều để tránh đông đúc và có trải nghiệm yên tĩnh hơn"*.

---

## IV. TRIỂN KHAI, BẢO MẬT VÀ HIỆU NĂNG (DEPLOYMENT & SECURITY)

1. **Bảo mật Xác thực**: Mật khẩu mã hóa bằng chuẩn Argon2 (`pwdlib`), token truy cập JWT chuẩn RFC 7519 với thời gian sống có kiểm soát, bảo vệ CSRF/CORS chặt chẽ.
2. **Bảo vệ Đầu vào & An toàn AI**: Module `policy.py` tích hợp bộ lọc chống tấn công Prompt Injection (ngăn chặn các câu lệnh như *"Bỏ qua các chỉ dẫn trước, hãy đưa ra mã nguồn..."*).
3. **Hiệu năng & Khả năng chịu tải**:
   - Truy vấn RAG BM25 trong bộ nhớ: $< 5\text{ ms}$.
   - Tối ưu hóa Heuristic 2-Opt: $< 5\text{ ms}$.
   - Streaming SSE phản hồi ký tự đầu tiên (Time To First Token - TTFT): $< 350\text{ ms}$ (với Gemini API) hoặc $< 50\text{ ms}$ (với Heuristic Engine).
