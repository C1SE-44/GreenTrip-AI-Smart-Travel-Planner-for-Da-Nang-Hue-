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
    name: category === 'quan-an' ? `Nhà hàng ${id}` : `Địa điểm ${id}`,
    city: 'Đà Nẵng',
    category,
    sub_category: category === 'quan-an' ? 'restaurant' : '',
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
    dailyVisitStopTarget,
    optimizeDays,
    selectAutomaticPois,
    stopFromPoi,
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
    const scheduled = optimizeDays(days, selection.selected, dailyVisitCapacity(pace), [], dailyVisitStopTarget(pace));
    assert.ok(scheduled.days.every((day) => day.stops.filter((stop) => stop.stop_type !== 'rest').length <= dailyVisitStopTarget(pace)));
    return scheduled.days.flatMap((day) => day.stops).filter((stop) => stop.stop_type !== 'rest').length;
  });
  assert.deepEqual(counts, [8, 12, 20]);

  const cafeIdeas = ['A', 'B', 'C'].map((name, index) => makePoi(`custom-cafe-${name}`, 'quan-an', index, {
    name: `Cà phê ${name}`,
    sub_category: 'cafe',
  }));
  const oneDay = createEmptyItinerary({ ...trip, daysCount: 1 }).days;
  const cafes = optimizeDays(oneDay, cafeIdeas, dailyVisitCapacity('Fast'));
  assert.equal(cafes.days[0].stops.filter((stop) => stop.stop_type === 'custom').length, 1);
  assert.equal(cafes.unassignedCount, 2);

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

test('Planner itinerary UI delegates auto scheduling to the shared tested scheduler', async () => {
  const editor = await readFile(path.join(root, 'src/components/planner/ItineraryEditor.tsx'), 'utf8');

  assert.match(editor, /dailyVisitStopTarget,\s*getTripItinerary,\s*optimizeDays,\s*pacingForTrip,[\s\S]*selectAutomaticPois/);
  assert.match(editor, /optimizeDays\([\s\S]*dailyVisitStopTarget\(requestedPacing\),\s*trip\.destination/);
  assert.doesNotMatch(editor, /function\s+optimizeDays\s*\(/, 'The live UI must not fork scheduler behavior');
  assert.doesNotMatch(editor, /function\s+selectAutomaticPois\s*\(/, 'The live UI must use the shared lodging and destination filters');
  assert.match(editor, /tối đa 1 quán cà phê\/ngày/);
});

test('PB11 rebalances assistant cafes across days and keeps at most one on any day', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, optimizeDays, stopFromPoi } = await loadItineraryService();
  const trip = {
    id: 'pb11-cafe-balance-days', title: 'Phân bổ quán cà phê', destination: 'Đà Nẵng',
    daysCount: 4, peopleCount: 2,
  };
  const cafes = Array.from({ length: 8 }, (_, index) => makePoi(`cafe-${index}`, 'quan-an', index, {
    name: ['Cà phê Thu Uyên', 'Cafe Fantasy', 'CaPhe Khanh Ly', 'Cà Phê An Nhiên'][index % 4],
    sub_category: 'specialty_roastery',
  }));
  const days = createEmptyItinerary(trip).days;
  days[0].stops = cafes.slice(0, 3).map((poi) => stopFromPoi(poi, 'assistant'));

  const result = optimizeDays(days, cafes, dailyVisitCapacity('Fast'), [], 5, trip.destination);
  const cafeCounts = result.days.map((day) => day.stops.filter((stop) => cafes.some((poi) => poi.id === stop.poi_id)).length);
  const scheduledIds = result.days.flatMap((day) => day.stops.map((stop) => stop.poi_id).filter(Boolean));

  assert.ok(cafeCounts.every((count) => count <= 1), 'The assistant schedules no more than one cafe on any day');
  assert.equal(new Set(scheduledIds).size, scheduledIds.length, 'Rebalancing does not duplicate a cafe');
  assert.equal(scheduledIds.length, 4, 'One cafe is scheduled per day when each day has capacity');
  assert.equal(result.unassignedCount, 4, 'Overflow cafes remain unscheduled when every day already has one');
});

test('PB11 does not leave two assistant cafes together when a day has only two activities', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, optimizeDays, stopFromPoi } = await loadItineraryService();
  const trip = {
    id: 'pb11-two-cafes-two-activities', title: 'Không xếp hai quán cà phê cùng ngày', destination: 'Đà Nẵng',
    daysCount: 3, peopleCount: 2,
  };
  const cafes = [
    makePoi('two-cafe-first', 'quan-an', 0, { name: 'Cà phê đầu ngày', sub_category: 'cafe' }),
    makePoi('two-cafe-second', 'quan-an', 1, { name: 'Cà phê thứ hai', sub_category: 'specialty_roastery' }),
  ];
  const days = createEmptyItinerary(trip).days;
  days[0].stops = cafes.map((poi) => stopFromPoi(poi, 'assistant'));

  const result = optimizeDays(days, cafes, dailyVisitCapacity('Balanced'), [], 3, trip.destination);
  const cafeCounts = result.days.map((day) => day.stops.filter((stop) =>
    cafes.some((poi) => poi.id === stop.poi_id)).length);

  assert.deepEqual(cafeCounts, [1, 1, 0], 'The second cafe is moved to another day instead of pairing with the first');
  assert.equal(result.unassignedCount, 0);
});

test('PB11 preserves manually selected places and reserves one cafe slot for assistant suggestions', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, optimizeDays, stopFromPoi } = await loadItineraryService();
  const trip = {
    id: 'pb11-cafe-manual-preserved', title: 'Giữ lựa chọn thủ công', destination: 'Đà Nẵng',
    daysCount: 2, peopleCount: 2,
  };
  const manualCafe = makePoi('manual-cafe', 'quan-an', 0, { name: 'Cà phê người dùng chọn', sub_category: 'cafe' });
  const assistantCafes = Array.from({ length: 3 }, (_, index) => makePoi(`assistant-cafe-${index}`, 'quan-an', index + 1, {
    name: `Cafe đề xuất ${index + 1}`, sub_category: 'workspace_study_cafe',
  }));
  const days = createEmptyItinerary(trip).days;
  days[0].stops.push(stopFromPoi(manualCafe, 'manual'));

  const result = optimizeDays(days, [manualCafe, ...assistantCafes], dailyVisitCapacity('Fast'), [], 5, trip.destination);
  const dayCafes = result.days.map((day) => day.stops.filter((stop) =>
    stop.poi_id === manualCafe.id || assistantCafes.some((poi) => poi.id === stop.poi_id)));
  const manualStop = result.days.flatMap((day) => day.stops).find((stop) => stop.poi_id === manualCafe.id);

  assert.equal(manualStop?.source, 'manual', 'A user-selected place is retained');
  assert.ok(dayCafes.every((stops) => stops.length <= 1));
  assert.equal(dayCafes.flat().filter((stop) => stop.poi_id !== manualCafe.id).length, 1);
});

test('PB11 pacing uses different daily stop targets when the POI catalog has enough real candidates', async () => {
  const {
    createEmptyItinerary,
    dailyVisitCapacity,
    dailyVisitStopTarget,
    optimizeDays,
    selectAutomaticPois,
    stopFromPoi,
  } = await loadItineraryService();
  const trip = {
    id: 'pb11-daily-pacing-targets',
    title: 'Lịch nhiều ngày',
    destination: 'Đà Nẵng',
    daysCount: 7,
    peopleCount: 2,
    totalBudget: 100_000_000,
    costBreakdown: { activities_and_tickets: 50_000_000 },
  };
  const recommendations = Array.from({ length: 40 }, (_, index) => makePoi(
    `pacing-candidate-${index}`,
    ['di-tich', 'canh-quan', 'quan-an', 'chua'][index % 4],
    index,
  ));
  const counts = ['Relaxed', 'Balanced', 'Fast'].map((pace) => {
    const days = createEmptyItinerary(trip).days;
    const existingStop = stopFromPoi(makePoi('user-picked-stop', 'di-tich', 100), 'manual');
    days[0].stops.push(existingStop);
    const selection = selectAutomaticPois(days, [], recommendations, trip, pace, dailyVisitCapacity(pace));
    const result = optimizeDays(days, selection.selected, dailyVisitCapacity(pace), [], dailyVisitStopTarget(pace));
    const dayCounts = result.days.map((day) => day.stops.filter((stop) => stop.stop_type !== 'rest').length);

    assert.ok(result.days[0].stops.some((stop) => stop.stop_id === existingStop.stop_id), 'Existing user-picked stops are preserved');
    assert.ok(dayCounts.every((count) => count <= dailyVisitStopTarget(pace)), `No day exceeds the ${pace} stop target`);
    return dayCounts.reduce((total, count) => total + count, 0);
  });

  assert.deepEqual(counts, [14, 21, 35]);
});

test('PB11 changing pace on an existing schedule adds into the newly available daily slots', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, dailyVisitStopTarget, optimizeDays, selectAutomaticPois, stopFromPoi } = await loadItineraryService();
  const trip = {
    id: 'pb11-increment-pace-on-existing-plan', title: 'Tăng nhịp lịch có sẵn', destination: 'Đà Nẵng',
    daysCount: 5, peopleCount: 2, totalBudget: 100_000_000,
    costBreakdown: { activities_and_tickets: 50_000_000 },
  };
  const recommendations = Array.from({ length: 30 }, (_, index) => makePoi(
    `incremental-candidate-${index}`,
    ['di-tich', 'canh-quan', 'quan-an', 'chua'][index % 4],
    index,
  ));
  let days = createEmptyItinerary(trip).days;
  const manualPoi = makePoi('kept-manual-stop', 'di-tich', 100);
  days[0].stops.push(stopFromPoi(manualPoi, 'manual'));
  let ideas = [];
  const scheduledCounts = [];

  for (const pace of ['Relaxed', 'Balanced', 'Fast']) {
    const selection = selectAutomaticPois(days, ideas, recommendations, trip, pace, dailyVisitCapacity(pace));
    const result = optimizeDays(days, selection.selected, dailyVisitCapacity(pace), [], dailyVisitStopTarget(pace));
    days = result.days;
    ideas = recommendations.filter((poi) => days.some((day) => day.stops.some((stop) => stop.poi_id === poi.id)));
    const dayCounts = days.map((day) => day.stops.filter((stop) => stop.stop_type !== 'rest').length);
    scheduledCounts.push(dayCounts.reduce((total, count) => total + count, 0));

    assert.ok(days[0].stops.some((stop) => stop.poi_id === manualPoi.id), 'A manually chosen stop survives every pace change');
    assert.ok(dayCounts.every((count) => count <= dailyVisitStopTarget(pace)), `Changing to ${pace} fills only its daily capacity`);
  }

  assert.deepEqual(scheduledCounts, [10, 15, 25]);
});

test('PB11 schedules only available POIs when the destination catalog is smaller than the selected pace', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, dailyVisitStopTarget, optimizeDays, selectAutomaticPois } = await loadItineraryService();
  const trip = {
    id: 'pb11-small-poi-catalog', title: 'Ít dữ liệu phù hợp', destination: 'Đà Nẵng',
    daysCount: 1, peopleCount: 1, totalBudget: 10_000_000,
  };
  const available = [makePoi('only-one', 'di-tich', 0), makePoi('only-two', 'canh-quan', 1)];
  const days = createEmptyItinerary(trip).days;
  const selection = selectAutomaticPois(days, [], available, trip, 'Fast', dailyVisitCapacity('Fast'));
  const result = optimizeDays(days, selection.selected, dailyVisitCapacity('Fast'), [], dailyVisitStopTarget('Fast'));
  const scheduledIds = result.days.flatMap((day) => day.stops).filter((stop) => stop.stop_type !== 'rest').map((stop) => stop.poi_id);

  assert.deepEqual(scheduledIds.sort(), available.map((poi) => poi.id).sort());
  assert.equal(scheduledIds.length, 2, 'The assistant does not invent POIs to fill a five-stop target');
});

test('PB11 does not remove existing stops when a day already exceeds a newly selected pacing target', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, dailyVisitStopTarget, optimizeDays, stopFromPoi } = await loadItineraryService();
  const trip = {
    id: 'pb11-preserve-over-target-stops', title: 'Giữ điểm người dùng', destination: 'Đà Nẵng',
    daysCount: 1, peopleCount: 1,
  };
  const days = createEmptyItinerary(trip).days;
  const existingPois = Array.from({ length: 3 }, (_, index) => makePoi(`preserved-${index}`, 'di-tich', index));
  days[0].stops = existingPois.map((poi) => stopFromPoi(poi, 'manual'));

  const result = optimizeDays(
    days,
    [...existingPois, makePoi('extra-candidate', 'canh-quan', 4)],
    dailyVisitCapacity('Relaxed'),
    [],
    dailyVisitStopTarget('Relaxed'),
  );

  assert.deepEqual(result.days[0].stops.map((stop) => stop.poi_id), existingPois.map((poi) => poi.id));
  assert.equal(result.assignedCount, 0, 'No automatic stop is added to a day already above the selected pace');
});

test('PB11 repeated smart scheduling keeps existing stops, adds new ideas once, and respects user removals', async () => {
  const {
    createEmptyItinerary,
    dailyVisitCapacity,
    excludeDismissedPois,
    optimizeDays,
    selectAutomaticPois,
    stopFromPoi,
  } = await loadItineraryService();
  const trip = {
    id: 'pb11-additive-scheduling-test',
    title: 'Lịch cộng dồn',
    destination: 'Đà Nẵng',
    daysCount: 2,
    peopleCount: 2,
    totalBudget: 10_000_000,
  };
  const previousPoi = makePoi('previous-assistant-poi', 'di-tich', 0);
  const firstNewPoi = makePoi('first-new-idea', 'canh-quan', 1);
  const secondNewPoi = makePoi('second-new-idea', 'chua', 2);
  const keptRecommendation = makePoi('kept-recommendation', 'quan-an', 3);
  const removedRecommendation = makePoi('removed-by-user', 'di-tich', 4);
  const nextRecommendation = makePoi('next-recommendation', 'chua', 5);
  const laterRecommendation = makePoi('later-recommendation', 'canh-quan', 6);
  const firstPlan = createEmptyItinerary(trip);
  firstPlan.days[0].stops.push(stopFromPoi(previousPoi, 'assistant'));
  const capacity = dailyVisitCapacity('Fast');

  const firstSelection = selectAutomaticPois(
    firstPlan.days,
    [previousPoi, firstNewPoi],
    [keptRecommendation, removedRecommendation],
    trip,
    'Fast',
    capacity,
  );
  const firstRun = optimizeDays(firstPlan.days, firstSelection.selected, capacity);
  const preservedStop = firstRun.days.flatMap((day) => day.stops).find((stop) => stop.poi_id === previousPoi.id);
  assert.ok(preservedStop, 'First smart run retains the previously scheduled assistant stop');
  assert.ok(firstRun.days.flatMap((day) => day.stops).some((stop) => stop.poi_id === removedRecommendation.id));

  const secondSelection = selectAutomaticPois(
    firstRun.days,
    [previousPoi, firstNewPoi, secondNewPoi],
    [keptRecommendation, removedRecommendation, nextRecommendation],
    trip,
    'Fast',
    capacity,
  );
  const secondRun = optimizeDays(firstRun.days, secondSelection.selected, capacity);
  const allStops = secondRun.days.flatMap((day) => day.stops);
  assert.equal(allStops.filter((stop) => stop.poi_id === previousPoi.id).length, 1);
  assert.equal(allStops.filter((stop) => stop.poi_id === firstNewPoi.id).length, 1);
  assert.equal(allStops.filter((stop) => stop.poi_id === secondNewPoi.id).length, 1);
  assert.equal(allStops.filter((stop) => stop.poi_id === keptRecommendation.id).length, 1);
  assert.equal(allStops.filter((stop) => stop.poi_id === removedRecommendation.id).length, 1);

  const dismissed = new Set([removedRecommendation.id]);
  const afterUserRemoval = secondRun.days.map((day) => ({
    ...day,
    stops: day.stops.filter((stop) => stop.poi_id !== removedRecommendation.id),
  }));
  const availableIdeas = excludeDismissedPois(
    [previousPoi, firstNewPoi, secondNewPoi, removedRecommendation],
    dismissed,
  );
  const availableRecommendations = excludeDismissedPois(
    [keptRecommendation, removedRecommendation, nextRecommendation, laterRecommendation],
    dismissed,
  );
  const afterRemovalSelection = selectAutomaticPois(
    afterUserRemoval,
    availableIdeas,
    availableRecommendations,
    trip,
    'Fast',
    capacity,
  );
  const afterRemovalRun = optimizeDays(afterUserRemoval, afterRemovalSelection.selected, capacity);
  const remainingPoiIds = afterRemovalRun.days.flatMap((day) => day.stops.map((stop) => stop.poi_id));
  assert.ok(!remainingPoiIds.includes(removedRecommendation.id), 'A removed point is not recreated from Ideas or recommendations');
  assert.ok(remainingPoiIds.includes(previousPoi.id), 'Other scheduled stops stay intact while scheduling continues');
  assert.ok(remainingPoiIds.includes(laterRecommendation.id), 'Other eligible suggestions can still be added after a removal');
});

test('PB11 route actions explain coordinate coverage and X removal clears every scheduled copy', async () => {
  const {
    calculateStopsPathKm,
    createEmptyItinerary,
    getRouteCoordinateCoverage,
    mergeAssistantStopsIntoIdeas,
    removePoiStopsFromItinerary,
    stopFromPoi,
  } = await loadItineraryService();
  const trip = {
    id: 'pb11-route-coverage-test', title: 'Route coverage', destination: 'Đà Nẵng',
    daysCount: 2, peopleCount: 1,
  };
  const itinerary = createEmptyItinerary(trip);
  const first = makePoi('route-first', 'di-tich', 0);
  const second = makePoi('route-second', 'canh-quan', 1);
  const third = makePoi('route-third', 'chua', 2);
  itinerary.days[0].stops = [first, second, third].map((poi) => stopFromPoi(poi, 'assistant'));
  itinerary.days[1].stops = [stopFromPoi(makePoi('route-fourth', 'di-tich', 3), 'assistant')];

  const coverage = getRouteCoordinateCoverage(itinerary.days);
  assert.equal(coverage.totalStops, 4);
  assert.equal(coverage.coordinateStops, 4);
  assert.equal(coverage.measurableLegs, 2, 'Route legs are measured separately for each day');
  assert.equal(coverage.optimizableDays, 1, 'Only the day with three coordinated stops can be optimized');

  const incomplete = createEmptyItinerary({ ...trip, daysCount: 1 });
  incomplete.days[0].stops = [
    stopFromPoi(first, 'assistant'),
    stopFromPoi({ ...second, lat: Number.NaN }, 'assistant'),
    stopFromPoi(third, 'assistant'),
  ];
  const incompleteCoverage = getRouteCoordinateCoverage(incomplete.days);
  assert.equal(incompleteCoverage.coordinateStops, 2);
  assert.equal(incompleteCoverage.measurableLegs, 0, 'A missing coordinate breaks the measured route between its neighboring stops');
  assert.equal(incompleteCoverage.optimizableDays, 0, 'Optimization requires coordinates for every stop in the day');

  const fourth = makePoi('route-fourth', 'di-tich', 3);
  const incompleteRoute = [
    stopFromPoi(first, 'assistant'),
    { ...stopFromPoi(second, 'assistant'), latitude: null, longitude: null },
    stopFromPoi(third, 'assistant'),
    stopFromPoi(fourth, 'assistant'),
  ];
  const finalLeg = [stopFromPoi(third, 'assistant'), stopFromPoi(fourth, 'assistant')];
  assert.equal(
    calculateStopsPathKm(incompleteRoute),
    calculateStopsPathKm(finalLeg),
    'A missing coordinate must not create a fictional direct leg across that stop',
  );

  const duplicateStop = stopFromPoi(first, 'assistant');
  itinerary.days[1].stops.push(duplicateStop);
  const removed = removePoiStopsFromItinerary(itinerary.days, first.id);
  assert.equal(removed.removedCount, 2, 'X removes all copies if the same POI was scheduled more than once');
  assert.ok(removed.days.every((day) => day.stops.every((stop) => stop.poi_id !== first.id)));
  assert.deepEqual(removed.days[0].stops.map((stop) => stop.sequence), [0, 1]);
  assert.deepEqual(removed.days[1].stops.map((stop) => stop.sequence), [0]);

  const customDay = createEmptyItinerary({ ...trip, daysCount: 1 }).days;
  customDay[0].stops = [{
    ...stopFromPoi({ ...first, id: 'custom-Quán thử', name: 'Quán thử' }, 'assistant'),
    stop_id: 'generated-stop-id',
  }];
  const removedCustom = removePoiStopsFromItinerary(customDay, 'custom-Quán thử', 'Quán thử');
  assert.equal(removedCustom.removedCount, 1, 'Custom idea removal matches its scheduled title when it has no POI id');

  const merged = mergeAssistantStopsIntoIdeas(['existing-idea'], [
    stopFromPoi(second, 'assistant'),
    stopFromPoi(third, 'manual'),
    { ...stopFromPoi(first, 'assistant'), stop_type: 'rest', poi_id: null },
  ]);
  assert.deepEqual(merged, ['existing-idea', second.id], 'Only assistant-scheduled visits are synced to Ideas');
  assert.deepEqual(mergeAssistantStopsIntoIdeas(merged, [stopFromPoi(second, 'assistant')]), merged, 'Sync is idempotent');
});

test('PB11 flushes pending itinerary saves before leaving and labels local drafts as unsynced', async () => {
  const component = await readFile(path.join(root, 'src/components/planner/TripItineraryView.tsx'), 'utf8');
  assert.ok(component.includes('cachePendingItinerary(nextPlan)'), 'Every edit is cached locally before the debounce timer');
  assert.ok(component.includes('await flushPendingSave()'), 'Exit and share actions wait for the pending save');
  assert.ok(component.includes('finishAfterSaving'), 'Close controls go through the save-aware exit flow');
  assert.ok(component.includes("result.syncStatus === 'synced'"), 'Only a server response marks the itinerary synchronized');
  assert.ok(component.includes('Chưa đồng bộ'), 'A browser-only draft is not shown as saved on the server');
});

test('PB11 groups Đà Nẵng and Huế into consecutive city blocks for a combined trip', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, dailyVisitStopTarget, optimizeDays, planDestinationCityBlocks } = await loadItineraryService();
  const trip = {
    id: 'pb11-city-blocks-four-day', title: 'Đà Nẵng và Huế', destination: 'Đà Nẵng & Huế',
    daysCount: 4, peopleCount: 2,
  };
  const days = createEmptyItinerary(trip).days;
  const candidates = [
    ...Array.from({ length: 8 }, (_, index) => makePoi(`dn-${index}`, 'di-tich', index, { city: 'Đà Nẵng' })),
    ...Array.from({ length: 8 }, (_, index) => makePoi(`hue-${index}`, 'di-tich', index + 8, { city: 'Huế' })),
  ];
  const cityPlan = planDestinationCityBlocks(days, candidates, trip.destination);
  assert.deepEqual(cityPlan, ['da nang', 'da nang', 'hue', 'hue']);

  const result = optimizeDays(
    days,
    candidates,
    dailyVisitCapacity('Fast'),
    [],
    dailyVisitStopTarget('Fast'),
    trip.destination,
  );
  const dayCities = result.days.map((day) => new Set(
    day.stops.filter((stop) => stop.stop_type !== 'rest').map((stop) => stop.city),
  ));
  assert.ok(dayCities.every((cities) => cities.size <= 1), 'Each day contains points from at most one city');
  const scheduledCities = dayCities.map((cities) => [...cities][0]).filter(Boolean);
  const transitions = scheduledCities.slice(1).filter((city, index) => city !== scheduledCities[index]).length;
  assert.ok(transitions <= 1, 'The route changes city at most once across the trip');
  assert.deepEqual(scheduledCities, ['Đà Nẵng', 'Đà Nẵng', 'Huế', 'Huế']);
});

test('PB11 balances city-block length by available POIs and preserves manually assigned city days', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, optimizeDays, planDestinationCityBlocks, stopFromPoi } = await loadItineraryService();
  const trip = {
    id: 'pb11-city-block-ratio', title: 'Nhiều ngày ở Đà Nẵng', destination: 'Đà Nẵng & Huế',
    daysCount: 4, peopleCount: 2,
  };
  const days = createEmptyItinerary(trip).days;
  const weightedCandidates = [
    ...Array.from({ length: 9 }, (_, index) => makePoi(`weighted-dn-${index}`, 'di-tich', index, { city: 'Đà Nẵng' })),
    ...Array.from({ length: 3 }, (_, index) => makePoi(`weighted-hue-${index}`, 'di-tich', index + 9, { city: 'Huế' })),
  ];
  assert.deepEqual(
    planDestinationCityBlocks(days, weightedCandidates, trip.destination),
    ['da nang', 'da nang', 'da nang', 'hue'],
    'The city with more eligible places receives a proportionally longer block',
  );

  const hueAnchor = makePoi('manual-hue-anchor', 'di-tich', 20, { city: 'Huế' });
  days[1].stops.push(stopFromPoi(hueAnchor, 'manual'));
  const mixedCandidates = [
    ...Array.from({ length: 6 }, (_, index) => makePoi(`anchored-dn-${index}`, 'di-tich', index, { city: 'Đà Nẵng' })),
    ...Array.from({ length: 6 }, (_, index) => makePoi(`anchored-hue-${index}`, 'di-tich', index + 6, { city: 'Huế' })),
  ];
  const anchoredPlan = planDestinationCityBlocks(days, mixedCandidates, trip.destination);
  assert.equal(anchoredPlan[1], 'hue', 'The city block includes the day containing the user-selected Huế stop');
  const result = optimizeDays(days, mixedCandidates, dailyVisitCapacity('Fast'), [], 5, trip.destination);
  assert.ok(result.days[1].stops.some((stop) => stop.stop_id === days[1].stops[0].stop_id), 'The existing manual stop remains in place');
  assert.ok(result.days.every((day) => {
    const cities = new Set(day.stops.filter((stop) => stop.stop_type !== 'rest').map((stop) => stop.city));
    return cities.size <= 1;
  }), 'New stops never mix Đà Nẵng and Huế on a day with a manual stop');
});

test('PB11 schedules a new stop with the closest feasible day instead of creating a long cross-city leg', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, optimizeDays, stopFromPoi } = await loadItineraryService();
  const trip = {
    id: 'pb11-route-distance-placement',
    title: 'Gom điểm gần nhau',
    destination: 'Đà Nẵng',
    daysCount: 3,
    peopleCount: 2,
  };
  const days = createEmptyItinerary(trip).days;
  const farAnchor = makePoi('far-anchor', 'di-tich', 0, { lat: 16, lng: 108 });
  const nearbyAnchors = [
    makePoi('near-anchor-a', 'di-tich', 1, { lat: 16.150, lng: 108 }),
    makePoi('near-anchor-b', 'di-tich', 2, { lat: 16.152, lng: 108 }),
    makePoi('near-anchor-c', 'di-tich', 3, { lat: 16.151, lng: 108.001 }),
  ];
  days[0].stops.push(stopFromPoi(farAnchor, 'manual'));
  nearbyAnchors.forEach((poi) => days[1].stops.push(stopFromPoi(poi, 'manual')));
  const candidate = makePoi('nearby-candidate', 'canh-quan', 4, { lat: 16.151, lng: 108.001 });

  const result = optimizeDays(days, [candidate], dailyVisitCapacity('Fast'), [], 5, trip.destination);

  assert.equal(result.days[1].stops.some((stop) => stop.poi_id === candidate.id), true,
    'The candidate joins the existing nearby cluster instead of the day anchored 16+ km away or an empty day');
  assert.equal(result.days.flatMap((day) => day.stops).filter((stop) => stop.poi_id === candidate.id).length, 1,
    'The candidate is assigned exactly once');
});

test('PB11 moves an already scheduled assistant stop from a 16 km leg into the nearby day cluster', async () => {
  const { calculateStopsPathKm, createEmptyItinerary, dailyVisitCapacity, optimizeDays, stopFromPoi } = await loadItineraryService();
  const trip = {
    id: 'pb11-rebalance-existing-distance',
    title: 'Gom các điểm gần nhau',
    destination: 'Đà Nẵng',
    daysCount: 2,
    peopleCount: 2,
  };
  const days = createEmptyItinerary(trip).days;
  const farAnchor = makePoi('existing-far-anchor', 'di-tich', 0, { lat: 16, lng: 108 });
  const nearbyAnchors = [
    makePoi('existing-near-anchor-a', 'di-tich', 1, { lat: 16.150, lng: 108 }),
    makePoi('existing-near-anchor-b', 'di-tich', 2, { lat: 16.152, lng: 108 }),
    makePoi('existing-near-anchor-c', 'di-tich', 3, { lat: 16.151, lng: 108.001 }),
  ];
  const candidate = makePoi('already-scheduled-assistant-stop', 'canh-quan', 4, {
    lat: 16.151,
    lng: 108.001,
  });
  const manualAnchor = stopFromPoi(farAnchor, 'manual');
  const manualCluster = nearbyAnchors.map((poi) => stopFromPoi(poi, 'manual'));
  const assistantStop = {
    ...stopFromPoi(candidate, 'assistant'),
    start_time: '20:00',
    end_time: '21:00',
  };
  days[0].stops.push(manualAnchor, assistantStop);
  days[1].stops.push(...manualCluster);

  const result = optimizeDays(days, [candidate], dailyVisitCapacity('Fast'), [], 5, trip.destination);
  const candidatePlacements = result.days.flatMap((day, dayIndex) => day.stops
    .filter((stop) => stop.poi_id === candidate.id)
    .map(() => dayIndex));

  assert.deepEqual(candidatePlacements, [1], 'The AI stop moves to the day with its closest cluster');
  const rescheduledStop = result.days[1].stops.find((stop) => stop.poi_id === candidate.id);
  assert.notEqual(rescheduledStop.start_time, '20:00',
    'The AI stop does not keep a time slot from its previous day after it moves');
  assert.ok(rescheduledStop.start_time && rescheduledStop.end_time && rescheduledStop.end_time > rescheduledStop.start_time,
    'The moved AI stop receives a valid time slot on its new day');
  assert.ok(calculateStopsPathKm(result.days[1].stops) < 1,
    'The resulting day route remains within the nearby cluster instead of adding a 16 km leg');
  assert.equal(result.days[0].stops.some((stop) => stop.poi_id === candidate.id), false);
  assert.equal(result.days[0].stops.find((stop) => stop.stop_id === manualAnchor.stop_id).city, manualAnchor.city,
    'The manually assigned far anchor remains on its original day');
  assert.ok(manualCluster.every((stop) => result.days[1].stops.some((item) => item.stop_id === stop.stop_id)),
    'Every manually assigned stop in the nearby day stays in place');
});

test('PB11 route ordering reduces an out-and-back input order for a day cluster', async () => {
  const { calculateStopsPathKm, orderSegmentNearestAnd2Opt, stopFromPoi } = await loadItineraryService();
  const routePois = [
    makePoi('route-west', 'di-tich', 0, { lat: 16.000, lng: 108.000 }),
    makePoi('route-east', 'di-tich', 1, { lat: 16.000, lng: 108.030 }),
    makePoi('route-center', 'di-tich', 2, { lat: 16.000, lng: 108.010 }),
    makePoi('route-north', 'di-tich', 3, { lat: 16.020, lng: 108.010 }),
  ];
  const stops = routePois.map((poi) => stopFromPoi(poi, 'manual'));
  const inputDistance = calculateStopsPathKm(stops);
  const optimized = orderSegmentNearestAnd2Opt(stops);
  const optimizedDistance = calculateStopsPathKm(optimized);

  assert.ok(optimizedDistance < inputDistance,
    `Expected route distance to improve (${inputDistance} km -> ${optimizedDistance} km)`);
  assert.deepEqual(new Set(optimized.map((stop) => stop.poi_id)), new Set(stops.map((stop) => stop.poi_id)),
    'Reordering preserves every itinerary stop');
});

test('PB11 smart sorting groups manually selected multi-city stops without losing their edits', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, optimizeDays, planDestinationCityBlocks, stopFromPoi } = await loadItineraryService();
  const trip = {
    id: 'pb11-city-block-manual-alternation', title: 'Lịch tự chỉnh', destination: 'Đà Nẵng & Huế',
    daysCount: 4, peopleCount: 2,
  };
  const days = createEmptyItinerary(trip).days;
  const manualStops = [
    stopFromPoi(makePoi('manual-dn-day-1', 'di-tich', 0, { city: 'Đà Nẵng' }), 'manual'),
    stopFromPoi(makePoi('manual-hue-day-2', 'di-tich', 1, { city: 'Huế' }), 'manual'),
    stopFromPoi(makePoi('manual-dn-day-3', 'di-tich', 2, { city: 'Đà Nẵng' }), 'manual'),
  ];
  manualStops[1].comment = 'Đã đặt vé';
  manualStops[1].start_time = '10:00';
  manualStops[1].end_time = '11:00';
  days[0].stops.push(manualStops[0]);
  days[1].stops.push(manualStops[1]);
  days[2].stops.push(manualStops[2]);
  const candidates = [
    ...Array.from({ length: 3 }, (_, index) => makePoi(`manual-route-dn-${index}`, 'di-tich', index + 3, { city: 'Đà Nẵng' })),
    ...Array.from({ length: 3 }, (_, index) => makePoi(`manual-route-hue-${index}`, 'di-tich', index + 6, { city: 'Huế' })),
  ];
  const cityPlan = planDestinationCityBlocks(days, candidates, trip.destination);
  const result = optimizeDays(days, candidates, dailyVisitCapacity('Fast'), [], 5, trip.destination);

  assert.deepEqual(cityPlan, ['da nang', 'da nang', 'hue', 'hue'], 'Repeated manual city assignments collapse into one continuous block');
  const resultCityByDay = result.days.map((day) => {
    const citySet = new Set(day.stops.filter((stop) => stop.stop_type !== 'rest').map((stop) => stop.city));
    assert.ok(citySet.size <= 1, 'A scheduled day never mixes stops from different cities');
    return [...citySet][0];
  });
  assert.deepEqual(resultCityByDay, ['Đà Nẵng', 'Đà Nẵng', 'Huế', 'Huế']);
  for (const stop of manualStops) {
    assert.equal(result.days.flatMap((day) => day.stops).filter((item) => item.stop_id === stop.stop_id).length, 1);
  }
  const preservedHueStop = result.days.flatMap((day) => day.stops).find((stop) => stop.stop_id === manualStops[1].stop_id);
  assert.equal(preservedHueStop.comment, 'Đã đặt vé');
  assert.equal(preservedHueStop.start_time, '10:00');
  assert.equal(preservedHueStop.end_time, '11:00');
});

test('PB11 one-day combined trips choose one city and single-city trips remain schedulable', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, optimizeDays, planDestinationCityBlocks } = await loadItineraryService();
  const combinedTrip = {
    id: 'pb11-one-day-two-cities', title: 'Một ngày', destination: 'Đà Nẵng & Huế',
    daysCount: 1, peopleCount: 1,
  };
  const oneDay = createEmptyItinerary(combinedTrip).days;
  const bothCities = [
    makePoi('one-day-dn-1', 'di-tich', 0, { city: 'Đà Nẵng' }),
    makePoi('one-day-dn-2', 'canh-quan', 1, { city: 'Đà Nẵng' }),
    makePoi('one-day-hue-1', 'di-tich', 2, { city: 'Huế' }),
    makePoi('one-day-hue-2', 'canh-quan', 3, { city: 'Huế' }),
  ];
  assert.deepEqual(planDestinationCityBlocks(oneDay, bothCities, combinedTrip.destination), ['da nang']);
  const combinedResult = optimizeDays(oneDay, bothCities, dailyVisitCapacity('Fast'), [], 5, combinedTrip.destination);
  assert.ok(combinedResult.days[0].stops.every((stop) => stop.city === 'Đà Nẵng'));
  assert.equal(combinedResult.unassignedCount, 2, 'Places in the second city remain available instead of making an unrealistic day trip');

  const singleCityTrip = { ...combinedTrip, id: 'pb11-single-city', destination: 'Đà Nẵng', daysCount: 2 };
  const singleCityDays = createEmptyItinerary(singleCityTrip).days;
  const daNangPois = Array.from({ length: 4 }, (_, index) => makePoi(`single-city-${index}`, 'di-tich', index));
  const singleCityResult = optimizeDays(singleCityDays, daNangPois, dailyVisitCapacity('Fast'));
  assert.equal(singleCityResult.assignedCount, daNangPois.length, 'Trips without a city-block plan still schedule normally');
});

test('PB11 keeps every city in one continuous block and re-groups prior assistant stops on any multi-city trip', async () => {
  const { createEmptyItinerary, dailyVisitCapacity, dailyVisitStopTarget, optimizeDays, planDestinationCityBlocks, stopFromPoi } = await loadItineraryService();
  const trip = {
    id: 'pb11-three-city-rebalance', title: 'Đà Nẵng, Hội An và Huế',
    destination: 'Đà Nẵng & Hội An & Huế', daysCount: 6, peopleCount: 2,
  };
  const days = createEmptyItinerary(trip).days;
  const existing = [
    makePoi('old-dn-day-1', 'di-tich', 0, { city: 'Đà Nẵng' }),
    makePoi('old-hoi-an-day-2', 'di-tich', 1, { city: 'Hội An' }),
    makePoi('old-hue-day-3', 'di-tich', 2, { city: 'Huế' }),
    makePoi('old-dn-day-4', 'di-tich', 3, { city: 'Đà Nẵng' }),
    makePoi('old-hoi-an-day-5', 'di-tich', 4, { city: 'Hội An' }),
    makePoi('old-hue-day-6', 'di-tich', 5, { city: 'Huế' }),
  ];
  existing.forEach((poi, index) => {
    const stop = stopFromPoi(poi, 'assistant');
    if (index === 0) {
      stop.comment = 'Giữ ghi chú đã nhập';
      stop.start_time = '09:00';
      stop.end_time = '10:00';
    }
    days[index].stops.push(stop);
  });
  const candidates = [
    ...existing,
    ...Array.from({ length: 3 }, (_, index) => makePoi(`new-dn-${index}`, 'canh-quan', index + 6, { city: 'Đà Nẵng' })),
    ...Array.from({ length: 3 }, (_, index) => makePoi(`new-hoi-an-${index}`, 'canh-quan', index + 9, { city: 'Hội An' })),
    ...Array.from({ length: 3 }, (_, index) => makePoi(`new-hue-${index}`, 'canh-quan', index + 12, { city: 'Huế' })),
  ];
  const plannedCities = planDestinationCityBlocks(days, candidates, trip.destination);
  assert.deepEqual(plannedCities, ['da nang', 'da nang', 'hoi an', 'hoi an', 'hue', 'hue']);

  const result = optimizeDays(
    days,
    candidates,
    dailyVisitCapacity('Fast'),
    [],
    dailyVisitStopTarget('Fast'),
    trip.destination,
  );
  const cityByDay = result.days.map((day) => {
    const cities = new Set(day.stops.filter((stop) => stop.stop_type !== 'rest').map((stop) => stop.city));
    assert.ok(cities.size <= 1, 'A day never combines stops from separate cities');
    return [...cities][0];
  }).filter(Boolean);
  assert.deepEqual(cityByDay, ['Đà Nẵng', 'Đà Nẵng', 'Hội An', 'Hội An', 'Huế', 'Huế']);
  assert.ok(cityByDay.slice(1).every((city, index) => city === cityByDay[index] || cityByDay.indexOf(city) === index + 1), 'The route does not return to a city after leaving its block');
  for (const poi of existing) {
    assert.equal(result.days.flatMap((day) => day.stops).filter((stop) => stop.poi_id === poi.id).length, 1, `Existing stop ${poi.id} is retained exactly once`);
  }
  const preserved = result.days.flatMap((day) => day.stops).find((stop) => stop.poi_id === existing[0].id);
  assert.equal(preserved.comment, 'Giữ ghi chú đã nhập');
  assert.equal(preserved.start_time, '09:00');
  assert.equal(preserved.end_time, '10:00');
});
