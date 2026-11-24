# Kiểm kê và mở rộng POI Huế từ OpenStreetMap

Ngày tạo bộ ứng viên: 2026-11-23
Nguồn đầu vào: `hue_overpass_export_2026-11-15.json`
Mốc dữ liệu OSM: `2026-11-15T15:08:18Z`
Giấy phép nguồn: ODbL-1.0; giữ liên kết từng đối tượng OSM trong CSV.

## Kết quả

- Export có 1224 đối tượng tổng cộng.
- Dùng 1224 đối tượng có tên và tọa độ từ tập kết quả area Huế. Ảnh truy vấn cho thấy nguồn là `{geocodeArea:Huế, Việt Nam}`; JSON export không lưu lại câu truy vấn, nên cần giữ liên kết từng đối tượng để rà lại ranh giới khi cần.
- Hộp tọa độ quan sát được trong export: 16.06659°–16.69479°B, 107.17381°–108.13129°Đ. Đây là phạm vi bao dữ liệu, không khẳng định ranh giới hành chính.
- 1022 đối tượng được taxonomy hiện tại ánh xạ vào 5 nhóm POI.
- 793 đối tượng đã có OSM ID trong raw hoặc `pois.csv`; bỏ qua khi tạo dữ liệu tăng thêm.
- 400 POI theo OSM ID còn mới trước rà trùng; 3 bản ghi tên giống và cách POI hiện tại dưới 100m được tách vào file rà thủ công.
- 397 POI còn lại sau chuẩn hóa và loại trùng nội bộ theo quy tắc formatter hiện tại; formatter loại thêm 0 bản ghi trùng tên/toạ độ trong tập mới.

### Phân bổ nhóm trong bộ ứng viên

- Cảnh quan và thiên nhiên: 24
- Di tích lịch sử và văn hóa: 12
- Quán cafe giải khát: 18
- Tâm linh và chùa thiền: 248
- Ẩm thực và quán ăn: 95

### Độ phủ dữ liệu trong bộ ứng viên

- Có tên tiếng Việt: 26/397 (6.5%)
- Có tên tiếng Anh: 57/397 (14.4%)
- Có mô tả: 63/397 (15.9%)
- Có địa chỉ: 51/397 (12.8%)
- Có điện thoại: 18/397 (4.5%)
- Có website: 9/397 (2.3%)
- Có liên kết liên hệ (web/email/điện thoại): 24/397 (6.0%)
- Có giờ mở cửa: 21/397 (5.3%)
- Có thông tin ẩm thực: 49/397 (12.3%)
- Có ảnh URL: 0/397 (0.0%)
- Có tham chiếu ảnh: 0/397 (0.0%)
- Có Wikidata ID: 12/397 (3.0%)

## Cơ sở lưu trú

- Có 203 đối tượng OSM gắn tourism là hotel/guest_house/hostel/motel/resort/apartment/camp_site/chalet/alpine_hut trong tập area.
- 171 bản ghi đã có OSM ID trong raw/CSV hiện tại; 32 bản ghi là mới theo OSM ID.
- 52/203 có ít nhất một website, điện thoại hoặc email được gắn trong OSM.
- Cột `accommodation_type` giữ nguyên loại OSM. `guest_house` không tự động được khẳng định là homestay; `homestay_in_name` chỉ đánh dấu tên có chữ “homestay”.
- Các bản ghi này được xuất riêng vì taxonomy/database hiện có 5 nhóm, chưa có nhóm lưu trú. Chưa nhập chúng vào POI đang phục vụ Explore.

## Ảnh, giá và đánh giá

- Export này không có tag `image` hoặc `wikimedia_commons` cho các POI, nên `image_url` để trống. `wikidata_id` và `image_reference` được giữ lại nếu nguồn có để làm bước tra ảnh sau.
- Nguồn không cung cấp giá, điểm đánh giá hay thời lượng tham quan đáng tin cậy; các trường đó vẫn để trống, không suy đoán.
- Điện thoại/website là dữ liệu cộng đồng OSM tại thời điểm export; cần kiểm tra lại trước khi hiển thị như thông tin liên hệ đã xác minh.

## Giới hạn trước khi nhập DB

- Các CSV là **bộ ứng viên để review**, không phải tệp nạp thẳng Supabase. Importer cũ yêu cầu header khớp tuyệt đối nên sẽ từ chối CSV có các cột kiểm kê bổ sung này; ngoài ra nó không lưu OSM ID/liên hệ vào bảng và từ chối chạy khi bảng đã có POI. Cần migration cột nguồn/liên hệ và một luồng upsert theo `(osm_type, osm_id)` trước khi nhập thật.
- Không có thao tác ghi database trong bước này.
- Không có thay đổi taxonomy/UI cho nhóm lưu trú trong bước này.

## Tệp tạo ra

- POI theo taxonomy hiện có: `data/processed/hue_poi_candidates.csv`
- Bản ghi cần rà trùng: `data/processed/hue_poi_duplicate_review.csv`
- Cơ sở lưu trú chờ quyết định taxonomy: `data/processed/hue_lodging_candidates.csv`
