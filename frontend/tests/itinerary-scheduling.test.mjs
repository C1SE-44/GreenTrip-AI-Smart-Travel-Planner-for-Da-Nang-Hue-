import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));

async function loadItineraryService() {
  const tripDatesSource = await readFile(path.join(root, 'src/utils/tripDates.ts'), 'utf8');
  const tripDatesCode = ts.transpileModule(tripDatesSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const tripDatesUrl = `data:text/javascript;base64,${Buffer.from(tripDatesCode).toString('base64')}`;

  const source = await readFile(path.join(root, 'src/services/itineraryService.ts'), 'utf8');
  const testableSource = source
    .replace(
      "import { fetchJson } from '@/lib/api';",
      'const fetchJson = async () => { throw new Error("Network is not used by these tests"); };',
    )
    .replace("from '@/utils/tripDates';", `from '${tripDatesUrl}';`);
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}

function makePoi(id, category, index, overrides = {}) {
  return {
    id,
    name: category === 'quan-an' ? `Cà phê ${id}` : `Địa điểm ${id}`,
    city: 'Đà Nẵng',
    category,
    sub_category: category === 'quan-an' ? 'cafe' : '',
    lat: 16 + index * 0.003,
    lng: 108,
    estimatedCost: 0,
    average_visit_minutes: 60,
    visitDuration: '60 phút',
    ...overrides,
  };
}

test('PB11 uses pacing to increase POI count and preserves schedule constraints', async () => {
  const {
    clearOverlappingVisitTimes,
    createEmptyItinerary,
    dailyVisitCapacity,
    optimizeDays,
    selectAutomaticPois,
  } = await loadItineraryService();
  const categories = ['di-tich', 'canh-quan', 'quan-an', 'chua'];
  const ideas = Array.from({ length: 8 }, (_, index) => makePoi(`idea-${index}`, categories[index % 4], index));
  const recommendations = Array.from({ length: 12 }, (_, index) => makePoi(`recommendation-${index}`, categories[index % 4], index + 8));
  const trip = {
    id: 'pb11-scheduling-test',
    title: 'Kiểm thử lịch trình',
    destination: 'Đà Nẵng & Huế',
    daysCount: 4,
    peopleCount: 2,
    totalBudget: 10_000_000,
    costBreakdown: { activities_and_tickets: 5_000_000 },
  };
  const days = createEmptyItinerary(trip).days;
  const counts = ['Relaxed', 'Balanced', 'Fast'].map((pace) => {
    const selection = selectAutomaticPois(days, ideas, recommendations, trip, pace, dailyVisitCapacity(pace));
    const scheduled = optimizeDays(days, selection.selected, dailyVisitCapacity(pace));
    return scheduled.days.flatMap((day) => day.stops).filter((stop) => stop.stop_type !== 'rest').length;
  });
  assert.deepEqual(counts, [8, 12, 20]);

  const cafeIdeas = ['A', 'B', 'C'].map((name, index) => makePoi(`custom-cafe-${name}`, 'quan-an', index, {
    name: `Cà phê ${name}`,
    sub_category: 'cafe',
  }));
  const oneDay = createEmptyItinerary({ ...trip, daysCount: 1 }).days;
  const cafes = optimizeDays(oneDay, cafeIdeas, dailyVisitCapacity('Fast'));
  assert.equal(cafes.days[0].stops.filter((stop) => stop.stop_type === 'custom').length, 2);
  assert.equal(cafes.unassignedCount, 1);

  const appointment = {
    stop_id: 'manual-appointment', poi_id: null, title: 'Cuộc hẹn cố định', city: 'Đà Nẵng',
    address: null, category: 'Địa điểm tự thêm', stop_type: 'custom', source: 'manual', sequence: 0,
    duration_minutes: 60, start_time: '11:00', end_time: '12:00', comment: null,
    latitude: 16, longitude: 108,
  };
  const timedPlan = createEmptyItinerary({ ...trip, daysCount: 1 });
  timedPlan.days[0].stops.push(appointment);
  const timedPois = recommendations.slice(0, 2);
  const timedResult = optimizeDays(timedPlan.days, timedPois, dailyVisitCapacity('Fast'));
  const keptAppointment = timedResult.days[0].stops.find((stop) => stop.stop_id === appointment.stop_id);
  assert.equal(keptAppointment.start_time, '11:00');
  const timedStops = timedResult.days[0].stops.filter((stop) => stop.start_time && stop.end_time);
  assert.ok(timedStops.every((stop, index) => index === 0 || timedStops[index - 1].end_time <= stop.start_time));

  const conflictPlan = createEmptyItinerary({ ...trip, daysCount: 1 });
  conflictPlan.days[0].stops = [
    { ...appointment, stop_id: 'assistant-visit', poi_id: 'assistant-poi', source: 'assistant', start_time: '09:00', end_time: '10:00' },
    { ...appointment, stop_id: 'manual-visit', start_time: '09:30', end_time: '10:30' },
  ];
  const repaired = clearOverlappingVisitTimes(conflictPlan);
  assert.equal(repaired.repairedCount, 1);
  assert.equal(repaired.plan.days[0].stops[0].start_time, null);
  assert.equal(repaired.plan.days[0].stops[1].start_time, '09:30');
});
