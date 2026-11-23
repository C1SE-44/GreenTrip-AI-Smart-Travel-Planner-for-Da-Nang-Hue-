# Kết quả fine-tune local GreenTrip — 17/11/2026

Đã cập nhật trọng số LoRA thật, lưu adapter và nạp lại thành công. Chưa bật vào chatbot production vì còn sai nghiệp vụ.

- Qwen3-0.6B, CPU 4 luồng, LoRA rank 8, 1.146.880 tham số học.
- 166 mẫu train tổng hợp; chạy 64 bước optimizer, xử lý 128 mẫu. Dev 4 / test 4 tách riêng. Không dùng lịch sử riêng hay dữ liệu tài khoản.
- Train mất 860.8 giây (~14,3 phút), adapter 4602248 byte.
- Kiểm Turn schema và toàn bộ contract: base 0/8; adapter dev 2/4 + test 4/4 = 6/8. Đây là tập thử nhỏ, nhiều cấu trúc gần với template train.

| Ca | Tin nhắn chưa dùng train | Kỳ vọng | Đầu ra thực tế | Kết quả |
|---|---|---|---|---|
| dev-mix-166 | Huế nhé, chọn hai ngôi chùa kèm bốn tiệm cà phê | `{"intent":"search","changes":[{"field":"city","op":"set","value":"Huế"},{"field":"count","op":"set","value":6},{"field":"mix","op":"set","value":{"temple":2,"cafe":4}}],"search_scope":"new"}` | `{"intent":"search","changes":[{"field":"city","op":"set","value":"Huế"},{"field":"count","op":"set","value":4},{"field":"mix","op":"set","value":{"cafe":4,"temple":2}}],"search_scope":"new"}` | FAIL |
| dev-list-167 | Tổng kết giúp các nơi tôi đã bỏ vào Ý tưởng chuyến này | `{"intent":"list_ideas","changes":[]}` | `{"intent":"list_ideas","changes":[]}` | PASS |
| dev-near-168 | Gỡ điều kiện sát ngôi chùa đó, đừng đổi thành phố hay mức tiền | `{"intent":"search","changes":[{"field":"nearby","op":"clear","value":null}],"search_scope":"refine"}` | `{"intent":"search","changes":[{"field":"nearby","op":"clear","value":null}],"search_scope":"refine"}` | PASS |
| dev-edit-169 | Ngày hai khởi hành 10:45, chỗ ăn trưa không động tới, thay mỗi điểm chốt ngày | `{"intent":"plan","changes":[{"field":"day","op":"set","value":2},{"field":"start_after","op":"set","value":"10:45"},{"field":"meal","op":"keep","value":"lunch"},{"field":"replace_stop","op":"set","value":"last"}]}` | `{"intent":"plan","changes":[{"field":"day","op":"set","value":2},{"field":"start_after","op":"set","value":"10:45"},{"field":"day_stops","op":"set","value":[{"position":1,"title":"Điểm mẫu A","stop_type":"poi","start_time":"08:00"},{"position":2,"title":"Bữa trưa","stop_type":"rest","start_time":"12:00"},{"position":3,"title":"Điểm mẫu B","stop_type":"poi","start_time":"15:00"}]}],"search_scope":"refine"}` | FAIL |
| test-mix-170 | Đà Nẵng: ba quán coffee và ba ngôi chùa, tổng sáu chỗ | `{"intent":"search","changes":[{"field":"city","op":"set","value":"Đà Nẵng"},{"field":"count","op":"set","value":6},{"field":"mix","op":"set","value":{"cafe":3,"temple":3}}],"search_scope":"new"}` | `{"intent":"search","changes":[{"field":"city","op":"set","value":"Đà Nẵng"},{"field":"count","op":"set","value":6},{"field":"mix","op":"set","value":{"cafe":3,"temple":3}}],"search_scope":"new"}` | PASS |
| test-list-171 | Mình đã gom những địa điểm nào cho hành trình này rồi nhỉ? | `{"intent":"list_ideas","changes":[]}` | `{"intent":"list_ideas","changes":[]}` | PASS |
| test-save-172 | Ghim quán ở vị trí thứ hai vào Ý tưởng của chuyến giúp mình | `{"intent":"save_idea","changes":[],"reference_index":2}` | `{"intent":"save_idea","changes":[],"reference_index":2}` | PASS |
| test-exclude-173 | Lượt tìm mới nhớ né địa điểm nằm thứ ba ở trên | `{"intent":"search","changes":[{"field":"places","op":"exclude","value":[3]}],"search_scope":"refine"}` | `{"intent":"search","changes":[{"field":"places","op":"exclude","value":[3]}],"search_scope":"refine"}` | PASS |

Nạp adapter từ ổ đĩa và thử thêm: **Tìm giúp tôi 2 quán cà phê ở Huế và 3 ngôi chùa**. Kỳ vọng 2 café + 3 chùa; thực tế 3 café + 2 chùa (tổng 5), **FAIL**, 7.54 giây sinh output. Không thêm câu này vào train để chữa số đo trong lượt chạy hiện tại.

Các ca này đo lớp hiểu yêu cầu, không chạy UI, không có card/nút hoặc ghi lịch. Trạng thái UI với model local: **CHƯA KIỂM / chưa tích hợp**. GreenTrip hiện tại tiếp tục dùng Gemini; không tuyên bố demo đã tốt hơn nhờ adapter này.

Mã và dữ liệu: backend/training/. Chi tiết output: LOCAL_LORA_RUN.json. Nghiệm thu chặt và checksum: LOCAL_ADAPTER_ACCEPTANCE.json. Adapter: backend/.training/qwen3-greentrip-lora-v1/adapter_model.safetensors.

Bước phát triển hợp lý sau pilot: mở rộng các họ câu độc lập, quota không đối xứng và multi-edit; giữ một test set mới chưa dùng chọn model; đo toàn chuỗi chat → draft → Apply. Không dùng fine-tune để thay việc đọc đúng ID từ database hay kiểm quyền tài khoản.
