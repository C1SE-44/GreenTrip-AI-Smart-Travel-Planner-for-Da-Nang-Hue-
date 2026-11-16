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
  vm.runInNewContext(code, { exports, require: name => dependencies[name], Intl, Date, console, ...globals });
  return exports;
}
const dates = load('../src/utils/tripDates.ts');

test('Vietnam date boundary, inclusive range, legacy dates and flexible trips', () => {
  assert.equal(dates.vietnamNow(new Date('2026-11-13T23:30:00Z')).date, '2026-11-14');
  assert.equal(dates.vietnamNow(new Date('2026-11-13T11:30:00Z')).minutes, 1110);
  assert.equal(dates.dateAt('2026-12-30', 3), '2027-01-02');
  assert.equal(dates.tripStartDate('Ngày 20 – 23 tháng 11, 2027'), '2027-11-20');
  assert.equal(dates.tripStartDate('30/12 - 2/1, 2026 (4 ngày)'), '2026-12-30');
  assert.equal(dates.tripStartDate('4 ngày • Tháng 11'), null);
  assert.equal(dates.tripRangeLabel('2026-12-30', 4), '30/12 – 2/1');
});

test('Alignment recalculates every date, clears flexible dates and preserves occupied overflow', () => {
  const service = load('../src/services/itineraryService.ts', { '@/utils/tripDates': dates, '@/lib/api': {} });
  const trip = { id: 'qa', title: 'QA', destination: 'Huế', startDate: '2026-11-20', daysCount: 4 };
  const plan = service.createEmptyItinerary(trip);
  const shifted = service.alignItineraryToTrip(plan, { ...trip, startDate: '2026-11-21' });
  assert.equal(shifted.itinerary.days[3].date, '2026-11-24');
  const flexible = service.alignItineraryToTrip(plan, { ...trip, startDate: '4 ngày • Linh hoạt' });
  assert.equal(flexible.itinerary.start_date, null);
  assert.ok(flexible.itinerary.days.every(day => day.date === null));
  plan.days[3].stops.push({ stop_id: 'history', start_time: '10:30', end_time: '11:30' });
  const reduced = service.alignItineraryToTrip(plan, { ...trip, daysCount: 3 });
  assert.ok(reduced.warning);
  assert.equal(reduced.itinerary.days.length, 4);
  assert.equal(reduced.itinerary.days[3].stops[0].stop_id, 'history');
});

test('Saving rejects past edits before local writes, while unchanged history remains readable', async () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  let requests = 0;
  const fixedDates = { ...dates, vietnamNow: () => ({ date: '2026-11-13', minutes: 1110 }) };
  const service = load('../src/services/itineraryService.ts', {
    '@/utils/tripDates': fixedDates,
    '@/lib/api': { fetchJson: async () => { requests++; throw new Error('Unexpected API call'); } },
  }, { localStorage: storage });
  const trip = { id: 'qa', title: 'QA', destination: 'Huế', startDate: '2026-11-13', daysCount: 1 };
  const plan = service.createEmptyItinerary(trip);
  plan.days[0].stops.push({ stop_id: 'history', start_time: '10:30', end_time: '11:30' });
  assert.equal(service.scheduleError(plan, plan), '');
  assert.ok(service.scheduleError(plan, null));
  await assert.rejects(service.saveTripItinerary(plan), /quá khứ/);
  assert.equal(data.size, 0);
  assert.equal(requests, 0);
});

test('Expired trip shift forward (10-13 Nov -> 16-19 Nov) preserves morning stops and syncs cleanly', async () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  let apiSaves = 0;
  // Today is 2026-11-16 11:43 (minutes = 703)
  const fixedDates = { ...dates, vietnamNow: () => ({ date: '2026-11-16', minutes: 703 }) };
  const service = load('../src/services/itineraryService.ts', {
    '@/utils/tripDates': fixedDates,
    '@/lib/api': {
      fetchJson: async (url, options) => {
        apiSaves++;
        return JSON.parse(options.body);
      },
    },
  }, { localStorage: storage });

  // 1. Existing past trip (10 - 13 Nov 2026)
  const pastTrip = { id: 'trip-past', title: 'Chuyến đi Đà Nẵng', destination: 'Đà Nẵng', startDate: '2026-11-10', daysCount: 4 };
  const pastPlan = service.createEmptyItinerary(pastTrip);
  pastPlan.days[0].stops.push({ stop_id: 's1', title: 'Bán đảo Sơn Trà', sequence: 0, start_time: '08:30', end_time: '10:00' });
  pastPlan.days[0].stops.push({ stop_id: 's2', title: 'Cầu Rồng', sequence: 1, start_time: '14:00', end_time: '15:30' });
  pastPlan.days[1].stops.push({ stop_id: 's3', title: 'Bà Nà Hills', sequence: 0, start_time: '09:00', end_time: '16:00' });
  storage.setItem('greentrip_itinerary_trip-past', JSON.stringify(pastPlan));

  // 2. User shifts trip forward to start on 2026-11-16 (today)
  const updatedTrip = { ...pastTrip, startDate: '2026-11-16' };
  const aligned = service.alignItineraryToTrip(pastPlan, updatedTrip);

  // Day dates are shifted
  assert.equal(aligned.itinerary.start_date, '2026-11-16');
  assert.equal(aligned.itinerary.days[0].date, '2026-11-16');
  assert.equal(aligned.itinerary.days[1].date, '2026-11-17');
  assert.equal(aligned.itinerary.days[2].date, '2026-11-18');
  assert.equal(aligned.itinerary.days[3].date, '2026-11-19');

  // Stop s1 on Day 1 is at 08:30 (before current clock 11:43), but because it is a forward trip roll, scheduleError allows it!
  const error = service.scheduleError(aligned.itinerary, pastPlan);
  assert.equal(error, '', 'Shifting entire trip forward to today must not fail with past-time error for existing stops');

  // Saving succeeds to localStorage and backend
  const saved = await service.saveTripItinerary(aligned.itinerary);
  assert.equal(saved.start_date, '2026-11-16');
  assert.equal(apiSaves, 1);
  assert.ok(storage.getItem('greentrip_itinerary_trip-past'));

  // 3. Adding a new stop in the past (e.g. 09:30 AM today) is still rejected!
  const planWithNewPastStop = JSON.parse(JSON.stringify(aligned.itinerary));
  planWithNewPastStop.days[0].stops.push({ stop_id: 's_new', title: 'Chợ Hàn', sequence: 2, start_time: '09:30', end_time: '11:00' });
  assert.ok(service.scheduleError(planWithNewPastStop, aligned.itinerary).includes('quá khứ'));

  // 4. Shifting trip back into the past (e.g. 2026-11-12) is rejected!
  const planShiftedBack = JSON.parse(JSON.stringify(aligned.itinerary));
  planShiftedBack.start_date = '2026-11-12';
  planShiftedBack.days.forEach((day, idx) => { day.date = fixedDates.dateAt('2026-11-12', idx); });
  assert.ok(service.scheduleError(planShiftedBack, pastPlan).includes('quá khứ'));
});
