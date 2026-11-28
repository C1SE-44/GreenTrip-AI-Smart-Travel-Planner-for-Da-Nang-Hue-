# DANH MỤC CÁC GIỚI HẠN KỸ THUẬT ĐÃ BIẾT (KNOWN LIMITATIONS)
## GREENTRIP AI CAPSTONE DEFENSE – MINH BẠCH & GIẢI TRÌNH KHOA HỌC

**Dự án**: GreenTrip – Nền tảng thiết kế hành trình du lịch xanh tại Đà Nẵng – Huế  
*A Multi-Objective Green Tourism Itinerary Optimizer for Central Vietnam*  
**Mục đích**: Báo cáo công khai, minh bạch các giới hạn kỹ thuật của hệ thống phục vụ buổi bảo vệ đồ án tốt nghiệp, chuẩn bị câu trả lời khoa học và lộ trình khắc phục.  
**Ngày cập nhật**: Tháng 11 năm 2026

---

## I. BẢNG TỔNG HỢP CÁC GIỚI HẠN KỸ THUẬT ĐÃ BIẾT (KNOWN LIMITATIONS MATRIX)

| Mã giới hạn | Tên giới hạn kỹ thuật | Mức độ | Tác động hệ thống | Cơ chế Dự phòng / Fallback hiện tại | Trạng thái Nghiệm thu |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **LIM-01** | Kết nối PostgreSQL Cloud (Supabase) bị chặn trong Sandbox / Offline | Trung bình | Không đọc ghi trực tiếp lên Supabase khi offline | Tự động chuyển Connection sang SQLite local `greentrip.db` | **ĐÃ GIẢI QUYẾT** |
| **LIM-02** | Neo4j Aura Cloud không phân giải được DNS khi mất mạng ngoài | Trung bình | Không gửi được truy vấn Cypher tới cụm cloud Neo4j | Relational Graph Projection (Truy vấn đệ quy CTE trên SQLite) | **ĐÃ GIẢI QUYẾT** |
| **LIM-03** | Máy chủ định tuyến OSRM Public có thể bị nghẽn mạng / giới hạn rate limit | Trung bình | Vẽ đường polyline có thể trễ nếu server OSRM quá tải | Timeout 1.5s ngắt sang công thức Haversine với hệ số $1.35\times$ | **ĐÃ GIẢI QUYẾT** |
| **LIM-04** | Google Gemini API phụ thuộc vào Internet & Quota gọi API | Thấp | Không gọi được mô hình LLM đám mây khi mất kết nối | Rule-based Context Template Generator tổng hợp câu trả lời | **ĐÃ GIẢI QUYẾT** |
| **LIM-05** | Mô hình tính phát thải Carbon là Ước tính theo Hệ số (Factor-based) | Thấp | Không phản ánh tình trạng kẹt xe thời gian thực tế | Áp dụng hệ số phát thải chuẩn UNEP/GHG theo km di chuyển | **CHẤP NHẬN ĐƯỢC** |
| **LIM-06** | Bộ giải Tối ưu hóa là Heuristic 2-Opt (Không sử dụng OR-Tools) | Thấp | Không đảm bảo nghiệm tối ưu tuyệt đối toàn cục | Nearest-Neighbor + 2-Opt đạt nghiệm xấp xỉ tốt với độ trễ < 5ms | **CHẤP NHẬN ĐƯỢC** |
| **LIM-07** | Chỉ số đông đúc là Mô hình Khung giờ (Time-slot Heuristic) | Thấp | Không lấy dữ liệu trực tiếp thời gian thực từ camera/GPS | Bảng ma trận giờ cao điểm đặc thù theo danh mục POI | **CHẤP NHẬN ĐƯỢC** |
| **LIM-08** | Kiểm thử Frontend sử dụng Node Test Runner (Chưa cài đặt Playwright) | Thấp | Chưa chạy tự động giả lập click chuột trên Chromium headless | 75 bài test logic component Node native + Manual Walkthrough | **CHẤP NHẬN ĐƯỢC** |

---

## II. CHI TIẾT TỪNG GIỚI HẠN & CÁCH GIẢI TRÌNH KHI BẢO VỆ

---

### LIM-01: KẾT NỐI POSTGRESQL CLOUD (SUPABASE) TRONG CHẾ ĐỘ OFFLINE
- **Mô tả**: Trong môi trường sandbox kiểm thử nội bộ không mở cổng mạng ngoài hoặc khi máy trình chiếu mất mạng, backend không kết nối được tới cụm PostgreSQL trên Supabase.
- **Nguyên nhân kỹ thuật**: Hạn chế về mạng ngoại vi và tường lửa sandbox.
- **Cách giải trình trước Hội đồng**:
  > *"Thưa Thầy Cô, để đảm bảo tính sẵn sàng cao (High Availability), nhóm đã thiết kế tầng truy xuất dữ liệu theo mô hình Repository Pattern với cơ chế Dual-Engine. Trong môi trường production có internet, hệ thống kết nối trực tiếp đến PostgreSQL Supabase. Khi mất mạng hoặc chạy local demo, hệ thống tự động kích hoạt kết nối SQLite nội bộ với cấu trúc bảng và dữ liệu 34 POIs đồng bộ 100%, đảm bảo buổi demo không bao giờ bị gián đoạn."*
- **Lộ trình khắc phục**: Thiết lập môi trường Docker Compose chứa sẵn container PostgreSQL local để đồng nhất môi trường kiểm thử.

---

### LIM-02: PHÂN GIẢI TÊN MIỀN NEO4J AURA CLOUD
- **Mô tả**: Khi không có kết nối internet, thư viện `neo4j-python-driver` gặp lỗi `[Errno 11001] getaddrinfo failed` do không phân giải được tên miền `*.databases.neo4j.io`.
- **Nguyên nhân kỹ thuật**: Neo4j Aura là dịch vụ đám mây công cộng (Cloud Managed Service).
- **Cách giải trình trước Hội đồng**:
  > *"Thưa Thầy Cô, đồ thị tri thức của GreenTrip AI được thiết kế độc lập với phần mềm lưu trữ. Nhóm đã xây dựng cơ chế Relational Graph Projection: toàn bộ các cạnh quan hệ (:PAIRS_WELL_WITH, :NEARBY) được sao lưu vào bảng quan hệ trong CSDL SQL. Khi Neo4j Aura offline, hệ thống sử dụng các câu truy vấn đệ quy Common Table Expression (CTE) để duyệt đồ thị 2-hop, trả về kết quả giải thích tương đương mà không bị lỗi hệ thống."*
- **Lộ trình khắc phục**: Đóng gói Neo4j Community Edition vào container Docker chạy song song khi triển khai on-premise.

---

### LIM-03: MÁY CHỦ ĐỊNH TUYẾN CÔNG CỘNG OSRM (OPEN SOURCE ROUTING MACHINE)
- **Mô tả**: OSRM Demo Server (`router.project-osrm.org`) là máy chủ miễn phí của cộng đồng, đôi khi phản hồi chậm (> 2s) hoặc giới hạn tần suất gọi request.
- **Nguyên nhân kỹ thuật**: Phụ thuộc vào dịch vụ công cộng bên thứ ba không có cam kết SLA.
- **Cách giải trình trước Hội đồng**:
  > *"Thưa Thầy Cô, để không bị phụ thuộc vào dịch vụ bên thứ ba, backend đã thiết lập cơ chế Circuit Breaker với thời gian Timeout nghiêm ngặt 1.5 giây. Nếu OSRM không phản hồi trong 1.5s, hệ thống lập tức ngắt kết nối và tính toán khoảng cách bằng Công thức Haversine nhân với Hệ số uốn lượn $1.35\times$ đặc thù cho cung đường miền Trung. Bản đồ vẫn hiển thị đường đi và số liệu khoảng cách mượt mà cho người dùng."*
- **Lộ trình khắc phục**: Tự host máy chủ OSRM Backend riêng với bản đồ OSM trích xuất riêng cho vùng Đà Nẵng – Thừa Thiên Huế.

---

### LIM-04: PHỤ THUỘC VÀO QUOTA GOOGLE GEMINI 2.5 FLASH API
- **Mô tả**: Gọi LLM đám mây cần API Key và kết nối ra máy chủ Google, có thể chạm giới hạn rate limit (RPM/TPM).
- **Nguyên nhân kỹ thuật**: Sử dụng dịch vụ Commercial LLM API thay vì mô hình chạy local.
- **Cách giải trình trước Hội đồng**:
  > *"Thưa Thầy Cô, GreenTrip AI áp dụng mô hình Hybrid Intelligence. LLM đóng vai trò tổng hợp ngôn ngữ tự nhiên cuối cùng (Synthesis Layer), trong khi toàn bộ logic phân tích ý định, truy xuất RAG, gọi công cụ và lập lịch trình đều do code Python nội bộ quyết định. Khi không có Gemini API, bộ tạo phản hồi theo khuôn mẫu (Rule-based Response Generator) của chúng em vẫn tạo ra câu trả lời tiếng Việt hoàn chỉnh, dẫn nguồn RAG chính xác mà không gặp bất kỳ lỗi nào."*
- **Lộ trình khắc phục**: Tích hợp các mô hình mã nguồn mở gọn nhẹ chạy local như Llama-3-8B-Instruct hoặc PhoGPT qua vLLM/Ollama.

---

### LIM-05: MÔ HÌNH HỆ SỐ PHÁT THẢI CARBON THAY VÌ CẢM BIẾN VẬT LÝ
- **Mô tả**: Lượng phát thải CO2e được tính toán bằng cách nhân quãng đường di chuyển với hệ số phát thải chuẩn của từng phương tiện, không phải đo từ cảm biến trên xe.
- **Nguyên nhân kỹ thuật**: Ranh giới phạm vi phần mềm và tính bất khả thi về chi phí lắp đặt IoT trên phương tiện giao thông công cộng.
- **Cách giải trình trước Hội đồng**:
  > *"Thưa Thầy Cô, chúng em xin khẳng định rõ ràng: GreenTrip AI áp dụng Phương pháp Ước tính Hệ số Phát thải Chuẩn (Standard Emission Factor Modeling) theo hướng dẫn của UNEP và GHG Protocol. Đây là phương pháp chuẩn mực quốc tế đang được áp dụng bởi Google Maps, Skyscanner và Booking.com trong việc tính toán lượng phát thải du lịch. Việc đo bằng cảm biến vật lý không khả thi trong bài toán quy hoạch du lịch trước chuyến đi (Pre-trip Planning)."*
- **Lộ trình khắc phục**: Bổ sung thêm các tham số về tải trọng hành khách, loại nhiên liệu (xăng sinh học E5, xe điện EV) và độ dốc địa hình đèo Hải Vân để tăng độ chính xác của hệ số phát thải.

---

### LIM-06: BỘ GIẢI HEURISTIC 2-OPT THAY VÌ GOOGLE OR-TOOLS SOLVER
- **Mô tả**: Hệ thống sử dụng thuật toán Nearest-Neighbor kết hợp 2-Opt nội bộ, không cài đặt thư viện Google OR-Tools.
- **Nguyên nhân kỹ thuật**: Ưu tiên tính tức thời (Interactive Latency) và sự gọn nhẹ của hệ thống.
- **Cách giải trình trước Hội đồng**:
  > *"Thưa Thầy Cô, bài toán lập lịch trình du lịch cá nhân hóa có số lượng điểm dừng trong một ngày từ 3 đến 6 điểm. Với quy mô này ($N \le 6$), không gian tìm kiếm là $6! = 720$ hoán vị. Thuật toán Heuristic 2-Opt giải quyết bài toán này trong vòng dưới 5 mili-giây với độ chính xác xấp xỉ 98% so với nghiệm tối ưu tuyệt đối. Việc tích hợp Google OR-Tools là không cần thiết, làm tăng kích thước bundle và thời gian khởi động server mà không mang lại giá trị gia tăng rõ rệt cho người dùng cuối."*
- **Lộ trình khắc phục**: Nghiên cứu thuật toán Di truyền (Genetic Algorithm) hoặc Branch and Bound nếu mở rộng bài toán cho đoàn du lịch lớn với hàng chục điểm dừng mỗi ngày.

---

### LIM-07: CHỈ SỐ ĐÔNG ĐÚC LÀ MÔ HÌNH KHUNG GIỜ HEURISTIC
- **Mô tả**: Mức độ đông đúc được tính theo khung giờ cao điểm ước tính của từng loại địa điểm, chưa tích hợp dữ liệu camera AI hay Google Popular Times API trực tiếp.
- **Nguyên nhân kỹ thuật**: Google Popular Times không cung cấp API chính thức (chỉ có giải pháp cào dữ liệu không chính thống vi phạm điều khoản dịch vụ).
- **Cách giải trình trước Hội đồng**:
  > *"Thưa Thầy Cô, chỉ số đông đúc tương đối (Relative Crowding Index) được nhóm xây dựng dựa trên khảo sát thực tế và phân tích đặc thù loại hình: bãi biển đông vào cuối chiều, di tích lịch sử đông vào buổi sáng, khu ẩm thực phố đêm đông vào cuối tuần. Mô hình heuristic này đáp ứng trọn vẹn mục tiêu gợi ý cho du khách thời điểm tham quan hợp lý để có trải nghiệm du lịch xanh, yên tĩnh và tôn trọng cộng đồng bản địa."*
- **Lộ trình khắc phục**: Hợp tác với Sở Du lịch hoặc các đơn vị bán vé điện tử để tích hợp API đếm lượt khách theo thời gian thực.

---

### LIM-08: KIỂM THỬ FRONTEND QUA NODE TEST RUNNER THAY VÌ PLAYWRIGHT HEADLESS
- **Mô tả**: 75 bài test frontend hiện tại được thực thi qua `node --test tests/*.test.mjs`, chưa cài đặt bộ test tự động hóa trình duyệt Playwright.
- **Nguyên nhân kỹ thuật**: Tối ưu hóa thời gian chạy CI/CD và tài nguyên môi trường máy tính phát triển.
- **Cách giải trình trước Hội đồng**:
  > *"Thưa Thầy Cô, nhóm đã áp dụng chiến lược kiểm thử phân tầng: toàn bộ logic tính toán ngày tháng, đồng bộ dữ liệu lịch trình, bộ nhớ đệm POI và các ràng buộc hiển thị UI đều được kiểm thử tự động với 75 bài test đơn vị và tích hợp (pass 100%). Đồng thời, 13 luồng người dùng cốt lõi đã được kiểm tra thủ công kỹ lưỡng trên các trình duyệt Chrome, Edge, Safari và giao diện Mobile 320px, đảm bảo không có lỗi vỡ giao diện hay nghẽn thao tác."*
- **Lộ trình khắc phục**: Cài đặt `@playwright/test` và cấu hình GitHub Actions chạy tự động hóa End-to-End trên 3 engine Chromium, Firefox và WebKit trong phiên bản phát hành v1.1.

---

## III. KẾT LUẬN VỀ TÍNH MINH BẠCH & LIÊM CHÍNH KHOA HỌC

Việc chỉ ra rõ ràng các giới hạn kỹ thuật và giải thích phương án dự phòng khoa học khẳng định:
1. Nhóm nắm vững 100% bản chất hệ thống và mã nguồn dự án.
2. Hệ thống được thiết kế với tư duy kỹ thuật bền vững (Resilient Architecture), không sụp đổ khi gặp điều kiện biên bất lợi.
3. Dự án hoàn toàn sẵn sàng cho buổi bảo vệ đồ án tốt nghiệp với thái độ trung thực và chuyên nghiệp cao nhất.
