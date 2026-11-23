# Kiểm Gemini thật và hai lỗi hội thoại — 17/11/2026

## Đã xác minh trước khi sửa

Đăng nhập tài khoản được người dùng cung cấp, đọc danh sách chuyến trên backend đang chạy 127.0.0.1:8000. Một tin yêu cầu ba cà phê và hai chùa có trace route=gemini, reason=structured_turn, model_calls=1, engine=gemini+database, nhưng kết quả chỉ ba card. Vì vậy Gemini có hoạt động thật; không thể kết luận AI tắt chỉ từ câu trả lời trong ảnh.

Nguyên nhân: lớp đọc yêu cầu có count/mix, nhưng service lại dùng bộ đọc số đầu tiên để ghi đè result_count. Bộ đọc cũ chỉ hiểu tổng N điểm kèm một nhóm con, chưa phân biệt ba cà phê cộng hai chùa với tổng ba điểm. Thao tác liệt kê Ý tưởng chưa có intent/handler riêng nên rơi vào câu hỏi chung.

## Sửa

- Danh sách hiện tại: intent list_ideas; câu hỏi rõ đọc trực tiếp IDs Ý tưởng từ workspace của đúng tài khoản/chuyến. Trả lại cùng ID và thứ tự; không tìm POI mới thay vào. Thiếu bản ghi thì nói rõ thiếu, danh sách rỗng thì nói rỗng. Cho Gemini dùng cùng intent với cách diễn đạt tự do; thao tác đọc rõ không cần gọi model.
- Số lượng: phân tích các cụm số lượng + loại địa điểm độc lập, cộng đúng tổng và giữ quota từng nhóm. Có tổng khai báo riêng thì đối chiếu tổng; mâu thuẫn thì hỏi lại. Hỗ trợ chữ số, số viết bằng chữ và đổi thứ tự nhóm. Giữ các điều kiện có cấu trúc của model, không thay bằng câu mẫu nhận diện nguyên tin nhắn.
- Trả lời nhóm hỗn hợp dùng kết quả đã lọc/xác minh; nói rõ thiếu loại nào, không lấp bằng nhóm sai. Giữ fallback và mặc định cấu hình AI hiện tại, không đổi model hoặc bật billing.

## Nghiệm thu UI thật

Frontend localhost:5173/my-trips, backend thật localhost:8000; Chrome qua Playwright. Chọn đúng chuyến chứa Angarden, Cơm Hến Bà Cam, De.Linh Coffee, Chùa Pháp Lâm và Đình Làng Bồ Bản như ảnh. Hai chuyến có tên giống nhau nên kiểm ID + nội dung, không chọn chỉ theo tên chuyến.

| Tin nhắn | Kỳ vọng | Thực tế | Nhánh |
|---|---|---|---|
| bạn xem cho tôi các ý tưởng tôi đang có gồm những gì rồi | Cùng 5 ID trong Ý tưởng, đúng thứ tự | 5 ID bằng metadata; có chữ và card, không hỏi ngược | rules / list_ideas, 0 model calls |
| tôi muốn tìm 3 địa điểm cà phê Huế, và 2 địa điểm chùa | 5 điểm duy nhất, Huế, đúng 3 cà phê + 2 chùa | Đúng tổng và hai nhóm; chữ và card cùng response | gemini / structured_turn, 1 model call |

Kết quả máy đọc: LIVE_ASSISTANT_CHECK.json. Ảnh: live-ideas-list.png và live-mixed-five.png. Script qa-live-assistant-check.mjs nhận credentials từ stdin, không lưu credentials vào file. Browser QA chặn các mutation backend ngoài assistant/chat; không bấm Apply hoặc ghi itinerary online. Tin kiểm thử được giữ trong lịch sử chat riêng của tài khoản.

## Regression

167 test backend liên quan qua: bộ mới tái hiện lỗi trước khi sửa, số lượng từng nhóm, số viết chữ/thứ tự khác, ba nhóm, thiếu kết quả, tổng mâu thuẫn, đọc đúng IDs server, POI không tải được, rỗng, Gemini mock và rules/fallback; cùng các test ngữ cảnh, Preview/Apply và quyền sở hữu trước đó. Không lấy mock làm bằng chứng Gemini live; hai ca UI bên trên có trace thật riêng.

## Giới hạn

Không fine-tune/train lại trọng số model trong lượt này. Kết nối database không tự làm model biết toàn bộ dữ liệu: backend đưa ngữ cảnh tối thiểu, model phân tích yêu cầu, backend truy vấn và kiểm kết quả rồi dựng card. Luồng hiện vẫn là các intent/operation được backend hỗ trợ, không phải agent tùy ý truy vấn toàn database. Gemini live mất khoảng 7–9 giây ở các lượt đã đo, danh sách Ý tưởng khoảng 2–4 giây. Không tuyên bố mọi cách diễn đạt tự do đã được nghiệm thu.
