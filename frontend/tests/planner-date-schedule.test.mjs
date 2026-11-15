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
