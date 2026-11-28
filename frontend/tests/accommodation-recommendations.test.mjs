import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const panel = fs.readFileSync(path.resolve('src/components/planner/AccommodationRecommendationsPanel.tsx'), 'utf8');
const service = fs.readFileSync(path.resolve('src/services/accommodations.ts'), 'utf8');
const workspace = fs.readFileSync(path.resolve('src/pages/ExplorePage.tsx'), 'utf8');
const preview = fs.readFileSync(path.resolve('src/components/planner/TravelAssistant.tsx'), 'utf8');
const itinerary = fs.readFileSync(path.resolve('src/components/planner/TripItineraryView.tsx'), 'utf8');

test('accommodation candidates come from the read-only API and the selected itinerary alternative', () => {
  assert.ok(service.includes("'/api/accommodations/recommendations'"));
  assert.ok(panel.includes('recommendAccommodations(request, controller.signal)'));
  assert.ok(panel.includes('alternative_id: alternativeId'));
  assert.ok(panel.includes('room_counts_by_group: roomCountRequestMap'));
  assert.ok(panel.includes('latestRequest.current === requestKey'));
  assert.ok(panel.includes('responseRequestKey === requestKey'));
  assert.ok(panel.includes('responseContextKey === requestContextKey'));
  assert.ok(panel.includes('return () => controller.abort()'));
  assert.ok(preview.includes('<AccommodationRecommendationsPanel'));
  assert.ok(preview.includes('alternativeId={selectedAlternative?.id || draft.id}'));
  assert.ok(itinerary.includes('alternativeId="confirmed"'));
});

test('accommodation UI keeps empty/error states separate from real catalogue recommendations', () => {
  assert.ok(panel.includes('Đang tải bản ghi lưu trú trong catalogue'));
  assert.ok(panel.includes('Chưa tải được dữ liệu lưu trú'));
  assert.ok(panel.includes('Chưa có bản ghi lưu trú thật trong catalogue'));
  assert.ok(panel.includes('contextResponse?.groups || (activeError ? fallbackGroups'));
  assert.ok(panel.includes('Không nhận được phản hồi recommendation'));
  assert.ok(!panel.includes('MOCK_HOTELS'));
});

test('accommodation choices persist in Workspace and never rewrite the itinerary', () => {
  assert.ok(workspace.includes('accommodationPlan?: AccommodationPlan'));
  assert.ok(panel.includes('onTripUpdate({ ...trip, accommodationPlan: plan })'));
  assert.ok(panel.includes("status: 'SELECTED'"));
  assert.ok(panel.includes("status: 'BOOKED_BY_USER'"));
  assert.ok(panel.includes('Tôi đã đặt nơi này'));
  assert.ok(panel.includes("status: 'CHOOSE_LATER'"));
  assert.ok(panel.includes('Chỉ lưu thông tin bạn nhập; không tạo booking record'));
  assert.ok(panel.includes('itinerary chưa bị thay đổi'));
});

test('saved user-entered accommodation details are reloaded for editing', () => {
  for (const fragment of [
    "selected?.status === 'BOOKED_BY_USER'",
    'selected.nightlyPrice == null ?',
    'selected.roomCount == null ?',
    'value={draft.nightlyPrice}',
    'value={draft.roomCount}',
  ]) assert.ok(panel.includes(fragment), `Missing persisted form value: ${fragment}`);
});
