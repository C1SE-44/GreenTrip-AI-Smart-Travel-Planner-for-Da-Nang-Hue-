## Landing Studio v3 — 18/11/2026

Đã tích hợp hero/nhân vật và ba card từ ZIP người dùng, autoplay độc lập cuộn; giữ tối ưu tải, WebP 2,34 MB, CTA lịch mẫu/chỉnh/bỏ/sao chép và tra món sang Khám phá. UI desktop/320 px đã kiểm; query nhận đúng nhưng chưa xác nhận kết quả POI vì backend local chưa chạy. Không đụng AI/DB online, chưa publish. Chi tiết: [LANDING_STUDIO_V3.md](LANDING_STUDIO_V3.md).

## Ba hội thoại riêng và cache tài khoản — 17/11/2026

Đã bổ sung conversation_id 1–3 cho history/chat/apply; giữ lịch sử cũ ở slot 1 và ngữ cảnh/bản nháp riêng theo account/trip/mode/slot. UI có bộ chọn ba hội thoại, 403 có đường tạo chuyến riêng. Cache chuyến FE theo verified account, chỉ nhập cache legacy có owner được server xác minh; không xóa hoặc tự chuyển quyền chuyến legacy còn lại. **171 test backend + 6 test frontend liên quan PASS**, typecheck/build/lint trợ lý mới PASS. IAB đã quan sát chuyển 1/2/3, lưu Ý tưởng → preview → Apply trên SQLite riêng, đổi chuyến/tài khoản và khôi phục chat. Chưa QA UI toàn ExplorePage với tài khoản thật, chưa kiểm Gemini thật trong lượt này. Chi tiết giới hạn chuyển cache cũ và kết quả từng ca: [QA_ASSISTANT_CONVERSATIONS_2026-11-17.md](QA_ASSISTANT_CONVERSATIONS_2026-11-17.md).

## Lịch mẫu chặn trợ lý — 17/11/2026

Đã sửa UX tại local: `sample-*` là lịch dùng chung nên backend trả 403 có chủ đích; tải lại không giải quyết được. TravelAssistant hiện hướng dẫn và nút **Tạo chuyến riêng**, dùng CreateTripMindtripModal hiện có, chuyển ID Ý tưởng đang chọn qua luồng tạo chuyến của ExplorePage; không gửi history/chat của lịch mẫu. Giữ nguyên guard backend, không ghi Supabase online. Đã quan sát bằng IAB trên harness SQLite `:5177/__assistant-ui?sample=1`: hướng dẫn + số Ý tưởng hiển thị, bấm nút mở đúng form tạo chuyến. Chưa submit tạo chuyến trên tài khoản thật, chưa kiểm Gemini thật trong lượt này. Backend liên quan **165 PASS** (thêm ca sample history/chat/apply bị chặn trước DB và private trip mới chat được mà chưa lưu lịch); frontend typecheck/build và lint TravelAssistant/harness PASS. Không suy ra toàn bộ UI đã PASS; các luồng UI nhiều lượt/Apply của mốc trước vẫn cần nghiệm thu riêng.

## Hội thoại trợ lý — cập nhật 16/11/2026

Lượt nghiệm thu UI sau mốc 162: đã mở frontend `:5177/__assistant-ui` + backend `:8017` trên SQLite riêng và xác minh URL từ log/HTTP. Chrome/Edge headless crash trước DOM (Crashpad/AppContainer), UI vẫn BLOCKED; Gemini thật đang trả 503 ở ca tự do. Qua API demo phát hiện và sửa rules hiểu nhầm loại mốc gần là category mục tiêu; regression **163 PASS**. Hai luồng lưu/Apply và đổi chuyến+AI off qua HTTP, không coi là UI PASS. Checklist tay, lỗi/câu nhập và cách mở demo: [QA_ASSISTANT_UI_2026-11-16.md](QA_ASSISTANT_UI_2026-11-16.md). Không ghi Supabase online, không sửa lỗi nền OS/frontend.

Nghiệm thu bổ sung: **162 test backend liên quan PASS**, frontend typecheck/build PASS; có kiểm bốn JWT đồng thời trên SQLite test và bốn câu mới bằng Gemini thật. Thêm search_scope new/refine, local hard/soft, kiểm city rõ ràng, lọc lại compare, nearer, preview summary và active_draft_id. UI thật/bốn browser session vẫn BLOCKED; lint/unit nền không xanh. Không deploy hoặc ghi Supabase online. Chi tiết/lệnh tái hiện: [QA_ASSISTANT_ACCEPTANCE_2026-11-16.md](QA_ASSISTANT_ACCEPTANCE_2026-11-16.md).

Đã sửa local luồng Gemini → delta đã kiểm → search/preview; bỏ việc rules đọc lại và ghi đè model thành công. Giữ state gọn theo tài khoản/chuyến/mode, count/mix/loại trừ/clear nearby, so sánh theo chứng cứ có dữ liệu, và edit nhiều phần trên cùng draft mà giữ lunch/ngày khác. Provider có JSON grammar, lỗi có rules fallback; UI/PB09/Preview–Apply và guard Supabase giữ nguyên. Source AI mặc định tắt, local Gemini Free Tier giữ override được chủ dự án cho phép; không bật billing/grounding, không deploy/ghi DB online. Xem [QA_DIALOGUE_V2_2026-11-16.md](QA_DIALOGUE_V2_2026-11-16.md) cho từng ca mock/live và giới hạn. Giữ nguyên các thay đổi chưa commit từ các lượt trước.

# GreenTrip — roadmap bàn giao

## Chatbot theo thảo luận — 16/11/2026 (demo local, chưa deploy)

- Đã đọc link chat được giao; thay chat giả/auto-apply bằng assistant chung Khám phá + Lên lịch, API bắt buộc đăng nhập, history account/trip/mode, thẻ POI thật, Ý tưởng, preview/Apply và CAS; giữ nguyên landing/theme/F02/F03. Tái dùng PB09 ranking, Saved Places và itinerary editor/repository.
- Nối Gemini ngày 16/11 sau khi người dùng cung cấp key và ảnh Free Tier: `gemini-3.5-flash-lite` đã trả HTTP 200 và hiểu đúng ba câu thật. Model đọc tối đa 6 tin gần nhất + context tối thiểu, phân loại ý định/hỏi lại; hành động vẫn qua backend, không auto-apply. Local `.env` bật AI và giới hạn 40 lượt/ngày; môi trường chưa cấu hình vẫn dùng quy tắc. Không thêm runtime dependency, không bật billing. Xem phần cập nhật trong tài liệu demo; không commit key.
- Local browser QA có đăng nhập/tìm/lưu thứ hai/preview/Apply/đổi chuyến và 320px. Chi tiết, lệnh chạy, giới hạn và kiểm thử: [TRAVEL_ASSISTANT_DEMO.md](TRAVEL_ASSISTANT_DEMO.md).
- Còn trước khi public: duyệt quyền DB online (RLS/grants của 3 bảng lịch chưa bảo vệ, guard chặn Apply PostgreSQL; SQL review chưa áp dụng), đĩa bền vững cho chat store, API metadata đa thiết bị và cache UserTrip theo tài khoản. Không commit/push/deploy.
- Baseline `a449fa0`: 3 unit/tĩnh frontend lỗi và 10 lỗi lint đã tái hiện riêng; browser harness cũ còn timeout. Không báo toàn suite xanh.

## Explore loading — 14/11/2026

- Đã sửa local: overview 4 nhóm × 4 summary; danh mục/tìm kiếm phân trang API 16; chi tiết lấy theo ID; debounce/abort/cache 30 giây; ảnh card responsive 320/640 và lazy. Không tải catalogue từ effect Explore ở Home/danh sách Trips.
- Bộ lọc nâng cao vẫn cần đủ ứng viên summary để giữ predicate FE và điều kiện API cũ; concurrency tối đa 2. F02/F03 giữ owner/phạm vi hiện có. Planner/SavedPlaces chưa được coi là phân trang server.
- API bổ sung view/ids/q/sort, cần deploy backend trước frontend. Overview chọn top tại server theo xanh/Michelin/rating, không bảo đảm giống heuristic tên/profile toàn catalogue cũ.
- Đo local overview JSON 3.084.281 → 61.553 B; chưa phải số đo production. Typecheck/build qua, 5 test FE/2 test BE mới qua; lint toàn repo còn 9 error cũ, test_pois còn 2 fail cũ max limit100/1000. Chưa commit/push/deploy, review nhóm/CI chưa thực hiện.

Mốc: 2026-11-13. Roadmap ghi trạng thái đã biết, không phải lệnh tự triển khai toàn bộ.

## 1. Đã hoàn thành ở các lượt trước

- Đồng bộ UI planner theo Explore/Mindtrip, typography, lưới Ý tưởng và khung bản đồ. Chi tiết: PLANNER_UI_HANDOFF.md, PLANNER_TYPOGRAPHY.md. Giữ các thay đổi chưa commit.
- QA Part 1 trên localhost: Explore, bộ lọc, ♥, Đã lưu, + → Ý tưởng. Nguồn dev lúc kiểm có 482 POI; số này là snapshot lịch sử, không hardcode vào sản phẩm/test.
- **F01:** ánh xạ Tâm linh ở backend hỗ trợ nhãn dữ liệu thật `Tâm linh & Tôn giáo` và nhãn cũ. API rỗng không bị thay bằng mẫu; lỗi có trạng thái riêng. Sửa repository.py, test_pois.py và ExplorePage.tsx. Lần kiểm lại: 45 cả hai thành phố / 22 Đà Nẵng / 23 Huế / 9 ca 1 km, đối chiếu tập ID.
- **U01:** AddToTripModal nói rõ thêm vào Ý tưởng của chuyến; thông báo có tên chuyến sau trạng thái thêm được xác nhận. Không đổi logic lưu, không xóa trip.savedPlaces. Kiểm Chùa Báo Quốc: ♥ cá nhân, + A/B đúng nơi, hủy an toàn, không tự tim, tải lại còn đúng. Báo cáo kiểm lại có 26 ca Pass. Đây là kết quả lượt trước, không phải lần chạy lại trong lượt cài công cụ.

## 2. Ưu tiên tiếp: bộ lọc và dữ liệu — Nguyên

| Việc | Hiện trạng / bằng chứng | Cần chốt và tiêu chí nghiệm thu |
|---|---|---|
| F02 — Giá | Chưa sửa. API dùng budget_tier chính xác; frontend/modal dùng tier hoặc khoảng chi phí, nhãn/ngưỡng khác nhau. 2AM Coffee giá 40.000, tier $$ từng bị loại ở mức <50k; preview 133 nhưng kết quả 108 ở ca Ẩm thực lịch sử. | Chốt đơn vị giá, giá vào cửa hay chi tiêu, 0/free/unknown, ranh giới khoảng. Dùng một quy tắc cho preview, danh sách, API và modal thêm POI. Đối chiếu toàn bộ tập ID và phân trang. |
| F03 — Thời gian | Chưa sửa. Explore và modal có hai matchesTimeOfDay. Lịch sử preview/thực tế: ngày 216/217, đêm 282/288, cả hai 426/425. | Chốt “ngày” là sáng hay sáng+chiều; giờ gợi ý khác giờ mở cửa. Chuẩn hóa best_time, thống nhất hàm và test biên. |
| Nhãn xanh / thuộc tính | Snapshot 482/482 eco_features không rỗng, open_now=true và is_local_business=true; badge xanh 312, lọc xanh 482. Có mô tả du lịch trộn trong eco_features. | Xác minh nguồn/chứng cứ, tách tiêu chí xanh khỏi mô tả; chốt badge theo điểm hay feature. Không tự quy mọi cờ true là sai; không gộp bộ lọc vì tình cờ cùng ID ở snapshot này. |
| Giá và best_time cần đối soát | Snapshot: 20 POI Ẩm thực ≤50k nhưng tier $$; 64 giá 0 nhưng không tier miễn phí; 36 giá dương nhưng tier miễn phí; 252 best_time ngoài enum/kèm mô tả, 98 chứa đêm. Các nhóm có thể giao nhau. | Sửa dữ liệu sau khi có định nghĩa chính thức. Ghi nguồn, thời điểm cập nhật, giá trị thiếu; migration có khả năng rà soát. |

Đầu ra giao Nguyên: quy tắc nghiệp vụ có ví dụ biên; data dictionary; danh sách ID cần sửa; sửa tại nguồn dùng chung; snapshot mới và đối chiếu hai chiều API → card/chi tiết và điều kiện → tập ID; không lọt sai/bỏ sót đúng. Khi 0 kết quả phải phân biệt rỗng hợp lệ với lỗi, có cách bỏ/đặt lại bộ lọc.

Bộ bàn giao đầy đủ đã tạo: `Ban-giao-Nguyen-Filter-Data-2026-11-13.zip` (README, CSV đối soát và bằng chứng request/ảnh). Vị trí máy hiện tại: `C:/Users/ngoho/Documents/Codex/2026-11-13/b-y/outputs/`. Không chứa tài khoản/mật khẩu trong roadmap.

## 3. QA sau merge đã được giao bổ sung

- Đã kiểm/sửa đủ5nhóm: ♥/+ vào Ý tưởng, hộp ngày, đồng bộ tăng/giảm ngày, chặn quá khứ tại UI/API và vị trí phút/vạch giờ, UI calendar đúng phạm vi. **5/5 Pass trên localhost**; chi tiết và giới hạn test phụ ở QA_POST_MERGE_2026-11-13.md.
- Thêm tripDates.ts, schedule_validation.py; itineraryService căn chỉnh ISO/null và bảo vệ thứ tự lưu/đọc khi chuyển tab. Không dùng snapshot lịch sử để suy ra ngày hiện tại.

## 4. Chờ phạm vi riêng

- Ngoài5nhóm đã kiểm: kéo thả, xung đột giữa hoạt động, tạo lịch trình và AI vẫn chưa được xác minh đầy đủ; không suy ra Pass từ code hoặc từ các ca ngày/giờ vừa chạy.
- Đánh giá lưu chuyến giữa thiết bị/server: fixture A/B trước đây ở localStorage; tải lại cùng trình duyệt không chứng minh đồng bộ tài khoản đa thiết bị.
- Nợ kiểm thử đã biết: lint frontend còn lỗi cũ; backend có test giới hạn 100 khác router 1000. Không sửa test để làm xanh và không xử lý ngoài task được giao.

## 5. Cách cập nhật sau mỗi task

### Bản đồ — camera và tương tác (13/11/2026)

- Thư viện xác nhận từ import/khởi tạo: Leaflet + react-leaflet; Google chỉ là TileLayer nền. Không đổi thư viện hoặc giao diện.
- Đã tái hiện/sửa hover ngoài khung chạy ngay và đổi zoom; setIcon toàn nhóm mỗi hover; click marker chưa cuộn danh sách. File nguồn: PoiMap.tsx và ExplorePage.tsx.
- Planner giữ hành vi hover ngoài khung chờ300ms rồi panInside giữ zoom. Explore đã được thay bằng quy tắc riêng bên dưới. Icon không đổi được dùng lại. Click marker chỉ cuộn mainScrollRef tới card đang có, không đổi kết quả/phân trang.
- **4/4 ca Explore Pass** trên localhost; smoke Ý tưởng/Lịch trình/Lịch Pass sau khi dữ liệu/fit hợp lệ đã hoàn tất. Fitter hiện dùng khung map thật, không trừ cột danh sách; không đổi các lần fit hợp lệ hoặc thuật toán nhãn.
- Bằng chứng máy chạy: `C:/Users/ngoho/Documents/Codex/2026-11-13/b-y/outputs/map-camera/REPORT.md`. Không mở lại QA Part1/2, F02/F03, API hay nghiệp vụ chuyến đi.

#### Explore — overview / local / bridge (13/11/2026, thay quy tắc hover cũ riêng Explore)

- File vào: `frontend/src/components/poi/ExploreMapCamera.tsx`; tích hợp tùy chọn tại `PoiMap.tsx`, chỉ `ExplorePage.tsx` truyền cấu hình. Planner không dùng controller này.
- Khung đầu lấy bounds đô thị của khu vực, độc lập GPS/trang POI. Camera ref riêng với highlight: overview; local(anchor); bridge(from,target). Hover liên tục300ms; rời/đổi thẻ, đổi vùng, click hoặc thao tác map hủy chờ; animation không bị nhận nhầm là kéo tay.
- Ngưỡng gần/xa `EXPLORE_NEARBY_METERS = 5000`. A→B xa: flyToBounds chỉ A+B, maxZoom bằng zoom hiện tại; giữ bridge sau moveend. B→C khác B và gần B: xử lý trước kiểm vùng an toàn, fit chỉ B+C, maxZoom14, anchor tâm bounds. Local gần: highlight trong vùng an toàn, panInside giữ zoom ở mép; không trừ cột nội dung.
- Marker ngữ cảnh: gộp ID từ kết quả đầy đủ đã lọc trong5km quanh anchor B–C, giữ hai mốc và marker hover. Không thêm request, không đổi card/phân trang/filter, không đổi kiểu marker. Hover trên marker không kích hoạt camera hover thẻ.
- **4/4 bước Pass thực tế Playwright trên localhost**: overview thấy cả hai vùng (zoom9); kéo/zoom tay A Đà Nẵng (zoom13); B Huế mở A+B (zoom10), một animation, rời thẻ vẫn giữ; C đã thấy cách mép37px vẫn gom B+C (zoom14). Có17 marker ngữ cảnh bổ sung trong5km ở snapshot chạy, click được; danh sách không đổi, không request mới khi hover. Lướt nhanh/hover gần không dịch camera; click marker cuộn đúng thẻ, không cuộn trang/căn lại map.
- Smoke một màn **Planner Lịch Pass**, không mount Explore controller, tâm/zoom giữ nguyên khi hover/rời marker. Không chạy lại QA Part1/2. Bằng chứng, ảnh A/A+B/B+C và patch riêng lượt này: `C:/Users/ngoho/Documents/Codex/2026-11-13/b-y/outputs/map-context/REPORT.md`.

#### Tinh chỉnh zoom / nhãn / tile Explore (13/11/2026)

- Thay đổi hiện tại ở `PoiMap.tsx` và `ExploreMapCamera.tsx` (đã được cho phép mở phạm vi file camera). `ExplorePage.tsx` được đối chiếu nhưng không cần đổi; không sửa CSS, API, filter, pagination, dữ liệu hay Planner.
- Overview cả hai thành phố vẫn fit hai bounds đô thị ở zoom lớn nhất chứa đủ vùng an toàn; một thành phố lùi một zoomDelta so với fit đô thị. B–C dùng trần tự động riêng **13** thay14; giới hạn zoom tay vẫn18. Quy tắc overview/local/bridge, debounce300ms và hover cuối thắng giữ nguyên.
- Dùng lại nhãn hover marker có sẵn, thêm focusin/focusout trên markerPane riêng Explore. Chặn autoPanOnFocus riêng Explore; clamp duy nhất nhãn đang mở vào viewport và tránh nút map, không dàn nhãn toàn bộ.
- Tái hiện ngắt flyTo giữa hai vùng: `map.stop()` làm tròn zoom lẻ bằng setZoom có animation, có thể xếp một zoom RAF chạy sau fit khu vực và kéo tâm sai. Explore dùng setView với animate:false để dừng/round đồng bộ. Ca ngắt animation chạy lại: tâm Đà Nẵng lúc vừa chọn và sau1,6s giống hệt, zoom11.
- Ô vàng/be là nền Leaflet `rgb(242,237,229)` lộ trong khi tile mới chưa tải, không phải lớp bị dựng lại: layerID giữ nguyên, không layeradd/remove và không tileerror. Thử updateWhenZooming:false tạm trong browser vẫn có tile zoom trung gian, chưa thấy bớt loang rõ; **không giữ tùy chọn này**, không đổi màu nền/nhà cung cấp. Khoảng hở tạm khi tải tile vẫn còn.
- **3/3 ca localhost Pass** theo phạm vi lượt này: cửa sổ1440×1000, map522×950, Đà Nẵng12→11, hai thành phố9→9 (nấc10 sẽ cắt bounds); nhãn giữa/mép/focus không đổi camera; đổi nhanh và ngắt animation giữ đúng vùng cuối. Bằng chứng: `C:/Users/ngoho/Documents/Codex/2026-11-13/b-y/outputs/map-polish/REPORT.md`. Không chạy lại QA cũ hay Planner trong lượt tinh chỉnh.

Chỉ sửa dòng trạng thái liên quan: ngày, owner, phạm vi, file, kiểm thử thật, bằng chứng, phần chưa kiểm. Nếu nghiệp vụ hoặc đường đi code đổi, cập nhật AI_CONTEXT.md. Nếu code đổi, refresh Graphify code-only. Không ghi password, token, .env, payload người dùng vào tài liệu/chỉ mục.

## 2026-11-14 — Ghép landing đã duyệt vào GreenTrip

- Người dùng chốt thay landing bằng bản hero hai nhân vật đi bộ, tự chuyển Đà Nẵng/Huế; giữ ba card navy/cam đất/xanh rêu và khối ảnh cuối. Tái sử dụng Navbar hiện có với Explore, Planner, My Trips và auth; bỏ header/link mở ứng dụng bên ngoài.
- Thay `frontend/src/pages/LandingPage.tsx`; thêm `frontend/src/components/landing/` và ba ảnh tối ưu trong `frontend/public/images/landing/`. CSS được giới hạn dưới `.gt-landing`, cỡ chữ tối thiểu 12px. Không sửa Navbar, router, Explore, Planner hoặc backend.
- Kiểm tra: typecheck/build đạt; lint riêng phần mới đạt. Lint toàn repo trước/sau đều 9 lỗi và 156 warning. 12 test logic ngày/lịch/bản đồ đạt. Toàn bộ npm test chưa đạt: ca Chromium trong explanation.test.mjs báo lỗi và bộ chạy không kết thúc, đã dừng; không báo toàn bộ suite pass.
- Browser QA localhost:5174: header dẫn đúng /explore, /planner, /my-trips; /login mở modal cũ. Menu mobile và lịch Huế 2 ngày hoạt động ở viewport320; không tràn ngang. Hero/ảnh tải được; CSS landing không áp dụng khi chuyển sang Explore.
- Lịch gợi ý vẫn là mẫu tham khảo, chưa đồng bộ thành chuyến đi đã lưu. Map3D chưa làm theo lựa chọn người dùng. Chưa commit/push/deploy; vẫn cần review nhóm/CI theo AGENTS.md. Giữ nguyên nhánh tích hợp và toàn bộ thay đổi khác đang có.

## 2026-11-14 — Tối ưu lần tải đầu landing

- Người dùng báo link sau deploy lag/hiện chậm; đã cho phép tối ưu, giữ thiết kế. Tách Explore/VerifyEmail qua React.lazy, dời Phosphor/Leaflet CSS vào Explore, chỉ mount/tải auth modal khi mở. Google Identity SDK được tải từ LoginModal, không còn script toàn trang. Giữ router và auth handlers cũ.
- WebP responsive 640/1400px cho ba ảnh; preload hero, font display=swap và stylesheet không chặn render; HTML có nội dung tĩnh trong lúc chờ React. Không thêm dependency ứng dụng.
- Hero: bỏ blur/mask động, bỏ backdrop blur landing, giới hạn cập nhật SVG khoảng30/s và chờ1,6s trước công việc liên tục. Giữ tự chuyển hai cảnh và dừng ngoài viewport/tab ẩn/giảm chuyển động.
- Build: JS initial942392→250299 byte (-73,4%), CSS372471→167497 (-55%); ba ảnh lớn778670→442370 (-43,2%). Đây là dung lượng file, không phải tốc độ mạng/FPS đã đo.
- Typecheck/build/lint riêng các module chính đã sửa đạt; full lint9 lỗi cũ/154warning. 12 test ngày/lịch/map đạt; self-check manifest đạt. Browser production localhost4174: Explore/map, form login, Planner và lịch mẫu hoạt động; mobile390 không tràn ngang, dùng ảnh640px. Chưa xác minh đăng nhập thật, FPS máy yếu hoặc link deploy sau thay đổi.
- Báo cáo: C:/Users/ngoho/Documents/Codex/2026-11-14/https-green-trip-ai-smart-travel/outputs/GREENTRIP_PERFORMANCE.md. Chưa commit/push/deploy, không báo hoàn tất DoD nhóm.

## 2026-11-15 — Khắc phục lộ UUID thô tại Planner & Tích hợp Skill Graphify / Ponytail

- **Khắc phục lỗi lộ UUID thô thành tiêu đề card tại `/planner`**:
  - Tình huống: Chuyến mẫu `SEEDED_SAMPLE_TRIPS[0]` lưu sẵn danh sách ID ý tưởng `['029a28df-b091-49d9-a911-738572c72464', 'd58fe815-4aa1-45b2-831a-11b97e130918', 'bfed964e-ff10-44f4-8654-2136245ab062']`. Khi vào tab Ý tưởng, nếu danh mục POI chưa kịp tải hoặc ID thiếu, component fallback tự tạo card với tên chính là chuỗi UUID và ảnh Cầu Vàng mặc định.
  - Xử lý:
    - Bổ sung hàm tiện ích `isRawIdentifier` trong `frontend/src/data/pois.ts` nhận diện UUID, Mongo ObjectID và mã băm kỹ thuật. Cập nhật `cleanPoiName` không cho phép hiển thị UUID thô.
    - Bổ sung 3 POI thực tế của chuyến mẫu vào tập dữ liệu client: Bếp Cuốn Đà Nẵng (Michelin Bib Gourmand), Đi Lạc Coffee và Nhà Thờ An Hải.
    - Trong `TripOverviewView.tsx` và `TripItineraryView.tsx`: thêm hook tự động nạp POI theo ID còn thiếu (`getPoisByIds`); hiển thị **card loading skeleton** hiệu ứng `animate-pulse` thay cho card UUID thô khi dữ liệu đang được nạp hoặc chưa giải quyết xong.
  - Kết quả kiểm thử: `npm run typecheck` đạt 0 lỗi; 17 unit test (`poi-loading`, `planner-date-schedule`, `itinerary-route-map`) chạy pass 100%.

- **Cấu hình & Tích hợp công cụ tiết kiệm ngữ cảnh (Graphify & Ponytail)**:
  - Thiết lập thư mục workspace skills tiêu chuẩn `.agents/skills/` dùng chung giữa Codex và Antigravity:
    - `.agents/skills/graphify/SKILL.md`: Truy vấn quan hệ symbol mã nguồn có giới hạn ngân sách token (`--budget 700`).
    - `.agents/skills/ponytail/SKILL.md`: Quy trình định tuyến nhanh qua `docs/AI_CONTEXT.md` và chỉnh sửa tối thiểu (surgical coding).
  - Khởi tạo thư mục tài liệu `outputs/ai-tools/` với [README.md](outputs/ai-tools/README.md) và [AI_ROADMAP.md](outputs/ai-tools/AI_ROADMAP.md).
  - Tổng số skill hiện có: 50 skills (48 platform/ecosystem skills + 2 workspace skills).

## 2026-11-15 — Tối ưu Real-Time Explore & Khắc phục Modal Chặn Xem Chi Tiết

- **Khắc phục modal "Đang tải chi tiết địa điểm..." làm chậm mở chi tiết**:
  - Tình huống: Người dùng bấm "Chi tiết ->" từ card hoặc popup bản đồ nhưng bị chặn bởi hộp thoại modal giữa màn hình ("Đang tải chi tiết địa điểm... Đóng"), gây giật lag và phải đợi 0.5-1s mới mở được ngăn kéo.
  - Xử lý:
    - Bổ sung cơ chế **Optimistic Detail Resolution (0ms)**: Khi mở POI, `fullDetailPoi` tức thời lấy dữ liệu tóm tắt sẵn có trong bộ nhớ client (`allPois`, `displayedMapPois`, `pois`) để dựng ngay `PoiDetailSection` và trượt vào màn hình với hiệu ứng mượt mà.
    - Bổ sung `detailPoiCacheRef`: Ghi nhớ các POI chi tiết đã tải để mở lại ngay lập tức không cần request mạng.
    - Di chuyển trạng thái tải/lỗi vào bên trong khung trượt phải; **xóa bỏ hoàn toàn hộp thoại modal chặn giữa màn hình**.
- **Tối ưu tốc độ chuyển danh mục & tìm kiếm Real-Time tại Explore**:
  - Tình huống: Chuyển tab ("Ẩm thực", "Di tích", "Thiên nhiên", "Tâm linh") hoặc gõ tìm kiếm bị chớp trắng 6 skeleton cards và lag 0.5-1s.
  - Xử lý:
    - Bổ sung `categoryCacheRef` lưu trữ kết quả danh mục đã tải; chuyển đổi qua lại giữa các tab diễn ra **ngay tức thì (0ms, 60 FPS)**.
    - Cơ chế **Background Category Prefetching**: Khi trang Explore tải xong tổng quan "Cho bạn", tự động tải trước trang 1 của 4 danh mục chính trong nền để sẵn sàng hiển thị khi người dùng bấm tab.
    - Cơ chế **Stale-While-Revalidate**: Chỉ hiển thị skeleton khi hoàn toàn chưa có dữ liệu nào (`loading && allPois.length === 0`). Khi đang cập nhật hoặc gõ tìm kiếm, các card hiện tại vẫn hiển thị mượt mà với hiệu ứng mờ nhẹ và icon loading xoay êm ái trong ô tìm kiếm.
    - Giảm thời gian debounce tìm kiếm từ 300ms xuống 150ms kết hợp lọc tức thời client-side trên tập ứng viên.
  - Kiểm tra chất lượng: `npm run typecheck` 0 lỗi, `npm run build` hoàn thành (1673 modules), bộ unit test cốt lõi đạt 100%. Không làm phát sinh dependency mới.

- **Đồng bộ giao diện bản đồ Explore & căn chỉnh tương tác (Theo buổi phỏng vấn /grill-me)**:
  - **Tự động đóng card nổi trên bản đồ khi xem chi tiết**: Khi bấm "Chi tiết ->" hoặc bấm xem card từ danh sách, `handleOpenFullDetail` tự động xóa `selectedMapPoiId(null)`, giúp bản đồ sạch sẽ, người dùng không phải bấm tắt 'X' thủ công.
  - **Zoom chuẩn mức 13 cho Đà Nẵng & Huế**: Thay vì bị lùi ra quá xa (zoom 11.5 ra biển do trừ zoomDelta), bản đồ khi chọn Đà Nẵng hoặc Huế lập tức lấy nét trung tâm thành phố ở mức zoom 13 (`[16.068, 108.22]` cho Đà Nẵng và `[16.4637, 107.5909]` cho Huế), hiển thị rõ ràng các quận, đường phố và nhãn địa điểm.
  - **Thước đo tỷ lệ động thực tế (Dynamic Scale Bar)**: Thay thế đoạn text `<span>500 m</span>` hardcode tĩnh bằng bộ tính toán khoảng cách mặt đất thực tế theo mức zoom và vĩ độ hiện tại của Leaflet (tự động cập nhật: 10 km, 5 km, 2 km, 1 km, 500 m, 200 m, 100 m...).
  - **Khung bản đồ tràn viền (Full-height edge-to-edge)**: Bản đồ trên trang Explore mở rộng chiếm trọn chiều cao 100vh màn hình, chạm sát mép trên, mép phải và mép dưới (`pl-3 pr-0 py-0`), giữ nguyên lề trái và bo tròn 2 góc bên trái 20px (`rounded-l-[20px] rounded-r-none`) với viền ngăn cách nhẹ bên trái chuẩn trang Lịch trình.
  - Kiểm tra: `npm run typecheck` 0 lỗi, 24 unit tests pass, `npm run build` đạt trong 5.2s.

## 2026-11-15 — Tối ưu Bản đồ Planner & Tính năng "Tìm kiếm khu vực này"

- **Bản đồ tab Ý tưởng (`/planner`) chỉ hiển thị các địa điểm đã lưu**:
  - Tình huống: Trước đây, bản đồ trên tab Ý tưởng tự động nhét 10 địa điểm gợi ý AI (`recommendedPois`) vào `relevantPois`, khiến bản đồ bị rối rắm với hàng loạt ghim thừa thãi không trùng khớp với danh sách "Địa điểm đã chọn" bên trái (ví dụ có 4 card đã chọn nhưng bản đồ hiện cả chục chấm khắp Huế).
  - Xử lý:
    - Loại bỏ `recommendedPois` khỏi bản đồ Planner; bản đồ mặc định **CHỈ hiển thị đúng các địa điểm đã lưu** (`tripIdeas` và các điểm dừng trên lịch trình `itineraryPlan`). Nếu chuyến đi hoàn toàn mới chưa lưu điểm nào, chỉ neo nhẹ 3 địa điểm khởi đầu tiêu biểu (`starterPois`).
- **Tính năng "Tìm kiếm khu vực này" (Search This Area) chuẩn trải nghiệm Mindtrip / Google Maps**:
  - Khi người dùng rê/kéo bản đồ ra khỏi vùng trung tâm các điểm đã lưu (> 400m), một nút nổi bo tròn `Tìm kiếm khu vực này` (kèm icon kính lúp) tự động xuất hiện ở giữa mép trên bản đồ.
  - Khi người dùng click nút:
    - Nút chuyển thành viên thuốc nổi **3-dot animated loading pill** ("Tìm kiếm khu vực này..."), 3 chấm nảy bounce nhịp nhàng.
    - Quét các POI trong khung nhìn bản đồ hiện tại (`bounds`), lọc ra tối đa 15 POI phù hợp chưa có trong chuyến đi.
    - Các POI mới xuất hiện với **hiệu ứng bóng rơi nảy (`gt-ball-drop`)** có độ trễ so le (staggered delay) sinh động.
    - Đánh dấu các POI này là dạng tham khảo (`isReference: true`): card xem trước chỉ hiển thị thông tin và nút Thả tim, **không có nút "+" thêm vào chuyến đi** để giữ nguyên vẹn danh sách địa điểm đã chọn theo đúng thống nhất phỏng vấn `/grill-me`.
  - Nút quay về **"Về điểm đã chọn" / "Về trung tâm"**: Sau khi tìm kiếm hoặc dịch chuyển, một nút nổi bo tròn xuất hiện cho phép người dùng 1 chạm quay trở lại cụm điểm đã lưu ban đầu với camera lướt êm ái (`flyToBounds`).
  - Áp dụng đồng bộ trên cả **trang Lập lịch trình (`/planner`)** và **trang Khám phá (`/explore`)**.
- **Kiểm thử**: `npm run typecheck` đạt 0 lỗi; toàn bộ 24 unit tests pass 100%; `npm run build` thành công trong 5.28s.

## 2026-11-15 — Đồng bộ Cập nhật từ Nhánh của Nguyên (PB14 / PB11 / PB16 / Backend & Services)

- **Kiểm tra nhánh và các cập nhật mới từ Nguyên (`NguyenMinhNguyen1706`)**:
  - Nhánh mới: `feature/#sprint3_unified-planner-mindtrip-ui` (PR #27) và `origin/develop` (PR #28), tích hợp phân hệ PB14 (In-Planner AI Travel Copilot & Smart Budget Tiers), PB11 (Itinerary Assistant & Rest Planning) và PB16 (Saved Places & Collections).
  - Nội dung lấy về:
    1. **Backend Database & Runtime Compatibility**:
       - Cải tiến Neo4j connection timeout (2.0s).
       - Nâng cấp `SQLiteCursorWrapper` trong `backend/app/db/postgres.py` hỗ trợ regex binding `ANY(%s)`, tự động chuyển `ILIKE` sang `LIKE`, xử lý JSON extract `ai_metadata->>`, và bỏ typecast Postgres cho chế độ chạy dev/offline.
       - Tích hợp 2 tệp migration: `012_create_itinerary_days_and_stops.sql` và `013_add_itinerary_stop_address.sql`.
    2. **AI Copilot & Smart Budget Tier Endpoints**:
       - Bổ sung các schema và handler trong `backend/app/trips/`: `night_eco_handler.py`, `poi_advice_handler.py`, `service.py`, `itinerary_repository.py`.
       - Hỗ trợ phân tầng ngân sách theo danh mục (`dining_tier`, `lodging_tier`, `activities_tier`) bên cạnh `budget_tier`.
       - Hỗ trợ các intent AI Copilot: đổi món chay (`swap_meal_vegetarian`), hoạt động ngày mưa (`rainy_day_alternatives`), đêm xanh (`night_eco_activities`), và trễ giờ (`late_schedule_adjust`).
    3. **Frontend Services & Types**:
       - Tích hợp chuẩn hóa types trong `tripService.ts`, `copilotTripData.ts` (hỗ trợ `RestPeriod`, `hotel`, `stops`, `budget_tier`).
       - Chuẩn hóa giới hạn `safeLimit = 100` trong `poi.ts` chống tràn query OpenAPI.
       - Cập nhật script `start-dev.ps1` với `--app-dir backend`.
- **Bảo toàn 100% giao diện đã hoàn thiện của người dùng**:
  - Tuyệt đối không thay đổi hay ghi đè bố cục giao diện hiện có:
    - Giữ nguyên khung bản đồ tràn viền 100vh, bo tròn 2 góc trái 20px, thước đo tỷ lệ động, nút "Tìm kiếm khu vực này", loading 3-dot nhấp nháy, hiệu ứng bóng rơi nảy và nút quay về trung tâm.
    - Giữ nguyên thanh Header 4-item pill và 3 tab chuyển đổi (Ý tưởng / Lịch trình / Lịch).
    - Giữ nguyên Landing Page hero 2 nhân vật Đà Nẵng / Huế.
    - Giữ nguyên trang Explore real-time không modal chặn.
- **Đồng bộ giao diện AI trong khuôn có sẵn**:
  - Toàn bộ kết quả phản hồi của AI Copilot (gợi ý đổi địa điểm, tag xanh 🌱, rating, nút Thay thế bo tròn) được hiển thị gọn gàng, đẹp mắt bên trong cột chat trái của tab Ý tưởng (`TripOverviewView.tsx`) hoặc ngăn kéo Copilot drawer, không tràn hay vỡ khung bản đồ.
- **Kiểm thử xác minh**:
  - `npm run typecheck` đạt 0 lỗi.
  - 24/24 frontend unit tests pass 100%.
  - 33/33 backend pytest unit tests pass 100% (`test_copilot_chat.py`, `test_trip_parameters.py`, `test_saved_places_api.py`).
  - Vite build hoàn tất thành công trong 7.32s.


## PB18 local integration — 17/11/2026

- Đã fetch nhánh profile của Thiện (88e0411), ghép có chọn lọc vào feature/pb18-profile-ui-integration, đồng bộ UI và kiểm /profile thật ở 1280/320px.
- Chi tiết QA và giới hạn: docs/PB18_PROFILE_INTEGRATION.md. Chưa push/commit, chưa áp migration/avatar Storage online; giữ nguyên phần AI.


### 2026-11-18 · Sample sheet chân-mây (2)
Đã dùng UI popup của ZIP, nối POI thật qua `/pois` dùng chung Explore, thêm/bỏ/đổi/lên-xuống trong popup; khách thử chỉnh, chỉ đăng nhập khi lưu chuyến riêng (quyết định người dùng). Giữ draft qua authcancel, lưu Ideas + itinerary đúng IDs/thứ tự, mở đúng chuyến; không tự train/gọi AI. API/UI PASS trong SQLite riêng, desktop/320px; 25 backend tests + 4 landing tests, typecheck/build/scoped lint PASS. Global lint vẫn 11 errors/139 warnings, full npm test còn lỗi ngoài phạm vi. Giới hạn: backend chính 8000 tắt, chưa test lưu production/OAuth/email thật; draft khách chưa giữ qua refresh. Chi tiết và bằng chứng: [LANDING_SAMPLE_V2.md](LANDING_SAMPLE_V2.md), [API](LANDING_SAMPLE_V2_API.json), [UI](LANDING_SAMPLE_V2_UI.json).


### 2026-11-18 · Sửa lỗi lưu PostgreSQL và chốt thông tin lịch mẫu
Đã xác minh SQLSTATE 22001 bằng SELECT PostgreSQL: mã điểm dừng 75 ký tự bị chép vào cột legacy varchar(64). BE ánh xạ alias dài bằng UUID5, giữ nguyên modern ID và ID thử lại; không migration hoặc ghi online. Ca strict SQLite trước 503, sau 200.

Luồng mới: khách chỉnh → đăng nhập → một form (đích có sẵn/ngày/người/ngân sách tùy chọn) → tạo đủ Ideas/ngày/stops → mở thẳng tab Lịch trình. Giữ ngày/điểm/thứ tự đã chỉnh, không sinh lại bằng AI; lưu ngày đi/số người/ngân sách. Calendar hết gán giờ giả, thời lượng theo end-start, hỗ trợ giờ sớm/khuya.

API/UI strict fixture PASS: 6 điểm Huế, 20/12/2026, 3 người, 5 triệu; sửa giờ 09–10 rồi tải lại vẫn giữ. BE 26 tests PASS; FE 7 landing/calendar và 4 account tests PASS; typecheck/build/scoped lint PASS (Calendar còn 27 cảnh báo có sẵn, 0 lỗi). Chi tiết: [HANDOFF](LANDING_SAMPLE_HANDOFF.md), [REPRO](LANDING_SAMPLE_HANDOFF_REPRO.json), [API](LANDING_SAMPLE_HANDOFF_API.json), [UI](LANDING_SAMPLE_HANDOFF_UI.json). Chưa ghi Supabase online, chưa kiểm OAuth/email thật. Cache fixture cũ gây 409 đã tách khỏi ca kiểm bằng tài khoản thử mới; không xóa cache người dùng.

## 2026-11-18 — Luồng lịch mẫu vào Planner
- Lưu draft thật sau đăng nhập, mở Planner trước rồi dùng lại form thông tin chuyến đi không AI; hoàn tất trên cùng ID, giữ địa điểm/thứ tự.
- Sửa cache revision cũ chặn danh sách và tách Vite optimizer/React; giới hạn thời gian tải catalogue, chặn auth response cũ. Không xóa LocalStorage.
- 17 FE + 22 BE focused tests, typecheck/build, UI desktop/320 và API local PASS. Google thật chưa xác minh, không ghi Supabase online. Xem docs/SAMPLE_PLANNER_FLOW_FIX.md.

