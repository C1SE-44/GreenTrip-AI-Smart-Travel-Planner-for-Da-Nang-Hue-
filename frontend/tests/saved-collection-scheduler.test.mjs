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

test('buildItineraryFromSavedCollection strictly schedules saved stops by city clusters without inventing sights', async () => {
  await withViteSsr(async (server) => {
    const schedulerMod = await server.ssrLoadModule('/src/utils/savedCollectionScheduler.ts');

    const savedPois = [
      {
        id: 'saved-dn-son-tra',
        name: 'Chùa Linh Ứng Sơn Trà',
        category: 'chua',
        city: 'Đà Nẵng',
        lat: 16.1058,
        lng: 108.2933,
        rating: 4.7,
        ecoScore: 88,
        visitDuration: '1–2 giờ',
        image: '',
        description: '',
        isGreen: true,
      },
      {
        id: 'saved-dn-ba-na-museum',
        name: 'Bảo tàng Chăm',
        category: 'bao-tang',
        city: 'Đà Nẵng',
        lat: 16.0605,
        lng: 108.2236,
        rating: 4.5,
        ecoScore: 84,
        visitDuration: '1 giờ',
        image: '',
        description: '',
        isGreen: true,
      },
      {
        id: 'saved-hue-dai-noi',
        name: 'Đại Nội (Hoàng Thành)',
        category: 'di-tich',
        city: 'Huế',
        lat: 16.4637,
        lng: 107.5809,
        rating: 4.8,
        ecoScore: 80,
        visitDuration: '2 giờ',
        image: '',
        description: '',
        isGreen: true,
      },
      {
        id: 'saved-hue-thien-mu',
        name: 'Chùa Thiên Mụ',
        category: 'chua',
        city: 'Huế',
        lat: 16.4533,
        lng: 107.545,
        rating: 4.7,
        ecoScore: 85,
        visitDuration: '1 giờ',
        image: '',
        description: '',
        isGreen: true,
      },
      {
        id: 'saved-stay-hue',
        name: 'Huế Garden Eco Homestay',
        category: 'luu-tru',
        city: 'Huế',
        lat: 16.46,
        lng: 107.59,
        rating: 4.8,
        ecoScore: 92,
        visitDuration: 'Qua đêm',
        image: '',
        description: '',
        isGreen: true,
      },
    ];

    const unsavedSight = {
      id: 'unsaved-ba-na',
      name: 'Bà Nà Hills',
      category: 'canh-quan',
      city: 'Đà Nẵng',
      lat: 15.9989,
      lng: 107.9889,
      rating: 4.6,
      ecoScore: 60,
      visitDuration: 'Cả ngày',
      image: '',
      description: '',
      isGreen: false,
    };

    const nearbyDnWestMeal = {
      id: 'unsaved-dn-west-meal',
      name: 'Bún Chả Cá Tây Sông Hàn',
      category: 'quan-an',
      city: 'Đà Nẵng',
      lat: 16.064,
      lng: 108.214,
      rating: 4.6,
      ecoScore: 82,
      popularityScore: 3.2,
      localBusinessType: 'local_food',
      visitDuration: '45 phút',
      image: '',
      description: '',
      isGreen: true,
    };

    const nearbyHueMeal = {
      id: 'unsaved-hue-meal',
      name: 'Cơm Hến Cồn Hến',
      category: 'quan-an',
      city: 'Huế',
      lat: 16.471,
      lng: 107.601,
      rating: 4.7,
      ecoScore: 80,
      popularityScore: 3.3,
      localBusinessType: 'local_food',
      visitDuration: '45 phút',
      image: '',
      description: '',
      isGreen: true,
    };

    const allPois = [...savedPois, unsavedSight, nearbyDnWestMeal, nearbyHueMeal];
    const recDays = schedulerMod.recommendDaysForSavedPois(savedPois);
    assert.ok(recDays >= 2, 'Cross-city saved collection should recommend at least 2 days');

    const result = schedulerMod.buildItineraryFromSavedCollection({
      collectionName: 'Mùa thu Cố đô',
      savedPois,
      allPois,
      daysCount: 2,
      startDate: '2026-10-10',
      pacing: 'Balanced',
      includeRestBreaks: true,
      preferLocalAuthentic: true,
    });

    assert.equal(result.recommendedStays.length, 1);
    assert.equal(result.recommendedStays[0].id, 'saved-stay-hue');

    const savedDaytimeIds = new Set(
      savedPois.filter((p) => p.category !== 'luu-tru').map((p) => p.id)
    );
    const scheduledPoiIds = [];
    for (const day of result.itinerary.days) {
      for (const stop of day.stops) {
        if (stop.stop_type === 'rest') continue;
        assert.ok(
          savedDaytimeIds.has(stop.poi_id),
          `Unexpected invented stop ${stop.poi_id} before meal opt-in`
        );
        scheduledPoiIds.push(stop.poi_id);
      }
    }
    assert.equal(scheduledPoiIds.length, 4, 'All 4 daytime saved POIs must be scheduled');
    assert.ok(!scheduledPoiIds.includes('unsaved-ba-na'), 'Unsaved sight must never be invented');

    // Cities should be grouped separately across Day 1 and Day 2
    const day1Cities = new Set(
      result.itinerary.days[0].stops
        .filter((s) => s.stop_type !== 'rest')
        .map((s) => s.city)
    );
    const day2Cities = new Set(
      result.itinerary.days[1].stops
        .filter((s) => s.stop_type !== 'rest')
        .map((s) => s.city)
    );
    assert.equal(day1Cities.size, 1);
    assert.equal(day2Cities.size, 1);
    assert.notDeepEqual([...day1Cities], [...day2Cities]);

    // Optional meal gap suggestions are surfaced separately and applied strictly on opt-in
    assert.ok(result.optionalMealGapSuggestions.length >= 1, 'Expected optional meal suggestions');
    const chosenSuggestion = result.optionalMealGapSuggestions[0];
    const updatedPlan = schedulerMod.applyOptionalMealGapsToPlan(result.itinerary, [
      chosenSuggestion,
    ]);
    const targetDay = updatedPlan.days.find((d) => d.day_number === chosenSuggestion.dayNumber);
    assert.ok(targetDay, 'Target day must exist after applying opt-in meal');
    assert.ok(
      targetDay.stops.some((s) => s.poi_id === chosenSuggestion.poi.id),
      'Opt-in meal POI should be inserted into target day'
    );
    targetDay.stops.forEach((s, idx) => {
      assert.equal(s.sequence, idx, 'Stop sequences must remain normalized');
    });
  });
});
