import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

async function withViteSsr(fn) {
  const server = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

test('Central Vietnam rainy season extends from September through January and updates packing list', async () => {
  await withViteSsr(async (server) => {
    const checklistMod = await server.ssrLoadModule('/src/utils/tripExportAndChecklist.ts');

    for (const rainyTrip of [
      { startDate: '2026-09-12' },
      { flexibleMonth: 'Tháng 10' },
      { startDate: '2026-11-15' },
      { startDate: '2026-12-01' },
      { startDate: '2027-01-10' },
      { flexibleMonth: 'Tháng 1' },
    ]) {
      assert.equal(
        checklistMod.inferWeatherSeasonFromTrip(rainyTrip),
        'rainy',
        `Expected rainy season for ${JSON.stringify(rainyTrip)}`
      );
    }

    for (const sunnyTrip of [
      { startDate: '2026-04-15' },
      { flexibleMonth: 'Tháng 5' },
      { startDate: '2026-06-20' },
    ]) {
      assert.equal(
        checklistMod.inferWeatherSeasonFromTrip(sunnyTrip),
        'sunny',
        `Expected sunny season for ${JSON.stringify(sunnyTrip)}`
      );
    }

    const rainyItems = checklistMod.getPackingItemsForSeason('rainy');
    const rainyIds = new Set(rainyItems.map((item) => item.id));
    assert.ok(rainyIds.has('rain-suit-2piece'), 'Rainy packing list must include 2-piece rain suit');
    assert.ok(rainyIds.has('waterproof-shoes'), 'Rainy packing list must include waterproof shoes');
    assert.ok(rainyIds.has('compact-umbrella'), 'Rainy packing list should retain compact umbrella');
  });
});

test('evaluateCentralVietnamAdvisories detects 1-day Hue pacing, rainy season gear, and beach rip currents', async () => {
  await withViteSsr(async (server) => {
    const advisoryMod = await server.ssrLoadModule('/src/utils/centralVietnamAdvisories.ts');

    // 1. Hue 1-day trip in November with Da Nang beach
    const novHueDayTripAdvisories = advisoryMod.evaluateCentralVietnamAdvisories(
      {
        destination: 'Đà Nẵng - Huế',
        startDate: '2026-11-15',
        daysCount: 1,
      },
      null,
      []
    );
    const novIds = new Set(novHueDayTripAdvisories.map((a) => a.id));
    assert.ok(novIds.has('hue-daytrip-pacing'), 'Should suggest staying 1-2 nights for 1-day Hue trip');
    assert.ok(novIds.has('rainy-season-central'), 'Should warn about Central Vietnam rainy season in Nov');
    const pacingAdv = novHueDayTripAdvisories.find((a) => a.id === 'hue-daytrip-pacing');
    assert.equal(pacingAdv?.actionType, 'add-hue-day');
    const rainyAdv = novHueDayTripAdvisories.find((a) => a.id === 'rainy-season-central');
    assert.equal(rainyAdv?.actionType, 'open-checklist');
    assert.match(rainyAdv?.message || '', /dòng chảy xa bờ|rip currents/i);

    // 2. Multi-day Hue trip in January should NOT warn on 1-day pacing, but SHOULD warn on rainy season
    const janHue2DayPlan = {
      destination: 'Huế',
      days_count: 2,
      days: [
        {
          id: 'd1',
          trip_id: 't1',
          day_number: 1,
          title: 'Ngày 1 - Huế',
          stops: [{ id: 's1', title: 'Đại Nội', city: 'Huế', sequence: 0 }],
        },
        {
          id: 'd2',
          trip_id: 't1',
          day_number: 2,
          title: 'Ngày 2 - Huế',
          stops: [{ id: 's2', title: 'Chùa Thiên Mụ', city: 'Huế', sequence: 0 }],
        },
      ],
    };
    const janAdvisories = advisoryMod.evaluateCentralVietnamAdvisories(
      { destination: 'Huế', startDate: '2027-01-10', daysCount: 2 },
      janHue2DayPlan,
      []
    );
    const janIds = new Set(janAdvisories.map((a) => a.id));
    assert.ok(!janIds.has('hue-daytrip-pacing'), '2 Hue days should not trigger 1-day Hue pacing alert');
    assert.ok(janIds.has('rainy-season-central'), 'January should still trigger rainy season checklist notice');

    // 3. Sunny June Da Nang itinerary with beach stop triggers beach-rip-current advisory
    const sunnyBeachPlan = {
      destination: 'Đà Nẵng',
      days_count: 3,
      days: [
        {
          id: 'd1',
          trip_id: 't2',
          day_number: 1,
          title: 'Biển Đà Nẵng',
          stops: [{ id: 's1', title: 'Bãi biển Mỹ Khê', city: 'Đà Nẵng', sequence: 0 }],
        },
      ],
    };
    const juneAdvisories = advisoryMod.evaluateCentralVietnamAdvisories(
      { destination: 'Đà Nẵng', startDate: '2026-06-10', daysCount: 3 },
      sunnyBeachPlan,
      []
    );
    const juneIds = new Set(juneAdvisories.map((a) => a.id));
    assert.ok(juneIds.has('beach-rip-current'), 'Beach stop outside rainy season should emit rip current note');
    assert.ok(!juneIds.has('rainy-season-central'), 'June should not trigger rainy season alert');
  });
});
