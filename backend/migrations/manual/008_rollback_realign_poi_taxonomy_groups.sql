-- Rollback 008: Revert POI Taxonomy Groups and Sub-categories to Pre-008 State
-- 1. Revert category rename
-- 2. Revert 15 urban landmarks back to 'Di tích lịch sử và văn hóa' with sub_category 'iconic_urban_landmarks'
-- 3. Revert 9 memorials back to sub_category 'iconic_urban_landmarks'
-- 4. Revert 8 markets back to 'Di tích lịch sử và văn hóa' with sub_category 'historic_markets' and Chợ Cồn to 'street_food'

-- 1. Revert Category Name
UPDATE public.poi_categories
SET name = 'Tâm linh và chùa thiền'
WHERE name = 'Tâm linh & Tôn giáo';

-- 2. Revert 15 urban landmarks back to 'Di tích lịch sử và văn hóa' ('54da4319-c68b-4e42-a488-8ccdfba2b71c')
UPDATE public.pois
SET 
    category_id = '54da4319-c68b-4e42-a488-8ccdfba2b71c',
    sub_category = 'iconic_urban_landmarks'
WHERE poi_id IN (
    'c1c1adc2-06f8-4723-a58d-4aee6fee4be1',
    '57b27cb9-142f-4392-8f30-2503fb1dd271',
    '1a381740-7699-422d-987b-e1cd976279b1',
    '93f9fa97-d463-4f8c-8081-61a20a542587',
    'a1933d01-9704-42bf-9578-90e3a6339a79',
    'fe58f5d9-5c04-4fbd-b020-f61904bee4c0',
    '90829107-fdec-47ad-8041-e4a62c6608d3',
    'e39d129b-47f8-459c-8f63-7965038c942c',
    '0f6988f3-d44f-4267-8154-25100e5546ca',
    'b954f42b-87b5-469f-8666-584f413e2f74',
    '0cfac146-7836-4ae9-b8dc-4baf89cdbdcb',
    'b257c9f1-2528-4100-8b5f-e92f3e88af69',
    'f84a8003-e2ba-4306-b224-63a1b4788974',
    '3ddcaa90-fec1-4174-9828-a32282d810cc',
    'c491d686-ea8b-4d9b-978d-78bc74595716'
);

-- 3. Revert 9 memorials back to sub_category 'iconic_urban_landmarks'
UPDATE public.pois
SET sub_category = 'iconic_urban_landmarks'
WHERE poi_id IN (
    '45f306b5-a76e-4057-920a-5c4dd6f79a0c',
    '7d7e8e07-1375-44dc-baca-48b7f76bd584',
    '9d65f0d2-a26f-4daa-8408-4e057718540f',
    'a6f9a1cf-1f37-4c7d-93ac-632e50a7861f',
    '167e8b00-e054-4ab6-a7dc-7796245ceb90',
    '7a584003-b2af-4e49-b7d5-df2b1aca0716',
    '6059f296-2e67-40d7-9f6a-dd12d4ce82dd',
    '96ddfc87-76f7-467a-8495-221bd0eb0217',
    '4d215843-0fd9-49b0-89f0-d9b1d16059bb'
);

-- 4. Revert 8 markets back to 'Di tích lịch sử và văn hóa' with 'historic_markets'
UPDATE public.pois
SET 
    category_id = '54da4319-c68b-4e42-a488-8ccdfba2b71c',
    sub_category = 'historic_markets'
WHERE poi_id IN (
    'd8eebc5a-bf76-4984-bd97-3007634bfa2f',
    '9ac7bc87-7838-4708-81cf-2cfdc9250746',
    '2538a95e-a73b-4a06-84bd-17b60e1b40e3',
    '1307f7bb-8e68-4ed0-96e6-bbd270a7e2ca',
    '7e2e85a5-2a92-4d3c-af5d-f777a40e185f',
    '96098ec7-5296-46d4-be46-9d9b824c30f3',
    '177df420-aec0-4eca-8443-b373893bf6fe',
    'd2cd21e2-801b-4d3b-8aeb-172f19d65146'
);

-- Revert Chợ Cồn to 'street_food'
UPDATE public.pois
SET sub_category = 'street_food'
WHERE poi_id = '20dbadbe-372a-4238-99ce-537e9bf8f5c7';
