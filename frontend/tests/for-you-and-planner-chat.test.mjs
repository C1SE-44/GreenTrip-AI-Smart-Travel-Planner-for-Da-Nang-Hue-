import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const explorePagePath = path.resolve('src/pages/ExplorePage.tsx');
const plannerViewPath = path.resolve('src/components/planner/TripOverviewView.tsx');
const poiCardPath = path.resolve('src/components/poi/PoiCard.tsx');

test('Explore Page: TABS includes "Dành cho bạn" right next to "Tất cả"', () => {
  const content = fs.readFileSync(explorePagePath, 'utf8');
  assert.ok(content.includes("{ id: 'all', label: 'Tất cả' }"), 'Must have Tất cả tab');
  assert.ok(content.includes("{ id: 'for-you', label: 'Dành cho bạn' }"), 'Must have Dành cho bạn tab');
  
  // Verify order: for-you right next to all
  const idxAll = content.indexOf("{ id: 'all', label: 'Tất cả' }");
  const idxForYou = content.indexOf("{ id: 'for-you', label: 'Dành cho bạn' }");
  assert.ok(idxForYou > idxAll, 'Dành cho bạn must follow Tất cả');
  assert.ok(idxForYou - idxAll < 100, 'Dành cho bạn must be right next to Tất cả');
});

test('Explore Page: filteredPois applies hidden recommendation ranking for "for-you"', () => {
  const content = fs.readFileSync(explorePagePath, 'utf8');
  assert.ok(content.includes("activeTab === 'for-you'"), 'Must handle for-you in filteredPois');
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
