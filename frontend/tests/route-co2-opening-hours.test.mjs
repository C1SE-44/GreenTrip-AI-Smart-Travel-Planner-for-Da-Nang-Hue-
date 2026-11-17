import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

function makeStop(id, title, lat, lng, start = null, end = null, stopType = 'poi') {
  return {
    stop_id: id,
    poi_id: id,
    title,
    city: 'Đà Nẵng',
    address: null,
    category: 'di-tich',
    stop_type: stopType,
    source: 'manual',
    sequence: 0,
    duration_minutes: 90,
    start_time: start,
    end_time: end,
    comment: null,
    latitude: lat,
    longitude: lng,
  };
}

test('Anti-zig-zag optimization reduces Da Nang backtracking distance and preserves rest breaks', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    // Zig-zag order: Cầu Rồng -> Ngũ Hành Sơn (xa phía nam) -> Chợ Hàn (quay ngược bắc) -> Mỹ Khê (đông)
    const zigZagDay = {
      day_id: 'd1',
      day_number: 1,
      date: '2026-11-16',
      title: 'Ngày 1',
      stops: [
        makeStop('cau-rong', 'Cầu Rồng', 16.0611, 108.227, '08:00', '09:30'),
        makeStop('ngu-hanh-son', 'Ngũ Hành Sơn', 16.0044, 108.2635, '09:45', '11:15'),
        {
          ...makeStop('rest-1', 'Nghỉ trưa', null, null, '12:00', '13:30', 'rest'),
          poi_id: null,
        },
        makeStop('cho-han', 'Chợ Hàn', 16.0678, 108.2208, '13:45', '15:15'),
        makeStop('my-khe', 'Biển Mỹ Khê', 16.0592, 108.2435, '15:30', '17:00'),
      ],
    };

    const result = mod.optimizeDayRouteOrder(zigZagDay);
    assert.equal(result.reordered, true, 'Zig-zag route must be reordered');
    assert.ok(result.afterKm < result.beforeKm, `Expected ${result.afterKm} < ${result.beforeKm}`);
    assert.ok(result.savedKm > 3, `Expected meaningful savings (>3 km), got ${result.savedKm} km`);

    const orderedPlaceIds = result.day.stops
      .filter((s) => s.stop_type !== 'rest')
      .map((s) => s.stop_id);
    assert.equal(orderedPlaceIds[0], 'cau-rong', 'Anchor first stop must remain first');
    assert.equal(orderedPlaceIds[orderedPlaceIds.length - 1], 'ngu-hanh-son', 'Southernmost NHS should move to the end of northern cluster');
    assert.ok(result.day.stops.some((s) => s.stop_type === 'rest'), 'Lunch break must be preserved');

    // Re-running on already optimized day should detect minimal/no zig-zag
    const secondRun = mod.optimizeDayRouteOrder(result.day);
    assert.equal(secondRun.reordered, false);
    assert.equal(secondRun.savedKm, 0);
  } finally {
    await close();
  }
});

test('Carbon footprint estimation calculates exact grams and car-baseline savings across transport modes', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    const car = mod.estimateCarbonFootprint(10_000, 'driving');
    assert.equal(car.distanceKm, 10);
    assert.equal(car.co2Grams, 1710);
    assert.equal(car.savedPercent, 0);
    assert.equal(mod.formatCarbonAmount(car.co2Grams), '1.71 kg CO₂');

    const moto = mod.estimateCarbonFootprint(10_000, 'motorcycle');
    assert.equal(moto.co2Grams, 720);
    assert.equal(moto.savedGrams, 990);
    assert.equal(moto.savedPercent, 58);
    assert.equal(mod.formatCarbonAmount(moto.co2Grams), '720 g CO₂');

    const bus = mod.estimateCarbonFootprint(10_000, 'transit');
    assert.equal(bus.co2Grams, 400);
    assert.equal(bus.savedPercent, 77);

    const walk = mod.estimateCarbonFootprint(10_000, 'walking');
    assert.equal(walk.co2Grams, 0);
    assert.equal(walk.savedPercent, 100);
    assert.equal(mod.formatCarbonAmount(walk.co2Grams), '0 g CO₂');
  } finally {
    await close();
  }
});

test('Opening hours checker validates weekday_text closures, split hours, overnight schedules, and status_text', async () => {
  const { mod, close } = await loadItineraryModule();
  try {
    const museumPoi = {
      id: 'museum-1',
      name: 'Bảo tàng Mẫu',
      opening_hours: {
        status_text: 'Đang mở cửa',
        weekday_text: [
          'Thứ Hai: Đóng cửa',
          'Thứ Tư: 08:00–11:30, 13:30–17:00',
        ],
      },
    };

    // Monday 2026-11-16 -> Closed
    const monCheck = mod.checkStopOpeningHours(
      makeStop('s1', 'Bảo tàng Mẫu', 16, 108, '09:00', '10:30'),
      museumPoi,
      '2026-11-16'
    );
    assert.equal(monCheck.status, 'closed');

    // Wednesday 2026-11-18 lunch closure 12:00-13:00 -> Outside hours
    const wedLunchCheck = mod.checkStopOpeningHours(
      makeStop('s2', 'Bảo tàng Mẫu', 16, 108, '12:00', '13:00'),
      museumPoi,
      '2026-11-18'
    );
    assert.equal(wedLunchCheck.status, 'outside_hours');

    // Wednesday 2026-11-18 morning 09:00-11:00 -> OK
    const wedOkCheck = mod.checkStopOpeningHours(
      makeStop('s3', 'Bảo tàng Mẫu', 16, 108, '09:00', '11:00'),
      museumPoi,
      '2026-11-18'
    );
    assert.equal(wedOkCheck.status, 'ok');

    // Overnight venue 17:00 - 02:00
    const nightPoi = {
      id: 'night-1',
      name: 'Chợ đêm & Phố ẩm thực',
      opening_hours: { status_text: '17:00 - 02:00 sáng' },
    };
    const nightOk = mod.checkStopOpeningHours(
      makeStop('s4', 'Chợ đêm', 16, 108, '21:00', '22:30'),
      nightPoi,
      '2026-11-18'
    );
    assert.equal(nightOk.status, 'ok');

    // Weekend-only attraction checked on Monday
    const weekendShowPoi = {
      id: 'dragon-fire',
      name: 'Cầu Rồng phun lửa',
      opening_hours: { status_text: 'Trình diễn phun lửa & nước 21:00 Thứ 7 và Chủ Nhật' },
    };
    const mondayShow = mod.checkStopOpeningHours(
      makeStop('s5', 'Cầu Rồng', 16, 108, '20:30', '21:30'),
      weekendShowPoi,
      '2026-11-16'
    );
    assert.equal(mondayShow.status, 'closed');

    // Always open
    const openAllDayPoi = {
      id: 'beach',
      name: 'Bãi biển Mỹ Khê',
      opening_hours: { status_text: 'Mở cửa cả ngày' },
    };
    assert.equal(
      mod.checkStopOpeningHours(makeStop('s6', 'Biển Mỹ Khê', 16, 108, '05:30', '07:00'), openAllDayPoi, '2026-11-16').status,
      'ok'
    );
  } finally {
    await close();
  }
});

test('UI components integrate dynamic CO2 calculation and drop hardcoded 8% badge', () => {
  const mapSource = fs.readFileSync(path.join(root, 'src/components/planner/ItineraryRouteMap.tsx'), 'utf8');
  const viewSource = fs.readFileSync(path.join(root, 'src/components/planner/TripItineraryView.tsx'), 'utf8');

  assert.ok(!mapSource.includes('Tiết kiệm 8% xăng'), 'Hardcoded 8% fuel savings badge must be removed');
  assert.ok(mapSource.includes('estimateCarbonFootprint'), 'ItineraryRouteMap must compute real CO2');
  assert.ok(viewSource.includes('optimizeItineraryRouteOrder'), 'TripItineraryView must wire full-trip anti-zigzag optimizer');
  assert.ok(viewSource.includes('optimizeDayRouteOrder'), 'TripItineraryView must wire per-day optimizer');
  assert.ok(viewSource.includes('checkStopOpeningHours'), 'TripItineraryView must verify POI opening hours');
});
