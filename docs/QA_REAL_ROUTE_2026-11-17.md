# Nghiệm thu UI thật /my-trips — 2026-11-17

## Môi trường và giới hạn bằng chứng
- Chrome headless Playwright đã chạy được URL thật `http://localhost:5173/my-trips`, component TripOverviewView + TravelAssistant của FE hiện tại. Không dùng route harness.
- Phiên browser kiểm thử riêng: account SQLite QA, chuyến `ui-real-route-trip`, 4 ngày từ 20/12/2026, ba Ý tưởng ban đầu. Playwright chuyển request port8000 sang backend riêng `http://127.0.0.1:8018`; không sửa cấu hình FE của người dùng.
- Backend dùng SQLite tạm, Gemini tắt. Fixture auth/profile/POIs; 7 Bridges và Đi Lạc lấy thông tin loại/điểm/review_count từ CSV dự án; các điểm phụ là giả lập. Mô tả/ảnh placeholder ghi rõ fixture. Các request ngoài localhost bị chặn trong phiên kiểm thử.
- Đây là UI thật với backend SQLite kiểm thử, không phải xác nhận trạng thái session đăng nhập hay dữ liệu online của người dùng. Không tái hiện được sự cố cũ 3 Ý tưởng/0 trong session cũ; không kết luận snapshot cũ là nguyên nhân.

## Dữ liệu và sửa
- CSV cleaned: 7 Bridges `category=Quán cafe giải khát`, `sub_category=craft_beer`, score4.60/count2450. Đi Lạc `category=Quán cafe giải khát`, `sub_category=specialty_roastery`, score4.90/count18623. Nhãn UI Quán ăn là ánh xạ loại hiển thị rộng, không dùng làm điều kiện đủ.
- Bộ lọc café loại brewery/pub/bar trước ranking; nhận tên Coffee và specialty_roastery ngay cả khi nhãn chung là Quán ăn. Không coi giải khát đơn thuần là café.
- Xếp theo score/count khi cả hai có dữ liệu hợp lệ. Nếu thiếu số lượt hoặc điểm thì lý do ghi rõ chưa đủ dữ liệu xác nhận đánh giá cao. API catalogue hiện không có review_count top-level; tận dụng ai_metadata.review_count khi có. Không tự bổ sung số đánh giá online từ CSV.
- Gửi ideaIds/ideas của trip hiện tại trực tiếp khi gửi chat, giữ phụ thuộc callback cập nhật. Không lấy lại idea_ids từ hội thoại cũ.
- Bổ sung luồng quota mỗi ngày và đồng ý tự chọn. Khi thiếu điểm hỏi trước; đồng ý mới lấy thêm từ catalogue, gom theo city/vị trí rồi dùng bộ xếp lịch có kiểm thời gian. Điểm thêm được đánh dấu trong comment của preview. Không ghi Ý tưởng/lịch trước Apply.
- Nếu thiếu POI hoặc không đủ giờ, cảnh báo chưa đủ từng ngày; không bù sai loại hoặc khẳng định xếp đủ. Chưa xác minh ETA thực tế giữa các thành phố.

## Kết quả UI
| Ca | Tin nhắn/thao tác | Kỳ vọng | Thực tế | Nút / hành vi | Trạng thái |
|---|---|---|---|---|---|
| Café | tôi muốn 1 quán cà phê ngon đánh giá cao ở Đà Nẵng | DN+café+1; không brewery | 1 card Đi Lạc; nêu dữ liệu4.9/5,18623 lượt từ snapshot | Lưu vào Ý tưởng | PASS UI SQLite + snapshot |
| Ý tưởng mới | Mở chat, lưu card Đi Lạc | 3→4 cùng trip, không reload | UI hiển thị4, request kế tiếp gửi4 ID; trip_id giữ nguyên | Bấm Lưu trong card gửi đúng ID | PASS UI |
| Thiếu điểm | xếp 2 điểm mỗi ngày | 4 ngày cần8, đã lưu4, hỏi thêm4 | Bot nêu đúng4+4 | Tự chọn thêm điểm điền câu vào input | PASS UI |
| Đồng ý | Bạn tự chọn thêm và lên lịch cho tôi đi | Preview8 POI, mỗi ngày2 | [2,2,2,2]; 4saved+4proposed; nhãn nguồn từng stop | Chưa tự ghi | PASS UI |
| Áp dụng | Bấm Apply ở viewport390px | Ghi SQLite sau click | Trước: itinerary=null; sau:8 POI; GET itinerary200 | Apply riêng | PASS UI SQLite |
| Phiên cũ của user | 3 Ý tưởng nhưng bot0 | Xác định ID/nguồn phiên cũ | Chưa truy cập phiên browser của user; test phiên riêng không lỗi | — | CHƯA TÁI HIỆN |
| Gemini live | câu tự chọn | Xem nhánh live | Lượt UI dùng rules/AI off | — | CHƯA KIỂM |

## Bằng chứng
- `REAL_ROUTE_CHAT_TRACE.json`: nguyên request/response của bốn lượt trên tài khoản giả lập, gồm idea_ids, trip_id, POI IDs, trace route, draft. Không chứa token/key.
- `real-route-coffee.png`, `real-route-detail.png`, `real-route-preview.png`, `real-route-narrow.png`.
- Script `qa-real-route.mjs` có assertion số/card/Đi Lạc; 3→4 IDs; mỗi ngày2; không lịch trước Apply; 8POI sau Apply. Chạy cuối ghi `UI_ASSERTIONS_PASS`.
- 132 backend tests liên quan PASS; frontend typecheck và build PASS. Cảnh báo bundle size sẵn có chưa xử lý.
- Một số endpoint recommendation/404 trong fixture không triển khai, ngoài luồng chatbot; ảnh bản đồ/ảnh ngoài bị chặn. Không coi đây là nghiệm thu bản đồ/ảnh sản phẩm.
