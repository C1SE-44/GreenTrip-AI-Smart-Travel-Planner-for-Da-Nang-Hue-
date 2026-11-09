-- Migration 008: Realign POI Taxonomy Groups and Sub-categories
-- 1. Rename 'Tâm linh và chùa thiền' -> 'Tâm linh & Tôn giáo'
-- 2. Move 15 urban landmarks/bridges from 'Di tích' to 'Cảnh quan và thiên nhiên' with sub_category 'urban_landmarks'
-- 3. Reassign 9 memorials/cemeteries to sub_category 'historic_memorials' in 'Di tích'
-- 4. Move 8 markets from 'Di tích' to 'Ẩm thực và quán ăn' + align Chợ Cồn with sub_category 'traditional_night_markets'

-- 1. Rename Category
UPDATE public.poi_categories
SET name = 'Tâm linh & Tôn giáo'
WHERE name = 'Tâm linh và chùa thiền';

-- 2. Move 15 iconic urban landmarks & bridges to 'Cảnh quan và thiên nhiên'
UPDATE public.pois
SET 
    category_id = '5615f7b6-ec5a-4cc5-9171-af200a866b96',
    sub_category = 'urban_landmarks'
WHERE poi_id IN (
    'c1c1adc2-06f8-4723-a58d-4aee6fee4be1', -- Cầu Dã Viên & Cồn Dã Viên
    '57b27cb9-142f-4392-8f30-2503fb1dd271', -- Cầu Đi Bộ Gỗ Lim Sông Hương
    '1a381740-7699-422d-987b-e1cd976279b1', -- Cầu Nguyễn Hoàng
    '93f9fa97-d463-4f8c-8081-61a20a542587', -- Cầu Rồng
    'a1933d01-9704-42bf-9578-90e3a6339a79', -- Cầu Sông Hàn
    'fe58f5d9-5c04-4fbd-b020-f61904bee4c0', -- Cầu Thuận Phước
    '90829107-fdec-47ad-8041-e4a62c6608d3', -- Cầu Tình Yêu & Tượng Cá Chép Hóa Rồng
    'e39d129b-47f8-459c-8f63-7965038c942c', -- Cầu Trần Thị Lý & Cầu Đi Bộ Nguyễn Văn Trỗi
    '0f6988f3-d44f-4267-8154-25100e5546ca', -- Cầu Trường Tiền
    'b954f42b-87b5-469f-8666-584f413e2f74', -- Công Viên APEC
    '0cfac146-7836-4ae9-b8dc-4baf89cdbdcb', -- Cung Thể Thao Tiên Sơn
    'b257c9f1-2528-4100-8b5f-e92f3e88af69', -- Ga Huế
    'f84a8003-e2ba-4306-b224-63a1b4788974', -- Khu phố du lịch Hà Bổng
    '3ddcaa90-fec1-4174-9828-a32282d810cc', -- Tổ Hợp Da Nang Downtown
    'c491d686-ea8b-4d9b-978d-78bc74595716'  -- Trung Tâm Hành Chính Đà Nẵng
);

-- 3. Reassign 9 memorials/cemeteries in 'Di tích lịch sử và văn hóa' to sub_category 'historic_memorials'
UPDATE public.pois
SET sub_category = 'historic_memorials'
WHERE poi_id IN (
    '45f306b5-a76e-4057-920a-5c4dd6f79a0c', -- Đài Tưởng Niệm & Quảng Trường 2/9
    '7d7e8e07-1375-44dc-baca-48b7f76bd584', -- Nghĩa Trũng Phước Ninh
    '9d65f0d2-a26f-4daa-8408-4e057718540f', -- Căn Cứ Cách Mạng K20
    'a6f9a1cf-1f37-4c7d-93ac-632e50a7861f', -- Nghĩa Trang Y Pha Nho
    '167e8b00-e054-4ab6-a7dc-7796245ceb90', -- Thành Điện Hải
    '7a584003-b2af-4e49-b7d5-df2b1aca0716', -- Nghĩa Trũng Hòa Vang
    '6059f296-2e67-40d7-9f6a-dd12d4ce82dd', -- Nhà Lưu Niệm Bác Hồ & Chín Hầm
    '96ddfc87-76f7-467a-8495-221bd0eb0217', -- Trường Quốc Học & Bia Quốc Học
    '4d215843-0fd9-49b0-89f0-d9b1d16059bb'  -- Nhà Cổ Tích Thiện Đường
);

-- 4. Move 9 markets to 'Ẩm thực và quán ăn' with sub_category 'traditional_night_markets'
UPDATE public.pois
SET 
    category_id = 'addc2e2e-69b6-4811-984d-8f88b50cd333',
    sub_category = 'traditional_night_markets'
WHERE poi_id IN (
    'd8eebc5a-bf76-4984-bd97-3007634bfa2f', -- Chợ An Cựu
    '9ac7bc87-7838-4708-81cf-2cfdc9250746', -- Chợ Bắc Mỹ An
    '2538a95e-a73b-4a06-84bd-17b60e1b40e3', -- Chợ Bến Ngự
    '1307f7bb-8e68-4ed0-96e6-bbd270a7e2ca', -- Chợ Đêm Helio
    '7e2e85a5-2a92-4d3c-af5d-f777a40e185f', -- Chợ Đêm Sơn Trà
    '96098ec7-5296-46d4-be46-9d9b824c30f3', -- Chợ Đông Ba
    '177df420-aec0-4eca-8443-b373893bf6fe', -- Chợ Hàn
    'd2cd21e2-801b-4d3b-8aeb-172f19d65146', -- Chợ Tây Lộc
    '20dbadbe-372a-4238-99ce-537e9bf8f5c7'  -- Khu Ẩm Thực Chợ Cồn
);
