# GreenTrip — Bàn giao giao diện lập kế hoạch

Cập nhật: **13/11/2026**, múi giờ Asia/Saigon.

## Yêu cầu và quyết định đã được người dùng duyệt

- Ưu tiên chốt giao diện; backend và các vấn đề nghiệp vụ làm ở đợt sau.
- Explore hiện tại là chuẩn nội bộ. Ảnh Mindtrip người dùng gửi là tham chiếu cho thanh nhóm, thẻ ảnh Ý tưởng, thẻ địa điểm trong ngày và hàng mở/thu ngày.
- Giữ sidebar GreenTrip, ba tab Ý tưởng / Lịch trình / Lịch và bản đồ bên phải. Không tự đưa lại chat toàn trang, Invite, Share hoặc chức năng Mindtrip mà người dùng đã bỏ.
- Người dùng đã xác nhận phương án và cho phép triển khai, chạy kiểm tra, cập nhật tài liệu bàn giao trong chat hiện tại. Mọi mở rộng phạm vi sau đó vẫn cần căn cứ yêu cầu mới.

## Trạng thái Git

- Nhánh lúc bắt đầu: test/integration-pb09-pb11-pb16, ahead origin 15 commit; working tree sạch.
- Giữ nguyên nhánh/15 commit hiện có để không tách khỏi nền tích hợp. Không checkout develop, không rebase/reset và không sửa lịch sử.
- Thay đổi đợt này chưa commit/push. Đây chưa phải hoàn tất DoD của nhóm: vẫn cần người dùng xem giao diện, quy trình PR/review và CI theo AGENTS.md.

## Giao diện đã triển khai

### Thành phần chung

- plannerStyles.ts chứa thang chữ, nút pill, nút icon, cột nội dung và khung bản đồ dùng chung. Tiêu đề tab/drawer 24px, nhóm con 18px, tên địa điểm 15px, nhãn ít nhất 12px; dùng [PLANNER_TYPOGRAPHY.md](PLANNER_TYPOGRAPHY.md) cho bảng cỡ chữ chuẩn mới nhất.
- Nền trắng, viền neutral mảnh, thẻ bo 16px, ảnh nhỏ bo 12px, bản đồ bo 20px; nút chính đen và xanh dùng tiết chế.
- Desktop từ 1024px: cột trái 54% (tối đa 720px, tối thiểu 460px), bản đồ chiếm phần còn lại. Dưới 1024px: nội dung một cột và ẩn bản đồ; chưa bổ sung nút mở bản đồ mobile.
- Header một hàng từ 1280px; nhỏ hơn dùng hai hàng để tab không đè tên chuyến đi. Tab không xuống dòng, có aria-pressed.
- Sidebar chỉ ẩn dưới 768px khi đang mở chi tiết chuyến đi; các màn Explore/Home/danh sách chuyến đi giữ hành vi hiện có.

### Lịch trình

- Thanh Ý tưởng nền trắng, không khung/nền xám; tiêu đề + số lượng bên trái, bộ lọc thành phố / danh mục + menu bên phải.
- Thẻ ảnh 164x156px trên mobile, 176x168px từ 640px; tên tối đa hai dòng, loại địa điểm bên dưới; nút tim và menu ba chấm độc lập trên ảnh. Tim dùng toggleSaved/savedIds/pendingIds đang có, không tạo nguồn lưu mới.
- Ý tưởng là kho chung: luôn giữ cả địa điểm đã xếp vào ngày. Bộ lọc thành phố và danh mục chỉ lọc cách hiển thị, không xóa hoặc chuyển dữ liệu ra khỏi kho. Không tự đổi thành danh sách Chưa xếp lịch.
- Carousel chỉ hiện mũi tên khi còn nội dung cuộn; có cả hai chiều.
- PlannerPopover.tsx đưa menu chọn ngày và menu điểm dừng ra document.body để không bị clipping bởi carousel/vùng cuộn; giới hạn theo viewport, theo dõi cuộn/resize, đóng bằng click ngoài/Escape.
- Hàng ngày hiển thị thứ/ngày tháng; hỗ trợ ngày bắt đầu kiểu ISO và kiểu chuỗi cũ qua parseStartDateFromTrip. Hàng mở/thu dùng Enter/Space.
- Thẻ điểm dừng ảnh 64px, tên/giờ/địa chỉ phân cấp rõ; đổi thứ tự nằm trong menu, giữ nguyên handlers.
- Hàng nối khoảng cách gọn; nút nghỉ trưa dùng viền trung tính; bộ chọn đường đi ở giữa bản đồ tránh đè nút mắt.

### Ý tưởng

- Giữ danh sách thẻ ngang và dữ liệu chính; bỏ dòng Đã thêm vào chuyến đi lặp lại.
- Badge Xanh dùng icon lá; đồng nhất chữ, ảnh và menu.
- Footer AI / Tạo lịch trình không xuống dòng nhãn ở 320px.

### Lịch

- Tiêu đề/nút/nhãn và màu sự kiện đồng bộ; bỏ sao trang trí.
- Đang tải có thông báo riêng, không hiện trạng thái trống trước khi tải xong.
- Desktop hiển thị nhiều ngày. Dưới 640px hiển thị ngày đang chọn, dùng mũi tên trước/sau; tránh cột sự kiện quá hẹp.
- Hàng giờ 64px, nhãn giờ tối thiểu 12px, sự kiện hiển thị giờ bắt đầu được lưu.

## Các file chính

- frontend/src/components/planner/plannerStyles.ts
- frontend/src/components/planner/PlannerPopover.tsx
- frontend/src/components/planner/usePlannerMapVisible.ts — chỉ mount Leaflet khi viewport từ 1024px, tránh flyTo trên vùng có kích thước 0.
- frontend/src/components/planner/TripHeader.tsx
- frontend/src/components/planner/TripOverviewView.tsx
- frontend/src/components/planner/TripItineraryView.tsx
- frontend/src/components/planner/TripCalendarView.tsx
- frontend/src/pages/ExplorePage.tsx — chỉ điều kiện ẩn sidebar trên mobile trong workspace chuyến đi.

Không đổi service itinerary, backend, package/dependencies hoặc xóa/sửa test invariant.

## Kiểm tra và giới hạn

- TypeScript và build đã chạy qua trong đợt triển khai; bộ 39 test cốt lõi đã chạy qua. Kết quả lượt cuối được bổ sung bên dưới.
- Lint toàn repo có lỗi tồn tại trước đợt này. Đối chiếu từng file sửa với HEAD qua ESLint không thấy lỗi mới; hai file mới không lỗi/cảnh báo. Một lỗi any có sẵn ở bộ lọc đã bỏ khi thay bằng const tuple.
- Đã mở ứng dụng thực tế tại http://127.0.0.1:4173/trips, kiểm tra 1440px, 1280px và 320px. Cổng 5173 bị EACCES trong phiên này; không sửa cấu hình Vite mặc định.
- Kiểm tra trực tiếp trên dữ liệu mẫu: chuyển ba tab, gán hai địa điểm vào ngày, bộ lọc danh mục, menu điểm dừng, đổi thứ tự lên/xuống, trả địa điểm về Ý tưởng, Escape, ngày có hoạt động, lịch mobile và nút ngày trước/sau. Không coi đây là kiểm thử toàn bộ backend/AI hoặc chứng nhận WCAG đầy đủ.
- Khi đổi tab cần đợi tải plan: snapshot tức thời có thể còn dữ liệu khởi tạo. Đã quan sát lịch tải xong và có sự kiện; không kết luận mất dữ liệu chỉ từ trạng thái đang tải.
- Lịch vẫn có thuật toán vị trí sự kiện cũ: nhóm theo giờ, chưa đặt lệch theo phút và còn giới hạn chiều cao. Xử lý ở task logic lịch, không mở rộng âm thầm trong task thiết kế.
- Khoảng cách giữa hai điểm rất gần có thể hiển thị ~0.0 km theo formatter hiện có; cần task nghiệp vụ/định dạng riêng.
- Chưa xác minh đủ luồng chỉnh giờ, ghi chú, AI tự xếp, ngày >7, tất cả modal và xác thực/lưu backend. Không báo các luồng này đã hoàn tất.
- Review người dùng và đồng đội/CI chưa thực hiện; không tự coi task đã được duyệt chỉ vì test/build xanh.

## Quy tắc cho phiên/model AI tiếp theo

1. Đọc AGENTS.md, cập nhật đầu PROJECT_HANDOFF_FOR_CODEX.md và tài liệu này; kiểm tra Git thực tế trước khi sửa.
2. Tiếp tục dùng Explore + ảnh tham chiếu người dùng đã chọn; tránh đổi layout lớn hoặc thêm hiệu ứng chỉ vì có skill.
3. Dùng plannerStyles cho thay đổi chung, không tự tạo bộ nút/chữ khác ở mỗi tab.
4. Kiểm tra trên trình duyệt sau sửa, giữ test invariant và ghi chính xác lệnh đã chạy/kết quả còn lỗi.
5. Khi người dùng duyệt/đổi quyết định hoặc phát hiện vấn đề mới, cập nhật tài liệu này: quyết định, file sửa, bằng chứng, việc chưa làm. Không lưu secret/.env/token vào tài liệu.

## Kết quả kiểm tra cuối đợt

- npm run typecheck: PASS.
- node --test tests/planner-sync-logic.test.mjs tests/itinerary-route-map.test.mjs tests/for-you-and-planner-chat.test.mjs tests/home-dashboard.test.mjs tests/morph-components.test.mjs tests/map-green-interaction.test.mjs: **39/39 PASS**.
- npm run build: PASS; còn cảnh báo bundle >500kB, chưa tối ưu bundle trong task UI.
- ESLint toàn repo: 9 lỗi / 160 cảnh báo; trước thay đổi có 10 lỗi / 160 cảnh báo. Không có lỗi mới qua đối chiếu HEAD cho các file đã sửa. Ba file mới lint sạch.
- Lượt kiểm tra browser cuối trên tab sạch: chuyển desktop/mobile, ba tab và điều hướng ngày; console error log rỗng. Ở 320px, documentWidth=320 và không có Leaflet được mount trong panel ẩn.
- Từng phát hiện Invalid LatLng (NaN, NaN) khi CSS ẩn bản đồ đang chạy animation; đã xử lý bằng usePlannerMapVisible, kiểm tra lại không tái hiện trong lượt nêu trên. Không sửa PoiMap chung/Explore để tránh mở rộng phạm vi.
- Test trên bản xem trước bằng chuyến đi mẫu đầu tiên, đã thử gán hai địa điểm và trả một về Ý tưởng; hiện bản mẫu có một điểm dừng trong Ngày 1. Các thao tác này là dữ liệu xem trước, không nằm trong Git diff.
- Không thay đổi cấu hình/dependencies; không commit, push hoặc mở PR.

## Điều chỉnh sau ảnh Mindtrip thứ hai — 13/11/2026

Người dùng phản hồi lượt trước chưa giống ảnh, và đã chọn rõ phạm vi: **chỉnh UI sát ảnh, giữ thao tác thêm/sửa/xóa hiện có; kéo thả và validation giờ làm sau**.

- Thứ tự: tiêu đề lớn Lịch trình chi tiết → Ý tưởng + thẻ ảnh + nút Thêm → tiêu đề nhóm Lịch trình + số ngày + Khoảng cách/menu → các ngày. Công tắc khoảng cách không nằm cạnh tiêu đề lớn.
- Bỏ nền xám/viền quanh thanh Ý tưởng. Hai dropdown nền trong suốt: Địa điểm (lọc Đà Nẵng/Huế trên dữ liệu có sẵn), Tất cả (lọc danh mục).
- Ý tưởng là kho chung, địa điểm đã gán ngày vẫn có trong carousel. Đây là sửa lại quyết định lượt đầu; không khôi phục bộ lọc tự động loại điểm đã xếp lịch.
- Thêm tim viền trắng trên ảnh, trạng thái đã lưu có tim đỏ; nối vào service Đã lưu hiện tại. Chưa xác minh ghi dữ liệu Đã lưu với tài khoản đăng nhập trong đợt này.
- Ngày trống chỉ có nút Thêm, bỏ dòng Chưa có hoạt động ở cùng hàng; không thêm nút/luồng kéo thả giả.
- Thẻ trong ngày có icon loại địa điểm trước tên. Giữ các handler thêm/sửa/xóa/đổi thứ tự và khung bản đồ GreenTrip.
- Phân tích nghiệp vụ người dùng cung cấp là tham chiếu. Không coi mô tả Google Maps API hoặc kiểm tra giờ mở cửa là tích hợp đã có trong GreenTrip; chưa triển khai các dịch vụ mới đó.
- Không thay đổi Explore, hai tab Ý tưởng/Lịch hoặc backend trong lượt điều chỉnh này; tiếp tục giữ thay đổi đã có của lượt đầu.

### Kiểm tra sau điều chỉnh theo ảnh mới

- TypeScript, build và 39/39 test cốt lõi: PASS.
- ESLint đối chiếu HEAD: không có lỗi mới; TripItineraryView còn một lỗi no-empty có sẵn, cảnh báo giảm từ 12 xuống 11.
- Browser: xác nhận Ý tưởng có đủ ba địa điểm dù Ngày 1 đã chứa một địa điểm; lọc Huế trả trạng thái trống rồi khôi phục Tất cả; mở Ngày 2 trống chỉ có Thêm; mỗi thẻ có tim riêng.
- 320px: documentWidth=320, ba tim trên ba thẻ; desktop 1440px đã lưu ảnh đối chiếu. Console error log rỗng trong lượt kiểm tra.
- Kéo thả và validation giờ được người dùng chốt để làm sau. Chưa commit/push.


## Chốt hệ chữ theo Explore — 13/11/2026

Người dùng phản hồi chữ Planner quá to, ưu tiên cỡ Explore đang có. Đã đưa tiêu đề Lịch trình chi tiết từ 30/34px về 24px; tiêu đề tab Ý tưởng/Lịch từ 24/28px về 24px; nhóm con từ 18/20px về 18px; tên địa điểm/ngày bỏ tăng lên 16px trên desktop, cố định 15px. Drawer Ý tưởng đã lưu từ 28/32px về 24px. Font Inter và vùng bấm giữ nguyên. Chi tiết: [PLANNER_TYPOGRAPHY.md](PLANNER_TYPOGRAPHY.md). Không sửa bố cục, nghiệp vụ hoặc Explore trong lượt này.


## Đính chính phạm vi lưới Ý tưởng — 13/11/2026

Người dùng xác nhận muốn **tab Ý tưởng (TripOverviewView) có danh sách địa điểm thành lưới 3 cột**, dùng card trắng ảnh nhỏ/thông tin như điểm đã xếp trong Lịch trình. Không phải thu nhỏ carousel ảnh trong tab Lịch trình. Đã hoàn tác riêng lần thu carousel cao 128px, khôi phục kích thước trước đó; không hoàn tác typography hay các thay đổi đã duyệt khác. Danh sách tab Ý tưởng dùng 3 cột từ 1024px, 2 từ 640px, 1 dưới 640px; thumbnail 48px, giữ cỡ chữ chuẩn. Menu thẻ dùng portal để không bị khung lưới cắt. Không suy rộng chỉnh dải ảnh Lịch trình khi người dùng nói đến danh sách tab Ý tưởng.


## Chốt mẫu card tab Ý tưởng — 13/11/2026

Người dùng đã xác nhận rõ: tab Ý tưởng dùng **card ảnh lớn, chữ đè trên ảnh như carousel tham chiếu, nhưng xếp lưới 3 cột rồi xuống hàng**. Thay thế mẫu card trắng ảnh nhỏ của lượt đính chính trước. Giữ lưới responsive 3/2/1 cột; ảnh vuông phủ card, gradient tối ở chân, tên 15px tối đa hai dòng và loại địa điểm màu trắng; tim + menu ba chấm ở góc trên. Giữ hành vi chọn điểm/bản đồ, mở bộ sưu tập Đã lưu và menu xem/xóa hiện có. Carousel trong tab Lịch trình giữ nguyên. Đây là mô tả có ưu tiên cao nhất khi phiên sau đọc các quyết định cũ.


## Sửa hàng card chồng nhau — 13/11/2026

Người dùng cung cấp ảnh 7 điểm cho thấy hàng sau đè hàng trước. Không đặt grid trực tiếp trên vùng flex-1/min-h-0 có chiều cao bị giới hạn: hàng auto có thể bị ép ngắn hơn card aspect-square. Đã tách outer scroll viewport khỏi inner grid chiều cao tự nhiên; card w-full, ba cột desktop và gap ngang/dọc 16px. Khi kiểm tra grid phải có ít nhất hai hàng, không chỉ một hàng như trước.
Kiểm tra sau sửa: 7 card ở viewport 1440x735, khoảng cách thực đo giữa cả ba hàng là 16px, không chồng lấn; vùng danh sách cuộn khi không đủ chiều cao. TypeScript và build PASS.


## Khung bản đồ Trip Workspace — 13/11/2026

Quyết định mới nhất: chỉ bỏ padding trên/phải/dưới của wrapper bản đồ, giữ nguyên điểm chia cột và padding nội dung. Cả ba tab dùng plannerStyles.map/mapSurface và tripMapFrame.css. Khung chỉ bo hai góc trái 20px; hai góc phải 0, không border/shadow. Bỏ border-r tại cột nội dung sát bản đồ, giữ border sidebar và lưới giờ. PoiMap nhận clipByParent để tránh lớp bo 22px bên trong; mặc định false nên Explore giữ nguyên. Không đổi logic hoặc header/card/calendar.

Attribution xuống dòng trong map hẹp <=600px; nâng cụm nút dưới và thời tiết lên 64px để không đè attribution. Không sửa handler.

Đối chiếu trước/sau cùng sidebar mở 218px, viewport cao 900px, cả ba tab:

| Rộng | Mép trái trước/sau | Mép trên sau | Mép phải sau | Đáy sau |
| --- | --- | --- | --- | --- |
| 1440 | 877.875 | 64 | 1440 | 900 |
| 1280 | 791.4765625 | 64 | 1280 | 900 |
| 1024 | 678 | 112 | 1024 | 900 |

9/9 trường hợp: dịch ngang 0px, khe trên/phải/dưới 0px, không cuộn ngang, border sát map 0px, radius 20/0/0/20. Attribution đầy đủ. Đã chuyển Ý tưởng → Lịch trình → Lịch tại cả ba viewport và chụp ảnh trước/sau. Typecheck/build và 39/39 test PASS; build có cảnh báo kích thước bundle có sẵn. Chưa kiểm thử lại toàn bộ hành vi từng nút; các handler giữ nguyên. Chưa commit/push.


## F01 / U01 — sửa sau QA Part 1, 13/11/2026

F01: API alias Tâm linh nhận cả "Tâm linh & Tôn giáo" và tên legacy. Chỉ dùng trong POI repository; giữ phạm vi Di tích cũ. Explore bỏ fallback POI mẫu cả khi response rỗng và khi API lỗi; lỗi có Thử lại riêng. Playwright localhost xác nhận tập ID 45 tổng,22 Đà Nẵng,23 Huế,9 trong1km; snapshot482 không đổi.

U01: dấu + nói rõ vào Ý tưởng của chuyến được chọn, thông báo thấy được/có tên chuyến và đợi props chuyến xác nhận cập nhật cả ideas/savedPlaces. Không đổi logic mutation hay bỏ trường savedPlaces. Chùa Báo Quốc (UUID thật) đã thử tim vào kho cá nhân rồi bỏ tim, + vào fixture A/B không bật tim; hủy không đổi, reload đúng Ý tưởng, kho cá nhân khôi phục. Các ca yêu cầu đã Pass trên trình duyệt.

F02/F03 vẫn chưa xử lý: giá tier/chí phí/ngưỡng cần chốt; preview/modal và Explore vẫn có hai quy tắc time-of-day. Không mở Part2, không commit/push. Typecheck/build và39 test frontend Pass. test_pois có4 regression alias mới Pass;2 lỗi limit100/1000 cũ giữ nguyên. Lint9 lỗi cũ không sửa.
