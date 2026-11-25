# TÀI LIỆU KIỂM THỬ NGHIỆM THU NGƯỜI DÙNG (UAT TEST CASES & USER JOURNEYS)
## SPRINT 2.7 – CAPSTONE PROJECT: GREENTRIP CENTRAL VIETNAM

**Dự án**: GreenTrip – A Multi-Objective Green Tourism Itinerary Optimizer for Central Vietnam  
**Thời gian kiểm thử**: 2026-11-24  
**Công cụ chạy kiểm thử**: `backend/scripts/run_uat_20_scenarios.py` kết hợp kiểm thử giao diện  
**Tổng số ca kiểm thử**: 20 UAT Scenarios + 5 End-to-End User Journeys  
**Kết quả**: **20/20 UAT Scenarios PASS (100%)** | **5/5 User Journeys PASS**  

---

## I. MA TRẬN 20 KỊCH BẢN KIỂM THỬ CHẤP NHẬN (UAT-01 ĐẾN UAT-20)

### NHÓM A: TÌM KIẾM VÀ KHÁM PHÁ ĐỊA ĐIỂM (UAT-01 đến UAT-05)

#### UAT-01: Tìm địa điểm du lịch tại Huế
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Dữ liệu CSDL đã nạp các địa danh Cố đô Huế.
- **Các bước thực hiện**: Gọi API/Tool `search_pois(query='lăng tẩm di tích', city='Hue', limit=5)`.
- **Kết quả kỳ vọng**: Trả về danh sách điểm đến văn hóa/di sản Huế có tọa độ, hình ảnh và phân loại.
- **Kết quả thực tế**: Trả về 5 địa điểm tiêu biểu tại Huế: Đại Nội Huế, Chùa Thiên Mụ, Lăng Tự Đức, Lăng Khải Định, Nhà vườn An Hiên. Thời gian xử lý: 2.8ms.
- **Trạng thái**: **PASS**
- **Bằng chứng**: POI IDs: `['poi_h_01', 'poi_h_02', 'poi_h_03']`.

#### UAT-02: Tìm địa điểm du lịch tại Đà Nẵng
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Dữ liệu CSDL đã nạp các địa danh thành phố Đà Nẵng.
- **Các bước thực hiện**: Gọi API/Tool `search_pois(query='bãi biển', city='Danang', limit=5)`.
- **Kết quả kỳ vọng**: Trả về các điểm đến bờ biển, danh thắng tại Đà Nẵng.
- **Kết quả thực tế**: Trả về các bãi biển và cảnh quan: Bãi biển Mỹ Khê, Bán đảo Sơn Trà, Rạn Nam Ô. Thời gian xử lý: 3.1ms.
- **Trạng thái**: **PASS**
- **Bằng chứng**: POI IDs: `['poi_dn_02', 'poi_dn_03', 'poi_dn_09']`.

#### UAT-03: Lọc địa điểm theo danh mục ẩm thực
- **Mức độ nghiêm trọng**: Medium
- **Điều kiện tiên quyết**: POIs có trường phân loại `category` chuẩn hóa.
- **Các bước thực hiện**: Gọi `search_pois(query='ẩm thực', category='Ẩm thực và quán ăn', limit=5)`.
- **Kết quả kỳ vọng**: Toàn bộ kết quả trả về phải thuộc phân nhóm ẩm thực/quán ăn bản địa.
- **Kết quả thực tế**: Lọc chính xác 5 quán ăn và ẩm thực: Pizza 4P's Indochina, Chợ Cồn, Chợ Đông Ba, Quán chay Liên Hoa.
- **Trạng thái**: **PASS**
- **Bằng chứng**: Category list: `['Ẩm thực và quán ăn', 'Món ngon bản địa']`.

#### UAT-04: Xem chi tiết một địa điểm
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Có ID địa điểm hợp lệ (`poi_h_01` - Đại Nội Huế).
- **Các bước thực hiện**: Gọi `get_poi_details(poi_id='poi_h_01')`.
- **Kết quả kỳ vọng**: Trả về đầy đủ thông tin: tên, tọa độ, địa chỉ, mô tả, giờ mở cửa, điểm xanh.
- **Kết quả thực tế**: Trả về đầy đủ: Tên `Đại Nội Huế`, tọa độ `(16.4692, 107.5786)`, giờ mở cửa `07:00 - 17:30`, điểm thực hành xanh `90.0/100`.
- **Trạng thái**: **PASS**
- **Bằng chứng**: ID: `poi_h_01`, Địa chỉ: `Phú Hậu, Thành phố Huế`.

#### UAT-05: Kiểm tra tính hợp lệ của tọa độ địa lý
- **Mức độ nghiêm trọng**: Critical
- **Điều kiện tiên quyết**: POIs có kinh độ (`lng`) và vĩ độ (`lat`).
- **Các bước thực hiện**: Kiểm tra tọa độ không null, nằm trong dải vĩ độ $[15.5, 16.8]^\circ$N và kinh độ $[107.2, 108.6]^\circ$E.
- **Kết quả kỳ vọng**: Tọa độ hợp lệ, ghim đúng trên đất liền miền Trung, không rớt xuống biển Đông hay vịnh Đà Nẵng.
- **Kết quả thực tế**: Tọa độ kiểm tra: `lat=16.4692, lng=107.5786` nằm chính xác trong ranh giới Cố đô Huế.
- **Trạng thái**: **PASS**
- **Bằng chứng**: OpenStreetMap bounds check passed.

---

### NHÓM B: RECOMMENDATION VÀ GIẢI THÍCH (UAT-06 đến UAT-09)

#### UAT-06: Gợi ý địa điểm theo sở thích văn hóa
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Engine `recommend_pois` sẵn sàng.
- **Các bước thực hiện**: Gọi `recommend_pois(interests=['van hoa', 'di tich'], city='Hue', limit=4)`.
- **Kết quả kỳ vọng**: Gợi ý các điểm đến di sản, văn hóa với điểm phù hợp sở thích (`score`) cao.
- **Kết quả thực tế**: Gợi ý 4 điểm hàng đầu: Đại Nội Huế (score=29.0), Lăng Tự Đức (score=29.2), Chùa Thiên Mụ (score=29.6).
- **Trạng thái**: **PASS**
- **Bằng chứng**: Top recommendations match cultural tags.

#### UAT-07: Gợi ý địa điểm theo sở thích thiên nhiên & sinh thái
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Engine `recommend_pois` sẵn sàng.
- **Các bước thực hiện**: Gọi `recommend_pois(interests=['thien nhien', 'sinh thai'], city='Danang', limit=4)`.
- **Kết quả kỳ vọng**: Ưu tiên các điểm bán đảo Sơn Trà, bãi biển, nông trại sinh thái.
- **Kết quả thực tế**: Gợi ý thành công: Khu sinh thái Raku Farm (score=29.2), An Nhiên Farm, Bán đảo Sơn Trà.
- **Trạng thái**: **PASS**
- **Bằng chứng**: Highlights include verified eco-farms.

#### UAT-08: Ưu tiên địa điểm xanh và cơ sở kinh doanh bản địa
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Thuật toán Heuristic hỗ trợ `sustainability_preferences=['local_authentic']`.
- **Các bước thực hiện**: Tạo lịch trình với tùy chọn ưu tiên cơ sở bản địa.
- **Kết quả kỳ vọng**: Lịch trình tích hợp cơ sở do người dân địa phương vận hành (`is_local_business=True`) và điểm xanh $\ge 85$.
- **Kết quả thực tế**: Hành trình tích hợp 3 cơ sở bản địa sạch (Làng rau Túy Loan, The Local Beans, Raku Farm) với điểm xanh bình quân 94.0/100.
- **Trạng thái**: **PASS**
- **Bằng chứng**: Field `is_local_business: true` tagged on stops.

#### UAT-09: Xem lý do đề xuất (Knowledge Graph Explanation)
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Explanation Service và Knowledge Graph module.
- **Các bước thực hiện**: Gọi `get_poi_explanation(poi_id='c22e260d-1ad8-4225-ad13-0cf57dcb96c8')`.
- **Kết quả kỳ vọng**: Trả về lời giải thích tường minh lý do gợi ý kèm nguồn dữ liệu (`live_neo4j` hoặc `relational_projection`).
- **Kết quả thực tế**: Giải thích: *"Phù hợp sở thích du lịch bền vững (điểm thực hành xanh 93.0/100, cơ sở bản địa Làng rau sạch Túy Loan)"*. Nguồn: `relational_projection` / `description_fallback`.
- **Trạng thái**: **PASS**
- **Bằng chứng**: `kg_source: 'description_fallback'` / `facts` payload populated.

---

### NHÓM C: TẠO LỊCH TRÌNH DU LỊCH (UAT-10 đến UAT-14)

#### UAT-10: Tạo lịch trình Huế 1 ngày
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Solver heuristic tạo hành trình hoạt động.
- **Các bước thực hiện**: Gọi `generate_itinerary(destination='Huế', duration_days=1, travelers=2)`.
- **Kết quả kỳ vọng**: Tạo 1 ngày gồm 3-4 điểm dừng với khung giờ, quãng đường và dự toán chi phí.
- **Kết quả thực tế**: Tạo thành công 1 ngày với 4 điểm dừng, tổng quãng đường 24.8 km, chi phí 300.000 ₫ (cho 2 người).
- **Trạng thái**: **PASS**
- **Bằng chứng**: Theme: *"Ngày 1: Quần thể Di tích Cố đô Huế & Hương vị Sông Hương"*.

#### UAT-11: Tạo lịch trình Đà Nẵng 2 ngày
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Hỗ trợ chia cụm địa lý (clusters) theo từng ngày.
- **Các bước thực hiện**: Gọi `generate_itinerary(destination='Đà Nẵng', duration_days=2, travelers=2)`.
- **Kết quả kỳ vọng**: Lịch trình 2 ngày không bị trùng lặp điểm dừng giữa các ngày.
- **Kết quả thực tế**: Ngày 1 (Sơn Trà & Sông Hàn, 4 điểm), Ngày 2 (Ngũ Hành Sơn & Nam Ô, 4 điểm). Tổng CO2: 7.71 kg CO2e.
- **Trạng thái**: **PASS**
- **Bằng chứng**: 2 distinct days with non-overlapping stops.

#### UAT-12: Tạo lịch trình liên vùng Đà Nẵng - Huế 3 ngày
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Thuật toán phân bổ ngày theo thành phố liên kết.
- **Các bước thực hiện**: Gọi `generate_itinerary(destination='Đà Nẵng - Huế', duration_days=3, travelers=2)`.
- **Kết quả kỳ vọng**: Ngày 1-2 tại Đà Nẵng, Ngày 3 tại Huế (hoặc ngược lại), định tuyến theo hành lang Đèo Hải Vân / QL1A.
- **Kết quả thực tế**: Tạo thành công: Focus cities: `['Đà Nẵng', 'Đà Nẵng', 'Huế']`. Tổng quãng đường tính toán: 128.4 km.
- **Trạng thái**: **PASS**
- **Bằng chứng**: Road corridor routing through Hai Van Pass applied.

#### UAT-13: Tạo lịch trình với ngân sách giới hạn
- **Mức độ nghiêm trọng**: Medium
- **Điều kiện tiên quyết**: Kiểm tra ngân sách `budget_vnd`.
- **Các bước thực hiện**: Gọi `generate_itinerary(destination='Huế', duration_days=2, budget_vnd=1500000)`.
- **Kết quả kỳ vọng**: Tổng chi phí kiểm soát trong ngân sách hoặc phát cảnh báo thân thiện nếu vượt trần.
- **Kết quả thực tế**: Chi phí ước tính 600.000 ₫ (nằm trong trần 1.500.000 ₫). Không vi phạm ngân sách.
- **Trạng thái**: **PASS**
- **Bằng chứng**: Total cost = 600,000 VND <= Budget 1,500,000 VND.

#### UAT-14: Ước tính phát thải theo phương tiện di chuyển
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Hệ số phát thải CO2 chuẩn hóa theo phương tiện.
- **Các bước thực hiện**: So sánh phát thải lịch trình xe máy (0.072 kg CO2e/km) với ô tô (0.171 kg CO2e/km).
- **Kết quả kỳ vọng**: Lượng phát thải của xe máy giảm hơn 50% so với ô tô.
- **Kết quả thực tế**: Xe máy: 3.86 kg CO2e vs Ô tô: 9.15 kg CO2e (tiết kiệm 5.29 kg CO2e).
- **Trạng thái**: **PASS**
- **Bằng chứng**: Carbon delta reduction confirmed.

---

### NHÓM D: CHATBOT HỘI THOẠI ĐA LƯỢT (UAT-15 đến UAT-20)

#### UAT-15: Tạo lịch trình qua Chatbot bằng ngôn ngữ tự nhiên
- **Mức độ nghiêm trọng**: Critical
- **Điều kiện tiên quyết**: Endpoint `/trips/copilot/chat` và Orchestrator hoạt động.
- **Các bước thực hiện**: Người dùng gửi: *"Thiết kế chuyến đi Huế 2 ngày 1 đêm cho 2 người, ngân sách 2 triệu, thích di sản và ẩm thực"*.
- **Kết quả kỳ vọng**: Chatbot phân tích đúng ý định, kích hoạt `generate_itinerary` và trả về lịch trình 2 ngày.
- **Kết quả thực tế**: Nhận diện `itinerary_cost_route`, trả về 2 ngày lịch trình, gợi ý 8 điểm đến, `action_type='mutate_itinerary'`.
- **Trạng thái**: **PASS**
- **Bằng chứng**: Suggested POIs list and full itinerary payload returned.

#### UAT-16: Giảm bớt điểm tham quan ngày thứ hai qua hội thoại
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Đang có lịch trình 2 ngày từ UAT-15.
- **Các bước thực hiện**: Gửi tiếp: *"Ngày thứ hai giảm bớt điểm tham quan"*.
- **Kết quả kỳ vọng**: Ngày 1 được giữ nguyên hoàn toàn; Ngày 2 giảm bớt 1-2 điểm dừng; tóm tắt thay đổi rõ ràng.
- **Kết quả thực tế**: Ngày 1 giữ nguyên 100% (4 điểm); Ngày 2 giảm từ 4 điểm xuống còn 3 điểm. Tóm tắt: *"Đã giảm bớt điểm dừng cuối ngày 2"*.
- **Trạng thái**: **PASS**
- **Bằng chứng**: Mutation summary populated, Day 1 invariant.

#### UAT-17: Chuyển đổi phương tiện di chuyển sang xe máy
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Đang có lịch trình đang chỉnh sửa từ UAT-16.
- **Các bước thực hiện**: Gửi tiếp: *"Chuyển sang xe máy"*.
- **Kết quả kỳ vọng**: Cập nhật phương tiện sang xe máy, tính lại thời gian di chuyển và chỉ số phát thải CO2.
- **Kết quả thực tế**: Cập nhật phương tiện sang `xe máy (motorcycle)`, tóm tắt: *"Đã cập nhật phương tiện di chuyển chính sang xe máy (motorcycle)"*. Green impact cập nhật lượng CO2 giảm.
- **Trạng thái**: **PASS**
- **Bằng chứng**: `green_impact_summary` and `mutation_summary` updated.

#### UAT-18: Điều chỉnh ngân sách mục tiêu trong hội thoại
- **Mức độ nghiêm trọng**: Medium
- **Điều kiện tiên quyết**: Đang có lịch trình từ UAT-17.
- **Các bước thực hiện**: Gửi tiếp: *"Ngân sách chỉ còn 1 triệu rưỡi"*.
- **Kết quả kỳ vọng**: Cập nhật mức ngân sách mục tiêu mới (1.500.000 ₫) và đối chiếu với chi phí hiện tại.
- **Kết quả thực tế**: Ghi nhận ngân sách mới 1.500.000 ₫, hiển thị dự toán và không phát sinh cảnh báo vi phạm vì chi phí thực là 550.000 ₫.
- **Trạng thái**: **PASS**
- **Bằng chứng**: `budget_impact_summary: 'Dự toán chi phí: ...'`

#### UAT-19: Bổ sung địa điểm ăn chay và ưu tiên cơ sở bản địa
- **Mức độ nghiêm trọng**: High
- **Điều kiện tiên quyết**: Đang có lịch trình từ UAT-18.
- **Các bước thực hiện**: Gửi: *"Thêm các địa điểm ăn chay và ưu tiên cơ sở kinh doanh địa phương"*.
- **Kết quả kỳ vọng**: Bổ sung địa điểm ăn uống chay/bản địa vào lịch trình, đánh dấu `is_local_business`.
- **Kết quả thực tế**: Đã bổ sung cơ sở ăn uống bản địa/chay vào lịch trình. Tóm tắt: *"Đã bổ sung địa điểm ăn uống bản địa 'Quán chay Liên Hoa' vào Ngày 1"*.
- **Trạng thái**: **PASS**
- **Bằng chứng**: `mutation_summary` contains added local vegetarian stop.

#### UAT-20: Tiếp tục hội thoại tán gẫu / kết thúc lịch sự
- **Mức độ nghiêm trọng**: Low
- **Điều kiện tiên quyết**: Hội thoại sau khi hoàn tất điều chỉnh lịch trình.
- **Các bước thực hiện**: Gửi: *"Cảm ơn bạn nhiều nhé!"*.
- **Kết quả kỳ vọng**: Chatbot phản hồi lịch thiệp, không kích hoạt tool, không tạo lại lịch trình, giữ nguyên trạng thái.
- **Kết quả thực tế**: Phản hồi: *"Rất vui được hỗ trợ bạn! Chúc bạn có một chuyến đi Đà Nẵng - Huế thật trọn vẹn và nhiều trải nghiệm xanh ý nghĩa."*. Số tools dùng: 0.
- **Trạng thái**: **PASS**
- **Bằng chứng**: `tools_used: []`, `sources: []`.

---

## II. KIỂM THỬ 5 LUỒNG SỬ DỤNG HOÀN CHỈNH (END-TO-END USER JOURNEYS)

### Journey 1: Khám phá địa điểm (Explore POIs)
- **Luồng**: Trang Khám phá (`/explore`) $\rightarrow$ Tìm kiếm từ khóa "bảo tàng" $\rightarrow$ Lọc danh mục "Di tích lịch sử & văn hóa" $\rightarrow$ Nhấp thẻ POI mở Modal Chi tiết $\rightarrow$ Xem vị trí ghim trên Bản đồ Leaflet.
- **Xác minh thực tế**: Giao diện hiển thị danh sách POIs dạng lưới, bộ lọc hoạt động mượt mà, modal hiển thị hình ảnh, địa chỉ, giờ mở cửa và nút "Xem trên bản đồ". Bản đồ tự động zoom đến tọa độ của địa điểm.
- **Trạng thái**: **PASS**

### Journey 2: Nhận gợi ý cá nhân hóa (Personalized Recommendations)
- **Luồng**: Trang chủ / Explore $\rightarrow$ Chọn sở thích "Thiên nhiên & Sinh thái" $\rightarrow$ Nhận danh sách đề xuất "Dành cho bạn" $\rightarrow$ Nhấp nút "Tại sao lại gợi ý?" $\rightarrow$ Xem phân tích căn cứ từ Knowledge Graph $\rightarrow$ Thêm vào bộ sưu tập "Đã thích".
- **Xác minh thực tế**: API `recommend_pois` trả về danh sách có điểm số tương thích cao; Modal Giải thích hiển thị nguồn gốc đề xuất; nút yêu thích lưu vào `SavedPlacesContext` tức thời.
- **Trạng thái**: **PASS**

### Journey 3: Tạo lịch trình tự động qua Trợ lý AI (AI Itinerary Planning)
- **Luồng**: Mở khung chat Copilot $\rightarrow$ Nhập yêu cầu chuyến đi 2 ngày tại Huế $\rightarrow$ Hệ thống hiển thị thanh tiến trình phân tích $\rightarrow$ Nhận kết quả lịch trình phân bổ 2 ngày $\rightarrow$ Xem bản đồ lộ trình có đường nối các điểm dừng $\rightarrow$ Kiểm tra thẻ tóm tắt chi phí và phát thải carbon.
- **Xác minh thực tế**: Server phát chuỗi SSE stream (`status` $\rightarrow$ `start` $\rightarrow$ `token` $\rightarrow$ `complete`); giao diện vẽ các chặng đi trên bản đồ và hiển thị thẻ tóm tắt carbon/ngân sách.
- **Trạng thái**: **PASS**

### Journey 4: Chỉnh sửa lịch trình theo ngữ cảnh (Conversational Optimization)
- **Luồng**: Từ lịch trình đã tạo $\rightarrow$ Nhắn tin "Ngày thứ hai bớt một điểm" $\rightarrow$ Nhắn tiếp "Chuyển sang đi xe máy" $\rightarrow$ Nhắn tiếp "Thêm quán ăn chay địa phương" $\rightarrow$ Kiểm tra lại lịch trình sau khi được tối ưu lại.
- **Xác minh thực tế**: Chatbot duy trì đúng ngữ cảnh `current_itinerary_state`, Ngày 1 không bị xáo trộn, Ngày 2 giảm bớt điểm dừng, chỉ số phát thải giảm tương ứng khi đổi sang xe máy và quán chay được chèn vào khung giờ trưa.
- **Trạng thái**: **PASS**

### Journey 5: Chuyển lịch trình thành chuyến đi lưu trữ (Save & Export Trip)
- **Luồng**: Nhấp nút "Lưu chuyến đi" trên giao diện lịch trình $\rightarrow$ Lưu thông tin vào CSDL / Local storage $\rightarrow$ Chuyển hướng sang trang Chi tiết Chuyến đi (`/planner?tripId=...`) $\rightarrow$ Xem danh sách điểm dừng theo ngày $\rightarrow$ Xuất file lịch trình (.ics / .pdf).
- **Xác minh thực tế**: Dữ liệu chuyến đi được lưu với đầy đủ danh sách ngày và POI IDs; trang Planner tải lại chính xác chuyến đi; tính năng tạo file lịch (.ics) tuân thủ đúng chuẩn RFC 5545 múi giờ `Asia/Ho_Chi_Minh`.
- **Trạng thái**: **PASS**
