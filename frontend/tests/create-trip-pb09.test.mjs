import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modalPath = path.resolve('src/components/planner/CreateTripCopilotModal.tsx');
const explorePath = path.resolve('src/pages/ExplorePage.tsx');
const itineraryPath = path.resolve('src/components/planner/TripItineraryView.tsx');
const recommendationServicePath = path.resolve('src/services/recommendations.ts');

test('Create trip modal retains its original fields and behavior', () => {
  const modal = fs.readFileSync(modalPath, 'utf8');
  for (const expected of [
    'max-w-[508px]',
    'Anh ơi, em cần lưu ý điều gì cho chuyến đi này?',
    'value={tripPrompt}',
    'setShowWhereModal(true)',
    'setShowWhenModal(true)',
    'setShowWhoModal(true)',
    'setShowBudgetModal(true)',
    'flexibleDays',
    'calendarBaseMonth',
    'setAdults',
    'setChildren',
    'setInfants',
    'setPets',
    'budgetTier',
    'customBudgetVnd',
    'Mở ngay Lịch trình &amp; Bản đồ',
    'Tạo chuyến đi',
  ]) {
    assert.ok(modal.includes(expected), `missing original form behavior: ${expected}`);
  }
  assert.ok(modal.includes('Math.min(14'));
  assert.ok(modal.includes('initialPrompt'));
  assert.ok(!modal.includes('[1, 2, 3].map'));
});

test('preferences open as an optional multi-select modal and persist with the trip', () => {
  const modal = fs.readFileSync(modalPath, 'utf8');
  const preferencesModal = fs.readFileSync(path.resolve('src/components/planner/TripPreferencesModal.tsx'), 'utf8');
  for (const interest of [
    'beach', 'nature', 'culture', 'food', 'coffee', 'checkin',
    'adventure', 'relaxation', 'spiritual', 'local',
  ]) {
    assert.ok(preferencesModal.includes(`id: '${interest}'`), `missing preference code: ${interest}`);
  }
  assert.ok(modal.includes('Sở thích'));
  assert.ok(preferencesModal.includes('placeholder="Ví dụ: Thích nơi yên tĩnh, ngắm bình minh, ăn món địa phương..."'));
  assert.ok(preferencesModal.includes('aria-pressed={selected}'));
  assert.ok(modal.includes('setShowInterestsModal(false)'));
  assert.ok(modal.includes('totalBudget: enteredTotalBudget'));
  assert.ok(modal.includes('Number.isSafeInteger(customBudgetVnd)'));
  assert.ok(modal.includes('labels.length > 2 ?'));
  assert.ok(modal.includes('return \'Chưa chọn\''));
  assert.equal(modal.split('preferences: selectedInterests,').length - 1, 3);
  assert.equal(modal.split('preferenceText: preferenceText.trim() || undefined,').length - 1, 2);

  const itinerary = fs.readFileSync(itineraryPath, 'utf8');
  assert.ok(itinerary.includes('recommendationTrip.preferenceText?.trim()'));
  assert.ok(itinerary.includes('trip.recommendationTripData'));
});

test('PB09 recommendation fetch and explicit POI selection remain connected', () => {
  const modal = fs.readFileSync(modalPath, 'utf8');
  assert.ok(modal.includes('cb(newTrip, { openInItinerary: openDirectlyToItinerary })'));

  const explore = fs.readFileSync(explorePath, 'utf8');
  assert.ok(explore.includes("setActiveTripSubTab(options?.openInItinerary ? 'itinerary' : 'ideas')"));

  const itinerary = fs.readFileSync(itineraryPath, 'utf8');
  const requestStart = itinerary.indexOf('const recommendationRequest = useMemo');
  const requestEnd = itinerary.indexOf('const recommendationContextKey =', requestStart);
  const requestSource = itinerary.slice(requestStart, requestEnd);
  const fetchStart = itinerary.indexOf('const response = await fetchPoiRecommendations(recommendationRequest');
  const mappedStart = itinerary.indexOf('const mapped = mapRecommendationRecords(', fetchStart);
  assert.ok(fetchStart >= 0 && mappedStart > fetchStart);
  assert.ok(requestSource.includes('interests,'));
  assert.ok(requestSource.includes('recommendationTrip.recommendationTripData'));
  assert.ok(itinerary.includes('response.data,'));
  assert.ok(itinerary.includes("onAdd={() => handleToggleIdeaInTrip(poi.id, 'add')}"));

  const recommendationService = fs.readFileSync(recommendationServicePath, 'utf8');
  assert.ok(recommendationService.includes("'/v1/recommendations/poi'"));
});
