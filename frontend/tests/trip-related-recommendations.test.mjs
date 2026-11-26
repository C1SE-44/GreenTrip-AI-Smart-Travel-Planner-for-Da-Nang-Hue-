import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const utilityPath = path.resolve('src/components/planner/tripRelatedRecommendations.ts');
const utilitySource = fs.readFileSync(utilityPath, 'utf8');
const compiled = ts.transpileModule(utilitySource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const utilityModule = { exports: {} };
vm.runInNewContext(compiled.outputText, {
  module: utilityModule,
  exports: utilityModule.exports,
});
const {
  addSubmittedTripSearch,
  addViewedTripPoi,
  rankTripRelatedPois,
  readTripRecommendationSignals,
  saveTripRecommendationSignals,
} = utilityModule.exports;

function poi({
  id,
  name = id,
  category = 'di-tich',
  sub_category = 'heritage',
  city = 'Huế',
  vibes = [],
  tags = [],
  description = '',
}) {
  return {
    id,
    name,
    category,
    sub_category,
    city,
    vibes,
    description,
    ai_metadata: { dna_tags: tags },
  };
}

test('trip-related recommendations require evidence and prioritize selected POIs', () => {
  const selected = poi({ id: 'selected', category: 'di-tich', sub_category: 'heritage', tags: ['history'] });
  const related = poi({ id: 'related', category: 'di-tich', sub_category: 'heritage', tags: ['history'] });
  const unrelated = poi({ id: 'unrelated', category: 'quan-an', sub_category: 'coffee', city: 'Huế' });

  const ranked = rankTripRelatedPois(
    [unrelated, related],
    [selected, related, unrelated],
    new Set(['selected']),
    new Set(),
    [],
  );

  assert.deepEqual(Array.from(ranked, (item) => item.poi.id), ['related']);
  assert.match(ranked[0].reason, /Cùng loại trải nghiệm/);
  assert.equal(rankTripRelatedPois([related], [related], new Set(), new Set(), []).length, 0);
});

test('submitted searches and explicitly viewed POIs provide weaker, scoped relevance', () => {
  const viewed = poi({ id: 'viewed', category: 'quan-an', sub_category: 'coffee', tags: ['quiet cafe'] });
  const candidate = poi({
    id: 'candidate',
    name: 'Cà phê yên tĩnh',
    category: 'quan-an',
    sub_category: 'coffee',
    vibes: ['quiet cafe'],
    description: 'Specialty coffee in a calm garden',
  });
  const ranked = rankTripRelatedPois(
    [candidate],
    [viewed, candidate],
    new Set(),
    new Set(['viewed']),
    ['cà phê yên tĩnh'],
  );

  assert.equal(ranked.length, 1);
  assert.match(ranked[0].reason, /Tương tự loại trải nghiệm/);
  assert.match(ranked[0].reason, /từ khóa bạn đã tìm/);
});

test('selected trip POIs rank ahead of equivalent viewed-only signals', () => {
  const selectedSource = poi({ id: 'selected-source', category: 'di-tich', sub_category: 'heritage', tags: ['history'] });
  const viewedSource = poi({ id: 'viewed-source', category: 'quan-an', sub_category: 'coffee', tags: ['quiet cafe'] });
  const selectedMatch = poi({ id: 'selected-match', category: 'di-tich', sub_category: 'heritage', tags: ['history'] });
  const viewedMatch = poi({ id: 'viewed-match', category: 'quan-an', sub_category: 'coffee', tags: ['quiet cafe'] });

  const ranked = rankTripRelatedPois(
    [viewedMatch, selectedMatch],
    [selectedSource, viewedSource, viewedMatch, selectedMatch],
    new Set(['selected-source']),
    new Set(['viewed-source']),
    [],
  );

  assert.deepEqual(Array.from(ranked, (item) => item.poi.id), ['selected-match', 'viewed-match']);
});

test('session signals are isolated by trip and keep only submitted searches', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  let signals = readTripRecommendationSignals('trip-a', storage);
  signals = addSubmittedTripSearch(signals, '  cà phê yên tĩnh  ');
  signals = addViewedTripPoi(signals, 'poi-a');
  saveTripRecommendationSignals('trip-a', signals, storage);
  saveTripRecommendationSignals('trip-b', { submittedSearches: [], viewedPoiIds: [] }, storage);

  const tripA = readTripRecommendationSignals('trip-a', storage);
  const tripB = readTripRecommendationSignals('trip-b', storage);
  assert.deepEqual(Array.from(tripA.submittedSearches), ['cà phê yên tĩnh']);
  assert.deepEqual(Array.from(tripA.viewedPoiIds), ['poi-a']);
  assert.equal(tripB.submittedSearches.length, 0);
  assert.equal(tripB.viewedPoiIds.length, 0);
  assert.equal(values.size, 2);
});

test('Planner PB09 excludes trip selection; related POIs use the trip selection as context', () => {
  const view = fs.readFileSync(path.resolve('src/components/planner/TripItineraryView.tsx'), 'utf8');
  const addModal = fs.readFileSync(path.resolve('src/components/planner/ItineraryAddPlacesModal.tsx'), 'utf8');
  const recommendationRequest = view.match(/fetchPoiRecommendations\(\{([\s\S]*?)\}\);/)?.[1] ?? '';

  assert.ok(recommendationRequest, 'Planner must call the PB09 endpoint');
  assert.doesNotMatch(recommendationRequest, /\bideas\s*:/, 'PB09 request must not depend on selected trip ideas');
  assert.match(view, /rankPoisForYou\(candidates, allPois, selectedPoiIds\)/);
  assert.match(view, /onSubmitSearch=\{recordTripSearch\}/);
  assert.match(view, /\.\.\.tripRecommendationSignals\.viewedPoiIds/);
  assert.match(addModal, /event\.key === 'Enter'/);
  assert.match(addModal, /onViewPoi\(poi\.id\)/);
});
