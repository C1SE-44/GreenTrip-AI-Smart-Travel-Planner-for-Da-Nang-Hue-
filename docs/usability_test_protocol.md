# Kịch Bản Kiểm Thử Khả Dụng (Usability Testing Protocol) — GreenTrip AI

> Mục tiêu: Đo lường trải nghiệm thực tế của người dùng trên **2 Hành trình vàng** trước khi cải tiến (**Vòng 1 — Baseline, Tuần 1**) và sau khi hoàn thiện (**Vòng 2 — Verification, Tuần 5**) để lấy số liệu khách quan đưa vào báo cáo bảo vệ đồ án tốt nghiệp.

---

## 1. Chân Dung Người Tham Gia & Quy Mô

- **Số lượng**: **5 người/vòng** (Vòng 1 và Vòng 2 cùng tiêu chí chân dung; ưu tiên 5 người chưa quen mã nguồn dự án).
- **Chân dung**: Độ tuổi **20–30**, có thói quen đi du lịch tự túc, đang có nhu cầu hoặc từng đi tuyến **Đà Nẵng – Huế 3–4 ngày**.
- **Thời lượng mỗi phiên**: **20 phút/người** (thao tác trực tiếp trên Google Chrome Desktop, khuyến khích nghĩ thành tiếng / Think-Aloud).
- **Nguyên tắc điều phối**: Không gợi ý nút bấm hay giải thích giao diện trước khi người dùng thử tìm; chỉ can thiệp nếu người dùng kẹt hoàn toàn quá 3 phút và ghi lại lỗi đó.

---

## 2. Hai Nhiệm Vụ Thực Chiến (Golden Paths)

### Nhiệm vụ A (Luồng AI-first — Khoảng 10 phút)
> *"Giả sử bạn và người bạn thân (2 người) sắp tự túc đi Đà Nẵng – Huế 3 ngày với ngân sách khoảng 6 triệu đồng. Hãy dùng GreenTrip AI để tạo lịch trình đầu tiên, nhờ AI đổi một bữa trưa ngày thứ 2 sang món chay nhẹ nhàng, bật thử phương án ứng phó khi trời mưa, rồi lưu và xuất lịch trình mang đi."*

- **Điểm đánh dấu hoàn thành**:
  1. Tạo được lịch trình 3 ngày, 2 người, ngân sách 6 triệu (bấm đồng hồ từ lúc bắt đầu đến khi thấy lịch trình 3 ngày đầu tiên).
  2. Hỏi AI Copilot và áp dụng được gợi ý món chay / đổi điểm vào lịch trình hoặc ý tưởng.
  3. Kích hoạt được chế độ ngày mưa (Rainy Day Switch) xem điểm thay thế.
  4. Xuất được file `.ics` hoặc mở chế độ xuất/in PDF không lỗi.

### Nhiệm vụ B (Luồng Explore-first — Khoảng 8 phút)
> *"Bạn muốn tự tìm hiểu trước các địa điểm xanh ít đông đúc ở Huế, lưu lại một số điểm ưng ý, hoặc xem thử hành trình mẫu có sẵn rồi biến nó thành lịch trình riêng để tự sắp xếp lại thứ tự các điểm."*

- **Điểm đánh dấu hoàn thành**:
  1. Lọc được địa điểm ở Huế trên trang Khám phá (`/explore`) và mở xem lý do gợi ý xanh.
  2. Lưu được ít nhất 2 địa điểm yêu thích và mở xem lại.
  3. Mở chuyến mẫu hoặc tạo lịch trình từ điểm đã lưu và tự sắp xếp/tối ưu lộ trình theo ngày.

---

## 3. Phiếu Ghi Nhận Kết Quả (Metrics Sheet)

| Người dùng | Vòng | Hoàn thành Task A | Hoàn thành Task B | Thời gian tới lịch 3 ngày đầu (giây) | Điểm kẹt chính (Friction Notes) | Điểm SUS (0–100) |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| U01 | Vòng 1 / Vòng 2 | Đạt / Trượt | Đạt / Trượt | ...s | ... | ... |
| U02 | Vòng 1 / Vòng 2 | Đạt / Trượt | Đạt / Trượt | ...s | ... | ... |
| U03 | Vòng 1 / Vòng 2 | Đạt / Trượt | Đạt / Trượt | ...s | ... | ... |
| U04 | Vòng 1 / Vòng 2 | Đạt / Trượt | Đạt / Trượt | ...s | ... | ... |
| U05 | Vòng 1 / Vòng 2 | Đạt / Trượt | Đạt / Trượt | ...s | ... | ... |

### Mục tiêu nghiệm thu ở Vòng 2 (Tuần 5)
- **Tỉ lệ hoàn thành**: **≥ 4/5 người** hoàn thành cả 2 nhiệm vụ không cần trợ giúp sâu.
- **Thời gian tới lịch 3 ngày đầu tiên**: Trung bình **< 180 giây (3 phút)**.
- **Điểm SUS trung bình**: **≥ 70 / 100**.

---

## 4. Bộ 10 Câu Hỏi Đánh Giá SUS (Thang điểm 1 = Rất không đồng ý → 5 = Rất đồng ý)

1. Tôi nghĩ tôi sẽ muốn sử dụng GreenTrip AI thường xuyên cho các chuyến đi.
2. Tôi thấy hệ thống phức tạp một cách không cần thiết.
3. Tôi thấy hệ thống dễ sử dụng.
4. Tôi nghĩ mình cần sự hỗ trợ của người rành kỹ thuật mới dùng được hệ thống này.
5. Tôi thấy các chức năng (Khám phá, Bản đồ, Lịch trình, AI Chat) được tích hợp ăn khớp với nhau.
6. Tôi thấy hệ thống có quá nhiều điểm thiếu nhất quán.
7. Tôi nghĩ đa số mọi người sẽ học cách dùng GreenTrip AI rất nhanh.
8. Tôi thấy hệ thống khá rườm rà / khó thao tác.
9. Tôi cảm thấy tự tin khi sử dụng các chức năng lập lịch trình của hệ thống.
10. Tôi phải học hỏi quá nhiều thứ trước khi có thể bắt đầu sử dụng hệ thống này.

*(Công thức tính điểm SUS: Với câu lẻ 1,3,5,7,9 lấy `điểm - 1`; với câu chẵn 2,4,6,8,10 lấy `5 - điểm`; cộng cả 10 câu rồi nhân `2.5` để quy ra thang `0–100`.)*
