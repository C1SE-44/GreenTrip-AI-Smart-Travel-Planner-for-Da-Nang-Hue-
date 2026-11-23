# Kiểm tra hội thoại GreenTrip — 16/11/2026

## Phạm vi và nguyên nhân

Giữ UI, POI, PB09, history và Preview/Apply. Sửa backend `app/assistant/{dialogue,nlu,service,search,planning}.py`; thêm `tests/test_dialogue_deltas.py`, cập nhật test giao thức cũ. Không deploy, commit, push hoặc ghi Supabase online.

Luồng cũ: frontend → `/assistant/chat` → Gemini lấy tiêu chí rời rạc → `model_request` dựng lại một câu → `handle` đọc từ khóa lần nữa. Nhánh tìm kiếm ưu tiên tiêu chí regex hơn model, mặc định 5 thẻ và không diễn đạt được cơ cấu “3 điểm, chỉ 1 chùa”. Lượt nối tiếp tiếp tục dính category cũ. Nhánh lỗi model trước đây dừng chat, không quay về tìm kiếm đơn giản. Gemini trước đây nhận tối đa 6 tin chat cũ; nay không gửi nguyên văn lịch sử.

Luồng mới: kiểm owner → lấy working state theo account/trip/mode → lời chào/thẻ/nút rõ ràng dùng rules → câu tự do gọi Gemini với context gọn → xác thực delta → dùng trực tiếp state đã sửa → lọc dữ liệu thật/PB09 hoặc tạo preview → lưu working state riêng. Không dựng câu nhân tạo để rules đọc lại kết quả Gemini.

## Giao thức và dữ liệu

- Delta `keep/set/clear/prefer/exclude`, enum và giá trị được Pydantic kiểm tra. Model chỉ trả chỉ số thẻ, không trả ID/POI/SQL/lịch hoàn chỉnh. Backend đổi chỉ số thành ID thật, xác thực danh sách hiện hành và phát hiện ngữ cảnh thay đổi trong khi chờ model.
- State bền vững trong store SQLite hiện có: criteria, thứ tự last_ids, seen_ids, last_results, anchor, focused_day, plan_edits và plan_base/digest, draft. Không trộn giữa tài khoản/chuyến/chế độ. Reopen đọc lại state này.
- Gửi model câu mới, bộ lọc hiện hành, tối đa 5 kết quả với thuộc tính đã lưu, tên mốc, tối đa 10 stop của đúng ngày đang chỉnh, tối đa 20 tên Ý tưởng có chỉ số. Không gửi toàn danh mục, toàn lịch, account/trip/stop/POI ID, tên chuyến hoặc chat cũ. Tên điểm do người dùng tự đặt và câu mới vẫn có thể chứa thông tin do người dùng nhập.
- `count` và `mix` là ràng buộc riêng; thiếu điểm phù hợp thì trả ít hơn và nói rõ, không bù bằng nhóm bị loại. “must try” dùng điểm đánh giá đã có để ưu tiên, không phải danh hiệu đã xác minh.
- So sánh yên tĩnh/trò chuyện dùng `vibes`/`dna_tags` có sẵn để xếp hạng mềm; không xác nhận độ ồn thực địa. Sửa thêm lỗi đồng âm: “Cà phê **chưa** rõ giá” không bị xếp vào **chùa**.
- Xóa nearby chỉ xóa mốc/bán kính/strict, giữ thành phố, loại điểm và mức giá. Loại quán đầu theo thứ tự các thẻ vừa hiện, không theo thứ tự database; loại trừ tiếp tục có hiệu lực ở lượt sau.
- Sửa lịch có nhiều thay đổi giữ chung một bản gốc và các edit theo ngày. Thiếu giờ cụ thể thì hỏi một câu và giữ yêu cầu còn lại. Chỉ thay đúng điểm đầu/cuối được yêu cầu; ưu tiên điểm chưa dùng trong Ý tưởng hoặc thẻ được chỉ rõ. Thiếu điểm thay/giờ/khung hợp lệ thì hỏi, không xây lại cả ngày. Giữ nguyên bữa trưa được nhận diện và những stop/ngày khác. Kiểm giờ chồng, giờ mở cửa nếu có dữ liệu, ngày quá khứ, version. Thời gian đi sau khi thay điểm vẫn cần kiểm tra; không gọi dịch vụ tuyến.
- Preview chưa ghi lịch. Apply giữ owner check, so digest và CAS trong transaction cùng guard Supabase hiện có. Gỡ edit cuối cùng khôi phục bản gốc, không tự xếp lại cả ngày.

## Kết quả từng trường hợp

“Mock” nghĩa là chỉ mock kết quả model; dùng service/search/ranking/planner/store thật trên DB tạm, không phải kiểm bằng so khớp nguyên câu. Mỗi câu chính có thêm cách diễn đạt khác trong bộ test.

| Trường hợp | Nhánh | Giữ / đổi / bỏ | Bằng chứng |
|---|---|---|---|
| 3 điểm ở Huế, đúng 1 chùa | gemini | Giữ Huế; count=3; mix temple:1/other:2; ưu tiên đánh giá | Mock + Gemini thật; kiểm lại với JSON grammar cuối: 3 thẻ, 1 chùa |
| 2 điểm còn lại khác chùa | gemini | Giữ Huế; count=2; bỏ mix cũ; exclude temple | Mock + Gemini thật sau sửa giao thức enum/count, trước thêm grammar; 2 thẻ không chùa |
| “cái nào yên hơn?” và diễn đạt khác | gemini | Giữ tập kết quả, thành phố, mức giá; thêm ưu tiên quiet, không tự siết hard filter | Mock + Gemini thật trước grammar cuối; thẻ có chứng cứ đứng trước, không khẳng định đo độ ồn |
| “không cần gần chùa nữa” và diễn đạt khác | gemini | Bỏ nearby/anchor/radius/strict; giữ Huế/cafe/100k | Mock sau reopen + Gemini thật trước grammar cuối |
| “đừng gợi ý lại quán đầu” và diễn đạt khác | gemini | Giữ điều kiện; exclude đúng ID thứ nhất, tồn tại qua lượt sau | Mock + Gemini thật trước grammar cuối |
| Ngày 2 sáng trễ, giữ ăn trưa, chỉ đổi điểm cuối | gemini | Focus day 2; giữ lunch và các ngày/stop khác; giữ pending start/replacement; hỏi giờ | Mock + Gemini thật; bản diễn đạt “Bữa thứ hai…” qua grammar cuối |
| Trả lời nối tiếp “tầm mười giờ sáng nhé” | gemini | start_after=10:00; giữ meal/replace_stop của lượt trước; tạo preview cùng bản gốc | Mock + Gemini thật với grammar cuối; sáng 10–11h, lunch/stop chiều nguyên vẹn, điểm cuối đổi sang Ý tưởng chưa dùng |
| Bỏ chỉnh giờ khi đang có preview | gemini (mock) | Khôi phục giờ gốc; giữ những edit khác; nếu không còn edit thì khôi phục nguyên lịch | Mock: giữ đúng bản gốc, không rebuild |
| Chào đơn thuần/nút xếp lịch/thao tác thẻ | rules | Không gọi model; không spill POI cũ | Mock kiểm số lần gọi provider=0 |
| Câu tự do có một phần rules hiểu được | gemini | Vẫn dùng model cho ý nghĩa phần còn lại | Mock kiểm có gọi provider |
| Model timeout/quota/lỗi cấu trúc | fallback | Tìm đơn giản và nút thẻ vẫn hoạt động; yêu cầu phức tạp không được đoán rồi sửa | Mock; thực tế đã gặp lỗi schema và xác nhận không ghi lịch |
| Đổi chuyến/tài khoản/mode | rules/store | Không mang last_ids, bộ lọc và draft sang scope khác | Mock/store tạm |
| Chưa Apply / sai thẻ / state đổi / ngày quá khứ / phiên bản cũ | validators | Không ghi; không đổi một phần state nếu delta không hợp lệ | Mock và bộ hồi quy hiện có |

## Gemini thật: điều đã gặp và đã sửa

Thử với `gemini-3.5-flash-lite`, key từ `.env` bị ignore, project Free Tier đã xác nhận ở lượt cấu hình trước. Không bật billing, grounding Search/Maps, SDK mới hoặc dịch vụ trả phí. Source vẫn mặc định hai cờ AI=false; giữ local override do chủ dự án đã cho phép bật trước đó.

Các lần thử dùng POI/lịch giả lập cố định và store riêng; không đọc chat hay lịch tài khoản thật, không gọi Apply. Daily counter giữ nguyên giới hạn 40. Đã hoàn lại đúng 9 reservation của các request kiểm schema bị HTTP 400, không có model generation; không đổi giới hạn hoặc xóa lịch sử thật.

Đã phát hiện model xuất mix dạng chuỗi và category tiếng Việt; sửa hướng dẫn wire value rõ ràng. Một lượt khác dùng key `set` thay cho `op`; bổ sung `responseJsonSchema` vào request. Schema đầy đủ ban đầu bị provider từ chối vì quá nhiều trạng thái. Grammar cuối chỉ giữ envelope/field/op và dạng JSON có giới hạn độ sâu, còn giá trị/ngưỡng được backend xác thực chặt. Sau đó kiểm lại Gemini thật: ca 3 điểm/1 chùa và 2 lượt planner diễn đạt khác đều qua. Không tuyên bố đã chạy lại toàn bộ hội thoại live với grammar cuối.

Tài liệu đối chiếu: [Google Structured outputs](https://aistudio.google.com/docs/structured-output), [GenerationConfig](https://aistudio.google.com/api-reference/generate-content).

Artifact tại workspace Codex `outputs/dialogue-v2-2026-11-16/`: backup source trước sửa, script live dữ liệu giả, `live-mixed-results.json`, `live-schema-check.json`, `live-planner-schema-results.json`; `live-results.json` giữ cả lượt thất bại đã phát hiện trong quá trình sửa. Không chứa key/.env.

## Log, kiểm thử và giới hạn

Logger dev `greentrip.assistant.route` ở mức DEBUG: route=rules/gemini/fallback, reason (greeting/card_action/explicit_action/ai_disabled/structured_turn/quota/timeout/invalid_response/invalid_request/credentials/unsupported_model/unavailable/invalid_reference), intent, tên trường đổi/xóa. Không log câu chat, ID người dùng/chuyến, dữ liệu cá nhân, key hoặc provider body. Có test kiểm log. Có thể đặt logger này về DEBUG trong cấu hình logging dev để xem; response có `trace` tương ứng để test.

Lệnh kiểm backend:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_dialogue_deltas.py tests/test_gemini_dialogue.py tests/test_travel_assistant.py tests/test_copilot_chat.py tests/test_schedule_validation.py tests/test_poi_loading_contract.py tests/test_trip_parameters.py tests/test_config.py -q
```

Kết quả cuối: **134 passed**, 1 cảnh báo Starlette/httpx có sẵn. Không thêm dependency runtime.

Không sửa frontend. Landing SHA256 giữ nguyên `2abe196d48f15d038a1004011e2742101dc05ece93ebe13691388266c3dabe37`. Không kiểm UI bằng browser trong lượt này. Các lỗi lint/unit frontend và giới hạn RLS/grants đã ghi từ trước không thuộc phạm vi sửa này. Chưa review nhóm/CI và chưa deploy. AI Free Tier vẫn có thể lỗi/quota hoặc hiểu sai câu mới; grammar không đảm bảo hiểu đúng mọi ý, backend vẫn từ chối đầu ra không hợp lệ và giữ Preview/Apply.
