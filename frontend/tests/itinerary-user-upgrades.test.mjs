import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

async function loadItineraryModule() {
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    resolve: {
      alias: {
        '@': path.join(root, 'src'),
      },
    },
    optimizeDeps: { noDiscovery: true },
  });
  const mod = await server.ssrLoadModule('/src/services/itineraryService.ts');
  return { mod, close: () => server.close() };
}

function makePoi(overrides) {
  return {
    id: 'poi-default',
    name: 'Địa điểm mẫu',
    category: 'di-tich',
    city: 'Đà Nẵng',
    lat: 16.0611,
    lng: 108.227,
    address: 'Đà Nẵng',
    image: '/img.jpg',
    description: 'Mô tả mẫu',
    rating: 4.5,
    visitDuration: '90 phút',
    average_visit_minutes: 90,
    ecoScore: 85,
    estimatedCost: 50000,
    ...overrides,
  };
}

function makeStop(overrides) {
  return {
    stop_id: 'stop-default',
    poi_id: 'poi-default',
    title: 'Điểm dừng mẫu',
    city: 'Đà Nẵng',
    address: null,
    category: 'di-tich',
    stop_type: 'poi',
    source: 'manual',
    sequence: 0,
    duration_minutes: 90,
    start_time: '08:00',
    end_time: '09:30',
    comment: null,
    latitude: 16.0611,
    longitude: 108.227,
    ...overrides,
  };
}

const SAMPLE_POIS = [
  makePoi({
    id: 'dn-beach',
    name: 'Bãi biển Mỹ Khê',
    category: 'canh-quan',
    city: 'Đà Nẵng',
    lat: 16.0592,
    lng: 108.2435,
    estimatedCost: 0,
    ecoScore: 92,
    rating: 4.8,
    ai_metadata: { rainy_day_friendly: false },
  }),
  makePoi({
    id: 'dn-mountain',
    name: 'Danh thắng Ngũ Hành Sơn',
    category: 'canh-quan',
    city: 'Đà Nẵng',
    lat: 16.0044,
    lng: 108.2635,
    estimatedCost: 40000,
    ecoScore: 88,
    rating: 4.7,
    ai_metadata: { rainy_day_friendly: false },
  }),
  makePoi({
    id: 'dn-museum',
    name: 'Bảo tàng Điêu khắc Chăm',
    category: 'di-tich',
    city: 'Đà Nẵng',
    lat: 16.0604,
    lng: 108.2233,
    estimatedCost: 60000,
    ecoScore: 90,
    rating: 4.6,
    ai_metadata: { rainy_day_friendly: true },
  }),
  makePoi({
    id: 'dn-cafe',
    name: 'Cà phê Cộng Bạch Đằng',
    category: 'quan-an',
    city: 'Đà Nẵng',
    lat: 16.067,
    lng: 108.2245,
    estimatedCost: 55000,
    ecoScore: 86,
    rating: 4.5,
    ai_metadata: { rainy_day_friendly: true },
  }),
  makePoi({
    id: 'dn-market',
    name: 'Chợ Hàn',
    category: 'quan-an',
    city: 'Đà Nẵng',
    lat: 16.0678,
    lng: 108.2208,
    estimatedCost: 100000,
    ecoScore: 82,
    rating: 4.4,
    ai_metadata: { rainy_day_friendly: true },
  }),
  makePoi({
    id: 'dn-museum-2',
    name: 'Bảo tàng Đà Nẵng',
    category: 'di-tich',
    city: 'Đà Nẵng',
    lat: 16.0772,
    lng: 108.2225,
    estimatedCost: 20000,
    ecoScore: 89,
    rating: 4.5,
    ai_metadata: { rainy_day_friendly: true },
  }),
  makePoi({
    id: 'hue-tea',
    name: 'Tiệm trà Cung Đình Huế',
    category: 'quan-an',
    city: 'Huế',
    lat: 16.469,
    lng: 107.579,
    estimatedCost: 70000,
    ecoScore: 91,
    rating: 4.8,
    ai_metadata: { rainy_day_friendly: true },
  }),
];

test('isPoiOutdoor classifies outdoor, indoor, rest stops, and undefined inputs accurately', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    const beach = SAMPLE_POIS.find((p) => p.id === 'dn-beach');
    const museum = SAMPLE_POIS.find((p) => p.id === 'dn-museum');
    const cafe = SAMPLE_POIS.find((p) => p.id === 'dn-cafe');

    assert.equal(mod.isPoiOutdoor(beach), true);
    assert.equal(mod.isPoiOutdoor(museum), false);
    assert.equal(mod.isPoiOutdoor(cafe), false);

    // Fallback to stop info when POI is absent
    assert.equal(
      mod.isPoiOutdoor(undefined, { category: 'canh-quan', title: 'Bãi biển Non Nước', stop_type: 'poi' }),
      true
    );
    assert.equal(
      mod.isPoiOutdoor(undefined, { category: 'quan-an', title: 'Quán ăn địa phương', stop_type: 'poi' }),
      false
    );
    assert.equal(
      mod.isPoiOutdoor(beach, { category: 'canh-quan', title: 'Nghỉ trưa', stop_type: 'rest' }),
      false
    );
    assert.equal(mod.isPoiOutdoor(undefined, undefined), false);
  } finally {
    await close();
  }
});

test('suggestIndoorAlternativesForDay swaps outdoor stops to same-city unused indoor POIs', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    const day = {
      day_id: 'd1',
      day_number: 1,
      date: '2026-11-16',
      title: 'Ngày 1 Đà Nẵng',
      stops: [
        makeStop({
          stop_id: 's-beach',
          poi_id: 'dn-beach',
          title: 'Bãi biển Mỹ Khê',
          city: 'Đà Nẵng',
          category: 'canh-quan',
          latitude: 16.0592,
          longitude: 108.2435,
          sequence: 0,
        }),
        makeStop({
          stop_id: 's-museum',
          poi_id: 'dn-museum',
          title: 'Bảo tàng Điêu khắc Chăm',
          city: 'Đà Nẵng',
          category: 'di-tich',
          latitude: 16.0604,
          longitude: 108.2233,
          sequence: 1,
        }),
        makeStop({
          stop_id: 's-rest',
          poi_id: null,
          title: 'Nghỉ trưa',
          city: 'Đà Nẵng',
          category: null,
          stop_type: 'rest',
          latitude: null,
          longitude: null,
          sequence: 2,
        }),
      ],
    };

    const usedPoiIds = new Set(['dn-cafe']);
    const swaps = mod.suggestIndoorAlternativesForDay(day, SAMPLE_POIS, usedPoiIds, 'Đà Nẵng');

    assert.equal(swaps.length, 1);
    const swap = swaps[0];
    assert.equal(swap.originalStop.stop_id, 's-beach');
    assert.equal(swap.replacement.city, 'Đà Nẵng', 'Must stay within the same city');
    assert.notEqual(swap.replacement.id, 'dn-cafe', 'Must skip already used POIs');
    assert.notEqual(swap.replacement.id, 'dn-museum', 'Must skip POIs already scheduled in the day');
    assert.equal(mod.isPoiOutdoor(swap.replacement), false);
    assert.ok(typeof swap.distanceKm === 'number' && Number.isFinite(swap.distanceKm));
    assert.ok(typeof swap.walkMinutes === 'number' && Number.isFinite(swap.walkMinutes));
    assert.ok(typeof swap.reason === 'string' && swap.reason.trim().length > 0);

    // Day with only indoor + rest stops yields empty suggestions
    const indoorOnlyDay = {
      ...day,
      stops: day.stops.slice(1),
    };
    assert.deepEqual(mod.suggestIndoorAlternativesForDay(indoorOnlyDay, SAMPLE_POIS, new Set(), 'Đà Nẵng'), []);

    // Outdoor stop with missing coordinates still works without NaN
    const missingCoordsDay = {
      ...day,
      stops: [
        makeStop({
          stop_id: 's-no-coord',
          poi_id: 'dn-mountain',
          title: 'Danh thắng Ngũ Hành Sơn',
          city: null,
          category: 'canh-quan',
          latitude: null,
          longitude: null,
        }),
      ],
    };
    const noCoordSwaps = mod.suggestIndoorAlternativesForDay(missingCoordsDay, SAMPLE_POIS, new Set(), 'Đà Nẵng');
    assert.equal(noCoordSwaps.length, 1);
    assert.equal(noCoordSwaps[0].replacement.city, 'Đà Nẵng');
    assert.ok(!Number.isNaN(noCoordSwaps[0].distanceKm));
  } finally {
    await close();
  }
});

test('suggestNearbyAlternativesForStop sorts by distance, honors limit & exclusions, and handles missing coords', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    const targetStop = makeStop({
      stop_id: 's-target',
      poi_id: 'cau-rong',
      title: 'Cầu Rồng',
      city: 'Đà Nẵng',
      category: 'di-tich',
      latitude: 16.0611,
      longitude: 108.227,
    });
    const day = {
      day_id: 'd1',
      day_number: 1,
      date: '2026-11-16',
      title: 'Ngày 1',
      stops: [
        targetStop,
        makeStop({
          stop_id: 's-museum',
          poi_id: 'dn-museum',
          title: 'Bảo tàng Điêu khắc Chăm',
          city: 'Đà Nẵng',
          latitude: 16.0604,
          longitude: 108.2233,
        }),
      ],
    };

    const usedPoiIds = new Set(['dn-cafe']);
    const suggestions = mod.suggestNearbyAlternativesForStop(targetStop, day, SAMPLE_POIS, usedPoiIds);

    assert.ok(suggestions.length > 0 && suggestions.length <= 3);
    for (let i = 0; i < suggestions.length; i += 1) {
      const item = suggestions[i];
      assert.equal(item.poi.city, 'Đà Nẵng');
      assert.notEqual(item.poi.id, 'cau-rong');
      assert.notEqual(item.poi.id, 'dn-museum');
      assert.notEqual(item.poi.id, 'dn-cafe');
      assert.ok(typeof item.distanceKm === 'number' && Number.isFinite(item.distanceKm) && item.distanceKm >= 0);
      assert.ok(typeof item.walkMinutes === 'number' && Number.isFinite(item.walkMinutes) && item.walkMinutes >= 0);
      assert.ok(typeof item.reason === 'string' && item.reason.trim().length > 0);
      if (i > 0) {
        assert.ok(suggestions[i - 1].distanceKm <= item.distanceKm, 'Suggestions must be sorted by distance ascending');
      }
    }

    const limited = mod.suggestNearbyAlternativesForStop(targetStop, day, SAMPLE_POIS, usedPoiIds, 1);
    assert.equal(limited.length, 1);

    const zeroLimit = mod.suggestNearbyAlternativesForStop(targetStop, day, SAMPLE_POIS, usedPoiIds, 0);
    assert.equal(zeroLimit.length, 0);

    // Stop without coordinates must not throw or produce NaN
    const noCoordStop = makeStop({
      stop_id: 's-nocoord',
      poi_id: null,
      title: 'Điểm tự thêm',
      city: 'Đà Nẵng',
      latitude: null,
      longitude: null,
    });
    const noCoordRes = mod.suggestNearbyAlternativesForStop(noCoordStop, day, SAMPLE_POIS, usedPoiIds);
    assert.ok(Array.isArray(noCoordRes));
    noCoordRes.forEach((r) => {
      assert.ok(!Number.isNaN(r.distanceKm));
      assert.ok(!Number.isNaN(r.walkMinutes));
    });
  } finally {
    await close();
  }
});

test('getStopShortReason produces concise 1-line Vietnamese reasons across stop variants', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    const museum = SAMPLE_POIS.find((p) => p.id === 'dn-museum');
    const cafeStop = makeStop({
      stop_id: 's-prev',
      poi_id: 'dn-cafe',
      title: 'Cà phê Cộng Bạch Đằng',
      latitude: 16.067,
      longitude: 108.2245,
    });
    const museumStop = makeStop({
      stop_id: 's-mus',
      poi_id: 'dn-museum',
      title: 'Bảo tàng Điêu khắc Chăm',
      latitude: 16.0604,
      longitude: 108.2233,
    });
    const restStop = makeStop({
      stop_id: 's-rest',
      poi_id: null,
      title: 'Nghỉ trưa',
      stop_type: 'rest',
      latitude: null,
      longitude: null,
    });

    const poiReason = mod.getStopShortReason(museumStop, museum, cafeStop);
    assert.ok(typeof poiReason === 'string' && poiReason.trim().length > 0);
    assert.ok(!poiReason.includes('\n'), 'Short reason must be a single line');
    assert.ok(!/undefined|NaN/.test(poiReason));

    const restReason = mod.getStopShortReason(restStop, undefined, museumStop);
    assert.ok(typeof restReason === 'string' && restReason.trim().length > 0);
    assert.ok(!restReason.includes('\n'));

    const fallbackReason = mod.getStopShortReason(museumStop, undefined, null);
    assert.ok(typeof fallbackReason === 'string' && fallbackReason.trim().length > 0);
    assert.ok(!/undefined|NaN/.test(fallbackReason));
  } finally {
    await close();
  }
});

test('computeTripBudgetSummary handles multi-person costs, missing costs, over-budget, and null maxBudget', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    const poiById = new Map(SAMPLE_POIS.map((p) => [p.id, p]));
    poiById.set('dn-null-cost', makePoi({ id: 'dn-null-cost', name: 'Điểm chưa rõ giá', estimatedCost: null }));

    const emptySummary = mod.computeTripBudgetSummary([], poiById, 2, 1_000_000);
    assert.equal(emptySummary.totalCost, 0);
    assert.equal(emptySummary.maxBudget, 1_000_000);
    assert.equal(emptySummary.remaining, 1_000_000);
    assert.equal(emptySummary.isOverBudget, false);
    assert.equal(emptySummary.percentUsed, 0);

    const days = [
      {
        day_id: 'd1',
        day_number: 1,
        date: '2026-11-16',
        title: 'Ngày 1',
        stops: [
          makeStop({ stop_id: 's1', poi_id: 'dn-mountain', title: 'Ngũ Hành Sơn' }), // 40,000
          makeStop({ stop_id: 's2', poi_id: 'dn-museum', title: 'Bảo tàng Chăm' }),   // 60,000
          makeStop({ stop_id: 's3', poi_id: 'dn-null-cost', title: 'Điểm chưa rõ giá' }), // null -> 0
          makeStop({ stop_id: 's4', poi_id: null, title: 'Nghỉ trưa', stop_type: 'rest' }), // rest -> 0
        ],
      },
    ];

    // 100,000 per person * 3 people = 300,000
    const within = mod.computeTripBudgetSummary(days, poiById, 3, 500_000);
    assert.equal(within.totalCost, 300_000);
    assert.equal(within.maxBudget, 500_000);
    assert.equal(within.remaining, 200_000);
    assert.equal(within.isOverBudget, false);
    assert.equal(within.percentUsed, 60);

    const over = mod.computeTripBudgetSummary(days, poiById, 3, 200_000);
    assert.equal(over.totalCost, 300_000);
    assert.equal(over.remaining, -100_000);
    assert.equal(over.isOverBudget, true);
    assert.equal(over.percentUsed, 150);

    const noBudget = mod.computeTripBudgetSummary(days, poiById, 2, null);
    assert.equal(noBudget.totalCost, 200_000);
    assert.equal(noBudget.maxBudget, null);
    assert.equal(noBudget.isOverBudget, false);
    assert.equal(noBudget.remaining, null);
  } finally {
    await close();
  }
});

test('computeDayFatigue calculates activeCount, outdoorCount, fatigueHours, hasRestBlock, and needsRest', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    const poiById = new Map(SAMPLE_POIS.map((p) => [p.id, p]));

    const emptyDay = { day_id: 'd0', day_number: 1, date: null, title: 'Trống', stops: [] };
    const emptyFatigue = mod.computeDayFatigue(emptyDay, poiById);
    assert.equal(emptyFatigue.activeCount, 0);
    assert.equal(emptyFatigue.outdoorCount, 0);
    assert.equal(emptyFatigue.fatigueHours, 0);
    assert.equal(emptyFatigue.hasRestBlock, false);
    assert.equal(emptyFatigue.needsRest, false);

    const lightDay = {
      day_id: 'd1',
      day_number: 1,
      date: null,
      title: 'Nhẹ nhàng',
      stops: [
        makeStop({ stop_id: 'l1', poi_id: 'dn-museum', title: 'Bảo tàng Chăm', category: 'di-tich', duration_minutes: 90 }),
        makeStop({ stop_id: 'l2', poi_id: 'dn-cafe', title: 'Cà phê Cộng', category: 'quan-an', duration_minutes: 60 }),
      ],
    };
    const lightFatigue = mod.computeDayFatigue(lightDay, poiById);
    assert.equal(lightFatigue.activeCount, 2);
    assert.equal(lightFatigue.outdoorCount, 0);
    assert.equal(lightFatigue.hasRestBlock, false);
    assert.equal(lightFatigue.needsRest, false);
    assert.ok(typeof lightFatigue.level === 'string' && lightFatigue.level.length > 0);

    const heavyDay = {
      day_id: 'd2',
      day_number: 2,
      date: null,
      title: 'Dày đặc',
      stops: [
        makeStop({ stop_id: 'h1', poi_id: 'dn-beach', title: 'Bãi biển Mỹ Khê', category: 'canh-quan', duration_minutes: 90 }),
        makeStop({ stop_id: 'h2', poi_id: 'dn-mountain', title: 'Ngũ Hành Sơn', category: 'canh-quan', duration_minutes: 120 }),
        makeStop({ stop_id: 'h3', poi_id: 'dn-museum', title: 'Bảo tàng Chăm', category: 'di-tich', duration_minutes: 90 }),
        makeStop({ stop_id: 'h4', poi_id: 'dn-market', title: 'Chợ Hàn', category: 'quan-an', duration_minutes: 90 }),
      ],
    };
    const heavyFatigue = mod.computeDayFatigue(heavyDay, poiById);
    assert.equal(heavyFatigue.activeCount, 4);
    assert.equal(heavyFatigue.outdoorCount, 2);
    assert.equal(heavyFatigue.hasRestBlock, false);
    assert.equal(heavyFatigue.needsRest, true);
    assert.ok(heavyFatigue.fatigueHours > 6);

    const restedDay = {
      ...heavyDay,
      stops: [
        ...heavyDay.stops.slice(0, 2),
        makeStop({ stop_id: 'r1', poi_id: null, title: 'Nghỉ trưa', stop_type: 'rest', duration_minutes: 90 }),
        ...heavyDay.stops.slice(2),
      ],
    };
    const restedFatigue = mod.computeDayFatigue(restedDay, poiById);
    assert.equal(restedFatigue.activeCount, 4);
    assert.equal(restedFatigue.hasRestBlock, true);
  } finally {
    await close();
  }
});

test('buildItineraryFromOutline pads HH:MM, deduplicates stop_ids across days, and clears invalid/overlapping times', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    const trip = {
      id: 'trip-outline-reg',
      title: 'Test Outline',
      destination: 'Đà Nẵng',
      daysCount: 2,
      peopleCount: 2,
      createdAt: '2026-11-16T00:00:00Z',
      itineraryOutline: [
        {
          day: 1,
          theme: 'Ngày 1',
          focus_city: 'Đà Nẵng',
          stops: [
            { id: 'dup-stop', name: 'Bảo tàng Điêu khắc Chăm', timeSlot: '9:00 - 10:30' },
            { id: 'overlap-stop', name: 'Cầu Rồng', timeSlot: '10:00 - 11:30' },
            { id: 'reversed-stop', name: 'Bãi biển Mỹ Khê', timeSlot: '15:00 - 14:00' },
          ],
        },
        {
          day: 2,
          theme: 'Ngày 2',
          focus_city: 'Đà Nẵng',
          stops: [
            { id: 'dup-stop', name: 'Danh thắng Ngũ Hành Sơn', timeSlot: '8:30 - 10:00' },
          ],
        },
      ],
    };

    const itinerary = mod.buildItineraryFromOutline(trip, SAMPLE_POIS);
    const allStops = itinerary.days.flatMap((d) => d.stops);
    const stopIds = allStops.map((s) => s.stop_id);

    // Zero-padded HH:MM
    assert.equal(itinerary.days[0].stops[0].start_time, '09:00');
    assert.equal(itinerary.days[0].stops[0].end_time, '10:30');
    assert.equal(itinerary.days[1].stops[0].start_time, '08:30');
    assert.equal(itinerary.days[1].stops[0].end_time, '10:00');

    // Deduplicated stop_id across days
    assert.equal(new Set(stopIds).size, stopIds.length);

    // Overlapping & reversed time windows cleared to null
    assert.equal(itinerary.days[0].stops[1].start_time, null);
    assert.equal(itinerary.days[0].stops[1].end_time, null);
    assert.equal(itinerary.days[0].stops[2].start_time, null);
    assert.equal(itinerary.days[0].stops[2].end_time, null);
  } finally {
    await close();
  }
});

test('insertRestInOrder keeps late-afternoon rest block after earlier timed stops', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    const stops = [
      makeStop({ stop_id: 's1', start_time: '09:00', end_time: '11:00' }),
      makeStop({ stop_id: 's2', start_time: '11:15', end_time: '12:15' }),
      makeStop({ stop_id: 's3', start_time: '12:30', end_time: '13:45' }),
      makeStop({ stop_id: 's4', start_time: '14:00', end_time: '15:30' }),
    ];
    const rest = makeStop({
      stop_id: 'r-late',
      poi_id: null,
      stop_type: 'rest',
      title: 'Nghỉ chiều & Cà phê thư giãn',
      start_time: '15:30',
      end_time: '17:00',
    });

    mod.insertRestInOrder(stops, rest);
    assert.deepEqual(
      stops.map((s) => s.stop_id),
      ['s1', 's2', 's3', 's4', 'r-late']
    );
  } finally {
    await close();
  }
});
