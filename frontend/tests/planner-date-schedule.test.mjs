import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => dependencies[name], Intl, Date, console, atob: globalThis.atob, ...globals });
  return exports;
}
const dates = load('../src/utils/tripDates.ts');

test('Landing sample opens only after its complete plan syncs to the account', async () => {
  const draft = {
    plan: [{ dayNumber: 1, title: 'Ngày 1', stops: [{ placeId: 'poi-1', timeSlot: '08:30 – 10:00' }] }],
    places: [{ id: 'poi-1', photos: [{ src: '/images/poi-1.jpg' }], poi: { id: 'poi-1', name: 'Điểm mẫu', city: 'Đà Nẵng' } }],
    destination: 'danang',
    days: 1,
  };
  let savedPlan;
  let saveCalls = 0;
  const dependencies = {
    '@/utils/tripDates': { dateAt: () => '2026-12-01', vietnamNow: () => ({ date: '2026-11-27', minutes: 600 }) },
    '@/services/auth': { getAccessToken: () => 'test-token' },
    '@/services/itineraryService': {
      stopFromPoi: (poi) => ({ poi_id: poi.id, title: poi.name }),
      saveTripItineraryWithStatus: async (plan) => {
        saveCalls++;
        savedPlan = plan;
        return { itinerary: plan, syncStatus: 'synced' };
      },
    },
  };
  const service = load('../src/services/saveLandingSample.ts', dependencies);

  const trip = await service.saveLandingSample(draft, 'sample-account-trip', 'test-token');
  assert.equal(trip.id, 'sample-account-trip');
  assert.equal(saveCalls, 1);
  assert.equal(savedPlan.days[0].stops.length, 1);
  assert.equal(savedPlan.days[0].stops[0].start_time, '08:30');
  assert.equal(savedPlan.days[0].stops[0].end_time, '10:00');

  const offlineService = load('../src/services/saveLandingSample.ts', {
    ...dependencies,
    '@/services/itineraryService': {
      ...dependencies['@/services/itineraryService'],
      saveTripItineraryWithStatus: async (plan) => ({
        itinerary: plan,
        syncStatus: 'local',
        syncMessage: 'Máy chủ lỗi; bản nháp còn trên thiết bị.',
      }),
    },
  });
  await assert.rejects(
    offlineService.saveLandingSample(draft, 'sample-offline-trip', 'test-token'),
    /Máy chủ lỗi; bản nháp còn trên thiết bị/,
  );
});

test('Vietnam date boundary, inclusive range, legacy dates and flexible trips', () => {
  assert.equal(dates.vietnamNow(new Date('2026-11-13T23:30:00Z')).date, '2026-11-14');
  assert.equal(dates.vietnamNow(new Date('2026-11-13T11:30:00Z')).minutes, 1110);
  assert.equal(dates.dateAt('2026-12-30', 3), '2027-01-02');
  assert.equal(dates.tripStartDate('Ngày 20 – 23 tháng 11, 2027'), '2027-11-20');
  assert.equal(dates.tripStartDate('30/12 - 2/1, 2026 (4 ngày)'), '2026-12-30');
  assert.equal(dates.tripStartDate('4 ngày • Tháng 11'), null);
  assert.equal(dates.tripRangeLabel('2026-12-30', 4), '30/12 – 2/1');
});

test('Itinerary session detection recognizes local and session storage login tokens', () => {
  const serviceWithTokens = (localToken, sessionToken) => load(
    '../src/services/itineraryService.ts',
    { '@/utils/tripDates': dates, '@/lib/api': {} },
    {
      localStorage: { getItem: (key) => key === 'access_token' ? localToken : null },
      sessionStorage: { getItem: (key) => key === 'access_token' ? sessionToken : null },
    }
  );

  assert.equal(serviceWithTokens('local-token', null).hasItineraryAccountSession(), true);
  assert.equal(serviceWithTokens(null, 'session-token').hasItineraryAccountSession(), true);
  assert.equal(serviceWithTokens(null, null).hasItineraryAccountSession(), false);
});

test('Alignment recalculates every date, clears flexible dates and preserves occupied overflow', () => {
  const service = load('../src/services/itineraryService.ts', { '@/utils/tripDates': dates, '@/lib/api': {} });
  const trip = { id: 'qa', title: 'QA', destination: 'Huế', startDate: '2026-11-20', daysCount: 4 };
  const plan = service.createEmptyItinerary(trip);
  const shifted = service.alignItineraryToTrip(plan, { ...trip, startDate: '2026-11-21' });
  assert.equal(shifted.itinerary.days[3].date, '2026-11-24');
  const flexible = service.alignItineraryToTrip(plan, { ...trip, startDate: '4 ngày • Linh hoạt' });
  assert.equal(flexible.itinerary.start_date, null);
  assert.ok(flexible.itinerary.days.every((day) => day.date === null));
  plan.days[3].stops.push({ stop_id: 'history', start_time: '10:30', end_time: '11:30' });
  const reduced = service.alignItineraryToTrip(plan, { ...trip, daysCount: 3 });
  assert.ok(reduced.warning);
  assert.equal(reduced.itinerary.days.length, 4);
  assert.equal(reduced.itinerary.days[3].stops[0].stop_id, 'history');
});

test('Saving rejects past edits before local writes, while unchanged history remains readable', async () => {
  const data = new Map();
  const storage = {
    getItem: (key) => (key === 'access_token' ? 'test-session' : data.get(key) || null),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  let requests = 0;
  const fixedDates = { ...dates, vietnamNow: () => ({ date: '2026-11-13', minutes: 1110 }) };
  const service = load(
    '../src/services/itineraryService.ts',
    {
      '@/utils/tripDates': fixedDates,
      '@/lib/api': {
        fetchJson: async () => {
          requests++;
          throw Object.assign(new Error('No previous itinerary'), { status: 404 });
        },
      },
    },
    { localStorage: storage }
  );
  const trip = { id: 'qa', title: 'QA', destination: 'Huế', startDate: '2026-11-13', daysCount: 1 };
  const plan = service.createEmptyItinerary(trip);
  plan.days[0].stops.push({ stop_id: 'history', start_time: '10:30', end_time: '11:30' });
  assert.equal(service.scheduleError(plan, plan), '');
  assert.ok(service.scheduleError(plan, null));
  await assert.rejects(service.saveTripItinerary(plan), /quá khứ/);
  assert.equal(data.size, 0);
  assert.equal(requests, 1);
});

test('Expired trip shift forward (10-13 Nov -> 16-19 Nov) preserves morning stops and syncs cleanly', async () => {
  const data = new Map();
  const storage = {
    getItem: (key) => (key === 'access_token' ? 'test-session' : data.get(key) || null),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  let apiSaves = 0;
  const fixedDates = { ...dates, vietnamNow: () => ({ date: '2026-11-16', minutes: 703 }) };
  const service = load(
    '../src/services/itineraryService.ts',
    {
      '@/utils/tripDates': fixedDates,
      '@/lib/api': {
        fetchJson: async (_url, options) => {
          if (options?.method !== 'POST') return pastPlan;
          apiSaves++;
          return JSON.parse(options.body);
        },
      },
    },
    { localStorage: storage }
  );

  const pastTrip = { id: 'trip-past', title: 'Chuyến đi Đà Nẵng', destination: 'Đà Nẵng', startDate: '2026-11-10', daysCount: 4 };
  const pastPlan = service.createEmptyItinerary(pastTrip);
  pastPlan.days[0].stops.push({ stop_id: 's1', title: 'Bán đảo Sơn Trà', sequence: 0, start_time: '08:30', end_time: '10:00' });
  pastPlan.days[0].stops.push({ stop_id: 's2', title: 'Cầu Rồng', sequence: 1, start_time: '14:00', end_time: '15:30' });
  pastPlan.days[1].stops.push({ stop_id: 's3', title: 'Bà Nà Hills', sequence: 0, start_time: '09:00', end_time: '16:00' });
  storage.setItem('greentrip_itinerary_trip-past', JSON.stringify(pastPlan));

  const updatedTrip = { ...pastTrip, startDate: '2026-11-16' };
  const aligned = service.alignItineraryToTrip(pastPlan, updatedTrip);

  assert.equal(aligned.itinerary.start_date, '2026-11-16');
  assert.equal(aligned.itinerary.days[0].date, '2026-11-16');
  assert.equal(aligned.itinerary.days[1].date, '2026-11-17');
  assert.equal(aligned.itinerary.days[2].date, '2026-11-18');
  assert.equal(aligned.itinerary.days[3].date, '2026-11-19');

  const error = service.scheduleError(aligned.itinerary, pastPlan);
  assert.equal(error, '', 'Shifting entire trip forward to today must not fail with past-time error for existing stops');

  const saved = await service.saveTripItinerary(aligned.itinerary);
  assert.equal(saved.start_date, '2026-11-16');
  assert.equal(apiSaves, 1);
  assert.ok([...data.keys()].some((key) => key.startsWith('greentrip_itinerary_account-') && key.endsWith('_trip-past')));

  const planWithNewPastStop = JSON.parse(JSON.stringify(aligned.itinerary));
  planWithNewPastStop.days[0].stops.push({ stop_id: 's_new', title: 'Chợ Hàn', sequence: 2, start_time: '09:30', end_time: '11:00' });
  assert.ok(service.scheduleError(planWithNewPastStop, aligned.itinerary).includes('quá khứ'));

  const planShiftedBack = JSON.parse(JSON.stringify(aligned.itinerary));
  planShiftedBack.start_date = '2026-11-12';
  planShiftedBack.days.forEach((day, idx) => {
    day.date = fixedDates.dateAt('2026-11-12', idx);
  });
  assert.ok(service.scheduleError(planShiftedBack, pastPlan).includes('quá khứ'));

  const planMovedStopInPast = JSON.parse(JSON.stringify(pastPlan));
  const moving = planMovedStopInPast.days[0].stops.pop();
  planMovedStopInPast.days[1].stops.push({ ...moving, sequence: planMovedStopInPast.days[1].stops.length });
  assert.equal(service.scheduleError(planMovedStopInPast, pastPlan), '', 'Moving existing stop between days in expired trip should succeed');
});

test('Itinerary save reports server sync separately and restores an offline draft', async () => {
  const syncedData = new Map();
  const syncedStorage = {
    getItem: (key) => (key === 'access_token' ? 'test-session' : syncedData.get(key) || null),
    setItem: (key, value) => syncedData.set(key, value),
    removeItem: (key) => syncedData.delete(key),
  };
  const syncedService = load(
    '../src/services/itineraryService.ts',
    {
      '@/utils/tripDates': dates,
      '@/lib/api': {
        fetchJson: async (url, options) => {
          assert.equal(url, '/my-trips');
          if (options?.method === 'POST') return { ...JSON.parse(options.body), updated_at: '2026-11-25T10:00:00.000Z' };
          throw Object.assign(new Error('No itinerary yet'), { status: 404 });
        },
      },
    },
    { localStorage: syncedStorage },
  );
  const plan = syncedService.createEmptyItinerary({ id: 'sync-test', title: 'Sync test', destination: 'Huế', daysCount: 2 });
  const synced = await syncedService.saveTripItineraryWithStatus(plan);
  assert.equal(synced.syncStatus, 'synced');
  assert.equal([...syncedData.keys()].some((key) => key.startsWith('greentrip_itinerary_pending_account-')), false);
  assert.ok([...syncedData.keys()].some((key) => key.startsWith('greentrip_itinerary_account-') && key.endsWith('_sync-test')));

  const offlineData = new Map();
  const offlineStorage = {
    getItem: (key) => (key === 'access_token' ? 'test-session' : offlineData.get(key) || null),
    setItem: (key, value) => offlineData.set(key, value),
    removeItem: (key) => offlineData.delete(key),
  };
  const offlineService = load(
    '../src/services/itineraryService.ts',
    {
      '@/utils/tripDates': dates,
      '@/lib/api': {
        fetchJson: async (_url, options) => {
          if (options?.method === 'POST') throw new TypeError('Failed to fetch');
          throw Object.assign(new Error('No itinerary yet'), { status: 404 });
        },
      },
    },
    { localStorage: offlineStorage },
  );
  const offlinePlan = offlineService.createEmptyItinerary({ id: 'offline-test', title: 'Offline test', destination: 'Huế', daysCount: 2 });
  const offline = await offlineService.saveTripItineraryWithStatus(offlinePlan);
  assert.equal(offline.syncStatus, 'local');
  assert.ok([...offlineData.keys()].some((key) => key.startsWith('greentrip_itinerary_pending_account-') && key.endsWith('_offline-test')));
  const restored = await offlineService.getTripItinerary('offline-test');
  assert.equal(restored.trip_id, 'offline-test');
  assert.equal(restored.days.length, 2);
});

test('Guest saves an itinerary locally without calling the account API', async () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  let requests = 0;
  const service = load(
    '../src/services/itineraryService.ts',
    {
      '@/utils/tripDates': dates,
      '@/lib/api': { fetchJson: async () => { requests++; throw new Error('Guests should not call the account API'); } },
    },
    { localStorage: storage },
  );
  const plan = service.createEmptyItinerary({ id: 'guest-save', title: 'Guest trip', destination: 'Huế', daysCount: 2 });

  const result = await service.saveTripItineraryWithStatus(plan);
  assert.equal(result.syncStatus, 'guest');
  assert.equal(requests, 0);
  assert.ok(data.has('greentrip_itinerary_guest-save'));
  assert.ok(data.has('greentrip_itinerary_pending_guest-save'));

  const restored = await service.getTripItinerary('guest-save');
  assert.equal(restored.trip_id, 'guest-save');
  assert.equal(requests, 0);
});

test('Server 500 keeps the draft on-device and reports that sync can be retried', async () => {
  const data = new Map();
  const storage = {
    getItem: (key) => (key === 'access_token' ? 'test-session' : data.get(key) || null),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const service = load(
    '../src/services/itineraryService.ts',
    {
      '@/utils/tripDates': dates,
      '@/lib/api': {
        fetchJson: async (_url, options) => {
          if (options?.method === 'POST') throw Object.assign(new Error('Request failed with status 500'), { status: 500 });
          throw Object.assign(new Error('No itinerary yet'), { status: 404 });
        },
      },
    },
    { localStorage: storage },
  );
  const plan = service.createEmptyItinerary({ id: 'server-error', title: 'Retry trip', destination: 'Đà Nẵng', daysCount: 1 });

  const result = await service.saveTripItineraryWithStatus(plan);
  assert.equal(result.syncStatus, 'local');
  assert.match(result.syncMessage, /lỗi \(500\)/i);
  assert.ok([...data.keys()].some((key) => key.startsWith('greentrip_itinerary_account-') && key.endsWith('_server-error')));
  assert.ok([...data.keys()].some((key) => key.startsWith('greentrip_itinerary_pending_account-') && key.endsWith('_server-error')));

  const restored = await service.getTripItinerary('server-error');
  assert.equal(restored.trip_id, 'server-error');
});

test('Retry sends the retained account draft again and clears it only after a successful server response', async () => {
  const data = new Map();
  const storage = {
    getItem: (key) => key === 'access_token' ? 'test-session' : data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  let attempts = 0;
  let remoteTrip = null;
  const service = load(
    '../src/services/itineraryService.ts',
    {
      '@/utils/tripDates': dates,
      '@/lib/api': {
        fetchJson: async (url, options = {}) => {
          if (url === '/my-trips' && options.method === 'POST') {
            attempts++;
            if (attempts === 1) throw Object.assign(new Error('Database unavailable'), { status: 503 });
            remoteTrip = { ...JSON.parse(options.body), updated_at: '2026-11-26T00:00:00.000Z' };
            return remoteTrip;
          }
          if (remoteTrip) return remoteTrip;
          throw Object.assign(new Error('Not found'), { status: 404 });
        },
      },
    },
    { localStorage: storage },
  );
  const plan = service.createEmptyItinerary({ id: 'retry-account-trip', title: 'Retry after outage', destination: 'Đà Nẵng', daysCount: 1 });

  const failed = await service.saveTripItineraryWithStatus(plan);
  assert.equal(failed.syncStatus, 'local');
  assert.equal(service.hasPendingItinerarySync(plan.trip_id), true);

  const retried = await service.saveTripItineraryWithStatus(plan);
  assert.equal(retried.syncStatus, 'synced');
  assert.equal(attempts, 2);
  assert.equal(service.hasPendingItinerarySync(plan.trip_id), false);
  assert.equal((await service.getTripItinerary(plan.trip_id)).title, 'Retry after outage');
});

test('A recovered local draft does not bypass past-time validation against the saved itinerary', async () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  let writes = 0;
  const fixedDates = { ...dates, vietnamNow: () => ({ date: '2026-11-13', minutes: 1110 }) };
  const service = load(
    '../src/services/itineraryService.ts',
    {
      '@/utils/tripDates': fixedDates,
      '@/lib/api': {
        fetchJson: async (_url, options) => {
          if (options?.method === 'POST') writes++;
          throw Object.assign(new Error('No saved itinerary'), { status: 404 });
        },
      },
    },
    { localStorage: storage },
  );
  const plan = service.createEmptyItinerary({ id: 'pending-past-edit', title: 'Past edit', destination: 'Huế', startDate: '2026-11-13', daysCount: 1 });
  plan.days[0].stops.push({ stop_id: 'new-past-stop', start_time: '10:30', end_time: '11:30' });
  service.cachePendingItinerary(plan);

  await assert.rejects(service.saveTripItineraryWithStatus(plan), /quá khứ/);
  assert.equal(writes, 0, 'Invalid past-time changes never reach the API');
  assert.ok(data.has('greentrip_itinerary_pending_pending-past-edit'), 'The draft is retained so the user can correct it');
});

test('Account itineraries use the authenticated /my-trips API and stay isolated across sign-out/account changes', async () => {
  const data = new Map();
  let activeToken = jwtFor('account-a');
  const storage = {
    getItem: (key) => key === 'access_token' ? activeToken : data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const serverTrips = new Map();
  const requests = [];
  const service = load(
    '../src/services/itineraryService.ts',
    {
      '@/utils/tripDates': dates,
      '@/lib/api': {
        fetchJson: async (url, options = {}) => {
          requests.push({ url, options });
          const userId = options.headers?.Authorization?.split('.')[1];
          const account = userId ? JSON.parse(globalThis.atob(userId)).sub : 'unknown';
          const tripId = options.method === 'POST'
            ? JSON.parse(options.body).trip_id
            : decodeURIComponent(url.split('/').at(-1));
          const key = `${account}:${tripId}`;
          if (options.method === 'POST') {
            const saved = { ...JSON.parse(options.body), updated_at: '2026-11-26T00:00:00.000Z' };
            serverTrips.set(key, saved);
            return saved;
          }
          const saved = serverTrips.get(key);
          if (!saved) throw Object.assign(new Error('Not found'), { status: 404 });
          return saved;
        },
      },
    },
    { localStorage: storage },
  );
  const plan = service.createEmptyItinerary({ id: 'shared-trip-id', title: 'Account A trip', destination: 'Huế', daysCount: 1 });

  const saved = await service.saveTripItineraryWithStatus(plan);
  assert.equal(saved.syncStatus, 'synced');
  assert.ok(requests.some(({ url, options }) => url === '/my-trips' && options.method === 'POST'));

  activeToken = null;
  await assert.rejects(service.getTripItinerary(plan.trip_id), { status: 404 });

  activeToken = jwtFor('account-b');
  await assert.rejects(service.getTripItinerary(plan.trip_id), { status: 404 });

  activeToken = jwtFor('account-a');
  const restored = await service.getTripItinerary(plan.trip_id);
  assert.equal(restored.title, 'Account A trip');
  assert.ok(requests.filter(({ url }) => url.startsWith('/my-trips/')).every(({ options }) => options.headers.Authorization.startsWith('Bearer ')));
});

test('Legacy unsynced drafts migrate only when the signed-in account already owns that trip', async () => {
  const data = new Map();
  let activeToken = jwtFor('account-a');
  const storage = {
    getItem: (key) => key === 'access_token' ? activeToken : data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  let savedRequests = 0;
  const service = load(
    '../src/services/itineraryService.ts',
    {
      '@/utils/tripDates': dates,
      '@/lib/api': {
        fetchJson: async (_url, options = {}) => {
          if (options.method === 'POST') {
            savedRequests++;
            return { ...JSON.parse(options.body), updated_at: '2026-11-26T00:00:00.000Z' };
          }
          throw Object.assign(new Error('Not found'), { status: 404 });
        },
      },
    },
    { localStorage: storage },
  );
  const plan = service.createEmptyItinerary({ id: 'legacy-owned-trip', title: 'Recovered', destination: 'Huế', daysCount: 1 });
  data.set('greentrip_user_trips:account-a', JSON.stringify([{ id: plan.trip_id }]));
  data.set(`greentrip_itinerary_pending_${plan.trip_id}`, JSON.stringify(plan));

  assert.equal((await service.getTripItinerary(plan.trip_id)).title, 'Recovered');
  assert.ok([...data.keys()].some((key) => key.startsWith('greentrip_itinerary_pending_account-') && key.endsWith('_legacy-owned-trip')));

  activeToken = jwtFor('account-b');
  await assert.rejects(service.getTripItinerary(plan.trip_id), { status: 404 });

  activeToken = jwtFor('account-a');
  const result = await service.saveTripItineraryWithStatus(plan);
  assert.equal(result.syncStatus, 'synced');
  assert.equal(savedRequests, 1);
  assert.equal(data.has(`greentrip_itinerary_pending_${plan.trip_id}`), false);
});

function jwtFor(sub) {
  return `header.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.signature`;
}
