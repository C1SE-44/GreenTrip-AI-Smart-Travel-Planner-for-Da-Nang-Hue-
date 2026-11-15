import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

async function loadExportModule() {
  const server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { '@': path.join(root, 'src') } },
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
  });
  try {
    const mod = await server.ssrLoadModule('/src/utils/tripExportAndChecklist.ts');
    return { mod, close: () => server.close() };
  } catch (err) {
    await server.close();
    throw err;
  }
}

function unfoldIcs(ics) {
  return ics.replace(/\r\n /g, '');
}

test('buildTripIcs: đúng chuẩn RFC 5545, múi giờ Asia/Ho_Chi_Minh và escape ký tự đặc biệt', async () => {
  const { mod, close } = await loadExportModule();
  try {
    const sampleTrip = {
      id: 'trip-hue-dn-01',
      title: 'Khám phá Đà Nẵng, Huế; mùa thu\\đông',
      destination: 'Đà Nẵng & Huế',
      startDate: '2026-11-14',
      peopleCount: 2,
      createdAt: '2026-11-01T00:00:00Z',
    };

    const samplePlan = {
      trip_id: 'trip-hue-dn-01',
      title: sampleTrip.title,
      destination: sampleTrip.destination,
      start_date: '2026-11-14',
      days_count: 2,
      days: [
        {
          day_id: 'd1',
          day_number: 1,
          date: '2026-11-14',
          title: 'Sông Hương & Đại Nội',
          stops: [
            {
              stop_id: 's1',
              poi_id: 'hue-dai-noi',
              title: 'Đại Nội Huế, Cửa Ngọ Môn; Tham quan',
              city: 'Huế',
              address: 'Đường 23/8, Thuận Hòa, TP. Huế',
              category: 'Di tích',
              stop_type: 'poi',
              source: 'idea',
              sequence: 1,
              duration_minutes: 90,
              start_time: '08:30',
              end_time: '10:00',
              comment: 'Mặc đồ lịch sự\nMang bình nước cá nhân; tránh túi nilon',
              latitude: 16.4698,
              longitude: 107.5784,
            },
            {
              stop_id: 's2',
              poi_id: 'hue-thien-mu',
              title: 'Chùa Thiên Mụ',
              city: 'Huế',
              address: null,
              category: 'Chùa',
              stop_type: 'poi',
              source: 'manual',
              sequence: 2,
              duration_minutes: 60,
              start_time: null,
              end_time: null,
              comment: null,
              latitude: 16.4534,
              longitude: 107.5449,
            },
          ],
        },
        {
          day_id: 'd2',
          day_number: 2,
          date: null,
          title: 'Đà Nẵng',
          stops: [],
        },
      ],
    };

    const ics = mod.buildTripIcs(samplePlan, sampleTrip, new Date('2026-11-10T01:02:03Z'));

    // Kiểm tra chuẩn xuống dòng CRLF & giới hạn 75 octets mỗi dòng
    assert.ok(ics.endsWith('\r\n'));
    const rawLines = ics.split('\r\n').slice(0, -1);
    const encoder = new TextEncoder();
    for (const line of rawLines) {
      assert.ok(encoder.encode(line).length <= 75, `Line exceeded 75 bytes: ${line}`);
    }

    const unfolded = unfoldIcs(ics);
    assert.ok(unfolded.includes('BEGIN:VCALENDAR\r\n'));
    assert.ok(unfolded.includes('VERSION:2.0\r\n'));
    assert.ok(unfolded.includes('BEGIN:VTIMEZONE\r\n'));
    assert.ok(unfolded.includes('TZID:Asia/Ho_Chi_Minh\r\n'));
    assert.ok(unfolded.includes('TZOFFSETFROM:+0700\r\n'));
    assert.ok(unfolded.includes('TZOFFSETTO:+0700\r\n'));

    // Kiểm tra VEVENT đầu tiên đúng giờ & escape chuẩn
    assert.ok(unfolded.includes('DTSTART;TZID=Asia/Ho_Chi_Minh:20261114T083000\r\n'));
    assert.ok(unfolded.includes('DTEND;TZID=Asia/Ho_Chi_Minh:20261114T100000\r\n'));
    assert.ok(unfolded.includes('SUMMARY:Ngày 1: Đại Nội Huế\\, Cửa Ngọ Môn\\; Tham quan\r\n'));
    assert.ok(unfolded.includes('LOCATION:Đường 23/8\\, Thuận Hòa\\, TP. Huế\\, Huế\r\n'));
    assert.ok(unfolded.includes('Mặc đồ lịch sự\\nMang bình nước cá nhân\\; tránh túi nilon'));

    // Kiểm tra VEVENT thứ 2 tự fallback slot giờ + duration 60p (11:30 -> 12:30)
    assert.ok(unfolded.includes('DTSTART;TZID=Asia/Ho_Chi_Minh:20261114T113000\r\n'));
    assert.ok(unfolded.includes('DTEND;TZID=Asia/Ho_Chi_Minh:20261114T123000\r\n'));

    // Tổng đúng 2 sự kiện (ngày 2 trống không sinh VEVENT rác)
    assert.equal((unfolded.match(/BEGIN:VEVENT/g) || []).length, 2);
  } finally {
    await close();
  }
});

test('EcoPackingChecklist: nhận diện thời tiết theo tháng & lưu localStorage an toàn', async () => {
  const { mod, close } = await loadExportModule();
  try {
    assert.equal(mod.inferWeatherSeasonFromTrip({ startDate: '2026-11-14' }), 'rainy');
    assert.equal(mod.inferWeatherSeasonFromTrip({ flexibleMonth: 'Tháng 10' }), 'rainy');
    assert.equal(mod.inferWeatherSeasonFromTrip({ startDate: '2026-05-20' }), 'sunny');
    assert.equal(mod.inferWeatherSeasonFromTrip({ flexibleMonth: 'Tháng 6' }), 'sunny');

    const rainyItems = mod.getPackingItemsForSeason('rainy');
    const sunnyItems = mod.getPackingItemsForSeason('sunny');
    assert.ok(rainyItems.some((i) => i.id === 'compact-umbrella'));
    assert.ok(!rainyItems.some((i) => i.id === 'swimwear-microfiber'));
    assert.ok(sunnyItems.some((i) => i.id === 'swimwear-microfiber'));
    assert.ok(!sunnyItems.some((i) => i.id === 'compact-umbrella'));

    // Mock localStorage
    const store = new Map();
    const mockStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        store.set(k, v);
      },
    };

    assert.deepEqual(mod.loadPackingState('t1', 'sunny', mockStorage), {
      checkedIds: [],
      season: 'sunny',
    });

    mod.savePackingState('t1', { checkedIds: ['refill-bottle', 'tote-bag'], season: 'rainy' }, mockStorage);
    assert.deepEqual(mod.loadPackingState('t1', 'sunny', mockStorage), {
      checkedIds: ['refill-bottle', 'tote-bag'],
      season: 'rainy',
    });

    // Chống vỡ khi dữ liệu JSON trong localStorage bị hỏng
    store.set('greentrip_packing_broken', '{not-json');
    assert.deepEqual(mod.loadPackingState('broken', 'rainy', mockStorage), {
      checkedIds: [],
      season: 'rainy',
    });
  } finally {
    await close();
  }
});
