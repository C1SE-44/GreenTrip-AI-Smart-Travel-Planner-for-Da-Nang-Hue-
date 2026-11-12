import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const readFile = (relPath) => fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');

// Load pois.ts
import { pois, normalizePoi, cleanPoiName, getSpecificPoiIconClass, isCuratedHighlight } from '../src/data/pois.ts';

test('Data Standardization: Every POI has explicit isGreen boolean', () => {
  assert.ok(pois.length >= 15, 'Should have at least 15 default POIs');
  
  for (const p of pois) {
    assert.strictEqual(typeof p.isGreen, 'boolean', `POI ${p.id} must have a boolean isGreen property`);
  }

  // Check specific eco classifications
  const greenMap = new Map(pois.map(p => [p.id, p.isGreen]));
  assert.strictEqual(greenMap.get('my-khe'), true, 'My Khe beach should be isGreen = true');
  assert.strictEqual(greenMap.get('linh-ung-son-tra'), true, 'Son Tra / Linh Ung should be isGreen = true');
  assert.strictEqual(greenMap.get('ngu-hanh-son'), true, 'Ngu Hanh Son nature should be isGreen = true');
  assert.strictEqual(greenMap.get('cau-rong'), true, 'Cau Rong walking promenade should be isGreen = true');
  assert.strictEqual(greenMap.get('madame-lan'), true, 'Madame Lan eco garden should be isGreen = true');
  assert.strictEqual(greenMap.get('dai-noi'), true, 'Hue Imperial Citadel UNESCO heritage should be isGreen = true');
  assert.strictEqual(greenMap.get('thien-mu'), true, 'Thien Mu Pagoda should be isGreen = true');

  assert.strictEqual(greenMap.get('ba-na-hills'), false, 'Ba Na Hills artificial theme park should be isGreen = false');
  assert.strictEqual(greenMap.get('cho-han'), false, 'Cho Han indoor retail market should be isGreen = false');
  assert.strictEqual(greenMap.get('mi-quang'), false, 'Mi Quang 1A commercial eatery should be isGreen = false');
  assert.strictEqual(greenMap.get('cho-dong-ba'), false, 'Cho Dong Ba commercial market should be isGreen = false');
});

test('normalizePoi accurately infers isGreen from backend payload', () => {
  const greenBackend = normalizePoi({
    id: 101,
    name: 'Khu du lịch sinh thái Tiên Sa',
    category: 'canh-quan',
    city: 'Đà Nẵng',
    latitude: 16.12,
    longitude: 108.23,
    green_score: 0.88,
  });
  assert.ok(greenBackend);
  assert.strictEqual(greenBackend.isGreen, true);

  const nonGreenBackend = normalizePoi({
    id: 102,
    name: 'Trung tâm thương mại Vincom',
    category: 'di-tich',
    city: 'Đà Nẵng',
    latitude: 16.07,
    longitude: 108.22,
    green_score: 0.45,
  });
  assert.ok(nonGreenBackend);
  assert.strictEqual(nonGreenBackend.isGreen, false);
});

test('PoiMap camera physics & initial center configuration', () => {
  const mapCode = readFile('src/components/poi/PoiMap.tsx');

  // Verify initial center is Da Nang central core [16.0680, 108.2220] with zoom 13.5
  assert.ok(mapCode.includes('16.0680'), 'MapContainer must center on Da Nang core latitude 16.0680');
  assert.ok(mapCode.includes('108.2220'), 'MapContainer must center on Da Nang core longitude 108.2220');
  assert.ok(mapCode.includes('zoom={13.5}'), 'Initial zoom must be 13.5 to show city center comfortably');

  // Verify smooth flyTo / panTo parameters
  assert.ok(mapCode.includes('flyTo'), 'Must use flyTo for smooth camera reveal when outside viewport');
  assert.ok(mapCode.includes('duration: 0.75'), 'Must use smooth 0.75s animation duration');
  assert.ok(mapCode.includes('flyToBounds'), 'Must restore overview smoothly when deselecting');

  // Verify smart decluttering threshold
  assert.ok(mapCode.includes('boxesOverlap'), 'Must use cartographic bounding-box collision detection');
  assert.ok(mapCode.includes('currentZoom >= 12.0'), 'Must show prominent and outer labels starting from zoom >= 12.0 to match Mindtrip');
});

test('Debounced hover handlers exist in ExplorePage & TripOverviewView', () => {
  const exploreCode = readFile('src/pages/ExplorePage.tsx');
  assert.ok(exploreCode.includes('handleDebouncedHover'), 'ExplorePage must have handleDebouncedHover');
  assert.ok(exploreCode.includes('180'), 'ExplorePage must debounce hover by 180ms');

  const plannerCode = readFile('src/components/planner/TripOverviewView.tsx');
  assert.ok(plannerCode.includes('handleDebouncedHover'), 'TripOverviewView must have handleDebouncedHover');
  assert.ok(plannerCode.includes('180'), 'TripOverviewView must debounce hover by 180ms');
});

test('UI badges use "Địa điểm xanh" without artificial numerical scores', () => {
  const cardCode = readFile('src/components/poi/PoiCard.tsx');
  assert.ok(cardCode.includes('Địa điểm xanh'), 'PoiCard must show "Địa điểm xanh" badge');
  assert.ok(!cardCode.includes('Điểm Xanh</span>'), 'PoiCard must not show numeric score suffix');

  const exploreCode = readFile('src/pages/ExplorePage.tsx');
  assert.ok(exploreCode.includes('Địa điểm xanh'), 'ExplorePage must show "Địa điểm xanh" badge');

  const plannerCode = readFile('src/components/planner/TripOverviewView.tsx');
  assert.ok(plannerCode.includes('Địa điểm xanh'), 'TripOverviewView must show "Địa điểm xanh" badge');
});

test('City-Aware Camera Focus: Displays Hue and Da Nang large and detailed (zoom 13.5) respectively', () => {
  const mapCode = readFile('src/components/poi/PoiMap.tsx');

  // Verify city hub distinction (Đà Nẵng vs Huế)
  assert.ok(mapCode.includes('isHueTarget'), 'Must distinguish Hue vs Da Nang destination');
  assert.ok(mapCode.includes('isSameCity'), 'Must identify whether camera is already at the target city');

  // Verify transition to target city at detailed zoom without shrinking to 100km
  assert.ok(mapCode.includes('map.flyTo([target.lat, target.lng], 13.5'), 'Must fly to target city at zoom 13.5 to show full details');

  // Verify floating return button
  assert.ok(mapCode.includes('handleReturnToCenter'), 'Must have handleReturnToCenter for easy one-click navigation');
  assert.ok(mapCode.includes('Về Đà Nẵng'), 'Must have button to return to Da Nang from Hue');
});

test('Green POI turns emerald green on hover instead of generic black', () => {
  const mapCode = readFile('src/components/poi/PoiMap.tsx');
  assert.ok(mapCode.includes('bg-emerald-600 text-white'), 'Hovered green POI pin must turn emerald green (bg-emerald-600)');
  assert.ok(mapCode.includes('border-emerald-500'), 'Hovered green POI label must have emerald border');
});

test('cleanPoiName streamlines long names and slogans for map pins', () => {

  assert.strictEqual(
    cleanPoiName('2AM Coffee – Không Gian Học Tập & Làm Việc Tối Giản'),
    '2AM Coffee'
  );
  assert.strictEqual(
    cleanPoiName('5AM Coffee – Workspace 24/7'),
    '5AM Coffee'
  );
  assert.strictEqual(
    cleanPoiName('Bia Tô Lão Đại 2 – Chuyên Hải Sản Tươi Sống Ven Biển'),
    'Bia Tô Lão Đại 2'
  );
  assert.strictEqual(
    cleanPoiName('Bông Food & Drink – Thương Hiệu Trà Sữa Chuẩn Vị'),
    'Bông Food & Drink'
  );
  assert.strictEqual(
    cleanPoiName('Bún Chả Cá 109 Nguyễn Chí Thanh - Đặc Sản Đà Nẵng'),
    'Bún Chả Cá 109'
  );
  assert.strictEqual(
    cleanPoiName('Bảo Tàng Điêu Khắc Chăm Đà Nẵng'),
    'Bảo Tàng Điêu Khắc Chăm'
  );
  assert.strictEqual(
    cleanPoiName('Bảo Tàng Hồ Chí Minh – Chi Nhánh Quân Khu 5'),
    'Bảo Tàng Hồ Chí Minh'
  );
  assert.strictEqual(
    cleanPoiName('Bánh Xèo Bà Dưỡng (Đạt chuẩn MICHELIN Selected)'),
    'Bánh Xèo Bà Dưỡng'
  );
  assert.strictEqual(
    cleanPoiName('Danh Thắng Quốc Gia Đặc Biệt Ngũ Hành Sơn'),
    'Ngũ Hành Sơn'
  );
  assert.strictEqual(
    cleanPoiName('Công Viên Suối Khoáng Nóng Núi Thần Tài'),
    'Núi Thần Tài'
  );
});

test('PoiMap Anti-Siamese Rule: Prevents dual-headed labels on co-located pins', () => {
  const mapCode = readFile('src/components/poi/PoiMap.tsx');

  // Verify anti-split distance check exists
  assert.ok(
    mapCode.includes('isTooCloseToAcceptedPin'),
    'Must have isTooCloseToAcceptedPin check to prevent dual labels emerging from same pin'
  );

  // Verify micro-offsets separation for identical coordinates
  assert.ok(
    mapCode.includes('microOffsets'),
    'Must compute microOffsets so co-located pins do not stack exactly on top of each other'
  );
});

test('getSpecificPoiIconClass assigns rich, accurate, dedicated Phosphor icons without generic fallback', () => {
  // 1. Citadels & Ramparts
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Thành Điện Hải', category: 'di-tich' }),
    'ph-bold ph-castle-turret',
    'Thành Điện Hải should show castle turret'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Đại Nội Huế (Hoàng Thành)', category: 'di-tich' }),
    'ph-bold ph-castle-turret'
  );

  // 2. Museums & Galleries
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Bảo Tàng Hồ Chí Minh – Chi Nhánh Quân Khu 5', category: 'di-tich' }),
    'ph-bold ph-bank',
    'Bảo Tàng Hồ Chí Minh must show museum column icon (ph-bank), NOT water waves (ph-waves)'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Bảo Tàng Đà Nẵng', category: 'di-tich' }),
    'ph-bold ph-bank',
    'Bảo Tàng Đà Nẵng should show bank/museum columns'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Bảo Tàng Điêu Khắc Chăm', category: 'di-tich' }),
    'ph-bold ph-bank'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Bảo Tàng Mỹ Thuật Đà Nẵng', category: 'di-tich' }),
    'ph-bold ph-palette',
    'Art Museum should show painter palette'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Bảo Tàng Tranh 3D Art In Paradise', category: 'di-tich' }),
    'ph-bold ph-palette'
  );

  // 3. Shows & Theaters
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Show Diễn Hồn Việt - Tuồng Nguyễn Hiển Dĩnh', category: 'di-tich' }),
    'ph-bold ph-mask-happy',
    'Traditional theater/tuồng show should show happy mask'
  );

  // 4. Monuments & Memorials
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Nghĩa Trũng Phước Ninh', category: 'di-tich' }),
    'ph-bold ph-scroll',
    'Historical memorial/relic should show scroll'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Khu Căn Cứ Cách Mạng K20', category: 'di-tich' }),
    'ph-bold ph-scroll'
  );

  // 5. Churches
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Nhà Thờ Chính Tòa Đà Nẵng (Nhà Thờ Con Gà)', category: 'chua' }),
    'ph-bold ph-church',
    'Church should show church icon'
  );

  // 6. Markets & Commercial
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Chợ Hàn', category: 'quan-an' }),
    'ph-bold ph-storefront'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Chợ Cồn', category: 'quan-an' }),
    'ph-bold ph-storefront'
  );

  // 7. Craft Villages
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Làng Đá Mỹ Nghệ Non Nước', category: 'di-tich' }),
    'ph-bold ph-hammer'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Làng Hương Thủy Xuân', category: 'di-tich' }),
    'ph-bold ph-hammer'
  );

  // 8. Food & Dining Variety
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Hải Sản Năm Đảnh', category: 'quan-an' }),
    'ph-bold ph-fish'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Ốc Hút Đĩa Bay Cô Ta', category: 'quan-an' }),
    'ph-bold ph-fish'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: '7 Bridges Brewing Company', category: 'quan-an' }),
    'ph-bold ph-beer-stein'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Pizza 4P\'s Hoàng Văn Thụ', category: 'quan-an' }),
    'ph-bold ph-pizza'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Quán Chay Mộc', category: 'quan-an' }),
    'ph-bold ph-leaf'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Bún Chả Cá 109 Nguyễn Chí Thanh', category: 'quan-an' }),
    'ph-bold ph-bowl-food'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Bê Thui Cầu Mống Huynh Đệ', category: 'quan-an' }),
    'ph-bold ph-fork-knife'
  );

  // 9. Nature & Parks
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Công Viên APEC', category: 'canh-quan' }),
    'ph-bold ph-tree'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Suối Hoa', category: 'canh-quan' }),
    'ph-bold ph-waves'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Vịnh Lăng Cô', category: 'canh-quan' }),
    'ph-bold ph-umbrella',
    'Vịnh Lăng Cô should show beach umbrella, NOT castle turret'
  );
  assert.strictEqual(
    getSpecificPoiIconClass({ name: 'Trường Quốc Học Huế & Đài Tưởng Niệm Chiến Sĩ Trận Vong (Bia Quốc Học)', category: 'di-tich' }),
    'ph-bold ph-scroll',
    'Bia Quốc Học should show historical scroll, NOT beer or fish'
  );
});

test('ExplorePage & TripOverviewView fetch all POIs via getAllPois (ensuring Cầu Rồng is loaded on both)', () => {
  const exploreCode = readFile('src/pages/ExplorePage.tsx');
  assert.ok(exploreCode.includes('getAllPois'), 'ExplorePage must use getAllPois to load full catalog');

  const plannerCode = readFile('src/components/planner/TripOverviewView.tsx');
  assert.ok(plannerCode.includes('getAllPois'), 'TripOverviewView must use getAllPois to load full catalog');

  const poiServiceCode = readFile('src/services/poi.ts');
  assert.ok(poiServiceCode.includes('export async function getAllPois'), 'poi.ts must export getAllPois');
});

test('Smart Map LOD & Curated Density Architecture (Mindtrip Style)', () => {
  // 1. Verify isCuratedHighlight logic
  assert.strictEqual(
    isCuratedHighlight({ name: 'Cầu Rồng', isGreen: true, category: 'di-tich', id: '1' }),
    true,
    'Cầu Rồng must be a curated highlight'
  );
  assert.strictEqual(
    isCuratedHighlight({ name: 'Bà Nà Hills', isGreen: false, category: 'canh-quan', id: '2' }),
    true,
    'Bà Nà Hills must be a curated highlight'
  );
  assert.strictEqual(
    isCuratedHighlight({ name: 'Bãi Biển Mỹ Khê', isGreen: true, category: 'canh-quan', id: '3' }),
    true,
    'Bãi Biển Mỹ Khê must be a curated highlight'
  );
  assert.strictEqual(
    isCuratedHighlight({ name: 'Quán cơm bình dân vỉa hè 123', isGreen: false, category: 'quan-an', id: '4' }),
    false,
    'Random local stall without green or iconic keyword should not be an overview highlight'
  );

  // 2. Verify Map Level-of-Detail & Must-Try Viewport Selection (<= 20 markers)
  const mapCode = readFile('src/components/poi/PoiMap.tsx');
  assert.ok(
    mapCode.includes('visiblePois'),
    'PoiMap must calculate visiblePois to avoid rendering 482 markers all at once'
  );
  assert.ok(
    mapCode.includes('isCuratedHighlight'),
    'PoiMap must use isCuratedHighlight for Must-Try weighting'
  );
  assert.ok(
    mapCode.includes('selectMustTryViewportPois'),
    'PoiMap must use selectMustTryViewportPois to limit visible markers to <= 20'
  );
  assert.ok(
    mapCode.includes('gt-marker-bounce'),
    'PoiMap must apply gt-marker-bounce entrance animation'
  );

  // 3. Verify ExplorePage Curated Sections & "Xem thêm" architecture
  const exploreCode = readFile('src/pages/ExplorePage.tsx');
  assert.ok(
    exploreCode.includes('isCuratedOverview'),
    'ExplorePage must determine isCuratedOverview mode'
  );
  assert.ok(
    exploreCode.includes('curatedSections'),
    'ExplorePage must assemble curatedSections for the 4 categories'
  );
  assert.ok(
    exploreCode.includes('Xem thêm'),
    'ExplorePage must render "Xem thêm" buttons for sections'
  );
});





