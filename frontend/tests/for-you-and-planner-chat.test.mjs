import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const explorePagePath = path.resolve('src/pages/ExplorePage.tsx');
const plannerViewPath = path.resolve('src/components/planner/TripOverviewView.tsx');
const poiCardPath = path.resolve('src/components/poi/PoiCard.tsx');

test('Explore Page: TABS replaces "Tất cả" with "Dành cho bạn" and 4 categories', () => {
  const content = fs.readFileSync(explorePagePath, 'utf8');
  assert.ok(!content.includes("{ id: 'all', label: 'Tất cả' }"), 'Must NOT have "Tất cả" tab');
  assert.ok(content.includes("{ id: 'for-you', label: 'Dành cho bạn' }"), 'Must have "Dành cho bạn" as initial tab');
  assert.ok(content.includes("{ id: 'quan-an', label: 'Ẩm thực & Cafe' }"), 'Must have Ẩm thực category');
  assert.ok(content.includes("{ id: 'di-tich', label: 'Di tích & Lịch sử' }"), 'Must have Di tích category');
  assert.ok(content.includes("{ id: 'canh-quan', label: 'Cảnh quan & Thiên nhiên' }"), 'Must have Cảnh quan category');
  assert.ok(content.includes("{ id: 'chua', label: 'Chùa & Tâm linh' }"), 'Must have Chùa category');
});

test('Explore Page: filteredPois applies hidden recommendation ranking factoring in user favorites', () => {
  const content = fs.readFileSync(explorePagePath, 'utf8');
  assert.ok(content.includes("activeTab === 'for-you'"), 'Must handle for-you in filteredPois');
  assert.ok(content.includes("likedPois"), 'Must factor in user liked/hearted places');
});

test('Explore Page: Curated sections render Must-Try for each category and limit map pins', () => {
  const content = fs.readFileSync(explorePagePath, 'utf8');
  assert.ok(content.includes('displayedMapPois'), 'Must define displayedMapPois to prevent map overcrowding');
  assert.ok(content.includes('pois={displayedMapPois}'), 'PoiMap must receive displayedMapPois');
  assert.ok(content.includes('sortMustTry'), 'Must prioritize must-try places');
});

test('PoiCard: Hides match percentage and explanation button by default', () => {
  const content = fs.readFileSync(poiCardPath, 'utf8');
  assert.ok(content.includes('showExplanation = false'), 'showExplanation defaults to false');
  assert.ok(content.includes('{showExplanation && recommendation && ('), 'Does not show % Phù hợp gu unless explicitly requested');
  assert.ok(content.includes('{showExplanation && !recommendation && ('), 'Does not show Vì sao nơi này button unless explicitly requested');
});

test('Planner TripOverview: Left column dedicated to AI insight & Chat (no POI recommendation cards list)', () => {
  const content = fs.readFileSync(plannerViewPath, 'utf8');
  assert.ok(content.includes('Đoạn chat (1)'), 'Must have Chats section');
  assert.ok(content.includes('Bắt đầu một cuộc trò chuyện mới cho chuyến đi này...'), 'Must have chat input placeholder');
  assert.ok(!content.includes('+ Lưu vào ý tưởng'), 'Must NOT have old POI recommendation cards list in planner overview');
});

test('Planner Itinerary Drawer: "Xem lịch theo ngày" opens TripItineraryView inside right card drawer container', () => {
  const plannerContent = fs.readFileSync(plannerViewPath, 'utf8');
  assert.ok(plannerContent.includes('showItineraryDrawer'), 'Must have showItineraryDrawer state');
  assert.ok(plannerContent.includes('setShowItineraryDrawer(true)'), 'Must open itinerary drawer on action');
  assert.ok(plannerContent.includes('<TripItineraryView'), 'Must embed TripItineraryView inside drawer');
  assert.ok(plannerContent.includes('isDrawerMode={true}'), 'Must pass isDrawerMode={true}');

  // Also assert that "Ý tưởng đã lưu" drawer is preserved intact when clicking Ideas
  assert.ok(plannerContent.includes('showIdeasView'), 'Must have showIdeasView state preserved');
  assert.ok(plannerContent.includes('Ý tưởng đã lưu'), 'Must retain original "Ý tưởng đã lưu" drawer title');
  assert.ok(plannerContent.includes('Thêm địa điểm bạn muốn đến.'), 'Must retain original polaroids empty state');

  const itineraryViewPath = path.resolve('src/components/planner/TripItineraryView.tsx');
  const itineraryContent = fs.readFileSync(itineraryViewPath, 'utf8');
  assert.ok(itineraryContent.includes('isDrawerMode'), 'TripItineraryView must support isDrawerMode prop');
  assert.ok(itineraryContent.includes('rounded-l-[24px]'), 'Drawer must have rounded-l-[24px] card styling');
  assert.ok(itineraryContent.includes('animate-slideInRight'), 'Drawer must slide in from right');
  assert.ok(itineraryContent.includes('!isDrawerMode &&'), 'Map column must only render when NOT in drawer mode');
});
