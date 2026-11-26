Mình tổng hợp lại logic phần Knowledge Graph (KG) để mọi người dễ hình dung cách nó hoạt động trong GreenTrip.

**1. KG hoạt động như thế nào?**

Hiện tại hệ thống dùng Neo4j để lưu các mối quan hệ giữa những địa điểm du lịch.

Dữ liệu gốc vẫn nằm trong Supabase/PostgreSQL. Phần Graph Builder sẽ đọc dữ liệu POI, xử lý và chuyển những thông tin cần thiết sang Neo4j.

Trong Neo4j hiện có 4 loại node chính:
- **POI:** Địa điểm du lịch.
- **Category:** Danh mục của địa điểm.
- **Activity:** Hoạt động có thể trải nghiệm tại địa điểm.
- **Location:** Thành phố nơi địa điểm nằm.

Các node được liên kết bằng 3 quan hệ:
- **IN_CATEGORY:** POI thuộc danh mục nào.
- **OFFERS_ACTIVITY:** POI có những hoạt động gì.
- **LOCATED_IN:** POI nằm ở thành phố nào.

Ví dụ, khi truy vấn một địa điểm như Đại Nội Huế, KG có thể trả về thông tin về danh mục, hoạt động và khu vực liên quan đến địa điểm đó.

Những quan hệ này được tạo dựa trên dữ liệu và quy tắc ánh xạ có sẵn, không phải AI tự suy đoán.

**2. Logic sử dụng KG trong hệ thống**

Hiện tại KG chủ yếu phục vụ chức năng giải thích gợi ý của PB10.

Luồng hoạt động như sau:

1. Hệ thống đã có danh sách POI được gợi ý cho người dùng.
2. Người dùng bấm vào nút "Vì sao gợi ý?" tại một địa điểm.
3. Frontend gửi ID của POI lên backend.
4. Backend truy vấn Neo4j để tìm các quan hệ của POI đó.
5. Neo4j trả về các thông tin Category, Activity và Location.
6. Frontend kết hợp những thông tin này với kết quả so khớp sở thích từ Recommendation để hiển thị lời giải thích.

Ví dụ, nếu người dùng thích khám phá văn hóa và hệ thống gợi ý một địa điểm có hoạt động văn hóa tương ứng, PB10 có thể sử dụng các dữ kiện từ KG để hỗ trợ giải thích vì sao địa điểm đó phù hợp.

**3. Đồng bộ dữ liệu và xử lý khi KG gặp lỗi**

Hiện tại dữ liệu được đồng bộ từ PostgreSQL sang Neo4j thông qua Graph Builder, nhưng chưa tự động đồng bộ liên tục.

Nếu Neo4j không hoạt động, backend có cơ chế lấy dữ liệu thay thế từ PostgreSQL hoặc dữ liệu dự phòng để phần giải thích vẫn có thể hoạt động với những thông tin sẵn có.

**4. Giới hạn hiện tại**

KG đã được xây dựng và tích hợp vào phần giải thích gợi ý. Ngoài ra còn hỗ trợ một phần bộ lọc "Bản địa ít đông" trong Explore.

Tuy nhiên, KG hiện chưa tham gia trực tiếp vào việc tính điểm Recommendation hay tối ưu tuyến đường.

Nói ngắn gọn, mục đích chính của KG hiện tại là tổ chức các mối quan hệ giữa địa điểm, danh mục, hoạt động và khu vực để hệ thống có thể truy vấn và sử dụng những dữ kiện đó khi giải thích cho người dùng.

Đây là logic KG đang có trong code hiện tại, để mọi người thống nhất khi làm tài liệu và trình bày với hội đồng.