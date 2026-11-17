# GreenTrip AI — Usability Test Plan (Think-Aloud & Quantitative Benchmarks)

## 1. Mục tiêu kiểm thử
Đánh giá mức độ dễ sử dụng, tốc độ đạt giá trị đầu tiên (**Time-to-First-Itinerary < 30 giây**), và khả năng tự điều chỉnh lịch trình bằng thao tác 1 chạm trên bộ đôi Đà Nẵng – Huế cho người dùng chưa đăng nhập (Guest) và người dùng quay lại.

## 2. Đối tượng & Quy mô mẫu
- **Số lượng**: 5–8 người tham gia (phủ đủ 3 nhóm: du khách trẻ tự túc, nhóm bạn/cặp đôi, gia đình có người lớn tuổi hoặc trẻ em).
- **Hình thức**: Moderated **Think-Aloud** (15–20 phút/người), quay màn hình + ghi âm suy nghĩ khi thao tác trên Desktop (`1280×800`) và Mobile hẹp (`320–390px`).
- **Trạng thái dữ liệu kiểm chứng**:
  - Bộ POI `data/processed/all_pois_cleaned.csv` (482 địa điểm: **Đà Nẵng 247**, **Huế 235**).
  - Mức phủ điểm trong nhà (`INDOOR_SUB_CATEGORIES` + ẩm thực/cafe): Đà Nẵng **43** sub-category trong nhà (**165** gồm ẩm thực/cafe), Huế **53** sub-category trong nhà (**161** gồm ẩm thực/cafe), đảm bảo tính năng *"Trời mưa? Đổi điểm trong nhà"* luôn có lựa chọn cùng thành phố.

## 3. 5 Tác vụ cốt lõi (Core Tasks)

| STT | Tác vụ (Think-Aloud Prompt) | Tiêu chí đạt (Success Criteria) | Ngưỡng mục tiêu |
| :-: | :--- | :--- | :--- |
| **T1** | **Khởi tạo lịch trình không ma sát**: Từ trang chủ, chọn điểm đến *Đà Nẵng & Huế*, 3 ngày, nhập hoặc chọn gợi ý nhanh rồi mở lịch trình & bản đồ. | Mở được màn hình chia đôi *Lịch trình chi tiết + Bản đồ* có điểm dừng hiển thị ngay, không bị chặn bởi form đăng nhập. | **Time-to-First-Itinerary < 30s** |
| **T2** | **Kiểm soát ngân sách & Nhịp độ ngày**: Kiểm tra thanh ngân sách (`C_total / B_max`) và thêm khoảng nghỉ cho ngày có chỉ số mệt mỏi cao (`Nhịp ≥ 6.0h` hoặc `≥ 4 điểm`). | Nhận diện được trạng thái ngân sách (đạt/vượt) và bấm `"+ Thêm nghỉ"` thành công để chèn block nghỉ 90 phút vào khung giờ trống đầu tiên không trùng lịch (ưu tiên `11:00–15:00`, dự phòng `09:00–20:00`). | Completion ≥ 90% |
| **T3** | **Ứng phó thời tiết 1 chạm & Hoàn tác**: Khi dự báo mưa ở Ngày 1, đổi toàn bộ điểm ngoài trời sang điểm trong nhà rồi khôi phục lại. | Bấm `"Trời mưa? Đổi điểm trong nhà"` thấy các điểm biển/cảnh quan đổi sang bảo tàng/cafe/ẩm thực cùng thành phố; bấm `"Hoàn tác"` khôi phục nguyên trạng. | Completion = 100%, 0 lỗi |
| **T4** | **Đổi 1 điểm lân cận**: Mở menu `...` của một điểm dừng bất kỳ và đổi sang một địa điểm khác gần đó. | Chọn `"Đổi điểm khác gần đây"`, đọc lý do khoảng cách/Eco và bấm `"Đổi"` thành công từ danh sách tối đa 3 gợi ý. | Completion ≥ 85% |
| **T5** | **Xuất lịch trình & Soft-Prompt đồng bộ**: Xuất tệp `.ics` (hoặc mở In/PDF) ở chế độ khách, sau đó thử bấm `"Lưu & Chia sẻ"`. | Xuất `.ics`/PDF hoạt động ngay không cần đăng nhập; bấm `"Lưu & Chia sẻ"` thấy banner nhắc nhẹ có lựa chọn `"Tiếp tục dùng khách"` hoặc `"Đăng nhập / Tạo tài khoản"`. | 0 lần mất dữ liệu đang sửa |

## 4. Chỉ số đo lường (Metrics)
1. **Time-to-First-Itinerary (TTFI)**: Đo từ lúc tải xong `/` đến khi nhìn thấy danh sách điểm dừng + ghim bản đồ trên `/planner` (Mục tiêu: **< 30 giây**).
2. **Task Completion Rate (TCR)**: Tỷ lệ hoàn thành không cần trợ giúp cho 5 tác vụ T1–T5 (Mục tiêu: **≥ 90%**).
3. **Critical Error / Confusion Rate**: Số lần người dùng bấm nhầm, bị chặn bởi login wall, hoặc không hiểu lý do gợi ý/cảnh báo (Mục tiêu: **0 lỗi chặn luồng**).
4. **System Usability Scale (SUS)**: Bảng hỏi 10 câu sau phiên test (thang 0–100, Mục tiêu: **≥ 75 / Good–Excellent**).
5. **Kiểm tra khả năng tiếp cận & Responsive**: Xác nhận không có thanh cuộn ngang ở viewport `320px`, mọi nút chạm đạt `≥ 40px`, điều hướng `Tab` thấy focus ring rõ ràng.
