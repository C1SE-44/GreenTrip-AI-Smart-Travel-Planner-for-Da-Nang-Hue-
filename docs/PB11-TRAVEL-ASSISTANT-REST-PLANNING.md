# PB11 – Trợ lý lịch trình cân bằng khám phá và nghỉ ngơi

## Mục tiêu

Trợ lý GreenTrip đưa ra gợi ý nghỉ phù hợp với nhịp độ chuyến đi, giúp người dùng có thời gian ăn uống, hồi phục và điều chỉnh lịch khi việc di chuyển kéo dài. Tính năng bổ sung dữ liệu vào khung lịch trình hiện có; không tạo màn hình lịch trình riêng.

## Quy tắc backend

- Mỗi ngày có khoảng nghỉ trưa từ `12:00–14:00`, dành 90 phút cho ăn trưa và nghỉ tại nơi lưu trú hoặc quán yên tĩnh.
- Trong lịch xếp tự động, mặc định lưu khoảng nghỉ thành một mốc `12:00–13:30` (90 phút) trong khung nghỉ trưa trên; người dùng có thể chỉnh giờ.
- Với nhịp độ `Fast`, thêm một lần dừng ngắn từ `09:30–10:00` để uống nước và nghỉ giữa các điểm.
- Với nhịp `Relaxed` hoặc sở thích `relaxation`, khuyên để buổi chiều linh hoạt, không cần hoàn thành mọi gợi ý.
- Với nhịp `Balanced`, khuyên nghỉ trưa và chừa thời gian di chuyển giữa các điểm.
- Ngày cuối có thêm lời nhắc thu xếp hành lý và ra ga/sân bay đúng giờ.

## Response API

Mỗi phần tử trong `data.itinerary_outline[]` có thêm:

```json
{
  "rest_periods": [
    {
      "time_range": "12:00–14:00",
      "activity": "Ăn trưa chậm rãi và nghỉ tại nơi lưu trú hoặc quán cà phê yên tĩnh.",
      "duration_minutes": 90
    }
  ],
  "assistant_tip": "Sau buổi sáng khám phá, dành thời gian nghỉ trưa trước khi tiếp tục hoạt động buổi chiều."
}
```

Các trường mới có giá trị mặc định để client cũ vẫn đọc được response. `recommendations[]` cũng có một lời khuyên tổng quát theo pacing để người dùng thấy được ngay trong kết quả hiện tại.

## Mô hình lưu lịch trình

Migration `008_create_itinerary_days_and_stops.sql` lưu lịch theo ba lớp; migration `009_add_itinerary_stop_address.sql` bổ sung địa chỉ tùy chọn cho điểm dừng:

- `itineraries`: thông tin chuyến đi và chủ sở hữu hiện tại.
- `itinerary_days`: một dòng cho mỗi ngày, có ngày lịch, tiêu đề và số thứ tự duy nhất trong chuyến đi.
- `itinerary_stops`: các điểm/hoạt động theo thứ tự trong ngày, gồm thời lượng, giờ dự kiến, tọa độ và bình luận.

Điểm dừng giữ bản chụp tên/thành phố/địa chỉ/danh mục để lịch vẫn đọc được nếu POI đổi; `poi_id` có thể rỗng cho địa điểm tự nhập. API và cơ sở dữ liệu kiểm tra ngày, tọa độ, loại hoạt động, thời lượng và thứ tự điểm dừng. `Ý tưởng` vẫn tách khỏi lịch theo ngày; phần này chưa bật quyền chia sẻ/cộng tác và không giả định sẵn mô hình quyền nhóm.

## Tích hợp giao diện hiện có

Giao diện xem trước khung lịch và từng ngày trong trình chỉnh sửa đều đọc `assistant_tip` và `rest_periods` từ response xác thực thông số. Khi lịch đã có một stop nghỉ thật, thẻ hướng dẫn chỉ nhắc rằng khoảng nghỉ đã được xếp ở bên dưới để không hiển thị trùng hai mốc nghỉ. Luồng này dùng lại trang và cấu trúc lịch hiện có.
