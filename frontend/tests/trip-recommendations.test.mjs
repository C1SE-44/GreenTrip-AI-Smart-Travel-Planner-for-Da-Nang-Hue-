import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const recommendationsPath = path.resolve('src/utils/tripRecommendations.ts');
const itineraryPath = path.resolve('src/components/planner/TripItineraryView.tsx');
const recommendationCardPath = path.resolve('src/components/planner/RecommendationPoiCard.tsx');
const recommendationServicePath = path.resolve('src/services/recommendations.ts');

const poiHelpers = {
  normalizeCategory: (value) => {
    const category = String(value ?? '').toLowerCase();
    if (category.includes('food') || category.includes('quan-an')) return 'quan-an';
    if (category.includes('nature') || category.includes('canh-quan')) return 'canh-quan';
    if (category.includes('temple') || category.includes('chua')) return 'chua';
    return 'di-tich';
  },
  normalizeCity: (value) => String(value ?? '').toLowerCase().includes('huế') ? 'Huế' : 'Đà Nẵng',
  getDeterministicImage: (name, id) => `fallback:${id}:${name}`,
};

function loadRecommendations() {
  const source = fs.readFileSync(recommendationsPath, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    URLSearchParams,
    require: (specifier) => {
      if (specifier === '@/data/pois') return poiHelpers;
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  return exports;
}

test('PB09 records are mapped to valid POI cards without dropping zero price or green values', () => {
  const { mapRecommendationRecords } = loadRecommendations();
  const [poi] = mapRecommendationRecords([{
    poi_id: 42,
    name: 'Quán địa phương',
    category_name: 'Food',
    city: 'Huế',
    lat: 16.46,
    lng: 107.59,
    image: 'https://example.test/poi.jpg',
    gallery: ['https://example.test/gallery.jpg'],
    estimated_cost: 0,
    satisfaction_score: 4.4,
    match_score: 87.6,
    green_score: 0,
    is_green: false,
    average_visit_minutes: 45,
    explanation_snippet: 'Đề xuất từ dữ liệu Recommendation.',
  }], [], 'Huế');

  assert.equal(poi.id, '42');
  assert.equal(poi.category, 'quan-an');
  assert.equal(poi.categoryName, 'Food');
  assert.equal(poi.city, 'Huế');
  assert.equal(poi.lat, 16.46);
  assert.equal(poi.lng, 107.59);
  assert.equal(poi.image, 'https://example.test/poi.jpg');
  assert.equal(poi.estimatedCost, 0);
  assert.equal(poi.priceKnown, true);
  assert.equal(poi.ecoScore, 0);
  assert.equal(poi.greenScoreKnown, true);
  assert.equal(poi.ratingKnown, true);
  assert.equal(poi.satisfactionScore, 4.4);
  assert.equal(poi.isGreen, false);
  assert.equal(poi.matchScore, 88);
  assert.equal(poi.description, 'Đề xuất từ dữ liệu Recommendation.');
  assert.equal(poi.recommendationReason, 'Đề xuất từ dữ liệu Recommendation.');
  assert.deepEqual(Array.from(poi.gallery), ['https://example.test/gallery.jpg']);
});

test('Unknown PB09 price and green signals stay marked unknown in the POI card model', () => {
  const { mapRecommendationRecords } = loadRecommendations();
  const [poi] = mapRecommendationRecords([{
    poi_id: 'unknown-signals', name: 'Unknown signals',
    category_name: 'heritage', city: 'Hue',
    estimated_cost: null, green_score: null,
  }], [], 'Hue');

  assert.equal(poi.estimatedCost, null);
  assert.equal(poi.priceKnown, false);
  assert.equal(poi.ecoScore, 50); // neutral internal display value only
  assert.equal(poi.greenScoreKnown, false);
  assert.equal(poi.isGreen, false);
});

test('PB09 null fields stay unknown instead of being replaced by stale catalogue values', () => {
  const { mapRecommendationRecords } = loadRecommendations();
  const catalogue = [{
    id: 'same-id', name: 'Mục từ catalogue', category: 'quan-an', city: 'Huế',
    lat: 16.46, lng: 107.59, image: 'catalogue.jpg', description: 'catalogue',
    rating: 4.9, visitDuration: '60 phút', average_visit_minutes: 60,
    estimatedCost: 500_000, ecoScore: 90, ecoScoreKnown: true, isGreen: true,
    isLocalBusiness: true, budget_tier: '$$',
  }];
  const [poi] = mapRecommendationRecords([{
    poi_id: 'same-id', name: 'Mục từ database', category_id: 'new-category',
    category_name: null, city: 'Huế', lat: null, lng: null,
    estimated_cost: null, green_score: null, satisfaction_score: null,
    average_visit_minutes: null, is_local_business: null, budget_tier: null,
  }], catalogue, 'Huế');

  assert.equal(poi.categoryName, null);
  assert.equal(poi.estimatedCost, null);
  assert.equal(poi.priceKnown, false);
  assert.equal(poi.greenScoreKnown, false);
  assert.equal(poi.rating, 0);
  assert.equal(poi.ratingKnown, false);
  assert.equal(poi.satisfactionScore, null);
  assert.equal(poi.average_visit_minutes, null);
  assert.ok(Number.isNaN(poi.lat));
  assert.ok(Number.isNaN(poi.lng));
  assert.equal(poi.isLocalBusiness, undefined);
  assert.equal(poi.budget_tier, null);
});

test('New database category names and explicit price units reach the card model', () => {
  const { mapRecommendationRecords } = loadRecommendations();
  const [poi] = mapRecommendationRecords([{
    poi_id: 'new-category', name: 'Gallery', category_id: 'category-983',
    category_name: 'Nghệ thuật đương đại', city: 'Huế', estimated_cost: 40_000,
    price_unit: 'item', price_range_display: '40.000–120.000 ₫/món',
    green_score: 0, is_local_business: null,
    ai_metadata: { verification_status: 'unverified' },
  }], [], 'Huế');

  assert.equal(poi.categoryName, 'Nghệ thuật đương đại');
  assert.equal(poi.categoryId, 'category-983');
  assert.equal(poi.priceUnit, 'item');
  assert.equal(poi.priceRangeDisplay, '40.000–120.000 ₫/món');
  assert.equal(poi.verificationStatus, 'unverified');
  assert.equal(poi.greenScoreKnown, true);
  assert.equal(poi.ecoScore, 0);

  const card = fs.readFileSync(recommendationCardPath, 'utf8');
  assert.ok(card.includes('formatCategoryLabel(poi.category)'));
  assert.ok(card.includes('estimatedCost'));
});

test('A new trip with no ideas keeps ideas empty while PB09 recommendations remain available', () => {
  const { mapRecommendationRecords, recommendationsForYouTab } = loadRecommendations();
  const ideas = [];
  const catalogue = [];
  const [recommendation] = mapRecommendationRecords([{
    poi_id: 'poi-1', name: 'Điểm tham quan', category_name: 'heritage', city: 'Đà Nẵng',
  }], catalogue, 'Đà Nẵng');

  assert.deepEqual(ideas, []);
  assert.equal(recommendationsForYouTab('success', [recommendation], ideas, catalogue)[0].id, 'poi-1');

  const itinerary = fs.readFileSync(itineraryPath, 'utf8');
  assert.ok(itinerary.includes('const recommendationResults: PlannerRecommendationPoi[] = recommendations ?? fetchedRecommendations;'));
  assert.ok(itinerary.includes('const scheduleRecommendations: Poi[] = recommendationResults;'));
  assert.ok(itinerary.includes("onAdd={() => handleToggleIdeaInTrip(poi.id, 'add')}"));
});

test('Adding a suggested POI appends only its ID to trip ideas and does not duplicate it', () => {
  const { addRecommendationToIdeas } = loadRecommendations();
  const poi = { id: 'poi-2', name: 'Bảo tàng', category: 'di-tich', city: 'Huế' };
  const ideas = [];
  const updated = addRecommendationToIdeas(ideas, poi, []);
  assert.deepEqual(Array.from(updated), ['poi-2']);
  assert.deepEqual(ideas, []);
  assert.equal(addRecommendationToIdeas(updated, poi, []), updated);

  const itinerary = fs.readFileSync(itineraryPath, 'utf8');
  assert.ok(itinerary.includes("handleToggleIdeaInTrip(poi.id, 'add')"));
  assert.ok(itinerary.includes('updateTripIdeaIds(currentIdeas, poiId, poi?.id, poi?.name, action)'));
  assert.ok(!itinerary.includes('saveTripItinerary(poi)'));
});

test('Selected POIs move into the similar section, duplicate and scheduled POIs are hidden, and deselection recalculates', () => {
  const { recommendationGroupsForTrip } = loadRecommendations();
  const catalogue = [{ id: 'selected-id', name: 'Địa điểm đã chọn' }];
  const tripRecommendations = [
    { id: 'selected-id', name: 'Địa điểm đã chọn' },
    { id: 'scheduled-id', name: 'Đã xếp lịch' },
    { id: 'general-id', name: 'Gợi ý chung' },
    { id: 'general-id', name: 'ID trùng' },
    { id: 'other-general-id', name: 'Gợi ý chung' },
  ];
  const similarRecommendations = [
    { id: 'selected-id', name: 'Địa điểm đã chọn' },
    { id: 'general-id', name: 'Gợi ý chung' },
    { id: 'similar-id', name: 'Gợi ý tương tự' },
    { id: 'scheduled-id', name: 'Đã xếp lịch' },
  ];

  const withSelection = recommendationGroupsForTrip(
    tripRecommendations, similarRecommendations, ['selected-id'], ['scheduled-id'], catalogue,
  );
  assert.deepEqual(Array.from(withSelection.trip, (poi) => poi.id), ['general-id']);
  assert.deepEqual(Array.from(withSelection.similar, (poi) => poi.id), ['similar-id']);

  const afterDeselection = recommendationGroupsForTrip(
    tripRecommendations, similarRecommendations, [], ['scheduled-id'], catalogue,
  );
  assert.deepEqual(Array.from(afterDeselection.trip, (poi) => poi.id), ['selected-id', 'general-id']);
  assert.deepEqual(Array.from(afterDeselection.similar), []);
});

test('Planner For You suggestions use trip context without substituting catalogue rows for PB09 results', () => {
  const { recommendationsForYouTab } = loadRecommendations();
  const recommendation = { id: 'rec-id', name: 'Kết quả PB09' };
  const cataloguePoi = { id: 'catalogue-id', name: 'POI catalogue' };
  const catalogue = [cataloguePoi];

  assert.deepEqual(
    Array.from(recommendationsForYouTab('success', [recommendation], [], catalogue), (poi) => poi.id),
    ['rec-id'],
  );
  assert.deepEqual(Array.from(recommendationsForYouTab('empty', [], [], catalogue)), []);
  assert.deepEqual(Array.from(recommendationsForYouTab('error', [], [], catalogue)), []);

  const itinerary = fs.readFileSync(itineraryPath, 'utf8');
  assert.ok(itinerary.includes('rankPoisForYou(candidates, allPois, selectedPoiIds)'));
  assert.ok(itinerary.includes('forYouPois.map(({ poi, reason }) => ('));
  assert.ok(itinerary.includes('recommendationCards.map((poi) => ('));
  assert.ok(itinerary.includes('onExplain={() => setExplanationPoi(poi)}'));
});

test('PB07 Workspace values serialize to PB09 context without inventing a budget', () => {
  const { buildRecommendationTripData } = loadRecommendations();
  const tripData = buildRecommendationTripData({
    destination: 'Da Nang & Hue',
    daysCount: 3,
    peopleCount: 3,
    adultCount: 2,
    childCount: 0,
    infantCount: 1,
    petCount: 1,
    budgetInputAmount: 3_000_000,
    budgetScope: 'PER_PERSON',
    totalBudget: 6_000_000,
    interests: ['nature', 'culture'],
    categoryBudgets: { dining: '$', lodging: '$$', activities: '$$$' },
  });

  assert.equal(tripData.destination, 'Da Nang & Hue');
  assert.equal(tripData.days, 3);
  assert.equal(tripData.num_people, 3);
  assert.equal(tripData.total_budget, 6_000_000);
  assert.equal(tripData.budget_amount, 3_000_000);
  assert.equal(tripData.budget_scope, 'PER_PERSON');
  assert.equal(tripData.budget_traveler_count, 2);
  assert.equal(tripData.daily_budget_per_person, 1_000_000);
  assert.equal(tripData.dining_tier, 'budget');
  assert.equal(tripData.lodging_tier, 'standard');
  assert.equal(tripData.activities_tier, 'luxury');
  assert.deepEqual(Array.from(tripData.preferences), ['nature', 'culture']);
});

test('PB09 context leaves an unknown budget and an unresolvable PER_PERSON headcount unknown', () => {
  const { buildRecommendationTripData } = loadRecommendations();
  const noBudget = buildRecommendationTripData({
    destination: 'Hue', daysCount: 2, peopleCount: 2,
    interests: [], categoryBudgets: { dining: 'any', lodging: 'any', activities: 'any' },
  });
  const noPerPersonHeadcount = buildRecommendationTripData({
    destination: 'Hue', daysCount: 2, peopleCount: 3,
    budgetInputAmount: 1_000_000, budgetScope: 'PER_PERSON', totalBudget: 3_000_000,
    interests: [], categoryBudgets: { dining: 'any', lodging: 'any', activities: 'any' },
  });

  assert.equal(noBudget.total_budget, null);
  assert.equal(noBudget.daily_budget_per_person, null);
  assert.deepEqual(Array.from(noBudget.preferences), []);
  assert.equal(noPerPersonHeadcount.budget_traveler_count, null);
  assert.equal(noPerPersonHeadcount.daily_budget_per_person, null);
});

test('Trip Overview sends PB07 context and PB08 parsed weights to the active PB09 endpoint', async () => {
  const calls = [];
  const source = fs.readFileSync(recommendationServicePath, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    URLSearchParams,
    require: (specifier) => {
      if (specifier === '@/lib/api') {
        return {
          API_BASE_URL: '/api',
          fetchJson: async (...args) => {
            calls.push(args);
            return args[0].startsWith('/pois/weights?')
              ? {
                green_weight_raw: 75, budget_weight_raw: 25,
                normalized_green_weight: 0.75, normalized_budget_weight: 0.25,
                min_eco_score: 0, max_budget: null,
                eco_certified_only: false, green_transit_only: false,
              }
              : { status: 'success', total: 0, data: [] };
          },
        };
      }
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });

  const sliderWeights = await exports.fetchParsedSliderWeights({
    green_weight: 75, budget_weight: 25, budget_tier: 'all',
  });
  const request = {
    destination: 'Da Nang & Hue',
    trip_days: 3,
    ideas: ['selected-poi'],
    favorites: ['saved-account-poi'],
    interests: ['nature'],
    green_priority: sliderWeights.normalized_green_weight,
    top_k: 10,
    trip_data: { total_budget: null, preferences: ['nature'] },
    slider_weights: sliderWeights,
  };
  const controller = new AbortController();
  await exports.fetchPoiRecommendations(request, controller.signal);

  assert.match(calls[0][0], /budget_tier=all/);
  assert.equal(calls[1][0], '/v1/recommendations/poi');
  assert.deepEqual(JSON.parse(calls[1][1].body), JSON.parse(JSON.stringify(request)));
  assert.equal(calls[1][1].signal, controller.signal);

  const itinerary = fs.readFileSync(itineraryPath, 'utf8');
  const requestStart = itinerary.indexOf('const recommendationRequest = useMemo');
  const requestEnd = itinerary.indexOf('const recommendationContextKey =', requestStart);
  const requestSource = itinerary.slice(requestStart, requestEnd);
  for (const field of ['destination:', 'interests,', 'budget_tier:', 'trip_days:', 'top_k:', 'offset:']) {
    assert.ok(requestSource.includes(field), `Planner PB09 request is missing ${field}`);
  }
  assert.ok(itinerary.includes('fetchPoiRecommendations(recommendationRequest, controller.signal)'));
  assert.ok(itinerary.includes('snapshot_id: page.snapshotId'));
});
