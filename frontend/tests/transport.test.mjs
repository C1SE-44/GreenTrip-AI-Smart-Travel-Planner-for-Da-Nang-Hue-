import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadTransportService(fetchJson) {
  const source = fs.readFileSync(path.resolve('src/services/transport.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({ fetchJson }) });
  return exports;
}

function trip() {
  return {
    id: 'trip-a',
    peopleCount: 3,
    adultCount: 2,
    childCount: 1,
    infantCount: 0,
    petCount: 1,
    accommodationPlan: {
      version: 1,
      groups: [{
        groupId: 'hue-group',
        city: 'Huế',
        dayNumbers: [1],
        nights: 1,
        nightsStatus: 'ESTIMATED',
        itineraryVariantId: 'confirmed',
        itinerarySignature: 'sig',
        status: 'SELECTED',
        stayId: 'stay-hue',
        name: 'Stay Hue',
        latitude: 16.46,
        longitude: 107.59,
      }],
    },
  };
}

function itinerary() {
  return {
    trip_id: 'trip-a',
    title: 'Trip',
    destination: 'Đà Nẵng & Huế',
    start_date: '2026-12-01',
    days_count: 1,
    days: [{
      day_number: 1,
      date: '2026-12-01',
      title: '',
      day_id: 'day-1',
      stops: [
        { stop_id: 's1', poi_id: 'p1', title: 'POI A', city: 'Huế', stop_type: 'poi', latitude: 16.45, longitude: 107.58 },
        { stop_id: 'rest', poi_id: null, title: 'Ăn trưa', city: 'Huế', stop_type: 'rest', latitude: null, longitude: null },
        { stop_id: 's2', poi_id: 'p2', title: 'POI B', city: 'Huế', stop_type: 'custom', latitude: 16.46, longitude: 107.59 },
      ],
    }],
  };
}

test('transport preview sends itinerary, selected stays and explicit traveler counts to the transport API', async () => {
  const calls = [];
  const api = loadTransportService(async (endpoint, init) => {
    calls.push({ endpoint, init, body: JSON.parse(init.body) });
    return { status: 'success', legs: [] };
  });
  const request = api.buildTransportPreviewRequest(trip(), itinerary());
  await api.previewTransport(request);

  assert.equal(calls[0].endpoint, '/api/transport/preview');
  assert.equal(calls[0].body.alternative_id, 'confirmed');
  assert.equal(calls[0].body.travelers.adult_count, 2);
  assert.equal(calls[0].body.travelers.child_count, 1);
  assert.equal(calls[0].body.travelers.pet_count, 1);
  assert.deepEqual(calls[0].body.accommodation_groups[0], {
    group_id: 'hue-group',
    city: 'Huế',
    status: 'SELECTED',
    name: 'Stay Hue',
    stay_id: 'stay-hue',
    latitude: 16.46,
    longitude: 107.59,
    day_numbers: [1],
  });
  assert.deepEqual(calls[0].body.itinerary.days[0].stops.map((stop) => stop.poi_id), ['p1', 'p2']);
});

test('transport selection is confirmed only when explicitly applied and keeps at most two alternatives', () => {
  const api = loadTransportService(async () => ({}));
  const existing = {
    version: 1,
    confirmedAlternatives: [
      { alternativeId: 'old-one', itineraryFingerprint: 'a'.repeat(64), selections: [] },
      { alternativeId: 'old-two', itineraryFingerprint: 'b'.repeat(64), selections: [] },
    ],
  };
  const next = api.buildConfirmedTransportPlan(
    existing,
    'confirmed',
    'c'.repeat(64),
    { 'leg-id': 'CAR' },
    '2026-11-22T09:00:00+07:00',
  );

  assert.equal(next.confirmedAlternatives.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(next.confirmedAlternatives.map((item) => item.alternativeId))), ['old-two', 'confirmed']);
  assert.deepEqual(JSON.parse(JSON.stringify(next.confirmedAlternatives[1].selections)), [{
    legId: 'leg-id',
    mode: 'CAR',
    selectedAt: '2026-11-22T09:00:00+07:00',
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(api.currentTransportSelections(next, 'confirmed', 'c'.repeat(64)))), { 'leg-id': 'CAR' });
  assert.deepEqual(JSON.parse(JSON.stringify(api.currentTransportSelections(next, 'confirmed', 'd'.repeat(64)))), {});
});

test('routed roads, labeled heuristics and complete train options can be selected', () => {
  const api = loadTransportService(async () => ({}));
  const option = {
    mode: 'CAR',
    availability: 'AVAILABLE',
    route_status: 'ROUTED',
    distance_meters: 2000,
    train_departure_at: null,
    train_arrival_at: null,
    train_ticket_status: null,
  };
  assert.equal(api.canSelectTransportOption(option), true);
  assert.equal(api.canSelectTransportOption({ ...option, availability: 'UNAVAILABLE' }), false);
  assert.equal(api.canSelectTransportOption({ ...option, availability: 'ESTIMATE_UNVERIFIED', route_status: 'UNKNOWN' }), false);
  assert.equal(api.canSelectTransportOption({ ...option, availability: 'ESTIMATE_UNVERIFIED', route_status: 'HEURISTIC' }), true);

  const trainOption = {
    ...option,
    mode: 'TRAIN',
    availability: 'AVAILABLE',
    route_status: 'UNKNOWN',
    train_departure_at: '2026-12-01T08:00:00+07:00',
    train_arrival_at: '2026-12-01T10:00:00+07:00',
    train_door_to_door_seconds: 9000,
    train_ticket_status: 'NOT_CONFIRMED',
  };
  assert.equal(api.canSelectTransportOption(trainOption), true);
  assert.equal(api.canSelectTransportOption({ ...trainOption, train_door_to_door_seconds: null }), false);
  assert.equal(api.canSelectTransportOption({ ...trainOption, availability: 'UNAVAILABLE' }), false);
  assert.equal(api.canSelectTransportOption({
    ...trainOption,
    availability: 'USER_PROVIDED',
    train_door_to_door_seconds: null,
  }), true);
});

test('panel distinguishes loading, empty and API error and requires explicit Workspace apply', () => {
  const panel = fs.readFileSync(path.resolve('src/components/planner/TransportOptionsPanel.tsx'), 'utf8');
  const workspace = fs.readFileSync(path.resolve('src/pages/ExplorePage.tsx'), 'utf8');
  const itineraryView = fs.readFileSync(path.resolve('src/components/planner/TripItineraryView.tsx'), 'utf8');

  assert.ok(panel.includes('Đang tải chặng di chuyển'));
  assert.ok(panel.includes('Chưa có chặng đủ hai điểm để tính'));
  assert.ok(panel.includes('Chưa tải được lựa chọn di chuyển'));
  assert.ok(panel.includes('Xác nhận & lưu phương tiện'));
  assert.ok(panel.includes('saveTripWorkspace({ ...trip, transportPlan })'));
  assert.ok(panel.includes('previewTransport(JSON.parse(requestKey)'));
  assert.ok(panel.includes('controller.abort()'));
  assert.ok(panel.includes('First-mile ({mileSourceLabel'));
  assert.ok(panel.includes('Last-mile ({mileSourceLabel'));
  assert.ok(panel.includes('option.estimated_fare !== null'));
  assert.ok(!panel.includes('option.estimated_fare ?? 0'));
  assert.ok(panel.includes('không đổi POI, thứ tự hoặc thời gian itinerary'));
  assert.ok(workspace.includes('transportPlan?: TripTransportPlan'));
  assert.ok(itineraryView.includes('<TransportOptionsPanel'));
  assert.ok(!panel.includes('applyAssistant('));
  assert.ok(!panel.includes('saveTripItinerary('));
});
