# Nghiệm thu tra món GreenTrip — 17/11/2026

## Phạm vi bằng chứng

- API: FastAPI /assistant/chat qua TestClient, cùng mã service/router của ứng dụng, bản chụp chỉ đọc 482 POI từ repository thật, state hội thoại trên SQLite tạm. Cùng trip_id trong từng chuỗi. Không gọi API ghi lịch hoặc ghi Supabase.
- Model: lời gọi Gemini thật bằng cấu hình key hiện có, ASSISTANT_AI_FREE_TIER_CONFIRMED=true. 8 lời gọi mới (4/model), không tăng giới hạn 40/ngày. Không train Qwen.
- UI /planner: đã đăng nhập tài khoản được cho phép, mở đúng chuyến có Bếp Cuốn/Đi Lạc/An Hải/Mộc Truly/VOU và đúng hội thoại cũ. Quan sát card và screenshot bằng trình duyệt trong ứng dụng. FE localhost:5173 và BE 127.0.0.1:8000 được khởi động cho bước kiểm UI. BE tắt lifespan seeding để tránh ghi dữ liệu online khi startup.

## Nguyên nhân đã xác minh

1. Regex cũ lấy `mi quang thi co quan nao`. Replay regex đó và truy vấn với tên món sai trả 0 ID. Lượt trước đã sửa việc cắt đuôi và ghi đè tên món Gemini; lần này bổ sung câu hỏi trực tiếp và giữ món khi đổi thành phố.
2. Chat dùng search.catalogue → pois.repository.list_pois(view=summary); summary loại ai_metadata.menu_items. Đã chuyển catalogue nội bộ sang full để giữ menu, chưa gửi catalogue cho model/browser.
3. ExplorePage → getPois → GET /pois(q=...) → cùng pois.repository.list_pois. Explore tìm text trong name/description/address; đó là tìm ứng viên, không phải xác nhận quán phục vụ món. Chat giờ kiểm menu hoặc câu nói rõ phục vụ món; không chấp nhận mô tả chỉ nhắc món.
4. Bà Mua có menu `Mỳ Quảng Tôm Thịt`. Chuẩn hóa mì/mỳ trước khi đối chiếu nguyên từ; không hardcode tên/ID quán.

## Kết quả API sau sửa

| Ca test | Tin nhắn | Món/thành phố sau gộp | Quán/ID thực tế | Nút và câu điền | Kết quả |
|---|---|---|---|---|
| original | tôi muốn ăn mì quảng thì có quán nào | mi quang / Huế | Mì Quảng Cô Ba (`685f6c62-5131-498b-9b09-dc81851313c8`), ai_metadata.menu_items: Mỳ Quảng Tôm Thịt | Tìm quán khác → Tìm quán có mi quang khác ở Huế | API PASS |
| original | ở Đà Nẵng có không? | mi quang / Đà Nẵng | Mì Quảng Bà Mua (`936b4a05-8051-4fda-aba1-42c28c143cb3`), ai_metadata.menu_items: Mỳ Quảng Tôm Thịt; Mì Quảng Bà Vị (`f8a7a21d-759d-40d0-bed8-2b524e1d5ef4`), ai_metadata.menu_items: Mỳ Quảng Tôm Thịt; Mì Quảng Ếch Bếp Trang (`4ff65eac-6000-4160-b916-2272d260efb1`), ai_metadata.menu_items: Mỳ Quảng Tôm Thịt | Tìm quán khác → Tìm quán có mi quang khác ở Đà Nẵng | API PASS |
| zero-hue | tìm mì Quảng ở Huế | mi quang / Huế | 0 kết quả | Không có | API PASS |
| zero-hue | Đà Nẵng thì sao? | mi quang / Đà Nẵng | Mì Quảng Bà Mua (`936b4a05-8051-4fda-aba1-42c28c143cb3`), ai_metadata.menu_items: Mỳ Quảng Tôm Thịt; Mì Quảng Bà Vị (`f8a7a21d-759d-40d0-bed8-2b524e1d5ef4`), ai_metadata.menu_items: Mỳ Quảng Tôm Thịt; Mì Quảng Ếch Bếp Trang (`4ff65eac-6000-4160-b916-2272d260efb1`), ai_metadata.menu_items: Mỳ Quảng Tôm Thịt | Tìm quán khác → Tìm quán có mi quang khác ở Đà Nẵng | API PASS |
| direct | mì Quảng ở Đà Nẵng có quán nào? | mi quang / Đà Nẵng | Mì Quảng Bà Mua (`936b4a05-8051-4fda-aba1-42c28c143cb3`), ai_metadata.menu_items: Mỳ Quảng Tôm Thịt; Mì Quảng Bà Vị (`f8a7a21d-759d-40d0-bed8-2b524e1d5ef4`), ai_metadata.menu_items: Mỳ Quảng Tôm Thịt; Mì Quảng Ếch Bếp Trang (`4ff65eac-6000-4160-b916-2272d260efb1`), ai_metadata.menu_items: Mỳ Quảng Tôm Thịt | Tìm quán khác → Tìm quán có mi quang khác ở Đà Nẵng | API PASS |
| other | Tôi muốn ăn bánh xèo ở Đà Nẵng thì có quán nào? | banh xeo / Đà Nẵng | Bánh Ép Huế Ngon (`111cdef9-668b-4853-99d6-9c93e86376b1`), ai_metadata.menu_items: Bánh Xèo Tôm Thịt Vỏ Giòn Rụm; Bánh Xèo Bà Dưỡng (`b9a1ec1f-1b89-4f8b-899d-3eaa875cc079`), ai_metadata.menu_items: Bánh Xèo Tôm Thịt Vỏ Giòn Rụm; Bánh Ép Trang (`10969054-1efd-4d3a-9943-432cee5f5ec0`), ai_metadata.menu_items: Bánh Xèo Tôm Thịt Vỏ Giòn Rụm; Bánh Xèo Tôm Nhảy Năm Hiền (`b3e50dfa-ee69-40fd-a037-f974bc340cf8`), ai_metadata.menu_items: Bánh Xèo Tôm Thịt Vỏ Giòn Rụm | Tìm quán khác → Tìm quán có banh xeo khác ở Đà Nẵng | API PASS |
| absent | Tôi muốn ăn món thử không tồn tại ở Đà Nẵng | mon thu khong ton / Đà Nẵng | 0 kết quả | Không có | API PASS |

Ca zero-hue chủ động loại ứng viên Huế trong fixture để kiểm trường hợp 0 kết quả; dữ liệu thật hiện có Mì Quảng Cô Ba tại Huế. Không trình bày ca này như dữ liệu online không có quán ở Huế.

## So model thật

| Model | Hiểu đúng trên 4 câu | Trạng thái | Quyết định |
|---|---|---|---|
| gemini-3.5-flash-lite | 4/4 | OK, OK, OK, OK | Giữ cấu hình hiện tại |
| gemini-4-hydrogen | 0/4 | unavailable, timeout, unavailable, unavailable | BLOCKED khi gọi nhà cung cấp; không promote |

Hai lượt gốc đã replay qua API với output Gemini thật đã ghi lại: model hiện tại route=gemini; Hydrogen lỗi thì route=fallback vẫn tìm được các ID đúng. Không dùng fallback làm bằng chứng Hydrogen hiểu đúng. Output/delta/criteria trước-sau/model_calls/ID/menu/nút lưu trong DISH_MODEL_COMPARISON.json.

GEMINI_MODEL đã có ở app/config.py; adapter NLU hiện cho phép gemini-4-hydrogen để thử có kiểm soát, không đổi .env/model mặc định. Nguồn chính: [Hydrogen model](https://aistudio.google.com/docs/models/gemini-4-hydrogen), [Free Tier pricing](https://aistudio.google.com/docs/pricing#gemini-4-hydrogen).

Kiểm tra: 105 backend tests liên quan đạt; frontend typecheck và build đạt (cảnh báo bundle lớn có sẵn). UI PASS cho câu gốc, chuỗi Huế → Đà Nẵng và câu trực tiếp. Ca giả lập Huế rỗng, bánh xèo và món không tồn tại đã kiểm API; chưa chạy riêng các ca này trên UI.

## Checklist UI khi trình duyệt truy cập được

1. Mở localhost:5173/planner, đăng nhập, mở đúng chuyến và chatbot.
2. Gửi “tôi muốn ăn mì quảng thì có quán nào”, rồi “ở Đà Nẵng có không?”. Kiểm card Bà Mua/Bà Vị/Bếp Trang, cùng thứ tự tên trong câu trả lời.
3. Gửi “mì Quảng ở Đà Nẵng có quán nào?”; bấm “Tìm quán khác”, kiểm chỉ điền câu vào ô nhập và không ghi lịch.
4. Không bấm Áp dụng hoặc lưu Ý tưởng trên môi trường online trong ca QA này.

## Kết quả UI đã quan sát sau cùng

Đã mở đúng http://localhost:5173/planner. Lịch sử cũ còn nguyên câu lỗi `mi quang thi co quan nao` và 0 kết quả, nên đối chiếu được trước/sau trên cùng hội thoại. Câu mới trả 3 card Bà Mua/Bà Vị/Bếp Trang; mỗi dòng ghi menu `Mỳ Quảng Tôm Thịt`, card không lấy giá chung làm giá tô. `tìm mì Quảng ở Huế` trả Cô Ba; `Đà Nẵng thì sao?` trả đúng 3 quán Đà Nẵng. Câu trực tiếp cũng trả cùng 3 card. Bấm Tìm quán khác chỉ điền câu, chưa gửi; không bấm lưu hoặc Áp dụng. Trace backend của các lượt UI và ID công khai lưu trong [DISH_LIVE_UI.json](DISH_LIVE_UI.json).

- tôi muốn ăn mì quảng thì có quán nào: route=gemini, reason=structured_turn, model_calls=1, model=gemini-3.5-flash-lite, 3 card.
- tìm mì Quảng ở Huế: route=fallback, reason=quota, model_calls=0, model=None, 1 card.
- Đà Nẵng thì sao?: route=fallback, reason=quota, model_calls=0, model=None, 3 card.
- mì Quảng ở Đà Nẵng có quán nào?: route=fallback, reason=quota, model_calls=0, model=None, 3 card.
