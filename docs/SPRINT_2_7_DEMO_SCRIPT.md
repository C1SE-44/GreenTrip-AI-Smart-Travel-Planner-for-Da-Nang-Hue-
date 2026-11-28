# KỊCH BẢN DEMO BẢO VỆ ĐỒ ÁN TỐT NGHIỆP (DEMO SCRIPTS)
## SPRINT 2.7 – CAPSTONE PROJECT: GREENTRIP CENTRAL VIETNAM

**Dự án**: GreenTrip – Nền tảng thiết kế hành trình du lịch xanh tại Đà Nẵng–Huế  
*A Multi-Objective Green Tourism Itinerary Optimizer for Central Vietnam*  
**Thời gian chuẩn bị**: 2026-11-24  
**Phục vụ**: Buổi thuyết trình & Bảo vệ đồ án tốt nghiệp Hội đồng chuyên môn  

---

## DEMO 1: KHÁM PHÁ & GỢI Ý ĐỊA ĐIỂM DU LỊCH XANH CÁ NHÂN HÓA
- **Thời lượng mục tiêu**: 3 – 5 phút
- **Người thực hiện**: Trình bày viên chính (Lead Presenter)
- **Mục tiêu**: Chứng minh khả năng tìm kiếm, phân loại thông minh, xếp hạng theo tiêu chuẩn du lịch bền vững và giải thích lý do đề xuất bằng Knowledge Graph.

### 1. Kịch bản nói & Thao tác trên giao diện

| Thời gian | Lời thoại thuyết trình (Script) | Thao tác trên màn hình (UI Action) | Kết quả kỳ vọng |
| :---: | :--- | :--- | :--- |
| **00:00 - 01:00** | *"Kính thưa Hội đồng, GreenTrip là nền tảng tiên phong tích hợp tiêu chí phát thải thấp và kinh tế bản địa vào trải nghiệm du lịch miền Trung. Em xin bắt đầu với trang Khám phá."* | Mở trình duyệt tại đường dẫn `/explore`. Di chuột qua các tab phân loại (Cảnh quan, Văn hóa, Ẩm thực, Lưu trú). | Hiển thị giao diện sắc nét, lưới địa điểm có ảnh chụp chất lượng cao và huy hiệu Điểm Xanh (`green_score`). |
| **01:00 - 02:00** | *"Người dùng có thể tìm kiếm theo nhu cầu cụ thể. Ví dụ, khi em gõ từ khóa 'lăng tẩm' và chọn thành phố Huế..."* | Nhập từ khóa `"lăng tẩm"` vào thanh tìm kiếm, chọn bộ lọc thành phố `"Huế"`. | Lưới tự động lọc hiển thị Đại Nội Huế, Lăng Tự Đức, Lăng Khải Định với nhãn Di sản văn hóa. |
| **02:00 - 03:30** | *"Điểm khác biệt của GreenTrip nằm ở tính minh bạch: Tại sao địa điểm này lại được gợi ý? Em xin nhấp vào nút 'Tại sao lại đề xuất?' của Làng sinh thái Thủy Biều."* | Nhấp vào thẻ POI Thủy Biều, bấm nút **"Tại sao lại đề xuất?"**. | Modal Knowledge Graph xuất hiện, hiển thị lời giải thích: *Điểm thực hành xanh 98/100, bảo tồn vườn bưởi Thanh Trà truyền thống, trải nghiệm ngâm chân thảo dược bản địa*. |
| **03:30 - 04:30** | *"Du khách có thể lưu địa điểm này vào bộ sưu tập cá nhân để sẵn sàng lập lịch trình chỉ bằng một cú nhấp chuột."* | Nhấp biểu tượng Trái tim (Yêu thích). Mở tab **"Đã thích"** để xem bộ sưu tập. | Địa điểm được thêm ngay lập tức vào bộ nhớ lưu trữ mà không cần tải lại trang. |

### 2. Chuẩn bị dữ liệu & Kế hoạch dự phòng
- **Dữ liệu chuẩn bị sẵn**: 3 POIs văn hóa Huế (`poi_h_01`, `poi_h_03`), 2 POIs sinh thái Đà Nẵng (Sơn Trà, An Nhiên Farm).
- **Rủi ro kỹ thuật**: Mạng chập chờn khi gọi Neo4j Aura từ xa.
- **Phương án xử lý (Contingency)**: Hệ thống tự động kích hoạt `relational_projection` và `description_fallback` tức thời trong <10ms, đảm bảo modal giải thích luôn hiển thị đầy đủ thông tin mà không báo lỗi.

---

## DEMO 2: THIẾT KẾ HÀNH TRÌNH TỐI ƯU ĐA MỤC TIÊU BẰNG AI
- **Thời lượng mục tiêu**: 5 – 7 phút
- **Người thực hiện**: Kỹ sư AI & Thuật toán (AI / Algorithm Engineer)
- **Mục tiêu**: Trình diễn Trợ lý Chatbot Copilot tiếp nhận yêu cầu tự nhiên, lập kế hoạch bằng Orchestrator và giải bài toán tối ưu hóa đa mục tiêu (quãng đường, chi phí, phát thải carbon).

### 1. Kịch bản nói & Thao tác trên giao diện

| Thời gian | Lời thoại thuyết trình (Script) | Thao tác trên màn hình (UI Action) | Kết quả kỳ vọng |
| :---: | :--- | :--- | :--- |
| **00:00 - 01:30** | *"Tiếp theo, em xin giới thiệu tính năng cốt lõi: Thiết kế hành trình xanh tự động. Em mở khung chat AI Copilot và gửi yêu cầu bằng ngôn ngữ tự nhiên."* | Mở khung chat Copilot tại góc màn hình hoặc trang Planner. Nhập: *"Thiết kế chuyến đi Huế 2 ngày 1 đêm cho 2 người, ngân sách 2 triệu, thích văn hóa và thiên nhiên"*. Bấm Gửi. | Giao diện hiển thị thanh trạng thái phân tích: *"Đang phân tích nhu cầu & kiểm tra dữ liệu du lịch xanh..."*. |
| **01:30 - 03:30** | *"Thay vì tạo ngẫu nhiên, Orchestrator kích hoạt RAG truy xuất nguồn dữ liệu văn hóa và chạy bộ giải Heuristic Nearest-Neighbor kết hợp 2-Opt để loại bỏ hiện tượng đi zíc-zắc."* | Quan sát các câu trả lời hiển thị lũy tiến (Streaming typewriter effect). | Xuất hiện khối lịch trình 2 ngày: Ngày 1 (Hoàng thành, Chùa Thiên Mụ, Nhà vườn), Ngày 2 (Lăng Tự Đức, Đầm Chuồn). |
| **03:30 - 05:00** | *"Hệ thống trực quan hóa toàn bộ lộ trình trên bản đồ số, nối các chặng đường thực tế qua QL1A và sông Hương. Tại mỗi điểm dừng, du khách thấy rõ thời gian đến, thời lượng tham quan và trạng thái chi phí."* | Nhấp vào các thẻ ngày 1, ngày 2 để xem bản đồ chuyển động. Trỏ chuột vào các điểm dừng. | Bản đồ tự động zoom theo cụm điểm; thẻ tóm tắt chi phí (dự toán: 600.000 ₫ / 2.000.000 ₫) và phát thải CO2 (3.86 kg CO2e) hiển thị rõ ràng. |
| **05:00 - 06:30** | *"Đặc biệt, hệ thống minh bạch các giới hạn dữ liệu: nếu giá vé chưa có niêm yết mới nhất, Copilot sẽ ghi chú 'missing_data' chứ không mặc định bằng 0 để tránh gây hiểu lầm cho du khách."* | Mở phần **"Dữ liệu & Nguồn tham khảo"** dưới câu trả lời của Chatbot. | Danh sách tài liệu RAG xuất hiện kèm trích dẫn văn bản di sản Huế. |

### 2. Chuẩn bị dữ liệu & Kế hoạch dự phòng
- **Dữ liệu chuẩn bị sẵn**: Mẫu câu prompt chuẩn đã được lưu sẵn vào clipboard để paste nhanh nếu cần.
- **Rủi ro kỹ thuật**: LLM Cloud timeout hoặc OSRM định tuyến công cộng bị nghẽn mạng.
- **Phương án xử lý (Contingency)**: Bộ điều phối Orchestrator tự động kích hoạt thuật toán sinh lịch trình Heuristic nội bộ và mô hình Haversine Detour QL1A, đảm bảo trả kết quả trong vòng <1.5 giây.

---

## DEMO 3: TỐI ƯU HÓA HÀNH TRÌNH QUA HỘI THOẠI ĐA LƯỢT (CONVERSATIONAL OPTIMIZATION)
- **Thời lượng mục tiêu**: 4 – 6 phút
- **Người thực hiện**: Kỹ sư Full-stack & Trưởng nhóm
- **Mục tiêu**: Chứng minh khả năng giữ ngữ cảnh (context retention), chỉnh sửa lịch trình linh hoạt theo yêu cầu phát sinh mà không làm xáo trộn các phần không yêu cầu.

### 1. Kịch bản nói & Thao tác trên giao diện

| Thời gian | Lời thoại thuyết trình (Script) | Thao tác trên màn hình (UI Action) | Kết quả kỳ vọng |
| :---: | :--- | :--- | :--- |
| **00:00 - 01:30** | *"Trong thực tế, du khách luôn có nhu cầu thay đổi linh hoạt. Em sẽ yêu cầu Chatbot giảm bớt điểm tham quan ngày thứ hai để chuyến đi thong thả hơn."* | Nhập vào ô chat: *"Ngày thứ hai giảm bớt điểm tham quan"*. Bấm Gửi. | Chatbot phản hồi: Ngày 1 giữ nguyên 100%; Ngày 2 giảm từ 4 điểm xuống 3 điểm dừng thư thái hơn. Bản đồ tự động cập nhật lại lộ trình ngày 2. |
| **01:30 - 03:00** | *"Bây giờ, nhóm du khách quyết định chuyển sang đi xe máy để tiết kiệm chi phí và ngắm cảnh ven sông."* | Nhập tiếp: *"Chuyển sang xe máy"*. Bấm Gửi. | Chatbot tính toán lại: Vận tốc điều chỉnh về 30 km/h, thời gian di chuyển giữa các điểm cập nhật lại, lượng phát thải CO2 giảm mạnh từ ô tô xuống xe máy. |
| **03:00 - 04:30** | *"Tiếp theo, du khách muốn bổ sung trải nghiệm ẩm thực chay và ưu tiên ủng hộ người dân bản địa."* | Nhập tiếp: *"Thêm các địa điểm ăn chay và ưu tiên cơ sở kinh doanh địa phương"*. Bấm Gửi. | Điểm dừng ăn uống trưa ngày 1 được bổ sung quán chay địa phương (`Quán chay Liên Hoa` - điểm xanh 92), gắn cờ `is_local_business: true`. |
| **04:30 - 05:30** | *"Cuối cùng, khi du khách gửi lời cảm ơn, Chatbot giao tiếp tự nhiên và không kích hoạt lại công cụ tạo lịch trình."* | Nhập: *"Cảm ơn bạn nhiều nhé!"*. Bấm Gửi. | Chatbot phản hồi lịch thiệp, chúc chuyến đi tốt đẹp, giữ nguyên toàn bộ trạng thái lịch trình trên màn hình. |

### 2. Chuẩn bị dữ liệu & Kế hoạch dự phòng
- **Dữ liệu chuẩn bị sẵn**: Phiên chat liên tục tiếp nối từ Demo 2.
- **Rủi ro kỹ thuật**: Trình duyệt refresh làm mất state.
- **Phương án xử lý (Contingency)**: Trạng thái lịch trình được đồng bộ liên tục vào `sessionStorage` và `current_itinerary_state`, nếu bấm F5 giao diện tự khôi phục lịch trình gần nhất.

---

## TỔNG KẾT ĐIỀU KIỆN SẴN SÀNG DEMO
1. **Frontend**: Đã build thành công bản tối ưu hóa production, giao diện phản hồi mượt mà không lỗi console.
2. **Backend**: Tích hợp sẵn sàng chế độ tự hành (Self-contained Heuristic + Local Database fallback), có thể chạy offline hoàn toàn trên máy trạm demo phòng trường hợp hội trường mất kết nối Internet.
3. **Kịch bản phân vai**: Đã phân chia thời lượng rõ ràng, tập trung vào 3 giá trị cốt lõi: **Xanh (Green) – Thông minh (AI Optimizer) – Bản địa (Local Authentic)**.
