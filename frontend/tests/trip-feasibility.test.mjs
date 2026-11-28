import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/utils/tripFeasibility.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const feasibility = {};
vm.runInNewContext(compiled, { exports: feasibility, Date, Math, Number, Set, Map, Array, String, JSON });

const allWeek = [
  'Monday: 9:00 AM – 5:00 PM', 'Tuesday: 9:00 AM – 5:00 PM',
  'Wednesday: 9:00 AM – 5:00 PM', 'Thursday: 9:00 AM – 5:00 PM',
  'Friday: 9:00 AM – 5:00 PM', 'Saturday: 9:00 AM – 5:00 PM',
  'Sunday: 9:00 AM – 5:00 PM',
];

function poi(id, overrides = {}) {
  return {
    id, city: 'Đà Nẵng', lat: 16.05, lng: 108.22,
    average_visit_minutes: 60, estimatedCost: null, priceUnit: null,
    opening_hours: { weekday_text: allWeek }, ...overrides,
  };
}

function trip(overrides = {}) {
  const startDate = Object.prototype.hasOwnProperty.call(overrides, 'startDate') ? overrides.startDate : '2026-12-07';
  const daysCount = overrides.daysCount ?? 2;
  const end = startDate ? new Date(`${startDate}T00:00:00Z`) : null;
  if (end) end.setUTCDate(end.getUTCDate() + daysCount - 1);
  return {
    destination: 'Đà Nẵng', dateMode: 'dates', startDate,
    endDate: end?.toISOString().slice(0, 10) ?? null, daysCount, adultCount: 2, childCount: 0,
    infantCount: 0, totalBudget: null, budgetInputAmount: null,
    budgetScope: null, ...overrides,
  };
}

test('four nearby POIs with realistic visit durations fit a two-day trip', () => {
  const pois = Array.from({ length: 4 }, (_, index) => poi(`p${index}`, { lng: 108.22 + index * 0.005 }));
  const result = feasibility.evaluateTripFeasibility(trip(), pois.map((item) => item.id), pois);
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.time_coverage.complete, true);
  assert.equal(result.total_visit_minutes, 240);
});

test('twelve long visits exceed a two-day capacity without blocking POI selection', () => {
  const pois = Array.from({ length: 12 }, (_, index) => poi(`long${index}`, { average_visit_minutes: 180 }));
  const ids = pois.map((item) => item.id);
  const result = feasibility.evaluateTripFeasibility(trip(), ids, pois);
  assert.equal(result.status, 'LIKELY_INFEASIBLE');
  assert.ok(result.warnings.some((warning) => warning.code === 'time_capacity_exceeded'));
  assert.equal(ids.length, 12);
});

test('a larger count of very short POIs is evaluated by time, not count alone', () => {
  const pois = Array.from({ length: 10 }, (_, index) => poi(`short${index}`, { average_visit_minutes: 10 }));
  const result = feasibility.evaluateTripFeasibility(trip({ daysCount: 5 }), pois.map((item) => item.id), pois);
  assert.notEqual(result.status, 'LIKELY_INFEASIBLE');
});

test('few distant same-city POIs include a labeled local travel estimate', () => {
  const pois = [
    poi('far-a', { lng: 108.0 }), poi('far-b', { lng: 109.4 }), poi('far-c', { lng: 108.5 }),
  ];
  const result = feasibility.evaluateTripFeasibility(trip({ daysCount: 1 }), pois.map((item) => item.id), pois);
  assert.ok(result.estimated_travel_minutes > 0);
  assert.ok(result.assumptions.some((item) => item.includes('đường chim bay')));
  assert.equal(result.status, 'LIKELY_INFEASIBLE');
});

test('missing average visit duration stays unknown instead of using a category fallback', () => {
  const result = feasibility.evaluateTripFeasibility(trip(), ['missing-time'], [poi('missing-time', { average_visit_minutes: null })]);
  assert.equal(result.status, 'INSUFFICIENT_DATA');
  assert.equal(result.total_visit_minutes, null);
  assert.ok(result.unknown_fields.includes('average_visit_minutes'));
  assert.ok(result.unknown_fields.includes('opening_hours'));
});

test('near-full activity window is reported as tight', () => {
  const result = feasibility.evaluateTripFeasibility(
    trip({ daysCount: 1 }), ['busy'], [poi('busy', { average_visit_minutes: 210 })],
  );
  assert.equal(result.status, 'TIGHT');
  assert.ok(result.warnings.some((warning) => warning.code === 'time_capacity_tight'));
});

test('configured activity start and end define the available window', () => {
  const result = feasibility.evaluateTripFeasibility(
    trip({ daysCount: 1, activityStartTime: '10:00', activityEndTime: '12:00' }),
    ['window'], [poi('window', { average_visit_minutes: 150 })],
  );
  assert.equal(result.available_minutes, 120);
  assert.equal(result.status, 'LIKELY_INFEASIBLE');
});

test('dated arrival and departure days use partial configured capacity instead of full 8-hour days', () => {
  const twoDay = feasibility.evaluateTripFeasibility(trip(), [], []);
  const oneDay = feasibility.evaluateTripFeasibility(trip({ daysCount: 1 }), [], []);
  assert.equal(twoDay.available_minutes, 480);
  assert.equal(oneDay.available_minutes, 240);
  assert.ok(twoDay.assumptions.some((item) => item.includes('ngày đầu/cuối')));
});

test('flexible dates never claim an exact weekday closure conflict', () => {
  const result = feasibility.evaluateTripFeasibility(
    trip({ dateMode: 'flex', startDate: null, endDate: null }),
    ['flex'], [poi('flex', { opening_hours: { weekday_text: ['Monday: Closed'] } })],
  );
  assert.equal(result.opening_hours_conflicts.length, 0);
  assert.equal(result.status, 'INSUFFICIENT_DATA');
});

test('a morning-only POI fits when its actual date and visit duration overlap opening hours', () => {
  const result = feasibility.evaluateTripFeasibility(
    trip({ daysCount: 1 }), ['morning'], [poi('morning', {
      average_visit_minutes: 60,
      opening_hours: { weekday_text: ['Monday: 8:00 AM – 11:00 AM'] },
    })],
  );
  assert.equal(result.opening_hours_conflicts.length, 0);
});

test('closed on the only dated trip day is a warning, while another open day avoids conflict', () => {
  const mondayClosed = poi('closed', { opening_hours: { weekday_text: ['Monday: Closed'] } });
  const oneDay = feasibility.evaluateTripFeasibility(trip({ daysCount: 1 }), ['closed'], [mondayClosed]);
  const twoDays = feasibility.evaluateTripFeasibility(trip(), ['closed'], [mondayClosed]);
  assert.equal(oneDay.opening_hours_conflicts.join(','), 'closed');
  assert.equal(twoDays.opening_hours_conflicts.length, 0);
});

test('missing or malformed hours remain unknown and ignore open_now, status_text, and best_time', () => {
  for (const opening_hours of [null, { weekday_text: ['Not a weekday: maybe later'] }, { open_now: false, status_text: 'Closed now' }]) {
    const result = feasibility.evaluateTripFeasibility(
      trip({ daysCount: 1 }), ['unknown-hours'], [poi('unknown-hours', { opening_hours, best_time: ['morning'] })],
    );
    assert.equal(result.opening_hours_conflicts.length, 0);
    assert.equal(result.status, 'INSUFFICIENT_DATA');
  }
});

test('no declared budget means POI cost does not create a budget warning', () => {
  const result = feasibility.evaluateTripFeasibility(
    trip(), ['costly'], [poi('costly', { estimatedCost: 90_000_000, priceUnit: 'per_group' })],
  );
  assert.equal(result.estimated_known_cost, null);
  assert.ok(!result.warnings.some((warning) => warning.code.includes('budget')));
});

test('per-person prices multiply adults only and mark child or infant fares unknown', () => {
  const result = feasibility.evaluateTripFeasibility(
    trip({ adultCount: 2, childCount: 1, infantCount: 1, petCount: 2, totalBudget: 5_000_000 }),
    ['ticket'], [poi('ticket', { estimatedCost: 3_000_000, priceUnit: 'per_person' })],
  );
  assert.equal(result.estimated_known_cost, 6_000_000);
  assert.ok(result.unknown_fields.includes('child/infant fare'));
  assert.ok(result.warnings.some((warning) => warning.code === 'known_poi_cost_exceeds_budget'));
});

test('budget comparison uses normalized totalBudget for per-person and group scopes', () => {
  const place = poi('group-cost', { estimatedCost: 4_000_000, priceUnit: 'per_group' });
  const perPerson = feasibility.evaluateTripFeasibility(
    trip({ budgetInputAmount: 3_000_000, budgetScope: 'PER_PERSON', totalBudget: 6_000_000 }), ['group-cost'], [place],
  );
  const totalGroup = feasibility.evaluateTripFeasibility(
    trip({ budgetInputAmount: 3_000_000, budgetScope: 'TOTAL_GROUP', totalBudget: 3_000_000 }), ['group-cost'], [place],
  );
  assert.equal(perPerson.budget_limit, 6_000_000);
  assert.equal(totalGroup.budget_limit, 3_000_000);
  assert.equal(perPerson.warnings.some((warning) => warning.code === 'known_poi_cost_exceeds_budget'), false);
  assert.equal(totalGroup.warnings.some((warning) => warning.code === 'known_poi_cost_exceeds_budget'), true);
});

test('group prices count once, item prices are not multiplied by travelers, and zero is known', () => {
  const pois = [
    poi('group', { estimatedCost: 1_000_000, priceUnit: 'per_group' }),
    poi('menu', { estimatedCost: 200_000, priceUnit: 'per_item' }),
    poi('free', { estimatedCost: 0, priceUnit: null }),
  ];
  const result = feasibility.evaluateTripFeasibility(
    trip({ totalBudget: 1_500_000 }), pois.map((item) => item.id), pois,
  );
  assert.equal(result.estimated_known_cost, 1_000_000);
  assert.equal(result.cost_coverage.known, 2);
  assert.equal(result.cost_coverage.unknown, 1);
});

test('null or missing prices remain unknown and budget_tier is not treated as money', () => {
  const result = feasibility.evaluateTripFeasibility(
    trip({ totalBudget: 1_000_000 }), ['unknown-price'], [poi('unknown-price', { estimatedCost: null, budget_tier: '$' })],
  );
  assert.equal(result.estimated_known_cost, 0);
  assert.equal(result.cost_coverage.complete, false);
  assert.ok(result.warnings.some((warning) => warning.code === 'budget_cost_coverage_partial'));
});

test('Da Nang and Hue POIs signal an unknown intercity leg rather than fake travel minutes', () => {
  const pois = [poi('danang', { city: 'Đà Nẵng' }), poi('hue', { city: 'Huế' })];
  const result = feasibility.evaluateTripFeasibility(trip(), pois.map((item) => item.id), pois);
  assert.equal(result.cross_city_travel_warning, true);
  assert.equal(result.estimated_travel_minutes, null);
  assert.equal(result.status, 'INSUFFICIENT_DATA');
  assert.ok(result.warnings.some((warning) => warning.code === 'cross_city_travel_unestimated'));
});

test('confirmed itinerary stops count toward time and duplicate selected IDs are not double counted', () => {
  const result = feasibility.evaluateTripFeasibility(
    trip(), ['scheduled'], [poi('scheduled')], [
      { poi_id: 'scheduled', duration_minutes: 180 },
      { poi_id: 'other-stop', duration_minutes: 180, city: 'Đà Nẵng' },
    ],
  );
  assert.equal(result.time_coverage.total, 2);
  assert.equal(result.total_visit_minutes, 360);
});

test('confirmed stops assigned to one day are checked against that day instead of unused days', () => {
  const stops = ['s1', 's2', 's3'].map((poi_id) => ({ poi_id, day_number: 1, duration_minutes: 120, city: 'Đà Nẵng' }));
  const result = feasibility.evaluateTripFeasibility(trip(), [], [], stops);
  assert.equal(result.status, 'LIKELY_INFEASIBLE');
  assert.ok(result.warnings.some((warning) => warning.code === 'confirmed_day_over_capacity'));
});

test('new serious risks trigger one warning; unchanged warnings can be deduplicated by signature', () => {
  const before = feasibility.evaluateTripFeasibility(trip({ daysCount: 1 }), ['before'], [poi('before', { average_visit_minutes: 60 })]);
  const after = feasibility.evaluateTripFeasibility(
    trip({ daysCount: 1 }), ['before', 'after'], [poi('before', { average_visit_minutes: 300 }), poi('after', { average_visit_minutes: 300 })],
  );
  assert.equal(feasibility.hasSignificantRiskIncrease(before, after), true);
  assert.equal(feasibility.hasSignificantRiskIncrease(after, after), false);
  assert.equal(feasibility.requiresFeasibilityConfirmation(after), true);
});

test('unchanged cross-city uncertainty keeps a stable warning and does not repeat on every added POI', () => {
  const existing = [poi('dn', { city: 'Đà Nẵng' }), poi('hue-1', { city: 'Huế' })];
  const next = [...existing, poi('hue-2', { city: 'Huế' })];
  const before = feasibility.evaluateTripFeasibility(trip(), existing.map((item) => item.id), existing);
  const after = feasibility.evaluateTripFeasibility(trip(), next.map((item) => item.id), next);
  assert.equal(feasibility.hasSignificantRiskIncrease(before, after), false);
});

test('checking failure produces an explicit non-blocking status result', () => {
  const result = feasibility.unavailableFeasibilityResult('Test checker error');
  assert.equal(result.status, 'INSUFFICIENT_DATA');
  assert.equal(result.warnings[0].code, 'feasibility_check_unavailable');
  assert.equal(feasibility.requiresFeasibilityConfirmation(result), false);
});

test('catalogue normalization preserves real visit duration, opening hours, and price unit', () => {
  const poiSource = readFileSync(new URL('../src/data/pois.ts', import.meta.url), 'utf8');
  const poiCode = ts.transpileModule(poiSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const poiModule = {};
  vm.runInNewContext(poiCode, { exports: poiModule, Date, Intl, Math, Number, String, Array, Set, Map, Object, JSON, RegExp, URL });
  const normalized = poiModule.normalizePoi({
    id: 'normalized-1', name: 'POI thật', category: 'Food', city: 'Đà Nẵng',
    latitude: 16.05, longitude: 108.22, average_visit_minutes: 45,
    estimated_cost: 125000, price_unit: 'per_person',
    opening_hours: { weekday_text: allWeek },
  });
  assert.equal(normalized.average_visit_minutes, 45);
  assert.equal(normalized.priceUnit, 'per_person');
  assert.deepEqual(Array.from(normalized.opening_hours.weekday_text), allWeek);
});

test('recommendation add remains a trip idea action and does not create itinerary stops', () => {
  const overview = readFileSync(new URL('../src/components/planner/TripOverviewView.tsx', import.meta.url), 'utf8');
  const addStart = overview.indexOf('const handleAddRecommendedPoi');
  const addEnd = overview.indexOf('\n  };', addStart);
  const handler = overview.slice(addStart, addEnd);
  assert.ok(handler.includes('requestIdeaAddition(next, [poi])'));
  assert.ok(handler.includes('onUpdateTrip?.({ ...trip, ideas: next })'));
  assert.ok(!handler.includes('editSavedPlan'));
  assert.ok(!handler.includes('stopFromPoi'));
});

test('both add entry points wait for explicit confirmation on a newly significant risk', () => {
  const overview = readFileSync(new URL('../src/components/planner/TripOverviewView.tsx', import.meta.url), 'utf8');
  const explore = readFileSync(new URL('../src/pages/ExplorePage.tsx', import.meta.url), 'utf8');
  const addModal = readFileSync(new URL('../src/components/planner/AddToTripModal.tsx', import.meta.url), 'utf8');
  assert.ok(overview.includes('hasSignificantRiskIncrease(before, after)'));
  assert.ok(overview.includes('setPendingFeasibilityAction({ kind: \'add-ideas\''));
  assert.ok(explore.includes('setPendingFeasibilityAction({ kind: \'add-to-trip\''));
  assert.ok(addModal.includes('if (committed === false) return;'));
  assert.ok(explore.includes('confirmFeasibilityAdd'));
});

test('a checker failure reports status and does not block POI addition or schedule entry', () => {
  const overview = readFileSync(new URL('../src/components/planner/TripOverviewView.tsx', import.meta.url), 'utf8');
  const explore = readFileSync(new URL('../src/pages/ExplorePage.tsx', import.meta.url), 'utf8');
  assert.ok(overview.includes('showFeasibilityUnavailableNotice(after)'));
  assert.ok(overview.includes('return false;\n    }\n    const signature = feasibilityWarningSignature(after);'));
  assert.ok(overview.includes('continueScheduleEntry(kind, result);\n      return;'));
  assert.ok(explore.includes('commitTripPlaces(tripId, poiIds, false);\n        return true;'));
  assert.ok(explore.includes('chuyến đi vẫn được tạo với các POI bạn đã chọn'));
});

test('creating a trip with selected POIs keeps the form open for confirmation without presenting an error', () => {
  const explore = readFileSync(new URL('../src/pages/ExplorePage.tsx', import.meta.url), 'utf8');
  const createModal = readFileSync(new URL('../src/components/planner/CreateTripMindtripModal.tsx', import.meta.url), 'utf8');
  assert.ok(explore.includes("setPendingFeasibilityAction({ kind: 'create-trip', trip, result: after })"));
  assert.ok(explore.includes('return false;'));
  assert.ok(!explore.includes('Xem cảnh báo tính khả thi để tiếp tục tạo chuyến đi.'));
  assert.ok(createModal.includes('if (result === false) closeAfterCreate = false;'));
  assert.ok(createModal.includes('if (closeAfterCreate) onClose();'));
});

test('cancel leaves the pending add unapplied and the feasibility pass only reads confirmed itinerary stops', () => {
  const overview = readFileSync(new URL('../src/components/planner/TripOverviewView.tsx', import.meta.url), 'utf8');
  const explore = readFileSync(new URL('../src/pages/ExplorePage.tsx', import.meta.url), 'utf8');
  const confirmStart = overview.indexOf('const confirmPendingFeasibilityAction');
  const confirmEnd = overview.indexOf('\n  };', confirmStart);
  const confirmHandler = overview.slice(confirmStart, confirmEnd);
  assert.ok(confirmHandler.includes('setTripIdeas(action.ideas)'));
  assert.ok(overview.includes('onCancel={() => setPendingFeasibilityAction(null)}'));
  assert.ok(explore.includes('onCancel={() => setPendingFeasibilityAction(null)}'));
  assert.ok(explore.includes('commitTripPlaces(pendingFeasibilityAction.tripId, pendingFeasibilityAction.poiIds, false)'));
  const assessmentStart = overview.indexOf('const evaluateIdeas =');
  const assessmentEnd = overview.indexOf('\n  };', assessmentStart);
  const assessment = overview.slice(assessmentStart, assessmentEnd);
  assert.ok(assessment.includes('itineraryPlan.days.flatMap'));
  assert.ok(!assessment.includes('editSavedPlan'));
  assert.ok(!assessment.includes('saveTripItinerary'));
});

test('accepted ideas continue through the existing Trip Workspace autosave path', () => {
  const explore = readFileSync(new URL('../src/pages/ExplorePage.tsx', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../src/services/tripWorkspace.ts', import.meta.url), 'utf8');
  assert.ok(explore.includes('setUserTrips((prev) => prev.map((trip) => trip.id === tripId ? updateTripPlaces(trip) : trip))'));
  assert.ok(explore.includes('ideas: Array.from(ideas)'));
  assert.ok(explore.includes('void saveTripWorkspace(trip)'));
  assert.ok(workspace.includes('body: JSON.stringify({data: bodyOf(trip), expected_revision: revision})'));
});

test('itinerary preview entry points run a feasibility assessment before opening schedule generation', () => {
  const overview = readFileSync(new URL('../src/components/planner/TripOverviewView.tsx', import.meta.url), 'utf8');
  assert.ok(overview.includes("requestScheduleEntry('assistant')"));
  assert.ok(overview.includes("requestScheduleEntry('manual')"));
  assert.ok(overview.includes('<FeasibilitySummary result={itineraryFeasibilityResult} />'));
});
