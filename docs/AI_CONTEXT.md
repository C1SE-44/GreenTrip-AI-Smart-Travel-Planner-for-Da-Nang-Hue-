# GreenTrip — điểm vào cho AI

Cập nhật: 2026-11-13. Đây là bản định tuyến ngắn, không thay thế AGENTS.md hoặc code hiện tại.

## Nhận lệnh mới

1. Đọc AGENTS.md và file này. Xem `git status --short`; giữ các thay đổi đang có. Không đọc lại toàn bộ PROJECT_HANDOFF_FOR_CODEX.md mặc định.
2. Chọn đúng hàng trong bảng dưới. Nếu graph có sẵn, truy vấn tên hàm/component bằng Graphify với `--budget 1200` trước; xem lệnh trong AI_TOOLS.md. Không in cả graph.json hoặc GRAPH_REPORT.md vào hội thoại.
3. Đọc đúng hàm cần sửa, callers, kiểu dữ liệu và test liên quan. Graph chỉ dẫn đường; nguồn thật vẫn là code/API. Nếu graph thiếu hoặc cũ, dùng `rg` có phạm vi và cập nhật chỉ mục khi cần.
4. Áp dụng Ponytail full: thay đổi nhỏ nhất giải quyết đủ yêu cầu, dùng lại thành phần hiện có; không mở rộng nghiệp vụ. Chỉ hỏi khi thiếu quyết định chặn công việc, không hỏi lại điều đã chốt.
5. Kiểm thử đúng phần thay đổi. Ghi rõ quan sát thật, suy luận từ code, và chưa kiểm. Cập nhật AI_ROADMAP.md khi trạng thái/owner/quyết định đổi; cập nhật chỉ mục sau khi sửa code.

## Định tuyến theo yêu cầu

Các đường dẫn dưới đây tính từ root repo.

| Yêu cầu | Điểm vào cần đọc | Theo tiếp khi cần |
|---|---|---|
| Explore, khu vực, danh mục, tìm kiếm | frontend/src/pages/ExplorePage.tsx | services/poi.ts → data/pois.ts; backend/app/pois/router.py → service.py → repository.py |
| Bộ lọc, giá, giờ, xanh, khoảng cách | frontend/src/components/poi/ExploreFilterModal.tsx + ExplorePage.tsx | backend/app/pois/{schemas,repository,weights}.py; owner Nguyên; F02/F03 chưa xử lý |
| ♥ / Đã lưu cá nhân | frontend/src/context/SavedPlacesContext.tsx | components/saved/; services/savedPlaces.ts → backend/app/saved_places/ |
| + / chọn chuyến / thêm Ý tưởng | frontend/src/components/planner/AddToTripModal.tsx + ExplorePage.tsx | TripOverviewView.tsx; services/tripService.ts; kiểm nơi lưu thật trước khi suy luận từ tên trường |
| UI Ý tưởng | frontend/src/components/planner/TripOverviewView.tsx | docs/PLANNER_UI_HANDOFF.md; docs/PLANNER_TYPOGRAPHY.md |
| UI Lịch trình / Lịch | frontend/src/components/planner/TripItineraryView.tsx / TripCalendarView.tsx | TripHeader.tsx, plannerStyles.ts, PlannerPopover.tsx |
| Khung bản đồ 3 tab | frontend/src/components/planner/tripMapFrame.css | components/poi/PoiMap.tsx; planner/usePlannerMapVisible.ts |
| Camera hover Explore / marker ngữ cảnh | frontend/src/components/poi/ExploreMapCamera.tsx | PoiMap.tsx (cấu hình tùy chọn); ExplorePage.tsx (filteredPois đầy đủ). Planner dùng luồng cũ. |
| Đăng nhập, token, API base | frontend/src/services/auth.ts; frontend/src/lib/api.ts | backend/app/auth/; backend/app/config.py; không in .env hoặc token |
| API chuyến / lịch trình | frontend/src/services/tripService.ts / itineraryService.ts | backend/app/trips/ / itineraries/; backend/app/db/ |
| Ngày đã lưu, linh hoạt, tăng/giảm ngày, chặn giờ quá khứ | frontend/src/utils/tripDates.ts; services/itineraryService.ts | backend/app/trips/schedule_validation.py; docs/QA_POST_MERGE_2026-11-13.md; giữ hoạt động lịch sử không đổi |
| AI / đề xuất | frontend/src/services/recommendations.ts / copilotService.ts | backend/app/recommendations/; cần phạm vi riêng, chưa coi là đã QA |

## Những điều đã chốt

- Frontend localhost:5173, backend :8000. Lần QA Part 1 dùng Supabase **dev** do người dùng xác nhận; không suy ra môi trường mới cũng là dev. Kiểm cấu hình đang chạy trước ca ghi.
- Ưu tiên UI theo Explore/Mindtrip nhưng giữ layout GreenTrip. Cỡ chữ theo PLANNER_TYPOGRAPHY.md; Ý tưởng là lưới ảnh 3 cột, responsive 3/2/1, các hàng tách nhau.
- Khung bản đồ: giữ mép trái/điểm chia cột; chạm trên/phải/dưới; chỉ bo hai góc trái 20px; không đường dọc sát bản đồ. Không đổi tỷ lệ cột.
- ♥ lưu cá nhân; + thêm vào Ý tưởng của chuyến đã chọn. `trip.savedPlaces` không đồng nghĩa kho ♥; không xóa trường này chỉ vì tên.
- F01/U01 đã sửa và QA localhost ở lượt trước. F02/F03 giao Nguyên; chưa tự sửa/gộp/xóa bộ lọc.
- Đã được giao và kiểm 5 nhóm sau merge về Ý tưởng/ngày/giờ/Lịch; xem QA_POST_MERGE_2026-11-13.md. Ngoài 5 nhóm này, không tự mở rộng kéo thả, tạo lịch trình hay AI; không commit/push khi chưa được yêu cầu.

Đọc tiếp **AI_ROADMAP.md** cho backlog; **AI_TOOLS.md** cho công cụ; chỉ đọc bàn giao dài khi task thực sự cần lịch sử.
