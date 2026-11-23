# GreenTrip — nghiệm thu P0–P4, 2026-11-17

## Phạm vi và trạng thái
Đã sửa trực tiếp backend/frontend. Chưa chốt toàn bộ demo: UI thật `/my-trips` và Gemini live chưa được quan sát. Các PASS dưới đây là backend/API hoặc service test, không phải UI PASS.

## P0: instance và tái hiện
- Khi kiểm đầu lượt, localhost:5173 và 127.0.0.1:5177 không trả lời. Không thể xác nhận cấu hình instance trong ảnh người dùng.
- Vite sản phẩm mặc định 5173, proxy /api tới localhost:8000; API client có thể dùng VITE_API_URL/VITE_API_BASE_URL. Không in giá trị bí mật từ .env.
- Đã khởi động fixture cùng source repo: frontend http://127.0.0.1:5177/__assistant-ui, backend http://127.0.0.1:8017. Backend là SQLite tạm riêng, AI tắt; không dùng lifespan production. Đây không phải bằng chứng cấu hình bản localhost:5173.
- Trước sửa: P0_CHAT_REPRO.json. Sau sửa: P4_CHAT_API_AFTER.json. Trace lấy từ API/backend, không suy từ chữ trên UI.
- Lỗi: rules không xử lý mix; câu bổ sung mất thành phố; món ăn không được hiểu; backend trả nút khởi đầu cho nhiều nhánh. Frontend trước đây còn có fallback nút; hiện chỉ dùng prompts lượt mới sau phản hồi.
- Playwright dùng Edge headless đã thử: crash trước navigation, `registration_protocol_win.cc:136 TransactNamedPipe ... 0x6D`. Không có ảnh UI hợp lệ mới.

## Dữ liệu dự án
- Farm Lò Gạch Cũ `6bae8090-3934-48e5-8bb8-5326632eab06`: all_pois_cleaned.csv ghi Da Nang, địa chỉ Thôn Vĩnh Phú, Xã Duy Vinh (giáp ranh Nam Đà Nẵng). Bản raw phase2 cũng gắn Đà Nẵng. Chưa có xác nhận ranh giới đáng tin; kết quả chỉ một thành phố loại bản ghi địa chỉ giáp ranh. Không sửa dữ liệu online.
- Bếp Cuốn `029a28df-b091-49d9-a911-738572c72464`: cleaned ghi menu_items_count=5 nhưng không chứa nội dung món; pois/pois_enriched chỉ xác nhận ẩm thực Vietnamese. Chưa đủ căn cứ khẳng định mì Quảng. Nhãn giá cleaned /ly không được dùng làm giá tô mì.
- Catalogue summary không tải menu_items trong ai_metadata. Tìm món hiện xác nhận bằng description hoặc menu có trong bản ghi được cung cấp; có thể bỏ sót quán chỉ có bằng chứng ở menu chi tiết. Không coi đây là dữ liệu menu đầy đủ.

## Ca test
| Ca test | Tin nhắn | Đầu ra kỳ vọng | Đầu ra thực tế | Nút hiện và hành vi khi bấm | PASS/FAIL/BLOCKED |
|---|---|---|---|---|---|
| Chào, API SQLite | xin chào | Chào ngắn, không POI | rules/greeting, IDs [] | 3 nút bắt đầu | PASS API; click UI BLOCKED |
| Mix, API SQLite | tìm 3 điểm ở Đà Nẵng, 1 điểm là chùa | 3 ID riêng, 1 chùa | rules: dn-temple-a, dn-park, dn-cafe | Thêm một chùa → Gợi ý thêm 1 chùa nữa ở Đà Nẵng | PASS API |
| Bổ sung, API SQLite | thêm 1 chùa nữa | 1 chùa mới, giữ city | rules: dn-temple-b; không ghi lịch | Thêm một chùa; không dựng lại bộ cũ | PASS API |
| Món, API SQLite | tôi muốn ăn mì Quảng | Chuyển food, có bằng chứng | rules: dn-food; nói thiếu kết quả, chưa xác nhận giá riêng | Tìm quán khác → câu tìm món cùng city | PASS API, fixture món giả lập |
| Hỏi quán khác | Bấm/gửi nội dung Tìm quán khác | Không lặp ID; không coi chữ khác là tên món | Test backend không trả ID cũ | Kiểm nhãn + gửi chính message trong test; chưa click DOM | PASS backend |
| Bổ sung qua model | thêm 1 chùa nữa | Không lặp chùa | Test bắt lỗi t1 lặp; sau sửa chọn ID khác | Có nút theo kết quả | PASS Gemini mock, chưa live |
| Yêu cầu dài, 2 cách nói | Đi với ba mẹ/bố mẹ, chiều Huế nhẹ, món địa phương, không cà phê | Giữ city, loại café, không bịa tiếp cận | Huế, không café; nêu chưa rõ đi bộ, món địa phương cần tìm riêng | Tìm món địa phương | PASS backend phần lọc; đáp ứng toàn bộ yêu cầu dài CHƯA ĐẠT |
| Tìm mới/refine/exclude/đổi city/thiếu kết quả | Bộ acceptance/delta hiện có | Quota, ID, điều kiện giữ/đổi đúng | Regression đạt | Không gắn mặc định ngày 2 sau kết quả | PASS backend/mock |
| Chat → Ideas → plan → Preview → Apply | Bộ stage3 SQLite | Lưu đúng POI, chưa Apply không đổi; ngày khác giữ | Regression SQLite đạt, guard ownership còn nguyên | Apply riêng; frontend prompt handler chỉ fill | PASS backend; UI BLOCKED |
| AI off/timeout/429/503/invalid | Tìm café và mix 3 điểm | Có kết quả rõ; không bịa khi không hiểu | Test provider mock + rules/fallback đạt | Không quay về bộ nút khởi đầu sau mọi lượt | PASS backend; 503 giả lập |
| Desktop/panel hẹp | Card, nút hỏi tiếp, cuộn | Không che card; 1 card không arrows | Code overflow/scroll reset và prompt fill đã sửa; build đạt | Chưa quan sát click, focus, overflow thực | BLOCKED UI |
| /my-trips bản người dùng | Đăng nhập/chuyến riêng | Đúng instance, luồng thật | Chưa mở được browser; chưa xác minh frontend/backend bản ảnh | Chưa quan sát | BLOCKED |

## Kiểm tra đã chạy
- 130 backend tests đạt trong nhóm assistant acceptance/demo/conversations/travel/delta/Gemini mock/ownership/itinerary API.
- 6 frontend tests dịch vụ assistant và cache theo tài khoản đạt. Đây không phải component click test.
- Frontend typecheck và production build đạt; cảnh báo bundle lớn có sẵn, ngoài phạm vi.
- Không đổi model, bật billing, deploy, ghi Supabase online hay bỏ guard.

## Checklist tay đúng route
1. Mở frontend sản phẩm http://localhost:5173/my-trips; trong Network xác nhận API target trước khi ghi. Chỉ dùng backend SQLite demo cho Apply, không endpoint online. Fixture 5177 là công cụ phụ, không thay nghiệm thu route này.
2. Đăng nhập tài khoản demo, tạo chuyến riêng Đà Nẵng & Huế; kiểm slot chat 1–3 và đổi chuyến không lẫn chat.
3. Gửi chuỗi 4 câu ở bảng. Đối chiếu ID trong Network, số card, thứ tự chữ/card. Lượt bổ sung phải chỉ 1 card; không có mũi tên nếu không tràn.
4. Bấm nút hỏi tiếp: chỉ điền textarea, Network không có /chat hoặc /apply cho tới khi gửi/Apply rõ ràng.
5. Thu panel hẹp, kiểm nút không che card, card mới bắt đầu vị trí đầu.
6. Lưu một POI, xếp lịch, sửa một ngày, kiểm Preview chưa đổi lịch; Apply SQLite rồi đối chiếu ngày khác.
7. Tắt AI hoặc mock503; lặp câu rõ và câu dài chưa hiểu. Không coi mock là Gemini live.

## Phần còn cần để chốt
- Xác minh đúng instance 5173 và UI thật; có bằng chứng desktop/panel hẹp/click.
- Gemini live riêng nếu môi trường cho phép Free Tier.
- Yêu cầu dài hiện giữ các điều kiện nhận ra nhưng chưa giải quyết cùng lượt cả buổi chiều, ít đi bộ và món địa phương; chưa đạt toàn bộ P1/P3.
- Đọc menu chi tiết có chọn lọc để tăng độ phủ tìm món, bổ sung test component tương tác thực. Không tuyên bố hoàn tất P0–P4.
