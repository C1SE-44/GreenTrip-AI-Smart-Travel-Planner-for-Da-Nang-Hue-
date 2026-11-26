import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');

function loadModule(relativePath, fetchJson = async () => ({})) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {exports, require: () => ({fetchJson})});
  return exports;
}

test('community environmental prompts follow POI category and include only observable criteria', () => {
  const criteria = loadModule('../src/utils/communityGreen.ts');
  assert.deepEqual(Array.from(criteria.communityGreenCriteriaFor('quan-an')), [
    'cleanliness_waste', 'single_use_plastic', 'responsible_management',
  ]);
  assert.deepEqual(Array.from(criteria.communityGreenCriteriaFor('canh-quan')), [
    'cleanliness_waste', 'ecosystem_protection', 'responsible_management',
  ]);
  assert.equal(criteria.communityGreenCriteriaFor('other').length, 4);
  assert.deepEqual(Array.from(criteria.communityGreenCriteriaFor('\u1ea8m th\u1ef1c')), [
    'cleanliness_waste', 'single_use_plastic', 'responsible_management',
  ]);
});

test('community endpoints keep aggregate public and submit a versioned own review explicitly', async () => {
  const calls = [];
  const api = loadModule('../src/services/communityGreenReviews.ts', async (path, init) => {
    calls.push({path, init});
    return {review: null};
  });
  await api.getCommunityGreenRating('poi/a');
  await api.getOwnCommunityGreenReview('poi/a');
  const input = {
    trip_id: 'trip-a', stop_id: 'stop-a', cleanliness_waste: 4,
    single_use_plastic: null, ecosystem_protection: null, responsible_management: 5,
    comment: 'visible observation', expected_version: 2,
  };
  await api.saveCommunityGreenReview('poi/a', input);
  assert.equal(calls[0].path, '/pois/poi%2Fa/community-green-rating');
  assert.equal(calls[1].path, '/pois/poi%2Fa/community-green-review');
  assert.equal(calls[2].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[2].init.body), input);
});

test('in-trip recovery posts the trip id to the reconciliation endpoint', async () => {
  const calls = [];
  const api = loadModule('../src/services/travelAssistant.ts', async (path, init) => {
    calls.push({path, init});
    return {status: 'CLEAN', itinerary: {days: []}};
  });
  await api.reconcileInTripApply('trip/one');
  assert.equal(calls[0].path, '/assistant/in-trip/reconcile');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), {trip_id: 'trip/one'});
});

test('visited trip stops link to the own-review form and aggregate stays separate from source reviews', () => {
  const panel = readFileSync(new URL('../src/components/planner/InTripAssistancePanel.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../src/components/poi/PoiDetailSection.tsx', import.meta.url), 'utf8');
  const rating = readFileSync(new URL('../src/components/poi/CommunityGreenRating.tsx', import.meta.url), 'utf8');
  const form = readFileSync(new URL('../src/components/planner/CommunityGreenReviewForm.tsx', import.meta.url), 'utf8');
  const itinerary = readFileSync(new URL('../src/components/planner/TripItineraryView.tsx', import.meta.url), 'utf8');
  assert.match(panel, /status === 'VISITED' && poi/);
  assert.match(panel, /setReviewPromptStopId\(stop\.stop_id\)/);
  assert.match(panel, /<CommunityGreenReviewForm[\s\S]*?tripId=\{tripId\}[\s\S]*?stopId=\{stop\.stop_id\}/);
  assert.match(form, /getOwnCommunityGreenReview\(poiId/);
  assert.match(form, /saveCommunityGreenReview\(poiId/);
  assert.match(detail, /<CommunityGreenRating poiId=\{String\(poi\.id\)\}/);
  assert.match(rating, /aggregate\.community_green_score == null/);
  assert.doesNotMatch(rating, /poi\.ecoScore|green_score\s*\+/);
  assert.match(itinerary, /reconcileInTripApplyRequest\(trip\.id\)/);
  assert.match(itinerary, /onReconcile=\{reconcileInTripDraft\}/);
});
